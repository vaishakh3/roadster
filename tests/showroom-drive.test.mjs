import assert from "node:assert/strict";
import { COURSES } from "../courses.js";
import { createRun } from "../run.js";
import { createShowroomDrive } from "../showroom-drive.js";

let count = 0;
function test(name, fn) {
  fn();
  count++;
  console.log("PASS " + name);
}
const snapshot = (drive) =>
  JSON.stringify({ state: drive.state, fade: drive.fade });

for (const course of COURSES)
  for (const hz of [30, 60]) {
    test(`${course.name} menu driver completes two full courses at ${hz} Hz without damage`, () => {
      const drive = createShowroomDrive(course);
      let previous = drive.state;
      let previousD = previous.d;
      let transitions = 0;
      let frames = 0;
      let sawFade = false;
      while (drive.stats.cycles < 2 && frames++ < hz * 400) {
        drive.update(1 / hz);
        const s = drive.state;
        assert.equal(s.rivals.length, 0);
        assert.equal(s.events.length, 0);
        assert(s.passedGaps.size <= course.gaps.length);
        assert.equal(s.flyovers.size, 0);
        assert.equal(s.hull, 3);
        assert.equal(s.failed, false);
        assert(drive.fade >= 0 && drive.fade <= 1);
        sawFade ||= drive.fade > 0;
        for (const key of [
          "d",
          "x",
          "y",
          "speed",
          "time",
          "energy",
          "stuntAngle",
        ])
          assert(Number.isFinite(s[key]), key);
        assert(s.speed <= 43.000001);
        assert(
          s.processed.size <
            course.obstacles.length +
              course.gates.length +
              course.ramps.length +
              course.pads.length +
              (course.branches?.length || 0) +
              5,
        );
        if (s !== previous) {
          assert.equal(previous.finished, true);
          assert.equal(previous.passedGaps.size, course.gaps.length);
          assert(previous.launches >= course.gaps.length);
          assert(drive.fade > 0.85, "the reset must be concealed by the fade");
          transitions++;
          previous = s;
        } else
          assert(s.d >= previousD, "motion must never reverse within a lap");
        previousD = s.d;
      }
      assert.equal(transitions, 2);
      assert.equal(drive.stats.completed, 2);
      assert.equal(drive.stats.recoveries, 0);
      assert(sawFade);
    });
  }

test("menu state and course changes stay independent of player progress", () => {
  const player = createRun(COURSES[0]);
  player.score = 5432;
  player.processed.add("player-checkpoint");
  const before = JSON.stringify(player);
  const drive = createShowroomDrive(COURSES[0]);
  for (let i = 0; i < 1800; i++) drive.update(1 / 60);
  assert.notEqual(drive.state, player);
  assert.notEqual(drive.state.processed, player.processed);
  drive.reset(COURSES[2]);
  assert.equal(drive.state.course, COURSES[2]);
  assert.equal(drive.state.d, 80);
  assert.equal(drive.fade, 0);
  assert.equal(drive.stats.cycles, 0);
  assert.equal(JSON.stringify(player), before);
});

test("inspection and settings freeze physics and fades; reduced motion stays static", () => {
  const drive = createShowroomDrive(COURSES[0]);
  drive.update(0.1);
  let before = snapshot(drive);
  for (let i = 0; i < 60; i++) drive.update(0.1, { paused: true });
  assert.equal(snapshot(drive), before);
  assert.equal(drive.stats.moving, false);
  drive.state.finished = true;
  drive.update(1 / 60);
  drive.update(0.1);
  assert(drive.fade > 0);
  before = snapshot(drive);
  drive.update(0.1, { paused: true, reduced: true });
  assert.equal(snapshot(drive), before);
  drive.update(0.1, { reduced: true });
  assert.equal(drive.state.d, 80);
  assert.equal(drive.state.speed, 0);
  assert.equal(drive.fade, 0);
  before = snapshot(drive);
  for (let i = 0; i < 600; i++) drive.update(0.1, { reduced: true });
  assert.equal(snapshot(drive), before);
  drive.reset(COURSES[1]);
  assert.equal(drive.state.speed, 0);
  drive.update(1 / 60);
  assert(drive.state.d > 80);
  assert(drive.state.speed > 0);
});

test("stalled frames are bounded, invalid time is ignored and failed runs recover behind a fade", () => {
  const drive = createShowroomDrive(COURSES[0]);
  const before = snapshot(drive);
  for (const dt of [NaN, Infinity, -1, undefined]) drive.update(dt);
  assert.equal(snapshot(drive), before);
  drive.update(400);
  assert(Math.abs(drive.state.time - 0.1) < 1e-9);
  drive.state.failed = true;
  const failed = drive.state;
  for (let i = 0; i < 50; i++) drive.update(1 / 60);
  assert.notEqual(drive.state, failed);
  assert.equal(drive.state.failed, false);
  assert.equal(drive.stats.recoveries, 1);
  assert.equal(drive.stats.cycles, 1);
  assert.equal(drive.fade, 0);
  assert(drive.stats.moving);
});

console.log(`${count} showroom driving checks passed.`);
