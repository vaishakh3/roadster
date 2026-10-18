import assert from "node:assert/strict";
import { COURSES } from "../courses.js";
import { createRun, stepRun } from "../run.js";
import { updateDraft, rivalInput } from "../rivals.js";
import { driveInput } from "./driver.js";
import { createRivalField } from "../rivals-mesh.js";
import * as THREE from "../vendor/three.module.js";

let count = 0;
function test(name, fn) {
  fn();
  count++;
  console.log("PASS " + name);
}
const clearCourse = {
  ...COURSES[0],
  length: 12000,
  obstacles: [],
  gates: [],
  ramps: [],
  gaps: [],
  branches: [],
  tunnels: [],
  curve: [0, 285, 0, 710],
};
function advance(s, input, seconds, hz = 120) {
  for (let i = 0; i < seconds * hz; i++) stepRun(s, input, 1 / hz);
}

test("High-speed steering adds weight while boost retains independent left/right authority", () => {
  const slow = createRun(clearCourse),
    fast = createRun(clearCourse);
  slow.rivals = [];
  fast.rivals = [];
  slow.speed = 48;
  fast.speed = 76;
  advance(slow, { steer: 1 }, 0.35);
  advance(fast, { steer: 1, boost: true }, 0.35);
  assert(fast.x > 2.3 && slow.x > 2.3);
  assert(fast.steering < slow.steering);
  assert(fast.vx > 9 && fast.vx < slow.vx);
  advance(fast, { steer: -1, boost: true }, 0.65);
  assert(fast.vx < -10 && fast.boosting);
  advance(fast, {}, 1);
  assert(Math.abs(fast.vx) < 0.01 && Math.abs(fast.bodyRoll) < 0.01);
});

test("Slipstream requires a nearby aligned car on the ground and fades when leaving its wake", () => {
  const s = createRun(clearCourse),
    r = s.rivals[0];
  s.rivals = [r];
  s.speed = 60;
  r.d = 25;
  r.x = s.x = 0;
  for (let i = 0; i < 240; i++) updateDraft(s, 1 / 120);
  assert(s.drafting > 0.99 && s.draftTarget === r.id);
  r.x = 4;
  for (let i = 0; i < 240; i++) updateDraft(s, 1 / 120);
  assert(s.drafting < 0.01 && s.draftTarget === null);
  r.x = 0;
  s.airborne = true;
  for (let i = 0; i < 240; i++) updateDraft(s, 1 / 120);
  assert(s.drafting < 0.001);
  s.airborne = false;
  r.d = 4;
  updateDraft(s, 1 / 120);
  assert.equal(s.draftTarget, null);
});

test("Assisted drift remains bounded and recentres without steering into an edge", () => {
  const s = createRun({ ...clearCourse, curve: [80, 180, 60, 500] });
  s.rivals = [];
  Object.assign(s, { d: 300, speed: 76 });
  advance(s, { steer: 0.5, boost: true }, 0.5);
  assert(s.drift > 0 && s.drift < 0.65);
  assert(Math.abs(s.bodyRoll) <= 0.055 && Math.abs(s.slipAngle) < 0.3);
  const x = s.x;
  advance(s, { boost: true }, 1.2);
  assert(Math.abs(s.vx) < 0.001);
  assert(Math.abs(s.x - x) < 1);
});

test("A branch rewards a sustained ground line once, while the main lane remains playable", () => {
  const branch = {
    id: "test-line",
    name: "High road",
    start: 30,
    end: 400,
    entryX: 5.8,
    speedBonus: 6,
  };
  const c = { ...clearCourse, branches: [branch] },
    line = createRun(c),
    main = createRun(c);
  line.rivals = [];
  main.rivals = [];
  line.x = 5.8;
  advance(line, {}, 4);
  advance(main, {}, 4);
  assert(line.speed > main.speed + 3);
  assert.equal(line.branchesTaken, 1);
  assert.equal(main.branchesTaken, 0);
  const score = line.score;
  line.d = 35;
  advance(line, {}, 2.2);
  assert.equal(line.score, score);
  const air = createRun(c);
  air.rivals = [];
  air.x = 5.8;
  air.y = 5.8;
  advance(air, { fly: true }, 3);
  assert.equal(air.branchesTaken, 0);
});

