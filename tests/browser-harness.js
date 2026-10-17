const report = document.querySelector("#report"),
  button = document.querySelector("#run");
button.onclick = async () => {
  button.disabled = true;
  report.textContent = "Loading production build…\n";
  const out = [],
    errors = [];
  let frame;
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const test = async (name, fn) => {
    try {
      await fn();
      out.push("PASS " + name);
    } catch (e) {
      out.push("FAIL " + name + ": " + e.message);
    }
    report.textContent = out.join("\n");
  };
  const saved = new Map(
    ["roadster-flight-lab-best", "roadster-rush-best"].map((k) => [
      k,
      localStorage.getItem(k),
    ]),
  );
  try {
    frame = document.createElement("iframe");
    frame.style.cssText = "width:1440px;height:900px;transform:scale(.5)";
    frame.src = "../dist/index.html?qa=1";
    document.querySelector("#stage").replaceChildren(frame);
    await new Promise((resolve, reject) => {
      frame.onload = resolve;
      frame.onerror = reject;
    });
    const w = frame.contentWindow,
      d = w.document,
      g = w.__roadster;
    assert(g, "Game initialized");
    g.freeze(true);
    w.addEventListener("error", (e) => errors.push(e.message));
    const tick = (seconds) => {
      for (let i = 0; i < Math.ceil(seconds * 120); i++) g.step(1 / 120);
      g.renderFrame(0.06);
    };
    const key = (code, type = "keydown") =>
      w.dispatchEvent(
        new w.KeyboardEvent(type, { code, bubbles: true, cancelable: true }),
      );
    const click = (id) => d.getElementById(id).click();
    const mode = (value) => d.querySelector(`[data-mode="${value}"]`).click();
    const pointer = (el, type, id, x = 0, y = 0) =>
      el.dispatchEvent(
        new w.PointerEvent(type, {
          pointerId: id,
          pointerType: "touch",
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        }),
      );
    await test("Production WebGL starts and renders geometry", () => {
      assert(g.getState().phase === "intro", "Garage visible");
      assert(g.getState().renderer.triangles > 1000, "Geometry rendered");
    });
    click("control-style"); // Exercise the complete manual input path first.
    await test("Keyboard driving, steering and braking", () => {
      click("start");
      tick(3.1);
      key("KeyW");
      tick(2);
      key("KeyW", "keyup");
      const speed = g.getState().state.speed;
      assert(speed > 20, "Throttle accelerates");
      key("KeyA");
      tick(0.4);
      key("KeyA", "keyup");
      key("KeyS");
      tick(0.7);
      key("KeyS", "keyup");
      assert(g.getState().state.speed < speed, "Brakes reduce speed");
    });
    await test("Pause clears held inputs and freezes game time", () => {
      key("KeyW");
      click("pause");
      const t = g.getState().elapsed;
      tick(2);
      assert(g.getState().elapsed === t, "Clock frozen");
      assert(g.getState().input.throttle === 0, "Input released");
      click("resume");
    });
    await test("Photo mode freezes simulation and returns to run", () => {
      click("photo");
      assert(g.getState().phase === "photo", "Photo mode opened");
      const t = g.getState().elapsed;
      tick(2);
      assert(g.getState().elapsed === t, "Photo clock frozen");
      assert(
        !d.querySelector("#photo-panel").classList.contains("hidden"),
        "Photo controls visible",
      );
      click("exit-photo");
      assert(g.getState().phase === "playing", "Returned to play");
    });
    await test("Actual launch → climb → full roll → landing banks a combo", () => {
      click("pause");
      click("garage");
      mode("stunt");
      click("start");
      tick(3.1);
      click("touch-hover");
      key("Space");
      tick(5.7);
      key("Space", "keyup");
      assert(g.getState().state.y > 25, "Climbed above 25 m");
      key("KeyE");
      let t = 0;
      while (g.getState().state.tricks.total < 1 && t < 3.5) {
        tick(0.05);
        t += 0.05;
      }
      key("KeyE", "keyup");
      tick(0.5);
      assert(g.getState().state.tricks.total >= 1, "A full roll completed");
      assert(g.getState().challenge.pending >= 500, "Unbanked combo recorded");
      assert(
        g.getState().challenge.score === 0,
        "Points not prematurely banked",
      );
      key("KeyX");
      tick(0.7);
      key("KeyX", "keyup");
      click("touch-hover");
      t = 0;
      while (
        !g.getState().state.grounded &&
        !g.getState().state.crashed &&
        t < 20
      ) {
        tick(0.1);
        t += 0.1;
      }
      const s = g.getState();
      assert(
        !s.state.crashed,
        "Landed without a crash; reserve " + s.state.charge.toFixed(1),
      );
      assert(s.challenge.score >= 750, "Landing banks rotation + bonus");
    });
    await test("Rush timer ends once and restart clears the run", () => {
      tick(95);
      assert(g.getState().phase === "finished", "Time limit produced results");
      assert(g.getState().challenge.ended, "Scoring locked");
      assert(
        !d.getElementById("save-result").classList.contains("hidden"),
        "Score card available",
      );
      click("restart");
      assert(
        g.getState().challenge.score === 0 &&
          g.getState().challenge.pending === 0,
        "Scores reset",
      );
      assert(g.getState().countdown > 0, "Fresh countdown");
    });
    await test("Independent simultaneous pointers, cancellation and no text selection", () => {
      tick(3.1);
      const go = d.querySelector('[data-control="throttle"]'),
        left = d.querySelector('[data-control="left"]');
      pointer(go, "pointerdown", 201);
      pointer(left, "pointerdown", 202);
      assert(
        g.getState().input.throttle === 1 && g.getState().input.steer === 1,
        "Both inputs held",
      );
      pointer(left, "pointercancel", 202);
      assert(
        g.getState().input.throttle === 1 && g.getState().input.steer === 0,
        "Only cancelled input released",
      );
      pointer(go, "pointerup", 201);
      assert(g.getState().input.throttle === 0, "Throttle released");
      assert(
        w.getComputedStyle(d.body).userSelect === "none",
        "Selection disabled",
      );
      assert(
        !d.dispatchEvent(new w.Event("selectstart", { cancelable: true })),
        "Selection event cancelled",
      );
      assert(
        !d.dispatchEvent(new w.Event("contextmenu", { cancelable: true })),
        "Long press menu cancelled",
      );
    });
    await test("Simple controls: tap launch, roll and land; no manual flight axes", () => {
      click("pause");
      click("control-style");
      click("garage");
      mode("stunt");
      click("start");
      tick(3.1);
      assert(g.getState().easyControls, "Simple pilot enabled");
      click("touch-hover");
      tick(5);
      assert(g.getState().state.y > 28, "Auto climb reaches safe altitude");
      assert(
        !d.getElementById("easy-stunt").disabled,
        "Roll enabled: " + JSON.stringify(g.getState().state),
      );
      click("easy-stunt");
      tick(4.5);
      assert(
        g.getState().state.rolls === 1,
        "Exactly one real roll: " +
          JSON.stringify({
            rolls: g.getState().state.rolls,
            y: g.getState().state.y,
            charge: g.getState().state.charge,
            phase: g.getState().phase,
            crashed: g.getState().state.crashed,
          }),
      );
      click("touch-hover");
      let duration = 0;
      while (
        !g.getState().state.grounded &&
        !g.getState().state.crashed &&
        duration < 20
      ) {
        tick(0.1);
        duration += 0.1;
      }
      const landed = g.getState();
      assert(
        !landed.state.crashed && landed.challenge.score >= 750,
        "Safe landing banks points",
      );
      tick(0.1);
      const reserve = g.getState().state.charge;
      tick(2);
      assert(g.getState().state.charge > reserve, "Parked landing refills");
    });
    for (const [width, height] of [
      [390, 844],
      [375, 667],
      [320, 568],
    ]) {
      await test(`Portrait ${width}×${height}: rotate prompt pauses input and run`, async () => {
        key("ShiftLeft");
        frame.style.width = width + "px";
        frame.style.height = height + "px";
        await new Promise((r) => setTimeout(r, 120));
        const before = g.getState();
        assert(
          before.orientationBlocked && before.phase === "paused",
          "Portrait blocks and pauses",
        );
        assert(
          d.querySelector("#game-shell").inert,
          "Game cannot receive interaction",
        );
        assert(
          w.getComputedStyle(d.querySelector("#rotate-screen")).display ===
            "flex",
          "Rotate prompt visible",
        );
        tick(2);
        key("KeyH");
        click("resume");
        assert(
          g.getState().elapsed === before.elapsed &&
            g.getState().phase === "paused",
          "Clock frozen and resume blocked",
        );
        assert(g.getState().input.boost === false, "Held input cleared");
        frame.style.width = 844 + "px";
        frame.style.height = 390 + "px";
        await new Promise((r) => setTimeout(r, 120));
        assert(
          !g.getState().orientationBlocked && g.getState().phase === "paused",
          "Landscape waits for deliberate resume",
        );
        click("resume");
      });
    }
    const overlap = (a, b) =>
      a.left < b.right - 1 &&
      a.right > b.left + 1 &&
      a.top < b.bottom - 1 &&
      a.bottom > b.top + 1;
    for (const [width, height] of [
      [1440, 900],
      [667, 375],
      [844, 390],
      [568, 320],
    ]) {
      for (const simple of [true, false]) {
        if (g.getState().easyControls !== simple) click("control-style");
        frame.style.width = width + "px";
        frame.style.height = height + "px";
        await new Promise((r) => setTimeout(r, 120));
        await test(`Layout ${width}×${height} ${simple ? "simple" : "manual"}: actions fit and targets stay separate`, () => {
          click("pause");
          click("garage");
          g.snapCamera();
          assert(
            d.documentElement.scrollWidth <= width,
            "No horizontal overflow",
          );
          for (const id of ["start", "aero-preview"]) {
            const r = d.getElementById(id).getBoundingClientRect();
            assert(
              r.top >= 0 &&
                r.bottom <= height + 1 &&
                r.left >= 0 &&
                r.right <= width + 1,
              id + " fits",
            );
          }
          mode("free");
          click("start");
          g.hover();
          tick(0.15);
          g.snapCamera();
          const controls = [
            ...d.querySelectorAll(
              "#touch-controls button,.mobile-utils button,#ground-stick,#flight-stick",
            ),
          ].filter(
            (el) =>
              el.getClientRects().length &&
              w.getComputedStyle(el).visibility !== "hidden",
          );
          for (let i = 0; i < controls.length; i++) {
            const r = controls[i].getBoundingClientRect();
            assert(
              r.top >= 0 &&
                r.bottom <= height + 1 &&
                r.left >= 0 &&
                r.right <= width + 1,
              (controls[i].ariaLabel || controls[i].id) + " fits",
            );
            for (let j = i + 1; j < controls.length; j++)
              assert(
                !overlap(r, controls[j].getBoundingClientRect()),
                controls[i].outerHTML.slice(0, 70) +
                  " overlaps " +
                  controls[j].outerHTML.slice(0, 70),
              );
          }
          click("pause");
          const resumeRect = d.getElementById("resume").getBoundingClientRect();
          assert(
            resumeRect.top >= 0 && resumeRect.bottom <= height,
            "Resume immediately visible without scrolling",
          );
          click("resume");
        });
      }
    }
    await test("No uncaught browser errors", () =>
      assert(errors.length === 0, errors.join("; ")));
    out.push(
      "\n" +
        out.filter((x) => x.startsWith("PASS")).length +
        " passed; " +
        out.filter((x) => x.startsWith("FAIL")).length +
        " failed.",
    );
  } catch (e) {
    out.push("FATAL " + e.stack);
  } finally {
    for (const [k, v] of saved) {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    }
    report.textContent = out.join("\n");
    button.disabled = false;
  }
};
