// Client for the optional global daily leaderboard (api/leaderboard.js). The
// game never depends on it: a missing or failing endpoint simply hides the UI.
const API = "api/leaderboard";
let available = null;
const cache = new Map();
export const leaderboardAvailable = () => available !== false;
export function ensurePlayerId(storage) {
  let id = storage.get("roadster-player-id", null);
  if (typeof id !== "string" || !/^[a-z0-9]{8,32}$/.test(id)) {
    id = (
      Math.random().toString(36).slice(2, 12) + Date.now().toString(36)
    ).slice(0, 24);
    storage.set("roadster-player-id", id);
  }
  return id;
}
async function call(method, query, body) {
  if (!/^https?:$/.test(location.protocol)) {
    available = false;
    return null;
  }
  try {
    const response = await fetch(API + (query || ""), {
      method,
      cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 404 || response.status === 503) {
      available = false;
      return null;
    }
    if (!response.ok) return null;
    available = true;
    return await response.json();
  } catch {
    return null;
  }
}
export async function fetchBoard(day, id, maxAge = 30000) {
  const hit = cache.get(day);
  if (hit && Date.now() - hit.at < maxAge) return hit.data;
  const data = await call("GET", `?day=${day}&id=${encodeURIComponent(id)}`);
  if (data) cache.set(day, { at: Date.now(), data });
  return data;
}
export async function submitResult(entry) {
  const data = await call("POST", "", entry);
  if (data) cache.delete(entry.day);
  return data;
}
export function renderBoard(list, data, id, formatTime) {
  list.replaceChildren();
  for (const row of data.rows) {
    const li = document.createElement("li");
    if (row.id === id) li.className = "mine";
    li.innerHTML =
      `<i>${String(row.rank).padStart(2, "0")}</i><span></span>` +
      `<b>${row.passed ? "✓ " : ""}${formatTime(row.time)}</b><em>${row.score.toLocaleString("en-US")}</em>`;
    li.querySelector("span").textContent = row.name;
    list.append(li);
  }
}
