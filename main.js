import * as THREE from "./vendor/three.module.js";
import { createCar } from "./car.js";
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
  LENGTH,
  SECTORS,
  GATES,
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
let phase = "home",
  previousPhase = "home",
  orientationBlocked = false,
  run = createRun();
let renderer, scene, camera, car, coast, controls, audio;
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
let best = storage.get("breakwater-best", null),
  qualityLow = false,
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
  run = createRun();
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
  $("resume").innerHTML = "BACK TO THE COAST <b>↗</b>";
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
  setPhase("home");
  run = createRun();
  run.d = 80;
  run.speed = 0;
  run.x = 0;
  camera.fov = 44;
  camera.updateProjectionMatrix();
  refreshBest();
}
function refreshBest() {
  $("personal-best").textContent = best
    ? `PERSONAL BEST ${formatTime(best.time)} / ${num(best.score)} PTS`
    : "YOUR FIRST CROSSING STARTS HERE";
}
function endRun() {
  audio.event(run.failed ? "fail" : "finish");
  setPhase("results");
  const rank = rankRun(run),
    complete = !run.failed;
  $("result-kicker").textContent = complete
    ? "THE OTHER SIDE."
    : `${(run.d / 1000).toFixed(2)} KM INTO THE CROSSING.`;
  $("result-title").innerHTML = complete
    ? "CROSSING<br /> COMPLETE."
    : run.reason === "THE BRIDGE WAS OUT"
      ? "MISSED THE<br /> TAKEOFF."
      : "END OF<br /> THE RUN.";
  $("result-tip").textContent = complete
    ? "Chase the gold: under 1:05, with at least 12 gates."
    : run.reason === "THE BRIDGE WAS OUT"
      ? "Hold FLY before the orange strips. Keep holding until you clear the water."
      : "Steer around orange barriers, or fly over them. You have three hits.";
  $("result-time").textContent = formatTime(run.time);
  $("result-score").textContent = num(run.score);
  $("result-gates").textContent = `${run.gates} / ${GATES.length}`;
  $("result-rank").textContent = complete ? rank : "—";
  let record = false;
  if (complete && (!best || run.score > best.score)) {
    best = { time: run.time, score: run.score, rank };
    storage.set("breakwater-best", best);
    record = true;
  }
  $("record-message").textContent = record
    ? "NEW PERSONAL BEST. THAT’S YOUR LINE."
    : complete
      ? `BEST CHAIN ${run.bestChain} · ${run.perfect} PERFECT GATES · ${run.airtime.toFixed(1)} SEC IN FLIGHT`
      : "A quick retry. A cleaner line.";
  $("retry").focus({ preventScroll: true });
  audio.update(run, false);
}
function tick(dt) {
  if (phase !== "playing" || orientationBlocked) return;
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
  for (const e of run.events.splice(0)) {
    audio.event(e.type);
    if (e.type === "sector")
      announce(`SECTOR ${run.sector + 1} / 3`, e.text, 2);
    else if (e.type === "hit") {
      impactTime = 0.45;
      toast(e.text, "hit");
    } else if (e.type === "gate" || e.type === "gap" || e.type === "near")
      toast(e.text, e.type, e.points);
  }
  if (run.finished || run.failed) endRun();
}
function hud(force = false) {
  if (!force && clock - lastHud < 0.06) return;
  lastHud = clock;
  $("timer").textContent = formatTime(run.time);
  $("score").textContent = num(run.score);
  $("speed").textContent = String(Math.round(run.speed * 3.6)).padStart(3, "0");
  $("sector").textContent = `0${run.sector + 1} / ${SECTORS[run.sector]}`;
  $("distance").textContent =
    `${Math.max(0, (LENGTH - run.d) / 1000).toFixed(1)} KM TO GO`;
  $("progress").style.width = (run.d / LENGTH) * 100 + "%";
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
  $("motion-label").textContent = run.boosting
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
      warning.kind === "gap"
        ? "↗"
        : warning.title === "KEEP RIGHT"
          ? "→"
          : warning.title === "KEEP LEFT"
            ? "←"
            : "↔";
  }
  $("boost-fx").style.opacity =
    run.boosting && phase === "playing" && !reduced ? 1 : 0;
  document.querySelectorAll("[data-control]").forEach((button) => {
    const r = controls.read();
    const name = button.dataset.control;
    const held =
      name === "left" ? r.steer < 0 : name === "right" ? r.steer > 0 : r[name];
    button.classList.toggle("pressed", !!held);
  });
}
function updateVisuals(dt, snap = false) {
  const hero =
    phase === "home" || (phase === "paused" && previousPhase === "home");
  const x = roadX(run.d) + run.x,
    y = coast.ROAD_Y + Math.max(-8, run.y);
  car.position.set(x, y, -run.d);
  const heading = -Math.atan(roadSlope(run.d));
  const bank = -run.vx * 0.014 + (run.rollTime > 0 && !reduced ? run.roll : 0);
  car.rotation.set(
    run.airborne
      ? clamp(run.vy * 0.014, -0.13, 0.13)
      : run.boosting
        ? -0.018
        : 0,
    heading - run.vx * 0.022,
    bank,
    "YXZ",
  );
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
    jet.visible = run.boosting;
    jet.scale.z = 1.8 + Math.sin(clock * 43) * 0.25;
    jet.material.opacity = 0.35;
  }
  for (const jet of d.liftJets) {
    jet.visible = run.lifting;
    if (jet.material.uniforms) jet.material.uniforms.time.value = clock;
  }
  car.visible = !(run.invulnerable > 0 && Math.floor(clock * 12) % 2 === 0);
  coast.update(run, dt, clock);
  if (hero) {
    camera.fov = 43;
    camera.setViewOffset(
      innerWidth,
      innerHeight,
      -innerWidth * 0.19,
      0,
      innerWidth,
      innerHeight,
    );
    camera.position.set(
      x + 7.1 + Math.sin(clock * 0.11) * 0.3,
      y + 2.9,
      -run.d - 7.1,
    );
    camera.lookAt(x, y + 0.75, -run.d + 0.2);
  } else {
    camera.clearViewOffset();
    const targetFov = reduced ? 63 : run.boosting ? 72 : 63;
    camera.fov = THREE.MathUtils.lerp(
      camera.fov,
      targetFov,
      snap ? 1 : 1 - Math.exp(-dt * 3),
    );
    cameraGoal.set(
      roadX(run.d - 10) + run.x * 0.72,
      y + 4.5 - run.y * 0.33,
      -run.d + 10.7,
    );
    if (!reduced) {
      cameraGoal.y += Math.sin(clock * 19) * 0.014 * (run.boosting ? 2 : 1);
      cameraGoal.x += impactTime * Math.sin(clock * 70) * 0.2;
    }
    if (snap) camera.position.copy(cameraGoal);
    else camera.position.lerp(cameraGoal, 1 - Math.exp(-dt * 8));
    cameraTarget.set(
      roadX(run.d + 30) + run.x * 0.64,
      coast.ROAD_Y + 1.3 + run.y * 0.65,
      -run.d - 30,
    );
    camera.lookAt(cameraTarget);
  }
  camera.updateProjectionMatrix();
}
function applyQuality() {
  qualityLow =
    quality === "low" || (quality === "auto" && (coarse() || innerWidth < 900));
  renderer.setPixelRatio(
    Math.min(devicePixelRatio || 1, qualityLow ? 1.25 : 1.75),
  );
  coast.setQuality(qualityLow);
  car.userData.setDetail(false);
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
  const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
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
    phase === "playing" && !orientationBlocked && countdown <= 0 && !frozen,
  );
  renderer.render(scene, camera);
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
  ctx.fillText("ROADSTER / BREAKWATER", 65, 65);
  ctx.font = "600 102px Barlow";
  ctx.fillStyle = "#f6f1df";
  ctx.fillText(run.finished ? "CROSSING COMPLETE." : "ONE MORE RUN.", 65, 195);
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
    a.download = "breakwater-" + Math.round(run.score) + ".png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  });
}
async function boot() {
  try {
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
    coast = createCoast(scene, renderer);
    car = createCar();
    scene.add(car);
    car.userData.interior.visible = false;
    car.userData.setDetail(false);
    // A small procedural environment supplies real paint reflections without downloaded textures.
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0xb6d4d4);
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 25),
      new THREE.MeshBasicMaterial({ color: 0xfff7d9 }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 9;
    envScene.add(ceiling);
    const darkFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshBasicMaterial({ color: 0x28464a }),
    );
    darkFloor.rotation.x = -Math.PI / 2;
    darkFloor.position.y = -3;
    envScene.add(darkFloor);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(envScene, 0.08);
    scene.environment = env.texture;
    pmrem.dispose();
    ceiling.geometry.dispose();
    ceiling.material.dispose();
    darkFloor.geometry.dispose();
    darkFloor.material.dispose();
    audio = createSound();
    controls = createControls(
      window,
      (action) => {
        if (action === "pause") {
          if (phase === "playing") pause();
          else if (phase === "paused") resume();
        } else if (
          action === "retry" &&
          (phase === "playing" || phase === "results" || phase === "paused")
        )
          start();
      },
      () => phase === "playing" && !orientationBlocked,
    );
    document
      .querySelectorAll("[data-control]")
      .forEach((button) => controls.bind(button, button.dataset.control));
    $("start").onclick = start;
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
    initialized = true;
    home();
    applyQuality();
    resize();
    updateVisuals(0, true);
    renderer.render(scene, camera);
    $("loading").hidden = true;
    if (qa)
      window.__breakwater = {
        start,
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
