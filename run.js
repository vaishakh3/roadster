/** Breakwater's deterministic arcade simulation. Metres, seconds; X is across the road.
 * Steering and lift are independent of thrust, including during takeoff/landing.
 * The assisted route heading keeps the controls simple; this is not a vehicle simulator. */
import { COURSES, getCourse, hazardPose } from "./courses.js";
export const LENGTH = COURSES[0].length;
export const ROAD_HALF = 10;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const SECTORS = COURSES[0].sectors;
export const GAPS = COURSES[0].gaps;
export const OBSTACLES = COURSES[0].obstacles;
export const GATES = COURSES[0].gates;
export const inGap = (d, course = COURSES[0]) =>
  course.gaps.some((g) => d >= g.start && d <= g.end);
export function roadX(d, course = COURSES[0]) {
  const [a, b, c, e] = course.curve;
  return Math.sin(d / b) * a + Math.sin(d / e) * c;
}
export function roadSlope(d, course = COURSES[0]) {
  const [a, b, c, e] = course.curve;
  return (Math.cos(d / b) * a) / b + (Math.cos(d / e) * c) / e;
}
export function roadY(d, course = COURSES[0]) {
  const [a, b, c, e] = course.elevation;
  return 22 + Math.sin(d / b) * a + Math.sin(d / e) * c;
}
export function createRun(course = COURSES[0]) {
  return {
    course: typeof course === "string" ? getCourse(course) : course,
    d: 0,
    x: 0,
    vx: 0,
    y: 0,
    vy: 0,
    speed: 32,
    energy: 100,
    time: 0,
    hull: 3,
    score: 0,
    chain: 0,
    gates: 0,
    perfect: 0,
    topSpeed: 0,
    airtime: 0,
    boosting: false,
    lifting: false,
    airborne: false,
    invulnerable: 0,
    sector: 0,
    finished: false,
    failed: false,
    reason: "",
    processed: new Set(),
    passedGaps: new Set(),
    events: [],
    roll: 0,
    rollTime: 0,
    streak: 0,
    bestChain: 0,
    gapRescue: false,
    near: 0,
    padTime: 0,
    launches: 0,
    rampPitch: 0,
  };
}
function event(s, type, text, points = 0) {
  s.events.push({ type, text, points });
  if (s.events.length > 8) s.events.shift();
}
function finish(s, failed, reason) {
  s.failed = failed;
  s.finished = !failed;
  s.reason = reason;
  if (!failed)
    s.score += Math.round(
      Math.max(0, s.course.silver + 14 - s.time) * 60 + s.hull * 400,
    );
  event(s, failed ? "fail" : "finish", reason);
}
export function stepRun(s, raw, frameDt) {
  if (s.finished || s.failed) return;
  const dt = clamp(Number.isFinite(frameDt) ? frameDt : 0, 0, 0.1);
  const steps = Math.ceil(dt * 120);
  for (let i = 0; i < steps; i++) {
    tick(s, raw, dt / steps);
    if (s.finished || s.failed) break;
  }
}
function tick(s, raw, dt) {
  s.time += dt;
  s.padTime = Math.max(0, s.padTime - dt);
  const {
    gaps: GAPS,
    obstacles: OBSTACLES,
    gates: GATES,
    sectors: SECTORS,
    length: LENGTH,
  } = s.course;
  s.invulnerable = Math.max(0, s.invulnerable - dt);
  const steer = clamp(Number(raw.steer) || 0, -1, 1);
  const brake = !!raw.brake;
  s.boosting = !!raw.boost && s.energy > 0.5 && !brake;
  s.lifting = !!raw.fly && s.energy > 0.5;
  // Air and road retain the same lateral authority. Boost never consumes steering.
  const targetVx = steer * (s.y > 0.5 ? 12.5 : 11.5);
  s.vx += (targetVx - s.vx) * (1 - Math.exp(-dt * 9));
  s.x += s.vx * dt;
  if (Math.abs(s.x) > ROAD_HALF - 1.15) {
    s.x = Math.sign(s.x) * (ROAD_HALF - 1.15);
    s.vx *= -0.18;
    s.speed = Math.max(28, s.speed - dt * 15);
  }
  const targetSpeed = brake
    ? 27
    : s.padTime > 0
      ? 88
      : s.boosting
        ? 76
        : 48 + s.sector * 2;
  s.speed +=
    (targetSpeed - s.speed) *
    (1 - Math.exp(-dt * (brake ? 3 : s.boosting ? 1.1 : 0.75)));
  const prevD = s.d;
  s.d += s.speed * dt;
  s.topSpeed = Math.max(s.topSpeed, s.speed);
  const gap = inGap(s.d, s.course);
  if (s.lifting) {
    // Damped lift, then a gentle automatic ceiling. Releasing gives a predictable glide.
    const liftAccel = clamp((5.8 - s.y) * 13 - s.vy * 5, -18, 24);
    s.vy += liftAccel * dt;
  } else if (s.y > 0 || gap) s.vy -= 9.81 * dt;
  s.y += s.vy * dt;
  const ramp = s.course.ramps.find(
    (r) => s.d >= r.d - 10 && s.d < r.d && Math.abs(s.x - r.x) < 3.5,
  );
  const floor = ramp ? (s.d - ramp.d + 10) * 0.15 : 0;
  s.rampPitch = ramp && s.y < floor + 0.3 ? 0.15 : 0;
  if (!gap && s.y <= floor) {
    if (s.airborne && s.vy < -3) event(s, "land", "TOUCHDOWN");
    s.y = floor;
    s.vy = 0;
  }
  s.airborne = s.y > floor + 0.25 || gap;
  if (s.airborne) s.airtime += dt;
  // Flight stays available at the final bridge even after an imperfect run.
  // Amber approach strips are also reserve stations; the warning announces the refill.
  for (let i = 0; i < GAPS.length; i++) {
    const g = GAPS[i];
    if (prevD < g.start - 145 && s.d >= g.start - 145) {
      s.energy = Math.max(s.energy, 65);
      event(s, "approach", "BRIDGE OUT · HOLD FLY");
    }
    if (prevD <= g.end && s.d > g.end && s.y > -0.5) {
      s.passedGaps.add(i);
      s.score += 300;
      event(s, "gap", "GAP CLEARED", 300);
    }
  }
  if (s.y < -2) {
    finish(s, true, "THE BRIDGE WAS OUT");
    return;
  }
  const drain = (s.boosting ? 20 : 0) + (s.lifting ? 12 : 0);
  s.energy = clamp(
    s.energy + (drain ? -drain : s.y < 0.3 ? 17 : 4) * dt,
    0,
    100,
  );
  for (const [i, p] of s.course.pads.entries()) {
    if (
      prevD <= p.d &&
      s.d > p.d &&
      Math.abs(s.x - p.x) < 2.8 &&
      s.y < 0.8 &&
      !s.processed.has("p" + i)
    ) {
      s.processed.add("p" + i);
      s.padTime = 2.5;
      s.energy = Math.min(100, s.energy + 25);
      s.score += 200;
      event(s, "pad", "SLINGSHOT", 200);
    }
  }
  for (const [i, r] of s.course.ramps.entries()) {
    if (
      prevD <= r.d &&
      s.d > r.d &&
      Math.abs(s.x - r.x) < 3.5 &&
      s.y < 2 &&
      !s.processed.has("r" + i)
    ) {
      s.processed.add("r" + i);
      s.vy = 12;
      s.y = 1.5;
      s.launches++;
      s.energy = Math.max(s.energy, 65);
      event(s, "launch", "LAUNCH · HOLD FLY");
    }
  }
  for (let i = 0; i < OBSTACLES.length; i++) {
    const o = OBSTACLES[i],
      key = "o" + i;
    const pose = hazardPose(o, s.time),
      before = hazardPose(o, s.time - dt);
    const depth = (o.depth || 2.7) / 2;
    // Swept longitudinal contact prevents skipping obstacles during fast/slow frames.
    if (s.processed.has(key) || s.d + 2.35 < pose.d - depth) continue;
    if (prevD - 2.35 > before.d + depth) {
      s.processed.add(key);
      continue;
    }
    if (
      Math.abs(s.x - pose.x) < o.w / 2 + 0.96 &&
      s.y < o.h &&
      s.y + 1.25 > (o.bottom || 0) &&
      !s.invulnerable
    ) {
      s.processed.add(key);
      s.hull--;
      s.chain = 0;
      s.speed *= 0.62;
      s.invulnerable = 1.25;
      s.score = Math.max(0, s.score - 100);
      event(s, "hit", "IMPACT · KEEP GOING");
      if (!s.hull) {
        finish(s, true, "TOO MUCH DAMAGE");
        return;
      }
    } else if (s.d > pose.d + depth + 2.4) {
      s.processed.add(key);
      if (
        Math.abs(s.x - pose.x) < o.w / 2 + 2.8 &&
        s.y < o.h + 0.6 &&
        !o.bottom
      ) {
        s.score += 150;
        s.near++;
        event(s, "near", "CLOSE CALL", 150);
      }
    }
  }
  for (let i = 0; i < GATES.length; i++) {
    const g = GATES[i],
      key = "g" + i;
    if (s.processed.has(key) || s.d < g.d) continue;
    s.processed.add(key);
    if (prevD > g.d) continue;
    const caught =
      Math.abs(s.x - g.x) < 3.25 && (g.y ? s.y > 2.5 && s.y < 8 : s.y < 3.1);
    if (caught) {
      const perfect =
        Math.abs(s.x - g.x) < 1.25 &&
        (g.y ? Math.abs(s.y - 5.2) < 1.8 : s.y < 0.5);
      s.chain++;
      s.bestChain = Math.max(s.bestChain, s.chain);
      s.gates++;
      s.energy = Math.min(100, s.energy + 30);
      const points = (perfect ? 250 : 150) * Math.min(s.chain, 4);
      s.score += points;
      if (perfect) s.perfect++;
      event(s, "gate", perfect ? "PERFECT LINE" : "RECHARGED", points);
      if (g.y && perfect) {
        s.rollTime = 0.9;
        s.roll = 0;
      }
    } else {
      s.chain = 0;
      event(s, "miss", "GATE MISSED");
    }
  }
  if (s.rollTime > 0) {
    s.rollTime = Math.max(0, s.rollTime - dt);
    s.roll = (1 - s.rollTime / 0.9) * Math.PI * 2;
    if (!s.rollTime) s.roll = 0;
  }
  const sector = Math.min(2, Math.floor(s.d / (LENGTH / 3)));
  if (sector !== s.sector) {
    s.sector = sector;
    event(s, "sector", SECTORS[sector]);
  }
  if (s.d >= LENGTH) finish(s, false, "CROSSING COMPLETE");
}
export function nextWarning(s) {
  const gap = s.course.gaps.find((g) => s.d > g.start - 175 && s.d < g.end);
  if (gap)
    return {
      kind: "gap",
      title: s.d < gap.start ? "BRIDGE OUT" : "STAY IN THE AIR",
      detail:
        s.d < gap.start
          ? Math.ceil(gap.start - s.d) + " M · HOLD FLY"
          : "HOLD FLY UNTIL THE ROAD RETURNS",
    };
  const hazards = s.course.obstacles
    .map((o) => ({ ...o, ...hazardPose(o, s.time) }))
    .filter((o) => o.d > s.d - 4 && o.d - s.d < 160)
    .sort((a, b) => a.d - b.d);
  const o = hazards[0];
  if (o)
    return {
      kind: o.kind,
      title:
        o.kind === "gantry"
          ? "STAY LOW"
          : o.kind === "sweeper"
            ? "MOVING BARRIER"
            : o.kind === "traffic"
              ? "TRAFFIC AHEAD"
              : o.x < -2
                ? "KEEP RIGHT"
                : o.x > 2
                  ? "KEEP LEFT"
                  : "SPLIT AROUND",
      detail:
        (o.kind === "gantry"
          ? "RELEASE FLY · "
          : o.kind === "sweeper"
            ? "STEER OR FLY · "
            : o.kind === "traffic"
              ? "PASS OR FLY · "
              : "BARRIER · ") +
        Math.max(0, Math.ceil(o.d - s.d)) +
        " M",
    };
  const pad = s.course.pads.find((p) => p.d > s.d && p.d < s.d + 100);
  if (pad)
    return {
      kind: "pad",
      title: "SLINGSHOT STRIP",
      detail: "DRIVE OVER THE BLUE CHEVRONS",
    };
  return null;
}
export function rankRun(s) {
  if (s.failed) return "TRY AGAIN";
  return s.time <= s.course.gold && s.gates >= s.course.goldGates
    ? "GOLD"
    : s.time <= s.course.silver && s.gates >= 8
      ? "SILVER"
      : "BRONZE";
}

export function formatTime(seconds) {
  const tenths = Math.floor(Math.max(0, seconds) * 10 + 1e-7);
  return `${String(Math.floor(tenths / 600)).padStart(2, "0")}:${((tenths % 600) / 10).toFixed(1).padStart(4, "0")}`;
}
