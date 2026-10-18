import { COURSES, LAYOUT_VERSION } from "../courses.js";

// Focused DOM/WebGL checks. Synthetic drag events verify state transitions;
// physical touch comfort and mobile GPU performance still need real devices.
const button = document.createElement("button");
button.id = "showroom";
button.textContent = "Check loading and paint showroom";
document.getElementById("features").after(button);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const root = new URLSearchParams(location.search).has("source")
  ? "../"
  : "../dist/";
const signedAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

button.onclick = async () => {
  const report = document.getElementById("report"),
    stage = document.getElementById("stage");
  let passed = 0,
    failed = 0;
  button.disabled = true;
  report.textContent = "Checking staged loading and the paint turntable…\n";
  let bootObserver,
    bootEnterAttempted = false,
    bootEnterBlocked = false,
    bootContentInert = false;
  const frame = document.createElement("iframe");
  frame.onload = () => {
    const w = frame.contentWindow,
      d = frame.contentDocument,
      meter = d.getElementById("loading-meter");
    if (!meter) return;
    const attempt = () => {
      if (
        bootEnterAttempted ||
        d.getElementById("loading").hidden ||
        +meter.getAttribute("aria-valuenow") < 85
      )
        return;
      bootEnterAttempted = true;
      bootContentInert = d.getElementById("app").inert;
      w.dispatchEvent(
        new w.KeyboardEvent("keydown", {
          code: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
      bootEnterBlocked = d.body.dataset.phase === "home";
    };
    bootObserver = new w.MutationObserver(attempt);
    bootObserver.observe(meter, {
      attributes: true,
      attributeFilter: ["aria-valuenow"],
    });
    attempt();
  };
  frame.style.cssText = "width:844px;height:390px;border:0";
  frame.src = root + "?qa=1&showroom-check=1";
  stage.replaceChildren(frame);
  const ok = (value, message = "Assertion failed") => {
    if (!value) throw Error(message);
  };
  const check = (name, fn) => {
    try {
      fn();
      passed++;
      report.textContent += "PASS " + name + "\n";
    } catch (error) {
      failed++;
      report.textContent += "FAIL " + name + ": " + error.message + "\n";
    }
  };
  try {
    for (let i = 0; i < 600 && !frame.contentWindow.__breakwater; i++)
      await wait(50);
    const w = frame.contentWindow,
      d = frame.contentDocument,
      g = w.__breakwater;
    ok(g, "Game initialization timed out");
    bootObserver?.disconnect();
    g.freeze();
    ok(g.showroom && g.loadingState, "Showroom/loading QA hooks missing");
    const errors = [];
    w.addEventListener("error", (event) => errors.push(event.message));
    w.addEventListener("unhandledrejection", (event) =>
      errors.push(String(event.reason)),
    );
    const advance = (seconds) => {
      for (let i = 0; i < Math.ceil(seconds * 30); i++) g.step(1 / 30);
    };
    const assertHistory = (history) => {
      ok(history.length >= 4, "Real loading stages were not recorded");
      ok(new Set(history.map((entry) => entry.stage)).size >= 3);
      let previous = -1;
      for (const entry of history) {
        ok(typeof entry.stage === "string" && entry.stage.length > 0);
        ok(Number.isFinite(entry.progress));
        ok(entry.progress >= 0 && entry.progress <= 100);
        ok(entry.progress >= previous, "Progress moved backwards");
        previous = entry.progress;
      }
      ok(previous === 100, "Completion was not recorded after rendering");
    };
    check(
      "Boot reports ordered real stages and completes after a rendered frame",
      () => {
        assertHistory(g.loadingState.history);
        ok(!g.loadingState.active && g.loadingState.progress === 100);
        ok(g.drawCalls > 0 && g.firstReadyAt > 0);
        ok(d.getElementById("loading").hidden);
        ok(g.initialVenueCount === 1, "Boot eagerly prepared extra venues");
      },
    );
    check(
      "Enter during boot lighting cannot start a race behind the inert loader",
      () => {
        ok(bootEnterAttempted, "The early-boot guard was not exercised");
        ok(bootEnterBlocked && bootContentInert && g.phase === "home");
      },
    );
    check("The loader exposes accessible determinate progress", () => {
      const meter = d.querySelector('#loading [role="progressbar"]');
      ok(meter, "No progressbar role");
      ok(+meter.getAttribute("aria-valuemin") === 0);
      ok(+meter.getAttribute("aria-valuemax") === 100);
      ok(+meter.getAttribute("aria-valuenow") === 100);
      ok(
        meter.hasAttribute("aria-label") ||
          meter.hasAttribute("aria-labelledby"),
      );
    });

    const first = g.course.id,
      second = COURSES.find((course) => course.id !== first).id;
    const pending = g.selectCourse(second);
    check("An uncached venue shows progress and guards race start", () => {
      ok(g.loadingState.active && g.loadingState.progress < 100);
      ok(!d.getElementById("loading").hidden);
      ok(d.body.dataset.preparing === "true");
      ok(
        d.getElementById("app").inert,
        "Underlying controls remain accessible while loading",
      );
      g.start();
      ok(g.phase === "home", "Race started before the world was ready");
    });
    check("The active loader fits a 844×390 landscape phone viewport", () => {
      const box = d.getElementById("loading").getBoundingClientRect();
      ok(box.width > 0 && box.height > 0);
      ok(
        box.left >= 0 && box.top >= 0 && box.right <= 844 && box.bottom <= 390,
      );
      for (const node of d.querySelectorAll(
        "#loading strong, #loading [role=progressbar]",
      )) {
        const r = node.getBoundingClientRect();
        ok(r.left >= 0 && r.right <= 844 && r.top >= 0 && r.bottom <= 390);
      }
    });
    await g.selectCourse(first);
    await pending;
    check(
      "Cancelling an uncached load cannot replace the newly selected venue",
      () => {
        ok(g.course.id === first && g.phase === "home");
        ok(!g.loadingState.active && d.getElementById("loading").hidden);
        ok(d.body.dataset.preparing !== "true");
      },
    );
    await g.selectCourse(second);
    check(
      "A completed venue switch hides loading only after the new world renders",
      () => {
        ok(g.course.id === second && g.drawCalls > 0);
        ok(!g.loadingState.active && g.loadingState.progress === 100);
        ok(d.getElementById("loading").hidden);
        ok(d.body.dataset.preparing !== "true");
      },
    );
    await g.selectCourse(first);
    check(
      "A cached selection returns directly to a usable start screen",
      () => {
        ok(g.course.id === first && g.phase === "home");
        ok(!g.loadingState.active && d.getElementById("loading").hidden);
        ok(
          !d.getElementById("home").inert &&
            !d.getElementById("start").disabled,
        );
      },
    );

    // Seed earned finishes through the existing QA records object. This keeps
    // paint unlock rules intact and does not write browser storage in qa mode.
    for (const course of COURSES)
      g.records[course.id] = {
        layout: LAYOUT_VERSION,
        medal: 1,
        time: 100,
        score: 1000,
        badges: [true, false, false],
        ghost: [],
      };
    g.home();
    const setReduced = (value) => {
      d.getElementById("settings").click();
      const isReduced = d.querySelector("#motion b").textContent === "REDUCED";
      if (isReduced !== value) d.getElementById("motion").click();
      d.getElementById("resume").click();
      g.step(0);
    };
    setReduced(false);
    const paint = d.getElementById("paint");
    check(
      "Unlocked paint and view controls remain readable landscape touch targets",
      () => {
        ok(!paint.disabled);
        for (const id of ["paint", "orbit-car"]) {
          const el = d.getElementById(id),
            box = el.getBoundingClientRect();
          ok(box.height >= 44 && box.width >= 44, id + " is too small");
          ok(
            box.left >= 0 &&
              box.right <= 844 &&
              box.top >= 0 &&
              box.bottom <= 390,
          );
        }
      },
    );

    const before = g.showroom,
      position = [...g.carPose.position],
      yaw = g.carPose.rotation[1];
    paint.click();
    check(
      "Changing paint starts its automatic turn without an orientation snap",
      () => {
        ok(g.showroom.paintIndex !== before.paintIndex);
        ok(g.showroom.paintName === d.getElementById("paint-name").textContent);
        ok(g.showroom.autoRotating);
        ok(Math.abs(signedAngle(g.showroom.angle - before.angle)) < 0.001);
      },
    );
    let total = 0,
      largestStep = 0,
      last = g.showroom.angle;
    for (let i = 0; i < 180; i++) {
      g.step(1 / 30);
      const delta = signedAngle(g.showroom.angle - last);
      total += delta;
      largestStep = Math.max(largestStep, Math.abs(delta));
      last = g.showroom.angle;
      if (i === 30)
        check(
          "The car rotates in place while the venue and car position stay fixed",
          () => {
            ok(Math.abs(signedAngle(g.carPose.rotation[1] - yaw)) > 0.1);
            ok(
              g.carPose.position.every(
                (v, n) => Math.abs(v - position[n]) < 0.001,
              ),
            );
            ok(g.state.speed === 0 && g.state.d === 80);
          },
        );
    }
    check("One paint preview makes a smooth full turn and then rests", () => {
      ok(
        Math.abs(total - Math.PI * 2) < 0.05,
        "Preview did not complete one revolution",
      );
      ok(largestStep < 0.22, "Turn snapped between frames");
      ok(!g.showroom.autoRotating);
      const rest = g.showroom.angle;
      advance(1);
      ok(Math.abs(signedAngle(g.showroom.angle - rest)) < 0.001);
    });

    paint.click();
    advance(0.7);
    const interrupted = g.showroom.angle;
    paint.click();
    check(
      "Rapid paint changes restart smoothly from the visible orientation",
      () => {
        ok(Math.abs(signedAngle(g.showroom.angle - interrupted)) < 0.001);
        ok(g.showroom.autoRotating);
        advance(0.2);
        ok(signedAngle(g.showroom.angle - interrupted) > 0);
        advance(6);
        ok(!g.showroom.autoRotating);
      },
    );

    const manualStart = g.showroom.angle;
    d.getElementById("orbit-car").click();
    check("View Car eases through a quarter turn", () => {
      ok(Math.abs(signedAngle(g.showroom.angle - manualStart)) < 0.01);
      advance(2);
      ok(
        Math.abs(signedAngle(g.showroom.angle - manualStart) - Math.PI / 2) <
          0.02,
      );
      ok(!g.showroom.autoRotating);
    });

    paint.click();
    advance(0.3);
    const canvas = d.getElementById("scene"),
      pointer = {
        pointerId: 41,
        pointerType: "touch",
        bubbles: true,
        cancelable: true,
      };
    canvas.dispatchEvent(
      new w.PointerEvent("pointerdown", {
        ...pointer,
        clientX: 400,
        clientY: 160,
      }),
    );
    canvas.dispatchEvent(
      new w.PointerEvent("pointermove", {
        ...pointer,
        clientX: 455,
        clientY: 160,
      }),
    );
    canvas.dispatchEvent(
      new w.PointerEvent("pointerup", {
        ...pointer,
        clientX: 455,
        clientY: 160,
      }),
    );
    check(
      "Dragging the car cancels automatic rotation and retains the chosen view",
      () => {
        ok(!g.showroom.autoRotating);
        const held = g.showroom.angle;
        advance(0.8);
        ok(Math.abs(signedAngle(g.showroom.angle - held)) < 0.001);
        ok(w.getSelection().toString() === "", "Dragging selected page text");
      },
    );

    setReduced(true);
    const reducedStart = g.showroom.angle;
    paint.click();
    check("Reduced motion changes paint without an automatic turn", () => {
      advance(0.7);
      ok(!g.showroom.autoRotating);
      ok(Math.abs(signedAngle(g.showroom.angle - reducedStart)) < 0.001);
    });
    d.getElementById("orbit-car").click();
    check(
      "Reduced-motion View Car changes the view once without animation",
      () => {
        ok(
          Math.abs(signedAngle(g.showroom.angle - reducedStart) - Math.PI / 2) <
            0.02,
        );
        ok(!g.showroom.autoRotating);
      },
    );
    setReduced(false);
    const memory = g.memory;
    for (let i = 0; i < 12; i++) {
      paint.click();
      g.step(0.05);
    }
    check("Repeated paint previews reuse car geometry and textures", () => {
      ok(g.memory.geometries === memory.geometries);
      ok(g.memory.textures === memory.textures);
    });
    g.start();
    g.step(0);
    check(
      "Starting a race cancels the turntable and restores the driving orientation",
      () => {
        ok(g.phase === "playing" && !g.showroom.autoRotating);
        ok(Math.abs(signedAngle(g.showroom.angle)) < 0.001);
        ok(!d.getElementById("hud").hidden && d.getElementById("home").hidden);
      },
    );
    g.home();
    g.step(0);
    check(
      "Returning home leaves a stationary ready showroom and no stale loader",
      () => {
        ok(
          g.phase === "home" && !g.showroom.autoRotating && g.state.speed === 0,
        );
        ok(!g.loadingState.active && d.getElementById("loading").hidden);
      },
    );
    check(
      "The loading and showroom flow raises no uncaught browser errors",
      () => {
        ok(errors.length === 0, errors.join("; "));
      },
    );
  } catch (error) {
    failed++;
    report.textContent += "FAIL " + error.stack + "\n";
  } finally {
    bootObserver?.disconnect();
    report.textContent += `\n${passed} passed · ${failed} failed.\n`;
    button.disabled = false;
  }
};
