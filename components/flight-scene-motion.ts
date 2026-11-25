/* Canvas effects adapted from pocs/voyage/voyage.js. */
type FlightMotionMode = "moving" | "stopped" | "parked";

type MotionElements = {
  frame: HTMLElement;
  dust: HTMLCanvasElement;
  exhaust: HTMLCanvasElement;
  ship: HTMLElement;
  layers: [HTMLElement, HTMLElement];
};

type Dust = {
  x: number;
  y: number;
  depth: number;
  speed: number;
  phase: number;
};

type Exhaust = {
  x: number;
  y: number;
  speed: number;
  age: number;
  life: number;
  phase: number;
  radius: number;
};

const random = (min: number, max: number) => min + Math.random() * (max - min);
const BACKGROUND_INTERVAL = 10;
const BACKGROUND_FADE = 5;

function makeSprite(colors: [string, string, string]) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 96;
  const context = canvas.getContext("2d");
  if (!context) return canvas;

  const gradient = context.createRadialGradient(48, 48, 0, 48, 48, 48);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(0.35, colors[1]);
  gradient.addColorStop(1, colors[2]);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 96, 96);
  return canvas;
}

export function createFlightMotion(
  { frame, dust, exhaust, ship, layers }: MotionElements,
  images: readonly string[],
  showCredit: (index: number | null) => void,
) {
  const dustContext = dust.getContext("2d");
  const exhaustContext = exhaust.getContext("2d");
  if (!dustContext || !exhaustContext) return;

  const smokeSprite = makeSprite(["#e4eeff", "#8ba9c26b", "#6688a500"]);
  const glowSprite = makeSprite(["#e9fbff", "#73d5ffaf", "#3098ee00"]);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let mode: FlightMotionMode = "parked";
  let animation = 0;
  let lastFrame = 0;
  let voyageTime = 0;
  let backgroundTime = 0;
  let activeLayer = 0;
  let underLayer: number | null = null;
  let credit: number | null = null;
  let reportedCredit: number | null = null;
  let nextImage = 0;
  let imageDeck: number[] = [];
  let upcoming: HTMLImageElement | null = null;
  let width = 0;
  let height = 0;
  let shipWidth = 0;
  let shipHeight = 0;
  let shipX = 0;
  let shipY = 0;
  let dustParticles: Dust[] = [];
  let exhaustParticles: Exhaust[] = [];
  let emissions = 0;

  function preloadBackground() {
    if (imageDeck.length === 0) {
      imageDeck = images.map((_, index) => index);
      for (let index = imageDeck.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(random(0, index + 1));
        [imageDeck[swap], imageDeck[index]] = [imageDeck[index], imageDeck[swap]];
      }
      if (imageDeck[imageDeck.length - 1] === credit) {
        const last = imageDeck.pop();
        if (last !== undefined) imageDeck.unshift(last);
      }
    }
    const index = imageDeck.pop();
    if (index === undefined) return;
    nextImage = index;
    upcoming = new Image();
    upcoming.src = images[index];
  }

  function updateBackground(delta: number) {
    backgroundTime += delta;
    if (backgroundTime >= BACKGROUND_INTERVAL && upcoming?.complete) {
      if (upcoming.naturalWidth) {
        underLayer = activeLayer;
        activeLayer = 1 - activeLayer;
        layers[activeLayer].style.backgroundImage = `url("${images[nextImage]}")`;
        layers[activeLayer].style.opacity = "0";
        layers[activeLayer].style.zIndex = "1";
        layers[underLayer].style.zIndex = "0";
        credit = nextImage;
        backgroundTime = 0;
      }
      preloadBackground();
    }

    const progress = Math.min(backgroundTime / BACKGROUND_FADE, 1);
    if (underLayer !== null) {
      layers[activeLayer].style.opacity = String(progress * progress * (3 - 2 * progress));
      if (progress >= 0.5 && reportedCredit !== credit) {
        reportedCredit = credit;
        showCredit(credit);
      }
      if (progress === 1) {
        layers[underLayer].style.opacity = "0";
        underLayer = null;
      }
    }
    const drift = Math.min(backgroundTime / BACKGROUND_INTERVAL, 1);
    layers[activeLayer].style.transform = `translateX(${1.6 - drift * 3.2}%)`;
  }

  function makeDust(anywhere: boolean): Dust {
    const depth = Math.pow(Math.random(), 1.6);
    return {
      x: anywhere ? random(0, width) : width + random(4, 40),
      y: random(0, height),
      depth,
      speed: (18 + 150 * depth * depth) * Math.max(0.7, width / 1000),
      phase: random(0, Math.PI * 2),
    };
  }

  function drawDust(context: CanvasRenderingContext2D, delta: number) {
    context.clearRect(0, 0, width, height);
    dustParticles = dustParticles.map((particle) => {
      particle.x -= particle.speed * delta;
      const { x, y, depth, phase, speed } = particle;
      if (x < -20) return makeDust(false);

      const wobble = y + Math.sin(voyageTime * 0.7 + phase) * (1 + 5 * depth);
      const length = 1 + speed * 0.12;
      context.lineWidth = 0.45 + depth * 1.8;
      context.lineCap = "round";
      context.strokeStyle = `rgba(201, 229, 255, ${0.17 + depth * 0.54})`;
      context.beginPath();
      context.moveTo(x, wobble);
      context.lineTo(x + length, wobble);
      context.stroke();
      return particle;
    });
  }

  function drawExhaust(context: CanvasRenderingContext2D, delta: number, travel: number) {
    const bob = Math.sin(voyageTime * 0.8) * shipHeight * 0.025;
    const sway = Math.sin(voyageTime * 0.55 + 0.6) * 0.7;
    const nozzleX = shipX - shipWidth * 0.45;
    const nozzleY = shipY + bob + shipHeight * 0.012;
    ship.style.setProperty("--flight-bob", `${bob}px`);
    ship.style.setProperty("--flight-sway", `${sway}deg`);

    emissions += 76 * travel;
    while (emissions >= 1) {
      exhaustParticles.push({
        x: nozzleX + random(-2, 2),
        y: nozzleY + random(-1.5, 1.5),
        speed: Math.max(230, width * 0.45) * random(0.85, 1.2),
        age: 0,
        life: random(2.5, 4.3),
        phase: random(0, Math.PI * 2),
        radius: shipHeight * random(0.075, 0.12),
      });
      emissions -= 1;
    }

    context.clearRect(0, 0, width, height);
    exhaustParticles = exhaustParticles.filter((particle) => {
      particle.age += delta;
      particle.speed *= Math.exp(-0.12 * delta);
      particle.x -= particle.speed * travel;
      const progress = particle.age / particle.life;
      const radius = particle.radius * (1 + Math.min(progress, 1) * 4);
      if (progress >= 1 || particle.x + radius * 1.4 < -15) return false;

      const vertical = particle.y + Math.sin(particle.phase + particle.age * 1.4) * radius * progress;
      context.globalAlpha = 0.24 * Math.min(1, particle.age / 0.12) * Math.pow(1 - progress, 1.25);
      context.drawImage(smokeSprite, particle.x - radius * 1.4, vertical - radius * 0.6, radius * 2.8, radius * 1.2);
      return true;
    });
    if (travel > 0) {
      const radius = shipHeight * (0.18 + Math.sin(voyageTime * 21) * 0.02);
      context.globalCompositeOperation = "lighter";
      context.globalAlpha = 0.84;
      context.drawImage(glowSprite, nozzleX - radius * 1.4, nozzleY - radius / 2, radius * 2.2, radius);
      context.globalCompositeOperation = "source-over";
    }
    context.globalAlpha = 1;
  }

  function drawFrame(now: number) {
    animation = 0;
    const delta = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 1 / 60;
    lastFrame = now;
    const travel = mode === "moving" ? delta : 0;

    if (travel > 0) {
      voyageTime += travel;
      updateBackground(travel);
      if (dustContext) drawDust(dustContext, travel);
    }
    if (exhaustContext) drawExhaust(exhaustContext, delta, travel);
    if (mode === "moving" || exhaustParticles.length > 0) {
      animation = requestAnimationFrame(drawFrame);
    }
  }

  function resize() {
    width = frame.clientWidth;
    height = frame.clientHeight;
    shipWidth = ship.clientWidth;
    shipHeight = shipWidth * 0.675;
    shipX = ship.offsetLeft;
    shipY = ship.offsetTop;
    const scale = width ? frame.getBoundingClientRect().width / width : 1;
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio * scale));

    for (const [canvas, context] of [[dust, dustContext], [exhaust, exhaustContext]] as const) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    dustParticles = Array.from({ length: Math.min(240, Math.round(width * height / 4100)) }, () => makeDust(true));
    exhaustParticles = [];
    if (mode !== "parked" && dustContext) drawDust(dustContext, 0);
  }

  function reset() {
    voyageTime = backgroundTime = emissions = 0;
    exhaustParticles = [];
    lastFrame = 0;
    activeLayer = 0;
    underLayer = null;
    credit = reportedCredit = null;
    upcoming = null;
    imageDeck = [];
    for (const layer of layers) layer.removeAttribute("style");
    ship.style.removeProperty("--flight-bob");
    ship.style.removeProperty("--flight-sway");
    showCredit(null);
    dustContext?.clearRect(0, 0, width, height);
    exhaustContext?.clearRect(0, 0, width, height);
  }

  function syncAnimation() {
    cancelAnimationFrame(animation);
    animation = 0;
    lastFrame = 0;
    if (!reducedMotion.matches && (mode === "moving" || exhaustParticles.length > 0)) {
      animation = requestAnimationFrame(drawFrame);
    } else {
      exhaustParticles = [];
      exhaustContext?.clearRect(0, 0, width, height);
    }
  }

  const observer = new ResizeObserver(resize);
  observer.observe(frame);
  resize();
  reducedMotion.addEventListener("change", syncAnimation);

  return {
    setMode(nextMode: FlightMotionMode) {
      if (mode === nextMode) return;
      const previous = mode;
      mode = nextMode;
      if (mode === "parked") reset();
      if (mode === "moving" && previous === "parked") {
        preloadBackground();
        if (dustContext) drawDust(dustContext, 0);
      }
      syncAnimation();
    },
    dispose() {
      cancelAnimationFrame(animation);
      observer.disconnect();
      reducedMotion.removeEventListener("change", syncAnimation);
    },
  };
}
