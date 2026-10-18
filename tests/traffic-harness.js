import { LAYOUT_VERSION } from "../courses.js";
const button = document.createElement("button");
button.id = "traffic";
button.textContent = "Check rivals, HP and ghost settings";
document.getElementById("objectives").after(button);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
button.onclick = async () => {
  const report = document.getElementById("report"),
    stage = document.getElementById("stage");
  let pass = 0,
    fail = 0;
  report.textContent =
    "Checking visible rivals, hard-impact HP and opt-in ghosts…\n";
  const frame = document.createElement("iframe");
  frame.style.cssText = "width:844px;height:390px;border:0";
  frame.src =
    (new URLSearchParams(location.search).has("source") ? "../" : "../dist/") +
    "?qa=1";
  stage.replaceChildren(frame);
  for (let i = 0; i < 600 && !frame.contentWindow.__breakwater; i++)
    await wait(50);
  const g = frame.contentWindow.__breakwater,
    d = frame.contentDocument;
  const check = (name, test) => {
    try {
      if (!test()) throw Error("Assertion failed");
      pass++;
      report.textContent += "PASS " + name + "\n";
    } catch (e) {
      fail++;
      report.textContent += "FAIL " + name + ": " + e.message + "\n";
    }
  };
  if (!g) {
    report.textContent += "FAIL startup";
    return;
  }
  g.freeze();
  g.start();
  g.setState({});
  g.step(0);
  check(
    "Personal ghost is OFF by default and Settings says OFF",
    () =>
      !g.ghostAppearance.enabled &&
      d.querySelector("#ghost b").textContent === "OFF",
  );
  check(
    "All three opaque rivals render on the opening grid with named markers",
    () =>
      g.rivalAppearance.visible === 3 &&
      g.rivalAppearance.labels.length === 3 &&
      g.rivalAppearance.batches === 8,
  );
  check(
    "Health explicitly starts at 3 / 3 HP",
    () => d.getElementById("health-value").textContent === "3 / 3 HP",
  );
  g.records[g.course.id] = {
    layout: LAYOUT_VERSION,
    time: 90,
    score: 1000,
    medal: 1,
    ghost: [
      [0, 380, 1, 0],
      [10, 880, 1, 0],
    ],
  };
  g.setState({ time: 1, d: 410 });
  g.step(0);
  check(
    "A saved fastest run stays hidden until the player opts in",
    () => !g.ghostAppearance.visible && d.getElementById("ghost-delta").hidden,
  );
  g.pause();
  d.getElementById("ghost").click();
  g.resume();
  g.step(0);
  check(
    "Settings enables the recorded cyan ghost",
    () =>
      g.ghostAppearance.enabled &&
      g.ghostAppearance.visible &&
      !d.getElementById("ghost-delta").hidden,
  );
  g.pause();
  d.getElementById("ghost").click();
  g.resume();
  g.step(0);
  check(
    "Settings can disable it again without removing real opponents",
    () =>
      !g.ghostAppearance.enabled &&
      !g.ghostAppearance.visible &&
      g.state.rivals.length === 3,
  );
  const pair = (y = 0) => {
    g.start();
    g.setState({ d: 100, x: 0, y, speed: 76, airborne: y > 0, vy: 0 });
    Object.assign(g.state.rivals[0], { d: 106, x: 0, y: 0, speed: 30, vx: 0 });
    g.state.rivals[1].d = 750;
    g.state.rivals[2].d = 800;
  };
  pair();
  for (let i = 0; i < 8; i++) g.step(1 / 60);
  check(
    "A hard rear impact removes exactly one player HP and updates the HUD",
    () =>
      g.state.hull === 2 &&
      d.getElementById("health-value").textContent === "2 / 3 HP",
  );
  check(
    "The impacted opponent also loses one HP and stays visibly solid",
    () => g.state.rivals[0].hull === 2 && g.rivalAppearance.visible === 1,
  );
  for (let i = 0; i < 10; i++) g.step(1 / 60);
  check(
    "Sustained contact does not drain HP every frame",
    () => g.state.hull === 2,
  );
  pair(4.5);
  for (let i = 0; i < 20; i++) g.step(1 / 60);
  check(
    "Flying fully over a rival preserves both cars HP",
    () =>
      g.state.hull === 3 &&
      g.state.rivals[0].hull === 3 &&
      g.state.d > g.state.rivals[0].d,
  );
  g.setState({ hull: 1 });
  g.step(0);
  check(
    "Critical health shows one HP and a distinct low-health state",
    () =>
      d.getElementById("health-value").textContent === "1 / 3 HP" &&
      d.getElementById("hull").dataset.low === "true",
  );
  g.home();
  report.textContent += `\n${pass} passed · ${fail} failed.\n`;
};
