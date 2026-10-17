import assert from "node:assert/strict";
import {
  createChallenge,
  awardTrick,
  awardGate,
  bankLanding,
  loseCombo,
  finishChallenge,
  medalFor,
} from "../challenge.js";
import { renderRatio } from "../performance.js";
import { resolveObstacles } from "../collision.js";
import { createState } from "../physics.js";
import { bindSteeringPad } from "../input.js";
const tests = [];
function test(name, fn) {
  fn();
  tests.push(name);
  console.log("PASS " + name);
}
test("Airborne tricks remain unbanked until a safe landing", () => {
  const r = createChallenge();
  awardTrick(r, 2);
  assert.equal(r.score, 0);
  assert.equal(r.pending, 1250);
  assert.equal(bankLanding(r), 1500);
  assert.equal(r.score, 1500);
  assert.equal(r.landings, 1);
  assert.equal(bankLanding(r), 0);
});
test("Reset or crash discards the entire pending combo, never banked points", () => {
  const r = createChallenge();
  awardGate(r);
  awardTrick(r, 3);
  loseCombo(r, true);
  assert.equal(r.score, 200);
  assert.equal(r.pending, 0);
  assert.equal(r.multiplier, 1);
  assert.equal(r.crashes, 1);
});
test("Multiplier is capped and separate flights reset the chain", () => {
  const r = createChallenge();
  awardTrick(r, 20);
  assert.equal(r.multiplier, 4);
  bankLanding(r);
  awardTrick(r);
  assert.equal(r.multiplier, 1);
  assert.equal(r.pending, 500);
});
test("Run timeout forfeits unlanded points and locks awards", () => {
  const r = createChallenge();
  awardGate(r);
  awardTrick(r);
  finishChallenge(r);
  awardTrick(r);
  awardGate(r);
  bankLanding(r);
  assert.equal(r.score, 200);
  assert.equal(r.pending, 0);
  assert.equal(r.tricks, 1);
  assert.equal(r.lost, 500);
});
test("Medal thresholds match the briefing", () => {
  assert.deepEqual([999, 1000, 2999, 3000, 5999, 6000].map(medalFor), [
    "TEST PILOT",
    "BRONZE",
    "BRONZE",
    "SILVER",
    "SILVER",
    "GOLD",
  ]);
});
test("High density phones stay inside the mobile pixel budget", () => {
  const ratio = renderRatio(430, 932, 3, "auto", true);
  assert(ratio <= 1.25);
  assert(430 * 932 * ratio ** 2 <= 1_000_000);
  assert.equal(renderRatio(1000, 700, 1, "auto", false), 1);
  assert(renderRatio(3840, 2160, 2, "auto", false) < 1);
});
test("Steering pointer ownership and cancellation are independent", () => {
  let value = 0;
  const handlers = {};
  const el = {
      addEventListener: (t, f) => (handlers[t] = f),
      setPointerCapture() {},
      classList: { add() {}, remove() {} },
      getBoundingClientRect: () => ({ left: 0, width: 120 }),
    },
    knob = { style: {} };
  const reset = bindSteeringPad(el, knob, (v) => (value = v));
  const e = (id, x) => ({ pointerId: id, clientX: x, preventDefault() {} });
  handlers.pointerdown(e(1, 100));
  assert(value < 0);
  handlers.pointerdown(e(2, 0));
  assert(value < 0);
  handlers.pointerup(e(2, 0));
  assert(value < 0);
  handlers.pointercancel(e(1, 0));
  assert.equal(value, 0);
  handlers.pointerdown(e(3, 0));
  assert.equal(value, 1);
  reset();
  assert.equal(value, 0);
});


test("Solid obstacle deflects a scrape and locks out a hard collision", () => {
  const box = [{ x: 0, z: 0, halfX: 4, halfZ: 4, height: 8 }];
  const slow = createState(5, 0);
  slow.vx = -3;
  assert(resolveObstacles(slow, box));
  assert(slow.x > 5.35);
  assert(slow.vx > 0);
  assert.equal(slow.crashed, false);
  const fast = createState(5, 0);
  fast.vx = -30;
  resolveObstacles(fast, box);
  assert(fast.crashed);
  assert.equal(fast.crashCount, 1);
  assert.equal(fast.hover, false);
});
test("Flight clears obstacles only above their height", () => {
  const s = createState();
  s.y = 20;
  assert.equal(
    resolveObstacles(s, [{ x: 0, z: 0, halfX: 4, halfZ: 4, height: 8 }]),
    false,
  );
  assert.equal(s.x, 0);
});

console.log(tests.length + " challenge / performance / touch checks passed.");
