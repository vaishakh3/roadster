import { COURSES, hazardPose, saveResult, completedCount } from "../courses.js";
import { driveInput } from "./driver.js";
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
import {
  rampSurface,
  rampContact,
  launchFlight,
  flightPose,
  PathHistory,
} from "../stunts.js";
import { flightActuators, FLIGHT_PORTS } from "../propulsion.js";
import { createTerrainChunk } from "../terrain.js";
import { FrameBudget } from "../quality.js";
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
test("Takeoff before each bridge is feasible with reserve supplied on approach", () => {
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
test("Suction ramp warnings give time to align before the launch", () => {
  const s = createRun();
  s.d = 500;
  assert.equal(nextWarning(s).kind, "ramp");
  assert(660 - s.d > 76 * 2);
});
for (const course of COURSES)
  test(
    course.name + ": a complete gold run can collect every gate without damage",
    () => {
      const s = createRun(course);
      for (let i = 0; i < 120 * 110 && !s.finished && !s.failed; i++)
        stepRun(s, driveInput(s), 1 / 120);
      assert(s.finished);
      assert.equal(s.hull, 3);
      assert.equal(s.gates, course.gates.length);
      assert.equal(rankRun(s), "GOLD");
      const score = s.score;
      advance(s, { boost: true }, 1);
      assert.equal(s.score, score);
      console.log(
        `  ${course.name}: ${s.time.toFixed(2)} s / ${s.gates} gates / ${s.score} points`,
      );
    },
  );
test("Low-clearance gantries allow ground driving and collide with flight", () => {
  for (const y of [0, 5.8]) {
    const s = createRun("redshift");
    Object.assign(s, { d: 1125, x: 0, y, speed: 76 });
    advance(s, { fly: y > 0 }, 0.2);
    assert.equal(s.hull, y ? 2 : 3);
  }
});
test("Moving obstacles use the same timed pose for swept collisions", () => {
  for (const c of COURSES) {
    const o = c.obstacles.find((o) => o.kind === "sweeper"),
      s = createRun(c),
      p = hazardPose(o, 10);
    Object.assign(s, { time: 10, d: p.d - 5, x: p.x, speed: 76 });
    advance(s, { boost: true }, 0.15);
    assert.equal(s.hull, 2);
  }
});
test("Freight traffic stops before broken bridge sections", () => {
  for (const c of COURSES)
    for (const o of c.obstacles.filter((o) => o.speed)) {
      const p = hazardPose(o, 1000);
      assert(!c.gaps.some((g) => p.d >= g.start && p.d <= g.end));
      assert(p.d < c.length);
    }
});
test("Launch ramps supply a physical upward impulse without suspending steering", () => {
  const s = createRun("redshift");
  Object.assign(s, { d: 794, x: 0, y: 6.8, speed: 70 });
  advance(s, { steer: 1 }, 0.25);
  assert(s.y > 1);
  assert(s.vy > 0);
  assert(s.x > 1);
  assert.equal(s.launches, 1);
});
test("An imminent barrier warning takes priority over a later ramp", () => {
  const s = createRun();
  s.d = 1300;
  assert.equal(nextWarning(s).kind, "sweeper");
  s.y = 5;
  assert.equal(nextWarning(s).kind, "ramp");
});
test("All thirteen ramps carry the car along the rendered deck and land one automatic stunt", () => {
  for (const c of COURSES)
    for (const r of c.ramps)
      for (const hz of [30, 60, 120]) {
        const s = createRun(c);
        Object.assign(s, {
          d: r.d - r.length - 1,
          speed: 65,
          x: r.x,
          time: 10,
        });
        let maxAngle = 0,
          gripFrames = 0;
        while (s.d < r.land + 2 && !s.failed) {
          stepRun(s, { boost: true }, 1 / hz);
          if (s.attachedRamp >= 0) {
            gripFrames++;
            assert(Math.abs(s.y - rampContact(r, s.d).height) < 0.001);
          }
          maxAngle = Math.max(maxAngle, s.stuntAngle);
        }
        assert(!s.failed, c.name + " ramp " + r.d);
        assert(gripFrames > 5);
        assert(maxAngle > Math.PI * 1.99);
        assert.equal(s.stunts, 1);
        assert.equal(s.launches, 1);
        assert.equal(s.y, 0);
        assert.equal(s.stuntAngle, 0);
      }
});
test("Braking during an automatic flip preserves the safe landing zone", () => {
  for (const c of COURSES) {
    const r = c.ramps[1],
      s = createRun(c);
    Object.assign(s, { d: r.d - r.length - 1, speed: 76 });
    while (s.d < r.land + 2 && !s.failed)
      stepRun(s, { brake: !!s.flight }, 1 / 60);
    assert(!s.failed);
    assert.equal(s.stunts, 1);
    assert.equal(s.y, 0);
  }
});
test("Entering beside a high ramp lip cannot teleport the car to its top", () => {
  const s = createRun(),
    r = s.course.ramps[1];
  Object.assign(s, { d: r.d - 2, speed: 70 });
  advance(s, {}, 0.1);
  assert.equal(s.launches, 0);
  assert.equal(s.y, 0);
});
test("Ramp support keeps both axles and bumper above the rendered curve", () => {
  for (const c of COURSES)
    for (const r of c.ramps)
      for (let d = r.d - r.length; d <= r.d; d += 0.5) {
        const p = rampContact(r, d);
        for (const z of [-2.25, -1.48, 1.48, 2.25]) {
          const localY = Math.abs(z) > 2 ? 0.17 : 0;
          const forward = -z * Math.cos(p.pitch) + localY * Math.sin(p.pitch);
          const y =
            p.height - z * Math.sin(p.pitch) + localY * Math.cos(p.pitch);
          if (d + forward <= r.d && d + forward >= r.d - r.length)
            assert(
              y >= rampSurface(r, d + forward).height + 0.024 - 0.008,
              `${r.d} bumper at ${d}`,
            );
        }
      }
});
test("Ramp fly holds, lateral inputs, braking and dropped frames never penetrate a deck", () => {
  for (const c of COURSES)
    for (const r of c.ramps)
      for (const hz of [12, 24, 60, 120])
        for (const mode of [0, 1, 2]) {
          const s = createRun({ ...c, obstacles: [], gates: [] });
          Object.assign(s, { d: r.d - r.length - 20, x: r.x, speed: 65 });
          while (s.d < r.land + 2 && !s.failed) {
            stepRun(
              s,
              {
                fly: mode === 0,
                boost: mode !== 2,
                brake: mode === 2,
                steer: mode === 1 ? Math.sin(s.time * 4) : 0,
              },
              1 / hz,
            );
            if (
              s.d >= r.d - r.length &&
              s.d <= r.d &&
              Math.abs(s.x - r.x) < (r.width || 7) / 2 - 1.12
            )
              assert(
                s.y >= rampSurface(r, s.d).height - 0.01,
                `${c.id}/${r.d}/${hz}/${mode}/${s.d}/${s.y}`,
              );
            assert(Number.isFinite(s.y) && Number.isFinite(s.rampPitch));
          }
          assert(!s.failed);
        }
});
test("Entering the side of a high ramp is rejected outside its full vehicle footprint", () => {
  const s = createRun(),
    r = s.course.ramps[1];
  Object.assign(s, { d: r.d - 12, x: 5.2, speed: 27 });
  advance(s, { steer: -1, brake: true }, 0.3);
  assert(s.x > r.x + r.width / 2 + 1.1);
  assert.equal(s.y, 0);
  assert.equal(s.launches, 0);
});
test("Automatic flips clear the rear bumper, brake rotation, and touch down gently", () => {
  for (const c of COURSES)
    for (const r of c.ramps) {
      const f = launchFlight(r, 70);
      assert.equal(flightPose(f, 0, r.d + 4, 70).angle, 0);
      let positive = false,
        negative = false;
      for (let i = 1; i <= 100; i++) {
        const p = flightPose(f, 0.02, r.d + ((r.land - r.d) * i) / 100, 70);
        positive ||= f.angularAcceleration > 1;
        negative ||= f.angularAcceleration < -1;
        assert(p.y >= 0);
      }
      assert(positive && negative);
      assert(Math.abs(f.angularVelocity) < 0.001);
      const land = flightPose(f, 0, r.land, 70);
      assert(Math.abs(land.vy) < 1.6);
      assert.equal(land.y, 0);
    }
});
test("Lift comes from below; suction holds ramps; inverted flight only uses attitude couples", () => {
  const s = createRun();
  Object.assign(s, { airborne: true, lifting: true, liftAcceleration: 12 });
  const lift = flightActuators(s);
  assert(lift.lift > 0.5);
  FLIGHT_PORTS.forEach((port, i) => {
    if (lift.ports[i] > 0) assert.deepEqual(port.exhaust, [0, -1, 0]);
  });
  s.lifting = false;
  assert.equal(
    flightActuators(s).lift,
    0,
    "Freefall must not display upward propulsion",
  );
  Object.assign(s, { airborne: false, lifting: false, attachedRamp: 0 });
  const grip = flightActuators(s);
  assert.equal(grip.grip, 1);
  assert(grip.ports.every((p) => p === 0));
  Object.assign(s, {
    airborne: true,
    attachedRamp: -1,
    stuntKind: "flip",
    flight: { angularAcceleration: 14 },
  });
  const inverted = flightActuators(s, Math.PI, 0);
  assert.equal(inverted.lift, 0);
  let fy = 0,
    torque = 0;
  FLIGHT_PORTS.forEach((p, i) => {
    const f = -p.exhaust[1] * inverted.ports[i];
    fy += f;
    torque -= p.position[2] * f;
  });
  assert(Math.abs(fy) < 0.001);
  assert(torque > 0);
  s.flight.angularAcceleration = -14;
  assert(flightActuators(s, Math.PI).pitch < 0);
  s.failed = true;
  assert(flightActuators(s).ports.every((p) => p === 0));
});
test("Terrain faces point upward on both banks at both detail levels", () => {
  for (const side of [-1, 1])
    for (const low of [false, true]) {
      const g = createTerrainChunk({
        start: 0,
        end: 240,
        side,
        canyon: true,
        roadX: (d) => Math.sin(d / 100) * 20,
        roadY: () => 22,
        low,
      });
      const p = g.attributes.position,
        idx = g.index;
      for (let i = 0; i < idx.count; i += 3) {
        const a = idx.getX(i),
          b = idx.getX(i + 1),
          c = idx.getX(i + 2);
        const abx = p.getX(b) - p.getX(a),
          abz = p.getZ(b) - p.getZ(a),
          acx = p.getX(c) - p.getX(a),
          acz = p.getZ(c) - p.getZ(a);
        assert(abz * acx - abx * acz > 0);
      }
    }
});
test("Adaptive resolution is bounded, gradual and ignores background pauses", () => {
  const budget = new FrameBudget();
  let ratio = 1.25;
  for (let i = 0; i < 600; i++) ratio = budget.sample(1 / 30, ratio, 1.25);
  assert.equal(ratio, 0.8);
  assert.equal(budget.sample(1, ratio, 1.25), 0.8);
  for (let i = 0; i < 3600; i++) ratio = budget.sample(1 / 60, ratio, 1.25);
  assert.equal(ratio, 1.15);
});
test("Ground hazards trigger a visible directional impact and damage only once", () => {
  for (const kind of ["cargo", "rubble", "drums"]) {
    const c = COURSES.find((c) => c.obstacles.some((o) => o.kind === kind));
    const o = c.obstacles.find((o) => o.kind === kind),
      s = createRun(c),
      p = hazardPose(o, 0);
    Object.assign(s, { d: p.d - 5, x: p.x + 0.1, speed: 76 });
    advance(s, { boost: true }, 0.2);
    assert.equal(s.hull, 2);
    assert(s.crashAge < 0.2);
    assert.equal(s.crashDirection, 1);
    assert.equal(s.crashKind, "impact");
  }
});
test("A collision during a stunt cancels the clean-landing reward", () => {
  const source = COURSES[0],
    r = source.ramps[0];
  const c = {
    ...source,
    gates: [],
    obstacles: [
      { d: r.d + 35, x: 0, w: 5, h: 40, depth: 2.7, kind: "barrier" },
    ],
  };
  const s = createRun(c);
  Object.assign(s, { d: r.d - r.length - 1, speed: 65 });
  while (s.d < r.land + 2 && !s.failed) stepRun(s, { boost: true }, 1 / 60);
  assert.equal(s.launches, 1);
  assert.equal(s.hull, 2);
  assert.equal(s.stunts, 0);
  assert.equal(s.y, 0);
});
test("Boost trail keeps past world positions as the car turns and clears after a teleport", () => {
  const history = new PathHistory(64, 0.75);
  history.push(0, 1, 0, 0);
  history.push(0, 1, -1, 0.1);
  const before = JSON.stringify(history.points);
  history.push(1, 1, -2, 0.2);
  history.push(2, 1, -3, 0.3);
  assert.equal(JSON.stringify(history.points.slice(0, 2)), before);
  assert.equal(history.points.at(-1).x, 2);
  history.push(100, 1, -300, 0.4);
  assert.equal(history.points.length, 1);
  history.expire(1.2);
  assert.equal(history.points.length, 0);
});
test("Updated track records replace incompatible ghosts without removing earned paints", () => {
  const s = createRun();
  Object.assign(s, { finished: true, time: 63, score: 1000, hull: 2 });
  const old = {
    breakwater: {
      time: 40,
      score: 9999,
      medal: 3,
      badges: [true, true, true],
      ghost: [
        [0, 0, 0, 0],
        [40, 3600, 0, 0],
      ],
    },
  };
  const result = saveResult(old, s, [
    [0, 0, 0, 0],
    [63, 3600, 0, 0],
  ]);
  assert(result.record);
  assert.equal(result.records.breakwater.time, 63);
  assert.equal(result.records.breakwater.ghost[1][0], 63);
  assert.equal(completedCount(result.records), 1);
  assert.equal(result.records.breakwater.medal, 3);
});
test("Slingshot strips reward ground contact once and decay after use", () => {
  const s = createRun();
  Object.assign(s, { d: 524, x: -4.7, energy: 30 });
  advance(s, {}, 0.1);
  assert(s.padTime > 2);
  assert(s.energy > 55);
  const score = s.score;
  s.d = 524;
  advance(s, {}, 0.1);
  assert.equal(s.score, score);
  const air = createRun();
  Object.assign(air, { d: 524, x: -4.7, y: 5 });
  advance(air, { fly: true }, 0.1);
  assert.equal(air.padTime, 0);
});
test("Course records preserve independent best time, score, badges and fastest ghost", () => {
  const s = createRun();
  Object.assign(s, {
    finished: true,
    time: 60,
    score: 1000,
    gates: s.course.gates.length,
  });
  const ghost = [
    [0, 0, 0, 0],
    [60, 3600, 0, 0],
  ];
  let r = saveResult({}, s, ghost).records;
  Object.assign(s, { time: 62, score: 2000, hull: 2, gates: 10 });
  r = saveResult(r, s, []).records;
  assert.equal(r.breakwater.time, 60);
  assert.equal(r.breakwater.score, 2000);
  assert.deepEqual(r.breakwater.ghost, ghost);
  assert.deepEqual(r.breakwater.badges, [true, true, true]);
  assert.equal(completedCount(r), 1);
  const fail = createRun("redshift");
  fail.failed = true;
  assert.equal(saveResult(r, fail).records, r);
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
