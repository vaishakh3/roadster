// The road and the simulation sample the same curved suction-grip launch surface.
export function rampSurface(r, d) {
  const length = r.length || 10,
    height = r.height || 1.5;
  const u = Math.max(0, Math.min(1, (d - r.d + length) / length));
  return {
    height: height * u * u,
    pitch: Math.atan((2 * height * u) / length),
    u,
  };
}
// A wheelbase-sized support plane, not a point buried in the curved deck.
export function rampContact(r, d) {
  const base = r.d - (r.length || 10),
    axle = 1.48;
  const sample = (q) =>
    q < base
      ? 0
      : q > r.d
        ? (r.height || 1.5) + Math.tan(rampSurface(r, r.d).pitch) * (q - r.d)
        : rampSurface(r, q).height;
  let pitch = rampSurface(r, d).pitch;
  for (let i = 0; i < 3; i++) {
    const span = axle * Math.cos(pitch);
    pitch = Math.atan2(sample(d + span) - sample(d - span), 2 * span);
  }
  const span = axle * Math.cos(pitch);
  return { height: (sample(d + span) + sample(d - span)) / 2 + 0.045, pitch };
}
export function launchFlight(r, speed) {
  const distance = (r.land || r.d + 125) - r.d;
  const duration = Math.max(1.2, Math.min(3.4, distance / Math.max(27, speed)));
  const contact = rampContact(r, r.d);
  // Assisted flight connects the ramp tangent to a gentle landing. Derivatives
  // are used by the actuator model, so landing jets reflect the actual motion.
  const height = contact.height,
    vy = Math.max(10, speed * Math.tan(contact.pitch));
  const v0 = vy * duration,
    v1 = -0.8 * duration;
  return {
    startD: r.d,
    endD: r.land || r.d + 125,
    duration,
    elapsed: 0,
    height,
    vy,
    startPitch: contact.pitch,
    curve: [height, v0, -3 * height - 2 * v0 - v1, 2 * height + v0 + v1],
    kind: r.stunt || "flip",
    clean: true,
    acceleration: 0,
    lastSpeed: speed,
    angularVelocity: 0,
    angularAcceleration: 0,
  };
}
export function flightPose(f, dt, distance, speed) {
  f.elapsed =
    distance === undefined
      ? Math.min(f.duration, f.elapsed + dt)
      : Math.max(0, Math.min(1, (distance - f.startD) / (f.endD - f.startD))) *
        f.duration;
  const t = f.elapsed / f.duration,
    [a, b, c, d] = f.curve;
  const rate =
    speed === undefined ? 1 / f.duration : speed / (f.endD - f.startD);
  const rateAcceleration =
    speed !== undefined && dt > 0
      ? (speed - f.lastSpeed) / dt / (f.endD - f.startD)
      : 0;
  if (speed !== undefined) f.lastSpeed = speed;
  const slope = b + 2 * c * t + 3 * d * t * t;
  const y = a + b * t + c * t * t + d * t * t * t;
  // Leave the ramp by a full vehicle length before initiating the rotation.
  const delay = 5 / (f.endD - f.startD),
    end = 0.8;
  const u = Math.max(0, Math.min(1, (t - delay) / (end - delay)));
  const smooth = u * u * u * (10 + u * (-15 + 6 * u));
  const du = t > delay && t < end ? rate / (end - delay) : 0;
  const angle = Math.PI * 2 * smooth;
  f.acceleration = (2 * c + 6 * d * t) * rate * rate + slope * rateAcceleration;
  f.angularVelocity = Math.PI * 2 * 30 * u * u * (1 - u) * (1 - u) * du;
  f.angularAcceleration =
    Math.PI * 2 * 60 * u * (1 - u) * (1 - 2 * u) * du * du +
    (du
      ? (Math.PI * 2 * 30 * u * u * (1 - u) * (1 - u) * rateAcceleration) /
        (end - delay)
      : 0);
  return {
    y: t >= 1 ? 0 : Math.max(0, y),
    vy: slope * rate,
    angle,
    pitch: f.startPitch * (1 - smooth),
    done: t >= 1,
  };
}

// Position history is in world space: an old segment never turns with the car.
export class PathHistory {
  constructor(capacity = 64, lifetime = 0.75) {
    this.capacity = capacity;
    this.lifetime = lifetime;
    this.points = [];
  }
  clear() {
    this.points.length = 0;
  }
  push(x, y, z, time) {
    const prev = this.points.at(-1);
    if (prev && Math.hypot(x - prev.x, y - prev.y, z - prev.z) > 45)
      this.clear();
    const last = this.points.at(-1);
    if (!last || Math.hypot(x - last.x, y - last.y, z - last.z) > 0.45) {
      this.points.push({ x, y, z, time });
      if (this.points.length > this.capacity) this.points.shift();
    }
    this.expire(time);
  }
  expire(time) {
    while (this.points.length && time - this.points[0].time > this.lifetime)
      this.points.shift();
  }
}
