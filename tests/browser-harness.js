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
document.getElementById("run").onclick = async () => {
  pass = fail = 0;
  report.textContent = "Running production build…\n";
  stage.replaceChildren();
  // Remove the one fixture record written by the first local QA run before QA persistence was isolated.
  try {
    const fixture = JSON.parse(localStorage.getItem("breakwater-best"));
    if (fixture?.score === 7628 && fixture.time >= 62 && fixture.time < 62.2)
      localStorage.removeItem("breakwater-best");
  } catch {}
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
    ok(d.getElementById("result-tip").textContent.includes("Hold FLY"));
    d.getElementById("retry").click();
    ok(g.phase === "playing" && g.state.d === 0 && g.state.hull === 3);
  });
  check("Finish awards a medal and ends the run once", () => {
    g.setState({ d: 3599, time: 62, gates: 14, score: 4000 });
    step(0.1);
    ok(g.phase === "results");
    ok(d.getElementById("result-rank").textContent === "GOLD");
    const score = g.state.score;
    step(2);
    ok(g.state.score === score);
  });
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
          title.bottom + 8 <= brief.top,
          `title bottom ${title.bottom}, instructions ${brief.top}`,
        );
        const start = d.getElementById("start").getBoundingClientRect();
        ok(
          start.right <= width && start.bottom <= height && start.height >= 44,
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
            ".hud-top,.speed-block,.reserve-block,#warning,#touch-controls button",
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
      for (const id of ["resume", "restart", "sound", "quality", "motion"]) {
        const r = d.getElementById(id).getBoundingClientRect();
        ok(r.top >= 0 && r.bottom <= height + 1 && r.height >= 44, id);
      }
    });
  }
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
