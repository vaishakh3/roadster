import * as THREE from "./vendor/three.module.js";
import { createRaceEffects } from "./effects.js";
import { rampSurface } from "./stunts.js";
import { FrameBudget } from "./quality.js";
import { flightActuators } from "./propulsion.js";
import { createCar } from "./car.js";
import { loadVisualAssets } from "./surfaces.js";
import {
  COURSES,
  getCourse,
  PAINTS,
  completedCount,
  saveResult,
  LAYOUT_VERSION,
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
let course = getCourse(storage.get("roadster-course", "breakwater"));
let records = storage.get("roadster-records", {});
if (!records || typeof records !== "object" || Array.isArray(records))
  records = {};
let paintIndex = storage.get("roadster-paint", 0);
let ghostOn = storage.get("roadster-ghost", true),
  ghost,
  ghostIndex = 0,
  replay = [],
  replayClock = 0;
let tour = null;
let phase = "home",
  previousPhase = "home",
  orientationBlocked = false,
  run = createRun(course);
let renderer, scene, camera, car, coast, controls, audio, effects;
const venues = new Map();
let showroomAngle = 0;
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
  phase = value;
  document.body.dataset.phase = value;
  $("home").hidden = value !== "home";
  $("hud").hidden = value !== "playing";
  $("menu").hidden = value !== "paused";
  $("results").hidden = value !== "results";
  controls?.clear();
}
function showError(message) {
  $("loading").hidden = true;
  $("error").hidden = false;
  $("error-message").textContent = message;
  setPhase("error");
}
function announce(small, title, duration = 2) {
  $("announcement-small").textContent = small;
  $("announcement-title").textContent = title;
  announcementTime = duration;
}
function toast(text, type = "gate", points = 0) {
  $("event").textContent = text + (points ? " +" + num(points) : "");
  $("event").style.color = type === "hit" ? "var(--orange)" : "var(--mint)";
  toastTime = 1.5;
}
function start() {
  if (!initialized || orientationBlocked) return;
  if (tour) {
    tour.stages = tour.stages.slice(0, tour.index);
    tour.score = tour.stages.reduce((sum, s) => sum + s.score, 0);
  }
  run = createRun(course);
  effects.reset();
  coast.reset();
  replay = [];
  replayClock = 0;
  ghostIndex = 0;
  countdown = 1.5;
  toastTime = impactTime = 0;
  $("event").textContent = "";
  setPhase("playing");
  audio.init();
  audio.setEnabled(soundOn);
  audio.event("start");
  announce("AUTO-DRIVE IS ON · YOU STEER", "READY", 1.5);
  camera.clearViewOffset();
  updateVisuals(0, true);
  hud(true);
  $("scene").focus({ preventScroll: true });
}
function pause() {
  if (phase !== "playing") return;
  previousPhase = "playing";
  setPhase("paused");
  $("menu-title").textContent = "ON HOLD.";
  $("menu-kicker").textContent = "TAKE A BREATH.";
  $("resume").innerHTML = "BACK TO THE RUN <b>↗</b>";
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
  $("resume").innerHTML = "BACK TO START <b>↗</b>";
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
function home() {
  tour = null;
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
function selectCourse(id) {
  if (phase !== "home" && phase !== "results") return;
  course = getCourse(id);
  showroomAngle = 0;
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
  $("venue-index").textContent = course.number + " / 03";
  $("course-location").textContent = course.number + " / " + course.location;
  $("course-description").textContent = course.subtitle;
  $("route-meta").textContent =
    (course.length / 1000).toFixed(1) + " KM / " + course.difficulty;
  $("route-tags").textContent = course.tags;
  $("course-brief").textContent = course.description;
  $("course-gold").textContent =
    "GOLD / " + formatTime(course.gold) + " + " + course.goldGates + " GATES";
  $("destination").textContent = course.name + " ↗";
  document.querySelectorAll("[data-course]").forEach((b) => {
    if (b.tagName === "BUTTON") {
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
  const percent = Math.min(100, Math.floor((run.d / course.length) * 100));
  $("map-percent").textContent = percent + "%";
  $("race-map").setAttribute(
    "aria-label",
    `${course.name} route, ${percent}% complete, ${Math.max(0, course.length - run.d).toFixed(0)} metres remaining. Mint dots mark stunt ramps.`,
  );
}
function refreshBest() {
  const best = records[course.id];
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
    total +
    " / 3 COURSES COMPLETED" +
    (storage.get("roadster-tour-best", 0)
      ? " / TOUR BEST " + num(storage.get("roadster-tour-best", 0))
      : "");
  if (!PAINTS[paintIndex] || PAINTS[paintIndex].required > total)
    paintIndex = 0;
  car?.userData.paintMaterial.color.setHex(PAINTS[paintIndex].color);
  $("paint-name").textContent = PAINTS[paintIndex].name;
  $("paint").disabled = total === 0;
  $("paint").setAttribute(
    "aria-label",
    total === 0
      ? "Pearl paint. Complete a course to unlock more finishes"
      : "Change unlocked paint finish",
  );
  $("paint").title =
    total < 3
      ? "Finish a new course to unlock another paint"
      : "All four finishes unlocked";
  $("ghost").querySelector("b").textContent = ghostOn ? "ON" : "OFF";
}
function beginTour() {
  tour = { index: 0, stages: [], score: 0 };
  selectCourse(COURSES[0].id);
  start();
}
function nextStage() {
  if (!tour || !run.finished) return;
  if (tour.index >= 2) {
    home();
    return;
  }
  tour.index++;
  selectCourse(COURSES[tour.index].id);
  start();
}
function endRun() {
  audio.event(run.failed ? "fail" : "finish");
  setPhase("results");
  const rank = rankRun(run),
    complete = !run.failed;
  $("result-kicker").textContent = complete
    ? tour
      ? `WORLD TOUR / STAGE ${tour.index + 1} OF 3`
      : course.name + " / FINISH"
    : `${(run.d / 1000).toFixed(2)} KM INTO THE CROSSING.`;
  $("result-title").innerHTML = complete
    ? tour && tour.index === 2
      ? "TOUR<br /> COMPLETE."
      : "COURSE<br /> COMPLETE."
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
  const unlockedBefore = completedCount(records);
  const result = saveResult(records, run, replay),
    record = result.record;
  records = result.records;
  storage.set("roadster-records", records);
  if (tour && complete) {
    tour.stages[tour.index] = { score: run.score, time: run.time, rank };
    tour.score = tour.stages.reduce((sum, s) => sum + s.score, 0);
  }
  $("next-stage").hidden = !tour || !complete;
  $("next-stage").textContent =
    tour?.index === 2 ? "TOUR GARAGE ↗" : "NEXT COURSE ↗";
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
      announce("MINT GATES REFILL THRUST", "GO", 0.8);
      audio.event("start");
    } else if (was > 0.7 && countdown <= 0.7)
      $("announcement-title").textContent = "SET";
    return;
  }
  stepRun(run, controls.read(), dt);
  replayClock += dt;
  if (replayClock >= 0.1) {
    replayClock = 0;
    replay.push([
      +run.time.toFixed(3),
      +run.d.toFixed(2),
      +run.x.toFixed(2),
      +run.y.toFixed(2),
    ]);
  }

  for (const e of run.events.splice(0)) {
    audio.event(e.type);
    if (!reduced) {
      coast.emit(e.type, run);
      effects.emit(e.type, coast.worldPos(run.d, run.x, run.y), run);
    }
    if (e.type === "sector") toast(`0${run.sector + 1} / ${e.text}`, "gate");
    else if (e.type === "hit") {
      impactTime = 0.45;
      toast(e.text, "hit");
    } else if (
      ["gate", "gap", "near", "pad", "launch", "stunt"].includes(e.type)
    )
      toast(e.text, e.type, e.points);
  }
  if (run.failed) controls.clear();
  if (run.finished) endRun();
}
function hud(force = false) {
  if (!force && clock - lastHud < 0.06) return;
  lastHud = clock;
  $("timer").textContent = formatTime(run.time);
  $("score").textContent = num(run.score);
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
  [...$("hull").querySelectorAll("i")].forEach((el, i) =>
    el.classList.toggle("lost", i >= run.hull),
  );
  const warning = nextWarning(run);
  $("warning").hidden = !warning || countdown > 0;
  if (warning) {
    $("warning-title").textContent = warning.title;
    $("warning-detail").textContent = warning.detail;
    $("warning").dataset.kind = warning.kind;
    $("warning").querySelector(".warning-icon").textContent =
      warning.kind === "gap" ||
      warning.kind === "ramp" ||
      warning.kind === "stunt"
        ? "↗"
        : warning.title === "KEEP RIGHT"
          ? "→"
          : warning.title === "KEEP LEFT"
            ? "←"
            : "↔";
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
function updateVisuals(dt, snap = false) {
  const hero =
    phase === "home" || (phase === "paused" && previousPhase === "home");
  car.userData.setDetail(hero && !qualityLow);
  const x = roadX(run.d, course) + run.x,
    y = coast.roadY(run.d) + Math.max(-8, run.y);
  car.position.set(x, y, -run.d);
  const heading = -Math.atan(roadSlope(run.d, course));
  const flip =
    !reduced && run.flight && run.stuntKind === "flip" ? run.stuntAngle : 0;
  const stuntBank =
    !reduced && run.flight && run.stuntKind === "roll" ? run.stuntAngle : 0;
  const bank =
    stuntBank -
    run.vx * (run.attachedRamp >= 0 ? 0.002 : 0.009) +
    (run.rollTime > 0 && !reduced ? run.roll : 0);
  car.rotation.set(
    run.airborne
      ? flip +
          (run.flight ? run.flightPitch : clamp(run.vy * 0.014, -0.13, 0.13))
      : Math.atan((coast.roadY(run.d + 2) - coast.roadY(run.d - 2)) / 4) +
          (run.boosting ? -0.018 : 0) +
          run.rampPitch,
    heading - run.vx * (run.attachedRamp >= 0 ? 0.003 : 0.022),
    bank,
    "YXZ",
  );
  if (run.attachedRamp >= 0) {
    const grade =
      (coast.roadY(run.d + 0.2) - coast.roadY(run.d - 0.2)) / 0.4 +
      Math.tan(run.rampPitch);
    rampNormal.set(0, 1, grade).normalize();
    rampForward
      .set(
        roadSlope(run.d, course) + run.vx / Math.max(27, run.speed),
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
    const impact = Math.max(0, 1 - run.crashAge / 1.05),
      jolt = Math.sin(run.crashAge * 22) * impact;
    if (!reduced) {
      car.rotation.y += jolt * 0.28 * run.crashDirection;
      car.rotation.z += jolt * 0.12;
      car.position.y += Math.abs(jolt) * 0.18;
    }
    if (run.failed) {
      const t = Math.min(1, run.crashAge / 0.95);
      if (run.crashKind === "fall") {
        car.position.y -= t * t * 14;
        car.rotation.x -= t * 0.7;
      } else {
        car.position.x += run.crashDirection * t * 2.6;
        car.position.z += Math.sin((t * Math.PI) / 2) * 1.8;
        car.rotation.y += run.crashDirection * t * 1.1;
        car.rotation.z += run.crashDirection * t * 0.22;
      }
    }
    if (!reduced && run.attachedRamp < 0 && run.landingAge < 0.35)
      car.position.y -= Math.sin((run.landingAge / 0.35) * Math.PI) * 0.055;
    if (flip) car.position.y += 0.65 * (1 - Math.cos(flip));
  }
  const d = car.userData;
  d.wing.position.y = THREE.MathUtils.lerp(
    d.wing.position.y,
    run.airborne || run.boosting ? 0.99 : 0.49,
    snap ? 1 : 1 - Math.exp(-dt * 4),
  );
  for (const wheel of d.wheels) {
    if (wheel.spin) wheel.spin.rotation.x -= (run.speed * dt) / 0.39;
    if (wheel.pivot && wheel.front) wheel.pivot.rotation.y = -run.vx * 0.025;
  }
  for (const jet of d.thrusterJets) {
    jet.visible = !run.failed && (run.boosting || run.padTime > 0);
    jet.scale.z = 1.8 + Math.sin(clock * 43) * 0.25;
    jet.material.uniforms.time.value = clock;
  }
  const actuation = flightActuators(run, car.rotation.x, car.rotation.z);
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
    fan.rotation.y += dt * (actuation.grip ? 95 : run.airborne ? 12 : 30);
  car.visible = true;
  coast.update(run, phase === "playing" ? dt : 0, clock);
  effects.update(
    car,
    run,
    phase === "paused" ? 0 : dt,
    phase === "playing",
    reduced,
  );
  const samples =
    records[course.id]?.layout === LAYOUT_VERSION
      ? records[course.id]?.ghost
      : null;
  ghost.visible = false;
  $("ghost-delta").hidden = true;
  if (ghostOn && phase === "playing" && samples?.length > 1 && countdown <= 0) {
    while (
      ghostIndex < samples.length - 2 &&
      samples[ghostIndex + 1][0] < run.time
    )
      ghostIndex++;
    const a = samples[ghostIndex],
      b = samples[ghostIndex + 1],
      f = clamp((run.time - a[0]) / (b[0] - a[0] || 1), 0, 1);
    const d = a[1] + (b[1] - a[1]) * f,
      gx = a[2] + (b[2] - a[2]) * f,
      gy = a[3] + (b[3] - a[3]) * f;
    ghost.position.set(roadX(d, course) + gx, coast.roadY(d) + gy, -d);
    ghost.rotation.y = -Math.atan(roadSlope(d, course));
    ghost.visible =
      Math.abs(d - run.d) < 220 &&
      Math.abs(d - run.d) > 4 &&
      run.time < samples[samples.length - 1][0];
    $("ghost-delta").hidden = false;
    $("ghost-delta").textContent =
      "PERSONAL GHOST / " +
      (run.d >= d ? "AHEAD " : "BEHIND ") +
      Math.abs(run.d - d).toFixed(0) +
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
      x +
        Math.sin(Math.PI / 4 + showroomAngle) * 8.5 +
        Math.sin(clock * 0.11) * 0.2,
      y + 2.3,
      -run.d - Math.cos(Math.PI / 4 + showroomAngle) * 8.5,
    );
    camera.lookAt(x, y + 0.38, -run.d + 0.2);
  } else {
    camera.clearViewOffset();
    const targetFov = reduced
      ? 63
      : run.padTime > 0
        ? 76
        : run.boosting
          ? 72
          : 63;
    camera.fov = THREE.MathUtils.lerp(
      camera.fov,
      targetFov,
      snap ? 1 : 1 - Math.exp(-dt * 3),
    );
    cameraGoal.set(
      roadX(run.d - 10, course) + run.x * 0.72,
      y + 3.5 - Math.min(run.y, 6) * 0.15,
      -run.d + (run.flight ? 11.5 : 8.7),
    );
    if (!reduced) {
      cameraGoal.y += Math.sin(clock * 19) * 0.014 * (run.boosting ? 2 : 1);
      cameraGoal.x += impactTime * Math.sin(clock * 70) * 0.2;
    }
    if (snap) camera.position.copy(cameraGoal);
    else camera.position.lerp(cameraGoal, 1 - Math.exp(-dt * 8));
    cameraTarget.set(
      roadX(run.d + 30, course) + run.x * 0.64,
      coast.roadY(run.d + 30) + 1.3 + run.y * 0.92,
      -run.d - 30,
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
  orientationBlocked = blocked;
  $("rotate").hidden = !blocked;
  $("app").inert = false;
  for (const id of ["home", "hud", "menu", "results", "masthead"])
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
    updateVisuals(dt);
    hud();
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
  renderer.render(scene, camera);
  if (quality === "auto" && !frozen && phase === "playing" && countdown <= 0) {
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
async function boot() {
  try {
    await document.fonts.ready;
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
      $("loading").querySelector("strong").textContent =
        "LOADING SURFACES / " + Math.round(value * 100) + "%";
    });
    car = createCar();
    effects = createRaceEffects(scene);
    scene.add(car);
    car.userData.interior.visible = false;
    car.userData.setDetail(!qualityLow && phase === "home");
    ghost = new THREE.Group();
    const ghostMaterial = new THREE.MeshBasicMaterial({
      color: 0x98ffdb,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      wireframe: false,
    });
    for (const part of car.children) {
      if (
        !part.isMesh ||
        ![car.userData.paintMaterial, car.userData.glassMaterial].includes(
          part.material,
        )
      )
        continue;
      const shell = new THREE.Mesh(part.geometry, ghostMaterial);
      shell.position.copy(part.position);
      shell.rotation.copy(part.rotation);
      ghost.add(shell);
    }
    scene.add(ghost);
    ghost.visible = false;

    audio = createSound();
    controls = createControls(
      window,
      (action) => {
        if (action === "pause") {
          if (phase === "playing") pause();
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
      tour = null;
      start();
    };
    $("start-tour").onclick = beginTour;
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
        tour = null;
        start();
      }
    });
    $("orbit-car").onclick = () => {
      showroomAngle += Math.PI / 2;
      updateVisuals(0, true);
    };
    let orbitPointer = null;
    $("scene").addEventListener("pointerdown", (e) => {
      if (phase !== "home") return;
      orbitPointer = { id: e.pointerId, x: e.clientX };
      $("scene").setPointerCapture?.(e.pointerId);
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
      storage.set("breakwater-reduced", reduced);
      $("motion").querySelector("b").textContent = reduced ? "REDUCED" : "FULL";
    };
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
      }
    });
    window.addEventListener("pagehide", () => controls.clear());
    document.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("selectstart", (e) => e.preventDefault());
    $("scene").addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      pause();
      showError(
        "The graphics connection was interrupted. Reload to start a new crossing.",
      );
    });
    const selectedId = course.id;
    const nextFrame = () => new Promise(requestAnimationFrame);
    for (const c of COURSES) {
      $("loading").querySelector("strong").textContent =
        "PREPARING / " + c.name;
      await nextFrame();
      const venue = createCoast(scene, renderer, c);
      venue.root.visible = false;
      venues.set(c.id, venue);
    }
    initialized = true;
    for (const c of COURSES) {
      selectCourse(c.id);
      applyQuality();
      resize();
      updateVisuals(0, true);
      await renderer.compileAsync(scene, camera);
      renderer.render(scene, camera);
      await nextFrame();
    }
    selectCourse(selectedId);
    home();
    applyQuality();
    resize();
    updateVisuals(0, true);
    renderer.render(scene, camera);
    $("loading").hidden = true;
    if (qa)
      window.__breakwater = {
        start,
        selectCourse,
        beginTour,
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
          tick(dt);
          clock += dt;
          updateVisuals(dt, true);
          hud(true);
          renderer.render(scene, camera);
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
boot();
