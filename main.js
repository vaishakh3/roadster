import * as THREE from "./vendor/three.module.js";
import {
  createChallenge,
  awardTrick,
  awardGate,
  bankLanding,
  loseCombo,
  finishChallenge,
  medalFor,
  RUSH_DURATION,
} from "./challenge.js";
import { renderRatio } from "./performance.js";
import { resolveObstacles } from "./collision.js";
import { bindSteeringPad } from "./input.js";
import { RectAreaLightUniformsLib } from "./vendor/RectAreaLightUniformsLib.js";
import { createStudioEnvironment } from "./studio-light.js";
import { createCar } from "./car.js";
import { createWorld } from "./world.js";
import { createState, stepPhysics, clamp, BODY_CENTER_Y } from "./physics.js";
const $ = (id) => document.getElementById(id),
  canvas = $("scene");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
    alpha: false,
  });
} catch (e) {
  $("loading").classList.add("hidden");
  $("error").classList.remove("hidden");
  throw e;
}
renderer.transmissionResolutionScale = innerWidth < 600 ? 0.4 : 0.6;
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(
  renderRatio(
    innerWidth,
    innerHeight,
    devicePixelRatio,
    "auto",
    matchMedia("(pointer:coarse)").matches,
  ),
);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(),
  camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 2200);
const world = createWorld(scene, renderer),
  car = createCar();
scene.add(car);
let state = createState(world.garage.x, world.garage.z, world.garage.yaw);
// Two shadow-free headlight projectors give the night asphalt useful driving light.
const headlightRig = new THREE.Group();
car.add(headlightRig);
for (const side of [-1, 1]) {
  const light = new THREE.SpotLight(0xd4eeff, 24, 44, 0.41, 0.65, 1.15);
  light.position.set(side * 0.77, 0.69, -2.06);
  light.target.position.set(side * 1.8, -0.05, -24);
  headlightRig.add(light, light.target);
}
if (innerWidth < 600) world.sun.shadow.mapSize.set(1024, 1024);
const outdoorEnvironment = scene.environment,
  studioEnvironment = createStudioEnvironment(renderer);
const hemisphere = scene.children.find((o) => o.isHemisphereLight);
// Large near-field photographic softboxes create gradients even on broad panels.
RectAreaLightUniformsLib.init();
const studioRig = new THREE.Group();
studioRig.position.set(world.garage.x, 0, world.garage.z);
studioRig.rotation.y = world.garage.yaw;
scene.add(studioRig);
for (const [color, intensity, w, h, x, y, z] of [
  [0xfff6e9, 5.5, 4.2, 2.6, -3.5, 3.8, -2.6],
  [0xd5e6ff, 1.6, 2.0, 3.0, 3.8, 2.0, 1.3],
  [0xffffff, 2.1, 4.5, 0.8, 0, 3.6, 3.2],
]) {
  const light = new THREE.RectAreaLight(color, intensity, w, h);
  light.position.set(x, y, z);
  light.lookAt(0, 0.6, 0);
  studioRig.add(light);
}
// Analytic ambient contact shadow supplements the sun map at tire scale.
const contactCanvas = document.createElement("canvas");
contactCanvas.width = 256;
contactCanvas.height = 512;
const contactCtx = contactCanvas.getContext("2d");
const contactGrad = contactCtx.createRadialGradient(128, 256, 8, 128, 256, 128);
contactGrad.addColorStop(0, "rgba(0,0,0,.68)");
contactGrad.addColorStop(0.5, "rgba(0,0,0,.45)");
contactGrad.addColorStop(1, "rgba(0,0,0,0)");
contactCtx.fillStyle = contactGrad;
contactCtx.fillRect(0, 0, 256, 512);
const contactMap = new THREE.CanvasTexture(contactCanvas);
const contactShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(2.7, 5.8),
  new THREE.MeshBasicMaterial({
    map: contactMap,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  }),
);
contactShadow.rotation.x = -Math.PI / 2;
scene.add(contactShadow);
const tireContactCanvas = document.createElement("canvas");
tireContactCanvas.width = tireContactCanvas.height = 64;
const tc = tireContactCanvas.getContext("2d"),
  tg = tc.createRadialGradient(32, 32, 5, 32, 32, 32);
tg.addColorStop(0, "rgba(0,0,0,.86)");
tg.addColorStop(0.48, "rgba(0,0,0,.55)");
tg.addColorStop(1, "rgba(0,0,0,0)");
tc.fillStyle = tg;
tc.fillRect(0, 0, 64, 64);
const tireContactMaterial = new THREE.MeshBasicMaterial({
  map: new THREE.CanvasTexture(tireContactCanvas),
  transparent: true,
  opacity: 0.75,
  depthWrite: false,
});
const tireContacts = [];
for (const side of [-1, 1])
  for (const z of [-1.45, 1.48]) {
    const patch = new THREE.Mesh(
      new THREE.PlaneGeometry(0.68, 0.82),
      tireContactMaterial,
    );
    patch.rotation.x = -Math.PI / 2;
    patch.renderOrder = 3;
    scene.add(patch);
    tireContacts.push({ patch, side, z });
  }
let phase = "intro",
  mode = "circuit",
  cameraMode = 0,
  elapsed = 0,
  countdown = 0,
  nextGate = 1,
  gatesPassed = 0,
  flightCollected = 0,
  nextRing = 0,
  lastTime = 0,
  accumulator = 0,
  totalTime = 0,
  toastEnd = 0,
  best = 0,
  quality = "auto",
  heroAngle = 0,
  heroView = 0,
  hadFocus = true;
try {
  const stored = Number(localStorage.getItem("roadster-flight-lab-best") || 0);
  best = Number.isFinite(stored) && stored > 0 && stored < 3600 ? stored : 0;
} catch {}
const input = {
    throttle: 0,
    brake: 0,
    steer: 0,
    boost: false,
    drift: false,
    lift: 0,
    pitch: 0,
    roll: 0,
    yaw: 0,
    recover: false,
  },
  keys = new Set(),
  pointers = new Map();
const stick = { pointer: null, x: 0, y: 0 };
let flightCameraYaw = state.yaw,
  lastFlightMode = false,
  lastTricks = 0,
  lastCrash = false,
  lastReserveWarning = false,
  runTrickScore = 0;
const touch = matchMedia("(pointer:coarse)").matches;
const touchUI = () => touch || innerWidth < 760;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let challenge = createChallenge(),
  rushBest = 0,
  aeroPreview = false,
  groundSteer = 0,
  resetSteering = () => {},
  lastLegend = "",
  lastMapTime = 0;
let photoReturn = "intro",
  photoYaw = 0,
  photoPitch = 0.28,
  photoDistance = 8,
  photoPointer = null,
  lastPhotoX = 0,
  lastPhotoY = 0;
let resultData = null,
  maxAltitude = 0,
  wasSafelyAirborne = false;
try {
  rushBest = Math.max(
    0,
    Number(localStorage.getItem("roadster-rush-best")) || 0,
  );
} catch {}
function updateGarageRecord() {
  $("garage-record").textContent =
    mode === "stunt"
      ? rushBest
        ? "YOUR BEST · " + rushBest.toLocaleString() + " PTS"
        : "BRONZE 1,000 · SILVER 3,000 · GOLD 6,000"
      : mode === "circuit" && best
        ? "YOUR BEST · " + fmt(best)
        : "YOUR NEXT PERSONAL BEST STARTS HERE";
}
$("device-hint").textContent = touch
  ? "Thumb pad to steer · pedals to drive · launch to fly"
  : "WASD to drive · H to fly · Esc to pause";
updateGarageRecord();
const color = new THREE.Color(),
  tmpV = new THREE.Vector3(),
  camTarget = new THREE.Vector3(),
  camPosition = new THREE.Vector3();
