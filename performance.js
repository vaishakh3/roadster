/** A pixel budget, rather than a mandatory high device pixel ratio. */
export function renderRatio(
  width,
  height,
  deviceRatio,
  quality = "auto",
  coarse = false,
) {
  const dpr = Math.max(0.5, Number(deviceRatio) || 1);
  const budget =
    quality === "high"
      ? 3_200_000
      : quality === "low"
        ? 850_000
        : coarse
          ? 1_000_000
          : 1_800_000;
  const limit =
    quality === "high" ? 2 : quality === "low" ? 1 : coarse ? 1.25 : 1.5;
  return Math.max(
    0.6,
    Math.min(dpr, limit, Math.sqrt(budget / Math.max(1, width * height))),
  );
}
