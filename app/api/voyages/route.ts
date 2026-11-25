import {
  getVoyagePlan,
  MAX_DISTANCE_LY,
  type VoyageFeed,
  type VoyageRecord,
  type VoyageRequest,
} from "../../../lib/voyage";
import { ACTIVE_TIMEOUT_MS, listVoyages, saveVoyage, type StoredVoyage } from "../../../lib/voyage-store";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 2_048;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function publicRecord({ pilotId: _pilotId, startedAt: _startedAt, rankable: _rankable, ...record }: StoredVoyage): VoyageRecord {
  return record;
}

async function readVoyageBody(request: Request): Promise<{ body: unknown } | { tooLarge: true }> {
  if (Number(request.headers.get("Content-Length")) > MAX_BODY_BYTES) return { tooLarge: true };
  if (!request.body) return { body: null };

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    for (let next = await reader.read(); !next.done; next = await reader.read()) {
      bytes += next.value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => undefined);
        return { tooLarge: true };
      }
      text += decoder.decode(next.value, { stream: true });
    }
    return { body: JSON.parse(text + decoder.decode()) as unknown };
  } catch {
    return { body: null };
  } finally {
    reader.releaseLock();
  }
}

function isVoyageRequest(value: unknown): value is VoyageRequest {
  if (!value || typeof value !== "object") return false;
  const { id, pilotId, fromId, toId, elapsedMs, status } = value as Partial<VoyageRequest>;
  return typeof id === "string" && UUID.test(id) &&
    typeof pilotId === "string" && UUID.test(pilotId) &&
    typeof fromId === "string" && typeof toId === "string" &&
    typeof elapsedMs === "number" && Number.isSafeInteger(elapsedMs) && elapsedMs >= 0 &&
    (status === "active" || status === "arrived" || status === "failed");
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const pilotId = params.get("pilotId")?.toLowerCase();
  const rawDistance = params.get("distanceLy");
  const distance = rawDistance === null ? 0 : Number(rawDistance);
  if (!pilotId || !UUID.test(pilotId) || !Number.isFinite(distance) || distance < 0 || distance > MAX_DISTANCE_LY) {
    return json({ error: "조종사 식별자 또는 거리를 확인해 주세요." }, 400);
  }

  try {
    const records = await listVoyages();
    const now = Date.now();
    const pilotPositions = new Map<string, number>();
    const ownRecords: StoredVoyage[] = [];
    for (const record of records) {
      if (record.pilotId === pilotId) {
        ownRecords.push(record);
      } else if (
        record.rankable !== false &&
        record.distanceLy > distance &&
        (record.status === "arrived" || (record.status === "active" && now - record.updatedAt <= ACTIVE_TIMEOUT_MS))
      ) {
        pilotPositions.set(record.pilotId, Math.max(pilotPositions.get(record.pilotId) ?? 0, record.distanceLy));
      }
    }

    const counts = new Map<number, number>();
    for (const position of pilotPositions.values()) {
      counts.set(position, (counts.get(position) ?? 0) + 1);
    }

    const feed: VoyageFeed = {
      aheadCount: pilotPositions.size,
      checkpoints: [...counts].sort(([a], [b]) => a - b).map(([distanceLy, count]) => ({ distanceLy, count })),
      records: ownRecords.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 50).map(publicRecord),
    };
    return json(feed);
  } catch {
    return json({ error: "항해 기록을 불러올 수 없습니다." }, 503);
  }
}

export async function POST(request: Request) {
  const payload = await readVoyageBody(request);
  if ("tooLarge" in payload) return json({ error: "항해 기록이 너무 큽니다." }, 413);
  const { body } = payload;
  if (!isVoyageRequest(body)) return json({ error: "항해 기록의 형식을 확인해 주세요." }, 400);

  const { pilotId, id, fromId, toId, status } = body;
  const plan = getVoyagePlan(fromId, toId);
  if (!plan || (status === "arrived" && body.elapsedMs < plan.durationMs)) {
    return json({ error: "항로 또는 도착 시간을 확인해 주세요." }, 400);
  }

  try {
    const result = await saveVoyage({
      ...body,
      pilotId: pilotId.toLowerCase(),
      id: id.toLowerCase(),
    }, plan);
    if ("record" in result) return json({ record: publicRecord(result.record) });
    if (result.error === "conflict") return json({ error: "이미 다른 항해에 사용한 식별자입니다." }, 409);
    if (result.error === "clock") return json({ error: "항해의 도착 시간이 아직 지나지 않았습니다." }, 409);
    return json({ error: "항해 기록 저장 한도에 도달했습니다." }, 429);
  } catch {
    return json({ error: "항해 기록을 저장할 수 없습니다." }, 503);
  }
}
