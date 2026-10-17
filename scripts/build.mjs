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
  (await readFile("vendor/THREE-LICENSE.txt", "utf8"));
const standalone = html
  .replace(/<link\b[^>]*href="style\.css"[^>]*>/, () => `<style>${css}</style>`)
  .replace(
    /<script\b[^>]*src="main\.js"[^>]*>\s*<\/script>/,
    () => `<script>${js.replaceAll("</script", "<\\/script")}</script>`,
  )
  .replace(
    "</body>",
    () =>
      `<script type="text/plain" id="asset-licenses">${bundledLicenses.replaceAll("</script", "<\\/script")}</script></body>`,
  );
await writeFile("Roadster-Flight-Lab.html", standalone);
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await writeFile("dist/index.html", standalone);
await copyFile("vendor/THREE-LICENSE.txt", "dist/THREE-LICENSE.txt");
await copyFile("assets/LICENSE.txt", "dist/ASSET-LICENSE.txt");
await copyFile("assets/runtime/LICENSE.txt", "dist/RUNTIME-ASSETS-LICENSE.txt");
await copyFile("assets/realism/LICENSE.txt", "dist/REALISM-ASSETS-LICENSE.txt");
for (const file of ["Barlow-OFL.txt", "IBMPlexMono-OFL.txt"])
  await copyFile("assets/fonts/" + file, "dist/" + file);
console.log(
  "Built identical standalone and hosted HTML: " +
    Buffer.byteLength(standalone) +
    " bytes, including fonts; no runtime asset requests.",
);
