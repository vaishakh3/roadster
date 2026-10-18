import { COURSES, LAYOUT_VERSION } from "./courses.js";

// A challenge is a bounded, data-only trajectory. No network or account is needed.
const MAGIC = [82, 67, 1];
const HEADER = 18,
  STRIDE = 7,
  LIMIT = 640;
const DAY = 86400000;
export function dailyEvent(date = new Date()) {
  const day = Math.floor(date.getTime() / DAY);
  const seed = Math.imul(day ^ 0x72b5, 2654435761) >>> 0;
  const course = COURSES[seed % COURSES.length];
  const kind = ["precision", "sprint", "clean"][Math.floor(seed / 3) % 3];
  return {
    day,
    seed,
    courseId: course.id,
    kind,
    date: new Date(day * DAY).toISOString().slice(0, 10),
    name: { precision: "GATE RUN", sprint: "SPRINT CUP", clean: "CLEAN LINE" }[
      kind
    ],
    description: {
      precision: "Collect every gate and finish the race.",
      sprint: "Beat the gold time and finish on the podium.",
      clean: "Finish with all three condition bars.",
    }[kind],
  };
}
export function dailyPassed(event, run) {
  return (
    !!run.finished &&
    (event.kind === "precision"
      ? run.gates === run.course.gates.length
      : event.kind === "clean"
        ? run.hull === 3
        : run.time <= run.course.gold &&
          (run.finishPosition ?? run.position ?? 4) <= 3)
  );
}
function validSamples(samples, course) {
  if (!Array.isArray(samples) || samples.length < 2 || samples.length > LIMIT)
    throw new Error("Challenge has too many or too few samples.");
  let t = -1,
    d = -1;
  for (const p of samples) {
    if (
      !Array.isArray(p) ||
      p.length < 4 ||
      !p.slice(0, 4).every(Number.isFinite) ||
      p[0] < 0 ||
      p[0] <= t ||
      p[0] > 600 ||
      p[1] < d ||
      p[1] < 0 ||
      p[1] > course.length + 1 ||
      Math.abs(p[2]) > 10 ||
      p[3] < -8 ||
      p[3] > 150
    )
      throw new Error("Challenge trajectory is invalid.");
    t = p[0];
    d = p[1];
  }
}
export function encodeChallenge({
  courseId,
  samples,
  time,
  score = 0,
  day = null,
}) {
  const ci = COURSES.findIndex((c) => c.id === courseId);
  if (ci < 0 || !Number.isFinite(time) || time <= 0 || time > 600)
    throw new Error("Complete a race before sharing a challenge.");
  if (!Array.isArray(samples) || samples.length < 2)
    throw new Error("Complete a race before sharing a challenge.");
  const sourceCount = Math.min(LIMIT, samples.length),
    reduced = [];
  for (let i = 0; i < sourceCount; i++)
    reduced.push(
      samples[Math.round((i * (samples.length - 1)) / (sourceCount - 1))].slice(
        0,
        4,
      ),
    );
  validSamples(reduced, COURSES[ci]);
  if (
    reduced.at(-1)[1] < COURSES[ci].length - 2 ||
    Math.abs(reduced.at(-1)[0] - time) > 0.15
  )
    throw new Error("Only completed runs can be shared.");
  // The finish can occur less than one encoding tick after the previous frame.
  // Collapse coincident 20 ms timestamps *after* quantization, retaining the
  // final pose so every link produced here also passes decode validation.
  const quantized = [];
  for (const p of reduced) {
    const q = [
      Math.round(p[0] * 50) / 50,
      Math.round(p[1] * 10) / 10,
      Math.round(p[2] * 10) / 10,
      Math.round(p[3] * 50) / 50,
    ];
    if (quantized.at(-1)?.[0] === q[0]) quantized[quantized.length - 1] = q;
    else quantized.push(q);
  }
  validSamples(quantized, COURSES[ci]);
  if (quantized.some((p) => p[1] * 10 > 65535))
    throw new Error("This course is too long for this challenge format.");
  const event = day === null ? null : dailyEvent(new Date(day * DAY));
  if (
    day !== null &&
    (!Number.isInteger(day) ||
      day < 19000 ||
      day > 60000 ||
      event.courseId !== courseId)
  )
    throw new Error("This event does not match this venue.");
  const count = quantized.length;
  const bytes = new Uint8Array(HEADER + count * STRIDE),
    view = new DataView(bytes.buffer);
  bytes.set([...MAGIC, LAYOUT_VERSION, ci, day === null ? 0 : 1]);
  view.setUint16(6, count);
  view.setUint16(8, Math.round(time * 50));
  view.setUint32(10, Math.max(0, Math.min(9999999, score)));
  view.setUint32(14, day === null ? 0 : day);
  quantized.forEach((p, i) => {
    const o = HEADER + i * STRIDE;
    view.setUint16(o, Math.round(p[0] * 50));
    view.setUint16(o + 2, Math.round(p[1] * 10));
    view.setInt8(o + 4, Math.round(p[2] * 10));
    view.setInt16(o + 5, Math.round(p[3] * 50));
  });
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
export function decodeChallenge(code) {
  if (
    typeof code !== "string" ||
    code.length > 6000 ||
    !/^[A-Za-z0-9_-]+$/.test(code)
  )
    throw new Error("This challenge link is invalid.");
  let raw;
  try {
    raw = atob(code.replaceAll("-", "+").replaceAll("_", "/"));
  } catch {
    throw new Error("This challenge link is incomplete.");
  }
  const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  if (bytes.length < HEADER || MAGIC.some((n, i) => bytes[i] !== n))
    throw new Error("This challenge link is invalid.");
  if (bytes[3] !== LAYOUT_VERSION)
    throw new Error(
      "This challenge uses an older track layout. Start a new race.",
    );
  const view = new DataView(bytes.buffer),
    count = view.getUint16(6),
    course = COURSES[bytes[4]],
    time = view.getUint16(8) / 50;
  if (
    !course ||
    bytes[5] > 1 ||
    count < 2 ||
    count > LIMIT ||
    bytes.length !== HEADER + count * STRIDE ||
    time <= 0 ||
    time > 600
  )
    throw new Error("This challenge link is invalid.");
  const samples = Array.from({ length: count }, (_, i) => {
    const o = HEADER + i * STRIDE;
    return [
      view.getUint16(o) / 50,
      view.getUint16(o + 2) / 10,
      view.getInt8(o + 4) / 10,
      view.getInt16(o + 5) / 50,
    ];
  });
  validSamples(samples, course);
  if (
    samples.at(-1)[1] < course.length - 2 ||
    Math.abs(samples.at(-1)[0] - time) > 0.15
  )
    throw new Error("The challenge did not reach the finish.");
  const day = bytes[5] ? view.getUint32(14) : null;
  if (day !== null && (day < 19000 || day > 60000))
    throw new Error("This event date is invalid.");
  const event = day === null ? null : dailyEvent(new Date(day * DAY));
  if (event && event.courseId !== course.id)
    throw new Error("The event does not match this venue.");
  return {
    courseId: course.id,
    time,
    score: view.getUint32(10),
    samples,
    event,
  };
}
export function sampleReplay(samples, time, cursor = 0) {
  if (!samples?.length) return null;
  while (cursor < samples.length - 2 && samples[cursor + 1][0] < time) cursor++;
  while (cursor > 0 && samples[cursor][0] > time) cursor--;
  const a = samples[cursor],
    b = samples[Math.min(cursor + 1, samples.length - 1)],
    f = Math.max(0, Math.min(1, (time - a[0]) / (b[0] - a[0] || 1)));
  return {
    cursor,
    values: a.map((v, i) => (i === 0 ? time : v + ((b[i] ?? v) - v) * f)),
  };
}
