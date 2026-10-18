import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { build } from "esbuild";

const result = await build({
  entryPoints: ["scripts/analytics-client.js"],
  bundle: true,
  minify: true,
  format: "iife",
  write: false,
});
const client = result.outputFiles[0].text;
let checks = 0;
function browser(url) {
  const scripts = [];
  const context = vm.createContext({
    window: { location: new URL(url) },
    URLSearchParams,
    console,
    document: {
      head: {
        querySelector: (selector) =>
          scripts.find((script) => selector.includes(script.src)),
        appendChild: (script) => scripts.push(script),
      },
      createElement: () => ({ dataset: {} }),
    },
  });
  return { scripts, context };
}
for (const url of [
  "https://flyroadster.space/",
  "https://www.flyroadster.space/",
  "https://roadster-xi.vercel.app/?utm_source=x",
]) {
  const { scripts, context } = browser(url);
  vm.runInContext(client, context);
  vm.runInContext(client, context);
  assert.equal(scripts.length, 1, "SDK must inject only once: " + url);
  assert.equal(scripts[0].src, "/_vercel/insights/script.js");
  assert.equal(scripts[0].defer, true);
  assert.equal(scripts[0].dataset.sdkn, "@vercel/analytics");
  assert.equal(scripts[0].dataset.sdkv, "2.0.1");
  assert.equal(context.window.vam, "production");
  assert.equal(context.window.vaq, undefined, "No custom events are queued");
  checks++;
}
for (const url of [
  "file:///tmp/Roadster-Flight-Lab.html",
  "http://localhost:4173/",
  "https://localhost/",
  "https://dev.localhost/",
  "https://phone.local/",
  "https://127.0.0.1/",
  "https://[::1]/",
  "https://192.168.1.50/",
  "https://10.0.0.2/",
  "https://172.16.0.2/",
  "https://172.31.255.2/",
  "https://flyroadster.space/?qa=1",
  "https://roadster-xi.vercel.app/?qa=0&coastal-study=1",
]) {
  const { scripts, context } = browser(url);
  vm.runInContext(client, context);
  assert.equal(scripts.length, 0, "Must exclude local/QA context: " + url);
  assert.equal(context.window.va, undefined);
  checks++;
}
const sourceHtml = await readFile("index.html", "utf8");
assert(!sourceHtml.includes("@vercel/analytics"));
assert(!sourceHtml.includes("analytics-client.js"));
checks++;
console.log(
  `PASS ${checks} analytics integration cases; built client ${Buffer.byteLength(client)} bytes.`,
);
