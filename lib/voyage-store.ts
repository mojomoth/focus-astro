import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { EARTH, getVoyageSnapshot, type VoyagePlan, type VoyageRecord, type VoyageRequest } from "./voyage";

export type StoredVoyage = VoyageRecord & { pilotId: string; startedAt?: number; rankable?: boolean };

const BLOB_PATH = "focus-astro/v1/voyages.json";
const MAX_RECORDS = 2_000;
const CLOCK_GRACE_MS = 5_000;
export const ACTIVE_TIMEOUT_MS = 90_000;

const useBlob = !process.env.VOYAGE_STORE && Boolean(
  process.env.VERCEL || process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID,
);
const filePath = process.env.VOYAGE_STORE ?? join(process.cwd(), ".focus-astro", "voyages.json");

async function readBlobRecords(): Promise<{ records: StoredVoyage[]; etag?: string }> {
  const blob = await get(BLOB_PATH, { access: "private", useCache: false, abortSignal: AbortSignal.timeout(5_000) });
  if (!blob) return { records: [] };
  if (blob.statusCode !== 200) throw new Error("Unexpected voyage storage response");
  const records = await new Response(blob.stream).json() as StoredVoyage[];
  return { records, etag: blob.blob.etag };
}

async function readFileRecords(): Promise<StoredVoyage[]> {
  try {
    return JSON.parse(await readFile(/*turbopackIgnore: true*/ filePath, "utf8")) as StoredVoyage[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeFileRecords(records: StoredVoyage[]) {
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  const pendingPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(pendingPath, JSON.stringify(records), { mode: 0o600 });
    await rename(pendingPath, filePath);
  } finally {
    await rm(pendingPath, { force: true });
  }
}

export async function listVoyages(): Promise<StoredVoyage[]> {
  return useBlob ? (await readBlobRecords()).records : readFileRecords();
}

type SaveResult = { record: StoredVoyage; changed: boolean } | { error: "conflict" | "clock" | "capacity" };

function applyVoyage(records: StoredVoyage[], request: VoyageRequest, plan: VoyagePlan, receivedAt: number): SaveResult {
  const { pilotId, id, fromId, toId, status } = request;
  const currentIndex = records.findIndex((record) => record.id === id);
  const current = records[currentIndex];
  if (current && (current.pilotId !== pilotId || current.fromId !== fromId || current.toId !== toId)) {
    return { error: "conflict" };
  }
  if (current && current.status !== "active") return { record: current, changed: false };

  const enforceClock = process.env.NODE_ENV === "production";
  const startedAt = current?.startedAt ?? receivedAt;
  const wallLimit = current ? Math.max(0, receivedAt - startedAt + CLOCK_GRACE_MS) : 0;
  const elapsedMs = Math.min(request.elapsedMs, plan.durationMs, enforceClock ? wallLimit : Infinity);
  if (status === "arrived" && elapsedMs < plan.durationMs) return { error: "clock" };
  if (current && status === "active" && elapsedMs < current.elapsedMs) return { record: current, changed: false };

  const effectiveElapsed = Math.max(current?.elapsedMs ?? 0, elapsedMs);
  const snapshot = getVoyageSnapshot(plan, effectiveElapsed);
  // 오프라인에서 도착한 사용자도 계속 출항할 수 있다. 순위는 서버가 확인한 경로에만 반영한다.
  const rankable = current?.rankable ?? (!enforceClock || fromId === EARTH.id || records.some((record) =>
    record.pilotId === pilotId && record.toId === fromId && record.status === "arrived" && record.rankable === true,
  ));
  const record: StoredVoyage = {
    pilotId, id, fromId, toId, status, startedAt, rankable,
    elapsedMs: effectiveElapsed,
    focusMs: snapshot.focusMs,
    distanceLy: snapshot.distanceLy,
    updatedAt: Math.max(current?.updatedAt ?? 0, receivedAt),
  };

  if (currentIndex >= 0) {
    records[currentIndex] = record;
  } else {
    if (records.length >= MAX_RECORDS) {
      const outdated = records.findIndex((old) =>
        old.status === "failed" || (old.status === "active" && receivedAt - old.updatedAt > ACTIVE_TIMEOUT_MS),
      );
      if (outdated < 0) return { error: "capacity" };
      records.splice(outdated, 1);
    }
    records.push(record);
  }
  return { record, changed: true };
}

let localWrites: Promise<unknown> = Promise.resolve();

export async function saveVoyage(request: VoyageRequest, plan: VoyagePlan): Promise<SaveResult> {
  const receivedAt = Date.now();
  if (useBlob) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { records, etag } = await readBlobRecords();
      const result = applyVoyage(records, request, plan, receivedAt);
      if (!("record" in result) || !result.changed) return result;

      try {
        // 첫 쓰기는 같은 이름을 덮어쓸 수 없고 이후에는 읽은 ETag와 같을 때만 갱신한다.
        await put(BLOB_PATH, JSON.stringify(records), {
          access: "private",
          contentType: "application/json",
          allowOverwrite: Boolean(etag),
          ifMatch: etag,
          abortSignal: AbortSignal.timeout(5_000),
        });
        return result;
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError) continue;
        // SDK의 최초 생성 충돌에는 전용 오류 클래스가 없으므로 실제로 생성됐는지 확인한다.
        if (etag || !(await readBlobRecords()).etag) throw error;
      }
    }
    throw new Error("Concurrent voyage updates");
  }

  const write = localWrites.then(async () => {
    const records = await readFileRecords();
    const result = applyVoyage(records, request, plan, receivedAt);
    if ("record" in result && result.changed) await writeFileRecords(records);
    return result;
  });
  localWrites = write.catch(() => undefined);
  return write;
}
