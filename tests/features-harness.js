import { decodeChallenge } from "../challenges.js";
import { driveInput } from "./driver.js";
const report = document.getElementById("report"),
  stage = document.getElementById("stage");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const gameRoot = new URLSearchParams(location.search).has("source")
  ? "../"
  : "../dist/";
document.getElementById("features").onclick = async () => {
  let passed = 0,
    failed = 0;
  report.textContent =
    "Checking race, daily event, challenge links and replay…\n";
  stage.replaceChildren();
  const ok = (v, m = "Assertion failed") => {
    if (!v) throw Error(m);
  };
  const check = (name, fn) => {
    try {
      fn();
      passed++;
      report.textContent += "PASS " + name + "\n";
    } catch (e) {
      failed++;
      report.textContent += "FAIL " + name + ": " + e.message + "\n";
    }
  };
  const frame = document.createElement("iframe");
  frame.style.cssText = "width:844px;height:390px;border:0";
  frame.src = gameRoot + "?qa=1";
  stage.append(frame);
  const ready = async () => {
    for (let i = 0; i < 600 && !frame.contentWindow.__breakwater; i++)
      await wait(50);
    ok(frame.contentWindow.__breakwater, "Initialization timed out");
    return frame.contentWindow.__breakwater;
  };
  try {
    let g = await ready(),
      w = frame.contentWindow,
      d = w.document;
    g.freeze();
    check("First playable menu prepares only the selected venue", () =>
      ok(g.initialVenueCount === 1),
    );
    const first = g.course.id,
      target = first === "breakwater" ? "nightshift" : "breakwater";
    const pending = g.selectCourse(target);
    g.start();
    check("Start is guarded during an uncached venue transition", () =>
      ok(g.phase === "home"),
    );
    await g.selectCourse(first);
    await pending;
    check(
      "Cancelling an uncached transition clears the loader and keeps the chosen venue",
      () =>
        ok(
          g.course.id === first &&
            d.getElementById("loading").hidden &&
            d.body.dataset.preparing !== "true",
        ),
    );
    await g.prepareVenues();
    await g.startDaily();
    g.setState({});
    check("Daily event selects its venue and deterministic opponent seed", () =>
      ok(
        g.activeEvent &&
          g.course.id === g.activeEvent.courseId &&
          g.state.eventSeed === g.activeEvent.seed &&
          g.raceMode === "daily",
      ),
    );
    g.step(1 / 60);
    check(
      "Race position and three color-matched opponent markers are rendered",
      () => {
        ok(g.state.rivals.length === 3);
        ok(d.querySelectorAll("#map-rivals circle").length === 3);
        ok(+d.getElementById("race-position").textContent >= 1);
      },
    );
    const records = JSON.stringify(g.records);
    g.setState({
      d: g.course.length - 1,
      time: g.course.gold - 1,
      gates: g.course.gates.length,
      hull: 3,
    });
    g.step(0.05);
    check(
      "Daily results preserve ordinary course records and show the daily outcome",
      () =>
        ok(
          g.phase === "results" &&
            JSON.stringify(g.records) === records &&
            d.getElementById("result-kicker").textContent.includes("UTC"),
        ),
    );
    g.shareChallenge();
    const dailyPayload = new URL(
        d.getElementById("challenge-url").value,
      ).hash.slice(6),
      dailyGhost = decodeChallenge(dailyPayload);
    check("Daily ghost preserves its event and deterministic seed", () =>
      ok(
        dailyGhost.event.day === g.activeEvent.day &&
          dailyGhost.event.seed === g.state.eventSeed,
      ),
    );
    g.home();
    await g.selectCourse("breakwater");
    g.start();
    g.setState({
      d: 100,
      time: 10,
      y: 5,
      vy: 6,
      airborne: true,
      energy: 100,
      rollTime: 0.6,
      roll: 1.5,
      flight: null,
      attachedRamp: -1,
    });
    g.step(0.12);
    const airbornePose = [...g.carPose.rotation],
      airborneTime = g.state.time;
    g.setState({ time: 10.22 });
    g.step(0.12);
    g.setState({
      time: 10.5,
      vy: 0,
      rollTime: 0,
      roll: 0,
      rollAcceleration: 0,
    });
    g.step(0.12);
    const filmStart = Math.max(
      g.replaySamples[0][0],
      g.replaySamples.at(-1)[0] - 10,
    );
    g.startFilm();
    g.step(airborneTime - filmStart + 0.0001);
    check(
      "Replay preserves manual flight pitch and sky-gate roll orientation",
      () => {
        const replayPose = g.carPose.rotation;
        ok(
          Math.abs(replayPose[0] - airbornePose[0]) < 0.005,
          "Manual flight pitch changed in replay",
        );
        ok(
          Math.abs(replayPose[2] - airbornePose[2]) < 0.005,
          "Sky-gate roll disappeared or changed in replay",
        );
        ok(
          g.replaySamples[1].length === 67,
          "Manual flight channels were not captured",
        );
      },
    );
    const turnSamples = g.replaySamples,
      turnTail = 21 + g.state.rivals.length * 14,
      turnMid = (turnSamples[2][0] + turnSamples[3][0]) / 2,
      expectedTurn =
        turnSamples[2][turnTail + 2] +
        (Math.PI * 2 - turnSamples[2][turnTail + 2]) * 0.5;
    g.step(turnMid - airborneTime - 0.0001);
    check(
      "Replay completes the sky-gate roll forward without a backward spin",
      () => ok(Math.abs(g.carPose.rotation[2] - expectedTurn) < 0.005),
    );
    g.stopFilm();
    g.home();
    g.start();
    g.setState({ d: g.course.length - 550, time: 65, energy: 100 });
    for (let i = 0; i < 1800 && !g.state.finished && !g.state.failed; i++) {
      const input = driveInput(g.state);
      for (const [code, on] of [
        ["ArrowLeft", input.steer < -0.04],
        ["ArrowRight", input.steer > 0.04],
        ["Space", input.fly],
        ["ShiftLeft", input.boost],
      ])
        w.dispatchEvent(
          new w.KeyboardEvent(on ? "keydown" : "keyup", {
            code,
            bubbles: true,
            cancelable: true,
          }),
        );
      g.step(1 / 60);
      if (i % 60 === 0) await wait(1);
    }
    check("Finish captures a replay and a race position", () =>
      ok(
        g.state.finished &&
          g.replaySamples.length > 50 &&
          d.getElementById("result-position").textContent.includes("/ 4"),
      ),
    );
    const stable = JSON.stringify({
      time: g.state.time,
      score: g.state.score,
      records: g.records,
    });
    g.startFilm();
    g.step(2);
    check(
      "Replay advances the visible film without modifying race results or records",
      () =>
        ok(
          g.phase === "replay" &&
            stable ===
              JSON.stringify({
                time: g.state.time,
                score: g.state.score,
                records: g.records,
              }) &&
            d.getElementById("replay-clock").textContent.length > 5,
        ),
    );
    g.stopFilm();
    g.shareChallenge();
    const url = d.getElementById("challenge-url").value,
      payload = new URL(url).hash.slice(6),
      decoded = decodeChallenge(payload);
    check("A completed run produces a valid bounded shareable ghost link", () =>
      ok(
        decoded.courseId === g.course.id &&
          decoded.samples.length > 20 &&
          url.length < 6200,
      ),
    );
    d.getElementById("close-challenge").click();
    check(
      "Replay and challenge actions fit the landscape result screen",
      () => {
        for (const id of ["watch-replay", "share-challenge", "retry"]) {
          const r = d.getElementById(id).getBoundingClientRect();
          ok(
            r.top >= 0 &&
              r.bottom <= 390 &&
              r.left >= 0 &&
              r.right <= 844 &&
              r.height >= 44,
            id,
          );
        }
      },
    );
    await new Promise((resolve) => {
      frame.onload = resolve;
      frame.src = gameRoot + "?qa=1&challenge-preview=1#race=" + payload;
    });
    g = await ready();
    w = frame.contentWindow;
    d = w.document;
    g.freeze();
    check(
      "Opening a challenge selects its course and displays the target time",
      () =>
        ok(
          g.course.id === decoded.courseId &&
            !d.getElementById("challenge-banner").hidden,
        ),
    );
    w.dispatchEvent(
      new w.KeyboardEvent("keydown", {
        code: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
    g.setState({});
    g.step(0.2);
    check(
      "Enter starts the imported ghost challenge with visible challenger feedback",
      () =>
        ok(
          g.phase === "playing" &&
            g.raceMode === "challenge" &&
            d.getElementById("ghost-delta").textContent.includes("CHALLENGER"),
        ),
    );
    g.home();
    await new Promise((resolve) => {
      frame.onload = resolve;
      frame.src =
        gameRoot + "?qa=1&daily-challenge-preview=1#race=" + dailyPayload;
    });
    g = await ready();
    w = frame.contentWindow;
    d = w.document;
    g.freeze();
    d.getElementById("start").click();
    g.setState({
      d: g.course.length - 1,
      time: dailyGhost.time - 1,
      gates: g.course.gates.length,
      hull: 3,
    });
    g.step(0.05);
    check(
      "Daily friend challenge reports both the event and challenge outcome",
      () =>
        ok(
          g.phase === "results" &&
            g.raceMode === "challenge" &&
            g.activeEvent?.seed === dailyGhost.event.seed &&
            d.getElementById("result-kicker").textContent.includes("UTC") &&
            d
              .getElementById("record-message")
              .textContent.includes("DAILY EVENT CLEARED") &&
            d
              .getElementById("record-message")
              .textContent.includes("CHALLENGE WON"),
        ),
    );
    g.home();
    report.textContent += `\n${passed} passed · ${failed} failed.\n`;
  } catch (e) {
    report.textContent += "FAIL " + e.stack + "\n";
  }
};
const filmButton = document.createElement("button");
filmButton.id = "film";
filmButton.textContent = "Prepare replay clip";
document.getElementById("features").after(filmButton);
filmButton.onclick = async () => {
  report.textContent = "Preparing a real replay capture…";
  stage.replaceChildren();
  const frame = document.createElement("iframe");
  frame.style.cssText = "width:960px;height:540px;border:0";
  frame.src = gameRoot + "?qa=1&film=1";
  stage.append(frame);
  for (let i = 0; i < 600 && !frame.contentWindow.__breakwater; i++)
    await wait(50);
  const w = frame.contentWindow,
    g = w.__breakwater;
  if (!g) {
    report.textContent = "FAIL startup";
    return;
  }
  g.freeze();
  g.start();
  g.setState({ d: g.course.length - 850, time: 55, energy: 100 });
  for (let i = 0; i < 2400 && !g.state.finished && !g.state.failed; i++) {
    const input = driveInput(g.state);
    for (const [code, on] of [
      ["ArrowLeft", input.steer < -0.04],
      ["ArrowRight", input.steer > 0.04],
      ["Space", input.fly],
      ["ShiftLeft", input.boost],
    ])
      w.dispatchEvent(
        new w.KeyboardEvent(on ? "keydown" : "keyup", {
          code,
          bubbles: true,
          cancelable: true,
        }),
      );
    g.step(1 / 60);
    if (i % 60 === 0) await wait(1);
  }
  if (!g.state.finished) {
    report.textContent = "FAIL sample run did not finish";
    return;
  }
  g.startFilm();
  g.freeze(false);
  report.textContent =
    "Replay ready. Use Save 10-second clip in the game to exercise real browser recording.";
};
