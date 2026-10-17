import { build } from "esbuild";
import { readFile, writeFile, mkdir, copyFile, rm } from "node:fs/promises";
const result = await build({
  entryPoints: ["main.js"],
  bundle: true,
  minify: true,
  format: "iife",
  write: false,
});
const html = await readFile("index.html", "utf8"),
  js = result.outputFiles[0].text;
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
const fontLicenseFiles = ["Barlow-OFL.txt", "IBMPlexMono-OFL.txt"];
const fontLicenses = (
  await Promise.all(
    fontLicenseFiles.map((file) => readFile("assets/fonts/" + file, "utf8")),
  )
).join("\n\n");
const standalone = html
  .replace(/<link\b[^>]*href="style\.css"[^>]*>/, () => `<style>${css}</style>`)
  .replace(
    /<script\b[^>]*src="main\.js"[^>]*>\s*<\/script>/,
    () => `<script>${js.replaceAll("</script", "<\\/script")}</script>`,
  )
  .replace(
    "</body>",
    () =>
      `<script type="text/plain" id="font-licenses">${fontLicenses.replaceAll("</script", "<\\/script")}</script></body>`,
  );
await writeFile("Roadster-Flight-Lab.html", standalone);
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await writeFile("dist/index.html", standalone);
await copyFile("vendor/THREE-LICENSE.txt", "dist/THREE-LICENSE.txt");
await copyFile("assets/LICENSE.txt", "dist/ASSET-LICENSE.txt");
for (const file of ["Barlow-OFL.txt", "IBMPlexMono-OFL.txt"])
  await copyFile("assets/fonts/" + file, "dist/" + file);
console.log(
  "Built identical standalone and hosted HTML: " +
    Buffer.byteLength(standalone) +
    " bytes, including fonts; no runtime asset requests.",
);
