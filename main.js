import * as THREE from "./vendor/three.module.js";
import { createRaceEffects } from "./effects.js";
import { rampSurface } from "./stunts.js";
import { FrameBudget } from "./quality.js";
import { createRivalField } from "./rivals-mesh.js";
import {
  dailyEvent,
  dailyPassed,
  encodeChallenge,
  decodeChallenge,
  sampleReplay,
} from "./challenges.js";
import { clipSupported, createClip } from "./replay-clip.js";
import { flightActuators } from "./propulsion.js";
import { createCar } from "./car.js";
import { createGhost } from "./ghost.js";
import {
  cupsEarned,
  nextMission,
  missionStatus,
  missionPassed,
  awardMission,
} from "./missions.js";
import { loadVisualAssets } from "./surfaces.js";
import { createLoadingDisplay } from "./loading.js";
import {
  COURSES,
  getCourse,
  PAINTS,
  completedCount,
  saveResult,
  LAYOUT_VERSION,
  TRIMS,
} from "./courses.js";
import { createCoast } from "./coast.js";
import { createControls, requiresLandscape } from "./controls.js";
import { createSound } from "./sound.js";
import {
  createRun,
  stepRun,
  nextWarning,
  rankRun,
  roadX,
  roadSlope,
  clamp,
  formatTime,
} from "./run.js";
const $ = (id) => document.getElementById(id);
const qa = new URLSearchParams(location.search).has("qa");
const loading = createLoadingDisplay({ recordHistory: qa });
const storage = {
  get(key, fallback) {
    if (qa) return fallback;
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    if (qa) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Private mode still plays. */
    }
  },
};
let incomingChallenge = null,
  challengeError = "";
try {
  const code = new URLSearchParams(location.hash.slice(1)).get("race");
  if (code) incomingChallenge = decodeChallenge(code);
} catch (e) {
  challengeError = e.message;
}
let course = getCourse(
  incomingChallenge?.courseId || storage.get("roadster-course", "breakwater"),
);
let activeEvent = incomingChallenge?.event || null;
let raceMode = incomingChallenge ? "challenge" : "race";
let film = null,
  clip = null,
  clipUrl = null,
  venueRequest = 0;
const todayEvent = dailyEvent();
let records = storage.get("roadster-records", {});
let career = storage.get("roadster-career", {});
if (!career || typeof career !== "object" || Array.isArray(career)) career = {};
let mission = nextMission(career, course.id);
if (!records || typeof records !== "object" || Array.isArray(records))
  records = {};
let paintIndex = storage.get("roadster-paint", 0);
let trimIndex = storage.get("roadster-trim", 0);
let saver = storage.get("breakwater-saver", false) === true,
  renderDebt = 0;
const perf = new URLSearchParams(location.search).has("perf"),
  perfStats = { frames: 0, seconds: 0 };
let coached = storage.get("roadster-coached", false) === true,
  coachStep = 0,
  coachTimer = 0,
  coachShown = 0,
  coachGate = false;
const totalCups = () =>
  COURSES.reduce((sum, c) => sum + cupsEarned(career, c.id), 0);
let ghostOn = storage.get("roadster-ghost", false) === true,
  ghost,
  ghostIndex = 0,
  replay = [],
  replayClock = 0;
let tour = null;
let phase = "home",
  previousPhase = "home",
  orientationBlocked = false,
  run = createRun(course);
let renderer, scene, camera, car, coast, controls, audio, effects, rivalField;
const venues = new Map();
let showroomAngle = 0;
let showroomTurn = null;
function turnShowroom(amount, duration) {
  if (phase !== "home" || orientationBlocked) return;
  if (reduced) {
    showroomTurn = null;
    if (amount < Math.PI * 2) showroomAngle += amount;
    return;
  }
  showroomTurn = { from: showroomAngle, amount, elapsed: 0, duration };
}
function advanceShowroom(dt) {
  if (!showroomTurn || phase !== "home") return;
  const turn = showroomTurn;
  turn.elapsed = Math.min(turn.duration, turn.elapsed + dt);
  const t = turn.elapsed / turn.duration,
    ease = t * t * t * (10 + t * (-15 + t * 6));
  showroomAngle = turn.from + turn.amount * ease;
  if (t >= 1) showroomTurn = null;
}
let lastTime = performance.now(),
  clock = 0,
  countdown = 0,
  toastTime = 0,
  announcementTime = 0,
  impactTime = 0,
  frozen = false;
