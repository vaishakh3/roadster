import assert from "node:assert/strict";
import {
  createState,
  stepPhysics,
  getGroundClearance,
  getBodyAxes,
} from "../physics.js";
import { createPilot, requestRoll, pilotInput } from "../pilot.js";
import { requiresLandscape } from "../input.js";

let checks = 0;
const test = (name, fn) => {
  fn();
  checks++;
  console.log("PASS " + name);
};
const run = (state, raw, pilot, seconds) => {
  for (let i = 0; i < Math.ceil(seconds * 120); i++)
    stepPhysics(state, pilotInput(state, raw, pilot, 1 / 120), 1 / 120);
};
test("Portrait gate covers phones and touch tablets but not desktop portrait", () => {
  assert(requiresLandscape(390, 844, false));
  assert(requiresLandscape(820, 1180, true));
  assert(!requiresLandscape(844, 390, true));
  assert(!requiresLandscape(900, 1200, false));
});
test("Simple acceleration cruises, brake stops without accidentally reversing", () => {
  const s = createState(),
    p = createPilot();
  run(s, {}, p, 12);
  assert(s.speed > 20 && s.speed <= 26);
  run(s, { brake: 1 }, p, 7);
  assert(s.speed >= 0 && s.speed < 0.2);
});
test("Brake wins over simultaneous throttle and rocket boost", () => {
  const s = createState();
  s.vz = -30;
  const reserve = s.charge;
  for (let i = 0; i < 120; i++)
    stepPhysics(s, { throttle: 1, boost: true, brake: 1 }, 1 / 120);
  assert(s.speed < 15);
  assert.equal(s.charge, reserve);
  assert.equal(s.forwardThrust, 0);
});
test("High-speed steering is limited by grip rather than instant heading changes", () => {
  const s = createState();
  s.vz = -65;
  s.steer = 1;
  stepPhysics(s, { steer: 1 }, 1 / 120);
  assert(s.yaw / (1 / 120) < 0.4);
  assert(s.vz < -64.5, "World momentum is preserved");
});
test("Loose surfaces have less braking and cornering grip", () => {
  const road = createState(),
    loose = createState();
  road.vz = loose.vz = -30;
  for (let i = 0; i < 120; i++) {
    stepPhysics(road, { brake: 1, steer: 0.6 }, 1 / 120, true);
    stepPhysics(loose, { brake: 1, steer: 0.6 }, 1 / 120, false);
  }
  assert(Math.hypot(road.vx, road.vz) < Math.hypot(loose.vx, loose.vz));
  assert(road.yaw > loose.yaw);
});
test("Roll requests respect height, reserve, landing and active-manoeuvre guards", () => {
  const s = createState(),
    p = createPilot();
  assert.equal(requestRoll(p, s), "unavailable");
  s.hover = true;
  assert.equal(requestRoll(p, s), "climb");
  s.y = 32;
  s.charge = 10;
  assert.equal(requestRoll(p, s), "reserve");
  s.charge = 100;
  assert.equal(requestRoll(p, s), "started");
  assert.equal(requestRoll(p, s), "busy");
});
test("Tap-assisted climb → physical 360 roll → stabilization → safe landing", () => {
  const s = createState(),
    p = createPilot();
  s.hover = true;
  s._wasHover = true;
  s.hoverTarget = 32;
  run(s, {}, p, 5);
  assert(getGroundClearance(s) > 28);
  assert.equal(requestRoll(p, s), "started");
  run(s, {}, p, 4.5);
  assert.equal(s.rolls, 1);
  assert(!s.crashed);
  assert(getBodyAxes(s.q).up.y > 0.97);
  s.landing = true;
  for (let i = 0; i < 20 * 120 && !s.grounded; i++) run(s, {}, p, 1 / 120);
  assert(s.grounded && !s.crashed);
  assert(s.charge > 0);
  run(s, {}, p, 0.1);
  const reserve = s.charge;
  run(s, {}, p, 3);
  assert(s.charge > reserve);
  assert(Math.abs(s.speed) < 0.2);
  assert(p.parked);
  run(s, { boost: true }, p, 0.5);
  assert(!p.parked && s.speed > 3);
});
test("Pilot does not mutate physical state or fabricate completed tricks", () => {
  const s = createState(),
    p = createPilot();
  s.y = 32;
  s.hover = true;
  requestRoll(p, s);
  const before = JSON.stringify(s);
  const command = pilotInput(s, {}, p, 1 / 120);
  assert.equal(JSON.stringify(s), before);
  assert.equal(command.roll, 1);
});
console.log(`\n${checks} pilot and handling checks passed.`);
