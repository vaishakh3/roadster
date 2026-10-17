/** One held-state per input source; no resets when switching road/air or boosting. */
export const requiresLandscape = (w, h, coarse) =>
  h > w && (coarse || w <= 600);
export function createControls(target, onAction, enabled = () => true) {
  const keys = new Set(),
    touches = new Map();
  const recognized = new Set([
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "KeyA",
    "KeyD",
    "KeyW",
    "KeyS",
    "ShiftLeft",
    "ShiftRight",
    "Space",
    "KeyH",
    "Escape",
    "KeyP",
    "KeyR",
  ]);
  const action = (code) =>
    code === "Escape" || code === "KeyP"
      ? "pause"
      : code === "KeyR"
        ? "retry"
        : null;
  const down = (e) => {
    if (!recognized.has(e.code)) return;
    // Preserve normal activation on menus (Space/Enter on focused buttons).
    if (!enabled() && !action(e.code)) return;
    e.preventDefault();
    if (!e.repeat && action(e.code)) onAction(action(e.code));
    else if (enabled()) keys.add(e.code);
  };
  const up = (e) => {
    keys.delete(e.code);
  };
  target.addEventListener("keydown", down);
  target.addEventListener("keyup", up);
  const release = (e) => touches.delete(e.pointerId);
  const bound = [];
  function bind(button, name) {
    const press = (e) => {
      if (!enabled()) return;
      e.preventDefault();
      touches.set(e.pointerId, name);
      try {
        button.setPointerCapture(e.pointerId);
      } catch {
        /* Synthetic/cancelled pointer. */
      }
      button.classList.add("pressed");
    };
    const end = (e) => {
      release(e);
      if (![...touches.values()].includes(name))
        button.classList.remove("pressed");
    };
    button.addEventListener("pointerdown", press);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      button.addEventListener(type, end);
    bound.push(button);
  }
  const has = (...codes) => codes.some((k) => keys.has(k));
  function read() {
    const active = new Set(touches.values());
    return {
      steer:
        Number(has("ArrowRight", "KeyD") || active.has("right")) -
        Number(has("ArrowLeft", "KeyA") || active.has("left")),
      boost:
        has("ShiftLeft", "ShiftRight", "ArrowUp", "KeyW") ||
        active.has("boost"),
      fly: has("Space", "KeyH") || active.has("fly"),
      brake: has("ArrowDown", "KeyS") || active.has("brake"),
    };
  }
  function clear() {
    keys.clear();
    touches.clear();
    bound.forEach((b) => b.classList.remove("pressed"));
  }
  return { read, clear, bind, keys, touches };
}
