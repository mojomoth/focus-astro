"use client";

import { useState, type ReactNode } from "react";
import { FlightScene } from "../../components/flight-scene";
import {
  DESTINATIONS, FOCUS_MS, formatClock, formatDistance, formatDuration, getVoyagePlan,
  type Destination,
} from "../../lib/voyage";
import { useVoyage } from "./use-voyage";

type View = "home" | "takeoff" | "routes" | "records";
type IconName = "launch" | "home" | "orbit" | "log" | "back" | "next" | "stop" | "pin";
const icons: Record<IconName, ReactNode> = {
  launch: <><path d="M8.5 15.5c1.8-5.9 5.4-9.5 11.4-11.4-.2 6.3-3.9 10-9.5 11.8l-1.9-.4Z"/><path d="m9 10-4 1-2 4 5-.5m6.6.9-.7 4.7-4 1.5.3-5.6M7 17l-3 3"/><circle cx="15" cy="9" r="1.3"/></>,
  home: <><path d="M4 20h16m-13 0 1.5-8m7 0 1.5 8M5 6h14l-1.8 6H6.8L5 6Zm7 0V3m-3 13h6"/></>,
  orbit: <><circle cx="12" cy="12" r="8"/><path d="M4 12h16m-8-8c3.6 3.4 3.6 12.6 0 16m0-16c-3.6 3.4-3.6 12.6 0 16"/></>,
  log: <><rect x="5" y="4" width="14" height="16" rx="3"/><path d="M9 9h6m-6 4h6m-6 4h3"/></>,
  back: <path d="m14.5 5.5-6 6.5 6 6.5"/>,
  next: <path d="m9.5 5.5 6 6.5-6 6.5"/>,
  stop: <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/>,
  pin: <><path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.3"/></>,
};

function Icon({ name }: { name: IconName }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>;
}

function Planet({ place }: { place: Destination }) {
  return place.image
    ? <span className="planet-orb" style={{ backgroundImage: `url(${place.image})` }} aria-hidden="true" />
    : <span className="planet-orb planet-waypoint" aria-hidden="true"><Icon name="pin" /></span>;
}

function DestinationCard({ place, origin, selected, onSelect }: {
  place: Destination;
  origin: Destination;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" className="destination-card" aria-pressed={selected} onClick={onSelect}>
      <Planet place={place} />
      <span className="destination-name">{place.name}</span>
      <span className="destination-detail">{place.englishName}</span>
      <span className="destination-data">
        <span><span>거리</span><strong>{formatDistance(place.distanceLy - origin.distanceLy)}</strong></span>
        <span><span>집중</span><strong>{formatDuration(place.focusMs - origin.focusMs)}</strong></span>
      </span>
    </button>
  );
}

const tabs = [
  { view: "home", label: "관제탑", icon: "home" },
  { view: "routes", label: "항로", icon: "orbit" },
  { view: "records", label: "항해 기록", icon: "log" },
] as const;

