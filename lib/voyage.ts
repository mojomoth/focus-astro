import balance from "../docs/design/freeze/balance/v2/balance.json";
import { BODIES } from "../pocs/voyage-time/planets.js";

const MINUTE_MS = 60_000;
const AU_PER_LIGHT_YEAR = 63_241;

export const FOCUS_MS = balance.params.focusMin * MINUTE_MS;
export const REST_MS = balance.params.restMin * MINUTE_MS;
const CYCLE_MS = FOCUS_MS + REST_MS;

export type Destination = {
  id: string;
  name: string;
  englishName: string;
  distanceLy: number;
  image: string | null;
  kind: "origin" | "planet" | "waypoint";
  focusMs: number;
};

const destinations: Destination[] = [{
  id: "earth",
  name: "지구",
  englishName: "Earth",
  distanceLy: 0,
  image: "/assets/planets/earth.jpg",
  kind: "origin",
  focusMs: 0,
}];

const bodiesByNumber = new Map(BODIES.map((body) => [body.no, body]));
for (const leg of balance.legs) {
  const body = bodiesByNumber.get(leg.no);
  const previous = destinations[destinations.length - 1];
  destinations.push({
    id: body?.img ?? leg.to.toLowerCase().replaceAll(" ", "-"),
    name: leg.ko,
    englishName: leg.to,
    distanceLy: leg.distanceLy,
    image: body?.img ? `/assets/planets/${body.img}.jpg` : null,
    kind: leg.kind === "waypoint" ? "waypoint" : "planet",
    focusMs: previous.focusMs + Math.round(leg.voyageMin * MINUTE_MS),
  });
}

export const DESTINATIONS: readonly Destination[] = destinations;
export const EARTH = DESTINATIONS[0];
export const MAX_DISTANCE_LY = DESTINATIONS[DESTINATIONS.length - 1].distanceLy;

type VoyageLeg = {
  from: Destination;
  to: Destination;
  focusMs: number;
  endFocusMs: number;
};

export type VoyagePlan = {
  from: Destination;
  to: Destination;
  focusMs: number;
  durationMs: number;
  legs: VoyageLeg[];
};

export type VoyageSnapshot = {
  phase: "focus" | "rest" | "arrived";
  focusMs: number;
  remainingMs: number;
  distanceLy: number;
  progress: number;
  cycle: number;
};

export type VoyageRequest = {
  pilotId: string;
  id: string;
  fromId: string;
  toId: string;
  elapsedMs: number;
  status: "active" | "arrived" | "failed";
};

export type VoyageRecord = Omit<VoyageRequest, "pilotId"> & {
  focusMs: number;
  distanceLy: number;
  updatedAt: number;
};

export type VoyageCheckpoint = {
  distanceLy: number;
  count: number;
};

export type VoyageFeed = {
  aheadCount: number;
  checkpoints: VoyageCheckpoint[];
  records: VoyageRecord[];
};

export function getVoyagePlan(fromId: string, toId: string): VoyagePlan | null {
  const fromIndex = DESTINATIONS.findIndex((destination) => destination.id === fromId);
  const toIndex = DESTINATIONS.findIndex((destination) => destination.id === toId);
  if (fromIndex < 0 || toIndex <= fromIndex) return null;

  const from = DESTINATIONS[fromIndex];
  const to = DESTINATIONS[toIndex];
  const focusMs = to.focusMs - from.focusMs;
  const legs = DESTINATIONS.slice(fromIndex + 1, toIndex + 1).map((stop, index) => {
    const previous = DESTINATIONS[fromIndex + index];
    return {
      from: previous,
      to: stop,
      focusMs: stop.focusMs - previous.focusMs,
      endFocusMs: stop.focusMs - from.focusMs,
    };
  });

  return {
    from,
    to,
    focusMs,
    // 집중 구간이 끝나는 순간 목적지에 닿으면 마지막 휴식은 없다.
    durationMs: focusMs + Math.floor((focusMs - 1) / FOCUS_MS) * REST_MS,
    legs,
  };
}

export function getVoyageSnapshot(plan: VoyagePlan, elapsedMs: number): VoyageSnapshot {
  const elapsed = Math.max(0, Math.min(elapsedMs, plan.durationMs));
  const fullCycles = Math.floor(elapsed / CYCLE_MS);
  const cycleElapsed = elapsed % CYCLE_MS;
  const focusMs = Math.min(fullCycles * FOCUS_MS + Math.min(cycleElapsed, FOCUS_MS), plan.focusMs);

  if (elapsed === plan.durationMs) {
    return {
      phase: "arrived",
      focusMs,
      remainingMs: 0,
      distanceLy: plan.to.distanceLy,
      progress: 1,
      cycle: fullCycles + 1,
    };
  }

  const inRest = cycleElapsed >= FOCUS_MS;
  const currentLeg = plan.legs.find((leg) => leg.endFocusMs > focusMs)!;
  const legProgress = (focusMs - (currentLeg.endFocusMs - currentLeg.focusMs)) / currentLeg.focusMs;
  return {
    phase: inRest ? "rest" : "focus",
    focusMs,
    remainingMs: Math.min((inRest ? CYCLE_MS : FOCUS_MS) - cycleElapsed, plan.durationMs - elapsed),
    distanceLy: currentLeg.from.distanceLy + (currentLeg.to.distanceLy - currentLeg.from.distanceLy) * legProgress,
    progress: focusMs / plan.focusMs,
    cycle: fullCycles + 1,
  };
}

export function formatDistance(distanceLy: number): string {
  const au = distanceLy * AU_PER_LIGHT_YEAR;
  if (au < 1_000) {
    return `${au.toLocaleString("ko-KR", { maximumFractionDigits: au < 10 ? 3 : 1 })} AU`;
  }
  return `${distanceLy.toLocaleString("ko-KR", { maximumFractionDigits: distanceLy < 10 ? 2 : 1 })} 광년`;
}

export function formatDuration(durationMs: number): string {
  const minutes = Math.round(durationMs / MINUTE_MS);
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours === 0) return `${remaining}분`;
  return remaining === 0 ? `${hours}시간` : `${hours}시간 ${remaining}분`;
}

export function formatClock(durationMs: number): string {
  const seconds = Math.max(0, Math.ceil(durationMs / 1_000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
