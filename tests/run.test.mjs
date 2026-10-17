import assert from "node:assert/strict";
import {
  createRun,
  stepRun,
  GATES,
  GAPS,
  OBSTACLES,
  rankRun,
  nextWarning,
  formatTime,
} from "../run.js";
import { createControls, requiresLandscape } from "../controls.js";
let count = 0;
const test = (name, fn) => {
  fn();
  console.log("PASS " + name);
  count++;
};
const advance = (s, input, seconds) => {
  for (let i = 0; i < seconds * 120; i++) stepRun(s, input, 1 / 120);
};
test("Arrow steering has the same authority at cruise and while boosting", () => {
  const a = createRun(),
    b = createRun();
  advance(a, { steer: 1 }, 0.5);
  advance(b, { steer: 1, boost: true }, 0.5);
  assert(Math.abs(a.x - b.x) < 0.001);
  assert(b.speed > a.speed);
  assert(b.x > 4);
});
test("Steering, boost and flight operate together through takeoff and landing", () => {
  const s = createRun();
  advance(s, { steer: 1, boost: true, fly: true }, 0.4);
  assert(s.x > 3);
  assert(s.y > 1);
  assert(s.boosting);
  advance(s, { steer: -1, boost: true, fly: true }, 0.7);
  assert(s.vx < -11);
  assert(s.lifting);
  advance(s, { steer: 1, boost: true }, 2);
  assert.equal(s.y, 0);
  assert(s.x > 8);
  assert(s.boosting);
});
test("Aerial style roll does not suspend steering or boost", () => {
  const s = createRun();
  Object.assign(s, { d: 694, x: 0, y: 5.8, rollTime: 0.9 });
  advance(s, { steer: 1, fly: true, boost: true }, 0.4);
  assert(s.rollTime > 0);
  assert(s.x > 3);
  assert(s.boosting);
});
test("Releasing controls damps lateral momentum without a stuck direction", () => {
  const s = createRun();
  advance(s, { steer: 1 }, 0.3);
  advance(s, {}, 1);
  assert(s.vx < 0.01);
});
test("Flight remains damped below the ceiling and lands on release", () => {
  const s = createRun();
  advance(s, { fly: true }, 4);
  assert(s.y > 5.5 && s.y < 6.1);
  advance(s, {}, 2);
  assert.equal(s.y, 0);
  assert.equal(s.vy, 0);
});
test("Missing a bridge creates an immediate explainable failure", () => {
  const s = createRun();
  s.d = 650;
  advance(s, {}, 3);
  assert(s.failed);
  assert.equal(s.reason, "THE BRIDGE WAS OUT");
});
test("Takeoff before each of the four bridges is feasible with reserve supplied on approach", () => {
  for (const gap of GAPS) {
    const s = createRun();
    s.d = gap.start - 150;
    s.energy = 0;
    advance(s, {}, 0.2);
    assert(s.energy >= 65);
    while (s.d < gap.end + 10 && !s.failed)
      stepRun(s, { fly: s.d > gap.start - 80 }, 1 / 120);
    assert(!s.failed);
    assert(s.passedGaps.size === 1);
  }
});
test("Collision is swept across a high-speed frame and only damages once", () => {
  const s = createRun();
  Object.assign(s, { d: 305, x: -4.4, speed: 76 });
  stepRun(s, { boost: true }, 0.1);
  assert.equal(s.hull, 2);
  advance(s, { boost: true }, 0.3);
  assert.equal(s.hull, 2);
});
test("Flying above a barrier avoids collision", () => {
  const s = createRun();
  Object.assign(s, { d: 305, x: -4.4, y: 5.8, speed: 76 });
  advance(s, { fly: true }, 0.2);
  assert.equal(s.hull, 3);
});
test("Gates reward centering, recharge reserve, and are scored only once", () => {
  const s = createRun();
  Object.assign(s, { d: 179, x: 0, energy: 30 });
  advance(s, {}, 0.1);
  assert.equal(s.gates, 1);
  assert.equal(s.perfect, 1);
  assert(s.score >= 250);
  assert(s.energy > 60);
  s.d = 179;
  advance(s, {}, 0.1);
  assert.equal(s.gates, 1);
});
test("Missing a gate resets the multiplier", () => {
  const s = createRun();
  Object.assign(s, { d: 179, x: 8, chain: 3 });
  advance(s, {}, 0.1);
  assert.equal(s.chain, 0);
});
test("Brake overrides thrust without locking steering", () => {
  const s = createRun();
  s.speed = 60;
  advance(s, { brake: true, boost: true, steer: -1 }, 0.4);
  assert(s.speed < 40);
  assert(!s.boosting);
  assert(s.x < -3);
});
test("Bridge warnings precede the jump by more than two seconds at full speed", () => {
  const s = createRun();
  s.d = 500;
  assert.equal(nextWarning(s).kind, "gap");
  assert(660 - s.d > 76 * 2);
});
test("A complete crossing can collect every gate with all hull intact", () => {
  const s = createRun();
  for (let i = 0; i < 120 * 100 && !s.finished && !s.failed; i++) {
    const g = GATES.find((g) => g.d > s.d);
    const gap = GAPS.find((g) => s.d > g.start - 80 && s.d < g.end + 5);
    const o = OBSTACLES.find((o) => o.d > s.d - 8 && o.d < s.d + 85);
    let x = g?.x || 0;
    if (o && !gap) x = o.x >= 0 ? -6 : 6;
    stepRun(
      s,
      {
        steer: Math.max(-1, Math.min(1, (x - s.x) * 2 - s.vx * 0.2)),
        fly: !!gap,
        boost: s.energy > 18,
      },
      1 / 120,
    );
  }
  assert(s.finished);
  assert.equal(s.gates, GATES.length);
  assert.equal(s.hull, 3);
  assert.equal(rankRun(s), "GOLD");
  assert(s.time > 45 && s.time < 70);
  const score = s.score;
  advance(s, { boost: true }, 1);
  assert.equal(s.score, score);
  console.log(
    `  Full crossing: ${s.time.toFixed(2)} s, ${s.score} pts, ${s.gates} gates`,
  );
});
test("Physics stays stable across 30, 60 and 120 Hz", () => {
  const states = [30, 60, 120].map((hz) => {
    const s = createRun();
    for (let i = 0; i < hz * 3; i++)
      stepRun(s, { boost: true, fly: true, steer: 0.1 }, 1 / hz);
    return s;
  });
  for (const s of states) {
    assert(Math.abs(s.d - states[2].d) < 0.01);
    assert(Math.abs(s.y - states[2].y) < 0.01);
  }
});
test("Energy is bounded and extended holds do not generate NaN", () => {
  const s = createRun();
  for (let i = 0; i < 1000; i++) {
    stepRun(s, { boost: true, fly: true, steer: 1 }, 0.1);
    if (s.failed) break;
  }
  assert(s.energy >= 0 && s.energy <= 100);
  for (const key of ["x", "y", "vx", "vy", "speed", "d", "time"])
    assert(Number.isFinite(s[key]));
});
function key(target, type, code) {
  const e = new Event(type, { cancelable: true });
  Object.defineProperty(e, "code", { value: code });
  Object.defineProperty(e, "repeat", { value: false });
  target.dispatchEvent(e);
  return e;
}
test("Actual input reducer preserves Shift plus both arrow directions independently", () => {
  const target = new EventTarget(),
    c = createControls(target, () => {});
  key(target, "keydown", "ShiftLeft");
  key(target, "keydown", "ArrowRight");
  assert.deepEqual(c.read(), {
    steer: 1,
    boost: true,
    fly: false,
    brake: false,
  });
  key(target, "keydown", "Space");
  assert(c.read().fly);
  key(target, "keyup", "ArrowRight");
  key(target, "keydown", "ArrowLeft");
  assert.equal(c.read().steer, -1);
  assert(c.read().boost && c.read().fly);
  key(target, "keyup", "ShiftLeft");
  assert(!c.read().boost && c.read().fly);
  assert.equal(c.read().steer, -1);
  c.clear();
  assert.equal(c.read().steer, 0);
  assert(!c.read().fly);
});
test("Keyup still clears held state when a menu has disabled driving input", () => {
  const target = new EventTarget();
  let enabled = true;
  const c = createControls(
    target,
    () => {},
    () => enabled,
  );
  key(target, "keydown", "ArrowRight");
  enabled = false;
  key(target, "keyup", "ArrowRight");
  assert.equal(c.read().steer, 0);
  assert(!key(target, "keydown", "Space").defaultPrevented);
});
test("Phone portrait pauses; desktop portrait stays available", () => {
  assert(requiresLandscape(390, 844, false));
  assert(requiresLandscape(820, 1180, true));
  assert(!requiresLandscape(844, 390, true));
  assert(!requiresLandscape(900, 1200, false));
});
test("Timer never displays 00:60.0 at a minute boundary", () => {
  assert.equal(formatTime(59.99), "00:59.9");
  assert.equal(formatTime(60), "01:00.0");
  assert.equal(formatTime(60.1), "01:00.1");
});
console.log(`${count} gameplay/input checks passed.`);
