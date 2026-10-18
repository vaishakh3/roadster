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

  // Look along the actual lane-change path. A clear destination is not
  // enough when another body is alongside between the current and target lane.
  let brake = false;
  const nearby = (s.rivals || []).filter(
    (r) =>
      !r.failed &&
      !r.finished &&
      r.d > s.d - 12 &&
      r.d < s.d + 55 &&
      Math.abs(r.y - s.y) < 1.6,
  );
  if (nearby.length && !s.flight && s.attachedRamp < 0) {
    const half = ramp ? (ramp.width || 7) / 2 - 1.2 : 7.1;
    const centre = ramp?.x || 0;
    const blocked = (lane) =>
      nearby.some((r) => {
        for (const t of [0.1, 0.25, 0.45, 0.7, 1]) {
          const px = s.x + Math.max(-10 * t, Math.min(10 * t, lane - s.x));
          const rx = r.x + r.vx * Math.min(t, 0.4);
          const gap = r.d - s.d + (r.speed - s.speed) * t;
          if (Math.abs(gap) < 7.5 && Math.abs(px - rx) < 2.8) return true;
        }
        return false;
      });
    if (blocked(x)) {
      const candidates = [x, x - 2, x + 2, -6, -3, 0, 3, 6, s.x]
        .filter((lane) => Math.abs(lane - centre) <= half)
        .filter((lane) => !g || g.d - s.d > 90 || Math.abs(lane - g.x) < 2.7)
        .filter((lane) => !blocked(lane))
        .filter(
          (lane) =>
            fly ||
            hazards.every(
              (h) => h.bottom || Math.abs(lane - h.x) > h.w / 2 + 1.3,
            ),
        );
      if (candidates.length)
        x = candidates.sort((a, b) => Math.abs(a - x) - Math.abs(b - x))[0];
      else {
        // Give the adjacent car a length of room before crossing its lane.
        // The brake is a normal player control; there are no scripted teleports.
        x = s.x;
        brake = true;
      }
    }
  }

  // If traffic delayed a necessary gate approach, trade speed for a clean
  // line early enough to steer there. This uses the same brake available to players.
  if (
    g &&
    !g.y &&
    !s.flight &&
    Math.abs(s.x - g.x) > 2.5 &&
    g.d - s.d < ((Math.abs(s.x - g.x) - 1.5) * s.speed) / 9 + 10
  )
    brake = true;

  return {
    steer: Math.max(-1, Math.min(1, (x - s.x) * 2 - s.vx * 0.2)),
    fly,
    boost: s.energy > 18 && !brake,
    brake,
  };
}
