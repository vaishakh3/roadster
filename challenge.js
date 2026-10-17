/** Deterministic scoring. Only a safe landing banks an airborne combo. */
export const RUSH_DURATION = 90;
export function createChallenge() {
  return {
    score: 0,
    pending: 0,
    multiplier: 1,
    chain: 0,
    tricks: 0,
    gates: 0,
    landings: 0,
    bestCombo: 0,
    crashes: 0,
    lost: 0,
    event: null,
    ended: false,
  };
}
export function awardTrick(run, count = 1) {
  if (run.ended) return;
  for (let i = 0; i < count; i++) {
    run.chain++;
    run.multiplier = Math.min(4, 1 + (run.chain - 1) * 0.5);
    run.pending += Math.round(500 * run.multiplier);
    run.tricks++;
  }
  run.event = `COMBO ×${run.multiplier.toFixed(1)} · LAND TO BANK`;
}
export function awardGate(run) {
  if (run.ended) return;
  run.gates++;
  run.score += 200;
  run.event = "AIR GATE +200 · RESERVE +20%";
}
export function bankLanding(run) {
  if (run.ended || !run.pending) return 0;
  const award = run.pending + 250;
  run.score += award;
  run.landings++;
  run.bestCombo = Math.max(run.bestCombo, award);
  run.event = `CLEAN LANDING +${award.toLocaleString()}`;
  run.pending = 0;
  run.chain = 0;
  run.multiplier = 1;
  return award;
}
export function loseCombo(run, crash = false) {
  const lost = run.pending;
  run.lost += lost;
  run.pending = 0;
  run.chain = 0;
  run.multiplier = 1;
  if (crash) run.crashes++;
  return lost;
}
export function finishChallenge(run) {
  if (run.ended) return;
  loseCombo(run);
  run.ended = true;
}
export function medalFor(score) {
  return score >= 6000
    ? "GOLD"
    : score >= 3000
      ? "SILVER"
      : score >= 1000
        ? "BRONZE"
        : "TEST PILOT";
}