function fmt(t) {
  let ms = Math.floor((t % 1) * 1000),
    s = Math.floor(t) % 60,
    m = Math.floor(t / 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}
function airborne() {
  return state.hover || !state.grounded;
}
function clearInput() {
  resetSteering();
  groundSteer = 0;
  keys.clear();
  pointers.clear();
  stick.pointer = null;
  stick.x = stick.y = 0;
  input.throttle =
    input.brake =
    input.steer =
    input.lift =
    input.pitch =
    input.roll =
    input.yaw =
      0;
  input.boost = input.drift = input.recover = false;
  const knob = $("flight-stick-knob");
  if (knob) knob.style.transform = "translate(0px, 0px)";
  document
    .querySelectorAll(".pressed")
    .forEach((el) => el.classList.remove("pressed"));
}
function refreshInput() {
  const active = new Set(pointers.values()),
    held = (...names) => names.some((n) => keys.has(n)),
    has = (n) => active.has(n),
    air = airborne();
  input.boost = held("ShiftLeft", "ShiftRight") || has("boost");
  input.brake = has("brake");
  if (air) {
    input.throttle = input.boost || has("throttle") ? 1 : 0;
    input.boost = false;
    input.brake = held("KeyB") || has("brake") ? 1 : 0;
    input.steer = 0;
    input.drift = false;
    input.pitch = clamp(
      (held("KeyS", "ArrowDown") ? 1 : 0) -
        (held("KeyW", "ArrowUp") ? 1 : 0) +
        stick.y,
      -1,
      1,
    );
    input.yaw = clamp(
      (held("KeyA", "ArrowLeft") ? 1 : 0) -
        (held("KeyD", "ArrowRight") ? 1 : 0) -
        stick.x,
      -1,
      1,
    );
    input.roll =
      (held("KeyQ") || has("roll-left") ? 1 : 0) -
      (held("KeyE") || has("roll-right") ? 1 : 0);
    input.lift =
      (held("Space") || has("lift") ? 1 : 0) -
      (held("KeyZ") || has("lower") ? 1 : 0);
    input.recover = held("KeyX") || has("recover");
  } else {
    input.throttle = held("KeyW", "ArrowUp") || has("throttle") ? 1 : 0;
    input.brake = held("KeyS", "ArrowDown") || has("brake") ? 1 : 0;
    input.steer = clamp(
      (held("KeyA", "ArrowLeft") || has("left") ? 1 : 0) -
        (held("KeyD", "ArrowRight") || has("right") ? 1 : 0) +
        groundSteer,
      -1,
      1,
    );
    input.drift = held("Space") || has("drift");
    input.lift = input.pitch = input.roll = input.yaw = 0;
    input.recover = false;
  }
}
function toast(text, duration = 2.5) {
  $("toast").textContent = text;
  $("toast").style.opacity = 1;
  toastEnd = totalTime + duration;
}
function setPhase(p) {
  phase = p;
  const garage = p === "intro" || (p === "photo" && photoReturn === "intro");
  studioRig.visible = garage;
  headlightRig.visible = !garage;
  world.setShowroom?.(garage);
  scene.environment =
    garage && studioEnvironment ? studioEnvironment : outdoorEnvironment;
  scene.environmentIntensity = garage ? 0.55 : 0.8;
  scene.environmentRotation.y = garage ? 2.07 : 0;
  world.sun.intensity = garage ? 0.16 : 0.55;
  if (hemisphere) hemisphere.intensity = garage ? 0.13 : 0.5;
  document.body?.setAttribute("data-phase", p);
  document.body?.setAttribute("data-mode", mode);
  $("intro").classList.toggle("hidden", p !== "intro");
  $("hud").classList.toggle("hidden", p === "intro" || p === "photo");
  $("dialog").classList.toggle("hidden", p !== "paused" && p !== "finished");
  $("photo-panel").classList.toggle("hidden", p !== "photo");
  $("pause").style.display =
    p === "intro" || p === "photo" ? "none" : "inline-block";
  $("save-result").classList.toggle("hidden", p !== "finished");
  if (p === "intro") updateGarageRecord();
  lastTime = 0;
  accumulator = 0;
  audio.update();
}

function start() {
  helpFromIntro = false;
  clearInput();
  challenge = createChallenge();
  maxAltitude = 0;
  wasSafelyAirborne = false;
  resultData = null;
  elapsed = 0;
  nextGate = 1;
  gatesPassed = 0;
  flightCollected = 0;
  nextRing = 0;
  runTrickScore = 0;
  lastTricks = 0;
  lastCrash = false;
  lastReserveWarning = false;
  lastFlightMode = false;
  state = createState(world.spawn.x, world.spawn.z, world.spawn.yaw);
  state.charge = 100;
  flightCameraYaw = state.yaw;
  cameraMode = 0;
  world.setGate(mode === "circuit" ? 1 : -1);
  countdown = mode === "free" ? 0 : 3;
  setPhase("playing");
  $("mission-mode").textContent =
    mode === "circuit"
      ? "CIRCUIT / TIME TRIAL"
      : mode === "stunt"
        ? "FLIGHT RUSH / 90 SECONDS"
        : "FREE FLIGHT / EXPLORATION";
  $("best").textContent =
    mode === "stunt"
      ? "BEST " + rushBest.toLocaleString()
      : mode === "circuit" && best
        ? "BEST " + fmt(best)
        : "BEST —";
  $("touch-hover").textContent = "↑ LAUNCH";
  camera.position.copy(chasePosition());
  updateCamera(0.1, true);
  if (mode === "free")
    toast(
      touchUI()
        ? "TAP LAUNCH · CLIMB TO 30 M FOR FLIPS"
        : "H TO LAUNCH · SPACE TO CLIMB",
      4,
    );
  audio.resume();
}
function reset() {
  if (phase !== "playing") return;
  loseCombo(challenge);
  wasSafelyAirborne = false;
  const savedCharge = state.charge,
    savedTopSpeed = state.topSpeed;
  clearInput();
  const near = world.nearest(state.x, state.z),
    p = world.curve.getPointAt(near.t),
    d = world.curve.getTangentAt(near.t);
  state = createState(p.x, p.z, Math.atan2(-d.x, -d.z));
  state.charge = savedCharge;
  state.topSpeed = savedTopSpeed;
  flightCameraYaw = state.yaw;
  lastTricks = 0;
  lastCrash = false;
  lastFlightMode = false;
  if (mode === "circuit" && phase === "playing" && countdown <= 0) elapsed += 3;
  $("touch-hover").textContent = "↑ LAUNCH";
  camera.position.copy(chasePosition());
  toast(
    mode === "circuit"
      ? "RECOVERED / +3 SECOND PENALTY"
      : "RECOVERED · RESERVE PRESERVED",
    1.8,
  );
}
function hover() {
  if (phase !== "playing" || countdown > 0) return;
  if (state.crashed) {
    toast("IMPACT · R OR ↺ TO RECOVER", 2);
    return;
  }
  if (state.charge < 8 && !state.hover) {
    toast("THRUST RESERVE LOW · COAST TO REFILL", 2);
    return;
  }
  clearInput();
  if (state.landing) {
    state.landing = false;
    state.hover = true;
    state.hoverTarget = Math.max(2.8, state.y);
    toast("LANDING CANCELLED · YOU HAVE CONTROL", 2);
  } else if (state.hover) {
    state.landing = true;
    state.assist = true;
    toast("LANDING ASSIST · LEVELING + DESCENT", 2);
  } else {
    state.hover = true;
    state.landing = false;
    state.hoverTarget = Math.max(2.8, state.y);
    flightCameraYaw = state.yaw;
    toast("FLIGHT ONLINE · CLIMB TO 30 M BEFORE FLIPS", 3);
  }
  lastFlightMode = airborne();
  refreshInput();
  audio.resume();
}
function toggleAssist() {
  if (phase !== "playing" || countdown > 0) return;
  state.assist = !state.assist;
  if (state.landing) state.landing = false;
  toast(
    state.assist
      ? "ASSIST ON · RELEASE TO LEVEL"
      : "ACRO · YOUR ATTITUDE, YOUR CONTROL",
    2,
  );
}
function pause(help = false) {
  if (phase === "photo") {
    exitPhoto();
    return;
  }
  if (phase === "intro") {
    showHelp(true);
    return;
  }
  if (phase === "paused") {
    resume();
    return;
  }
  if (phase === "finished") return;
  clearInput();
  setPhase("paused");
  $("dialog-label").textContent = help ? "DRIVER BRIEFING" : "MISSION PAUSED";
  $("dialog-title").textContent = help
    ? "Know your machine."
    : "Take a breath.";
  $("dialog-content").innerHTML = help
    ? helpContent()
    : `<p>Your run is paused. The timer will wait.</p><p>${mode === "circuit" ? "Clear the gates in order. Brake before the corners and use thrust on the straights." : mode === "stunt" ? "Full rotations build a combo. Land safely to bank it with a 250-point landing bonus. A crash or reset loses unbanked points." : "Explore at your own pace. Launch, climb above 30 m, then try a roll. Assisted landing brings you down."}</p>`;
  $("resume").innerHTML = "RESUME <span>→</span>";
  $("restart").style.display = "block";
}
let helpFromIntro = false;
function helpContent() {
  return `<div class="keys"><b>GROUND</b><span>WASD / arrows drive · Shift thrust · Space drift</span><b>H</b><span>Launch / assisted land / cancel landing</span><b>AIR: W / S</b><span>Pitch nose down / up (or ↑ / ↓)</span><b>A / D · Q / E</b><span>Yaw left / right · roll left / right</span><b>Space / Z</b><span>Climb / descend</span><b>Shift · B</b><span>Forward thrust · airbrake</span><b>F · hold X</b><span>Assist / acro · level and arrest spin</span><b>C · R</b><span>Camera · recover (+3s in circuit)</span><b>Esc / P</b><span>Pause</span></div><p>Climb to at least 30 m for your first flip, higher for acro or chained stunts. Hold pitch or roll for a full rotation. Assist levels the car when you release; acro keeps your attitude. Thrust follows the car’s actual orientation. Hold X or LEVEL to recover, then H to land. Landing fast or inverted causes an impact; R or ↺ recovers without refilling your reserve.</p><p>Touch: the flight stick controls yaw and pitch. Use the roll buttons, climb/descent and THRUST together. Hold AIRBRAKE to slow your travel. All thrusters share finite cold gas. Only upright grounded coasting/braking replenishes it; air gates grant a game bonus. With an empty reserve, gravity takes over. Major buildings and track barriers are solid. Slow scrapes deflect the car; high-speed impacts require recovery.</p><p>Original procedural <a href="https://www.tesla.com/roadster" target="_blank" rel="noopener" style="color:#e5e9bc">Roadster-inspired</a> model. Simplified six-axis flight, control forces and recharge are game approximations, not measured vehicle specifications. No affiliation with Tesla.</p>`;
}
function showHelp(fromIntro = false) {
  helpFromIntro = fromIntro;
  $("dialog").classList.remove("hidden");
  $("dialog-label").textContent = "DRIVER BRIEFING";
  $("dialog-title").textContent = "Know your machine.";
  $("dialog-content").innerHTML = helpContent();
  $("resume").innerHTML = fromIntro
    ? "BACK <span>→</span>"
    : "RESUME <span>→</span>";
  $("restart").style.display = fromIntro ? "none" : "block";
  if (!fromIntro) setPhase("paused");
}
function resume() {
  if (helpFromIntro) {
    helpFromIntro = false;
    $("dialog").classList.add("hidden");
    return;
  }
  if (phase === "finished") {
    mode = "free";
    challenge = createChallenge();
    setPhase("playing");
    $("mission-mode").textContent = "EXPERIMENTAL / FREE FLIGHT";
    world.setGate(-1);
    return;
  }
  setPhase("playing");
  clearInput();
}
function finish() {
  resultData = {
    title: "CIRCUIT COMPLETE",
    value: fmt(elapsed),
    detail:
      "12 GATES · " + Math.round(state.topSpeed * 3.6) + " KM/H TOP SPEED",
  };
  const isBest = !best || elapsed < best;
  if (isBest) {
    best = elapsed;
    try {
      localStorage.setItem("roadster-flight-lab-best", String(best));
    } catch {}
  }
  clearInput();
  setPhase("finished");
  $("dialog-label").textContent = isBest
    ? "NEW PERSONAL BEST"
    : "CIRCUIT COMPLETE";
  $("dialog-title").textContent = "A clean escape.";
  $("dialog-content").innerHTML =
    `<div class="result-time">${fmt(elapsed)}</div><p>12 / 12 gates cleared<br>Top speed: ${Math.round(state.topSpeed * 3.6)} km/h<br>Personal best: ${fmt(best)}</p>`;
  $("resume").innerHTML = "KEEP EXPLORING <span>→</span>";
  $("restart").style.display = "block";
}
$("start").addEventListener("click", start);
$("pause").addEventListener("click", () => pause());
$("help").addEventListener("click", () =>
  phase === "intro" ? showHelp(true) : pause(true),
);
$("resume").addEventListener("click", resume);
$("restart").addEventListener("click", start);
$("garage").addEventListener("click", () => {
  helpFromIntro = false;
  clearInput();
  setPhase("intro");
  state = createState(world.garage.x, world.garage.z, world.garage.yaw);
  world.setGate(1);
  $("dialog").classList.add("hidden");
});
document.querySelectorAll("[data-mode]").forEach((btn) =>
  btn.addEventListener("click", () => {
    mode = btn.dataset.mode;
    document.querySelectorAll("[data-mode]").forEach((b) => {
      b.classList.toggle("selected", b === btn);
      b.setAttribute("aria-pressed", String(b === btn));
    });
    const copy = {
      circuit: [
        "Clear 12 gates in order. Brake into corners, thrust out of them.",
        "LET’S DRIVE",
      ],
      stunt: [
        "Chain rotations. Land to bank your combo. Chase gold in 90 seconds.",
        "TAKE THE CHALLENGE",
      ],
      free: [
        "Learn the flight controls. Discover the air gates. Make it your own.",
        "LET’S FLY",
      ],
    };
    const hint = touch
      ? "Thumb pad to steer · pedals to drive · launch to fly"
      : "WASD to drive · H to fly · Esc to pause";
    $("mode-description").innerHTML =
      copy[mode][0] + '<span id="device-hint">' + hint + "</span>";
    $("start").innerHTML = copy[mode][1] + " <span>↗</span>";
    updateGarageRecord();
  }),
);
document.querySelectorAll("[data-view]").forEach((btn) =>
  btn.addEventListener("click", () => {
    heroView = Number(btn.dataset.view);
    document.querySelectorAll("[data-view]").forEach((b) => {
      b.classList.toggle("selected", b === btn);
      b.setAttribute("aria-pressed", String(b === btn));
    });
  }),
);
$("aero-preview").addEventListener("click", () => {
  aeroPreview = !aeroPreview;
  $("aero-preview").innerHTML =
    "AERO <b>" + (aeroPreview ? "DEPLOYED" : "STOWED") + "</b> ↗";
  $("aero-preview").setAttribute("aria-pressed", String(aeroPreview));
});
$("touch-hover").addEventListener("click", hover);
$("touch-assist").addEventListener("click", toggleAssist);
$("touch-camera").addEventListener(
  "click",
  () => (cameraMode = (cameraMode + 1) % 3),
);
$("touch-reset").addEventListener("click", reset);
window.addEventListener("keydown", (e) => {
  if (
    [
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "ArrowUp",
      "ArrowLeft",
      "ArrowDown",
      "ArrowRight",
      "Space",
      "ShiftLeft",
      "ShiftRight",
      "KeyH",
      "KeyC",
      "KeyR",
      "KeyQ",
      "KeyE",
      "KeyF",
      "KeyX",
      "KeyB",
      "KeyZ",
      "Escape",
      "KeyP",
    ].includes(e.code)
  ) {
    if (phase !== "intro") e.preventDefault();
    if (!e.repeat) {
      if (e.code === "KeyH") hover();
      if (e.code === "KeyF") toggleAssist();
      if (e.code === "KeyC" && phase === "playing")
        cameraMode = (cameraMode + 1) % 3;
      if (e.code === "KeyR" && phase === "playing") reset();
      if (e.code === "Escape" || e.code === "KeyP") {
        if (helpFromIntro) resume();
        else if (phase !== "intro") pause();
      }
    }
    keys.add(e.code);
    refreshInput();
  }
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.code);
  refreshInput();
});
window.addEventListener("blur", () => {
  clearInput();
  if (phase === "playing") pause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearInput();
    if (phase === "playing") pause();
  }
  lastTime = performance.now() / 1000;
});
document.querySelectorAll("[data-control]").forEach((btn) => {
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (phase !== "playing") return;
    try {
      btn.setPointerCapture?.(e.pointerId);
    } catch {}
    pointers.set(e.pointerId, btn.dataset.control);
    btn.classList.add("pressed");
    refreshInput();
    audio.resume();
  });
  const end = (e) => {
    pointers.delete(e.pointerId);
    btn.classList.toggle(
      "pressed",
      [...pointers.values()].includes(btn.dataset.control),
    );
    refreshInput();
  };
  btn.addEventListener("pointerup", end);
  btn.addEventListener("pointercancel", end);
  btn.addEventListener("lostpointercapture", end);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
});
// The stick owns one pointer; independent buttons retain their own pointer IDs.
const stickEl = $("flight-stick");
function moveStick(e) {
  if (e.pointerId !== stick.pointer) return;
  const r = stickEl.getBoundingClientRect(),
    radius = Math.min(r.width, r.height) * 0.38;
  let x = (e.clientX - r.left - r.width / 2) / radius,
    y = (e.clientY - r.top - r.height / 2) / radius;
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  stick.x = Math.abs(x) < 0.08 ? 0 : x;
  stick.y = Math.abs(y) < 0.08 ? 0 : y;
  $("flight-stick-knob").style.transform =
    `translate(${x * radius * 0.65}px, ${y * radius * 0.65}px)`;
  refreshInput();
}
stickEl.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (phase !== "playing" || !airborne() || stick.pointer !== null) return;
  stick.pointer = e.pointerId;
  try {
    stickEl.setPointerCapture(e.pointerId);
  } catch {}
  stickEl.classList.add("pressed");
  moveStick(e);
});
stickEl.addEventListener("pointermove", moveStick);
const releaseStick = (e) => {
  if (e.pointerId !== stick.pointer) return;
  stick.pointer = null;
  stick.x = stick.y = 0;
  stickEl.classList.remove("pressed");
  $("flight-stick-knob").style.transform = "translate(0px, 0px)";
  refreshInput();
};
for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
  stickEl.addEventListener(event, releaseStick);
