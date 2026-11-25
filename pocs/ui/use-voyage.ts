"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EARTH, getVoyagePlan, getVoyageSnapshot,
  type VoyageCheckpoint, type VoyageFeed, type VoyagePlan, type VoyageRecord, type VoyageRequest,
} from "../../lib/voyage";

const PROFILE_KEY = "focus-astro.profile.v1";
const ACTIVE_KEY = "focus-astro.active.v1";

type Profile = { pilotId: string; position: string; records: VoyageRecord[] };
type Active = { id: string; startedAt: number; plan: VoyagePlan; pilotId: string };
type StoredActive = { id: string; startedAt: number; fromId: string; toId: string; pilotId: string };

function load<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}

function store(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장소가 막힌 브라우저에서도 열린 동안 타이머는 동작한다.
  }
}

function isActive(value: StoredActive | null): value is StoredActive {
  return !!value && typeof value.id === "string" && typeof value.pilotId === "string" && Number.isFinite(value.startedAt);
}

function report(active: Active, elapsedMs: number, status: VoyageRequest["status"]) {
  const payload: VoyageRequest = {
    pilotId: active.pilotId,
    id: active.id,
    fromId: active.plan.from.id,
    toId: active.plan.to.id,
    elapsedMs: Math.round(elapsedMs),
    status,
  };
  return fetch("/api/voyages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: status !== "active",
  });
}

