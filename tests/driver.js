import { hazardPose } from "../courses.js";
// Deterministic test driver; never included in the shipped game bundle.
export function driveInput(s) {
  const c = s.course,
    g = c.gates.find((g) => g.d > s.d);
  const gap = c.gaps.find((g) => s.d > g.start - 90 && s.d < g.end + 8);
  const hazards = c.obstacles
    .map((o) => {
      const now = hazardPose(o, s.time);
      const arrival = Math.max(
        0,
        Math.min(2, (now.d - s.d) / Math.max(27, s.speed)),
      );
      return { ...o, ...hazardPose(o, s.time + arrival) };
    })
    .filter((o) => o.d > s.d - 9 && o.d < s.d + 100)
    .sort((a, b) => a.d - b.d);
  let x = g?.x || 0,
    fly = !!gap;
  const low = c.obstacles.find(
    (o) => o.kind === "gantry" && o.d > s.d - 9 && o.d < s.d + 180,
  );
  const o = hazards[0];
  if (o && !gap && o.kind !== "gantry") {
    if (o.kind === "sweeper" || o.kind === "cargo") fly = !low;
    else x = o.x >= 0 ? -6 : 6;
  }
  // Plan a clear corridor through closely spaced traffic and barriers instead
  // of committing to an outer lane until the first obstacle is behind us.
  if (!gap && !fly && hazards.filter((h) => !h.bottom).length > 1) {
    const lanes = [-6, -3, 0, 3, 6].filter((lane) =>
      hazards.every((h) => h.bottom || Math.abs(lane - h.x) > h.w / 2 + 1.3),
    );
    if (lanes.length)
      x = lanes.sort(
        (a, b) => Math.abs(a - (g?.x || 0)) - Math.abs(b - (g?.x || 0)),
      )[0];
    else if (!low) fly = true;
  }
  if (low) fly = false;
  const ramp = c.ramps.find(
    (r) => s.d > r.d - (r.length || 10) - 55 && s.d < r.d,
  );
  if (ramp && (!g || g.d >= ramp.d - (ramp.length || 10))) {
    x = ramp.x;
    fly = false;
  }
  if (s.flight) {
    x = g?.x || 0;
    fly = false;
  }

  return {
    steer: Math.max(-1, Math.min(1, (x - s.x) * 2 - s.vx * 0.2)),
    fly,
    boost: s.energy > 18,
  };
}
