const report = document.getElementById("report"),
  stage = document.getElementById("stage");
const button = document.createElement("button");
button.textContent = "Check objectives and ghost clarity";
button.id = "objectives";
document.getElementById("features").after(button);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
button.onclick = async () => {
  let pass = 0,
    fail = 0;
  report.textContent = "Checking career objectives and ghost clarity…\n";
  stage.replaceChildren();
  const frame = document.createElement("iframe");
  frame.style.cssText = "width:844px;height:390px;border:0";
  frame.src = "../dist/?qa=1";
  stage.append(frame);
  const ok = (v, m = "Assertion failed") => {
    if (!v) throw Error(m);
  };
  const check = (name, fn) => {
    try {
      fn();
      pass++;
      report.textContent += "PASS " + name + "\n";
    } catch (e) {
      fail++;
      report.textContent += "FAIL " + name + ": " + e.message + "\n";
    }
  };
  for (let i = 0; i < 600 && !frame.contentWindow.__breakwater; i++)
    await wait(50);
  const g = frame.contentWindow.__breakwater,
    d = frame.contentDocument;
  if (!g) {
    report.textContent += "FAIL startup";
    return;
  }
  g.freeze();
  check("First race explains its podium objective before the start", () =>
    ok(
      d.getElementById("contract-title").textContent === "FINISH ON THE PODIUM",
    ),
  );
  for (const [w, h] of [
    [844, 390],
    [568, 320],
  ]) {
    frame.style.width = w + "px";
    frame.style.height = h + "px";
    await wait(80);
    check(
      `Career brief and venue selection remain separate at ${w}×${h}`,
      () => {
        const a = d.getElementById("contract-home").getBoundingClientRect(),
          b = d.querySelector(".venue-heading").getBoundingClientRect();
        ok(
          a.top >= 0 && a.left >= 0 && a.right <= w && a.bottom <= b.top + 1,
          JSON.stringify({ brief: a.toJSON(), heading: b.toJSON() }),
        );
      },
    );
  }
  frame.style.width = "844px";
  frame.style.height = "390px";
  await wait(80);
  g.start();
  g.setState({});
  g.step(0.01);
  check("Live HUD explains exactly which rival must be passed", () =>
    ok(
      d.getElementById("objective-title").textContent === "FINISH TOP 3" &&
        d
          .getElementById("objective-detail")
          .textContent.includes("PASS 1 RIVAL"),
    ),
  );
  const finish = (position, hull = 3) => {
    g.setState({
      finished: true,
      failed: false,
      finishPosition: position,
      position,
      hull,
      d: g.course.length,
      time: 80,
    });
    g.step(0.01);
  };
  finish(4);
  check("Finishing fourth gives an explicit missed objective and no cup", () =>
    ok(
      !g.career[g.course.id] &&
        d.getElementById("result-kicker").textContent.includes("NOT YET"),
    ),
  );
  g.start();
  finish(3);
  check("A podium awards bronze and points to the next objective", () =>
    ok(
      g.career[g.course.id] === 1 &&
        d.getElementById("result-tip").textContent.includes("take first place"),
    ),
  );
  g.home();
  check("Returning to the garage keeps career progress visible", () =>
    ok(
      d.getElementById("contract-title").textContent === "TAKE FIRST PLACE" &&
        d.getElementById("contract-progress").textContent === "1 / 3 CUPS WON",
    ),
  );
  g.start();
  finish(1);
  check("Winning advances to the clean-victory goal", () =>
    ok(g.career[g.course.id] === 2),
  );
  g.start();
  finish(1, 2);
  check("Damaged victory cannot claim the gold cup", () =>
    ok(
      g.career[g.course.id] === 2 &&
        d.getElementById("result-tip").textContent.includes("damage"),
    ),
  );
  g.start();
  finish(1, 3);
  check("A clean victory completes the venue career", () =>
    ok(
      g.career[g.course.id] === 3 &&
        d.getElementById("result-tip").textContent.includes("ALL THREE CUPS"),
    ),
  );
  const career = JSON.stringify(g.career);
  g.home();
  await g.startDaily();
  finish(1, 3);
  check("Daily events never advance the normal career cups", () =>
    ok(JSON.stringify(g.career) === career),
  );
  check("True ghosts use a named three-draw hologram with no shadow", () =>
    ok(
      g.ghostAppearance.name.includes("Non-solid") &&
        g.ghostAppearance.draws === 3 &&
        !g.ghostAppearance.shadows,
    ),
  );
  g.home();
  report.textContent += `\n${pass} passed · ${fail} failed.\n`;
};