let soundOn = storage.get("breakwater-sound", true),
  quality = storage.get("breakwater-quality", "auto"),
  reduced = storage.get(
    "breakwater-reduced",
    matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
const frameBudget = new FrameBudget();
let qualityLow = false,
  lastHud = 0,
  initialized = false;
const coarse = () => matchMedia("(pointer:coarse)").matches;
const cameraTarget = new THREE.Vector3(),
  cameraGoal = new THREE.Vector3();
const num = (n) => Math.round(n).toLocaleString("en-US");
function setPhase(value) {
  if (value !== "home") showroomTurn = null;
  phase = value;
  document.body.dataset.phase = value;
  $("home").hidden = value !== "home";
  $("hud").hidden = value !== "playing";
  $("menu").hidden = value !== "paused";
  $("results").hidden = value !== "results";
  $("replay-view").hidden = value !== "replay";
  $("coach").hidden = true;
  controls?.clear();
}
function showError(message) {
  cancelClip();
  loading.cancel();
  $("error").hidden = false;
  $("error-message").textContent = message;
  setPhase("error");
}
const GO_ICON = '<i class="ico ico-go" aria-hidden="true"></i>';
let lastBranchCue = "";
function announce(small, title, duration = 2) {
  $("announcement-small").textContent = small;
  $("announcement-title").textContent = title;
  announcementTime = duration;
}
const HAPTICS = { hit: 45, "rival-hit": 30, contact: 20, land: 12 };
function haptic(type) {
  if (reduced || !coarse() || !HAPTICS[type]) return;
  try {
    navigator.vibrate?.(HAPTICS[type]);
  } catch {
    /* Vibration is optional. */
  }
}
// First-run coaching: one hint at a time, shown when it is relevant, cleared
// as soon as the player does the thing (or after a few seconds). Never shown
// in daily events or friend challenges, and never again after a finished race.
const COACH = [
  {
    after: 0.6,
    timeout: 7,
    text: () => (coarse() ? "HOLD BOOST TO GO FASTER" : "HOLD SHIFT OR ↑ TO BOOST"),
    done: () => run.boosting,
  },
  {
    after: 0.8,
    timeout: 8,
    text: () =>
      coarse()
        ? "HOLD FLY TO LIFT OFF · RELEASE TO LAND"
        : "HOLD SPACE TO LIFT OFF · RELEASE TO LAND",
    done: () => run.y > 1,
  },
  {
    timeout: 6,
    when: () =>
      run.course.gates.some((g) => g.d - run.d > 15 && g.d - run.d < 80),
    text: () => "MINT GATES REFILL THRUST · CHAIN THEM FOR ×4",
    done: () => coachGate,
  },
  {
    timeout: 5,
    when: () =>
      run.y < 0.5 &&
      run.rivals.some((r) => !r.failed && r.d - run.d > 8 && r.d - run.d < 45),
    text: () => "HOVER OVER A RIVAL FOR +250",
    done: () => run.flyoverCount > 0,
  },
  {
    timeout: 5,
    when: () =>
      run.course.ramps.some((r) => r.d - run.d > 25 && r.d - run.d < 100),
    text: () => "MINT RAMP · HOLD THE LANE, THE CAR FLIPS ITSELF",
    done: () => run.airborne,
  },
];
function coachTick(dt) {
  if (coached || activeEvent || raceMode === "challenge") return;
  const step = COACH[coachStep];
  if (!step) return;
  coachTimer += dt;
  if (coachShown) {
    coachShown += dt;
    if (step.done?.() || coachShown > step.timeout) {
      $("coach").hidden = true;
      coachStep++;
      coachTimer = coachShown = 0;
    }
    return;
  }
  if (coachTimer >= (step.after || 0) && (!step.when || step.when())) {
    $("coach-text").textContent = step.text();
    $("coach").hidden = false;
    coachShown = 1e-3;
  }
}
function toast(text, type = "gate", points = 0) {
  $("event").textContent = text + (points ? " +" + num(points) : "");
  $("event").style.color = type === "hit" ? "var(--orange)" : "var(--mint)";
  toastTime = 1.5;
}
function start() {
  if (
    !initialized ||
    loading.state.active ||
    orientationBlocked ||
    document.body.dataset.preparing === "true" ||
    phase === "error"
  )
    return;
  if (tour) {
    tour.stages = tour.stages.slice(0, tour.index);
    tour.score = tour.stages.reduce((sum, s) => sum + s.score, 0);
  }
  run = createRun(course, { trim: TRIMS[trimIndex] });
  run.eventSeed = activeEvent?.seed || 0;
  coachStep = coachTimer = coachShown = 0;
  coachGate = false;
  mission = nextMission(career, course.id);
  rivalField?.reset();
  film = null;
  effects.reset();
  coast.reset();
  replay = [];
  replayClock = 0;
  recordFrame();
  ghostIndex = 0;
  countdown = 1.5;
  toastTime = impactTime = 0;
  $("event").textContent = "";
  setPhase("playing");
  audio.init();
  audio.setEnabled(soundOn);
  audio.event("start");
  announce(
    activeEvent
      ? activeEvent.description
      : incomingChallenge && raceMode === "challenge"
        ? "CHASE THE CHALLENGER GHOST"
        : mission.title,
    "READY",
    1.5,
  );
  camera.clearViewOffset();
  updateVisuals(0, true);
  hud(true);
  $("scene").focus({ preventScroll: true });
  // Phones: take the whole screen for the race when the browser allows it
  // (Android Chrome). iOS Safari has no page fullscreen; the installed app does.
  if (
    coarse() &&
    !document.fullscreenElement &&
    !installed() &&
    document.documentElement.requestFullscreen
  )
    document.documentElement.requestFullscreen().catch(() => {});
}
const installed = () =>
  matchMedia("(display-mode: standalone)").matches ||
  matchMedia("(display-mode: fullscreen)").matches ||
  navigator.standalone === true;
function refreshInstallHint() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  $("install-hint").hidden =
    installed() ||
    !coarse() ||
    storage.get("roadster-install-hint", false) === true ||
    (!ios && !!document.documentElement.requestFullscreen);
}
function pause() {
  if (phase !== "playing") return;
  previousPhase = "playing";
  setPhase("paused");
  $("menu-title").textContent = "ON HOLD.";
  $("menu-kicker").textContent = "TAKE A BREATH.";
  $("resume").innerHTML = "BACK TO THE RUN <b>" + GO_ICON + "</b>";
  $("restart").hidden = false;
  $("go-home").hidden = false;
  $("resume").focus({ preventScroll: true });
  audio.update(run, false);
}
function settings() {
  previousPhase = "home";
  setPhase("paused");
  $("menu-title").textContent = "YOUR SETUP.";
  $("menu-kicker").textContent = "MAKE YOURSELF AT HOME.";
  $("resume").innerHTML = "BACK TO START <b>" + GO_ICON + "</b>";
  $("restart").hidden = true;
  $("go-home").hidden = true;
  $("resume").focus({ preventScroll: true });
}
function resume() {
  if (orientationBlocked) return;
  if (previousPhase === "home") {
    home();
    return;
  }
  setPhase("playing");
  lastTime = performance.now();
  $("scene").focus({ preventScroll: true });
  audio.init();
  audio.setEnabled(soundOn);
}
function home(keepLoading = false) {
  if (keepLoading !== true) {
    venueRequest++;
    document.body.dataset.preparing = "false";
    loading.cancel();
  }
  showroomTurn = null;
  showroomAngle = 0;
  cancelClip();
  film = null;
  tour = null;
  activeEvent = null;
  raceMode = "race";
  effects?.reset();
  coast?.reset();
  setPhase("home");
  run = createRun(course);
  run.d = 80;
  run.speed = 0;
  run.x = 0;
  camera.fov = 44;
  camera.updateProjectionMatrix();
  refreshBest();
}
function selectCourse(id, keepLoading = false) {
  if (phase !== "home" && phase !== "results") return false;
  if (!venues.has(id)) return loadVenue(id);
  if (!keepLoading) {
    venueRequest++;
    document.body.dataset.preparing = "false";
    loading.cancel();
  }
  course = getCourse(id);
  showroomAngle = 0;
  showroomTurn = null;
  if (coast) coast.root.visible = false;
  coast = venues.get(course.id);
  coast.activate();
  coast.reset();
  effects.reset();
  applyQuality();
  storage.set("roadster-course", course.id);
  run = createRun(course);
  run.d = 80;
  run.speed = 0;
  document.body.dataset.course = course.theme;
  document.documentElement.style.setProperty("--orange", course.accent);
  $("home-title").textContent = course.name.toUpperCase();
  $("challenge-banner").hidden =
    !challengeError &&
    !(incomingChallenge && incomingChallenge.courseId === course.id);
  $("challenge-banner").textContent =
    challengeError ||
    (incomingChallenge
      ? `FRIEND CHALLENGE / BEAT ${formatTime(incomingChallenge.time)} · GHOST READY`
      : "");
  $("start").querySelector("span").textContent =
    incomingChallenge?.courseId === course.id ? "RACE THE GHOST" : "RACE HERE";
  $("venue-index").textContent = course.number + " / 03";
  $("course-location").textContent = course.number + " / " + course.location;
  $("course-description").textContent = course.subtitle;
  $("route-meta").textContent =
    (course.length / 1000).toFixed(1) + " KM / " + course.difficulty;
  $("route-tags").textContent = course.tags;
  $("course-brief").textContent = course.description;
  $("course-gold").textContent =
    "GOLD / " + formatTime(course.gold) + " + " + course.goldGates + " GATES";
  $("destination").innerHTML = course.name + " " + GO_ICON;
  document.querySelectorAll("[data-course]").forEach((b) => {
    if (b.tagName === "BUTTON") {
      const meta = b.querySelector("small[data-region]");
      if (meta)
        meta.textContent = `${meta.dataset.region} / ${(getCourse(b.dataset.course).length / 1000).toFixed(1)} KM`;
      const active = b.dataset.course === course.id;
      b.setAttribute("aria-pressed", active);
      b.classList.toggle("active", active);
    }
  });
  const points = [];
  for (let d = 0; d <= course.length; d += 40)
    points.push(
      (110 + roadX(d, course) * 0.6).toFixed(1) +
        "," +
        (115 - (d / course.length) * 100).toFixed(1),
    );
  $("route-line").setAttribute("points", points.join(" "));
  buildRaceMap();
  refreshBest();
  updateVisuals(0, true);
  hud(true);
  return true;
}
const mapPoint = (d) => [
  12 + (Math.min(course.length, Math.max(0, d)) / course.length) * 216,
  39 + (roadX(d, course) / (course.curve[0] + course.curve[2])) * 26,
];
let mapSamples = [];
function buildRaceMap() {
  mapSamples = [];
  for (let d = 0; d < course.length; d += 35)
    mapSamples.push({ d, p: mapPoint(d) });
  mapSamples.push({ d: course.length, p: mapPoint(course.length) });
  $("map-base").setAttribute(
    "points",
    mapSamples.map((s) => s.p.join(",")).join(" "),
  );
  const end = mapPoint(course.length);
  $("map-finish").setAttribute("cx", end[0]);
  $("map-finish").setAttribute("cy", end[1]);
  $("map-rivals").replaceChildren(
    ...Array.from({ length: 3 }, (_, i) => {
      const n = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      n.setAttribute("r", 3);
      n.setAttribute("fill", ["#f9b56d", "#b4a2ff", "#7cbfff"][i]);
      return n;
    }),
  );
  $("map-branches").replaceChildren(
    ...(course.branches || []).map((b) => {
      const n = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "polyline",
        ),
        a = mapPoint(b.start),
        z = mapPoint(b.end),
        m = mapPoint((b.start + b.end) / 2);
      m[1] += b.side * 8;
      n.setAttribute("points", [a, m, z].map((p) => p.join(",")).join(" "));
      return n;
    }),
  );
  $("map-stunts").replaceChildren(
    ...course.ramps.map((r) => {
      const node = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "circle",
        ),
        p = mapPoint(r.d);
      node.setAttribute("cx", p[0]);
      node.setAttribute("cy", p[1]);
      node.setAttribute("r", 2.6);
      return node;
    }),
  );
}
function updateRaceMap() {
  const p = mapPoint(run.d),
    points = mapSamples.filter((s) => s.d < run.d).map((s) => s.p);
  points.push(p);
  $("map-travelled").setAttribute(
    "points",
    points.map((p) => p.join(",")).join(" "),
  );
  $("map-player").setAttribute("transform", `translate(${p[0]},${p[1]})`);
  [...$("map-rivals").children].forEach((n, i) => {
    const r = run.rivals?.[i],
      p = mapPoint(r?.d || 0);
    n.setAttribute("cx", p[0]);
    n.setAttribute("cy", p[1]);
    if (r?.color) n.setAttribute("fill", new THREE.Color(r.color).getStyle());
  });
  const percent = Math.min(100, Math.floor((run.d / course.length) * 100));
  $("map-percent").textContent = percent + "%";
  $("race-map").setAttribute(
    "aria-label",
    `${course.name} route, ${percent}% complete, ${Math.max(0, course.length - run.d).toFixed(0)} metres remaining. Mint dots mark stunt ramps.`,
  );
}
function refreshBest() {
  const daily = dailyEvent(),
    dailyRecord = storage.get("roadster-daily-" + daily.day, null);
  $("daily-name").innerHTML =
    daily.name + (dailyRecord?.passed ? " ✓" : " " + GO_ICON);
  $("start-daily").title = daily.description + " Resets at 00:00 UTC.";
  const best = records[course.id];
  const target = nextMission(career, course.id);
  $("contract-tier").textContent = target.mastered
    ? "ALL CUPS WON / DEFEND YOUR TITLE"
    : `NEXT OBJECTIVE / ${target.name}`;
  $("contract-title").textContent = target.title;
  $("contract-detail").textContent = target.detail;
  $("contract-progress").textContent = `${target.earned} / 3 CUPS WON`;
  if (incomingChallenge?.courseId === course.id) {
    $("contract-tier").textContent = "FRIEND CHALLENGE / RECORDED GHOST";
    $("contract-title").textContent =
      "BEAT " + formatTime(incomingChallenge.time);
    $("contract-detail").textContent =
      "Race the cyan hologram. It is a time reference you can pass through.";
    $("contract-progress").textContent = "ONE GHOST / ONE TARGET TIME";
  }
  $("personal-best").textContent =
    best?.layout === LAYOUT_VERSION && best?.time
      ? `BEST ${formatTime(best.time)} / ${num(best.score)} PTS / ${["", "BRONZE", "SILVER", "GOLD"][best.medal]}`
      : "NO RECORD YET. SET THE FIRST.";
  $("course-badges").innerHTML = ["FINISH", "NO DAMAGE", "ALL GATES"]
    .map(
      (t, i) =>
        '<span class="' +
        (best?.badges?.[i] ? "earned" : "") +
        '">' +
        (best?.badges?.[i] ? "◆" : "◇") +
        " " +
        t +
        "</span>",
    )
    .join("");
  const total = completedCount(records);
  $("tour-record").textContent =
    COURSES.reduce((sum, c) => sum + cupsEarned(career, c.id), 0) +
    " / 9 CAREER CUPS" +
    (storage.get("roadster-tour-best", 0)
      ? " / TOUR BEST " + num(storage.get("roadster-tour-best", 0))
      : "");
  if (!PAINTS[paintIndex] || PAINTS[paintIndex].required > total)
    paintIndex = 0;
  car?.userData.paintMaterial.color.setHex(PAINTS[paintIndex].color);
  $("paint-name").textContent = PAINTS[paintIndex].name;
  const cups = totalCups();
  if (!TRIMS[trimIndex] || TRIMS[trimIndex].required > cups) trimIndex = 0;
  const lockedTrim = TRIMS.find((t) => t.required > cups);
  $("trim").querySelector("b").textContent = TRIMS[trimIndex].name;
  $("trim").title =
    TRIMS[trimIndex].detail +
    (lockedTrim
      ? ` ${lockedTrim.name} unlocks at ${lockedTrim.required} career cups.`
      : "");
  $("trim-note").textContent =
    TRIMS[trimIndex].short +
    (lockedTrim
      ? ` · ${lockedTrim.name} AT ${lockedTrim.required} CUPS`
      : " · ALL TRIMS UNLOCKED");
  $("paint").disabled = total === 0;
  $("paint").setAttribute(
    "aria-label",
    total === 0
      ? "Launch Red paint. Complete a course to unlock more finishes"
      : "Change unlocked paint finish",
  );
  $("paint").title =
    total < 3
      ? "Finish a new course to unlock another paint"
      : "All four finishes unlocked";
  $("ghost").querySelector("b").textContent = ghostOn ? "ON" : "OFF";
}
function beginTour() {
  activeEvent = null;
  raceMode = "tour";
  tour = { index: 0, stages: [], score: 0 };
  const currentTour = tour,
    pending = selectCourse(COURSES[0].id);
  const ready = (ok) => {
    if (ok && tour === currentTour && course.id === COURSES[0].id) start();
  };
  if (pending?.then) return pending.then(ready);
  ready(pending);
}
function nextStage() {
  if (!tour || !run.finished || document.body.dataset.preparing === "true")
    return;
  if (tour.index >= 2) {
    home();
    return;
  }
  tour.index++;
  const currentTour = tour,
    id = COURSES[tour.index].id,
    pending = selectCourse(id);
  const ready = (ok) => {
    if (ok && tour === currentTour && course.id === id) start();
  };
  if (pending?.then) return pending.then(ready);
  ready(pending);
}
function endRun() {
  if (!replay.length || replay.at(-1)[0] < run.time) recordFrame();
  audio.event(run.failed ? "fail" : "finish");
  setPhase("results");
  if (!coached && !activeEvent && raceMode !== "challenge" && !run.failed) {
    coached = true;
    storage.set("roadster-coached", true);
  }
  const rank = rankRun(run),
    complete = !run.failed;
  const careerRace = !activeEvent && raceMode !== "challenge";
  const cupsBefore = totalCups();
  const contractPassed = careerRace && missionPassed(mission, run);
  if (careerRace) {
    const reward = awardMission(career, course.id, mission, run);
    career = reward.career;
    if (reward.awarded) storage.set("roadster-career", career);
  }
  $("result-kicker").textContent = complete
    ? tour
      ? `WORLD TOUR / STAGE ${tour.index + 1} OF 3`
      : course.name + " / FINISH"
    : `${(run.d / 1000).toFixed(2)} KM INTO THE CROSSING.`;
  $("result-title").innerHTML = complete
    ? tour && tour.index === 2
      ? "TOUR<br /> COMPLETE."
      : (run.finishPosition || run.position) === 1
        ? "VICTORY."
        : (run.finishPosition || run.position) <= 3
          ? "PODIUM<br /> FINISH."
          : "FOURTH<br /> PLACE."
    : run.reason === "THE BRIDGE WAS OUT"
      ? "MISSED THE<br /> TAKEOFF."
      : "END OF<br /> THE RUN.";
  $("result-tip").textContent = complete
    ? `${run.stunts} / ${course.ramps.length} CLEAN STUNTS · ${run.airtime.toFixed(1)} SEC AIRTIME. Gold: ${formatTime(course.gold)} or faster + ${course.goldGates} gates.`
    : run.reason === "THE BRIDGE WAS OUT"
      ? "Take the mint ramp for an automatic jump, or hold FLY before the orange strips and across the gap."
      : "Steer around orange barriers, or fly over them. You have three hits.";
  $("result-time").textContent = formatTime(run.time);
  $("result-score").textContent = num(run.score);
  $("result-gates").textContent = `${run.gates} / ${course.gates.length}`;
  $("result-rank").textContent = complete ? rank : "—";
  $("result-position").textContent = complete
    ? `${run.finishPosition || run.position || 4} / 4`
    : "DNF";
  $("watch-replay").disabled = replay.length < 3;
  $("share-challenge").disabled = !complete;
  $("challenge-share").hidden = true;
  const unlockedBefore = completedCount(records);
  const result = saveResult(
      records,
      run,
      replay.map((p) => p.slice(0, 4)),
    ),
    record = result.record;
  if (!activeEvent) {
    records = result.records;
    storage.set("roadster-records", records);
  }
  if (activeEvent && complete) {
    const key = "roadster-daily-" + activeEvent.day,
      old = storage.get(key, null);
    storage.set(key, {
      time: Math.min(old?.time || Infinity, run.time),
      score: Math.max(old?.score || 0, run.score),
      passed: !!old?.passed || dailyPassed(activeEvent, run),
    });
  }
  if (tour && complete) {
    tour.stages[tour.index] = { score: run.score, time: run.time, rank };
    tour.score = tour.stages.reduce((sum, s) => sum + s.score, 0);
  }
  $("next-stage").hidden = !tour || !complete;
  $("next-stage").innerHTML =
    tour?.index === 2 ? "TOUR GARAGE " + GO_ICON : "NEXT COURSE " + GO_ICON;
  $("tour-summary").hidden = !tour;
  $("tour-summary").textContent = tour
    ? `WORLD TOUR / ${tour.stages.length} OF 3 FINISHED / ${num(tour.score)} TOTAL POINTS`
    : "";
  $("result-badges").innerHTML = ["FINISH", "NO DAMAGE", "ALL GATES"]
    .map(
      (t, i) =>
        '<span class="' +
        (records[course.id]?.badges?.[i] ? "earned" : "") +
        '">' +
        (records[course.id]?.badges?.[i] ? "◆" : "◇") +
        " " +
        t +
        "</span>",
    )
    .join("");
  if (tour && complete && tour.index === 2) {
    const old = storage.get("roadster-tour-best", 0);
    if (tour.score > old) storage.set("roadster-tour-best", tour.score);
    $("result-tip").textContent =
      `Three arenas conquered. Tour best: ${num(Math.max(old, tour.score))} points. ${completedCount(records) === 3 ? "All paint finishes are unlocked." : ""}`;
  }
  $("record-message").textContent = record
    ? "NEW PERSONAL BEST. THAT’S YOUR LINE."
    : complete
      ? `BEST CHAIN ${run.bestChain} · ${run.perfect} PERFECT GATES · ${run.airtime.toFixed(1)} SEC IN FLIGHT`
      : "A quick retry. A cleaner line.";
  if (completedCount(records) > unlockedBefore)
    $("record-message").textContent =
      PAINTS[completedCount(records)].name +
      " PAINT UNLOCKED / " +
      $("record-message").textContent;
  const newTrim = TRIMS.find(
    (t) => t.required > cupsBefore && t.required <= totalCups(),
  );
  if (newTrim)
    $("record-message").textContent =
      newTrim.name +
      " TRIM UNLOCKED / SETTINGS / " +
      $("record-message").textContent;
  if (activeEvent) {
    $("result-kicker").textContent =
      `${activeEvent.date} UTC / ${activeEvent.name}`;
    $("record-message").textContent = dailyPassed(activeEvent, run)
      ? "DAILY EVENT CLEARED / COME BACK TOMORROW"
      : activeEvent.description;
  }
  if (incomingChallenge && raceMode === "challenge" && complete) {
    const challengeResult =
      run.time < incomingChallenge.time
        ? `CHALLENGE WON / ${(incomingChallenge.time - run.time).toFixed(2)} SECONDS AHEAD`
        : `CHALLENGER FINISHED ${(run.time - incomingChallenge.time).toFixed(2)} SECONDS AHEAD`;
    $("record-message").textContent = activeEvent
      ? $("record-message").textContent + " · " + challengeResult
      : challengeResult;
  }
  if (careerRace) {
    $("result-kicker").textContent =
      `${course.name} / ${contractPassed ? (mission.mastered ? "TITLE DEFENDED" : mission.name + " SECURED") : mission.short + " / NOT YET"}`;
    if (complete) {
      const next = nextMission(career, course.id);
      $("result-tip").textContent = contractPassed
        ? next.mastered
          ? "ALL THREE CUPS WON. Take on another venue or challenge a friend."
          : `CUP WON. Next objective: ${next.title.toLowerCase()}.`
        : `${mission.title}. ${mission.clean && run.hull < 3 ? "You took damage. Keep all three condition bars intact." : "Draft behind a rival to refill thrust, then boost past."}`;
    }
  }
  $(tour && complete ? "next-stage" : "retry").focus({ preventScroll: true });
  audio.update(run, false);
}
function tick(dt) {
  if (phase !== "playing" || orientationBlocked) return;
  if (run.failed) {
    run.crashAge += dt;
    if (run.crashAge >= 0.95) endRun();
    return;
  }
  if (countdown > 0) {
    const was = countdown;
    countdown -= dt;
    if (countdown <= 0) {
      announce("RACE THE CARS · FLY OVER OR PASS", "GO", 0.8);
      audio.event("start");
    } else if (was > 0.7 && countdown <= 0.7)
      $("announcement-title").textContent = "SET";
    return;
  }
  stepRun(run, controls.read(), dt);
  coachTick(dt);
  replayClock += dt;
  if (replayClock >= 0.1) {
    replayClock = 0;
    recordFrame();
  }

  for (const e of run.events.splice(0)) {
    audio.event(e.type);
    haptic(e.type);
    if (e.type === "gate") coachGate = true;
    if (!reduced) {
      if (e.type === "rival-hit") {
        const rival = run.rivals.find((r) => r.id === e.rivalId);
        if (rival) effects.emit("hit", coast.worldPos(e.d, e.x, e.y), rival);
      } else {
        coast.emit(e.type, run);
        effects.emit(e.type, coast.worldPos(run.d, run.x, run.y), run);
      }
    }
    if (e.type === "sector") toast(`0${run.sector + 1} / ${e.text}`, "gate");
    else if (e.type === "hit") {
      impactTime = 0.45;
      toast(e.text, "hit");
    } else if (
      [
        "gate",
        "gap",
        "near",
        "pad",
        "launch",
        "stunt",
        "overtake",
        "branch",
        "draft",
        "flyover",
      ].includes(e.type)
    )
      toast(e.text, e.type, e.points);
    else if (e.type === "contact")
      toast("RIVAL CONTACT / HOLD YOUR LINE", "contact");
  }
  if (run.failed) controls.clear();
  if (run.finished) endRun();
}
function hud(force = false) {
  if (!force && clock - lastHud < 0.06) return;
  lastHud = clock;
  $("timer").textContent = formatTime(run.time);
  $("score").textContent = num(run.score);
  $("race-position").textContent = run.position || 4;
  $("draft-label").textContent =
    run.drafting > 0.1 ? "SLIPSTREAM" : run.drift > 0.25 ? "GRIP SLIDE" : "";
  const objective = missionStatus(mission, run);
  $("objective-title").textContent = activeEvent
    ? activeEvent.name
    : raceMode === "challenge"
      ? "BEAT THE GHOST"
      : mission.short;
  $("objective-detail").textContent = activeEvent
    ? activeEvent.kind === "precision"
      ? `${run.gates} / ${course.gates.length} GATES · REACH THE FINISH`
      : activeEvent.kind === "clean"
        ? `${run.hull} / 3 CONDITION · REACH THE FINISH`
        : `FINISH TOP 3 · BEAT ${formatTime(course.gold)}`
    : raceMode === "challenge"
      ? "BEAT " + formatTime(incomingChallenge.time)
      : objective.text;
  $("race-target").classList.toggle(
    "on-target",
    !activeEvent && raceMode !== "challenge" && objective.good,
  );
  const branch =
    run.branch ||
    course.branches?.find((b) => b.start > run.d && b.start - run.d < 150);
  $("branch-cue").hidden = !branch || countdown > 0 || !!run.flight;
  const branchCue = branch
    ? `${branch.side < 0 ? '<i class="ico ico-go flip" aria-hidden="true"></i>' : GO_ICON} ${branch.name.toUpperCase()} / ${run.branch ? "ALTERNATE LINE" : Math.ceil(branch.start - run.d) + " M"}`
    : "";
  if (branchCue !== lastBranchCue) $("branch-cue").innerHTML = branchCue;
  lastBranchCue = branchCue;
  $("event-objective").hidden = !activeEvent || countdown > 0;
  $("event-objective").textContent = activeEvent
    ? `${activeEvent.name} / ${activeEvent.kind === "precision" ? run.gates + " / " + course.gates.length + " GATES" : activeEvent.kind === "clean" ? run.hull + " / 3 CONDITION" : formatTime(Math.max(0, course.gold - run.time)) + " TO GOLD"}`
    : "";
  $("speed").textContent = String(
    Math.round(
      run.speed * 3.6 * (run.failed ? Math.max(0, 1 - run.crashAge / 0.7) : 1),
    ),
  ).padStart(3, "0");
  $("sector").textContent =
    `0${run.sector + 1} / ${course.sectors[run.sector]}`;
  $("distance").textContent =
    `${Math.max(0, (course.length - run.d) / 1000).toFixed(1)} KM TO GO`;
  $("progress").style.width = (run.d / course.length) * 100 + "%";
  updateRaceMap();
  $("multiplier").textContent =
    run.chain > 1 ? "×" + Math.min(run.chain, 4) : "";
  $("energy").textContent = Math.round(run.energy) + "%";
  $("energy-fill").style.width = run.energy + "%";
  $("energy-fill").style.background =
    run.energy < 23 ? "var(--orange)" : "var(--mint)";
  $("energy-note").textContent =
    run.energy < 23
      ? "LOW RESERVE · FIND A GATE"
      : run.lifting
        ? "LIFT THRUST ACTIVE"
        : run.boosting
          ? "ROCKET THRUST ACTIVE"
          : "RECHARGES ON THE ROAD";
  $("motion-label").textContent = run.failed
    ? "RUN ENDED"
    : run.flight
      ? "AUTO " + (run.stuntKind === "roll" ? "BARREL ROLL" : "BACKFLIP")
      : run.attachedRamp >= 0
        ? "SUCTION GRIP"
        : run.padTime > 0
          ? "SLINGSHOT"
          : run.boosting
            ? "FULL THRUST"
            : run.airborne
              ? "IN FLIGHT"
              : "ON THE ROAD";
  $("hull").setAttribute("aria-label", `Vehicle condition: ${run.hull} of 3`);
  $("health-value").textContent = `${run.hull} / 3 HP`;
  $("hull").dataset.low = run.hull <= 1 ? "true" : "false";
  [...$("hull").querySelectorAll("i")].forEach((el, i) =>
    el.classList.toggle("lost", i >= run.hull),
  );
  const warning = nextWarning(run);
  $("warning").hidden = !warning || countdown > 0;
  if (warning) {
    $("warning-title").textContent = warning.title;
    $("warning-detail").textContent = warning.detail;
    $("warning").dataset.kind = warning.kind;
    $("warning").querySelector(".warning-icon").innerHTML =
      warning.kind === "gap" ||
      warning.kind === "ramp" ||
      warning.kind === "stunt"
        ? GO_ICON
        : warning.title === "KEEP RIGHT"
          ? "→"
          : warning.title === "KEEP LEFT"
            ? "←"
            : "← →";
  }
  $("target-time").textContent = formatTime(
    Math.max(0, course.gold - run.time),
  );
  $("target-gates").textContent =
    Math.min(run.gates, course.goldGates) + " / " + course.goldGates + " GATES";
  $("race-target").classList.toggle("missed", run.time > course.gold);
  $("boost-fx").style.opacity =
    run.boosting && !run.failed && phase === "playing" && !reduced ? 1 : 0;
  document.querySelectorAll("[data-control]").forEach((button) => {
    const r = controls.read();
    const name = button.dataset.control;
    const held =
      name === "left" ? r.steer < 0 : name === "right" ? r.steer > 0 : r[name];
    button.classList.toggle("pressed", !!held);
  });
}
const rampNormal = new THREE.Vector3(),
  rampForward = new THREE.Vector3(),
  rampRight = new THREE.Vector3(),
  rampBasis = new THREE.Matrix4();
