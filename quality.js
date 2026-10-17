// Slow, bounded resolution adaptation. Simulation, HUD and input stay untouched.
export class FrameBudget {
  constructor() {
    this.reset();
  }
  reset() {
    this.elapsed = 0;
    this.total = 0;
    this.frames = 0;
    this.fast = 0;
  }
  sample(seconds, ratio, ceiling) {
    if (seconds <= 0 || seconds > 0.15) return ratio;
    this.elapsed += seconds;
    this.total += seconds;
    this.frames++;
    if (this.elapsed < 2) return ratio;
    const average = this.total / this.frames;
    this.elapsed = this.total = this.frames = 0;
    if (average > 0.021) {
      this.fast = 0;
      return Math.max(
        Math.min(0.8, ceiling),
        Math.round((ratio - 0.1) * 100) / 100,
      );
    }
    if (average < 0.0178) {
      this.fast++;
      if (this.fast >= 4) {
        this.fast = 0;
        return Math.min(ceiling, Math.round((ratio + 0.05) * 100) / 100);
      }
    } else this.fast = 0;
    return ratio;
  }
}
