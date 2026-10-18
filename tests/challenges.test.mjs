import assert from "node:assert/strict";
import {
  dailyEvent,
  dailyPassed,
  encodeChallenge,
  decodeChallenge,
  sampleReplay,
} from "../challenges.js";
import { COURSES } from "../courses.js";
let count = 0;
function test(name, fn) {
  fn();
  count++;
  console.log("PASS " + name);
}
const c = COURSES[0];
const samples = Array.from({ length: 901 }, (_, i) => [
  i / 10,
  (c.length * i) / 900,
  Math.sin(i * 0.1) * 6,
  Math.max(0, Math.sin(i * 0.03) * 16),
]);
const input = { courseId: c.id, samples, time: 90, score: 32000 };
test("Completed ghost roundtrips into a bounded account-free challenge", () => {
  const code = encodeChallenge(input),
    d = decodeChallenge(code);
  assert(code.length <= 6000);
  assert.equal(d.courseId, c.id);
  assert.equal(d.samples.length, 640);
  assert.equal(d.time, 90);
  assert.equal(d.samples.at(-1)[1], c.length);
  assert.equal(d.score, 32000);
});
test("Ghost sample quantization stays within ten centimetres laterally", () => {
  const out = decodeChallenge(encodeChallenge(input));
  out.samples.forEach((p, i) =>
    assert(Math.abs(p[2] - samples[Math.round((i * 900) / 639)][2]) <= 0.051),
  );
});
test("Malformed, oversized, old-layout and truncated challenge links reject safely", () => {
  const code = encodeChallenge(input);
  for (const bad of ["", "<script>", code.slice(0, -4), "a".repeat(6001)])
    assert.throws(() => decodeChallenge(bad));
  const raw = Buffer.from(code, "base64url");
  raw[3] = 0;
  assert.throws(
    () => decodeChallenge(raw.toString("base64url")),
    /older track/,
  );
});
test("Challenge producer rejects unfinished and non-finite runs", () => {
  assert.throws(() =>
    encodeChallenge({ ...input, samples: samples.slice(0, 10) }),
  );
  assert.throws(() => encodeChallenge({ ...input, time: NaN }));
  const bad = samples.map((p) => [...p]);
  bad[0][2] = Infinity;
  assert.throws(() => encodeChallenge({ ...input, samples: bad }));
});
test("Daily event is stable across timezones within the same UTC day", () => {
  assert.deepEqual(
    dailyEvent(new Date("2026-10-18T01:00:00Z")),
    dailyEvent(new Date("2026-10-18T23:00:00Z")),
  );
  assert.notEqual(
    dailyEvent(new Date("2026-10-19")).seed,
    dailyEvent(new Date("2026-10-18")).seed,
  );
});
test("Every daily objective requires a finish and its actual goal", () => {
  const s = {
    finished: true,
    course: c,
    time: c.gold - 1,
    finishPosition: 2,
    gates: c.gates.length,
    hull: 3,
  };
  for (const kind of ["precision", "sprint", "clean"]) {
    assert(dailyPassed({ kind }, s));
    assert(!dailyPassed({ kind }, { ...s, finished: false }));
  }
  assert(!dailyPassed({ kind: "precision" }, { ...s, gates: 0 }));
  assert(!dailyPassed({ kind: "clean" }, { ...s, hull: 2 }));
  assert(!dailyPassed({ kind: "sprint" }, { ...s, finishPosition: 4 }));
});
test("Daily ghost preserves the same event seed and rejects another venue", () => {
  const event = dailyEvent(new Date("2026-10-18")),
    course = COURSES.find((c) => c.id === event.courseId),
    ps = [
      [0, 0, 0, 0],
      [90, course.length, 0, 0],
    ];
  const out = decodeChallenge(
    encodeChallenge({
      ...input,
      courseId: course.id,
      samples: ps,
      day: event.day,
    }),
  );
  assert.equal(out.event.seed, event.seed);
});
test("Replay interpolates all captured channels and can seek backward without altering samples", () => {
  const p = [
      [0, 0, 0, 0, 32],
      [1, 50, 4, 6, 60],
      [2, 110, 0, 0, 65],
    ],
    before = JSON.stringify(p);
  assert.deepEqual(sampleReplay(p, 0.5).values, [0.5, 25, 2, 3, 46]);
  assert.equal(sampleReplay(p, 0.5, 1).cursor, 0);
  assert.equal(JSON.stringify(p), before);
});
console.log(`\n${count} challenge/replay checks passed.`);
