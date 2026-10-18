import { hazardPose } from "./courses.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const RIVAL_DRIVERS = [
  { id: "nova", name: "NOVA", color: 0x66d9e8, lane: -3.6, pace: 0.83 },
  { id: "echo", name: "ECHO", color: 0xe7dfbc, lane: 0, pace: 0.76 },
  { id: "volt", name: "VOLT", color: 0xa991f7, lane: 3.6, pace: 0.72 },
];

/** Rivals use the player's integrator, energy, grip, ramps and obstacle contacts.
 * Their choices are deterministic, with no teleporting or rubber-band speed. */
export function createRivals(course, factory) {
  return RIVAL_DRIVERS.map((driver, i) => ({
    ...factory(course, { rival: true }),
    ...driver,
    d: 12 + i * 12,
    x: driver.lane,
    index: i,
    previousPlace: 0,
    mistakes: 0,
    mistakeActive: false,
    targetLane: driver.lane,
    overtaking: false,
  }));
}

export function rivalInput(r, race) {
  const c = r.course,
    seed = Number(race.eventSeed) || 0,
    phase = r.time + r.index * 5.1 + (seed % 31) * 0.07,
    gate = c.gates.find((g) => g.d > r.d),
    gap = c.gaps.find((g) => r.d > g.start - 100 && r.d < g.end + 10),
    ramp = c.ramps.find((p) => r.d > p.d - p.length - 85 && r.d < p.d),
    low = c.obstacles.find(
      (o) => o.bottom > 0 && o.d > r.d - 10 && o.d < r.d + 190,
    );
  let x = gate ? gate.x : r.lane,
    fly = !!gap,
    urgent = false;
  let next = null,
    nearest = Infinity;
  for (const obstacle of c.obstacles) {
    // Moving barriers are anticipated at the time the car reaches them.
    const now = hazardPose(obstacle, r.time),
      arrival = clamp((now.d - r.d) / Math.max(28, r.speed), 0, 2),
      pose = hazardPose(obstacle, r.time + arrival),
      distance = pose.d - r.d;
    if (distance > -11 && distance < 125 && distance < nearest) {
      nearest = distance;
      next = { ...obstacle, ...pose };
    }
  }
  if (next && !gap && !next.bottom) {
    urgent = true;
    if ((next.kind === "sweeper" || next.kind === "cargo") && !low) fly = true;
    else x = next.x >= 0 ? -6.3 : 6.3;
  }
  if (low) fly = false;
  const branch = c.branches?.find((b) => r.d > b.start - 55 && r.d < b.end);
  if (branch && !urgent && !gap && !ramp && r.index !== 1) x = branch.entryX;
  // Two lanes fit a grip ramp; the centre driver follows at a safe distance.
  if (ramp && (!gate || gate.d >= ramp.d - ramp.length)) {
    x =
      ramp.x +
      clamp(
        r.lane * 0.56,
        -(ramp.width || 7) / 2 + 1.2,
        (ramp.width || 7) / 2 - 1.2,
      );
    fly = false;
  }
  if (r.flight) {
    x = (gate?.x || 0) + r.lane * 0.5;
    fly = false;
  }
  r.overtaking = false;
  let blocked = false;
  for (const other of [race, ...race.rivals]) {
    if (other === r || other.failed || other.finished) continue;
    const ahead = other.d - r.d;
    if (ahead < -6 || ahead > 36 || Math.abs(other.y - r.y) > 2) continue;
    // Never merge into a car already alongside, even when an obstacle asks
    // both drivers to pick the same escape lane.
    const side = r.x < other.x ? -1 : 1;
    if (
      Math.abs(ahead) < 7 &&
      Math.abs(other.x - r.x) < 3.4 &&
      Math.abs(other.x - r.x) > 1.5
    ) {
      x = side < 0 ? Math.min(x, other.x - 2.55) : Math.max(x, other.x + 2.55);
    }
    if (ahead <= 0 || Math.abs(other.x - r.x) > 2.7) continue;
    if (!urgent && !ramp && !r.flight && !gap) {
      const left = other.x - 3.2,
        right = other.x + 3.2;
      x =
        Math.abs(left) < 7.3 && (r.lane <= other.x || right > 7.3)
          ? left
          : right;
      x = clamp(x, -7.3, 7.3);
      r.overtaking = true;
    }
    if (ahead < 18 && Math.abs(other.x - r.x) < 2.6) blocked = true;
  }
  // A readable hesitation on clear road gives the field human rhythm without
  // manufacturing crashes or changing pace in response to the player's rank.
  const mistake =
    phase % 23 > 20.9 &&
    phase % 23 < 22.1 &&
    !urgent &&
    !gap &&
    !ramp &&
    !r.airborne;
  if (mistake && !r.mistakeActive) r.mistakes++;
  r.mistakeActive = mistake;
  r.targetLane = x;
  return {
    steer: clamp((x - r.x) * 1.65 - r.vx * 0.22, -1, 1),
    fly,
    boost:
      !mistake &&
      !blocked &&
      r.energy > 18 + r.index * 2 &&
      phase % 9 < 9 * r.pace,
    brake: blocked,
  };
}

export function updateDraft(s, dt) {
  let strength = 0,
    target = null;
  if (!s.airborne && s.attachedRamp < 0 && s.speed > 35)
    for (const r of s.rivals) {
      const gap = r.d - s.d;
      if (
        r.failed ||
        r.finished ||
        r.airborne ||
        gap < 7 ||
        gap > 46 ||
        Math.abs(s.x - r.x) > 2.5
      )
        continue;
      const value =
        Math.min(1, (gap - 7) / 6, (46 - gap) / 14) *
        (1 - Math.abs(s.x - r.x) / 2.5);
      if (value > strength) {
        strength = value;
        target = r.id;
      }
    }
  s.drafting += (strength - s.drafting) * (1 - Math.exp(-dt * 3));
  s.draftTarget = target;
}

export function updateRacePosition(s) {
  let place = 1;
  for (const r of s.rivals) {
    if (r.failed) continue;
    const ahead = r.finished
      ? !s.finished || r.finishTime <= s.finishTime
      : !s.finished && r.d > s.d;
    if (ahead) place++;
  }
  s.position = place;
  if (s.finished) s.finishPosition = place;
}