export function useVoyage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [notice, setNotice] = useState("");
  const [arrival, setArrival] = useState<VoyagePlan | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [ahead, setAhead] = useState<number | "unavailable" | null>(null);
  const [overtakes, setOvertakes] = useState(0);
  const current = useRef<Active | null>(null);
  const profileRef = useRef<Profile | null>(null);
  const checkpointRef = useRef<VoyageCheckpoint[]>([]);
  const lastDistance = useRef(0);
  const inactiveAt = useRef<number | null>(null);

  const saveProfile = useCallback((nextProfile: Profile) => {
    profileRef.current = nextProfile;
    store(PROFILE_KEY, nextProfile);
    setProfile(nextProfile);
  }, []);

  const finish = useCallback((result: "arrived" | "failed", reason = "", timestamp = Date.now()) => {
    const flight = current.current;
    const pilot = profileRef.current;
    if (!flight || !pilot) return;
    current.current = null;
    store(ACTIVE_KEY, null);
    const elapsedMs = Math.min(Math.max(0, timestamp - flight.startedAt), flight.plan.durationMs);
    const snapshot = getVoyageSnapshot(flight.plan, elapsedMs);
    const record: VoyageRecord = {
      id: flight.id,
      fromId: flight.plan.from.id,
      toId: flight.plan.to.id,
      elapsedMs,
      focusMs: snapshot.focusMs,
      distanceLy: snapshot.distanceLy,
      status: result,
      updatedAt: timestamp,
    };
    saveProfile({
      ...pilot,
      position: result === "arrived" ? flight.plan.to.id : EARTH.id,
      records: [record, ...pilot.records].slice(0, 100),
    });
    void report(flight, elapsedMs, result).catch(() => {});
    setActive(null);
    setArrival(result === "arrived" ? flight.plan : null);
    setNotice(reason);
  }, [saveProfile]);

  useEffect(() => {
    const saved = load<Profile>(PROFILE_KEY);
    const pilot = saved && typeof saved.pilotId === "string" && Array.isArray(saved.records)
      ? saved
      : { pilotId: crypto.randomUUID(), position: EARTH.id, records: [] };
    saveProfile(pilot);

    const interrupted = load<StoredActive>(ACTIVE_KEY);
    if (isActive(interrupted) && interrupted.pilotId === pilot.pilotId) {
      const plan = getVoyagePlan(interrupted.fromId, interrupted.toId);
      if (plan) {
        current.current = { ...interrupted, plan };
        finish("failed", "항해가 중단되어 지구로 돌아왔습니다.", interrupted.startedAt);
      }
    }
  }, [finish, saveProfile]);

  useEffect(() => {
    if (!active) return;

    function sync() {
      if (current.current !== active || !active) return;
      const now = Date.now();
      const latest = getVoyageSnapshot(active.plan, now - active.startedAt);
      if (inactiveAt.current !== null) {
        const lost = getVoyageSnapshot(active.plan, inactiveAt.current - active.startedAt);
        const failureAt = inactiveAt.current + (lost.phase === "rest" ? lost.remainingMs : 0);
        if (now >= failureAt) {
          finish("failed", "집중 중 화면을 벗어나 지구로 돌아왔습니다.", failureAt);
          return;
        }
      }
      const crossed = checkpointRef.current.filter(
        (point) => point.distanceLy > lastDistance.current && point.distanceLy <= latest.distanceLy,
      );
      lastDistance.current = latest.distanceLy;
      if (crossed.length) {
        const count = crossed.reduce((total, point) => total + point.count, 0);
        setOvertakes((total) => total + count);
        setAhead((previous) => typeof previous === "number" ? Math.max(0, previous - count) : previous);
      }
      if (latest.phase === "arrived") {
        finish("arrived", "", active.startedAt + active.plan.durationMs);
      } else {
        setElapsed(Math.max(0, now - active.startedAt));
      }
    }

    function background() {
      inactiveAt.current ??= Date.now();
      sync();
    }

    function foreground() {
      if (document.hidden) return;
      sync();
      inactiveAt.current = null;
    }

    function visibility() {
      if (document.hidden) background();
      else foreground();
    }

    function exit() {
      sync();
      finish("failed", "항해가 중단되어 지구로 돌아왔습니다.");
    }

    const tick = window.setInterval(sync, 200);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", background);
    window.addEventListener("focus", foreground);
    window.addEventListener("pagehide", exit);
    if (document.hidden) background();

    return () => {
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", background);
      window.removeEventListener("focus", foreground);
      window.removeEventListener("pagehide", exit);
    };
  }, [active, finish]);

  useEffect(() => {
    if (!active) return;
    let pending = false;
    const controller = new AbortController();

    async function poll() {
      if (pending || !active || current.current !== active || document.hidden) return;
      pending = true;
      try {
        const elapsedMs = Math.max(0, Math.min(Date.now() - active.startedAt, active.plan.durationMs));
        const response = await report(active, elapsedMs, "active");
        if (!response.ok) throw new Error("항해 기록을 갱신할 수 없습니다.");
        const query = new URLSearchParams({
          pilotId: active.pilotId,
          distanceLy: String(getVoyageSnapshot(active.plan, elapsedMs).distanceLy),
        });
        const feed = await fetch(`/api/voyages?${query}`, { signal: controller.signal });
        if (!feed.ok) throw new Error("앞선 우주선 정보를 불러올 수 없습니다.");
        const result: VoyageFeed = await feed.json();
        if (current.current !== active || controller.signal.aborted) return;

        const crossed = result.checkpoints.filter((point) => point.distanceLy <= lastDistance.current);
        const newlyCrossed = crossed.filter((point) => !checkpointRef.current.some((known) => known.distanceLy === point.distanceLy));
        if (newlyCrossed.length) {
          setOvertakes((total) => total + newlyCrossed.reduce((count, point) => count + point.count, 0));
        }
        checkpointRef.current = result.checkpoints;
        setAhead(Math.max(0, result.aheadCount - crossed.reduce((count, point) => count + point.count, 0)));
      } catch {
        if (!controller.signal.aborted && current.current === active) setAhead("unavailable");
      } finally {
        pending = false;
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), 30_000);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [active]);

  function start(plan: VoyagePlan) {
    if (current.current || !profileRef.current) return;
    const flight = { id: crypto.randomUUID(), startedAt: Date.now(), plan, pilotId: profileRef.current.pilotId };
    current.current = flight;
    inactiveAt.current = null;
    checkpointRef.current = [];
    lastDistance.current = plan.from.distanceLy;
    store(ACTIVE_KEY, { id: flight.id, startedAt: flight.startedAt, pilotId: flight.pilotId, fromId: plan.from.id, toId: plan.to.id });
    setNotice("");
    setArrival(null);
    setElapsed(0);
    setAhead(null);
    setOvertakes(0);
    setActive(flight);
  }

  return {
    profile,
    active,
    snapshot: active ? getVoyageSnapshot(active.plan, elapsed) : null,
    arrival,
    notice,
    ahead,
    overtakes,
    start,
    stop: () => finish("failed", "항해를 종료하고 지구로 돌아왔습니다."),
    dismissArrival: () => setArrival(null),
    dismissNotice: () => setNotice(""),
  };
}
