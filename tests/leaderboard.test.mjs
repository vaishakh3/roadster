import assert from "node:assert/strict";
import {
  LIMITS,
  cleanName,
  validateEntry,
  rankValue,
  encodeMember,
  decodeMember,
  rows,
  todayIndex,
} from "../leaderboard-core.js";

let count = 0;
const test = (name, fn) => {
  fn();
  count++;
  console.log("PASS " + name);
};
const now = Date.parse("2026-10-18T12:00:00Z");
const good = {
  day: todayIndex(now),
  courseId: "breakwater",
  id: "abcdef12345678",
  name: "  vaishakh <b>!!  ",
  time: 71.94,
  score: 35673,
  passed: true,
};
test("Names are sanitised, upper-cased and bounded", () => {
  assert.equal(cleanName(good.name), "VAISHAKH B");
  assert.equal(cleanName("<script>"), "SCRIPT");
  assert.equal(cleanName(""), "ROADSTER");
  assert.equal(cleanName("a".repeat(40)).length, LIMITS.name);
});
test("Submissions are validated for day, id, course and plausible results", () => {
  const ok = validateEntry(good, now);
  assert(ok.ok);
  assert.equal(ok.entry.time, 71.9);
  assert.equal(ok.entry.name, "VAISHAKH B");
  assert.equal(validateEntry({ ...good, day: good.day - 2 }, now).error, "day");
  assert.equal(validateEntry({ ...good, day: good.day + 1 }, now).error, "day");
  assert.equal(validateEntry({ ...good, id: "x" }, now).error, "id");
  assert.equal(validateEntry({ ...good, courseId: "../x" }, now).error, "course");
  assert.equal(validateEntry({ ...good, time: 3 }, now).error, "result");
  assert.equal(validateEntry({ ...good, score: 1e9 }, now).error, "result");
  assert.equal(validateEntry({ ...good, score: 12.5 }, now).error, "result");
  assert.equal(validateEntry(null, now).error, "body");
});
test("Ranking puts cleared runs first, then score, then faster time", () => {
  const a = { score: 30000, time: 80, passed: true },
    b = { score: 40000, time: 70, passed: false },
    c = { score: 30000, time: 75, passed: true };
  assert(rankValue(a) > rankValue(b));
  assert(rankValue(c) > rankValue(a));
});
test("Sorted-set members round-trip and WITHSCORES output becomes ranked rows", () => {
  const entry = validateEntry(good, now).entry;
  const member = encodeMember(entry);
  assert.deepEqual(decodeMember(member), {
    id: entry.id,
    name: entry.name,
    time: entry.time,
    score: entry.score,
    passed: true,
  });
  const list = rows([member, "1035673928", "not json", "0", encodeMember({ ...entry, id: "zzzzzzzz1", name: "B" }), "5"]);
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((r) => r.rank), [1, 2]);
  assert.equal(decodeMember("[broken"), null);
});
console.log(`${count} leaderboard checks passed.`);
