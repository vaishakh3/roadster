/** Breakwater's deterministic arcade simulation. Metres, seconds; X is across the road.
 * Steering and lift are independent of thrust, including during takeoff/landing.
 * The assisted route heading keeps the controls simple; this is not a vehicle simulator. */
export const LENGTH = 3600;
export const ROAD_HALF = 10;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const SECTORS = ["THE CAUSEWAY", "OPEN WATER", "THE LAST LIGHT"];
export const GAPS = [
  { start: 660, end: 725 },
  { start: 1430, end: 1525 },
  { start: 2190, end: 2300 },
  { start: 2960, end: 3090 },
];
export const OBSTACLES = [
  { d: 310, x: -4.4, w: 5.5 },
  { d: 490, x: 4.5, w: 5.5 },
  { d: 970, x: 0, w: 6 },
  { d: 1160, x: -4.5, w: 6 },
  { d: 1740, x: 4.5, w: 6.5 },
  { d: 1950, x: -4, w: 7 },
  { d: 2500, x: 0, w: 7 },
  { d: 2700, x: -4.5, w: 6 },
  { d: 3280, x: 4.5, w: 6 },
  { d: 3430, x: -4.5, w: 6 },
];
export const GATES = [
  { d: 180, x: 0, y: 0 },
  { d: 405, x: 3.5, y: 0 },
  { d: 695, x: 0, y: 4.3 },
  { d: 855, x: -3.5, y: 0 },
  { d: 1070, x: 3.8, y: 0 },
  { d: 1300, x: 0, y: 0 },
  { d: 1475, x: 0, y: 4.3 },
  { d: 1640, x: -3.8, y: 0 },
  { d: 1840, x: -3.8, y: 0 },
  { d: 2080, x: 3.8, y: 0 },
  { d: 2240, x: 0, y: 4.3 },
  { d: 2400, x: 3.8, y: 0 },
  { d: 2600, x: -3.8, y: 0 },
  { d: 2830, x: 3.5, y: 0 },
  { d: 3020, x: 0, y: 4.3 },
  { d: 3170, x: -3.8, y: 0 },
  { d: 3360, x: -3.8, y: 0 },
  { d: 3540, x: 0, y: 0 },
];
export const inGap = (d) => GAPS.some((g) => d >= g.start && d <= g.end);
export function roadX(d) {
  return Math.sin(d / 310) * 31 + Math.sin(d / 710) * 48;
}
export function roadSlope(d) {
  return (Math.cos(d / 310) * 31) / 310 + (Math.cos(d / 710) * 48) / 710;
}
export function createRun() {
  return {
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
    s.score += Math.round(Math.max(0, 90 - s.time) * 60 + s.hull * 400);
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
  const targetSpeed = brake ? 27 : s.boosting ? 76 : 48 + s.sector * 2;
  s.speed +=
    (targetSpeed - s.speed) *
    (1 - Math.exp(-dt * (brake ? 3 : s.boosting ? 1.1 : 0.75)));
  const prevD = s.d;
  s.d += s.speed * dt;
  s.topSpeed = Math.max(s.topSpeed, s.speed);
  const gap = inGap(s.d);
  if (s.lifting) {
    // Damped lift, then a gentle automatic ceiling. Releasing gives a predictable glide.
    const liftAccel = clamp((5.8 - s.y) * 13 - s.vy * 5, -18, 24);
    s.vy += liftAccel * dt;
  } else if (s.y > 0 || gap) s.vy -= 9.81 * dt;
  s.y += s.vy * dt;
  if (!gap && s.y <= 0) {
    if (s.airborne && s.vy < -3) event(s, "land", "TOUCHDOWN");
    s.y = 0;
    s.vy = 0;
  }
  s.airborne = s.y > 0.25 || gap;
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
  for (let i = 0; i < OBSTACLES.length; i++) {
    const o = OBSTACLES[i],
      key = "o" + i;
    // Swept longitudinal contact prevents skipping obstacles during fast/slow frames.
    if (s.processed.has(key) || s.d + 2.35 < o.d - 1.5) continue;
    if (prevD - 2.35 > o.d + 1.5) {
      s.processed.add(key);
      continue;
    }
    if (Math.abs(s.x - o.x) < o.w / 2 + 0.96 && s.y < 2.1 && !s.invulnerable) {
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
    } else if (s.d > o.d + 4) {
      s.processed.add(key);
      if (Math.abs(s.x - o.x) < o.w / 2 + 2.8 && s.y < 2.5) {
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
  const sector = Math.min(2, Math.floor(s.d / 1200));
  if (sector !== s.sector) {
    s.sector = sector;
    event(s, "sector", SECTORS[sector]);
  }
  if (s.d >= LENGTH) finish(s, false, "CROSSING COMPLETE");
}
export function nextWarning(s) {
  const gap = GAPS.find((g) => s.d > g.start - 175 && s.d < g.end);
  if (gap)
    return {
      kind: "gap",
      title: s.d < gap.start ? "BRIDGE OUT" : "STAY IN THE AIR",
      detail:
        s.d < gap.start
          ? Math.ceil(gap.start - s.d) + " M · HOLD FLY"
          : "HOLD FLY TO CLEAR THE WATER",
    };
  const hazard = OBSTACLES.find((o) => o.d > s.d && o.d - s.d < 125);
  if (hazard)
    return {
      kind: "hazard",
      title:
        hazard.x < -2
          ? "KEEP RIGHT"
          : hazard.x > 2
            ? "KEEP LEFT"
            : "SPLIT AROUND",
      detail: "BARRIER · " + Math.ceil(hazard.d - s.d) + " M",
    };
  return null;
}
export function rankRun(s) {
  if (s.failed) return "TRY AGAIN";
  return s.time <= 65 && s.gates >= 12
    ? "GOLD"
    : s.time <= 76 && s.gates >= 8
      ? "SILVER"
      : "BRONZE";
}

export function formatTime(seconds) {
  const tenths = Math.floor(Math.max(0, seconds) * 10 + 1e-7);
  return `${String(Math.floor(tenths / 600)).padStart(2, "0")}:${((tenths % 600) / 10).toFixed(1).padStart(4, "0")}`;
}