function updateVisuals(dt, snap = false, visual = run) {
  const hero =
    phase === "home" || (phase === "paused" && previousPhase === "home");
  advanceShowroom(dt);
  car.userData.setDetail(hero && !qualityLow);
  const x = roadX(visual.d, course) + visual.x,
    y = coast.roadY(visual.d) + Math.max(-8, visual.y);
  car.position.set(x, y, -visual.d);
  const heading = -Math.atan(roadSlope(visual.d, course));
  const flip =
    !reduced && visual.flight && visual.stuntKind === "flip"
      ? visual.stuntAngle
      : 0;
  const stuntBank =
    !reduced && visual.flight && visual.stuntKind === "roll"
      ? visual.stuntAngle
      : 0;
  const bank =
    stuntBank +
    (visual.attachedRamp < 0 && !reduced ? visual.bodyRoll || 0 : 0) -
    visual.vx * (visual.attachedRamp >= 0 ? 0.002 : 0.004) +
    (visual.rollTime > 0 && !reduced ? visual.roll : 0);
  car.rotation.set(
    visual.airborne
      ? flip +
          (visual.flight
            ? visual.flightPitch
            : clamp(visual.vy * 0.014, -0.13, 0.13))
      : Math.atan((coast.roadY(visual.d + 2) - coast.roadY(visual.d - 2)) / 4) +
          (visual.boosting ? -0.018 : 0) +
          visual.rampPitch,
    heading -
      visual.vx * (visual.attachedRamp >= 0 ? 0.003 : 0.013) +
      (visual.attachedRamp < 0 ? visual.slipAngle || 0 : 0),
    bank,
    "YXZ",
  );
  if (hero) car.rotation.y += showroomAngle;
  if (visual.attachedRamp >= 0) {
    const grade =
      (coast.roadY(visual.d + 0.2) - coast.roadY(visual.d - 0.2)) / 0.4 +
      Math.tan(visual.rampPitch);
    rampNormal.set(0, 1, grade).normalize();
    rampForward
      .set(
        roadSlope(visual.d, course) + visual.vx / Math.max(27, visual.speed),
        grade,
        -1,
      )
      .normalize();
    rampRight.crossVectors(rampForward, rampNormal).normalize();
    rampForward.crossVectors(rampNormal, rampRight).normalize().negate();
    rampBasis.makeBasis(rampRight, rampNormal, rampForward);
    car.quaternion.setFromRotationMatrix(rampBasis);
  }
  if (!hero) {
    const impact = Math.max(0, 1 - visual.crashAge / 1.05),
      jolt = Math.sin(visual.crashAge * 22) * impact;
    if (!reduced) {
      car.rotation.y += jolt * 0.28 * visual.crashDirection;
      car.rotation.z += jolt * 0.12;
      car.position.y += Math.abs(jolt) * 0.18;
    }
    if (visual.failed) {
      const t = Math.min(1, visual.crashAge / 0.95);
      if (visual.crashKind === "fall") {
        car.position.y -= t * t * 14;
        car.rotation.x -= t * 0.7;
      } else {
        car.position.x += visual.crashDirection * t * 2.6;
        car.position.z += Math.sin((t * Math.PI) / 2) * 1.8;
        car.rotation.y += visual.crashDirection * t * 1.1;
        car.rotation.z += visual.crashDirection * t * 0.22;
      }
    }
    if (!reduced && visual.attachedRamp < 0 && visual.landingAge < 0.35)
      car.position.y -= Math.sin((visual.landingAge / 0.35) * Math.PI) * 0.055;
    if (flip) car.position.y += 0.65 * (1 - Math.cos(flip));
  }
  const d = car.userData;
  d.wing.position.y = THREE.MathUtils.lerp(
    d.wing.position.y,
    visual.airborne || visual.boosting ? 0.99 : 0.49,
    snap ? 1 : 1 - Math.exp(-dt * 4),
  );
  for (const wheel of d.wheels) {
    if (wheel.spin) wheel.spin.rotation.x -= (visual.speed * dt) / 0.39;
    if (wheel.pivot && wheel.front)
      wheel.pivot.rotation.y = -(visual.steering || visual.vx * 0.025);
  }
  for (const jet of d.thrusterJets) {
    jet.visible = !visual.failed && (visual.boosting || visual.padTime > 0);
    jet.scale.z = 1.8 + Math.sin(clock * 43) * 0.25;
    jet.material.uniforms.time.value = clock;
  }
  const actuation = flightActuators(visual, car.rotation.x, car.rotation.z);
  d.actuation = actuation;
  d.flightHardware.jets.forEach((jet, i) => {
    const power = actuation.ports[i];
    jet.visible = power > 0.035;
    jet.scale.setScalar(
      jet.name.endsWith("lift") ? 0.85 + power * 1.2 : 0.6 + power * 0.9,
    );
    jet.material.uniforms.power.value = power;
    jet.material.uniforms.time.value = clock;
  });
  for (const fan of d.flightHardware.fans)
    fan.rotation.y += dt * (actuation.grip ? 95 : visual.airborne ? 12 : 30);
  car.visible = true;
  coast.update(
    visual,
    phase === "playing" || phase === "replay" ? dt : 0,
    phase === "replay" ? visual.time : clock,
  );
  if (
    ["playing", "replay"].includes(phase) ||
    (phase === "paused" && previousPhase === "playing")
  )
    rivalField.update(visual, coast, phase === "paused" ? 0 : dt);
  else rivalField.reset();
  effects.update(
    car,
    visual,
    phase === "paused" ? 0 : dt,
    phase === "playing",
    reduced,
  );
  const challenger =
    raceMode === "challenge" && incomingChallenge?.courseId === course.id;
  const samples = challenger
    ? incomingChallenge.samples
    : records[course.id]?.layout === LAYOUT_VERSION
      ? records[course.id]?.ghost
      : null;
  ghost.visible = false;
  $("ghost-delta").hidden = true;
  if (
    (ghostOn || challenger) &&
    phase === "playing" &&
    samples?.length > 1 &&
    countdown <= 0
  ) {
    while (
      ghostIndex < samples.length - 2 &&
      samples[ghostIndex + 1][0] < visual.time
    )
      ghostIndex++;
    const a = samples[ghostIndex],
      b = samples[ghostIndex + 1],
      f = clamp((visual.time - a[0]) / (b[0] - a[0] || 1), 0, 1);
    const d = a[1] + (b[1] - a[1]) * f,
      gx = a[2] + (b[2] - a[2]) * f,
      gy = a[3] + (b[3] - a[3]) * f;
    ghost.position.set(roadX(d, course) + gx, coast.roadY(d) + gy, -d);
    ghost.rotation.y = -Math.atan(roadSlope(d, course));
    ghost.visible =
      Math.abs(d - visual.d) < 220 &&
      visual.time < samples[samples.length - 1][0];
    ghost.userData.setProximity(Math.hypot(d - visual.d, gx - visual.x));
    $("ghost-delta").hidden = false;
    $("ghost-delta").textContent =
      (challenger ? "CHALLENGER GHOST / " : "PERSONAL GHOST / ") +
      (visual.d >= d ? "AHEAD " : "BEHIND ") +
      Math.abs(visual.d - d).toFixed(0) +
      " M";
  }

  if (hero) {
    camera.fov = innerHeight < 600 ? 39 : 36;
    camera.setViewOffset(
      innerWidth,
      innerHeight,
      -innerWidth * (innerHeight < 600 ? 0.17 : 0.12),
      0,
      innerWidth,
      innerHeight,
    );
    camera.position.set(
      x + Math.sin(Math.PI / 4) * 8.5 + Math.sin(clock * 0.11) * 0.2,
      y + 2.3,
      -visual.d - Math.cos(Math.PI / 4) * 8.5,
    );
    camera.lookAt(x, y + 0.38, -visual.d + 0.2);
  } else if (phase === "replay") {
    camera.clearViewOffset();
    const orbit = reduced
      ? 0.45
      : 0.6 + Math.sin((film?.elapsed || 0) * 0.23) * 0.45;
    camera.fov = 52;
    cameraGoal.set(
      x + Math.sin(orbit) * 10,
      y + 2.8,
      -visual.d + Math.cos(orbit) * 10,
    );
    if (snap) camera.position.copy(cameraGoal);
    else camera.position.lerp(cameraGoal, 1 - Math.exp(-dt * 7));
    camera.lookAt(x, y + 0.65, -visual.d - 1);
  } else {
    camera.clearViewOffset();
    const targetFov = reduced
      ? 63
      : visual.padTime > 0
        ? 76
        : visual.boosting
          ? 72
          : 63;
    camera.fov = THREE.MathUtils.lerp(
      camera.fov,
      targetFov,
      snap ? 1 : 1 - Math.exp(-dt * 3),
    );
    cameraGoal.set(
      roadX(visual.d - 10, course) + visual.x * 0.72,
      y + 3.5 - Math.min(visual.y, 6) * 0.15,
      -visual.d + (visual.flight ? 11.5 : 8.7),
    );
    if (!reduced) {
      cameraGoal.y += Math.sin(clock * 19) * 0.014 * (visual.boosting ? 2 : 1);
      cameraGoal.x += impactTime * Math.sin(clock * 70) * 0.2;
    }
    if (snap) camera.position.copy(cameraGoal);
    else camera.position.lerp(cameraGoal, 1 - Math.exp(-dt * 8));
    cameraTarget.set(
      roadX(visual.d + 30, course) + visual.x * 0.64,
      coast.roadY(visual.d + 30) + 1.3 + visual.y * 0.92,
      -visual.d - 30,
    );
    camera.lookAt(cameraTarget);
  }
  camera.updateProjectionMatrix();
}
function applyQuality() {
  frameBudget.reset();
  qualityLow =
    quality === "low" || (quality === "auto" && (coarse() || innerWidth < 900));
  renderer.setPixelRatio(
    Math.min(devicePixelRatio || 1, qualityLow ? 1.25 : 1.75),
  );
  coast?.setQuality(qualityLow);
  car.userData.setDetail(!qualityLow && phase === "home");
  $("quality").querySelector("b").textContent = quality.toUpperCase();
  storage.set("breakwater-quality", quality);
}
function resize() {
  const blocked = requiresLandscape(innerWidth, innerHeight, coarse());
  if (blocked && !orientationBlocked && phase === "playing") pause();
  if (blocked && !orientationBlocked && phase === "replay") {
    cancelClip();
    $("clip-status").textContent = "Turn sideways to continue the replay.";
  }
  orientationBlocked = blocked;
  $("rotate").hidden = !blocked;
  $("app").inert = loading.state.active;
  for (const id of [
    "home",
    "hud",
    "menu",
    "results",
    "masthead",
    "replay-view",
  ])
    $(id).inert = blocked;
  if (blocked) controls?.clear();
  if (renderer) {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    if (quality === "auto") applyQuality();
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  const frameSeconds = Math.max(0, (now - lastTime) / 1000);
  const dt = Math.min(0.05, frameSeconds);
  lastTime = now;
  if (!initialized || document.hidden || orientationBlocked) return;
  if (phase === "playing" || phase === "paused") controls.poll();
  if (!frozen) {
    clock += dt;
    tick(dt);
    toastTime = Math.max(0, toastTime - dt);
    announcementTime = Math.max(0, announcementTime - dt);
    impactTime = Math.max(0, impactTime - dt);
    if (!toastTime) $("event").textContent = "";
    if (!announcementTime) {
      $("announcement-small").textContent = "";
      $("announcement-title").textContent = "";
    }
    if (phase === "replay") advanceFilm(dt);
    else {
      updateVisuals(dt);
      hud();
    }
  }
  $("impact").style.opacity = impactTime / 0.9;
  audio.update(
    run,
    phase === "playing" &&
      !run.failed &&
      !orientationBlocked &&
      countdown <= 0 &&
      !frozen,
  );
  renderDebt += frameSeconds;
  perfStats.seconds += frameSeconds;
  if (saver && !frozen && renderDebt < 1 / 30 - 0.004) return;
  renderDebt = 0;
  renderer.render(scene, camera);
  if (clip && phase === "replay") clip.draw(film?.elapsed || 0);
  if (perf) {
    perfStats.frames++;
    if (perfStats.seconds >= 0.5) {
      const info = renderer.info.render;
      $("perf").textContent =
        `${(perfStats.frames / perfStats.seconds).toFixed(0)} FPS · ` +
        `${((perfStats.seconds / perfStats.frames) * 1000).toFixed(1)} MS · ` +
        `PR ${renderer.getPixelRatio().toFixed(2)} · ${info.calls} CALLS · ` +
        `${(info.triangles / 1000).toFixed(0)}K TRIS · ${quality.toUpperCase()}` +
        `${qualityLow ? " LOW" : ""}${saver ? " · SAVER" : ""} · ` +
        `${innerWidth}×${innerHeight} @${devicePixelRatio}`;
      perfStats.frames = perfStats.seconds = 0;
    }
  }
  if (quality === "auto" && !frozen && !saver && phase === "playing") {
    const ceiling = Math.min(devicePixelRatio || 1, qualityLow ? 1.25 : 1.75);
    const ratio = frameBudget.sample(
      frameSeconds,
      renderer.getPixelRatio(),
      ceiling,
    );
    if (ratio !== renderer.getPixelRatio()) renderer.setPixelRatio(ratio);
  }
}
function saveCard() {
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 630;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#102b34";
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = "#ff8255";
  ctx.fillRect(0, 0, 18, 630);
  ctx.font = "600 26px Barlow";
  ctx.fillText("ROADSTER / " + course.name, 65, 65);
  ctx.font = "600 102px Barlow";
  ctx.fillStyle = "#f6f1df";
  ctx.fillText(run.finished ? "COURSE COMPLETE." : "ONE MORE RUN.", 65, 195);
  ctx.font = "600 190px Barlow";
  ctx.fillText(num(run.score), 65, 380);
  ctx.font = "600 35px Barlow";
  ctx.fillStyle = "#9cffe5";
  ctx.fillText(
    `${formatTime(run.time)}  /  ${run.gates} GATES  /  ${run.finished ? rankRun(run) : "NEXT TIME"}`,
    65,
    465,
  );
  ctx.fillStyle = "#ff8255";
  ctx.fillRect(65, 530, 1070, 3);
  ctx.font = "400 18px Plex";
  ctx.fillText("THE ROAD ENDS. YOUR RUN DOESN’T.", 65, 583);
  c.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = course.id + "-" + Math.round(run.score) + ".png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  });
}
let initializedAt = 0,
  initialVenueCount = 0;
const nextPaint = () =>
  new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      resolve();
    };
    const timer = setTimeout(finish, 80),
      raf = requestAnimationFrame(finish);
  });