export function FocusAstro() {
  const [view, setView] = useState<View>("home");
  const [selected, setSelected] = useState(1);
  const voyage = useVoyage();
  const { profile, active, snapshot, arrival, ahead } = voyage;
  const records = profile?.records ?? [];
  const originIndex = Math.max(0, DESTINATIONS.findIndex((place) => place.id === profile?.position));
  const position = DESTINATIONS[originIndex];
  const firstTarget = originIndex + 1;
  const lastTarget = DESTINATIONS.length - 1;
  const targetIndex = Math.min(lastTarget, Math.max(firstTarget, selected));
  const target = DESTINATIONS[targetIndex];
  const plan = getVoyagePlan(position.id, target.id);
  const nearby = [targetIndex - 1, targetIndex, targetIndex + 1];
  const phase = snapshot?.phase ?? (arrival ? "arrived" : view === "takeoff" ? "takeoff" : "idle");
  let aheadLabel = "앞선 우주선 확인 중";
  if (typeof ahead === "number") aheadLabel = `앞선 우주선 ${ahead.toLocaleString("ko-KR")}척`;
  if (ahead === "unavailable") aheadLabel = "앞선 우주선 조회 실패";
  const today = new Date().toDateString();
  const todayFocus = records.reduce((total, record) => (
    record.status === "arrived" && new Date(record.updatedAt).toDateString() === today ? total + record.focusMs : total
  ), 0);

  function selectTarget(index: number) {
    voyage.dismissNotice();
    setSelected(index);
    setView("takeoff");
  }

  return (
    <main className="astro-stage">
      <div className="astro-device">
        <div className="astro-screen" data-phase={phase}>
          <FlightScene location={position} phase={phase} ahead={typeof ahead === "number" ? ahead : 0} overtakes={voyage.overtakes} />
          <div className="astro-chrome" aria-hidden="true"><span>9:41</span><svg viewBox="0 0 53 13" width="53" height="13" fill="currentColor"><path d="M0 12V9h3v3zm4 0V7h3v5zm4 0V4h3v8zm4 0V1h3v11zm7-8 2 2a7 7 0 0 1 9 0l2-2a10 10 0 0 0-13 0zm3 4 3.5 4L29 8a5.2 5.2 0 0 0-7 0z"/><rect x="35.5" y="2.5" width="15" height="9" rx="2" fill="none" stroke="currentColor" opacity=".55"/><rect x="37" y="4" width="12" height="6" rx="1"/><path d="M52 5h1v4h-1z"/></svg></div>

          {!active && !arrival && view === "home" && (
            <section className="astro-panel home-panel" aria-labelledby="current-location">
              <header className="home-header">
                <div className="home-top">
                  <p className="wordmark">FOCUS ASTRO</p>
                  <span className="status-chip"><Icon name="launch" />오늘 집중 {formatDuration(todayFocus)}</span>
                </div>
                <p className="location-label"><Icon name="pin" />현재 위치</p>
                <h1 id="current-location">{position.name}</h1>
              </header>
              {voyage.notice && <p className="return-notice" role="status">{voyage.notice}</p>}
              {firstTarget > lastTarget && <p className="return-notice" role="status">모든 목적지에 도착했습니다.</p>}
            </section>
          )}

          {!active && !arrival && view === "takeoff" && plan && (
            <section className="astro-panel takeoff-panel" aria-label="이륙 준비">
              <header className="takeoff-header">
                <button type="button" className="icon-button" aria-label="관제탑으로 돌아가기" onClick={() => setView("home")}><Icon name="back" /></button>
                <h1>이륙 준비</h1>
                <span className="status-chip">{position.name} 출발</span>
              </header>
              <div className="takeoff-controls">
                <div className="ruler" role="group" aria-label="목적지 선택">
                  <p className="ruler-value" aria-hidden="true">{formatDuration(plan.focusMs)} 집중</p>
                  <div className="range-row">
                    <button type="button" className="icon-button" aria-label="이전 목적지" disabled={targetIndex <= firstTarget} onClick={() => setSelected(targetIndex - 1)}><Icon name="back" /></button>
                    <input
                      type="range"
                      min={firstTarget}
                      max={lastTarget}
                      value={targetIndex}
                      onChange={(event) => setSelected(event.target.valueAsNumber)}
                      aria-label="목표 거리"
                      aria-valuetext={`${target.name}, ${formatDuration(plan.focusMs)} 집중`}
                    />
                    <button type="button" className="icon-button" aria-label="다음 목적지" disabled={targetIndex >= lastTarget} onClick={() => setSelected(targetIndex + 1)}><Icon name="next" /></button>
                  </div>
                </div>
                <div className="destination-window">
                  {nearby.map((index) => index < firstTarget || index > lastTarget
                    ? <span className="destination-placeholder" key={index} />
                    : <DestinationCard key={index} place={DESTINATIONS[index]} origin={position} selected={index === targetIndex} onSelect={() => setSelected(index)} />)}
                </div>
                <button type="button" className="primary-button" disabled={!profile} onClick={() => { setView("home"); voyage.start(plan); }}>
                  <Icon name="launch" />출항
                </button>
              </div>
            </section>
          )}

          {active && snapshot && (
            <section className="astro-panel flight-panel" aria-label="항해 중">
              <header className="flight-header">
                <div className="flight-top">
                  <span className="flight-mode"><span className="signal" />{snapshot.phase === "rest" ? "휴식 중" : "집중 중"}</span>
                  <span className="status-chip ahead-chip"><Icon name="launch" />{aheadLabel}</span>
                </div>
                <h1>{active.plan.to.name}까지 항해 중</h1>
                <div className="timer" role="timer" aria-label="남은 시간">{formatClock(snapshot.remainingMs)}</div>
                <p className="phase-detail">
                  {snapshot.phase === "rest" ? "다음 집중까지 · 항해 정지" : `집중 ${snapshot.cycle}/${Math.ceil(active.plan.focusMs / FOCUS_MS)}세트`}
                </p>
              </header>
              <footer className="flight-footer">
                <div className="flight-progress">
                  <div className="route-labels"><span>{active.plan.from.name}</span><span>{active.plan.to.name}</span></div>
                  <progress aria-label="항해 진행" max={1} value={snapshot.progress} />
                  <p>{formatDistance(snapshot.distanceLy - active.plan.from.distanceLy)} <span>/</span> {formatDistance(active.plan.to.distanceLy - active.plan.from.distanceLy)}</p>
                </div>
                <div className="flight-actions">
                  <p>{snapshot.phase === "rest" ? "휴식이 끝나면 항해를 재개합니다." : "집중 중 화면을 벗어나면 지구로 돌아갑니다."}</p>
                  <button type="button" className="icon-button" aria-label="항해 종료" onClick={voyage.stop}><Icon name="stop" /></button>
                </div>
              </footer>
            </section>
          )}

          {arrival && (
            <section className="astro-panel arrival-panel" aria-label="항해 완료">
              <div className="arrival-card">
                <Planet place={arrival.to} />
                <p className="location-label">항해 완료</p>
                <h1>{arrival.to.name} 도착</h1>
                <p>{formatDuration(arrival.focusMs)} 집중 <span>·</span> {formatDistance(arrival.to.distanceLy - arrival.from.distanceLy)} 항해</p>
                <button type="button" className="primary-button" onClick={() => { voyage.dismissArrival(); setView("home"); }}>관제탑으로</button>
              </div>
            </section>
          )}

          {!active && !arrival && (view === "routes" || view === "records") && (
            <section className="astro-panel collection-panel" aria-labelledby="collection-title">
              <header>
                <p className="wordmark">FOCUS ASTRO</p>
                <h1 id="collection-title">{view === "routes" ? "항로" : "항해 기록"}</h1>
              </header>
              <div className="collection-scroll">
                {view === "routes" ? (
                  <ul className="collection-list">
                    {DESTINATIONS.slice(firstTarget).map((place, index) => (
                      <li key={place.id}>
                        <button type="button" onClick={() => selectTarget(firstTarget + index)}>
                          <Planet place={place} />
                          <span className="collection-name"><strong>{place.name}</strong><small>{formatDistance(place.distanceLy - position.distanceLy)}</small></span>
                          <span className="collection-meta">{formatDuration(place.focusMs - position.focusMs)}</span>
                          <Icon name="next" />
                        </button>
                      </li>
                    ))}
                    {firstTarget > lastTarget && <li className="collection-empty">모든 목적지에 도착했습니다.</li>}
                  </ul>
                ) : (
                  <ul className="collection-list">
                    {records.map((record) => (
                      <li className="record-row" key={record.id}>
                        <span className="collection-name">
                          <strong>{DESTINATIONS.find((place) => place.id === record.toId)?.name}</strong>
                          <small>{new Date(record.updatedAt).toLocaleDateString("ko-KR")} · {formatDuration(record.focusMs)} 집중</small>
                        </span>
                        <span className="collection-meta">{record.status === "arrived" ? "도착" : "귀환"}</span>
                      </li>
                    ))}
                    {!records.length && <li className="collection-empty">첫 항해를 마치면 여기에 기록됩니다.</li>}
                  </ul>
                )}
                {view === "routes" && (
                  <a className="asset-credits" href="https://github.com/mojomoth/focus-astro/blob/main/docs/wiki/index.md#이미지-출처" target="_blank" rel="noreferrer">이미지 출처</a>
                )}
              </div>
            </section>
          )}

          {!active && !arrival && view !== "takeoff" && (
            <footer className="home-dock">
              <nav aria-label="탐색">
                {tabs.map((tab) => (
                  <button type="button" key={tab.view} aria-label={tab.label} aria-current={view === tab.view ? "page" : undefined} onClick={() => setView(tab.view)}>
                    <Icon name={tab.icon} />
                  </button>
                ))}
              </nav>
              {view === "home" && firstTarget <= lastTarget && (
                <button type="button" className="takeoff-button" disabled={!profile} onClick={() => selectTarget(firstTarget)}><Icon name="launch" />이륙</button>
              )}
            </footer>
          )}
        </div>
        <div className="astro-frame" aria-hidden="true" />
      </div>
    </main>
  );
}