stickEl.addEventListener("contextmenu", (e) => e.preventDefault());
let pixelRatio = renderRatio(
  innerWidth,
  innerHeight,
  devicePixelRatio,
  "auto",
  touch,
);
function applyQuality() {
  pixelRatio = renderRatio(
    innerWidth,
    innerHeight,
    devicePixelRatio,
    quality,
    touch,
  );
  renderer.setPixelRatio(pixelRatio);
  renderer.transmissionResolutionScale =
    quality === "high" ? 0.6 : quality === "low" ? 0.2 : touch ? 0.25 : 0.4;
  renderer.shadowMap.enabled = quality !== "low";
  world.setQuality?.(quality, touch);
  car.userData.setDetail?.(quality === "high" || (!touch && quality !== "low"));
  $("quality").textContent = quality.toUpperCase();
  $("quality").setAttribute("aria-label", "Graphics quality: " + quality);
  renderer.render(scene, camera);
}
$("quality").addEventListener("click", () => {
  quality = quality === "auto" ? "high" : quality === "high" ? "low" : "auto";
  applyQuality();
});
window.addEventListener("resize", () => {
  clearInput();
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  applyQuality();
  updateCamera(0.1, true);
  renderer.render(scene, camera);
});
// Optional, user-activated electric motor and air system sound.
const audio = {
  enabled: false,
  ctx: null,
  gain: null,
  osc: null,
  air: null,
  resume() {
    if (this.enabled && this.ctx?.state === "suspended") this.ctx.resume();
  },
  toggle() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.gain = this.ctx.createGain();
        this.gain.gain.value = 0;
        this.gain.connect(this.ctx.destination);
        this.osc = this.ctx.createOscillator();
        this.osc.type = "sine";
        this.osc.connect(this.gain);
        this.osc.start();
        const buffer = this.ctx.createBuffer(
            1,
            this.ctx.sampleRate * 2,
            this.ctx.sampleRate,
          ),
          d = buffer.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;
        const filter = this.ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 1300;
        this.air = this.ctx.createGain();
        this.air.gain.value = 0;
        noise.connect(filter);
        filter.connect(this.air);
        this.air.connect(this.ctx.destination);
        noise.start();
      } catch {
        return;
      }
    }
    this.enabled = !this.enabled;
    this.resume();
    $("sound").innerHTML = `SOUND <b>${this.enabled ? "ON" : "OFF"}</b>`;
  },
  update() {
    if (!this.ctx) return;
    const running = this.enabled && phase === "playing";
    this.gain.gain.setTargetAtTime(
      running ? 0.008 + Math.abs(state.speed) * 0.00035 : 0,
      this.ctx.currentTime,
      0.15,
    );
    this.osc.frequency.setTargetAtTime(
      70 + Math.abs(state.speed) * 8,
      this.ctx.currentTime,
      0.08,
    );
    this.air.gain.setTargetAtTime(
      running
        ? state.forwardThrust > 0
          ? 0.055
          : state.hover
            ? 0.025
            : Math.abs(state.speed) * 0.00012
        : 0,
      this.ctx.currentTime,
      0.15,
    );
  },
};
$("sound").addEventListener("click", () => audio.toggle());
// Directional reaction-control ports: paired exhaust follows each actual local torque.
// Short blue-white cores make the compressed-gas outlets readable at speed.
for (const jet of car.userData.liftJets) {
  jet.material.fragmentShader =
    "varying vec2 vUv;uniform float time;void main(){float wave=.72+.28*sin(vUv.x*23.+vUv.y*31.-time*19.);float feather=smoothstep(0.,.30,vUv.y)*(1.-smoothstep(.90,1.,vUv.y));gl_FragColor=vec4(.92,.97,1.,feather*wave*.50);}";
  for (const [radius, length, color, opacity] of [
    [0.065, 0.52, 0xb7e6ff, 0.55],
    [0.025, 0.42, 0xf3fbff, 0.85],
  ]) {
    const geometry = new THREE.ConeGeometry(radius, length, 14, 1, true);
    geometry.translate(0, -length / 2, 0);
    const core = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    core.castShadow = false;
    jet.add(core);
  }
}
const rcsRig = new THREE.Group();
car.add(rcsRig);
const rcsJets = [];
const rcsMaterial = new THREE.MeshBasicMaterial({
  color: 0xecf8ff,
  transparent: true,
  opacity: 0.25,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
});
for (const axis of ["pitch", "roll", "yaw"])
  for (const sign of [-1, 1])
    for (const side of [-1, 1]) {
      let pos, dir;
      if (axis === "pitch") {
        pos = new THREE.Vector3(0, side === -sign ? 0.22 : 0.78, side * 1.82);
        dir = new THREE.Vector3(0, side * sign, 0);
      } else if (axis === "roll") {
        pos = new THREE.Vector3(side * 0.96, side === sign ? 0.2 : 0.78, 0);
        dir = new THREE.Vector3(0, -side * sign, 0);
      } else {
        pos = new THREE.Vector3(side * sign * 0.93, 0.52, side * 1.8);
        dir = new THREE.Vector3(-side * sign, 0, 0);
      }
      const geo = new THREE.ConeGeometry(0.22, 1.65, 12, 1, true);
      geo.translate(0, -0.825, 0);
      const jet = new THREE.Mesh(geo, rcsMaterial);
      jet.position.copy(pos);
      jet.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      jet.visible = false;
      jet.castShadow = false;
      rcsRig.add(jet);
      rcsJets.push({ jet, axis, sign, pos, dir, power: 0 });
    }
