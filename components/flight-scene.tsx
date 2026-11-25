"use client";

/* eslint-disable @next/next/no-img-element -- Local artwork is already sized and encoded. */
import { useEffect, useRef, useState } from "react";
import { createFlightMotion } from "./flight-scene-motion";
import "./flight-scene.css";

const scenePath = "/scene/";
const sideShip = `${scenePath}ship.webp`;
const horizonPlanets = new Set(["venus", "mars", "mercury", "jupiter", "uranus", "neptune", "trappist-1e", "trappist-1f"]);

// Source links and original photo credits are also in docs/design/refs/space/README.md.
const backgrounds = [
  ["horsehead-nebula-hubble-heic0105a", "NASA, NOAO, ESA and The Hubble Heritage Team (STScI/AURA)"],
  ["hubble-ultra-deep-field-heic0406a", "NASA, ESA and S. Beckwith (STScI) and the HUDF Team"],
  ["lagoon-nebula-wide-field-eso1403c", "ESO/Digitized Sky Survey 2; Davide De Martin"],
  ["messier-78-reflection-nebula-eso1105a", "ESO/Igor Chekalin"],
  ["milky-way-centre-eso0226a", "ESO"],
  ["old-stars-youthful-glow-potw1107a", "ESA/Hubble & NASA"],
  ["omega-nebula-eso0925a", "ESO"],
  ["orion-nebula-hawki-eso1625a", "ESO/H. Drass et al."],
  ["sky-around-alpha-proxima-centauri-eso1629i", "Digitized Sky Survey 2; Davide De Martin/Mahdi Zamani"],
  ["trifid-nebula-vista-eso1504a", "ESO/VVV consortium/D. Minniti"],
] as const;
const imagePaths = backgrounds.map(([file]) => `${scenePath}${file}.webp`);

export type FlightScenePhase = "idle" | "takeoff" | "focus" | "rest" | "arrived";

export function FlightScene({
  phase,
  location,
  ahead = 0,
  overtakes = 0,
}: {
  phase: FlightScenePhase;
  location?: { id: string; image: string | null };
  ahead?: number;
  overtakes?: number;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const layerOne = useRef<HTMLDivElement>(null);
  const layerTwo = useRef<HTMLDivElement>(null);
  const ship = useRef<HTMLDivElement>(null);
  const dust = useRef<HTMLCanvasElement>(null);
  const exhaust = useRef<HTMLCanvasElement>(null);
  const motion = useRef<ReturnType<typeof createFlightMotion>>(undefined);
  const [credit, setCredit] = useState<number | null>(null);

  const inFlight = phase === "focus" || phase === "rest" || phase === "arrived";
  const mode = phase === "focus" ? "moving" : inFlight ? "stopped" : "parked";
  const atEarth = !location || location.id === "earth";
  const planet = !atEarth && horizonPlanets.has(location.id)
    ? `${scenePath}orbit-${location.id}.webp`
    : null;

  useEffect(() => {
    if (!frame.current || !dust.current || !exhaust.current || !ship.current || !layerOne.current || !layerTwo.current) {
      return;
    }
    motion.current = createFlightMotion({
      frame: frame.current,
      dust: dust.current,
      exhaust: exhaust.current,
      ship: ship.current,
      layers: [layerOne.current, layerTwo.current],
    }, imagePaths, setCredit);

    return () => {
      motion.current?.dispose();
      motion.current = undefined;
    };
  }, []);

  useEffect(() => {
    motion.current?.setMode(mode);
  }, [mode]);

  return (
    <div className="flight-scene" data-phase={phase} ref={frame}>
      <div className="flight-home-bg" data-earth={atEarth}>
        {planet ? (
          <div className="flight-home-horizon" style={{ backgroundImage: `url("${planet}")` }} />
        ) : !atEarth && location.image && (
          <img className="flight-home-destination" src={location.image} alt="" draggable={false} width={112} height={112} />
        )}
      </div>
      <div className="flight-takeoff-bg" />
      <div className="flight-voyage-bg">
        <div className="flight-nebula-primary" ref={layerOne} />
        <div className="flight-nebula-secondary" ref={layerTwo} />
      </div>
      <div className="flight-vignette" />

      <canvas className="flight-dust" ref={dust} aria-hidden="true" />
      <canvas className="flight-exhaust" ref={exhaust} aria-hidden="true" />

      <div className="flight-front-frame">
        <div className="flight-front-bob">
          <div className="flight-front-glow" />
          <img className="flight-front-art" src={`${scenePath}rocket.webp`} alt="" draggable={false} width={407} height={520} />
        </div>
      </div>
      <div className="flight-side-frame" ref={ship}>
        <img className="flight-side-art" src={sideShip} alt="" draggable={false} width={620} height={419} />
      </div>

      {inFlight && Array.from({ length: Math.min(ahead, 2) }, (_, position) => (
        <img
          key={position}
          className="flight-ship-ahead"
          src={sideShip}
          alt=""
          draggable={false}
          width={620}
          height={419}
        />
      ))}
      {inFlight && Array.from({ length: Math.min(overtakes, 3) }, (_, position) => (
        <img
          key={overtakes - position}
          className="flight-ship-passing"
          data-lane={(overtakes - position) % 2}
          data-delay={(overtakes - position) % 3}
          src={sideShip}
          alt=""
          draggable={false}
          width={620}
          height={419}
        />
      ))}
      {inFlight && credit !== null && (
        <span className="flight-credit">{backgrounds[credit][1]} · CC BY 4.0</span>
      )}
    </div>
  );
}