test("Rival field is deterministic across 30,60,120Hz and does not respawn or teleport", () => {
  const snapshots = [30, 60, 120].map((hz) => {
    const s = createRun(clearCourse);
    s.eventSeed = 248;
    let previous = s.rivals.map((r) => r.d);
    for (let i = 0; i < 12 * hz; i++) {
      stepRun(s, { boost: true }, 1 / hz);
      s.rivals.forEach((r, j) => {
        assert(r.d >= previous[j]);
        assert(r.d - previous[j] < 90 / hz);
        previous[j] = r.d;
      });
    }
    return s;
  });
  for (const s of snapshots)
    for (let j = 0; j < 3; j++) {
      const a = s.rivals[j],
        b = snapshots[2].rivals[j];
      assert(Math.abs(a.d - b.d) < 0.00001 && Math.abs(a.x - b.x) < 0.00001);
      assert(a.energy >= 0 && a.energy <= 100);
    }
});

test("Rival pace is independent of player distance outside local avoidance", () => {
  const race = createRun(clearCourse),
    r = race.rivals[0];
  Object.assign(r, { d: 500, time: 15, speed: 65 });
  race.d = -10000;
  const behind = rivalInput(r, race);
  race.d = 10000;
  const ahead = rivalInput(r, race);
  assert.deepEqual(behind, ahead);
});

for (const c of COURSES)
  test(`${c.name}: all three opponents finish safely with overtakes and no interpenetration`, () => {
    for (const seed of [0, 19, 901]) {
      const s = createRun(c);
      s.eventSeed = seed;
      let overtakes = 0;
      while (!s.finished && !s.failed && s.time < 150) {
        const input = driveInput(s);
        input.boost = false;
        stepRun(s, input, 1 / 60);
        overtakes += s.rivals.filter((r) => r.overtaking).length;
        for (let a = 0; a < 3; a++)
          for (let b = a + 1; b < 3; b++) {
            const r = s.rivals[a],
              q = s.rivals[b];
            if (r.finished || q.finished) continue;
            if (Math.abs(r.d - q.d) < 4.7 && Math.abs(r.y - q.y) < 1)
              assert(
                Math.abs(r.x - q.x) > 2.1,
                `${c.id}: ${r.id} merged into ${q.id}`,
              );
          }
      }
      assert(s.finished);
      assert.equal(s.finishPosition, 4);
      assert(overtakes > 10);
      for (const r of s.rivals) {
        assert(r.finished && !r.failed && r.hull === 3);
        assert(r.finishTime > 0 && r.finishTime < s.finishTime);
        assert.equal(r.launches, c.ramps.length);
      }
    }
  });

test("Finish position freezes and repeated calls cannot award passes or branch rewards", () => {
  const s = createRun(clearCourse);
  s.d = clearCourse.length - 0.1;
  s.time = 150;
  s.rivals[0].finished = true;
  s.rivals[0].finishTime = 100;
  stepRun(s, {}, 1 / 120);
  assert(s.finished && s.finishPosition === 2);
  const score = s.score,
    time = s.time;
  advance(s, { boost: true }, 3);
  assert.equal(s.score, score);
  assert.equal(s.time, time);
  assert.equal(s.finishPosition, 2);
});

test("Upward transients cannot penetrate a tunnel ceiling", () => {
  const s = createRun({ ...clearCourse, tunnels: [{ start: 100, end: 250 }] });
  s.rivals = [];
  Object.assign(s, { d: 150, y: 9.4, vy: 35 });
  stepRun(s, {}, 1 / 60);
  assert(s.y <= 9.55 && s.vy <= 0);
});

test("Three opponent cars reuse eight draw batches and reset releases visible instances", () => {
  const scene = new THREE.Scene(),
    field = createRivalField(scene),
    s = createRun(clearCourse);
  field.update(
    s,
    { worldPos: (d, x, y) => new THREE.Vector3(x, y, -d) },
    1 / 60,
  );
  const meshes = field.root.children;
  assert.equal(meshes.length, 8);
  assert(meshes.every((m) => m.isInstancedMesh));
  assert.equal(meshes[0].count, 3);
  field.reset();
  assert(meshes.every((m) => m.count === 0));
  assert.equal(field.root.visible, false);
  field.dispose();
  assert.equal(scene.children.length, 0);
});
console.log(`${count} race dynamics checks passed.`);