// White cold-gas ribbons and persistent expanding vapour, never combustion flames.
const pc = document.createElement("canvas");
pc.width = 64;
pc.height = 64;
const px = pc.getContext("2d"),
  grad = px.createRadialGradient(32, 32, 0, 32, 32, 32);
grad.addColorStop(0, "rgba(255,255,255,.95)");
grad.addColorStop(0.24, "rgba(230,244,255,.72)");
grad.addColorStop(0.55, "rgba(235,247,255,.3)");
grad.addColorStop(1, "rgba(255,255,255,0)");
px.fillStyle = grad;
px.fillRect(0, 0, 64, 64);
const particleTex = new THREE.CanvasTexture(pc);
const particleCount = touch ? 96 : 160,
  particles = [],
  particleGroup = new THREE.Group();
scene.add(particleGroup);
for (let i = 0; i < particleCount; i++) {
  const p = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: particleTex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      color: "#e8f5ff",
    }),
  );
  p.visible = false;
  particleGroup.add(p);
  particles.push({ mesh: p, life: 0, vx: 0, vy: 0, vz: 0, max: 1 });
}
let particleIndex = 0,
  emitTime = 0;
const emitPos = new THREE.Vector3(),
  emitDir = new THREE.Vector3();
function emit(x, y, z, vx, vy, vz, dust = false, power = 1) {
  const p = particles[particleIndex++ % particleCount];
  p.mesh.position.set(x, y, z);
  p.mesh.visible = true;
  p.life = p.max = dust ? 1.15 : 1.5;
  p.vx = vx;
  p.vy = vy;
  p.vz = vz;
  p.mesh.material.color.set(dust ? "#dce5e7" : "#edf8ff");
  p.mesh.scale.setScalar(dust ? 0.65 : 0.2 + power * 0.1);
  p.dust = dust;
  p.power = power;
}
function emitLocal(pos, dir, speed = 9, power = 1) {
  emitPos.copy(pos).applyQuaternion(car.quaternion).add(car.position);
  emitDir.copy(dir).applyQuaternion(car.quaternion).multiplyScalar(speed);
  emit(
    emitPos.x,
    emitPos.y,
    emitPos.z,
    state.vx + emitDir.x,
    state.vy + emitDir.y,
    state.vz + emitDir.z,
    false,
    power,
  );
}
function updateParticles(dt) {
  emitTime += dt;
  if (phase === "playing" && emitTime > 0.025) {
    emitTime = 0;
    const lift = state.thrust?.lift ?? (state.hover ? 1 : 0),
      forward = state.thrust?.forward ?? (state.boosting ? 1 : 0);
    if (forward > 0.01)
      for (const jet of car.userData.thrusterJets)
        emitLocal(jet.position, new THREE.Vector3(0, 0, 1), 12, forward);
    if (lift > 0.01)
      for (const jet of car.userData.liftJets) {
        emitLocal(
          jet.position,
          new THREE.Vector3(0, -1, 0),
          8 + lift * 4,
          lift,
        );
        if (state.y < 7) {
          emitPos
            .copy(jet.position)
            .applyQuaternion(car.quaternion)
            .add(car.position);
          emitDir.set(0, -1, 0).applyQuaternion(car.quaternion);
          if (emitDir.y < -0.5) {
            const hit = emitPos.y / -emitDir.y;
            if (hit < 8)
              emit(
                emitPos.x + emitDir.x * hit,
                0.08,
                emitPos.z + emitDir.z * hit,
                (Math.random() - 0.5) * 4,
                0.15 + Math.random() * 0.4,
                (Math.random() - 0.5) * 4,
                true,
                0.6,
              );
          }
        }
      }
    for (const j of rcsJets)
      if (j.power > 0.04) emitLocal(j.pos, j.dir, 7, j.power);
    if (
      state.grounded &&
      !state.crashed &&
      Math.abs(state.speed) > 10 &&
      (state.slip > 0.6 || world.nearest(state.x, state.z).distance > 8.5)
    ) {
      const fx = -Math.sin(state.yaw),
        fz = -Math.cos(state.yaw),
        rx = Math.cos(state.yaw),
        rz = -Math.sin(state.yaw);
      for (const side of [-1, 1])
        emit(
          state.x - fx * 1.5 + rx * side,
          0.1,
          state.z - fz * 1.5 + rz * side,
          state.vx * 0.4,
          0.3,
          state.vz * 0.4,
          true,
          0.3,
        );
    }
  }
  for (const p of particles)
    if (p.life > 0) {
      p.life -= dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y = Math.max(0.06, p.mesh.position.y + p.vy * dt);
      p.mesh.position.z += p.vz * dt;
      if (p.mesh.position.y <= 0.07) {
        p.vy = Math.abs(p.vy) * 0.06;
        p.vx *= 0.93;
        p.vz *= 0.93;
      }
      p.mesh.scale.addScalar(dt * (p.dust ? 2.8 : 1.45));
      p.mesh.material.opacity =
        Math.max(0, p.life / p.max) *
        (p.dust ? 0.15 : 0.55) *
        Math.min(1, 0.4 + p.power * 0.6);
      if (p.life <= 0) p.mesh.visible = false;
    }
}
// Persistent tire marks provide visual feedback during hard cornering.
const skids = [];
const skidMat = new THREE.MeshBasicMaterial({
  color: "#151d1f",
  transparent: true,
  opacity: 0.27,
  depthWrite: false,
});
for (let i = 0; i < 100; i++) {
  const s = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.75), skidMat);
  s.rotation.x = -Math.PI / 2;
  s.visible = false;
  scene.add(s);
  skids.push(s);
}
let skidIndex = 0,
  skidTime = 0;
