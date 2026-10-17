import { driveInput } from "./driver.js";
import { COURSES } from "../courses.js";
const report = document.getElementById("report"),
  stage = document.getElementById("stage");
let pass = 0,
  fail = 0;
const check = (label, fn) => {
  try {
    fn();
    pass++;
    report.textContent += `PASS ${label}\n`;
  } catch (e) {
    fail++;
    report.textContent += `FAIL ${label}: ${e.message}\n`;
  }
};
const ok = (v, message = "Assertion failed") => {
  if (!v) throw Error(message);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
document.getElementById("benchmark").onclick = async () => {
  report.textContent =
    "Measuring selection through the first rendered frame…\n";
  stage.replaceChildren();
  const frame = document.createElement("iframe");
  frame.style.cssText = "width:844px;height:390px;border:0";
  const boot = performance.now();
  frame.src = "../dist/?qa=1";
  stage.append(frame);
  for (let i = 0; i < 600 && !frame.contentWindow.__breakwater; i++)
    await wait(50);
  const g = frame.contentWindow.__breakwater;
  if (!g) {
    report.textContent += "FAIL initialization timed out";
    return;
  }
  g.freeze();
  report.textContent += `Ready in ${(performance.now() - boot).toFixed(0)} ms\n`;
  for (let round = 0; round < 3; round++)
    for (const c of COURSES) {
      const t = performance.now();
      g.selectCourse(c.id);
      g.step(0);
      await new Promise(requestAnimationFrame);
      report.textContent += `${round + 1} ${c.name}: ${(performance.now() - t).toFixed(1)} ms; ${JSON.stringify(g.memory)}\n`;
      await wait(100);
    }
  report.textContent +=
    "Benchmark complete. Includes construction, shader preparation and a rendered frame; browser scheduling can vary.\n";
};
document.getElementById("run").onclick = async () => {
  pass = fail = 0;
  report.textContent = "Running production build…\n";
  stage.replaceChildren();
  const frame = document.createElement("iframe");
  frame.style.cssText = "width:1280px;height:720px;border:0";
  frame.src = "../dist/?qa=1";
  stage.append(frame);
  for (let i = 0; i < 200 && !frame.contentWindow.__breakwater; i++)
    await wait(50);
  const w = frame.contentWindow,
    d = w.document,
    g = w.__breakwater;
  if (!g) {
    report.textContent += "FAIL game did not initialize";
    return;
  }
  const key = (type, code) =>
    w.dispatchEvent(
      new w.KeyboardEvent(type, { code, bubbles: true, cancelable: true }),
    );
  const pointer = (type, el, id) =>
    el.dispatchEvent(
      new w.PointerEvent(type, {
        pointerId: id,
        pointerType: "touch",
        bubbles: true,
        cancelable: true,
      }),
    );
  const step = (seconds) => {
    for (let i = 0; i < Math.ceil(seconds * 120); i++) g.step(1 / 120);
  };
  g.freeze();
  g.start();
  g.setState({});
  check("WebGL production scene has rendered", () =>
    ok(g.drawCalls > 0 && d.getElementById("loading").hidden),
  );
  check("Shift + Right moves the car while boosting", () => {
    key("keydown", "ShiftLeft");
    key("keydown", "ArrowRight");
    step(0.4);
    ok(g.state.x > 3);
    ok(g.state.boosting);
    ok(g.input.steer === 1 && g.input.boost);
  });
  check("Shift + Left reverses steering without releasing Shift", () => {
    key("keyup", "ArrowRight");
    key("keydown", "ArrowLeft");
    step(0.65);
    ok(g.state.vx < -10);
    ok(g.state.boosting);
  });
  check("Shift + Arrow + Space remain held through takeoff and landing", () => {
    key("keydown", "Space");
    step(0.6);
    ok(g.state.airborne);
    ok(g.input.steer === -1 && g.input.boost && g.input.fly);
    key("keyup", "Space");
    step(2);
    ok(!g.state.airborne);
    ok(g.input.steer === -1 && g.input.boost);
  });
  g.start();
  g.setState({});
  check("Three simultaneous touch controls work independently", () => {
    pointer("pointerdown", d.querySelector("[data-control=left]"), 1);
    pointer("pointerdown", d.querySelector("[data-control=fly]"), 2);
    pointer("pointerdown", d.querySelector("[data-control=boost]"), 3);
    step(0.5);
    ok(g.state.x < -4 && g.state.y > 1 && g.state.boosting);
    pointer("pointerup", d.querySelector("[data-control=fly]"), 2);
    ok(g.input.steer === -1 && g.input.boost && !g.input.fly);
  });
  check("Pointer cancellation releases only the cancelled control", () => {
    pointer("pointercancel", d.querySelector("[data-control=left]"), 1);
    ok(g.input.steer === 0 && g.input.boost);
    pointer("lostpointercapture", d.querySelector("[data-control=boost]"), 3);
    ok(!g.input.boost);
  });
  check("Holding buttons cannot select the page or open the copy menu", () => {
    ok(w.getComputedStyle(d.body).userSelect === "none");
    ok(
      w.getComputedStyle(d.querySelector("[data-control=fly]")).touchAction ===
        "none",
    );
    const e = new w.Event("selectstart", { cancelable: true });
    d.dispatchEvent(e);
    ok(e.defaultPrevented);
    const c = new w.Event("contextmenu", { cancelable: true });
    d.dispatchEvent(c);
    ok(c.defaultPrevented);
  });
  check("Pause freezes distance/time and clears held controls", () => {
    key("keydown", "ShiftLeft");
    g.pause();
    const before = g.state.time;
    step(2);
    ok(g.state.time === before);
    ok(!g.input.boost);
    ok(g.phase === "paused");
  });
  check("Resume returns deliberate control, with no stuck key", () => {
    d.getElementById("resume").click();
    ok(g.phase === "playing" && !g.input.boost);
  });
  check("Failure presents a specific takeoff tip and a one-click retry", () => {
    g.setState({ d: 655, y: 0, vy: 0, x: 0 });
    step(3);
    ok(g.phase === "results");
    ok(/hold FLY/i.test(d.getElementById("result-tip").textContent));
    ok(d.getElementById("result-tip").textContent.includes("mint ramp"));
    d.getElementById("retry").click();
    ok(g.phase === "playing" && g.state.d === 0 && g.state.hull === 3);
  });
  check("Finish awards a medal and ends the run once", () => {
    g.start();
    g.setState({
      d: g.course.length - 1,
      time: 62,
      gates: g.course.goldGates,
      score: 4000,
    });
    step(0.1);
    ok(g.phase === "results");
    ok(d.getElementById("result-rank").textContent === "GOLD");
    const score = g.state.score;
    step(2);
    ok(g.state.score === score);
  });
  g.home();
  check("Venue arrows cycle all three courses and update the selection", () => {
    g.selectCourse("breakwater");
    d.getElementById("venue-prev").click();
    ok(g.course.id === "nightshift");
    d.getElementById("venue-next").click();
    ok(g.course.id === "breakwater");
    ok(d.getElementById("venue-index").textContent === "01 / 03");
  });
  check("Showroom rotation preserves course and driving state", () => {
    d.getElementById("orbit-car").click();
    g.step(0);
    ok(
      g.phase === "home" && g.course.id === "breakwater" && g.state.speed === 0,
    );
  });
  for (const course of COURSES) {
    d.querySelector('[data-course="' + course.id + '"]').click();
    g.step(0);
    check(
      course.name + ": selector changes route, scenery and briefing",
      () => {
        ok(g.course.id === course.id);
        ok(
          d
            .getElementById("route-meta")
            .textContent.includes((course.length / 1000).toFixed(1)),
        );
        ok(g.drawCalls > 0);
      },
    );
  }
  g.selectCourse("breakwater");
  g.start();
  g.setState({ d: 380, speed: 76 });
  key("keydown", "ShiftLeft");
  key("keydown", "ArrowRight");
  step(0.22);
  const savedTrail = g.trailHistory[0].at(-1);
  key("keyup", "ArrowRight");
  key("keydown", "ArrowLeft");
  step(0.22);
  check(
    "Boost ribbons preserve world-space history through a steering reversal",
    () => {
      const path = g.trailHistory[0];
      const kept = path.find((p) => p.time === savedTrail.time);
      ok(kept && kept.x === savedTrail.x && kept.z === savedTrail.z);
      ok(path.length > 12);
      ok(path.at(-1).z < path[0].z);
      ok(g.input.boost && g.input.steer === -1);
    },
  );
  g.clear();
  step(0.8);
  check("Boost ribbons fade after release and reset on retry", () => {
    ok(g.trailHistory.every((p) => p.length === 0));
    g.start();
    ok(g.trailHistory.every((p) => p.length === 0));
  });
  const ramp = g.course.ramps[1];
  g.setState({ d: ramp.d - 0.1, y: ramp.height, speed: 70 });
  step(0.6);
  check(
    "Sky ramp automatically rotates the car with a visible aerial HUD",
    () => {
      ok(g.state.flight && g.state.stuntAngle > 1);
      ok(g.carPose.visible && Math.abs(g.carPose.rotation[0]) > 1);
      ok(d.getElementById("motion-label").textContent.includes("BACKFLIP"));
    },
  );
  check("Flight correction outlets fire during an automatic stunt", () => {
    ok(g.carPose.ports.some((p) => p.visible));
    ok(g.carPose.actuation.pitch !== 0);
  });
  key("keydown", "ShiftLeft");
  key("keydown", "ArrowRight");
  step(0.12);
  check("Automatic stunt leaves boost and steering independent", () => {
    ok(g.input.boost && g.input.steer === 1 && g.state.vx > 1);
  });
  g.clear();
  for (let i = 0; i < 600 && g.state.flight; i++) g.step(1 / 120);
  check("Automatic flip returns upright and awards one clean landing", () => {
    ok(!g.state.flight && g.state.stunts === 1);
    ok(
      g.state.y === 0 && Math.abs(g.carPose.rotation[0]) < 0.1,
      JSON.stringify({ y: g.state.y, pose: g.carPose }),
    );
  });
  g.start();
  g.setState({
    d: 380,
    y: 4,
    airborne: true,
    lifting: true,
    liftAcceleration: 16,
  });
  g.step(0);
  check("Manual flight visibly activates underbody lift ports", () => {
    ok(
      g.carPose.ports.filter((p) => p.name.endsWith("lift") && p.visible)
        .length === 4,
    );
  });
  g.start();
  g.setState({ d: ramp.d - ramp.length - 2, speed: 65 });
  let minClearance = Infinity;
  while (g.state.d < ramp.d && !g.state.failed) {
    g.step(1 / 30);
    minClearance = Math.min(minClearance, g.carPose.rampClearance);
  }
  check("Rendered wheel/bumper contacts stay above the curved ramp", () =>
    ok(minClearance >= 0, "minimum clearance " + minClearance),
  );
  g.start();
  g.setState({ d: g.course.length * 0.5 });
  g.step(0);
  check(
    "Live route map shows the current position and all stunt locations",
    () => {
      ok(d.getElementById("map-percent").textContent === "50%");
      ok(
        d.getElementById("map-stunts").childElementCount ===
          g.course.ramps.length,
      );
      ok(d.getElementById("map-travelled").getAttribute("points").length > 50);
      ok(
        d
          .getElementById("race-map")
          .getAttribute("aria-label")
          .includes("50% complete"),
      );
    },
  );
  g.start();
  g.setState({ d: 307, x: -4.4, speed: 76, hull: 1 });
  step(0.1);
  const crashPose = g.carPose.position;
  check(
    "A fatal collision shows the car and effect before opening results",
    () => {
      ok(g.state.failed && g.phase === "playing");
      ok(g.carPose.visible);
      ok(d.getElementById("warning-title").textContent === "WRECKED");
      ok(d.getElementById("event").textContent.includes("RUN ENDED"));
    },
  );
  step(0.4);
  check("Wreck slides and turns instead of blinking away", () => {
    ok(
      g.carPose.visible && Math.abs(g.carPose.position[0] - crashPose[0]) > 0.3,
    );
  });
  step(0.6);
  check(
    "Crash sequence ends in a retryable result without advancing the race",
    () => {
      ok(g.phase === "results" && g.state.time < 0.05);
    },
  );
  g.home();
  const memory = g.memory;
  for (let i = 0; i < 2; i++)
    for (const c of COURSES) {
      g.selectCourse(c.id);
      g.step(0);
    }
  check("Three prepared venues reuse their geometry and textures", () => {
    ok(g.preparedVenues === 3);
    ok(g.memory.geometries <= memory.geometries + 2, JSON.stringify(g.memory));
    ok(g.memory.textures <= memory.textures + 1);
  });
  g.home();
  d.getElementById("start-tour").click();
  check("World Tour begins at the Atlantic course", () =>
    ok(g.tour.index === 0 && g.course.id === "breakwater"),
  );
  for (let i = 0; i < 3; i++) {
    g.setState({
      d: g.course.length - 1,
      time: g.course.gold - 2,
      gates: g.course.gates.length,
      score: 9000,
      hull: 3,
    });
    step(0.1);
    check(
      "Tour stage " + (i + 1) + " records a result and offers its next action",
      () => {
        ok(g.phase === "results");
        ok(g.tour.stages.length === i + 1);
        ok(!d.getElementById("next-stage").hidden);
        ok(g.records[g.course.id].medal === 3);
      },
    );
    if (i < 2) d.getElementById("next-stage").click();
  }
  check("Tour finale sums all three stages", () => {
    ok(g.tour.score === g.tour.stages.reduce((n, s) => n + s.score, 0));
    ok(d.getElementById("result-title").textContent.includes("TOUR"));
  });
  d.getElementById("next-stage").click();
  check("Finishing three courses unlocks all four paint choices", () => {
    const names = new Set();
    for (let i = 0; i < 4; i++) {
      d.getElementById("paint").click();
      names.add(d.getElementById("paint-name").textContent);
    }
    ok(names.size === 4);
  });
  g.selectCourse("breakwater");
  for (const [width, height] of [
    [1280, 720],
    [844, 390],
    [667, 375],
    [568, 320],
  ]) {
    frame.style.width = width + "px";
    frame.style.height = height + "px";
    await wait(90);
    g.home();
    check(
      `${width}×${height}: start title and instructions have breathing room`,
      () => {
        const title = d.querySelector(".home-copy").getBoundingClientRect();
        const brief = d.querySelector(".brief").getBoundingClientRect();
        ok(
          !brief.height || title.bottom + 8 <= brief.top,
          `title bottom ${title.bottom}, instructions ${brief.top}`,
        );
        const start = d.getElementById("start").getBoundingClientRect();
        ok(
          start.right <= width && start.bottom <= height && start.height >= 44,
        );
      },
    );
    check(
      `${width}×${height}: course selection, map and paint do not overlap`,
      () => {
        const ids = [
          "course-select",
          "venue-prev",
          "venue-next",
          "orbit-car",
          "home-title",
          "paint",
          "start",
          "start-tour",
        ];
        const rects = ids.map((id) =>
          d.getElementById(id).getBoundingClientRect(),
        );
        for (let a = 0; a < rects.length; a++) {
          const r = rects[a];
          ok(
            r.left >= 0 &&
              r.right <= width + 1 &&
              r.top >= 0 &&
              r.bottom <= height + 1,
            ids[a],
          );
          for (let b = a + 1; b < rects.length; b++) {
            const q = rects[b];
            ok(
              !(
                r.left < q.right &&
                r.right > q.left &&
                r.top < q.bottom &&
                r.bottom > q.top
              ),
              ids[a] + "/" + ids[b],
            );
          }
        }
        const info = d.querySelector(".route-label").getBoundingClientRect(),
          paint = d.getElementById("paint").getBoundingClientRect();
        ok(
          !(
            info.left < paint.right &&
            info.right > paint.left &&
            info.top < paint.bottom &&
            info.bottom > paint.top
          ),
          "route info overlaps paint",
        );
      },
    );
    g.start();
    g.setState({ d: 510 });
    check(
      `${width}×${height}: HUD and large controls remain inside viewport`,
      () => {
        for (const el of [
          ...d.querySelectorAll(
            "#race-map,.hud-top,.speed-block,.reserve-block,#warning,#race-target,#touch-controls button",
          ),
        ]) {
          if (!el.getClientRects().length) continue;
          const r = el.getBoundingClientRect();
          ok(
            r.left >= 0 &&
              r.top >= 0 &&
              r.right <= width + 1 &&
              r.bottom <= height + 1,
            el.className || el.id,
          );
          if (el.tagName === "BUTTON")
            ok(r.width >= 44 && r.height >= 44, "touch target too small");
        }
      },
    );
    check(
      `${width}×${height}: critical text and controls do not overlap`,
      () => {
        const els = [
          "#race-map",
          ".timer-block",
          ".score-block",
          ".speed-block",
          ".reserve-block",
          "#warning",
          ...(width < 1000 ? [".steering", ".actions"] : ["#desktop-controls"]),
        ].map((sel) => d.querySelector(sel));
        for (let a = 0; a < els.length; a++)
          for (let b = a + 1; b < els.length; b++) {
            const x = els[a].getBoundingClientRect(),
              y = els[b].getBoundingClientRect();
            ok(
              !(
                x.left < y.right &&
                x.right > y.left &&
                x.top < y.bottom &&
                x.bottom > y.top
              ),
              `${els[a].className} / ${els[b].className}`,
            );
          }
      },
    );
    g.pause();
    check(`${width}×${height}: pause buttons visible without scrolling`, () => {
      for (const id of [
        "resume",
        "restart",
        "sound",
        "quality",
        "motion",
        "ghost",
        "fullscreen",
      ]) {
        const r = d.getElementById(id).getBoundingClientRect();
        ok(r.top >= 0 && r.bottom <= height + 1 && r.height >= 44, id);
      }
    });
  }
  frame.style.width = "568px";
  frame.style.height = "320px";
  await wait(90);
  g.home();
  g.beginTour();
  for (let i = 0; i < 3; i++) {
    g.setState({
      d: g.course.length - 1,
      time: 60,
      gates: g.course.gates.length,
      score: 9000,
    });
    step(0.1);
    if (i < 2) g.nextStage();
  }
  check(
    "568×320: complete tour results and all actions fit without scrolling",
    () => {
      for (const id of [
        "result-title",
        "result-tip",
        "tour-summary",
        "next-stage",
        "retry",
        "share",
        "result-home",
        "record-message",
      ]) {
        const el = d.getElementById(id),
          r = el.getBoundingClientRect();
        ok(
          r.top >= 0 && r.bottom <= 320 && r.left >= 0 && r.right <= 568,
          id + " " + JSON.stringify({ top: r.top, bottom: r.bottom }),
        );
        if (el.tagName === "BUTTON") ok(r.height >= 44, id + " target");
      }
    },
  );
  g.home();
  for (const [width, height] of [
    [390, 844],
    [320, 568],
  ]) {
    g.start();
    g.setState({});
    key("keydown", "ShiftLeft");
    frame.style.width = width + "px";
    frame.style.height = height + "px";
    await wait(90);
    check(
      `${width}×${height}: portrait pauses play and shows readable rotation prompt`,
      () => {
        ok(g.blocked);
        ok(!d.getElementById("rotate").hidden);
        ok(g.phase === "paused");
        ok(!g.input.boost);
        ok(d.getElementById("hud").inert);
        ok(d.getElementById("masthead").inert);
      },
    );
    frame.style.width = "844px";
    frame.style.height = "390px";
    await wait(90);
    check("Rotation back requires deliberate resume", () =>
      ok(!g.blocked && g.phase === "paused"),
    );
  }
  g.home();
  frame.style.width = "844px";
  frame.style.height = "390px";
  report.textContent += `\n${pass} passed · ${fail} failed.\n`;
  document.title = `Breakwater QA: ${pass} passed, ${fail} failed`;
};

document.getElementById("routes").onclick = async () => {
  report.textContent =
    "Driving all routes through the production keyboard handlers…\n";
  stage.replaceChildren();
  const frame = document.createElement("iframe");
  frame.style.cssText = "width:844px;height:390px;border:0";
  frame.src = "../dist/?qa=1";
  stage.append(frame);
  for (let i = 0; i < 200 && !frame.contentWindow.__breakwater; i++)
    await wait(50);
  const w = frame.contentWindow,
    g = w.__breakwater;
  if (!g) {
    report.textContent += "FAIL initialization";
    return;
  }
  g.freeze();
  let failed = 0;
  for (const c of COURSES) {
    g.home();
    g.selectCourse(c.id);
    g.start();
    g.setState({});
    const held = new Set();
    let steps = 0,
      maxDraws = 0;
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
    while (g.phase === "playing" && steps < 60 * 110) {
      for (let n = 0; n < 30 && g.phase === "playing"; n++) {
        const input = driveInput(g.state);
        send("ArrowRight", input.steer > 0.25);
        send("ArrowLeft", input.steer < -0.25);
        send("ShiftLeft", input.boost);
        send("Space", input.fly);
        g.step(1 / 60);
        maxDraws = Math.max(maxDraws, g.drawCalls);
        steps++;
      }
      await wait(0);
    }
    for (const key of [...held]) send(key, false);
    const s = g.state,
      ok = s.finished && s.hull === 3 && s.gates === c.gates.length;
    if (!ok) failed++;
    report.textContent += `${ok ? "PASS" : "FAIL"} ${c.name}: ${s.time.toFixed(2)} s / ${s.gates}/${c.gates.length} gates / hull ${s.hull}/3 / ${s.score} points / peak ${maxDraws} draw calls\n`;
    if (ok) {
      g.start();
      g.setState({ time: 8, d: 500 });
      g.step(0);
      const label = w.document.getElementById("ghost-delta");
      report.textContent +=
        (!label.hidden ? "PASS" : "FAIL") +
        " Saved fastest-run ghost appears on replay\n";
      if (label.hidden) failed++;
    }
  }
  report.textContent += `\nRendered route verification: ${failed} failed.\n`;
  document.title = `World Tour routes: ${failed} failed`;
};

document.getElementById("budget").onclick = async () => {
  report.textContent = "Profiling rendered 844 × 390 phone layout…\n";
  stage.replaceChildren();
  const frame = document.createElement("iframe");
  frame.style.cssText = "width:844px;height:390px";
  frame.src = "../dist/?qa=1";
  stage.append(frame);
  for (let i = 0; i < 400 && !frame.contentWindow.__breakwater; i++)
    await wait(50);
  const g = frame.contentWindow.__breakwater;
  if (!g) {
    report.textContent += "FAIL boot";
    return;
  }
  g.freeze();
  for (const c of COURSES) {
    g.home();
    g.selectCourse(c.id);
    g.start();
    for (const d of [380, c.ramps[1].d - 30, c.length - 400]) {
      g.setState({ d, x: 0, y: 0, speed: 65 });
      g.step(0);
      let frames = 0,
        total = 0,
        previous = performance.now();
      for (let i = 0; i < 90; i++) {
        await new Promise(requestAnimationFrame);
        const now = performance.now();
        if (i > 15) {
          total += now - previous;
          frames++;
        }
        previous = now;
      }
      report.textContent += `${c.id} @ ${d}m: ${g.drawCalls} draws / ${g.triangles} triangles / DPR ${g.pixelRatio} / ${(total / frames).toFixed(2)} ms browser-frame interval / ${JSON.stringify(g.memory)}\n`;
    }
  }
  report.textContent +=
    "Profile complete. Desktop GPU at phone viewport; physical mobile GPU/thermal testing remains necessary.\n";
};

document.getElementById("envelopes").onclick = async () => {
  report.textContent = "Checking rendered vehicle clearance on all 13 ramps…\n";
  stage.replaceChildren();
  const frame = document.createElement("iframe");
  frame.style.cssText = "width:844px;height:390px";
  frame.src = "../dist/?qa=1";
  stage.append(frame);
  for (let i = 0; i < 400 && !frame.contentWindow.__breakwater; i++)
    await wait(50);
  const g = frame.contentWindow.__breakwater,
    w = frame.contentWindow;
  if (!g) {
    report.textContent += "FAIL boot";
    return;
  }
  g.freeze();
  let failures = 0;
  for (const c of COURSES) {
    g.home();
    g.selectCourse(c.id);
    for (const r of c.ramps) {
      g.start();
      g.setState({ d: r.d - r.length - 3, speed: 70, time: 15, x: r.x });
      let clearance = Infinity,
        correction = false,
        landingThrust = false;
      const down = (code) =>
        w.dispatchEvent(
          new w.KeyboardEvent("keydown", { code, bubbles: true }),
        );
      down("ShiftLeft");
      down("ArrowRight");
      while (g.state.d < r.land + 3 && !g.state.failed) {
        g.step(1 / 30);
        const pose = g.carPose;
        if (g.state.attachedRamp >= 0)
          clearance = Math.min(clearance, pose.rampClearance);
        if (g.state.flight) {
          correction ||= pose.ports.some(
            (p) => p.visible && p.name.endsWith("attitude"),
          );
          if (g.state.d > r.land - 25)
            landingThrust ||= pose.actuation.lift > 0;
        }
        if (g.state.d > r.d - r.length * 0.25) g.clear();
        if (Math.floor(g.state.d) % 12 < 3) await wait(0);
      }
      g.clear();
      const pass =
        clearance >= 0 && correction && landingThrust && !g.state.failed;
      failures += !pass;
      report.textContent += `${pass ? "PASS" : "FAIL"} ${c.id} ramp ${r.d}: minimum wheel/bumper clearance ${(clearance * 100).toFixed(1)} cm; attitude jets ${correction}; landing lift ${landingThrust}\n`;
    }
  }
  report.textContent += `All-ramp rendered contact checks complete: ${failures} failures.\n`;
};