function ensureVenue(id) {
  if (venues.has(id)) return venues.get(id);
  const current = coast,
    venue = createCoast(scene, renderer, getCourse(id));
  venue.root.visible = false;
  venues.set(id, venue);
  if (current) current.activate();
  return venue;
}
async function loadVenue(id) {
  const ticket = ++venueRequest;
  document.body.dataset.preparing = "true";
  showroomTurn = null;
  loading.begin(getCourse(id).name, "venue");
  loading.update(
    60,
    "Building the venue",
    "Creating terrain, scenery and the racing surface.",
    2,
  );
  await nextPaint();
  if (ticket !== venueRequest) return false;
  try {
    ensureVenue(id);
    loading.update(
      82,
      "Preparing lighting",
      "Warming the graphics for your first frame.",
      3,
    );
    await nextPaint();
    if (ticket !== venueRequest) return false;
    if (!selectCourse(id, true)) return false;
    updateVisuals(0, true);
    await renderer.compileAsync(scene, camera);
    if (ticket !== venueRequest) return false;
    renderer.render(scene, camera);
    loading.complete();
    return true;
  } catch (e) {
    console.error(e);
    if (ticket === venueRequest)
      showError("This venue could not load. Reload to try again.");
    return false;
  } finally {
    if (ticket === venueRequest) {
      document.body.dataset.preparing = "false";
      if (loading.state.active) loading.cancel();
    }
  }
}
const failedPreparations = new Set();
function queueVenuePreparation() {
  const pending = COURSES.find(
    (c) => !venues.has(c.id) && !failedPreparations.has(c.id),
  );
  if (!pending) return;
  setTimeout(async () => {
    if (
      !["home", "results"].includes(phase) ||
      document.body.dataset.preparing === "true" ||
      orientationBlocked ||
      document.hidden
    ) {
      queueVenuePreparation();
      return;
    }
    await nextPaint();
    if (
      !["home", "results"].includes(phase) ||
      document.body.dataset.preparing === "true"
    ) {
      queueVenuePreparation();
      return;
    }
    // Build each remaining world only while out of a race. Warm into a small
    // target with its own lighting, then restore the visible scene unchanged.
    const current = coast;
    let world, target;
    try {
      world = ensureVenue(pending.id);
      current.root.visible = false;
      world.activate();
      world.setQuality(qualityLow);
      world.update({ ...createRun(pending), d: 80 }, 0, clock);
      target = new THREE.WebGLRenderTarget(320, 180);
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
    } catch (e) {
      failedPreparations.add(pending.id);
      console.warn("Background venue preparation deferred", pending.id);
    } finally {
      renderer.setRenderTarget(null);
      target?.dispose();
      if (world) world.root.visible = false;
      current.activate();
    }
    queueVenuePreparation();
  }, 1200);
}
function recordFrame() {
  const p = [
    +run.time.toFixed(3),
    +run.d.toFixed(2),
    +run.x.toFixed(2),
    +run.y.toFixed(2),
    run.speed,
    run.rampPitch,
    run.flightPitch,
    run.stuntAngle,
    run.stuntKind === "roll" ? 2 : run.stuntKind === "flip" ? 1 : 0,
    run.vx,
    run.landingAge,
    run.liftAcceleration,
    run.flight?.angularAcceleration || 0,
    Number(run.boosting),
    run.attachedRamp,
  ];
  p.push(
    Number(!!run.flight),
    Number(run.airborne),
    Number(run.lifting),
    run.steering || 0,
    run.bodyRoll || 0,
    run.slipAngle || 0,
  );
  for (const r of run.rivals || [])
    p.push(
      r.d,
      r.x,
      r.y,
      r.speed,
      r.flightPitch || 0,
      r.rampPitch || 0,
      r.stuntAngle || 0,
      r.stuntKind === "roll" ? 2 : r.stuntKind === "flip" ? 1 : 0,
      Number(r.airborne),
      Number(r.lifting),
      Number(!!r.flight),
      r.bodyRoll || 0,
      r.slipAngle || 0,
      r.time,
    );
  // Append manual-flight channels after the fixed player/rival layout so
  // shared ghost coordinates and existing rival offsets remain unchanged.
  p.push(run.vy, run.rollTime, run.roll, run.rollAcceleration || 0);
  if (replay.at(-1)?.[0] === p[0]) replay[replay.length - 1] = p;
  else replay.push(p);
  // Bounded capture: 10Hz for ten minutes, well beyond every authored race.
  if (replay.length > 6001) replay.splice(1, 1);
}
async function startDaily() {
  const event = dailyEvent();
  activeEvent = event;
  raceMode = "daily";
  tour = null;
  const ready = await selectCourse(event.courseId);
  if (
    ready &&
    activeEvent === event &&
    raceMode === "daily" &&
    course.id === event.courseId
  )
    start();
}
function startFilm(record = false) {
  if (replay.length < 3 || orientationBlocked) return;
  cancelClip();
  const end = replay.at(-1)[0],
    start = Math.max(replay[0][0], end - 10);
  film = { start, end, elapsed: 0, cursor: 0, recording: record };
  setPhase("replay");
  effects.reset();
  $("replay-title").textContent =
    course.name + " / " + (run.finished ? "FINISH FILM" : "LAST ATTEMPT");
  $("save-clip").disabled = !clipSupported();
  $("clip-status").textContent = clipSupported()
    ? "Replay locally. Save a silent clip to share."
    : "Replay available. This browser does not support clip recording.";
  $("exit-replay").focus({ preventScroll: true });
  advanceFilm(0, true);
}
function advanceFilm(dt, snap = false) {
  if (!film) return;
  film.elapsed += dt;
  const duration = film.end - film.start;
  if (film.elapsed > duration) {
    if (clip) {
      clip.stop();
      clip = null;
      film.recording = false;
      $("save-clip").disabled = false;
    }
    film.elapsed = 0;
    film.cursor = 0;
    effects.reset();
  }
  const pose = sampleReplay(replay, film.start + film.elapsed, film.cursor);
  film.cursor = pose.cursor;
  const p = pose.values,
    nearest = replay[pose.cursor],
    next = replay[Math.min(pose.cursor + 1, replay.length - 1)],
    f = Math.max(
      0,
      Math.min(1, (p[0] - nearest[0]) / (next[0] - nearest[0] || 1)),
    );
  if (nearest[15] && !next[15])
    p[7] =
      nearest[7] + (Math.sign(nearest[7] || 1) * Math.PI * 2 - nearest[7]) * f;
  const manual = 21 + (run.rivals?.length || 0) * 14;
  if (nearest[manual + 1] > 0 && !(next[manual + 1] > 0))
    p[manual + 2] =
      nearest[manual + 2] +
      (Math.sign(nearest[manual + 2] || 1) * Math.PI * 2 -
        nearest[manual + 2]) *
        f;
  const visual = {
    ...run,
    time: p[0],
    d: p[1],
    x: p[2],
    y: p[3],
    speed: p[4],
    rampPitch: p[5],
    flightPitch: p[6],
    stuntAngle: p[7],
    stuntKind: nearest[8] === 2 ? "roll" : "flip",
    vx: p[9],
    landingAge: p[10],
    liftAcceleration: p[11],
    boosting: nearest[13] > 0.5,
    attachedRamp: nearest[14],
    airborne: !!nearest[16],
    lifting: !!nearest[17],
    steering: p[18] || 0,
    failed: false,
    finished: false,
    crashAge: 10,
    vy: p[manual] || 0,
    rollTime: p[manual + 1] || 0,
    roll: p[manual + 2] || 0,
    rollAcceleration: p[manual + 3] || 0,
    slipAngle: p[20] || 0,
    bodyRoll: p[19] || 0,
    processed: new Set(),
    flight: nearest[15] ? { angularAcceleration: p[12] } : null,
  };
  visual.rivals = (run.rivals || []).map((r, i) => {
    const o = 21 + i * 14;
    let angle = p[o + 6] || 0;
    if (nearest[o + 10] && !next[o + 10])
      angle =
        nearest[o + 6] +
        (Math.sign(nearest[o + 6] || 1) * Math.PI * 2 - nearest[o + 6]) * f;
    return {
      ...r,
      d: p[o] ?? r.d,
      x: p[o + 1] ?? r.x,
      y: p[o + 2] ?? r.y,
      speed: p[o + 3] ?? r.speed,
      flightPitch: p[o + 4] || 0,
      rampPitch: p[o + 5] || 0,
      stuntAngle: angle,
      stuntKind: nearest[o + 7] === 2 ? "roll" : "flip",
      airborne: !!nearest[o + 8],
      lifting: !!nearest[o + 9],
      flight: nearest[o + 10] ? {} : null,
      bodyRoll: p[o + 11] || 0,
      slipAngle: p[o + 12] || 0,
      time: p[o + 13] || p[0],
      exitDistance: 0,
      failed: false,
      finished: false,
    };
  });
  updateVisuals(dt, snap, visual);
  $("replay-clock").textContent =
    formatTime(visual.time) + " / " + formatTime(film.end);
}
function cancelClip() {
  if (clip) {
    clip.cancel();
    clip = null;
  }
  if (film) film.recording = false;
  $("save-clip").disabled = !clipSupported();
}
function stopFilm() {
  cancelClip();
  film = null;
  effects.reset();
  setPhase("results");
  updateVisuals(0, true);
  $("watch-replay").focus({ preventScroll: true });
}
function recordClip() {
  if (clip) return;
  startFilm(true);
  try {
    clip = createClip(
      $("scene"),
      course.name,
      (blob, ext) => {
        if (clipUrl) URL.revokeObjectURL(clipUrl);
        clipUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = clipUrl;
        a.download = `roadster-${course.id}.${ext}`;
        a.click();
        const url = clipUrl;
        setTimeout(() => {
          URL.revokeObjectURL(url);
          if (clipUrl === url) clipUrl = null;
        }, 60000);
        $("clip-status").textContent = "CLIP SAVED / READY TO SHARE";
        $("save-clip").disabled = false;
      },
      (message) => {
        $("clip-status").textContent = message;
        $("save-clip").disabled = false;
        clip = null;
      },
    );
    $("clip-status").textContent = "RECORDING / KEEP THIS TAB OPEN";
    $("save-clip").disabled = true;
  } catch (e) {
    $("clip-status").textContent = e.message;
    film.recording = false;
  }
}
async function openIncomingChallenge() {
  const code = new URLSearchParams(location.hash.slice(1)).get("race");
  try {
    incomingChallenge = code ? decodeChallenge(code) : null;
    challengeError = "";
  } catch (e) {
    incomingChallenge = null;
    challengeError = e.message;
  }
  home();
  await selectCourse(incomingChallenge?.courseId || course.id);
}
function shareChallenge() {
  try {
    const code = encodeChallenge({
      courseId: course.id,
      samples: replay,
      time: run.time,
      score: run.score,
      day: activeEvent?.day ?? null,
    });
    const url = new URL(location.href);
    url.search = "";
    url.hash = "race=" + code;
    $("challenge-url").value = url.href;
    $("challenge-share").hidden = false;
    $("share-status").textContent =
      "Your ghost and time travel in this link. No sign-in needed.";
    $("copy-challenge").focus();
  } catch (e) {
    $("record-message").textContent = e.message;
  }
}
async function copyChallenge() {
  try {
    await navigator.clipboard.writeText($("challenge-url").value);
    $("share-status").textContent = "LINK COPIED / SEND IT TO A FRIEND";
  } catch {
    const input = $("challenge-url");
    input.focus();
    input.select();
    $("share-status").textContent = "Select and copy the link above.";
  }
}

