// Global daily leaderboard. One Upstash Redis store (Vercel Marketplace →
// Storage → Upstash Redis) is the only backend; without it the endpoint
// answers 503 and the game hides the leaderboard. No accounts: a random
// per-browser id lets a player replace their own entry.
import {
  LIMITS,
  keys,
  rows,
  validateEntry,
  rankValue,
  encodeMember,
  decodeMember,
  todayIndex,
} from "../leaderboard-core.js";

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redis(commands) {
  const response = await fetch(url + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!response.ok) throw new Error("redis " + response.status);
  return (await response.json()).map((r) => r.result);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!url || !token) return res.status(503).json({ error: "no-store" });
  try {
    if (req.method === "GET") {
      const day = Number(req.query.day) || todayIndex();
      const id = /^[a-z0-9]{8,32}$/.test(req.query.id || "") ? req.query.id : null;
      const [flat, total, own] = await redis([
        ["ZREVRANGE", keys.board(day), 0, LIMITS.top - 1, "WITHSCORES"],
        ["ZCARD", keys.board(day)],
        id ? ["GET", keys.member(day, id)] : ["PING"],
      ]);
      let mine = null;
      if (id && own) {
        const [rank] = await redis([["ZREVRANK", keys.board(day), own]]);
        if (rank !== null) mine = { rank: rank + 1, ...decodeMember(own) };
      }
      return res.status(200).json({ day, total, rows: rows(flat), mine });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "method" });
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const checked = validateEntry(body);
    if (!checked.ok) return res.status(400).json({ error: checked.error });
    const { entry } = checked;
    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "local";
    const [hits] = await redis([
      ["INCR", keys.rate(entry.day, ip)],
      ["EXPIRE", keys.rate(entry.day, ip), 2 * 86400],
    ]);
    if (hits > LIMITS.perDay) return res.status(429).json({ error: "rate" });
    const member = encodeMember(entry);
    const [previous] = await redis([["GET", keys.member(entry.day, entry.id)]]);
    const commands = [];
    if (previous && previous !== member) {
      const old = decodeMember(previous);
      if (old && rankValue({ ...old }) >= rankValue(entry))
        return res.status(200).json({ kept: true });
      commands.push(["ZREM", keys.board(entry.day), previous]);
    }
    commands.push(
      ["ZADD", keys.board(entry.day), rankValue(entry), member],
      ["SET", keys.member(entry.day, entry.id), member, "EX", 3 * 86400],
      ["EXPIRE", keys.board(entry.day), 3 * 86400],
      ["ZREMRANGEBYRANK", keys.board(entry.day), 0, -(LIMITS.keep + 1)],
      ["ZREVRANK", keys.board(entry.day), member],
      ["ZCARD", keys.board(entry.day)],
    );
    const results = await redis(commands);
    const rank = results.at(-2),
      total = results.at(-1);
    return res.status(200).json({ rank: rank === null ? null : rank + 1, total });
  } catch (error) {
    return res.status(502).json({ error: "store" });
  }
}
