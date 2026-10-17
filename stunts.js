// The road and the simulation sample the same curved magnetic launch surface.
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
export function launchFlight(r, speed) {
  const duration = Math.max(
    1.2,
    Math.min(3.4, ((r.land || r.d + 125) - r.d) / Math.max(27, speed)),
  );
  const height = r.height || 1.5,
    vy = r.height ? 10 : 12;
  return {
    startD: r.d,
    endD: r.land || r.d + 125,
    duration,
    elapsed: 0,
    height,
    vy,
    gravity: (2 * (height + vy * duration)) / (duration * duration),
    kind: r.stunt || "flip",
    clean: true,
  };
}
export function flightPose(f, dt, distance) {
  f.elapsed =
    distance === undefined
      ? Math.min(f.duration, f.elapsed + dt)
      : Math.max(0, Math.min(1, (distance - f.startD) / (f.endD - f.startD))) *
        f.duration;
  const t = f.elapsed,
    p = Math.min(1, t / (f.duration * 0.78));
  return {
    y: Math.max(0, f.height + f.vy * t - 0.5 * f.gravity * t * t),
    vy: f.vy - f.gravity * t,
    angle: Math.PI * 2 * (p * p * (3 - 2 * p)),
    done: t >= f.duration,
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
