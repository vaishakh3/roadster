import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

let count = 0;
const test = (name, fn) => {
  fn();
  count++;
  console.log("PASS " + name);
};
const manifest = JSON.parse(await readFile("manifest.webmanifest", "utf8"));
const sw = await readFile("sw.js", "utf8");
const html = await readFile("index.html", "utf8");
const build = await readFile("scripts/build.mjs", "utf8");

test("The web app manifest installs as a fullscreen landscape app with icons", () => {
  assert.equal(manifest.display, "fullscreen");
  assert.equal(manifest.orientation, "landscape");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.icons.length, 2);
  for (const icon of manifest.icons) {
    assert.equal(icon.type, "image/png");
    assert.match(icon.sizes, /^(192x192|512x512)$/);
  }
});
test("The service worker is versioned per build and never caches other origins", () => {
  assert(sw.includes('"__BUILD_VERSION__"'));
  assert(build.includes('replace("__BUILD_VERSION__", version)'));
  assert(sw.includes('request.mode === "navigate"'));
  assert(sw.includes("new URL(request.url).origin !== location.origin"));
  assert(sw.includes('key.startsWith("roadster-") && key !== CACHE'));
});
test("The page links the manifest and iOS home-screen metadata", () => {
  assert(html.includes('<link rel="manifest" href="manifest.webmanifest" />'));
  assert(html.includes('<link rel="apple-touch-icon" href="icon-192.png" />'));
  assert(html.includes('name="apple-mobile-web-app-capable" content="yes"'));
  assert(build.includes('writeFile("dist/icon-192.png", iconPng(192))'));
});
test("Arrow glyphs that iOS renders as emoji are gone from the markup", () => {
  assert(!html.includes("\u2197"));
  assert(html.includes('class="ico ico-go"'));
});
console.log(`${count} install/offline checks passed.`);
