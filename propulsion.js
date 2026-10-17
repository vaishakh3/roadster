// Body axes: +X right, +Y up, +Z rear. Exhaust is opposite the reaction force.
// Original game nozzle layout; Tesla does not publish coordinates/control laws.
export const FLIGHT_PORTS = [];
for (const x of [-1.015, 1.015])
  for (const z of [-2.06, 2.22]) {
    const corner = `${x < 0 ? "left" : "right"}-${z < 0 ? "front" : "rear"}`;
    FLIGHT_PORTS.push({
      id: corner + "-lift",
      position: [x, 0.18, z],
      exhaust: [0, -1, 0],
      kind: "lift",
    });
    FLIGHT_PORTS.push({
      id: corner + "-attitude",
      position: [x, z < 0 ? 0.76 : 0.82, z],
      exhaust: [0, 1, 0],
      kind: "attitude",
    });
    FLIGHT_PORTS.push({
      id: corner + "-side",
      position: [x * 1.03, 0.38, z],
      exhaust: [Math.sign(x), 0, 0],
      kind: "side",
    });
  }
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export function flightActuators(s, pitch = 0, roll = 0) {
  const live = !s.failed && (s.airborne || s.lifting || !!s.flight);
  const upright = Math.cos(pitch) * Math.cos(roll);
  const lift =
    live && (s.flight || s.lifting) && upright > 0.45
      ? clamp((9.81 + s.liftAcceleration) / (30 * upright))
      : 0;
  const angular = live
    ? clamp(
        (s.flight?.angularAcceleration ??
          (s.rollTime > 0 ? s.rollAcceleration : 0)) / 28,
        -0.8,
        0.8,
      )
    : 0;
  const pitchCommand = s.flight && s.stuntKind === "flip" ? angular : 0;
  const rollCommand =
    (s.flight && s.stuntKind === "roll") || s.rollTime > 0 ? angular : 0;
  const yaw = live ? clamp(-s.vx * 0.045, -0.45, 0.45) : 0;
  const ports = FLIGHT_PORTS.map((port) => {
    const [x, , z] = port.position;
    if (!live) return 0;
    if (port.kind === "side")
      return Math.max(0, -Math.sign(z) * Math.sign(x) * yaw);
    const torque = -Math.sign(z) * pitchCommand + Math.sign(x) * rollCommand;
    // Paired upper/lower outlets provide a force couple. Inverted coasting
    // doesn't fire all belly nozzles and accelerate the car into the ground.
    return clamp(port.kind === "lift" ? lift + torque : -torque);
  });
  return {
    ports,
    lift,
    grip: s.attachedRamp >= 0 && !s.failed ? 1 : 0,
    forward: !s.failed && (s.boosting || s.padTime > 0) ? 1 : 0,
    pitch: pitchCommand,
    roll: rollCommand,
    yaw,
  };
}
