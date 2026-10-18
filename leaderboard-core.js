// Pure rules for the global daily leaderboard. Shared by the Vercel function
// in api/leaderboard.js and the node tests; no I/O here.
const DAY = 86400000;
export const LIMITS = Object.freeze({
  name: 14,
  minTime: 20,
  maxTime: 900,
  maxScore: 250000,
  top: 20,
  keep: 200,
  perDay: 40,
});
export const todayIndex = (now = Date.now()) => Math.floor(now / DAY);
export function cleanName(raw) {
  const name = String(raw ?? "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} _.'-]/gu, "")
    .trim()
    .toUpperCase()
    .slice(0, LIMITS.name);
  return name || "ROADSTER";
}
/** Validates a submission; returns { ok, error } or { ok, entry }. */
export function validateEntry(body, now = Date.now()) {
  if (!body || typeof body !== "object") return { ok: false, error: "body" };
  const { day, courseId, time, score, passed, id } = body;
  const today = todayIndex(now);
  if (!Number.isInteger(day) || day < today - 1 || day > today)
    return { ok: false, error: "day" };
  if (typeof courseId !== "string" || !/^[a-z]{3,16}$/.test(courseId))
    return { ok: false, error: "course" };
  if (typeof id !== "string" || !/^[a-z0-9]{8,32}$/.test(id))
    return { ok: false, error: "id" };
  if (
    !Number.isFinite(time) ||
    time < LIMITS.minTime ||
    time > LIMITS.maxTime ||
    !Number.isInteger(score) ||
    score < 0 ||
    score > LIMITS.maxScore
  )
    return { ok: false, error: "result" };
  return {
    ok: true,
    entry: {
      day,
      courseId,
      id,
      name: cleanName(body.name),
      time: Math.round(time * 10) / 10,
      score,
      passed: passed === true,
    },
  };
}
/** Sort value for a Redis sorted set: passed runs first, then score, then time. */
export function rankValue(entry) {
  return (
    (entry.passed ? 1e9 : 0) +
    Math.min(entry.score, LIMITS.maxScore) * 1000 +
    Math.max(0, 999 - Math.min(999, Math.round(entry.time)))
  );
}
export const encodeMember = (entry) =>
  JSON.stringify([entry.id, entry.name, entry.time, entry.score, entry.passed ? 1 : 0]);
export function decodeMember(member) {
  try {
    const [id, name, time, score, passed] = JSON.parse(member);
    return { id, name, time, score, passed: passed === 1 };
  } catch {
    return null;
  }
}
export const keys = {
  board: (day) => `lb:${day}`,
  member: (day, id) => `lb:${day}:m:${id}`,
  rate: (day, ip) => `lb:${day}:rl:${ip}`,
};
/** Turns ZREVRANGE WITHSCORES output into ranked rows. */
export function rows(flat) {
  const out = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const entry = decodeMember(flat[i]);
    if (entry) out.push({ rank: out.length + 1, ...entry });
  }
  return out;
}