function updateSkids(dt) {
  skidTime += dt;
  if (
    skidTime > 0.055 &&
    state.grounded &&
    !state.crashed &&
    state.y < 0.2 &&
    Math.abs(state.speed) > 8 &&
    (state.slip > 0.4 || input.brake || input.drift)
  ) {
    skidTime = 0;
    const fx = -Math.sin(state.yaw),
      fz = -Math.cos(state.yaw),
      rx = Math.cos(state.yaw),
      rz = -Math.sin(state.yaw);
    for (let side of [-1, 1]) {
      const s = skids[skidIndex++ % skids.length];
      s.position.set(
        state.x - fx * 1.4 + rx * side,
        0.035,
        state.z - fz * 1.4 + rz * side,
      );
      s.rotation.set(-Math.PI / 2, 0, state.yaw);
      s.visible = true;
    }
  }
}
const bodyCenter = new THREE.Vector3(),
  bodyUp = new THREE.Vector3(),
  bodyForward = new THREE.Vector3();
function chasePosition() {
  const portrait = innerWidth < 600 && innerHeight > innerWidth,
    d = airborne() ? (portrait ? 15 : 11) : portrait ? 13.5 : 8,
    yaw = airborne() ? flightCameraYaw : state.yaw;
  return new THREE.Vector3(
    state.x + Math.sin(yaw) * d,
    state.y + (portrait ? 4.3 : 3.1),
    state.z + Math.cos(yaw) * d,
  );
}
function updateCamera(dt, snap = false) {
  camera.clearViewOffset?.();
  camera.up.set(0, 1, 0);
  if (phase === "photo") {
    const cp = Math.cos(photoPitch);
    camPosition.set(
      state.x + Math.sin(photoYaw) * photoDistance * cp,
      state.y + 0.6 + Math.sin(photoPitch) * photoDistance,
      state.z + Math.cos(photoYaw) * photoDistance * cp,
    );
    camTarget.set(state.x, state.y + 0.65, state.z);
    camera.fov = 40;
  } else if (phase === "intro") {
    heroAngle += reducedMotion ? 0 : dt * 0.035;
    const portrait = innerHeight > innerWidth,
      short = innerHeight < 560 && !portrait;
    const ang = [1.88, 1.05, -0.08][heroView] + Math.sin(heroAngle) * 0.025;
    const dist = portrait ? 14.3 : short ? 10.8 : 10;
    camPosition.set(
      state.x + Math.sin(ang) * dist,
      portrait ? 2.35 : 1.75,
      state.z + Math.cos(ang) * dist,
    );
    camTarget.set(
      state.x,
      state.y + (portrait ? 0.62 : short ? 0.42 : 0.52),
      state.z,
    );
    camera.fov = portrait ? 48 : short ? 36 : 35;
    // Compose to the right of the title and above the mode cards.
    if (camera.setViewOffset) {
      const horizontal = portrait ? 0 : innerWidth * 0.09;
      const vertical = portrait ? innerHeight * 0.035 : innerHeight * 0.045;
      camera.setViewOffset(
        innerWidth,
        innerHeight,
        -horizontal,
        vertical,
        innerWidth,
        innerHeight,
      );
    }
  } else {
    bodyUp.set(0, 1, 0).applyQuaternion(car.quaternion);
    bodyForward.set(0, 0, -1).applyQuaternion(car.quaternion);
    if (!airborne()) flightCameraYaw = state.yaw;
    else if (
      bodyUp.y > 0.45 &&
      Math.abs(bodyForward.y) < 0.85 &&
      Math.abs(input.pitch) < 0.1 &&
      Math.abs(input.roll) < 0.1
    ) {
      const desired = Math.atan2(-bodyForward.x, -bodyForward.z),
        delta = Math.atan2(
          Math.sin(desired - flightCameraYaw),
          Math.cos(desired - flightCameraYaw),
        );
      flightCameraYaw += delta * (1 - Math.exp(-dt * 1.8));
    }
    const yaw = airborne() ? flightCameraYaw : state.yaw,
      s = Math.sin(yaw),
      c = Math.cos(yaw);
    if (cameraMode === 0) {
      camPosition.copy(chasePosition());
      camPosition.y += Math.min(Math.abs(state.speed) * 0.012, 1);
      const compactPortrait =
          innerWidth < 600 && innerHeight > innerWidth && innerHeight < 650,
        look = airborne()
          ? 1.8
          : compactPortrait
            ? 0
            : innerWidth < 600 && innerHeight > innerWidth
              ? 4.5
              : 7;
      camTarget.set(
        state.x - s * look,
        state.y + (compactPortrait ? 0.2 : 1.0),
        state.z - c * look,
      );
      camera.fov +=
        (53 + Math.min(Math.abs(state.speed) * 0.13, 11) - camera.fov) *
        (1 - Math.exp(-dt * 3));
    } else if (cameraMode === 1) {
      camPosition
        .set(-0.36, 1.13, 0.18)
        .applyQuaternion(car.quaternion)
        .add(car.position);
      camTarget
        .set(-0.36, 1.03, -20)
        .applyQuaternion(car.quaternion)
        .add(car.position);
      camera.up.copy(bodyUp);
      camera.fov = 69;
    } else {
      camPosition.set(
        state.x + Math.sin(yaw + 0.7) * 11,
        state.y + 4,
        state.z + Math.cos(yaw + 0.7) * 11,
      );
      camTarget.set(state.x, state.y + 0.7, state.z);
      camera.fov = 48;
    }
  }
  if (cameraMode === 1 && phase !== "intro") {
    camera.position.copy(camPosition);
    tmpV.copy(camTarget);
  } else {
    camera.position.lerp(camPosition, snap ? 1 : 1 - Math.exp(-dt * 5));
    tmpV.lerp(camTarget, snap ? 1 : 1 - Math.exp(-dt * 9));
  }
  camera.position.y = Math.max(0.18, camera.position.y);
  camera.lookAt(tmpV);
  camera.updateProjectionMatrix();
}
function updateVehicle(dt) {
  if (state.q) {
    car.quaternion.set(state.q.x, state.q.y, state.q.z, state.q.w);
    bodyCenter.set(0, BODY_CENTER_Y, 0).applyQuaternion(car.quaternion);
    car.position.set(
      state.x - bodyCenter.x,
      state.y + BODY_CENTER_Y - bodyCenter.y,
      state.z - bodyCenter.z,
    );
  } else {
    car.position.set(state.x, state.y, state.z);
    car.rotation.set(state.pitch, state.yaw, state.roll, "YXZ");
  }
  contactShadow.position.set(
    state.x,
    phase === "intro" ? 0.094 : 0.032,
    state.z,
  );
  contactShadow.rotation.z = -state.yaw;
  contactShadow.material.opacity = Math.max(0, 0.7 - state.y * 0.08);
  contactShadow.scale.setScalar(1 + state.y * 0.05);
  for (const t of tireContacts) {
    t.patch.position.set(
      state.x + Math.cos(state.yaw) * t.side + Math.sin(state.yaw) * t.z,
      phase === "intro" ? 0.096 : 0.034,
      state.z - Math.sin(state.yaw) * t.side + Math.cos(state.yaw) * t.z,
    );
    t.patch.rotation.z = -state.yaw;
  }
  tireContactMaterial.opacity =
    state.grounded && !state.crashed
      ? 0.8 *
        Math.exp(-Math.max(0, state.y - (phase === "intro" ? 0.095 : 0)) * 2)
      : 0;
  const data = car.userData;
  if (data.interior)
    data.interior.visible =
      phase === "intro" || phase === "photo" || cameraMode === 1;
  if (data.glassMaterial)
    data.glassMaterial.side =
      phase === "playing" && cameraMode === 1
        ? THREE.FrontSide
        : THREE.DoubleSide;
  for (const w of data.wheels || []) {
    if (w.front)
      w.pivot.rotation.y =
        (state.steer * 0.4) / (1 + Math.abs(state.speed) * 0.018);
    if (phase === "playing") w.spin.rotation.x -= (state.speed * dt) / 0.36;
  }
  for (const l of data.brakeLights || [])
    if (l.material) l.material.emissiveIntensity = input.brake ? 4 : 1.3;
  const forward = state.thrust?.forward ?? (state.boosting ? 1 : 0),
    lift = state.thrust?.lift ?? (state.hover ? 1 : 0);
  for (const jet of data.thrusterJets || []) {
    jet.visible = forward > 0.02;
    jet.scale.z = 0.7 + forward * 2.4 + Math.sin(totalTime * 31) * 0.12;
    jet.material.opacity = 0.16 + Math.min(1, forward) * 0.12;
  }
  for (const jet of data.liftJets || []) {
    jet.visible = lift > 0.02 && airborne();
    jet.material.uniforms.time.value = totalTime;
    jet.scale.set(
      0.8 + lift * 0.3,
      1.2 + lift * 1.6 + Math.sin(totalTime * 27) * 0.08,
      0.8 + lift * 0.3,
    );
  }
  rcsRig.visible = phase !== "intro";
  for (const j of rcsJets) {
    const val = state.thrust?.[j.axis] ?? 0;
    j.power = Math.max(0, val * j.sign);
    j.jet.visible = j.power > 0.04;
    j.jet.scale.setScalar(0.65 + j.power * 0.8);
  }
  if (data.wing) {
    const garage =
      phase === "intro" || (phase === "photo" && photoReturn === "intro");
    const deployed = garage
      ? aeroPreview
      : Math.abs(state.speed) > 25 || !!input.brake || airborne();
    data.wing.position.y = THREE.MathUtils.lerp(
      data.wing.position.y,
      deployed ? 0.84 : 0.49,
      1 - Math.exp(-dt * 5),
    );
    data.wing.rotation.x = THREE.MathUtils.lerp(
      data.wing.rotation.x,
      input.brake && !garage ? -0.27 : 0,
      1 - Math.exp(-dt * 4),
    );
    data.wing.scale.y = THREE.MathUtils.lerp(
      data.wing.scale.y,
      deployed ? 1 : 0.65,
      1 - Math.exp(-dt * 5),
    );
  }

  world.sun.position.set(state.x - 160, 95, state.z - 110);
  world.sun.target.position.set(state.x, 0, state.z);
}
let nearest = { distance: 0, t: 0 };
function physics(dt) {
  if (phase !== "playing") return;
  if (countdown > 0) {
    countdown -= dt;
    const n = Math.ceil(countdown);
    $("toast").textContent = n > 0 ? String(n) : "GO";
    $("toast").style.opacity = 1;
    toastEnd = totalTime + 1;
    if (countdown <= 0) toast("GO", 1);
    return;
  }
  nearest = world.nearest(state.x, state.z);
  stepPhysics(state, input, dt, nearest.distance < 8.6);
  resolveObstacles(state, world.obstacles);
  maxAltitude = Math.max(maxAltitude, state.y);
  const nowFlight = airborne();
  if (state.y > 3 && !state.grounded) wasSafelyAirborne = true;
  if (nowFlight !== lastFlightMode) {
    lastFlightMode = nowFlight;
    clearInput();
    refreshInput();
  }
  if (state.crashed && !lastCrash) {
    loseCombo(challenge, true);
    wasSafelyAirborne = false;
    toast("IMPACT · R / ↺ TO RECOVER", 3);
    clearInput();
  }
  if (state.grounded && !state.crashed && wasSafelyAirborne) {
    wasSafelyAirborne = false;
    const award = bankLanding(challenge);
    if (award) {
      toast(challenge.event, 2.5);
      audio.chime?.();
    }
  }
  lastCrash = !!state.crashed;
  if (state.charge < 18 && nowFlight && !lastReserveWarning) {
    toast("LOW RESERVE · LAND NOW", 3);
    lastReserveWarning = true;
  }
  if (state.charge > 30) lastReserveWarning = false;
  const tricks = state.tricks?.total || 0;
  if (tricks > lastTricks) {
    const delta = tricks - lastTricks;
    runTrickScore += delta * 500;
    awardTrick(challenge, delta);
    toast(
      mode === "stunt"
        ? challenge.event
        : (state.tricks.last || "360° ROTATION") + " · +" + delta * 500,
      2,
    );
    lastTricks = tricks;
    audio.chime?.();
  }
  if (Math.abs(state.x) > 480 || Math.abs(state.z) > 480) {
    reset();
    toast("TEST PERIMETER · RECOVERED", 2.5);
  }
  elapsed += dt;
  if (mode === "circuit") {
    const g = world.gates[nextGate],
      dist = Math.hypot(state.x - g.point.x, state.z - g.point.z);
    if (dist < 8.6 && state.y < 4) {
      const t = world.curve.getTangentAt(g.t),
        dot = state.vx * t.x + state.vz * t.z;
      if (dot > 1) {
        gatesPassed++;
        nextGate = (nextGate + 1) % 12;
        world.setGate(nextGate);
        if (gatesPassed >= 12) finish();
        else {
          toast("GATE " + String(gatesPassed).padStart(2, "0") + " / 12", 1.1);
          audio.chime?.();
          $("flash").style.opacity = reducedMotion ? 0 : 0.08;
          setTimeout(() => ($("flash").style.opacity = 0), 100);
        }
      }
    }
  } else {
    const ring = world.flightRings[nextRing];
    if (
      nowFlight &&
      !state.crashed &&
      Math.hypot(
        state.x - ring.position.x,
        state.y + 0.65 - ring.position.y,
        state.z - ring.position.z,
      ) < 3.5
    ) {
      flightCollected++;
      nextRing = (nextRing + 1) % world.flightRings.length;
      awardGate(challenge);
      toast("AIR GATE +200 · RESERVE +20%", 2);
      state.charge = Math.min(100, state.charge + 20);
      audio.chime?.();
    }
    if (mode === "stunt" && elapsed >= RUSH_DURATION) finishRush();
  }
}
function finishRush() {
  finishChallenge(challenge);
  clearInput();
  const isBest = challenge.score > rushBest;
  if (isBest) {
    rushBest = challenge.score;
    try {
      localStorage.setItem("roadster-rush-best", String(rushBest));
    } catch {}
  }
  setPhase("finished");
  const medal = medalFor(challenge.score);
  resultData = {
    title: medal + " · FLIGHT RUSH",
    value: challenge.score.toLocaleString() + " PTS",
    detail:
      challenge.tricks +
      " ROTATIONS · " +
      challenge.landings +
      " CLEAN LANDINGS",
  };
  $("dialog-label").textContent = isBest
    ? "NEW PERSONAL BEST · " + medal
    : medal + " · FLIGHT RUSH";
  $("dialog-title").textContent =
    challenge.score >= 6000
      ? "Gravity, outplayed."
      : challenge.score >= 1000
        ? "That’s a landing."
        : "Your next run awaits.";
  $("dialog-content").innerHTML =
    '<div class="result-time">' +
    challenge.score.toLocaleString() +
    ' <small>PTS</small></div><div class="result-stats"><div><b>' +
    challenge.tricks +
    "</b><span>ROTATIONS</span></div><div><b>" +
    challenge.landings +
    "</b><span>CLEAN LANDINGS</span></div><div><b>" +
    challenge.bestCombo.toLocaleString() +
    "</b><span>BEST COMBO</span></div><div><b>" +
    rushBest.toLocaleString() +
    "</b><span>PERSONAL BEST</span></div></div><p>Bronze 1,000 · Silver 3,000 · Gold 6,000<br>Land before time runs out to bank your airborne combo.</p>";
  $("resume").innerHTML = "KEEP EXPLORING <span>↗</span>";
  $("restart").style.display = "block";
}

