import { hazardPose } from "./courses.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const RIVAL_DRIVERS = [
  { id: "nova", name: "NOVA", color: 0x66d9e8, lane: -3.6, pace: 1 },
  { id: "echo", name: "ECHO", color: 0xe7dfbc, lane: 0, pace: 0.42 },
  { id: "volt", name: "VOLT", color: 0xa991f7, lane: 3.6, pace: 0.015 },
];

/** Rivals use the player's integrator, energy, grip, ramps and obstacle contacts.
 * Their choices are deterministic, with no teleporting or rubber-band speed. */
export function createRivals(course, factory) {
  return RIVAL_DRIVERS.map((driver, i) => ({
    ...factory(course, { rival: true }),
    ...driver,
    d: [34, 18, 9][i],
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
  let x = gate ? clamp(gate.x + r.lane * 0.7, -7.5, 7.5) : r.lane,
    fly = !!gap,
    urgent = false;
  let next = null,
    nearest = Infinity;
  const hazards = [];
  for (const obstacle of c.obstacles) {
    // Moving barriers are anticipated at the time the car reaches them.
    const now = hazardPose(obstacle, r.time),
      arrival = clamp((now.d - r.d) / Math.max(28, r.speed), 0, 2),
      pose = hazardPose(obstacle, r.time + arrival),
      distance = pose.d - r.d;
    if (distance > -11 && distance < 125)
      hazards.push({ ...obstacle, ...pose });
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
  if (!gap && !fly && hazards.filter((h) => !h.bottom).length > 1) {
    const lanes = [-6.3, -3, 0, 3, 6.3].filter((lane) =>
      hazards.every((h) => h.bottom || Math.abs(lane - h.x) > h.w / 2 + 1.35),
    );
    if (lanes.length)
      x = lanes.sort((a, b) => Math.abs(a - x) - Math.abs(b - x))[0];
    else if (!low) fly = true;
  }
  if (low) fly = false;
  const branch = c.branches?.find((b) => r.d > b.start - 55 && r.d < b.end);
  if (branch && !urgent && !gap && !ramp && r.index === 0) x = branch.entryX;
  // Two lanes fit a grip ramp; the centre driver follows at a safe distance.
  if (ramp && (!gate || gate.d >= ramp.d - ramp.length)) {
    x =
      ramp.x +
      clamp(
        r.lane * 0.56,
        -(ramp.width || 7) / 2 + 1.2,
        (ramp.width || 7) / 2 - 1.2,
      );
    // A tall ramp can catch the car above its lower deck after a short
    // obstacle hop. Do not drive into a moving sweeper at its ground-level foot.
    fly = !!(fly && ramp.height >= 9 && next && next.d < ramp.d - 45 && !low);
  }
  if (r.flight) {
    x = (gate?.x || 0) + r.lane * 0.7;
    fly = false;
  }
  // Keep the launch grid readable before converging on the first gate.
  if (r.d < 100 && !urgent && !ramp && !gap) x = r.lane;
  r.overtaking = false;
  let blocked = false,
    paceLimit = Infinity;
  for (const other of [race, ...race.rivals]) {
    if (other === r || other.failed || other.finished) continue;
    const ahead = other.d - r.d;
    if (ahead < -6 || ahead > 60 || Math.abs(other.y - r.y) > 2) continue;
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
    if (
      !urgent &&
      !ramp &&
      !r.flight &&
      !gap &&
      ahead > 17 &&
      r.speed - other.speed < 4
    ) {
      // Use the same physical slipstream as the player before pulling out.
      x = other.x;
    } else if (!urgent && !ramp && !r.flight && !gap) {
      const left = other.x - 3.2,
        right = other.x + 3.2;
      x =
        Math.abs(left) < 7.3 && (r.lane <= other.x || right > 7.3)
          ? left
          : right;
      x = clamp(x, -7.3, 7.3);
      r.overtaking = true;
    }
    // A moving car only needs emergency braking when its predicted gap is
    // closing. Brake too early here and every opponent becomes a single queue.
    const closing = r.speed - other.speed;
    if (
      Math.abs(other.x - r.x) < 2.6 &&
      (ahead < 7 || (closing > 0 && ahead < 7 + closing * 0.7))
    ) {
      blocked = true;
      paceLimit = Math.min(paceLimit, Math.max(27, other.speed - 1));
    }
  }
  if (r.contactYield > 0 && !ramp && !r.flight && !gap && !urgent) {
    x = clamp(r.x + r.contactAway * 2.5, -7.3, 7.3);
    r.overtaking = true;
  }
  // A readable hesitation on clear road gives the field human rhythm without
  // manufacturing crashes or changing pace in response to the player's rank.
  const mistake =
    r.index !== 0 &&
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
      (r.time < (r.index === 2 ? 1.2 : 3.2) || phase % 9 < 9 * r.pace),
    brake: false,
    paceLimit,
  };
}

export function updateDraft(s, dt, field = s.rivals) {
  let strength = 0,
    target = null;
  if (!s.airborne && s.attachedRamp < 0 && s.speed > 35)
    for (const r of field) {
      if (r === s) continue;
      const gap = r.d - s.d;
      if (
        r.failed ||
        r.finished ||
        r.airborne ||
        gap < 7 ||
        gap > 60 ||
        Math.abs(s.x - r.x) > 2.5
      )
        continue;
      const value =
        Math.min(1, (gap - 7) / 6, (60 - gap) / 22) *
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

// A modest safety envelope around the visible two-metre-wide, 4.7m-long cars.
// No restitution, vertical impulse, steering lock or assisted-stunt cancellation.
export const RIVAL_CONTACT = Object.freeze({
  width: 2.18,
  length: 4.8,
  height: 1.3,
  rearDamageSpeed: 11,
  sideDamageSpeed: 8,
  damageCooldown: 1.25,
});
const worldHeight = (car, previous = false) => {
  const d = previous ? car.contactPrevD : car.d;
  const [a, b, c, e] = car.course.elevation;
  return (
    (previous ? car.contactPrevY : car.y) +
    Math.sin(d / b) * a +
    Math.sin(d / e) * c
  );
};
function lateralBounds(car) {
  const ramp =
    car.attachedRamp >= 0 ? car.course.ramps[car.attachedRamp] : null;
  return ramp
    ? [
        ramp.x - (ramp.width || 7) / 2 + 1.12,
        ramp.x + (ramp.width || 7) / 2 - 1.12,
      ]
    : [-8.85, 8.85];
}
function sweepContact(a, b) {
  const extents = [
    RIVAL_CONTACT.width,
    RIVAL_CONTACT.length,
    RIVAL_CONTACT.height,
  ];
  const end = [a.x - b.x, a.d - b.d, worldHeight(a) - worldHeight(b)];
  const start = [
    a.contactPrevX - b.contactPrevX,
    a.contactPrevD - b.contactPrevD,
    worldHeight(a, true) - worldHeight(b, true),
  ];
  let entry = 0,
    exit = 1,
    axis = -1,
    normal = 0;
  for (let i = 0; i < 3; i++) {
    const velocity = end[i] - start[i],
      extent = extents[i];
    if (Math.abs(velocity) < 1e-9) {
      if (Math.abs(start[i]) >= extent) return null;
      continue;
    }
    const t1 = (-extent - start[i]) / velocity,
      t2 = (extent - start[i]) / velocity;
    const lo = Math.min(t1, t2),
      hi = Math.max(t1, t2);
    if (lo > entry) {
      entry = lo;
      axis = i;
      normal = velocity > 0 ? -1 : 1;
    }
    exit = Math.min(exit, hi);
    if (entry > exit) return null;
  }
  if (exit < 0 || entry > 1) return null;
  if (axis === 2) {
    // Crossing vertically during flight never applies a vertical shove. If the
    // envelopes actually meet, separate the lanes without altering trajectory.
    if (
      Math.abs(end[0]) >= extents[0] ||
      Math.abs(end[1]) >= extents[1] ||
      Math.abs(end[2]) >= extents[2]
    )
      return null;
    axis = 0;
    normal = Math.sign(end[0]) || Math.sign(start[0]) || 1;
  }
  if (axis < 0) {
    if (extents.some((size, i) => Math.abs(end[i]) >= size)) return null;
    axis =
      extents[0] - Math.abs(end[0]) < extents[1] - Math.abs(end[1]) ? 0 : 1;
    normal = Math.sign(end[axis]) || Math.sign(start[axis]) || 1;
  }
  // Never push a car forward/backward along an assisted flight, or off a ramp.
  // There is room for a passing pair on every authored deck.
  if (a.flight || b.flight || a.attachedRamp >= 0 || b.attachedRamp >= 0) {
    axis = 0;
    normal = Math.sign(end[0]) || Math.sign(start[0]) || (a.isRival ? -1 : 1);
  }
  return { axis, normal, depth: extents[axis] - end[axis] * normal + 0.003 };
}

/** Only a deliberate player closing speed can cost player HP. Opponents
 * cannot remove health by braking late or merging into a steady player. */
function damageContact(race, a, b, axis, normal, closing) {
  const player = !a.isRival ? a : !b.isRival ? b : null;
  if (!player || player.invulnerable > 0) return false;
  const opponent = player === a ? b : a;
  // Automatic ramps own the landing trajectory. Preserve that safe contract.
  if (a.flight || b.flight || a.attachedRamp >= 0 || b.attachedRamp >= 0)
    return false;
  const side = player === a ? normal : -normal;
  const impactSpeed = Math.max(0, -closing);
  const threshold =
    axis === 0 ? RIVAL_CONTACT.sideDamageSpeed : RIVAL_CONTACT.rearDamageSpeed;
  const responsible =
    axis === 0
      ? player.vx * side < -5.5
      : side < 0 && player.speed > opponent.speed;
  if (!responsible || impactSpeed < threshold) return false;
  const kind = axis === 0 ? "side" : "rear";
  const severity = clamp((impactSpeed - threshold) / 32 + 0.32, 0.32, 1);
  for (const [car, other, direction] of [
    [player, opponent, side],
    [opponent, player, -side],
  ]) {
    if (car.invulnerable > 0) continue;
    car.hull = Math.max(0, car.hull - 1);
    car.invulnerable = RIVAL_CONTACT.damageCooldown;
    car.crashAge = 0;
    car.crashKind = "impact";
    car.crashDirection =
      axis === 0 ? direction : Math.sign(car.x - other.x) || 1;
    car.crashSeverity = severity;
    car.crashOtherId = other.id || "player";
    car.chain = 0;
    car.score = Math.max(0, car.score - 100);
    const details = {
      source: "rival",
      rivalId: opponent.id,
      kind,
      severity,
      closingSpeed: impactSpeed,
      damage: 1,
      hull: car.hull,
    };
    race.events.push(
      car.isRival
        ? {
            type: "rival-hit",
            text: opponent.name + " · DAMAGED",
            points: 0,
            ...details,
            d: car.d,
            x: car.x,
            y: car.y,
          }
        : {
            type: "hit",
            text: "CRASH WITH " + opponent.name + " · −1 HP",
            points: 0,
            ...details,
          },
    );
    if (race.events.length > 8) race.events.shift();
  }
  return true;
}

/** Resolve the four-car field after the same 120Hz step, including swept
 * crossings. AI gives the player room; a rear hit cannot accelerate the player.
 * Repeated bounded passes also settle three-car contacts at a road edge. */
export function resolveRivalContacts(race) {
  const field = [race, ...race.rivals];
  for (let pass = 0; pass < 7; pass++) {
    let settled = true;
    for (let i = 0; i < field.length; i++)
      for (let j = i + 1; j < field.length; j++) {
        const a = field[i],
          b = field[j];
        if (a.failed || b.failed || a.finished || b.finished) continue;
        const beforeD = a.contactPrevD - b.contactPrevD,
          afterD = a.d - b.d;
        if (
          Math.min(beforeD, afterD) > RIVAL_CONTACT.length ||
          Math.max(beforeD, afterD) < -RIVAL_CONTACT.length
        )
          continue;
        const beforeX = a.contactPrevX - b.contactPrevX,
          afterX = a.x - b.x;
        if (
          Math.min(beforeX, afterX) > RIVAL_CONTACT.width ||
          Math.max(beforeX, afterX) < -RIVAL_CONTACT.width
        )
          continue;
        const contact = sweepContact(a, b);
        if (!contact || contact.depth < 0.00001) continue;
        settled = false;
        const { axis, normal } = contact,
          key = axis === 0 ? "x" : "d",
          velocity = axis === 0 ? "vx" : "speed";
        let aw = a.isRival ? 0.5 : 0.2,
          bw = b.isRival ? 0.5 : 0.2;
        if (
          !a.isRival &&
          ((axis === 1 && normal > 0) || (axis === 0 && a.vx * normal >= -0.01))
        )
          aw = 0;
        if (
          !b.isRival &&
          ((axis === 1 && normal < 0) ||
            (axis === 0 && b.vx * -normal >= -0.01))
        )
          bw = 0;
        const total = aw + bw;
        aw /= total;
        bw /= total;
        const beforeA = a[key],
          beforeB = b[key];
        const shift = (car, amount) => {
          const before = car[key];
          if (axis === 0) {
            const [low, high] = lateralBounds(car);
            car.x = clamp(car.x + amount, low, high);
          } else car.d = Math.max(0, car.d + amount);
          return car[key] - before;
        };
        const movedA = shift(a, normal * contact.depth * aw),
          movedB = shift(b, -normal * contact.depth * bw);
        const remaining = Math.max(
          0,
          contact.depth - (movedA - movedB) * normal,
        );
        if (remaining > 0.0001) {
          const move = shift(b, -normal * remaining);
          const rest = remaining + move * normal;
          if (rest > 0.0001) shift(a, normal * rest);
        }
        const closing = (a[velocity] - b[velocity]) * normal;
        const damaged = damageContact(race, a, b, axis, normal, closing);
        if (closing < 0) {
          a[velocity] -= closing * normal * aw;
          b[velocity] += closing * normal * bw;
        }
        // Mark contact only for a physical correction, not a repeated solved pair.
        if (Math.abs(a[key] - beforeA) + Math.abs(b[key] - beforeB) < 1e-6)
          continue;
        for (const [car, other, side] of [
          [a, b, normal],
          [b, a, -normal],
        ]) {
          car.contactAge = 0;
          car.contactSide = axis === 0 ? side : 0;
          car.contactKind = axis === 0 ? "side" : "rear";
          car.contactStrength = clamp(-closing / 24, 0.08, 1);
          if (car.isRival && !other.isRival) {
            car.contactYield = 0.75;
            car.contactAway =
              Math.sign(car.x - other.x) || Math.sign(car.lane) || 1;
          }
          if (car.contactCooldown > 0) continue;
          car.contactCooldown = 0.8;
          car.contacts++;
          if (!car.isRival && !damaged) {
            car.events.push({
              type: "contact",
              text:
                axis === 0
                  ? "SIDE CONTACT · KEEP STEERING"
                  : "BUMPER CONTACT · STEER TO PASS",
              points: 0,
            });
            if (car.events.length > 8) car.events.shift();
          }
        }
      }
    if (settled) break;
  }
}
