import { driveInput } from "./driver.js";
import { COURSES } from "../courses.js";

// This fixture only runs with ?qa=1, whose storage adapter is isolated from
// personal records. Browser automation uses these visible controls; the game
// state and renderer diagnostics are reported as ordinary DOM text.
const frame = document.querySelector("iframe");
const report = document.getElementById("report");
const status = document.getElementById("status");
const build = document.getElementById("build");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const paint = () => new Promise(requestAnimationFrame);
let d = 900,
  altitude = 0,
  hideUI = true,
  busy = false,
  errors = [];
const game = () => frame.contentWindow.__breakwater;
const output = (value) => {
  report.textContent = JSON.stringify(value, null, 2);
};
const read = () => {
  const g = game();
  return {
    build: build.value,
    venue: g.course.id,
    d: g.state.d,
    y: g.state.y,
    viewport: [frame.clientWidth, frame.clientHeight],
    pixelRatio: g.pixelRatio,
    calls: g.drawCalls,
    triangles: g.triangles,
    memory: g.memory,
    quality: frame.contentDocument.querySelector("#quality b").textContent,
    phase: g.phase,
    errors: [...errors],
  };
};
const hud = () => {
  for (const id of ["app", "shade", "boost-fx"])
    frame.contentDocument.getElementById(id).style.display = hideUI
      ? "none"
      : "";
};
async function pose() {
  const g = game();
  if (!g) return;
  g.freeze();
  if (g.phase !== "playing") g.start();
  g.setState({
    d,
    x: 0,
    y: altitude,
    vy: 0,
    speed: 60,
    time: 25,
    airborne: altitude > 0,
    lifting: altitude > 0,
    boosting: false,
    flight: null,
    pitch: 0,
    roll: 0,
  });
  g.step(0);
  hud();
  await paint();
  status.textContent = `${build.value} · ${d} m · ${altitude} m altitude · ${g.drawCalls} calls · ${g.triangles} triangles · DPR ${g.pixelRatio}`;
}
async function quality(target) {
  const control = frame.contentDocument.getElementById("quality");
  for (
    let i = 0;
    i < 3 && control.querySelector("b").textContent.toLowerCase() !== target;
    i++
  )
    control.click();
  await pose();
}
async function run(action) {
  if (busy) return;
  busy = true;
  status.textContent = "Working…";
  try {
    await action();
  } catch (e) {
    status.textContent = `FAIL ${e.message}`;
    output({ error: e.stack, errors });
  } finally {
    busy = false;
  }
}
document.getElementById("load").onclick = () =>
  run(async () => {
    errors = [];
    const url = {
      baseline: "./coastal-baseline.html",
      source: "../",
      production: "../dist/",
    }[build.value];
    const started = performance.now();
    status.textContent = "Loading…";
    frame.src = url + "?qa=1&coastal-review=1";
    await new Promise((resolve) => (frame.onload = resolve));
    const w = frame.contentWindow;
    w.addEventListener("error", (e) => errors.push(e.message));
    w.addEventListener("unhandledrejection", (e) =>
      errors.push(String(e.reason)),
    );
    for (let i = 0; i < 1200 && !game(); i++) await wait(50);
    if (!game()) throw Error("Game initialization timed out");
    const g = game();
    g.freeze();
    await g.selectCourse("breakwater");
    await quality(frame.clientWidth < 900 ? "low" : "high");
    output({ initialReadyMs: performance.now() - started, ...read() });
  });
document.querySelectorAll("[data-distance]").forEach(
  (b) =>
    (b.onclick = () =>
      run(async () => {
        d = +b.dataset.distance;
        await pose();
      })),
);
document.querySelectorAll("[data-size]").forEach(
  (b) =>
    (b.onclick = () =>
      run(async () => {
        const [w, h] = b.dataset.size.split(",");
        frame.style.width = w + "px";
        frame.style.height = h + "px";
        await paint();
        await quality(+w < 900 ? "low" : "high");
      })),
);
document.getElementById("ground").onclick = () =>
  run(async () => {
    altitude = 0;
    await pose();
  });
document.getElementById("air").onclick = () =>
  run(async () => {
    altitude = 12;
    await pose();
  });