const map = $("minimap").getContext("2d");
function drawMap() {
  const w = 300,
    h = 220;
  map.clearRect(0, 0, w, h);
  const point = (x, z) => [w / 2 + x * 0.75, h / 2 + z * 0.75];
  map.lineCap = "round";
  map.lineJoin = "round";
  map.beginPath();
  world.center.forEach((p, i) => {
    const [x, y] = point(p.x, p.z);
    i ? map.lineTo(x, y) : map.moveTo(x, y);
  });
  map.closePath();
  map.strokeStyle = "#0a151c88";
  map.lineWidth = 12;
  map.stroke();
  map.strokeStyle = "#9eaca963";
  map.lineWidth = 3;
  map.stroke();
  if (mode === "circuit") {
    world.gates.forEach((g, i) => {
      const [x, y] = point(g.point.x, g.point.z);
      map.fillStyle = i === nextGate ? "#96e8f2" : "#81938c88";
      map.beginPath();
      map.arc(x, y, i === nextGate ? 5 : 2, 0, Math.PI * 2);
      map.fill();
    });
  } else
    world.flightRings.forEach((g, i) => {
      const [x, y] = point(g.position.x, g.position.z);
      map.strokeStyle = i === nextRing ? "#96e8f2" : "#6f8d81";
      map.lineWidth = 2;
      map.beginPath();
      map.arc(x, y, 3, 0, Math.PI * 2);
      map.stroke();
    });
  const [x, y] = point(state.x, state.z);
  map.save();
  map.translate(x, y);
  map.rotate(-state.yaw);
  map.fillStyle = "#ffffff";
  map.shadowColor = "#fff";
  map.shadowBlur = 7;
  map.beginPath();
  map.moveTo(0, -6);
  map.lineTo(4, 4);
  map.lineTo(0, 2);
  map.lineTo(-4, 4);
  map.closePath();
  map.fill();
  map.restore();
}
let hudTimer = 0;
function updateHUD(dt) {
  hudTimer += dt;
  if (hudTimer < 0.05) return;
  hudTimer = 0;
  const air = airborne(),
    tricks = state.tricks || { flips: 0, rolls: 0, spins: 0, total: 0 };
  $("hud").classList.toggle("airborne", air);
  $("speed").textContent = String(
    Math.round(
      (air ? Math.hypot(state.vx, state.vy, state.vz) : Math.abs(state.speed)) *
        3.6,
    ),
  ).padStart(3, "0");
  $("gear").textContent = air ? "F" : state.speed < -0.5 ? "R" : "D";
  $("timer").textContent =
    mode === "stunt"
      ? Math.max(0, Math.ceil(RUSH_DURATION - elapsed))
          .toString()
          .padStart(2, "0") + "s"
      : fmt(elapsed);
  $("checkpoint").textContent =
    mode === "circuit"
      ? `GATE ${String(nextGate || 12).padStart(2, "0")} / 12`
      : `AIR GATES ${String(flightCollected).padStart(2, "0")}`;
  $("charge-text").textContent = Math.round(state.charge) + "%";
  $("charge-fill").style.width = state.charge + "%";
  $("charge-fill").style.background = state.charge < 20 ? "#ffa86b" : "#d7ff65";
  $("drive-mode").textContent = state.crashed
    ? "IMPACT · RECOVER"
    : state.landing
      ? "LANDING ASSIST"
      : air
        ? !state.hover
          ? "BALLISTIC DESCENT"
          : state.assist
            ? "FLIGHT · ASSIST"
            : "FLIGHT · ACRO"
        : state.boosting
          ? "THRUST AUGMENT"
          : "GROUND EFFECT";
  $("grip").textContent = state.crashed
    ? "R / ↺ TO RECOVER"
    : air
      ? "COLD GAS · SUCTION OFF"
      : state.suctionActive
        ? "SUCTION GRIP · ACTIVE"
        : "LOOSE SURFACE · LOW GRIP";
  $("altitude").textContent = Math.max(0, state.y).toFixed(1) + " M";
  $("touch-hover").textContent = state.landing
    ? "CANCEL LAND"
    : state.hover
      ? "↓ LAND"
      : "↑ LAUNCH";
  $("touch-assist").textContent = state.assist ? "ASSIST ON" : "ACRO";
  $("touch-assist").setAttribute?.("aria-pressed", String(!!state.assist));
  $("flight-assist-status").textContent = state.assist ? "ASSIST" : "ACRO";
  $("flight-status").textContent = state.crashed
    ? "IMPACT · RECOVER"
    : state.landing
      ? "AUTO LAND"
      : input.recover
        ? "LEVELING"
        : state.charge <= 0
          ? "RESERVE EMPTY"
          : Math.abs(state.vy) > 1
            ? state.vy > 0
              ? "CLIMBING"
              : "DESCENDING"
            : !state.hover
              ? "BALLISTIC"
              : state.assist
                ? "ALTITUDE HOLD"
                : "FREE ATTITUDE";
  const deg = (v) => Math.round((v * 180) / Math.PI);
  $("attitude-readout").textContent =
    `P ${deg(state.pitch)}° · R ${deg(state.roll)}°`;
  document.querySelector(".flight-controls").classList.toggle("hidden", !air);
  $("trick-score").textContent = String(
    runTrickScore + flightCollected * 200,
  ).padStart(4, "0");
  if (lastLegend !== (air ? "air" : "ground")) {
    lastLegend = air ? "air" : "ground";
    $("control-legend").innerHTML = air
      ? "<span><kbd>W/S</kbd> PITCH</span><span><kbd>A/D</kbd> YAW</span><span><kbd>Q/E</kbd> ROLL</span><span><kbd>SPACE/Z</kbd> LIFT</span><span><kbd>SHIFT / B</kbd> THRUST / BRAKE</span><span><kbd>F</kbd> ASSIST</span><span><kbd>X</kbd> LEVEL</span><span><kbd>H</kbd> LAND</span>"
      : "<span><kbd>W A S D</kbd> DRIVE</span><span><kbd>SHIFT</kbd> THRUST</span><span><kbd>H</kbd> LAUNCH</span><span><kbd>C</kbd> CAMERA</span><span><kbd>R</kbd> RECOVER</span>";
  }

  const target =
      mode === "circuit"
        ? world.gates[nextGate].point
        : world.flightRings[nextRing].position,
    angle =
      Math.atan2(-(target.x - state.x), -(target.z - state.z)) - state.yaw;
  document.querySelector(".hint-arrow").style.transform =
    `rotate(${-angle}rad)`;
  const distance = Math.round(
    Math.hypot(target.x - state.x, target.z - state.z),
  );
  $("route-text").textContent =
    mode === "circuit"
      ? `${distance} m to gate ${String(nextGate || 12).padStart(2, "0")}`
      : `${distance} m · Air gate ${nextRing + 1} · ${target.y.toFixed(0)} m high`;
  if (totalTime - lastMapTime > 0.1) {
    drawMap();
    lastMapTime = totalTime;
  }
  updateExperienceHUD();
}
let qaFreeze = false;
let frameCount = 0,
  fpsTime = 0,
  fps = 60;
