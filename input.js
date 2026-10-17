/** Phones and touch tablets play horizontally; desktop portrait windows remain usable. */
export function requiresLandscape(width, height, coarse) {
  return height > width && (coarse || width <= 600);
}

/** Own one pointer per stick, and never cancel an unrelated held button. */
export function bindSteeringPad(element, knob, onChange) {
  let pointer = null;
  const release = (e) => {
    if (pointer !== e.pointerId) return;
    pointer = null;
    knob.style.transform = "";
    element.classList.remove("pressed");
    onChange(0);
  };
  const move = (e) => {
    if (pointer !== e.pointerId) return;
    const rect = element.getBoundingClientRect();
    const value = Math.max(
      -1,
      Math.min(
        1,
        (e.clientX - rect.left - rect.width / 2) / (rect.width * 0.36),
      ),
    );
    knob.style.transform = `translateX(${value * rect.width * 0.23}px)`;
    onChange(Math.abs(value) < 0.06 ? 0 : -value);
  };
  element.addEventListener("pointerdown", (e) => {
    if (pointer !== null) return;
    e.preventDefault();
    pointer = e.pointerId;
    try {
      element.setPointerCapture(e.pointerId);
    } catch {
      /* Cancelled browser pointer. */
    }
    element.classList.add("pressed");
    move(e);
  });
  element.addEventListener("pointermove", move);
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    element.addEventListener(event, release);
  return () => {
    pointer = null;
    knob.style.transform = "";
    element.classList.remove("pressed");
    onChange(0);
  };
}