document.getElementById("low").onclick = () => run(() => quality("low"));
document.getElementById("high").onclick = () => run(() => quality("high"));
document.getElementById("ui").onclick = () => {
  hideUI = !hideUI;
  hud();
};
document.getElementById("profile").onclick = () =>
  run(async () => {
    const rows = [];
    for (const y of [0, 12])
      for (const distance of [780, 900, 1080, 1230]) {
        d = distance;
        altitude = y;
        await pose();
        // An interval sample measures this desktop browser's render loop, not
        // physical-phone frame rate. Keep simulation frozen for matched geometry.
        const intervals = [];
        let prev = performance.now();
        for (let i = 0; i < 45; i++) {
          await paint();
          const now = performance.now();
          intervals.push(now - prev);
          prev = now;
        }
        intervals.sort((a, b) => a - b);
        rows.push({
          ...read(),
          intervalMeanMs:
            intervals.reduce((a, b) => a + b, 0) / intervals.length,
          intervalP95Ms: intervals[Math.floor(intervals.length * 0.95)],
        });
      }
    output({
      kind: "matched-render-profile",
      simulation: "frozen",
      hardware: "desktop browser, not physical phone",
      rows,
    });
    status.textContent = "Matched profile complete.";
  });
document.getElementById("venues").onclick = () =>
  run(async () => {
    const g = game(),
      rows = [];
    g.home();
    for (let round = 0; round < 3; round++)
      for (const c of COURSES) {
        const before = performance.now();
        await g.selectCourse(c.id);
        g.step(0);
        await paint();
        rows.push({
          round,
          venue: c.id,
          ms: performance.now() - before,
          memory: g.memory,
          rendered: g.drawCalls > 0,
          selected: g.course.id === c.id,
          showcaseOnlyOnCoast:
            !("coastalDiagnostics" in g) ||
            Boolean(g.coastalDiagnostics) === (c.id === "breakwater"),
        });
      }
    await g.selectCourse("breakwater");
    await pose();
    output({ kind: "venue-lifecycle", rows, errors });
    status.textContent =
      rows.every((r) => r.rendered && r.selected && r.showcaseOnlyOnCoast) &&
      !errors.length
        ? "PASS venue lifecycle"
        : "FAIL venue lifecycle";
  });
document.getElementById("geometry").onclick = () =>
  run(async () => {
    const g = game();
    if (!g.coastalDiagnostics)
      throw Error("Showcase diagnostics hook is unavailable in this build");
    const audit = g.coastalDiagnostics;
    const checks = {
      finiteGeometry: audit.finiteErrors === 0,
      validIndices: audit.indexErrors === 0,
      boundedSection: audit.bounds.start === 760 && audit.bounds.end === 1260,
      sceneryClearsRoadAndRails:
        audit.bounds.minRockRoadOffset > 10.8 &&
        audit.bounds.minHardwareRoadOffset > 10.8,
      noExtraLights: audit.newLights === 0,
      materialBatched: audit.drawCallsAllTiles <= 50,
      geometryMemoryBounded: audit.ownedGeometryBytes < 8 * 1024 * 1024,
      roadsideClearsDriveableWidth: audit.roadside?.minRoadOffset > 10,
      roadsideBatchBounded: audit.roadside?.drawCallsAllTiles <= 12,
      roadsideAddsNoTexturesOrLights:
        audit.roadside?.newTextures === 0 &&
        audit.roadside?.newLights === 0 &&
        audit.roadside?.shadowDraws === 0,
    };
    output({ kind: "showcase-geometry", checks, audit, errors });
    status.textContent =
      Object.values(checks).every(Boolean) && !errors.length
        ? "PASS showcase geometry"
        : "FAIL showcase geometry";
  });
document.getElementById("pool").onclick = () =>
  run(async () => {
    const rows = [];
    for (let round = 0; round < 3; round++) {
      for (const detail of ["low", "high"])
        for (const distance of [600, 780, 900, 1080, 1230, 1400]) {
          d = distance;
          altitude = distance === 1080 ? 12 : 0;
          await quality(detail);
        }
      rows.push({ round, memory: game().memory });
    }
    const stable =
      JSON.stringify(rows[1].memory) === JSON.stringify(rows[2].memory);
    output({ kind: "pool-stability", rows, stable, errors });
    status.textContent =
      stable && !errors.length ? "PASS pool stability" : "FAIL pool stability";
  });