async function boot() {
  try {
    loading.begin(course.name);
    await nextPaint();
    await document.fonts.ready;
    loading.update(
      3,
      "Starting graphics",
      "Checking this device and preparing the renderer.",
      0,
    );
    await nextPaint();
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(
      63,
      innerWidth / innerHeight,
      0.15,
      12000,
    );
    renderer = new THREE.WebGLRenderer({
      canvas: $("scene"),
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    await loadVisualAssets(renderer, (value) => {
      loading.update(
        5 + value * 48,
        "Loading surfaces",
        `${Math.round(value * 100)}% of surface assets prepared.`,
        0,
      );
    });
    loading.update(
      55,
      "Assembling the Roadster",
      "Bodywork, wheels and flight equipment.",
      1,
    );
    await nextPaint();
    car = createCar();
    effects = createRaceEffects(scene);
    rivalField = createRivalField(scene);
    scene.add(car);
    car.userData.interior.visible = false;
    car.userData.setDetail(!qualityLow && phase === "home");
    ghost = createGhost(car);
    scene.add(ghost);
    ghost.visible = false;

    audio = createSound();
    controls = createControls(
      window,
      (action) => {
        if (action === "pause") {
          if (phase === "replay") stopFilm();
          else if (phase === "playing") pause();
          else if (phase === "paused") resume();
        } else if (
          action === "retry" &&
          (phase === "playing" ||
            phase === "results" ||
            (phase === "paused" && previousPhase === "playing"))
        )
          start();
      },
      () => phase === "playing" && !orientationBlocked,
    );
    document
      .querySelectorAll("[data-control]")
      .forEach((button) => controls.bind(button, button.dataset.control));
    $("start").onclick = () => {
      activeEvent =
        incomingChallenge?.courseId === course.id
          ? incomingChallenge.event
          : null;
      raceMode =
        incomingChallenge?.courseId === course.id ? "challenge" : "race";
      tour = null;
      start();
    };
    $("start-tour").onclick = beginTour;
    $("start-daily").onclick = startDaily;
    $("daily-name").innerHTML = todayEvent.name + " " + GO_ICON;
    $("start-daily").title = todayEvent.description + " Resets at 00:00 UTC.";
    $("watch-replay").onclick = () => startFilm();
    $("exit-replay").onclick = stopFilm;
    $("save-clip").onclick = recordClip;
    $("share-challenge").onclick = shareChallenge;
    $("copy-challenge").onclick = copyChallenge;
    $("close-challenge").onclick = () => {
      $("challenge-share").hidden = true;
      $("share-challenge").focus();
    };
    $("next-stage").onclick = nextStage;
    document.querySelectorAll("button[data-course]").forEach(
      (b) =>
        (b.onclick = () => {
          tour = null;
          selectCourse(b.dataset.course);
        }),
    );
    $("paint").onclick = () => {
      paintIndex = (paintIndex + 1) % (completedCount(records) + 1);
      storage.set("roadster-paint", paintIndex);
      refreshBest();
      turnShowroom(Math.PI * 2, 5.2);
    };
    $("ghost").onclick = () => {
      ghostOn = !ghostOn;
      storage.set("roadster-ghost", ghostOn);
      refreshBest();
    };
    $("pause").onclick = pause;
    $("settings").onclick = settings;
    $("resume").onclick = resume;
    $("restart").onclick = start;
    $("retry").onclick = start;
    $("go-home").onclick = home;
    $("result-home").onclick = home;
    $("share").onclick = saveCard;
    $("sound").onclick = () => {
      soundOn = !soundOn;
      audio.init();
      audio.setEnabled(soundOn);
      storage.set("breakwater-sound", soundOn);
      $("sound").querySelector("b").textContent = soundOn ? "ON" : "OFF";
    };
    const browseVenue = (direction) => {
      if (phase !== "home" || orientationBlocked) return;
      tour = null;
      const index = COURSES.findIndex((c) => c.id === course.id);
      selectCourse(
        COURSES[(index + direction + COURSES.length) % COURSES.length].id,
      );
    };
    $("venue-prev").onclick = () => browseVenue(-1);
    $("venue-next").onclick = () => browseVenue(1);
    window.addEventListener("keydown", (e) => {
      if (phase !== "home" || e.repeat || e.altKey || e.ctrlKey || e.metaKey)
        return;
      if (
        (e.code === "ArrowLeft" || e.code === "ArrowRight") &&
        (e.target?.tagName !== "BUTTON" || e.target.closest("#course-select"))
      ) {
        e.preventDefault();
        browseVenue(e.code === "ArrowLeft" ? -1 : 1);
      }
      if (e.code === "Enter" && e.target?.tagName !== "BUTTON") {
        e.preventDefault();
        $("start").click();
      }
    });
    $("orbit-car").onclick = () => {
      turnShowroom(Math.PI / 2, 1.1);
      updateVisuals(0, true);
    };
    let orbitPointer = null;
    $("scene").addEventListener("pointerdown", (e) => {
      if (phase !== "home") return;
      showroomTurn = null;
      orbitPointer = { id: e.pointerId, x: e.clientX };
      try {
        $("scene").setPointerCapture?.(e.pointerId);
      } catch {
        /* Synthetic QA pointers have no native capture. */
      }
    });
    $("scene").addEventListener("pointermove", (e) => {
      if (phase !== "home" || orbitPointer?.id !== e.pointerId) return;
      showroomAngle += (e.clientX - orbitPointer.x) * 0.007;
      orbitPointer.x = e.clientX;
      updateVisuals(0, true);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      $("scene").addEventListener(type, () => (orbitPointer = null));
    $("quality").onclick = () => {
      quality =
        quality === "auto" ? "high" : quality === "high" ? "low" : "auto";
      applyQuality();
    };
    $("motion").onclick = () => {
      reduced = !reduced;
      if (reduced) showroomTurn = null;
      storage.set("breakwater-reduced", reduced);
      $("motion").querySelector("b").textContent = reduced ? "REDUCED" : "FULL";
    };
    $("saver").onclick = () => {
      saver = !saver;
      renderDebt = 0;
      frameBudget.reset();
      storage.set("breakwater-saver", saver);
      $("saver").querySelector("b").textContent = saver ? "30 FPS" : "OFF";
    };
    $("saver").querySelector("b").textContent = saver ? "30 FPS" : "OFF";
    $("trim").onclick = () => {
      const unlocked = TRIMS.filter((t) => t.required <= totalCups()).length;
      trimIndex = (trimIndex + 1) % unlocked;
      storage.set("roadster-trim", trimIndex);
      refreshBest();
    };
    $("perf").hidden = !perf;
    $("install-hint").onclick = () => {
      storage.set("roadster-install-hint", true);
      $("install-hint").hidden = true;
    };
    refreshInstallHint();
    $("fullscreen").onclick = async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (document.documentElement.requestFullscreen)
          await document.documentElement.requestFullscreen();
        else $("fullscreen").querySelector("b").textContent = "UNAVAILABLE";
      } catch {
        $("fullscreen").querySelector("b").textContent = "UNAVAILABLE";
      }
    };
    $("sound").querySelector("b").textContent = soundOn ? "ON" : "OFF";
    $("motion").querySelector("b").textContent = reduced ? "REDUCED" : "FULL";
    window.addEventListener("hashchange", openIncomingChallenge);
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", () => {
      controls.clear();
      resize();
    });
    window.addEventListener("blur", () => {
      controls.clear();
      pause();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        controls.clear();
        pause();
        if (clip) {
          cancelClip();
          $("clip-status").textContent =
            "Recording cancelled because the page was hidden.";
        }
      }
    });
    window.addEventListener("pagehide", () => controls.clear());
    document.addEventListener("contextmenu", (e) => {
      if (e.target?.id !== "challenge-url") e.preventDefault();
    });
    document.addEventListener("selectstart", (e) => {
      if (e.target?.id !== "challenge-url") e.preventDefault();
    });
    $("scene").addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      pause();
      showError(
        "The graphics connection was interrupted. Reload to start a new crossing.",
      );
    });
    const selectedId = course.id;
    loading.update(
      65,
      "Building the venue",
      "Creating terrain, scenery and the racing surface.",
      2,
    );
    await nextPaint();
    ensureVenue(selectedId);
    initialized = true;
    selectCourse(selectedId, true);
    home(true);
    applyQuality();
    resize();
    updateVisuals(0, true);
    loading.update(
      85,
      "Preparing lighting",
      "Warming the graphics for your first frame.",
      3,
    );
    await nextPaint();
    await renderer.compileAsync(scene, camera);
    loading.update(96, "Opening the garage", "Rendering your first view.", 3);
    await nextPaint();
    renderer.render(scene, camera);
    loading.complete();
    initializedAt = performance.now();
    initialVenueCount = venues.size;
    queueVenuePreparation();
    if (qa)
      window.__breakwater = {
        get showroom() {
          return {
            angle: showroomAngle,
            autoRotating: !!showroomTurn,
            paintIndex,
            paintName: PAINTS[paintIndex].name,
          };
        },
        get loadingState() {
          return loading.state;
        },
        start,
        startDaily,
        startFilm,
        stopFilm,
        shareChallenge,
        get replaySamples() {
          return replay;
        },
        get raceMode() {
          return raceMode;
        },
        get activeEvent() {
          return activeEvent;
        },
        get firstReadyAt() {
          return initializedAt;
        },
        get initialVenueCount() {
          return initialVenueCount;
        },
        prepareVenues: async () => {
          for (const c of COURSES) {
            await nextPaint();
            ensureVenue(c.id);
          }
        },
        selectCourse,
        beginTour,
        get trim() {
          return TRIMS[trimIndex].id;
        },
        get saver() {
          return saver;
        },
        get coach() {
          return $("coach").hidden ? null : $("coach-text").textContent;
        },
        set coached(value) {
          coached = !!value;
        },
        nextStage,
        get course() {
          return course;
        },
        get tour() {
          return tour;
        },
        get records() {
          return records;
        },
        get career() {
          return { ...career };
        },
        get mission() {
          return { ...mission };
        },
        get ghostAppearance() {
          return {
            enabled: ghostOn,
            name: ghost.name,
            visible: ghost.visible,
            draws: ghost.children.length,
            shadows: ghost.children.some((n) => n.castShadow),
          };
        },
        get rivalAppearance() {
          return {
            visible: rivalField.visibleCount,
            batches: rivalField.batchCount,
            labels: rivalField.root.children
              .filter((child) => child.isSprite && child.visible)
              .map((child) => child.name),
          };
        },
        get trailHistory() {
          return effects.trails;
        },
        get carPose() {
          car.updateMatrixWorld(true);
          const ramp =
            run.attachedRamp >= 0 ? course.ramps[run.attachedRamp] : null;
          let clearance = Infinity;
          if (ramp)
            for (const x of [-1.05, 1.05])
              for (const z of [-2.25, -1.48, 1.48, 2.25]) {
                const p = car.localToWorld(
                    new THREE.Vector3(x, Math.abs(z) > 2 ? 0.17 : 0, z),
                  ),
                  d = -p.z;
                if (d >= ramp.d - ramp.length && d <= ramp.d)
                  clearance = Math.min(
                    clearance,
                    p.y - coast.roadY(d) - rampSurface(ramp, d).height - 0.025,
                  );
              }
          return {
            rampClearance: clearance,

            position: car.position.toArray(),
            rotation: [car.rotation.x, car.rotation.y, car.rotation.z],
            visible: car.visible,
            actuation: car.userData.actuation,
            ports: car.userData.flightHardware.jets.map((j) => ({
              name: j.name,
              visible: j.visible,
            })),
          };
        },
        get preparedVenues() {
          return venues.size;
        },
        get memory() {
          return { ...renderer.info.memory };
        },
        pause,
        resume,
        home,
        get state() {
          return run;
        },
        get phase() {
          return phase;
        },
        get blocked() {
          return orientationBlocked;
        },
        get input() {
          return controls.read();
        },
        get triangles() {
          return renderer.info.render.triangles;
        },
        get pixelRatio() {
          return renderer.getPixelRatio();
        },
        get drawCalls() {
          return renderer.info.render.calls;
        },
        freeze(value = true) {
          frozen = value;
        },
        step(dt) {
          clock += dt;
          if (phase === "replay") advanceFilm(dt);
          else {
            tick(dt);
            updateVisuals(dt, true);
            hud(true);
          }
          renderer.render(scene, camera);
          if (clip && phase === "replay") clip.draw(film?.elapsed || 0);
        },
        setState(patch) {
          Object.assign(run, patch);
          countdown = 0;
          announcementTime = 0;
          $("announcement-small").textContent = "";
          $("announcement-title").textContent = "";
          updateVisuals(0, true);
          hud(true);
        },
        clear: () => controls.clear(),
        get countdown() {
          return countdown;
        },
      };
    requestAnimationFrame(frame);
  } catch (e) {
    console.error(e);
    showError(
      "This browser couldn’t start WebGL. Try a current browser with hardware acceleration enabled.",
    );
  }
}
$("reload").onclick = () => location.reload();
$("loading-retry").onclick = () => location.reload();
boot();

// Offline shell for installed/hosted play. Skipped for file://, QA runs and
// local development unless ?pwa is present, so dev servers are never cached.
if (
  "serviceWorker" in navigator &&
  /^https?:$/.test(location.protocol) &&
  !qa &&
  (new URLSearchParams(location.search).has("pwa") ||
    !/^(localhost|127\.0\.0\.1)$/.test(location.hostname))
)
  addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
