/** Authored routes. All three are available immediately; mastery earns paint finishes. */
const barrier = (d, x, w = 5.5) => ({
  d,
  x,
  w,
  kind: "barrier",
  h: 1.65,
  depth: 2.7,
});
const truck = (d, x, speed = 9) => ({
  d,
  x,
  w: 2.7,
  kind: "traffic",
  h: 2.7,
  depth: 6.8,
  speed,
});
const sweep = (d, phase = 0) => ({
  d,
  x: 0,
  w: 4.2,
  kind: "sweeper",
  h: 2,
  depth: 2.2,
  amplitude: 5.1,
  frequency: 0.7,
  phase,
});
const beam = (d) => ({
  d,
  x: 0,
  w: 20,
  kind: "gantry",
  h: 8.4,
  bottom: 3.3,
  depth: 2.5,
});
const cargo = (d, x = 0) => ({
  d,
  x,
  w: 5.2,
  kind: "cargo",
  h: 3.8,
  depth: 3.6,
  amplitude: 3.5,
  frequency: 0.42,
  phase: d * 0.01,
  bottom: 0,
});
const rubble = (d, x) => ({ d, x, w: 5.8, kind: "rubble", h: 2.2, depth: 5 });
const drum = (d, x) => ({ d, x, w: 4.5, kind: "drums", h: 1.4, depth: 3 });
const gates = (list) => list.map(([d, x, y = 0]) => ({ d, x, y }));
export const COURSES = [
  {
    id: "breakwater",
    name: "BREAKWATER",
    title: ["BREAK", "WATER"],
    number: "01",
    location: "NORTH ATLANTIC",
    subtitle: "The road ends. Your run doesn’t.",
    description:
      "Cross the open ocean. Thread the traffic. Fly five broken bridges to the lighthouse.",
    theme: "coast",
    length: 3600,
    difficulty: "FLOW",
    tags: "SEA BRIDGES / GRIP RAMPS / FLIGHT",
    sectors: ["THE CAUSEWAY", "OPEN WATER", "THE LAST LIGHT"],
    gold: 65,
    silver: 76,
    goldGates: 12,
    curve: [58, 285, 78, 710],
    elevation: [1.8, 390, 1.2, 180],
    accent: "#ff8255",
    fog: 0x9bbdc2,
    gaps: [
      { start: 660, end: 725 },
      { start: 1430, end: 1525 },
      { start: 2190, end: 2300 },
      { start: 2960, end: 3090 },
    ],
    obstacles: [
      barrier(310, -4.4),
      barrier(490, 4.5),
      truck(610, -4.7, 8),
      drum(1160, -4.5),
      sweep(1330, 1),
      barrier(1740, 4.5, 6.5),
      truck(1530, 4.8, 8),
      drum(1950, -4),
      barrier(2500, 0, 7),
      sweep(2720, 3),
      barrier(3280, 4.5, 6),
      barrier(3470, -4.5, 6),
    ],
    gates: gates([
      [180, 0],
      [405, 3.5],
      [695, 0, 9.8],
      [855, -3.5],
      [1070, 3.8],
      [1240, 3.8],
      [1475, 0, 18.6],
      [1640, -3.8],
      [1840, -3.8],
      [2080, 3.8],
      [2240, 0, 12.4],
      [2400, 3.8],
      [2600, -3.8],
      [2830, 3.5],
      [3020, 0, 16.1],
      [3170, -3.8],
      [3360, -3.8],
      [3540, 0],
    ]),
    pads: [
      { d: 525, x: -4.7 },
      { d: 2010, x: 3.8 },
    ],
    ramps: [
      {
        d: 646,
        x: 0,
        length: 62,
        height: 6,
        width: 8,
        land: 765,
        stunt: "flip",
      },
      {
        d: 1418,
        x: 0,
        length: 90,
        height: 18,
        width: 8,
        land: 1565,
        stunt: "flip",
      },
      {
        d: 2178,
        x: 0,
        length: 68,
        height: 9,
        width: 8,
        land: 2340,
        stunt: "roll",
      },
      {
        d: 2948,
        x: 0,
        length: 88,
        height: 14,
        width: 8,
        land: 3130,
        stunt: "flip",
      },
    ],
    tunnels: [],
  },
  {
    id: "redshift",
    name: "REDSHIFT",
    title: ["RED", "SHIFT"],
    number: "02",
    location: "SONORA / BADLANDS",
    subtitle: "Cut through the canyon.",
    description:
      "Carve between sandstone walls. Hit the launch ramps. Drop beneath the mine gantries.",
    theme: "canyon",
    length: 3900,
    difficulty: "TECHNICAL",
    tags: "CANYON / LAUNCH RAMPS / LOW CLEARANCE",
    sectors: ["DUST VALLEY", "THE NARROWS", "SUNSET RIDGE"],
    gold: 73,
    silver: 86,
    goldGates: 13,
    curve: [82, 245, 72, 620],
    elevation: [5, 360, 2, 160],
    accent: "#ffc46b",
    fog: 0xc79a74,
    gaps: [
      { start: 830, end: 920 },
      { start: 1840, end: 1950 },
      { start: 2970, end: 3100 },
    ],
    obstacles: [
      barrier(300, 4.5),
      sweep(520, 2),
      beam(1130),
      rubble(1370, -4.5),
      truck(1320, -4.8, 6),
      sweep(1660, 1),
      beam(2180),
      rubble(2400, 0),
      sweep(2650, 3),
      rubble(3260, 4.7),
      beam(3460),
      barrier(3700, -4.8, 6),
    ],
    gates: gates([
      [180, -3.5],
      [410, -3.5],
      [640, 3.8],
      [875, 0, 10.4],
      [1020, 3.5],
      [1210, -3.7],
      [1470, 3.8],
      [1760, 0, 7.3],
      [1890, 0, 24.4],
      [2040, 3.7],
      [2260, -3.5],
      [2510, 3.7],
      [2790, 0],
      [3030, 0, 18.4],
      [3160, -3.7],
      [3350, -3.8],
      [3550, 3.7],
      [3810, 0],
    ]),
    pads: [
      { d: 710, x: 0 },
      { d: 2810, x: 0 },
    ],
    ramps: [
      {
        d: 795,
        x: 0,
        length: 65,
        height: 7,
        width: 8,
        land: 960,
        stunt: "flip",
      },
      {
        d: 1805,
        x: 0,
        length: 100,
        height: 24,
        width: 8,
        land: 1990,
        stunt: "flip",
      },
      {
        d: 2935,
        x: 0,
        length: 90,
        height: 15,
        width: 8,
        land: 3140,
        stunt: "roll",
      },
    ],
    tunnels: [
      { start: 1080, end: 1230 },
      { start: 2130, end: 2280 },
      { start: 3410, end: 3560 },
    ],
  },
  {
    id: "nightshift",
    name: "NIGHTSHIFT",
    title: ["NIGHT", "SHIFT"],
    number: "03",
    location: "PACIFIC / FREIGHT TERMINAL",
    subtitle: "Own the after hours.",
    description:
      "Weave through freight traffic. Read the moving barriers. Clear the dock before daybreak.",
    theme: "port",
    length: 4200,
    difficulty: "PRECISION",
    tags: "FREIGHT / SWINGING CARGO / SKY RAMPS",
    sectors: ["THE CONTAINER MILE", "DRY DOCK", "CITY LIMITS"],
    gold: 80,
    silver: 94,
    goldGates: 14,
    curve: [46, 230, 85, 730],
    elevation: [1, 410, 0.6, 170],
    accent: "#b6a2ff",
    fog: 0x172734,
    gaps: [
      { start: 1020, end: 1115 },
      { start: 2420, end: 2540 },
      { start: 3470, end: 3600 },
    ],
    obstacles: [
      truck(270, -4.5, 9),
      barrier(510, 4.5, 6),
      sweep(730, 1),
      truck(1135, 4.8, 9),
      beam(1370),
      barrier(1580, -4.6, 6.5),
      cargo(1810),
      truck(1870, -4.7, 6),
      barrier(2220, 4.5, 6),
      beam(2740),
      cargo(2930),
      barrier(3140, 0, 6.5),
      truck(3220, 4.7, 9),
      sweep(3790, 4),
      drum(3990, -4.5),
    ],
    gates: gates([
      [180, 3.5],
      [430, 3.7],
      [620, -3.5],
      [880, 0],
      [1060, 0, 11.3],
      [1220, -3.8],
      [1460, 3.8],
      [1690, 3.5],
      [1950, 0],
      [2110, -3.5],
      [2310, -3.5],
      [2480, 0, 21],
      [2630, 3.8],
      [2820, -3.8],
      [3040, 3.7],
      [3290, -3.8],
      [3530, 0, 15.7],
      [3670, -3.5],
      [3900, 3.7],
      [4120, 0],
    ]),
    pads: [
      { d: 900, x: 0 },
      { d: 2325, x: -3.5 },
      { d: 3350, x: 0 },
    ],
    ramps: [
      {
        d: 1008,
        x: 0,
        length: 65,
        height: 7,
        width: 8,
        land: 1155,
        stunt: "flip",
      },
      {
        d: 2408,
        x: 0,
        length: 92,
        height: 20,
        width: 8,
        land: 2580,
        stunt: "flip",
      },
      {
        d: 3458,
        x: 0,
        length: 85,
        height: 13,
        width: 8,
        land: 3640,
        stunt: "roll",
      },
    ],
    tunnels: [
      { start: 1310, end: 1450 },
      { start: 2690, end: 2820 },
    ],
  },
];
// An additional authored 1.8 km final leg: recovery, slalom, sky ramp and
// a last technical sequence. Existing stunt dimensions remain unchanged.
for (const c of COURSES) {
  const end = c.length;
  c.length += 1800;
  c.gold += 32;
  c.silver += 39;
  c.goldGates += 5;
  c.gaps.push({ start: end + 810, end: end + 925 });
  c.ramps.push({
    d: end + 790,
    x: 0,
    length: 76,
    height: 10,
    width: 8,
    land: end + 970,
    stunt: c.theme === "port" ? "roll" : "flip",
  });
  c.pads.push({ d: end + 650, x: 0 }, { d: end + 1500, x: 3.7 });
  c.gates.push(
    ...gates([
      [end + 150, 0],
      [end + 440, -3.7],
      [end + 610, 0],
      [end + 850, 0, 14.5],
      [end + 1050, 3.7],
      [end + 1280, -3.7],
      [end + 1480, 3.7],
      [end + 1720, 0],
    ]),
  );
  c.obstacles.push(
    c.theme === "canyon" ? rubble(end + 310, 4.5) : drum(end + 310, 4.5),
    barrier(end + 530, -4.6),
    c.theme === "coast" ? sweep(end + 1170, 2) : beam(end + 1170),
    c.theme === "port" ? cargo(end + 1370) : rubble(end + 1370, -4.6),
    barrier(end + 1610, 4.7, 5.5),
  );
  if (c.theme !== "coast")
    c.tunnels.push({ start: end + 1120, end: end + 1220 });
}
for (const c of COURSES)
  for (const o of c.obstacles)
    if (o.speed) {
      o.pathEnd = (c.gaps.find((g) => g.start > o.d)?.start || c.length) - 40;
    }
