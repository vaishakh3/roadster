import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../sw.js", import.meta.url), "utf8");
// Exercise the real fetch handler: visiting the study must never replace the
// game shell, including on a subpath host and with QA/PWA query parameters.
for (const path of ["/", "/roadster/"]) {
  const base = "https://example.test" + path;
  const entries = new Map(),
    handlers = {};
  let online = true,
    status = 200;
  const key = (value) =>
    new URL(typeof value === "string" ? value : value.url, base).href;
  const cache = {
    put: async (request, response) =>
      entries.set(key(request), response.clone()),
  };
  vm.runInNewContext(source, {
    URL,
    Response,
    location: { origin: "https://example.test" },
    self: {
      registration: { scope: base },
      addEventListener: (event, fn) => (handlers[event] = fn),
    },
    caches: {
      open: async () => cache,
      match: async (request) => entries.get(key(request))?.clone(),
    },
    fetch: async (request) => {
      if (!online) throw new Error("offline");
      return new Response(
        new URL(request.url).pathname.endsWith("coastal-study.html")
          ? "STUDY"
          : "GAME",
        { status },
      );
    },
  });
  async function navigate(relative) {
    const pending = [];
    let response;
    handlers.fetch({
      request: {
        method: "GET",
        mode: "navigate",
        url: new URL(relative, base).href,
      },
      waitUntil: (promise) => pending.push(promise),
      respondWith: (promise) => (response = promise),
    });
    const result = await response;
    await Promise.all(pending);
    return result;
  }
  assert.equal(await (await navigate("?pwa=1")).text(), "GAME");
  assert.equal(await (await navigate("coastal-study.html")).text(), "STUDY");
  status = 503;
  await navigate("index.html");
  online = false;
  assert.equal(await (await navigate("?coastal-study=1")).text(), "GAME");
  assert.equal(await (await navigate("index.html")).text(), "GAME");
  assert.equal(
    await (await navigate("coastal-study.html?view=flyover")).text(),
    "STUDY",
  );
  assert.equal((await navigate("unvisited.html")).status, 503);
  console.log(`PASS independent offline game/study navigation at ${path}`);
}
