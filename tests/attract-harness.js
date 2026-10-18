import { COURSES, LAYOUT_VERSION } from "../courses.js";

// This fixture runs through a visible browser button. It uses the isolated QA
// game, real WebGL and the ordinary UI handlers; no personal progress is saved.
const button = document.createElement("button");
button.id = "attract";
button.textContent = "Check driving home preview";
document.getElementById("features").after(button);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const signedAngle = (value) => Math.atan2(Math.sin(value), Math.cos(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const vectorNear = (a, b) =>
  a.length === b.length &&
  a.every((value, i) => Math.abs(value - b[i]) < 0.001);

button.onclick = async () => {
  const report = document.getElementById("report"),
    stage = document.getElementById("stage"),
    errors = [],
    checks = [],
    evidence = {};
  const frame = document.createElement("iframe");
  frame.title = "Driving home preview verification";
  frame.style.cssText = "width:844px;height:390px;border:0";
  frame.src =
    (new URLSearchParams(location.search).has("source") ? "../" : "../dist/") +
    "?qa=1&attract-check=1";
  frame.onload = () => {
    frame.contentWindow.addEventListener("error", (event) =>
      errors.push(event.message),
    );
    frame.contentWindow.addEventListener("unhandledrejection", (event) =>
      errors.push(String(event.reason)),
    );
  };
  button.disabled = true;
  report.textContent = "Checking the driving home preview…\n";
  report.before(stage);
  stage.replaceChildren(frame);
  const ok = (value, message = "Assertion failed") => {
    if (!value) throw Error(message);
  };
  const check = (name, fn) => {
    try {
      fn();
      checks.push({ name, passed: true });
      report.textContent += "PASS " + name + "\n";
    } catch (error) {
      checks.push({ name, passed: false, message: error.message });
      report.textContent += "FAIL " + name + ": " + error.message + "\n";
    }
  };
  let g;
  try {
    for (let i = 0; i < 600 && !frame.contentWindow.__breakwater; i++)
      await wait(50);
    const w = frame.contentWindow,
      d = frame.contentDocument;
    g = w.__breakwater;
    ok(g?.showroom?.drive, "Driving-preview QA hook missing");
    g.freeze();
    const advance = (seconds, dt = 1 / 30) => {
      for (let i = 0; i < Math.ceil(seconds / dt); i++) g.step(dt);
    };
    const visible = async () => {
      for (let i = 0; i < 200 && d.hidden; i++) await wait(50);
      ok(!d.hidden, "The QA tab must be visible for preview motion checks");
    };
    const pose = () => ({
      drive: { ...g.showroom.drive },
      position: [...g.carPose.position],
      wheels: [...g.carPose.wheels],
    });
    const setReduced = (value) => {
      d.getElementById("settings").click();
      if ((d.querySelector("#motion b").textContent === "REDUCED") !== value)
        d.getElementById("motion").click();
      d.getElementById("resume").click();
      g.step(0);
    };
    setReduced(false);
    await visible();
    g.home();
    g.step(0);
    const venuesOnly = new URLSearchParams(location.search).has(
      "attract-venues",
    );
    if (new URLSearchParams(location.search).has("attract-interactions")) {
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
      advance(0.4);
      d.getElementById("paint").click();
      advance(1.5);
      const interrupted = { ...pose(), angle: g.showroom.angle };
      d.getElementById("settings").click();
      advance(1);
      check(
        "Settings holds an interrupted paint turn and its scenery still",
        () => {
          ok(Math.abs(signedAngle(interrupted.angle)) > 0.1);
          ok(g.phase === "paused" && !g.showroom.drive.moving);
          ok(g.showroom.drive.distance === interrupted.drive.distance);
          ok(
            Math.abs(signedAngle(g.showroom.angle - interrupted.angle)) < 0.001,
          );
        },
      );
      d.getElementById("resume").click();
      advance(1);
      evidence.paintResume = {
        interrupted,
        resumed: { ...pose(), angle: g.showroom.angle },
      };
      check(
        "Resuming an interrupted paint turn aligns the car before driving",
        () => {
          ok(Math.abs(signedAngle(g.showroom.angle)) < 0.001);
          ok(!g.showroom.autoRotating && g.showroom.drive.moving);
          ok(g.showroom.drive.distance > interrupted.drive.distance);
          ok(g.state.d === 80 && g.state.speed === 0);
        },
      );

      setReduced(true);
      d.getElementById("orbit-car").click();
      advance(1);
      const quarter = { ...pose(), angle: g.showroom.angle };
      check(
        "Reduced-motion inspection makes a static quarter-turn view",
        () => {
          ok(Math.abs(signedAngle(quarter.angle) - Math.PI / 2) < 0.001);
          ok(!quarter.drive.moving && !g.showroom.autoRotating);
        },
      );
      setReduced(false);
      advance(1);
      evidence.motionResume = {
        reduced: quarter,
        resumed: { ...pose(), angle: g.showroom.angle },
      };
      check(
        "Restoring full motion aligns the inspected car before driving",
        () => {
          ok(Math.abs(signedAngle(g.showroom.angle)) < 0.001);
          ok(!g.showroom.autoRotating && g.showroom.drive.moving);
          ok(g.showroom.drive.distance > quarter.drive.distance);
        },
      );

      frame.style.width = "568px";
      frame.style.height = "320px";
      await wait(180);
      d.getElementById("orbit-car").click();
      advance(1.3);
      evidence.compactControls = ["orbit-car", "paint"].map((id) => {
        const element = d.getElementById(id),
          box = element.getBoundingClientRect();
        return {
          id,
          text: element.textContent.trim(),
          label: element.getAttribute("aria-label"),
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          inside:
            box.left >= 0 &&
            box.top >= 0 &&
            box.right <= 568 &&
            box.bottom <= 320,
        };
      });
      check(
        "Compact paint and Resume Drive controls fit and are at least 44px tall",
        () => {
          ok(/resume drive/i.test(evidence.compactControls[0].text));
          for (const item of evidence.compactControls)
            ok(
              item.inside && item.width >= 44 && item.height >= 44,
              JSON.stringify(item),
            );
        },
      );
      check("Targeted inspection transitions raise no browser errors", () => {
        ok(errors.length === 0, errors.join("; "));
      });
      return;
    }
    if (!venuesOnly) {
      const raceBefore = JSON.stringify(g.state),
        recordsBefore = JSON.stringify(g.records),
        careerBefore = JSON.stringify(g.career),
        start = pose();
      advance(2.4);
      const moved = pose();
      evidence.stepped = { start, moved };
      check(
        "Home advances the car along the road for more than two seconds",
        () => {
          ok(g.phase === "home" && moved.drive.moving);
          ok(moved.drive.distance > start.drive.distance + 20);
          ok(moved.position[2] < start.position[2] - 20);
          ok(Math.abs(moved.position[2] + moved.drive.distance) < 0.01);
          ok(g.drawCalls > 0);
        },
      );
      check("All rendered wheels turn with the driving preview", () => {
        ok(start.wheels.length === 4, "Expected four wheel observables");
        ok(
          moved.wheels.every(
            (value, i) => Math.abs(value - start.wheels[i]) > 1,
          ),
        );
      });
      check(
        "Preview motion leaves race distance, score, HP and saved progress untouched",
        () => {
          ok(JSON.stringify(g.state) === raceBefore);
          ok(g.state.d === 80 && g.state.speed === 0 && g.state.time === 0);
          ok(JSON.stringify(g.records) === recordsBefore);
          ok(JSON.stringify(g.career) === careerBefore);
        },
      );

      const liveStart = pose();
      g.freeze(false);
      await wait(2400);
      g.freeze();
      const liveEnd = pose();
      evidence.live = { elapsedMs: 2400, start: liveStart, end: liveEnd };
      check("Ordinary animation frames also drive the home preview", () => {
        ok(liveEnd.drive.distance > liveStart.drive.distance + 20);
        ok(liveEnd.position[2] < liveStart.position[2] - 20);
        ok(!vectorNear(liveStart.wheels, liveEnd.wheels));
        ok(JSON.stringify(g.state) === raceBefore);
      });

      d.getElementById("settings").click();
      g.step(0);
      const inSettings = pose();
      advance(1.5);
      check("Opening settings holds the scenery, car and wheels still", () => {
        const after = pose();
        ok(g.phase === "paused" && !after.drive.moving);
        ok(after.drive.distance === inSettings.drive.distance);
        ok(vectorNear(after.position, inSettings.position));
        ok(vectorNear(after.wheels, inSettings.wheels));
      });
      d.getElementById("resume").click();
      g.step(0);
      const resumed = g.showroom.drive.distance;
      advance(1);
      check("Returning from settings restores the driving preview", () => {
        ok(g.phase === "home" && g.showroom.drive.moving);
        ok(g.showroom.drive.distance > resumed + 10);
      });

      const inspected = pose();
      d.getElementById("orbit-car").click();
      advance(1.4);
      check("View Car pauses driving and offers Resume Drive", () => {
        const after = pose();
        ok(!after.drive.moving);
        ok(after.drive.distance === inspected.drive.distance);
        ok(vectorNear(after.position, inspected.position));
        ok(vectorNear(after.wheels, inspected.wheels));
        ok(/resume drive/i.test(d.getElementById("orbit-car").textContent));
      });
      advance(1.5);
      check(
        "An inspected car remains parked until Resume Drive is chosen",
        () => {
          ok(g.showroom.drive.distance === inspected.drive.distance);
          ok(!g.showroom.drive.moving);
        },
      );
      d.getElementById("orbit-car").click();
      advance(1.5);
      check("Resume Drive returns to the moving road view", () => {
        ok(g.showroom.drive.moving);
        ok(g.showroom.drive.distance > inspected.drive.distance + 10);
        ok(/view car/i.test(d.getElementById("orbit-car").textContent));
      });

      // Unlock paint only in this QA game's isolated in-memory records.
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
      advance(0.4);
      const paintPosition = pose(),
        paintBefore = g.showroom.paintIndex;
      d.getElementById("paint").click();
      let last = g.showroom.angle,
        turn = 0,
        largestStep = 0;
      for (let i = 0; i < 170; i++) {
        g.step(1 / 30);
        const delta = signedAngle(g.showroom.angle - last);
        turn += delta;
        largestStep = Math.max(largestStep, Math.abs(delta));
        last = g.showroom.angle;
        if (i === 30)
          check(
            "Changing paint parks the moving car for its inspection turn",
            () => {
              const during = pose();
              ok(
                g.showroom.paintIndex !== paintBefore &&
                  g.showroom.autoRotating,
              );
              ok(!during.drive.moving);
              ok(during.drive.distance === paintPosition.drive.distance);
              ok(vectorNear(during.position, paintPosition.position));
              ok(vectorNear(during.wheels, paintPosition.wheels));
            },
          );
      }
      check(
        "Paint completes one smooth full turn and automatically resumes driving",
        () => {
          ok(
            Math.abs(turn - Math.PI * 2) < 0.06,
            "Paint did not make one full turn",
          );
          ok(largestStep < 0.22, "Paint turn snapped between frames");
          ok(!g.showroom.autoRotating && g.showroom.drive.moving);
          ok(g.showroom.drive.distance > paintPosition.drive.distance);
        },
      );

      const canvas = d.getElementById("scene"),
        pointer = {
          pointerId: 57,
          pointerType: "touch",
          bubbles: true,
          cancelable: true,
        };
      for (const [type, clientX] of [
        ["pointerdown", 400],
        ["pointermove", 455],
        ["pointerup", 455],
      ])
        canvas.dispatchEvent(
          new w.PointerEvent(type, { ...pointer, clientX, clientY: 160 }),
        );
      g.step(0);
      const dragged = pose();
      advance(1.5);
      check(
        "Dragging the car pauses the preview without selecting page text",
        () => {
          ok(!g.showroom.drive.moving);
          ok(g.showroom.drive.distance === dragged.drive.distance);
          ok(/resume drive/i.test(d.getElementById("orbit-car").textContent));
          ok(w.getSelection().toString() === "");
        },
      );
      d.getElementById("orbit-car").click();
      advance(1);

      setReduced(true);
      const reducedPose = pose();
      d.getElementById("paint").click();
      advance(2.5);
      check(
        "Reduced motion keeps the garage static and suppresses automatic paint rotation",
        () => {
          const after = pose();
          ok(!after.drive.moving && after.drive.speed === 0);
          ok(after.drive.distance === reducedPose.drive.distance);
          ok(vectorNear(after.position, reducedPose.position));
          ok(vectorNear(after.wheels, reducedPose.wheels));
          ok(!g.showroom.autoRotating);
        },
      );
      setReduced(false);
      advance(1);
      check("Restoring full motion enables the driving preview again", () => {
        ok(g.showroom.drive.moving && g.showroom.drive.speed > 0);
      });

      frame.style.width = "390px";
      frame.style.height = "844px";
      await wait(180);
      g.step(0);
      const portrait = pose();
      advance(2);
      check(
        "Portrait guidance stops preview motion behind the rotate screen",
        () => {
          ok(g.blocked && !d.getElementById("rotate").hidden);
          ok(!g.showroom.drive.moving);
          ok(g.showroom.drive.distance === portrait.drive.distance);
          ok(vectorNear(g.carPose.wheels, portrait.wheels));
        },
      );
      frame.style.width = "844px";
      frame.style.height = "390px";
      await wait(180);
      advance(1);
      check("Returning to landscape restores the preview", () => {
        ok(!g.blocked && g.showroom.drive.moving);
        ok(g.showroom.drive.distance > portrait.drive.distance + 10);
      });

      d.getElementById("settings").click();
      if (!g.saver) d.getElementById("saver").click();
      d.getElementById("resume").click();
      g.step(0);
      const saverStart = g.showroom.drive.distance;
      g.freeze(false);
      await wait(1200);
      g.freeze();
      check(
        "Battery saver remains enabled while the preview continues driving",
        () => {
          ok(g.saver && /30 FPS/.test(d.getElementById("saver").textContent));
          ok(g.showroom.drive.distance > saverStart + 10);
          ok(g.state.d === 80 && g.state.speed === 0);
        },
      );
      d.getElementById("settings").click();
      d.getElementById("saver").click();
      d.getElementById("resume").click();
    }

    evidence.venues = [];
    for (const course of COURSES) {
      await g.selectCourse(course.id);
      await visible();
      g.step(0);
      const before = pose();
      advance(2.4);
      const after = pose();
      evidence.venues.push({
        id: course.id,
        start: before.drive,
        end: after.drive,
        selected: g.course.id,
        phase: g.phase,
        hidden: d.hidden,
        blocked: g.blocked,
        loading: g.loadingState.active,
        race: { d: g.state.d, speed: g.state.speed, time: g.state.time },
      });
      check(course.name + " has an independent working home drive", () => {
        ok(g.course.id === course.id && g.phase === "home");
        ok(
          after.drive.moving &&
            after.drive.distance > before.drive.distance + 20,
        );
        ok(g.state.d === 80 && g.state.speed === 0 && g.state.time === 0);
        ok(!g.loadingState.active && d.getElementById("loading").hidden);
      });
    }
    if (venuesOnly) return;

    await g.selectCourse(COURSES[0].id);
    g.home();
    g.step(0);
    const loopRace = JSON.stringify(g.state),
      loopCareer = JSON.stringify(g.career),
      loopRecords = JSON.stringify(g.records),
      memories = [];
    let maxFade = 0;
    // Two complete private loops exercise scenery pooling and end-of-route
    // reset. The ordinary game simulation is untouched; no QA teleport is used.
    for (let target = 1; target <= 2; target++) {
      for (let i = 0; i < 2200 && g.showroom.drive.cycles < target; i++) {
        g.step(0.1);
        maxFade = Math.max(maxFade, g.showroom.drive.fade);
        if (i % 20 === 0) {
          await wait(0);
          await visible();
        }
      }
      memories.push({
        cycles: g.showroom.drive.cycles,
        memory: { ...g.memory },
      });
    }
    evidence.loops = { maxFade, memories, final: { ...g.showroom.drive } };
    check("The private driving route loops through a bounded fade", () => {
      ok(g.showroom.drive.cycles >= 2, "Two route loops did not complete");
      ok(maxFade > 0.5 && maxFade <= 1);
      ok(Number.isFinite(g.showroom.drive.distance + g.showroom.drive.speed));
    });
    check("Repeated home-driving loops reuse geometry and textures", () => {
      ok(
        same(memories[0].memory, memories[1].memory),
        JSON.stringify(memories),
      );
    });
    check(
      "Full preview loops never award score, damage or career progress",
      () => {
        ok(JSON.stringify(g.state) === loopRace);
        ok(JSON.stringify(g.career) === loopCareer);
        ok(JSON.stringify(g.records) === loopRecords);
      },
    );

    g.start();
    g.step(0);
    check("Starting a race creates a fresh grid and countdown", () => {
      ok(g.phase === "playing" && !g.showroom.autoRotating);
      ok(g.state.d === 0 && g.state.time === 0 && g.state.score === 0);
      ok(g.state.hull === 3 && g.countdown > 0);
      ok(g.replaySamples.length === 1);
      ok(!d.getElementById("hud").hidden && d.getElementById("home").hidden);
    });
    const raceDrive = g.showroom.drive.distance;
    advance(2);
    check(
      "Racing advances the real run while the home preview is inactive",
      () => {
        ok(!g.showroom.drive.moving);
        ok(g.showroom.drive.distance === raceDrive);
        ok(g.state.d > 0 && g.state.time > 0);
      },
    );
    g.home();
    advance(1);
    check("Returning home starts a usable driving preview again", () => {
      ok(g.phase === "home" && g.showroom.drive.moving);
      ok(g.state.d === 80 && g.state.speed === 0);
      ok(!g.loadingState.active);
    });
    check("The complete preview flow raises no browser errors", () => {
      ok(errors.length === 0, errors.join("; "));
    });
  } catch (error) {
    checks.push({
      name: "Fixture execution",
      passed: false,
      message: error.stack,
    });
  } finally {
    g?.freeze();
    const result = {
      checks,
      passed: checks.filter((item) => item.passed).length,
      failed: checks.filter((item) => !item.passed).length,
      errors,
      evidence,
    };
    report.textContent = JSON.stringify(result, null, 2);
    button.disabled = false;
  }
};