export const getCourse = (id) => COURSES.find((c) => c.id === id) || COURSES[0];
export function hazardPose(o, time) {
  return {
    d: Math.min(o.pathEnd ?? Infinity, o.d + (o.speed || 0) * time),
    x:
      o.x +
      (o.amplitude || 0) * Math.sin(time * (o.frequency || 0) + (o.phase || 0)),
  };
}
export const PAINTS = [
  { name: "PEARL", color: 0xf1f1e9, required: 0 },
  { name: "SOLAR", color: 0xe95126, required: 1 },
  { name: "GLACIER", color: 0x5cc6c9, required: 2 },
  { name: "MIDNIGHT", color: 0x373a55, required: 3 },
];
export function badgesFor(s) {
  return [
    s.finished,
    s.finished && s.hull === 3,
    s.finished && s.gates === s.course.gates.length,
  ];
}
export const LAYOUT_VERSION = 3;
export function saveResult(records, s, ghost = []) {
  if (!s.finished) return { records, record: false };
  const old = records[s.course.id] || {},
    sameLayout = old.layout === LAYOUT_VERSION,
    faster = !sameLayout || !old.time || s.time < old.time;
  const badges = badgesFor(s).map((value, i) => value || !!old.badges?.[i]);
  const medal =
    s.time <= s.course.gold && s.gates >= s.course.goldGates
      ? 3
      : s.time <= s.course.silver && s.gates >= 8
        ? 2
        : 1;
  return {
    record: !sameLayout || !old.score || s.score > old.score,
    records: {
      ...records,
      [s.course.id]: {
        layout: LAYOUT_VERSION,
        time: faster ? s.time : old.time,
        score: Math.max(sameLayout ? old.score || 0 : 0, s.score),
        medal: Math.max(old.medal || 0, medal),
        badges,
        ghost: faster ? ghost : old.ghost || [],
      },
    },
  };
}
export const completedCount = (records) =>
  COURSES.filter((c) => records[c.id]?.medal > 0).length;
