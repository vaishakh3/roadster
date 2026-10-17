import { hazardPose } from "../courses.js";
// Deterministic test driver; never included in the shipped game bundle.
export function driveInput(s) {
  const c = s.course,
    g = c.gates.find((g) => g.d > s.d);
  const gap = c.gaps.find((g) => s.d > g.start - 90 && s.d < g.end + 8);
  const hazards = c.obstacles
    .map((o) => ({ ...o, ...hazardPose(o, s.time) }))
    .filter((o) => o.d > s.d - 9 && o.d < s.d + 100)
    .sort((a, b) => a.d - b.d);
  let x = g?.x || 0,
    fly = !!gap;
  const low = c.obstacles.find(
    (o) => o.kind === "gantry" && o.d > s.d - 9 && o.d < s.d + 180,
  );
  const o = hazards[0];
  if (o && !gap && o.kind !== "gantry") {
    if (o.kind === "sweeper") fly = !low;
    else x = o.x >= 0 ? -6 : 6;
  }
  if (low) fly = false;
  return {
    steer: Math.max(-1, Math.min(1, (x - s.x) * 2 - s.vx * 0.2)),
    fly,
    boost: s.energy > 18,
  };
}
