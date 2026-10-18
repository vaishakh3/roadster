import assert from "node:assert/strict";
import {
  nextMission,
  cupsEarned,
  missionPassed,
  awardMission,
  missionStatus,
} from "../missions.js";
let pass = 0;
const check = (name, fn) => {
  fn();
  pass++;
  console.log("PASS " + name);
};
const finished = (place, hull = 3) => ({
  finished: true,
  failed: false,
  finishPosition: place,
  position: place,
  hull,
});
check("Career begins with a concrete achievable podium objective", () => {
  const m = nextMission({}, "breakwater");
  assert.equal(m.place, 3);
  assert.equal(m.level, 0);
  assert.match(m.title, /PODIUM/);
});
check("Crossing the line in fourth does not earn the podium cup", () =>
  assert.equal(
    missionPassed(nextMission({}, "breakwater"), finished(4)),
    false,
  ),
);
check("A podium advances one cup and keeps other venues intact", () => {
  const old = { redshift: 1 },
    m = nextMission(old, "breakwater"),
    r = awardMission(old, "breakwater", m, finished(2));
  assert.equal(r.career.breakwater, 1);
  assert.equal(r.career.redshift, 1);
  assert.equal(old.breakwater, undefined);
});
check("The same finished run cannot award the next cup twice", () => {
  const m = nextMission({}, "breakwater"),
    r = awardMission({}, "breakwater", m, finished(1)),
    again = awardMission(r.career, "breakwater", m, finished(1));
  assert.equal(again.awarded, false);
  assert.equal(again.career.breakwater, 1);
});
check("A silver cup requires victory rather than just a podium", () => {
  const m = nextMission({ breakwater: 1 }, "breakwater");
  assert.equal(missionPassed(m, finished(2)), false);
  assert.equal(missionPassed(m, finished(1)), true);
});
check("Clean victory requires all condition bars and the finish", () => {
  const m = nextMission({ breakwater: 2 }, "breakwater");
  assert.equal(missionPassed(m, finished(1, 2)), false);
  assert.equal(missionPassed(m, { ...finished(1), finished: false }), false);
  assert.equal(missionPassed(m, { ...finished(1), failed: true }), false);
  assert.equal(missionPassed(m, finished(1)), true);
});
check("Completed career remains bounded and offers title defence", () => {
  const m = nextMission({ breakwater: 3 }, "breakwater");
  assert.equal(m.mastered, true);
  assert.equal(
    awardMission({ breakwater: 3 }, "breakwater", m, finished(1)).awarded,
    false,
  );
});
check(
  "Corrupt progress is sanitized without skipping required cup conditions",
  () => {
    for (const v of ["3", {}, null, NaN, 1.5])
      assert.equal(cupsEarned({ breakwater: v }, "breakwater"), 0);
    assert.equal(cupsEarned({ breakwater: 99 }, "breakwater"), 3);
    assert.equal(cupsEarned({ breakwater: -8 }, "breakwater"), 0);
  },
);
check("Live objective names the missing pass and damage failure", () => {
  assert.match(
    missionStatus(nextMission({}, "breakwater"), finished(4)).text,
    /PASS 1 RIVAL/,
  );
  assert.equal(
    missionStatus(nextMission({}, "breakwater"), finished(3)).good,
    true,
  );
  assert.match(
    missionStatus(nextMission({ breakwater: 2 }, "breakwater"), finished(1, 2))
      .text,
    /DAMAGE TAKEN/,
  );
});
console.log(`${pass} career objective checks passed.`);
