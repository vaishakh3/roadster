import { clamp, getGroundClearance } from "./physics.js";

export const createPilot = () => ({
  targetRoll: null,
  settling: 0,
  wasAirborne: false,
  parked: false,
});

export function requestRoll(pilot, state) {
  if (pilot.targetRoll !== null || pilot.settling > 0) return "busy";
  if (state.crashed || !state.hover || state.landing) return "unavailable";
  if (getGroundClearance(state) < 24) return "climb";
  if (state.charge < 18) return "reserve";
  pilot.targetRoll = state.rolls + 1;
  return "started";
}

/** Assist commands the existing physics, never position, attitude or trick counts. */
export function pilotInput(state, raw, pilot, dt) {
  const command = { ...raw };
  if (state.crashed) return { throttle: 0, brake: 0 };
  if (state.grounded && !state.hover) {
    if (pilot.wasAirborne) pilot.parked = true;
    pilot.wasAirborne = false;
    if (raw.boost) pilot.parked = false;
    pilot.targetRoll = null;
    pilot.settling = 0;
    command.throttle =
      raw.brake || pilot.parked
        ? 0
        : raw.boost
          ? 1
          : clamp((26 - state.speed) / 5, 0, 1);
    if (state.speed < 0.2 && raw.brake) command.brake = 0;
    return command;
  }
  pilot.wasAirborne = true;
  command.pitch = command.roll = command.lift = 0;
  command.yaw = raw.steer;
  command.throttle = raw.boost ? 1 : 0;
  command.boost = false;
  command.brake = raw.brake;
  if (state.landing) {
    pilot.targetRoll = null;
    pilot.settling = 0;
    command.brake = 1;
    command.yaw = command.throttle = 0;
    return command;
  }
  if (pilot.targetRoll !== null) {
    if (state.rolls >= pilot.targetRoll) {
      pilot.targetRoll = null;
      pilot.settling = 1.2;
    } else if (state.charge < 8 || getGroundClearance(state) < 8) {
      pilot.targetRoll = null;
      pilot.settling = 1.2;
    } else {
      command.roll = 1;
      command.yaw = command.throttle = 0;
    }
  }
  if (pilot.settling > 0) {
    pilot.settling = Math.max(0, pilot.settling - dt);
    command.recover = true;
    command.yaw = command.throttle = 0;
  }
  return command;
}
