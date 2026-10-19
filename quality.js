// Slow, bounded resolution adaptation. Simulation, HUD and input stay untouched.
// Ladder: pixel ratio steps down to `floor` first; if the device is still slow
// at the floor, `shadows` turns off instead of blurring further. Shadows come
// back only after the ratio has recovered to the ceiling and stayed fast.
export class FrameBudget {
  constructor() {
    this.reset();
  }
  reset() {
    this.elapsed = 0;
    this.total = 0;
    this.frames = 0;
    this.fast = 0;
    this.slowAtFloor = 0;
    this.shadows = true;
    this.fastAtCeiling = 0;
  }
  sample(seconds, ratio, ceiling, floor = 0.7) {
    // Background tabs and one-off hitches are ignored; a device that is
    // genuinely struggling still has to be measured, so slow frames are
    // clamped instead of dropped.
    if (seconds <= 0 || seconds > 0.5) return ratio;
    seconds = Math.min(seconds, 0.25);
    this.elapsed += seconds;
    this.total += seconds;
    this.frames++;
    if (this.elapsed < 2) return ratio;
    const average = this.total / this.frames;
    this.elapsed = this.total = this.frames = 0;
    if (average > 0.021) {
      this.fast = 0;
      this.fastAtCeiling = 0;
      const step = average > 0.05 ? 0.2 : 0.1;
      const limit = Math.min(
        Math.max(floor, average > 0.05 ? 0.7 : 0.8),
        ceiling,
      );
      const next = Math.max(limit, Math.round((ratio - step) * 100) / 100);
      if (next >= ratio && this.shadows && ++this.slowAtFloor >= 2) {
        this.shadows = false;
        this.slowAtFloor = 0;
      }
      return next;
    }
    this.slowAtFloor = 0;
    if (average < 0.0178) {
      this.fast++;
      if (ratio >= ceiling) {
        if (++this.fastAtCeiling >= 8) {
          this.shadows = true;
          this.fastAtCeiling = 0;
        }
      } else this.fastAtCeiling = 0;
      if (this.fast >= 4) {
        this.fast = 0;
        return Math.min(ceiling, Math.round((ratio + 0.05) * 100) / 100);
      }
    } else this.fast = this.fastAtCeiling = 0;
    return ratio;
  }
}