function animate(ms) {
  requestAnimationFrame(animate);
  if (qaFreeze || document.hidden) return;
  const now = ms / 1000,
    dt = lastTime ? Math.min(now - lastTime, 0.1) : 1 / 60;
  lastTime = now;
  totalTime += dt;
  accumulator += dt;
  let steps = 0;
  while (accumulator >= 1 / 120 && steps < 12) {
    physics(1 / 120);
    accumulator -= 1 / 120;
    steps++;
  }
  if (phase === "intro") state.y = 0.095;
  updateVehicle(dt);
  updateCamera(dt);
  updateParticles(dt);
  if (phase === "playing") updateSkids(dt);
  if (phase !== "intro" && phase !== "photo") updateHUD(dt);
  audio.update();
  if (totalTime > toastEnd) $("toast").style.opacity = 0;
  world.flightRings.forEach((r, i) => {
    r.children[0].material.emissiveIntensity =
      mode !== "circuit" && i === nextRing
        ? 2.0 + Math.sin(totalTime * 3) * 0.7
        : 0.35;
  });
  frameCount++;
  fpsTime += Math.min(now - (window.__lastFPSFrame || now), 2);
  window.__lastFPSFrame = now;
  if (fpsTime > 3) {
    fps = frameCount / fpsTime;
    if (quality === "auto" && fps < 40 && pixelRatio > 0.65) {
      pixelRatio = Math.max(0.65, pixelRatio - 0.15);
      renderer.setPixelRatio(pixelRatio);
      if (fps < 24) {
        renderer.shadowMap.enabled = false;
        world.setQuality?.("low", touch);
      }
    } else if (quality === "auto" && fps > 55) {
      const target = renderRatio(
        innerWidth,
        innerHeight,
        devicePixelRatio,
        quality,
        touch,
      );
      if (pixelRatio < target) {
        pixelRatio = Math.min(target, pixelRatio + 0.1);
        renderer.setPixelRatio(pixelRatio);
      }
    }
    frameCount = 0;
    fpsTime = 0;
  }
  renderer.render(scene, camera);
}
function updateExperienceHUD() {
  $("progress-fill").style.width =
    (mode === "circuit"
      ? gatesPassed / 12
      : Math.min(elapsed / RUSH_DURATION, 1)) *
      100 +
    "%";
  $("challenge-hud").classList.toggle("hidden", mode !== "stunt");
  $("banked-score").textContent = challenge.score.toLocaleString();
  $("combo-label").textContent = challenge.pending
    ? "COMBO ×" + challenge.multiplier.toFixed(1)
    : "LAUNCH · ROTATE · LAND";
  $("pending-score").textContent = challenge.pending
    ? "+" + challenge.pending.toLocaleString()
    : "";
  $("challenge-fill").style.width =
    Math.min(100, (challenge.score / 6000) * 100) + "%";
  $("speed-fx").style.opacity =
    !reducedMotion && phase === "playing"
      ? String(clamp((Math.abs(state.speed) - 35) / 55, 0, 0.8))
      : 0;
  $("coach").classList.toggle("hidden", mode === "circuit");
  let tip = touchUI()
    ? "Tap LAUNCH to lift off."
    : "Press H to launch. The thrusters hold your altitude.";
  if (state.crashed)
    tip = touchUI()
      ? "Tap ↺ to recover. Land upright and slowly."
      : "Press R to recover. Land upright and slowly.";
  else if (state.charge < 18 && airborne())
    tip = "Low cold gas. Land now; stop on the ground to refill.";
  else if (state.landing)
    tip = "Landing assist is active. Let the car level and touch down.";
  else if (airborne() && state.y < 25 && !challenge.pending)
    tip = touchUI()
      ? "Hold ↑ to climb above 30 m before a roll."
      : "Hold SPACE to climb above 30 m before a roll.";
  else if (airborne() && challenge.pending)
    tip = touchUI()
      ? "Release rotation, hold LEVEL, then tap LAND to bank."
      : "Release rotation. Hold X to level, then H to land and bank.";
  else if (airborne())
    tip = touchUI()
      ? "Hold a ROLL button for a full rotation."
      : "Hold Q or E for a full roll. Release to stabilize.";
  else if (challenge.landings)
    tip = "Clean landing. Stop to refill, then chase a bigger combo.";
  $("coach-text").textContent = tip;
}
resetSteering = bindSteeringPad(
  $("ground-stick"),
  $("ground-stick-knob"),
  (value) => {
    groundSteer = phase === "playing" ? value : 0;
    refreshInput();
  },
);
// Block selection and OS callouts across the entire game, including nested labels.
for (const event of ["contextmenu", "selectstart", "dragstart"])
  document.addEventListener(event, (e) => e.preventDefault());
