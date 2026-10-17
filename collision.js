/** Rounded vehicle footprint against oriented solid scenery. Fixed-step caller. */
export function resolveObstacles(state, obstacles, radius = 1.35) {
  if (state.crashed) return false;
  for (const o of obstacles) {
    if (state.y > o.height + 0.45) continue;
    const dx = state.x - o.x,
      dz = state.z - o.z;
    const range = Math.max(o.halfX, o.halfZ) + radius;
    if (Math.abs(dx) > range * 1.42 || Math.abs(dz) > range * 1.42) continue;
    const c = Math.cos(o.angle || 0),
      s = Math.sin(o.angle || 0);
    const x = c * dx - s * dz,
      z = s * dx + c * dz;
    const px = o.halfX + radius - Math.abs(x),
      pz = o.halfZ + radius - Math.abs(z);
    if (px <= 0 || pz <= 0) continue;
    let nx = 0,
      nz = 0,
      penetration;
    if (px < pz) {
      nx = x >= 0 ? 1 : -1;
      penetration = px;
    } else {
      nz = z >= 0 ? 1 : -1;
      penetration = pz;
    }
    const wx = c * nx + s * nz,
      wz = -s * nx + c * nz;
    state.x += wx * (penetration + 0.01);
    state.z += wz * (penetration + 0.01);
    const incoming = state.vx * wx + state.vz * wz;
    if (incoming < 0) {
      state.vx -= incoming * wx * 1.15;
      state.vz -= incoming * wz * 1.15;
    }
    const impact = Math.max(-incoming, state.grounded ? 0 : -state.vy);
    if (impact > 13) {
      state.crashed = true;
      state.crashCount++;
      state.crashTimer = 1.4;
      state.impactSpeed = impact;
      state.hover = state.landing = false;
      state.vx *= 0.3;
      state.vz *= 0.3;
      state.vy = 0;
      state.forwardThrust = state.liftThrust = 0;
      state.thrust = { lift: 0, forward: 0, pitch: 0, roll: 0, yaw: 0 };
      state._rechargeDelay = 3;
    }
    return true;
  }
  return false;
}
