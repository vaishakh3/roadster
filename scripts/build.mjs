import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { build } from "esbuild";
import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  rm,
  readdir,
} from "node:fs/promises";
const result = await build({
  entryPoints: ["main.js"],
  bundle: true,
  minify: true,
  format: "iife",
  write: false,
});
const analytics = await build({
  entryPoints: ["scripts/analytics-client.js"],
  bundle: true,
  minify: true,
  format: "iife",
  write: false,
});
const html = await readFile("index.html", "utf8"),
  bundled = result.outputFiles[0].text;
let js = bundled;
for (const file of await readdir("assets/runtime")) {
  if (!/\.(webp|hdr)$/.test(file)) continue;
  const data = await readFile("assets/runtime/" + file);
  const mime = file.endsWith(".webp")
    ? "image/webp"
    : "application/octet-stream";
  js = js.replaceAll(
    "assets/runtime/" + file,
    `data:${mime};base64,${data.toString("base64")}`,
  );
}
let css = await readFile("style.css", "utf8");
for (const file of [
  "BarlowCondensed-SemiBold.ttf",
  "IBMPlexMono-Regular.ttf",
]) {
  const data = await readFile("assets/fonts/" + file);
  css = css.replaceAll(
    "assets/fonts/" + file,
    "data:font/ttf;base64," + data.toString("base64"),
  );
}
for (const file of await readdir("assets/venues")) {
  if (!file.endsWith(".png")) continue;
  const data = await readFile("assets/venues/" + file);
  css = css.replaceAll(
    "assets/venues/" + file,
    "data:image/png;base64," + data.toString("base64"),
  );
}
const fontLicenseFiles = ["Barlow-OFL.txt", "IBMPlexMono-OFL.txt"];
const bundledLicenses =
  (
    await Promise.all(
      fontLicenseFiles.map((file) => readFile("assets/fonts/" + file, "utf8")),
    )
  ).join("\n\n") +
  "\n\n" +
  (await readFile("assets/realism/LICENSE.txt", "utf8")) +
  "\n\n" +
  (await readFile("assets/runtime/LICENSE.txt", "utf8")) +
  "\n\n" +
  (await readFile("assets/LICENSE.txt", "utf8")) +
  "\n\n" +
  (await readFile("vendor/THREE-LICENSE.txt", "utf8")) +
  "\n\n@vercel/analytics\n" +
  (await readFile("node_modules/@vercel/analytics/LICENSE", "utf8"));
const standalone = html
  .replace(/<link\b[^>]*href="style\.css"[^>]*>/, () => `<style>${css}</style>`)
  .replace(
    /<script\b[^>]*src="main\.js"[^>]*>\s*<\/script>/,
    () => `<script>${js.replaceAll("</script", "<\\/script")}</script>`,
  )
  .replace(
    "</body>",
    () =>
      `<script type="text/plain" id="asset-licenses">${bundledLicenses.replaceAll("</script", "<\\/script")}</script><script id="vercel-analytics">${analytics.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script></body>`,
  );
await writeFile("Roadster-Flight-Lab.html", standalone);
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await writeFile("dist/index.html", standalone);
const version = createHash("sha256").update(standalone).digest("hex").slice(0, 12);
await writeFile(
  "dist/sw.js",
  (await readFile("sw.js", "utf8")).replace("__BUILD_VERSION__", version),
);
await copyFile("manifest.webmanifest", "dist/manifest.webmanifest");
await writeFile("dist/icon-192.png", iconPng(192));
await writeFile("dist/icon-512.png", iconPng(512));
await copyFile("vendor/THREE-LICENSE.txt", "dist/THREE-LICENSE.txt");
await copyFile("assets/LICENSE.txt", "dist/ASSET-LICENSE.txt");
await copyFile("assets/runtime/LICENSE.txt", "dist/RUNTIME-ASSETS-LICENSE.txt");
await copyFile("assets/realism/LICENSE.txt", "dist/REALISM-ASSETS-LICENSE.txt");
for (const file of ["Barlow-OFL.txt", "IBMPlexMono-OFL.txt"])
  await copyFile("assets/fonts/" + file, "dist/" + file);
// Rasterises the favicon artwork (orange tile, dark "R" road strokes) into a
// PNG without any image dependency: anti-aliased distance to stroke segments.
function iconPng(size) {
  const k = size / 64,
    width = 7 * k,
    segments = [
      [17, 46, 30, 18],
      [30, 18, 47, 18],
      [47, 18, 34, 46],
      [25, 31, 42, 31],
    ].map((v) => v.map((n) => n * k));
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let distance = Infinity;
      for (const [ax, ay, bx, by] of segments) {
        const dx = bx - ax,
          dy = by - ay,
          t = Math.max(
            0,
            Math.min(1, ((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / (dx * dx + dy * dy)),
          );
        distance = Math.min(distance, Math.hypot(x + 0.5 - ax - dx * t, y + 0.5 - ay - dy * t));
      }
      const ink = Math.max(0, Math.min(1, width / 2 + 0.5 - distance));
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = Math.round(0xf4 + (0x13 - 0xf4) * ink);
      raw[o + 1] = Math.round(0x6b + (0x2d - 0x6b) * ink);
      raw[o + 2] = Math.round(0x3c + (0x36 - 0x3c) * ink);
      raw[o + 3] = 255;
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}
console.log(
  "Built identical standalone and hosted HTML: " +
    Buffer.byteLength(standalone) +
    " bytes, including fonts; game assets embedded; optional hosted analytics loads asynchronously. Service worker version " +
    version +
    ".",
);