for (const event of ["gesturestart", "gesturechange", "gestureend"])
  document.addEventListener(event, (e) => e.preventDefault(), {
    passive: false,
  });
window.addEventListener("pagehide", clearInput);
canvas.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  clearInput();
  if (phase === "playing") pause();
  $("error-message").textContent =
    "The graphics connection was interrupted. Reload to restart with a fresh renderer.";
  $("error").classList.remove("hidden");
});
$("fullscreen").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen)
      await document.documentElement.requestFullscreen();
    else toast("Fullscreen is unavailable in this browser", 2);
  } catch {
    toast("Fullscreen is unavailable in this browser", 2);
  }
});
function openPhoto() {
  if (phase !== "intro" && phase !== "playing") return;
  photoReturn = phase;
  photoYaw = state.yaw + 2.5;
  photoPitch = 0.2;
  photoDistance = 8;
  clearInput();
  setPhase("photo");
  updateCamera(1, true);
}
function exitPhoto() {
  if (phase !== "photo") return;
  photoPointer = null;
  clearInput();
  setPhase(photoReturn);
  updateCamera(1, true);
}
$("photo").addEventListener("click", openPhoto);
$("exit-photo").addEventListener("click", exitPhoto);
canvas.addEventListener("pointerdown", (e) => {
  if (phase !== "photo" || photoPointer !== null) return;
  e.preventDefault();
  photoPointer = e.pointerId;
  lastPhotoX = e.clientX;
  lastPhotoY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (phase !== "photo" || photoPointer !== e.pointerId) return;
  photoYaw -= (e.clientX - lastPhotoX) * 0.008;
  photoPitch = clamp(photoPitch + (e.clientY - lastPhotoY) * 0.006, 0.03, 1.3);
  lastPhotoX = e.clientX;
  lastPhotoY = e.clientY;
});
for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
  canvas.addEventListener(event, (e) => {
    if (photoPointer === e.pointerId) photoPointer = null;
  });
canvas.addEventListener(
  "wheel",
  (e) => {
    if (phase !== "photo") return;
    e.preventDefault();
    photoDistance = clamp(photoDistance + e.deltaY * 0.007, 3.5, 18);
  },
  { passive: false },
);
function downloadCanvas(source, name) {
  source.toBlob((blob) => {
    if (!blob) {
      toast("Could not save this image. Please try again.", 2);
      return;
    }
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, "image/png");
}
$("save-photo").addEventListener("click", () => {
  renderer.render(scene, camera);
  const output = document.createElement("canvas");
  output.width = canvas.width;
  output.height = canvas.height;
  const context = output.getContext("2d");
  context.drawImage(canvas, 0, 0);
  const size = Math.max(12, output.width * 0.012);
  context.font = `600 ${size}px Arial`;
  context.fillStyle = "#f3f4ed";
  context.fillText("ROADSTER / FLIGHT LAB", size * 2, output.height - size * 2);
  downloadCanvas(output, "roadster-flight-lab-photo.png");
});
$("save-result").addEventListener("click", () => {
  if (!resultData) return;
  const card = document.createElement("canvas");
  card.width = 1200;
  card.height = 630;
  const c = card.getContext("2d");
  const bg = c.createLinearGradient(0, 0, 1200, 630);
  bg.addColorStop(0, "#182431");
  bg.addColorStop(1, "#0d1118");
  c.fillStyle = bg;
  c.fillRect(0, 0, 1200, 630);
  c.strokeStyle = "#d7ff6530";
  c.lineWidth = 1;
  for (let i = 0; i < 15; i++) {
    c.beginPath();
    c.moveTo(700 + i * 50, 0);
    c.lineTo(400 + i * 50, 630);
    c.stroke();
  }
  c.fillStyle = "#d7ff65";
  c.font = "600 20px monospace";
  c.fillText("ROADSTER / FLIGHT LAB", 64, 77);
  c.fillStyle = "#a5b3b8";
  c.font = "18px monospace";
  c.fillText(resultData.title, 64, 180);
  c.fillStyle = "#f3f4ed";
  c.font = "500 112px Arial";
  c.fillText(resultData.value, 58, 315);
  c.fillStyle = "#d7ff65";
  c.font = "20px monospace";
  c.fillText(resultData.detail, 64, 380);
  c.fillStyle = "#a5b3b8";
  c.font = "16px monospace";
  c.fillText("THE ROAD IS ONLY THE BEGINNING.", 64, 530);
  c.fillText("Can you beat my run?", 64, 564);
  downloadCanvas(card, "roadster-score-card.png");
});
audio.chime = function () {
  if (!this.enabled || !this.ctx) return;
  const o = this.ctx.createOscillator(),
    g = this.ctx.createGain(),
    now = this.ctx.currentTime;
  o.type = "sine";
  o.frequency.setValueAtTime(660, now);
  o.frequency.exponentialRampToValueAtTime(990, now + 0.09);
  g.gain.setValueAtTime(0.025, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
  o.connect(g);
  g.connect(this.ctx.destination);
  o.start();
  o.stop(now + 0.31);
};
// Keep keyboard focus within an open dialog, including scrollable phone briefings.
document.addEventListener("keydown", (e) => {
  if (e.code !== "Tab" || $("dialog").classList.contains("hidden")) return;
  const focusable = [
    ...$("dialog").querySelectorAll("button:not(.hidden),a"),
  ].filter((el) => el.getClientRects().length);
  if (!focusable.length) return;
  const first = focusable[0],
    last = focusable[focusable.length - 1];
  if (
    e.shiftKey &&
    (document.activeElement === first ||
      !$("dialog").contains(document.activeElement))
  ) {
    e.preventDefault();
    last.focus();
  } else if (
    !e.shiftKey &&
    (document.activeElement === last ||
      !$("dialog").contains(document.activeElement))
  ) {
    e.preventDefault();
    first.focus();
  }
});

applyQuality();
state.y = 0.095;
updateVehicle(0);
updateCamera(0.016, true);
renderer.render(scene, camera);
$("loading").classList.add("hidden");
setPhase("intro");
requestAnimationFrame(animate);
window.__roadster = {
  getState: () => ({
    phase,
    mode,
    elapsed,
    countdown,
    nextGate,
    gatesPassed,
    cameraMode,
    heroView,
    quality,
    fps,
    pixelRatio,
    frames: frameCount,
    state: JSON.parse(JSON.stringify(state)),
    input: { ...input },
    challenge: { ...challenge },
    maxAltitude,
    renderer: {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    },
  }),
};
if (new URLSearchParams(location.search).has("qa"))
  Object.assign(window.__roadster, {
    start,
    reset,
    hover,
    toggleAssist,
    finish,
    freeze: (v) => (qaFreeze = v),
    lighting: (rotation, exposure = 1) => {
      scene.environmentRotation.y = rotation;
      renderer.toneMappingExposure = exposure;
      renderer.render(scene, camera);
    },
    setHeroView: (v) => (heroView = clamp(v, 0, 2)),
    renderView: (pos, target, fov) => {
      if (fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      updateVehicle(0);
      camera.position.fromArray(pos);
      camera.lookAt(...target);
      renderer.render(scene, camera);
    },
    snapCamera: () => {
      updateVehicle(0);
      updateCamera(1, true);
      updateHUD(0.1);
      renderer.render(scene, camera);
    },
    step: (dt) => physics(dt),
    renderFrame: (dt = 1 / 60, render = true) => {
      totalTime += dt;
      updateVehicle(dt);
      updateCamera(dt);
      updateParticles(dt);
      updateHUD(dt);
      if (render) renderer.render(scene, camera);
    },
    setState: (v) => {
      Object.assign(state, v);
      if (!v.q && ["pitch", "yaw", "roll"].some((k) => k in v)) {
        const q = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(state.pitch, state.yaw, state.roll, "YXZ"),
        );
        state.q = { x: q.x, y: q.y, z: q.z, w: q.w };
      }
      lastFlightMode = airborne();
    },
    setInput: (v) => Object.assign(input, v),
    visual: () => ({
      carPosition: car.position.toArray(),
      carQuaternion: car.quaternion.toArray(),
      liftVisible: car.userData.liftJets.filter((j) => j.visible).length,
      controlVisible: rcsJets.filter((j) => j.jet.visible).length,
      particleCount: particles.filter((p) => p.life > 0).length,
      plumeDirection: new THREE.Vector3(0, -1, 0)
        .applyQuaternion(car.quaternion)
        .toArray(),
      particles: particles
        .filter((p) => p.life > 0)
        .slice(-12)
        .map((p) => ({
          position: p.mesh.position.toArray(),
          velocity: [p.vx, p.vy, p.vz],
          dust: p.dust,
        })),
    }),
    world: () => ({
      spawn: world.spawn,
      gates: world.gates.map((g) => ({
        point: { x: g.point.x, z: g.point.z },
        tangent: world.curve.getTangentAt(g.t).toArray(),
      })),
    }),
  });