document.getElementById("gpu").onclick = () =>
  run(async () => {
    const g = game();
    if (typeof g.measureGpu !== "function") {
      output({
        kind: "gpu-cost",
        supported: false,
        reason: "This build has no GPU timer hook.",
      });
      status.textContent = "GPU measurement unavailable in this build.";
      return;
    }
    const rows = [];
    for (const detail of ["low", "high"])
      for (const distance of [900, 1080]) {
        d = distance;
        altitude = 0;
        await quality(detail);
        rows.push({ ...read(), measurement: await g.measureGpu(24) });
      }
    output({
      kind: "gpu-cost",
      hardware: "Current desktop browser GPU, not a physical phone",
      rows,
    });
    status.textContent = "GPU measurement complete.";
  });
document.getElementById("small-phone").onclick = () =>
  run(async () => {
    frame.style.width = "568px";
    frame.style.height = "320px";
    await wait(150);
    const g = game();
    g.home();
    g.start();
    g.freeze();
    g.pause();
    hideUI = false;
    hud();
    const rows = [
      "resume",
      "restart",
      "go-home",
      "sound",
      "quality",
      "motion",
      "ghost",
      "fullscreen",
      "saver",
      "trim",
    ].map((id) => {
      const el = frame.contentDocument.getElementById(id),
        r = el.getBoundingClientRect();
      return {
        id,
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        visible: el.getClientRects().length > 0,
        inside: r.x >= 0 && r.y >= 0 && r.right <= 569 && r.bottom <= 321,
        targetSize: r.height >= 44,
      };
    });
    const passed = rows.every((r) => r.visible && r.inside && r.targetSize);
    output({
      kind: "small-phone-pause",
      viewport: [568, 320],
      rows,
      passed,
      errors,
    });
    status.textContent =
      passed && !errors.length
        ? "PASS small-phone pause"
        : "FAIL small-phone pause";
  });
document.getElementById("live").onclick = () =>
  run(async () => {
    const g = game(),
      w = frame.contentWindow;
    g.home();
    await g.selectCourse("breakwater");
    g.start();
    g.setState({
      d: 760,
      x: 0,
      y: 0,
      vy: 0,
      speed: 60,
      time: 12,
      airborne: false,
    });
    g.freeze(false);
    hideUI = false;
    hud();
    const started = performance.now(),
      held = new Set(),
      intervals = [],
      frames = [];
    let prev = started;
    const send = (code, on) => {
      if (held.has(code) === on) return;
      on ? held.add(code) : held.delete(code);
      w.dispatchEvent(
        new w.KeyboardEvent(on ? "keydown" : "keyup", {
          code,
          bubbles: true,
          cancelable: true,
        }),
      );
    };
    while (
      g.phase === "playing" &&
      g.state.d < 1320 &&
      performance.now() - started < 20000
    ) {
      const input = driveInput(g.state);
      send("ArrowLeft", input.steer < -0.2);
      send("ArrowRight", input.steer > 0.2);
      send("Space", input.fly);
      send("ShiftLeft", input.boost);
      send("ArrowDown", input.brake);
      await paint();
      const now = performance.now();
      intervals.push(now - prev);
      prev = now;
      if (intervals.length % 30 === 0)
        frames.push({
          d: g.state.d,
          y: g.state.y,
          calls: g.drawCalls,
          triangles: g.triangles,
          hull: g.state.hull,
        });
    }
    for (const code of [...held]) send(code, false);
    g.clear();
    g.freeze();
    const end = read();
    intervals.sort((a, b) => a - b);
    const result = {
      kind: "live-section",
      elapsedMs: performance.now() - started,
      startD: 760,
      endD: g.state.d,
      reachedEnd: g.state.d >= 1320,
      finite: Number.isFinite(g.state.d + g.state.x + g.state.y),
      hull: g.state.hull,
      intervalMeanMs: intervals.reduce((a, b) => a + b, 0) / intervals.length,
      intervalP95Ms: intervals[Math.floor(intervals.length * 0.95)],
      frames,
      ...end,
    };
    output(result);
    status.textContent =
      result.reachedEnd && result.finite && !errors.length
        ? "PASS live section"
        : "FAIL live section";
  });
