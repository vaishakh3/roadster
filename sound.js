/** All sound is synthesised locally after a player gesture. No network or autoplay. */
export function createSound() {
  let ctx, master, engine, motor, wind, windGain;
  let enabled = true;
  function init() {
    if (ctx) {
      ctx.resume().catch(() => {});
      return;
    }
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    ctx = new Audio();
    master = ctx.createGain();
    master.gain.value = 0.27;
    master.connect(ctx.destination);
    engine = ctx.createOscillator();
    engine.type = "triangle";
    engine.frequency.value = 70;
    motor = ctx.createGain();
    motor.gain.value = 0;
    engine.connect(motor);
    motor.connect(master);
    engine.start();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const a = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < a.length; i++) {
      last = (last + (Math.random() * 2 - 1) * 0.02) / 1.02;
      a[i] = last * 3;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    wind = ctx.createBiquadFilter();
    wind.type = "highpass";
    wind.frequency.value = 450;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    source.connect(wind);
    wind.connect(windGain);
    windGain.connect(master);
    source.start();
  }
  function tone(freq, duration = 0.2, volume = 0.15, delay = 0) {
    if (!ctx || !enabled) return;
    const now = ctx.currentTime + delay,
      o = ctx.createOscillator(),
      g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(volume, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    o.connect(g);
    g.connect(master);
    o.start(now);
    o.stop(now + duration + 0.01);
  }
  return {
    init,
    setEnabled(value) {
      enabled = value;
      if (master)
        master.gain.setTargetAtTime(value ? 0.27 : 0, ctx.currentTime, 0.06);
    },
    update(s, playing) {
      if (!ctx) return;
      engine.frequency.setTargetAtTime(
        52 + s.speed * 2.7 + (s.boosting ? 55 : 0),
        ctx.currentTime,
        0.1,
      );
      motor.gain.setTargetAtTime(playing ? 0.085 : 0, ctx.currentTime, 0.15);
      windGain.gain.setTargetAtTime(
        playing ? Math.min(0.5, s.speed / 150 + (s.airborne ? 0.1 : 0)) : 0,
        ctx.currentTime,
        0.15,
      );
    },
    event(type) {
      if (type === "gate") {
        tone(523, 0.28, 0.22);
        tone(784, 0.35, 0.16, 0.08);
        tone(1047, 0.4, 0.1, 0.16);
      } else if (type === "hit" || type === "fail") {
        tone(80, 0.35, 0.35);
        tone(57, 0.45, 0.2, 0.1);
      } else if (type === "pad" || type === "launch") {
        tone(196, 0.22, 0.16);
        tone(392, 0.3, 0.15, 0.07);
        tone(784, 0.35, 0.1, 0.14);
      } else if (type === "gap") {
        tone(392, 0.25, 0.17);
        tone(587, 0.35, 0.15, 0.12);
      } else if (type === "finish") {
        [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.8, 0.2, i * 0.13));
      } else if (type === "start") tone(659, 0.3, 0.2);
    },
  };
}
