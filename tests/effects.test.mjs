import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.js";
import { createRaceEffects } from "../effects.js";
import { FLIGHT_PORTS } from "../propulsion.js";

let count = 0;
const test = (name, fn) => {
  fn();
  count++;
  console.log("PASS " + name);
};

const puffRing = (smoke) => {
  const fade = smoke.geometry.attributes.fade.array;
  let alive = 0;
  for (let i = 60; i < 84; i++) if (fade[i] > 0) alive++;
  return alive;
};
const setup = (ports) => {
  const scene = new THREE.Scene(),
    fx = createRaceEffects(scene),
    car = new THREE.Object3D();
  scene.add(car);
  car.position.set(0, 5, -1500);
  car.userData.actuation = { ports, lift: 0.4, yaw: 0 };
  const s = {
    speed: 60, vx: 0, vy: 0, y: 5, x: 0, d: 1500, failed: false, airborne: true,
    lifting: true, drift: 0, attachedRamp: -1, padTime: 0, boosting: false,
    course: { theme: "range", gaps: [] },
  };
  const smoke = scene.children[0].children.find((c) => c.isPoints);
  return { fx, car, s, smoke };
};

test("Firing lift ports leave cold-gas puffs below the car that clear once the ports stop", () => {
  const { fx, car, s, smoke } = setup(
    FLIGHT_PORTS.map((p) => (p.kind === "lift" ? 0.4 : 0)),
  );
  for (let i = 0; i < 30; i++) fx.update(car, s, 1 / 60, true, false);
  const alive = puffRing(smoke);
  assert.ok(alive >= 4 && alive <= 24, `expected a handful of puffs, got ${alive}`);
  const pos = smoke.geometry.attributes.position.array;
  for (let i = 60; i < 84; i++)
    if (smoke.geometry.attributes.fade.array[i] > 0)
      assert.ok(pos[i * 3 + 1] < 5, "lift exhaust travels downward");
  car.userData.actuation = { ports: FLIGHT_PORTS.map(() => 0), lift: 0, yaw: 0 };
  for (let i = 0; i < 60; i++) fx.update(car, s, 1 / 60, true, false);
  assert.equal(puffRing(smoke), 0);
});

test("Puffs never fire with reduced motion, after a crash, or without actuation data", () => {
  const ports = FLIGHT_PORTS.map(() => 0.6);
  let ctx = setup(ports);
  for (let i = 0; i < 30; i++) ctx.fx.update(ctx.car, ctx.s, 1 / 60, true, true);
  assert.equal(puffRing(ctx.smoke), 0);
  ctx = setup(ports);
  ctx.s.failed = true;
  for (let i = 0; i < 30; i++) ctx.fx.update(ctx.car, ctx.s, 1 / 60, true, false);
  assert.equal(puffRing(ctx.smoke), 0);
  ctx = setup(ports);
  delete ctx.car.userData.actuation;
  for (let i = 0; i < 30; i++) ctx.fx.update(ctx.car, ctx.s, 1 / 60, true, false);
  assert.equal(puffRing(ctx.smoke), 0);
});

test("Puff emission is rate-limited so a long hover cannot exceed its 24-slot ring", () => {
  const { fx, car, s, smoke } = setup(FLIGHT_PORTS.map(() => 1));
  for (let i = 0; i < 240; i++) fx.update(car, s, 1 / 60, true, false);
  const alive = puffRing(smoke);
  assert.ok(alive > 0 && alive <= 24, `ring bounded, got ${alive}`);
  const eventFade = smoke.geometry.attributes.fade.array.slice(0, 60);
  assert.ok(eventFade.every((f) => f === 0), "crash/tyre slots stay untouched");
});

console.log(`${count} flight effect checks passed.`);
