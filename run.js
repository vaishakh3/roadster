/** Breakwater's deterministic arcade simulation. Metres, seconds; X is across the road.
 * Steering and lift are independent of thrust, including during takeoff/landing.
 * The assisted route heading keeps the controls simple; this is not a vehicle simulator. */
import { COURSES, TRIMS, getCourse, hazardPose } from "./courses.js";
import { rampContact, launchFlight, flightPose } from "./stunts.js";
import {
  createRivals,
  rivalInput,
  updateDraft,
  updateRacePosition,
  resolveRivalContacts,
} from "./rivals.js";
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
export function createRun(course = COURSES[0], options = {}) {
  const resolved = typeof course === "string" ? getCourse(course) : course;
  const state = {
    course: resolved,
    isRival: !!options.rival,
    trim: options.trim || TRIMS[0],
    rivals: [],
    position: options.rival ? 1 : 4,
    finishPosition: 0,
    finishTime: 0,
    eventSeed: 0,
    drafting: 0,
    draftTarget: null,
    draftActive: false,
    drift: 0,
    slipAngle: 0,
    bodyRoll: 0,
    steering: 0,
    lateralAcceleration: 0,
    branch: null,
    branchProgress: 0,
    branchTime: 0,
    branchesTaken: 0,
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
    flyovers: new Set(),
    flyoverCount: 0,
    events: [],
    roll: 0,
    rollTime: 0,
    rollAcceleration: 0,
    streak: 0,
    bestChain: 0,
    gapRescue: false,
    near: 0,
    padTime: 0,
    launches: 0,
    rampPitch: 0,
    flightPitch: 0,
    liftAcceleration: 0,
    attachedRamp: -1,
    flight: null,
    stuntAngle: 0,
    stuntKind: "",
    stunts: 0,
    crashAge: 10,
    crashDirection: 1,
    crashKind: "impact",
    crashSeverity: 0,
    crashOtherId: null,
    landingAge: 10,
    exitDistance: 0,
    passCooldown: 0,
    contactAge: 10,
    contactSide: 0,
    contactKind: "",
    contactStrength: 0,
    contactCooldown: 0,
    contactYield: 0,
    contactAway: 0,
    contacts: 0,
    contactPrevD: 0,
    contactPrevX: 0,
    contactPrevY: 0,
  };
  if (!options.rival) state.rivals = createRivals(resolved, createRun);
  return state;
}
function event(s, type, text, points = 0) {
  s.events.push({ type, text, points });
  if (s.events.length > 8) s.events.shift();
}
function finish(s, failed, reason) {
  s.failed = failed;
  s.finished = !failed;
  s.reason = reason;
  if (!failed) {
    s.finishTime =
      s.time - Math.max(0, s.d - s.course.length) / Math.max(1, s.speed);
    if (!s.isRival) updateRacePosition(s);
  }
  if (failed) {
    s.crashAge = 0;
    s.crashKind = reason === "THE BRIDGE WAS OUT" ? "fall" : "impact";
  }
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
  s.contactPrevD = s.d;
  s.contactPrevX = s.x;
  s.contactPrevY = s.y;
  s.contactAge += dt;
  s.contactCooldown = Math.max(0, s.contactCooldown - dt);
  s.contactYield = Math.max(0, s.contactYield - dt);
  s.time += dt;
  s.crashAge += dt;
  s.landingAge += dt;
  s.passCooldown = Math.max(0, s.passCooldown - dt);
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
  // Speed-sensitive steering preserves the same independent input while
  // adding a little high-speed weight. Neutral input actively holds the lane.
  const onRoad = s.y < 0.3 && s.attachedRamp < 0 && !s.flight;
  const [ca, cb, cc, ce] = s.course.curve;
  const curve =
    ((-Math.sin(s.d / cb) * ca) / (cb * cb) -
      (Math.sin(s.d / ce) * cc) / (ce * ce)) /
    Math.pow(1 + roadSlope(s.d, s.course) ** 2, 1.5);
  const fast = clamp((s.speed - 55) / 30, 0, 1);
  const cornerLoad = clamp(curve * s.speed * s.speed, -7, 7);
  const targetVx =
    steer * (s.y > 0.5 ? 12.5 : 11.5 - fast * 0.65) -
    (onRoad ? cornerLoad * Math.abs(steer) * fast * 0.055 : 0);
  const oldVx = s.vx;
  s.vx += (targetVx - s.vx) * (1 - Math.exp(-dt * 9));
  s.lateralAcceleration = (s.vx - oldVx) / dt + (onRoad ? cornerLoad : 0);
  const driftTarget =
    onRoad && Math.abs(steer) > 0.15
      ? clamp(
          (Math.abs(cornerLoad) + Math.abs(s.vx) * 0.4 - 3.5) / 9,
          0,
          0.65,
        ) * fast
      : 0;
  s.drift += (driftTarget - s.drift) * (1 - Math.exp(-dt * 5));
  s.slipAngle +=
    (Math.atan2(s.vx, Math.max(27, s.speed)) * (0.22 + s.drift * 0.45) -
      s.slipAngle) *
    (1 - Math.exp(-dt * 8));
  s.bodyRoll +=
    ((onRoad ? clamp(-s.lateralAcceleration * 0.0018, -0.055, 0.055) : 0) -
      s.bodyRoll) *
    (1 - Math.exp(-dt * 9));
  s.steering +=
    (Math.atan2(steer * 11.5, Math.max(30, s.speed)) * 0.68 - s.steering) *
    (1 - Math.exp(-dt * 12));
  if (!s.isRival) updateDraft(s, dt);
  if (s.drafting > 0.6 && !s.draftActive) {
    s.draftActive = true;
    event(s, "draft", "SLIPSTREAM · RESERVE CHARGING");
  }
  if (s.drafting < 0.15) s.draftActive = false;
  const prevX = s.x,
    prevY = s.y,
    prevRamp = s.attachedRamp;
  s.x += s.vx * dt;
  if (Math.abs(s.x) > ROAD_HALF - 1.15) {
    s.x = Math.sign(s.x) * (ROAD_HALF - 1.15);
    s.vx *= -0.18;
    s.speed = Math.max(28, s.speed - dt * 15);
  }
  const branch = s.course.branches?.find((b) => s.d >= b.start && s.d < b.end);
  const onBranch = branch && onRoad && Math.abs(s.x - branch.entryX) < 2.2;
  if (s.branch?.id !== (onBranch ? branch.id : undefined)) s.branchTime = 0;
  s.branch = onBranch ? branch : null;
  s.branchProgress = branch
    ? clamp((s.d - branch.start) / (branch.end - branch.start), 0, 1)
    : 0;
  if (onBranch) {
    s.branchTime += dt;
    const key = "branch:" + branch.id;
    if (s.branchTime > 1.8 && !s.processed.has(key)) {
      s.processed.add(key);
      s.branchesTaken++;
      s.score += 350;
      event(s, "branch", branch.name.toUpperCase() + " · FAST LINE", 350);
    }
  }
  const targetSpeed = brake
    ? 27
    : s.padTime > 0
      ? 88
      : s.boosting
        ? s.trim.boostSpeed
        : 48 + s.sector * 2;
  const paceLimit =
    s.isRival && Number.isFinite(raw.paceLimit)
      ? clamp(raw.paceLimit, 27, 88)
      : Infinity;
  s.speed +=
    (Math.min(
      paceLimit,
      targetSpeed +
        (brake ? 0 : s.drafting * 3.5 + (onBranch ? branch.speedBonus : 0)),
    ) -
      s.speed) *
    (1 -
      Math.exp(
        -dt * (brake || paceLimit < s.speed ? 3 : s.boosting ? 1.1 : 0.75),
      ));
  if (onRoad && !brake) s.speed -= s.drift * 0.8 * dt;
  const prevD = s.d;
  s.d += s.speed * dt;
  s.topSpeed = Math.max(s.topSpeed, s.speed);
  const gap = inGap(s.d, s.course);
  // Capture the front axle on entry; never let a lateral entry pass through
  // the deck. A high side impact is pushed outside instead of teleported up.
  let rampIndex = -1;
  for (const [i, r] of s.course.ramps.entries()) {
    if (s.d < r.d - (r.length || 10) - 1.48 || s.d > r.d) continue;
    const half = (r.width || 7) / 2,
      margin = 1.12;
    const surface = rampContact(r, s.d);
    if (prevRamp === i && !s.flight) {
      s.x = clamp(s.x, r.x - half + margin, r.x + half - margin);
      if (Math.abs(s.x - r.x) >= half - margin - 0.001) s.vx *= 0.35;
      rampIndex = i;
      break;
    }
    if (Math.abs(s.x - r.x) >= half + margin) continue;
    const above = prevY >= surface.height - 0.6;
    const canCapture = !s.flight && above && s.y <= surface.height + 0.6;
    if (canCapture) {
      s.x = clamp(s.x, r.x - half + margin, r.x + half - margin);
      rampIndex = i;
      break;
    }
    if (!above && surface.height > 0.65) {
      const side = prevX < r.x ? -1 : prevX > r.x ? 1 : s.vx >= 0 ? -1 : 1;
      s.x = r.x + side * (half + margin + 0.03);
      s.x = clamp(s.x, -ROAD_HALF + 1.15, ROAD_HALF - 1.15);
      s.vx = side * Math.min(2, Math.abs(s.vx));
    }
  }
  const ramp = rampIndex >= 0 ? s.course.ramps[rampIndex] : null;
  const surface = ramp ? rampContact(ramp, s.d) : { height: 0, pitch: 0 };
  const attached = !!ramp && !s.flight;
  s.attachedRamp = attached ? rampIndex : -1;
  s.rampPitch = attached ? surface.pitch : 0;
  s.liftAcceleration = 0;
  if (attached) {
    s.y = surface.height;
    s.vy = 0;
    s.lifting = false;
    s.airborne = false;
  } else if (s.flight) {
    const f = s.flight,
      p = flightPose(f, dt, s.d, s.speed);
    s.y = p.y;
    s.vy = p.vy;
    s.stuntAngle = p.angle;
    s.flightPitch = p.pitch;
    s.liftAcceleration = f.acceleration;
    s.stuntKind = f.kind;
    s.lifting = false;
    if (p.done) {
      s.y = 0;
      s.vy = 0;
      s.flight = null;
      s.stuntAngle = 0;
      s.flightPitch = 0;
      s.landingAge = 0;
      if (f.clean) {
        s.stunts++;
        s.score += 800;
        event(
          s,
          "stunt",
          f.kind === "roll" ? "BARREL ROLL · LANDED" : "BACKFLIP · LANDED",
          800,
        );
      }
      event(s, "land", "TOUCHDOWN");
    }
  } else {
    if (s.lifting) {
      s.liftAcceleration = clamp(
        (5.8 - s.y) * 13 - s.vy * 5,
        -9.81,
        s.trim.liftAccel,
      );
      s.vy += s.liftAcceleration * dt;
    } else if (s.y > 0 || gap) s.vy -= 9.81 * dt;
    s.y += s.vy * dt;
  }
  if (!attached && !s.flight)
    for (const [i, r] of s.course.ramps.entries()) {
      if (
        s.d < r.d - (r.length || 10) ||
        s.d > r.d ||
        Math.abs(s.x - r.x) > (r.width || 7) / 2 - 1.12
      )
        continue;
      const support = rampContact(r, s.d);
      if (
        prevY >= rampContact(r, prevD).height - 0.6 &&
        s.y <= support.height
      ) {
        s.y = support.height;
        s.vy = 0;
        s.attachedRamp = i;
        s.rampPitch = support.pitch;
        s.lifting = false;
      }
    }
  if (!attached && !s.flight && !gap && s.y <= 0) {
    if (s.airborne && s.vy < -3) {
      event(s, "land", "TOUCHDOWN");
      s.landingAge = 0;
    }
    s.y = 0;
    s.vy = 0;
    s.stuntAngle = 0;
  }
  // The tunnel roof undersurface is 11m above the shared road datum. Normal
  // assisted lift stays below it; catch any upward transient without clipping.
  if (
    !s.flight &&
    !attached &&
    prevY < 9.55 &&
    s.y > 9.55 &&
    s.course.tunnels?.some((t) => s.d >= t.start - 6 && s.d <= t.end + 6)
  ) {
    s.y = 9.55;
    s.vy = Math.min(0, s.vy);
    s.liftAcceleration = 0;
    event(s, "approach", "TUNNEL CEILING · KEEP LOW");
  }
  s.airborne = s.attachedRamp < 0 && (s.y > 0.25 || gap);
  if (s.airborne) s.airtime += dt;
  // Flight stays available at the final bridge even after an imperfect run.
  // Amber approach strips are also reserve stations; the warning announces the refill.
  for (let i = 0; i < GAPS.length; i++) {
    const g = GAPS[i];
    if (prevD < g.start - 145 && s.d >= g.start - 145) {
      s.energy = Math.max(s.energy, 65);
      event(s, "approach", "GRIP RAMP AHEAD · AIM FOR THE MINT STRIP");
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
  const drain =
    (s.boosting ? s.trim.boostDrain : 0) + (s.lifting ? s.trim.liftDrain : 0);
  s.energy = clamp(
    s.energy +
      ((drain ? -drain : s.y < 0.3 ? s.trim.regen : 4) + s.drafting * 5) * dt,
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
      Math.abs(s.x - r.x) < (r.width || 7) / 2 &&
      (prevRamp === i || Math.abs(s.y - rampContact(r, r.d).height) < 0.6) &&
      !s.flight &&
      !s.processed.has("r" + i)
    ) {
      s.processed.add("r" + i);
      s.flight = launchFlight(r, s.speed);
      s.y = s.flight.height;
      s.flightPitch = s.flight.startPitch;
      s.vy = s.flight.vy;
      s.attachedRamp = -1;
      s.rampPitch = 0;
      s.airborne = true;
      s.launches++;
      s.energy = Math.max(s.energy, 65);
      s.stuntKind = s.flight.kind;
      s.stuntAngle = 0;
      event(
        s,
        "launch",
        r.height >= 14
          ? `SKY RAMP · AUTO ${r.stunt === "roll" ? "ROLL" : "FLIP"}`
          : "LAUNCH · AUTO STUNT",
      );
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
      s.crashAge = 0;
      s.crashDirection = s.x >= pose.x ? 1 : -1;
      s.crashKind = "impact";
      s.crashSeverity = 0.75;
      s.crashOtherId = null;
      if (s.flight) s.flight.clean = false;
      s.chain = 0;
      s.speed *= 0.62;
      s.invulnerable = 1.25;
      s.score = Math.max(0, s.score - 100);
      event(s, "hit", s.hull ? "IMPACT · KEEP GOING" : "IMPACT · RUN ENDED");
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
      Math.abs(s.x - g.x) < 3.25 && (g.y ? Math.abs(s.y - g.y) < 4 : s.y < 3.1);
    if (caught) {
      const perfect =
        Math.abs(s.x - g.x) < 1.25 &&
        (g.y ? Math.abs(s.y - (g.y + 0.4)) < 2.1 : s.y < 0.5);
      s.chain++;
      s.bestChain = Math.max(s.bestChain, s.chain);
      s.gates++;
      s.energy = Math.min(100, s.energy + 30);
      const points = (perfect ? 250 : 150) * Math.min(s.chain, 4);
      s.score += points;
      if (perfect) s.perfect++;
      event(s, "gate", perfect ? "PERFECT LINE" : "RECHARGED", points);
      if (g.y && perfect && !s.flight) {
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
    const p = 1 - s.rollTime / 0.9;
    s.roll = Math.PI * 2 * p * p * p * (10 + p * (-15 + 6 * p));
    s.rollAcceleration =
      (Math.PI * 2 * 60 * p * (1 - p) * (1 - 2 * p)) / (0.9 * 0.9);
    if (!s.rollTime) {
      s.roll = 0;
      s.rollAcceleration = 0;
    }
  }
  const sector = Math.min(2, Math.floor(s.d / (LENGTH / 3)));
  if (sector !== s.sector) {
    s.sector = sector;
    event(s, "sector", SECTORS[sector]);
  }
  if (!s.isRival) {
    for (const rival of s.rivals) {
      if (rival.finished) {
        rival.exitDistance = Math.min(
          100,
          rival.exitDistance + rival.speed * dt,
        );
        continue;
      }
      if (rival.failed) {
        rival.crashAge += dt;
        rival.contactAge += dt;
        continue;
      }
      updateDraft(rival, dt, [s, ...s.rivals]);
      tick(rival, rivalInput(rival, s), dt);
    }
    resolveRivalContacts(s);
    for (const rival of s.rivals)
      if (rival.hull <= 0 && !rival.failed)
        finish(rival, true, "TOO MUCH DAMAGE");
    if (s.hull <= 0) {
      finish(s, true, "TOO MUCH DAMAGE");
      return;
    }
    // The reveal's signature moment: hovering over another car. A clear pass
    // directly above a live rival is rewarded once per rival per flight.
    if (s.airborne && s.y > 1.6) {
      for (const rival of s.rivals) {
        if (
          !rival.failed &&
          !rival.finished &&
          Math.abs(s.x - rival.x) < 2.8 &&
          s.y - rival.y > 1.6 &&
          s.d - rival.d > 0 &&
          s.d - rival.d < 6 &&
          prevD - rival.d <= 0 &&
          !s.flyovers.has(rival.id)
        ) {
          s.flyovers.add(rival.id);
          s.flyoverCount++;
          s.score += 250;
          event(s, "flyover", "FLYOVER · HOVERED " + rival.name, 250);
        }
      }
    } else if (s.flyovers.size) s.flyovers.clear();
    const previousPosition = s.position;
    updateRacePosition(s);
    if (s.position < previousPosition && s.time > 2 && !s.passCooldown) {
      const key = "pass:" + s.position,
        points = s.processed.has(key) ? 0 : 100;
      s.processed.add(key);
      s.score += points;
      s.passCooldown = 3;
      event(s, "overtake", "P" + s.position + " · OVERTAKE", points);
    }
  }
  if (s.d >= LENGTH) finish(s, false, "CROSSING COMPLETE");
}
export function nextWarning(s) {
  if (s.failed)
    return {
      kind: "hit",
      title: s.crashKind === "fall" ? "MISSED THE ROAD" : "WRECKED",
      detail: "RETRY IN A MOMENT",
    };
  if (s.flight)
    return {
      kind: "stunt",
      title: s.stuntKind === "roll" ? "BARREL ROLL" : "BACKFLIP",
      detail: "AUTO LANDING · KEEP STEERING",
    };
  const hazards = s.course.obstacles
    .map((o) => ({ ...o, ...hazardPose(o, s.time) }))
    .filter((o) => o.d > s.d - 4 && o.d - s.d < 160)
    .sort((a, b) => a.d - b.d);
  const o = hazards[0];
  const urgentHazard =
    o && o.d - s.d < 90 && s.y < o.h && s.y + 1.25 > (o.bottom || 0);
  const ramp = s.course.ramps.find(
    (r) => s.d > r.d - (r.length || 10) - 130 && s.d < r.d,
  );
  if (ramp && !urgentHazard)
    return {
      kind: "ramp",
      title:
        s.attachedRamp >= 0
          ? "SUCTION GRIP"
          : ramp.height >= 14
            ? "SKY RAMP"
            : "STUNT RAMP",
      detail:
        s.attachedRamp >= 0
          ? `HOLD YOUR LINE · AUTO ${ramp.stunt === "roll" ? "ROLL" : "FLIP"}`
          : "TAKE THE MINT LANE · AUTO STUNT",
    };
  const gap = s.course.gaps.find((g) => s.d > g.start - 175 && s.d < g.end);
  if (gap && !urgentHazard)
    return {
      kind: "gap",
      title: s.d < gap.start ? "BRIDGE OUT" : "STAY IN THE AIR",
      detail:
        s.d < gap.start
          ? Math.ceil(gap.start - s.d) + " M · HOLD FLY"
          : "HOLD FLY UNTIL THE ROAD RETURNS",
    };
  if (o)
    return {
      kind: o.kind,
      title:
        o.kind === "gantry"
          ? "STAY LOW"
          : o.kind === "cargo"
            ? "SWINGING CARGO"
            : o.kind === "rubble"
              ? "ROCKFALL"
              : o.kind === "drums"
                ? "ROADWORKS"
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
          : o.kind === "sweeper" || o.kind === "cargo"
            ? "STEER OR FLY · "
            : o.kind === "traffic" || o.kind === "rubble" || o.kind === "drums"
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
