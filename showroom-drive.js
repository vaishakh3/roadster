import { createRun, stepRun } from "./run.js";
import { rivalInput } from "./rivals.js";

const STEP = 1 / 120;
const FADE_SECONDS = 0.3;
const START_DISTANCE = 80;
const CRUISE_SPEED = 43;

/** One autonomous car for the menu. Its simulation never touches a player's run,
 * record storage, opponents or telemetry. The normal ramp/lift physics still own
 * its trajectory; the existing rival driver chooses a safe line through a venue. */
export function createShowroomDrive(course) {
  let state;
  let stage = "drive";
  let fade = 0;
  let reduced = false;
  const stats = { cycles: 0, completed: 0, recoveries: 0, moving: false };

  function createState(nextCourse, still = false) {
    state = createRun(nextCourse, { rival: true });
    Object.assign(state, {
      d: START_DISTANCE,
      speed: still ? 0 : 38,
      // Match the reliable lead rival's lane planning without creating a field.
      index: 0,
      lane: 0,
      pace: 0,
      targetLane: 0,
      mistakes: 0,
      mistakeActive: false,
      overtaking: false,
    });
  }

  function reset(nextCourse = state?.course) {
    createState(nextCourse, reduced);
    stage = "drive";
    fade = 0;
    stats.cycles = stats.completed = stats.recoveries = 0;
    stats.moving = false;
  }

  function drive(dt) {
    // Using this same private state as the empty race field avoids allocating a
    // synthetic player and ensures the rival never brakes for an invisible car.
    const input = rivalInput(state, state);
    input.boost = false;
    input.paceLimit = CRUISE_SPEED;
    stepRun(state, input, dt);
    // Menu motion has no audience for race events. Keep that queue empty.
    state.events.length = 0;
    if (state.finished || state.failed) {
      stage = "out";
      if (state.finished) stats.completed++;
      else stats.recoveries++;
    }
  }

  function update(frameDt, options = {}) {
    if (options.paused) {
      stats.moving = false;
      return;
    }
    const nextReduced = !!options.reduced;
    if (nextReduced !== reduced) {
      reduced = nextReduced;
      createState(state.course, reduced);
      stage = "drive";
      fade = 0;
    }
    stats.moving = false;
    if (reduced) return;
    const dt = Math.max(
      0,
      Math.min(0.1, Number.isFinite(frameDt) ? frameDt : 0),
    );
    if (!dt) return;
    const steps = Math.ceil(dt / STEP);
    const step = dt / steps;
    for (let i = 0; i < steps; i++) {
      if (stage === "out") {
        fade = Math.min(1, fade + step / FADE_SECONDS);
        if (fade >= 1 - 1e-9) {
          createState(state.course);
          stats.cycles++;
          fade = 1;
          stage = "in";
        }
        continue;
      }
      if (stage === "in") {
        fade = Math.max(0, fade - step / FADE_SECONDS);
        if (fade <= 1e-9) {
          fade = 0;
          stage = "drive";
        }
      }
      drive(step);
      stats.moving = true;
    }
  }

  reset(course);
  return {
    get state() {
      return state;
    },
    get fade() {
      return fade;
    },
    stats,
    reset,
    update,
  };
}
