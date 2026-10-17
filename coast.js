import * as THREE from "./vendor/three.module.js";
import {
  surfaces,
  roadMaterial,
  rockMaterial,
  pineMaterial,
  cityMaterial,
} from "./surfaces.js";
import {
  inGap,
  roadX as routeX,
  roadSlope as routeSlope,
  roadY as routeY,
} from "./run.js";
import { COURSES, hazardPose } from "./courses.js";

/** Each course owns its geometry, textures and lights, so changing arena releases GPU memory. */
export function createCoast(scene, renderer, course = COURSES[0]) {
  const root = new THREE.Group();
  scene.add(root);
  const night = course.theme === "port",
    canyon = course.theme === "canyon",
    coast = !night && !canyon;
  const roadX = (d) => routeX(d, course),
    roadSlope = (d) => routeSlope(d, course),
    roadY = (d) => routeY(d, course);
  const gap = (d) => inGap(d, course),
    length = course.length;
  scene.fog = new THREE.FogExp2(course.fog, night ? 0.00165 : 0.00085);
  scene.background = new THREE.Color(course.fog);
  scene.environment = surfaces.environment || null;
  scene.environmentIntensity = night ? 0.38 : canyon ? 0.75 : 0.85;
  scene.environmentRotation.set(0, canyon ? 1.1 : 0.4, 0);
  renderer.toneMappingExposure = night ? 0.95 : 0.94;
  const mat = (color, roughness = 0.8, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const concrete = mat(night ? 0x344653 : canyon ? 0x99795e : 0xc4cbc3),
    edge = mat(0xe4dcc8),
    dark = mat(0x12232b),
    orange = mat(0xf26832),
    metal = mat(night ? 0x35435e : 0x78908e, 0.4, 0.65),
    teal = mat(0x127b82),
    glow = new THREE.MeshBasicMaterial({ color: 0x8effe2 }),
    amber = new THREE.MeshBasicMaterial({ color: 0xffa55c }),
    violet = new THREE.MeshBasicMaterial({ color: 0xaf8cff });
  const asphalt = roadMaterial(night);
  const dynamics = new Set(),
    object = new THREE.Object3D();
  function mesh(g, m, parent = root) {
    const o = new THREE.Mesh(g, m);
    o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  function box(w, h, d, m, x = 0, y = 0, z = 0, parent = root) {
    const o = mesh(new THREE.BoxGeometry(w, h, d), m, parent);
    o.position.set(x, y, z);
    return o;
  }
  const worldPos = (d, x = 0, y = 0) =>
    new THREE.Vector3(roadX(d) + x, roadY(d) + y, -d);
  const groupAt = (d, x = 0) => {
    const g = new THREE.Group();
    g.position.copy(worldPos(d, x));
    g.rotation.y = -Math.atan(roadSlope(d));
    root.add(g);
    return g;
  };
  function beamBetween(a, b, r, m, parent = root) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const o = mesh(
      new THREE.CylinderGeometry(r, r, dir.length(), 6),
      m,
      parent,
    );
    o.position.copy(a).add(b).multiplyScalar(0.5);
    o.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.normalize(),
    );
    return o;
  }
  function ribbon(x1, x2, y, m, start = -110, end = length + 180, skip = true) {
    if (x1 > x2) [x1, x2] = [x2, x1];
    const pos = [],
      uvs = [],
      idx = [];
    let n = 0;
    for (let d = start; d < end; d += 4) {
      const e = Math.min(end, d + 4);
      if (skip && (gap(d + 0.01) || gap(e - 0.01))) continue;
      pos.push(
        roadX(d) + x1,
        roadY(d) + y,
        -d,
        roadX(d) + x2,
        roadY(d) + y,
        -d,
        roadX(e) + x1,
        roadY(e) + y,
        -e,
        roadX(e) + x2,
        roadY(e) + y,
        -e,
      );
      idx.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
      n += 4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    for (let i = 0; i < pos.length; i += 3)
      uvs.push(pos[i] * 0.25, pos[i + 2] * 0.25);
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return mesh(g, m);
  }
  function instances(g, m, items) {
    const out = new THREE.InstancedMesh(g, m, items.length);
    items.forEach((p, i) => {
      object.position.copy(
        p.absolute
          ? new THREE.Vector3(p.x, p.y, -p.d)
          : worldPos(p.d, p.x || 0, p.y || 0),
      );
      object.rotation.set(0, p.rotation ?? -Math.atan(roadSlope(p.d)), 0);
      object.scale.set(...(p.scale || [1, 1, 1]));
      object.updateMatrix();
      out.setMatrixAt(i, object.matrix);
      if (p.color) out.setColorAt(i, new THREE.Color(p.color));
    });
    out.computeBoundingSphere();
    out.receiveShadow = true;
    root.add(out);
    return out;
  }
  ribbon(-11, 11, -0.2, concrete);
  ribbon(-10, 10, 0, asphalt);
  for (const s of [-1, 1]) {
    ribbon(s * 9.15, s * 9.3, 0.025, edge);
    ribbon(s * 10.25, s * 10.8, 0.04, night ? violet : orange);
  }
  const studs = [],
    dash = [],
    rails = [],
    supports = [],
    posts = [];
  for (let d = -80; d < length + 150; d += 12)
    if (!gap(d)) {
      for (const s of [-1, 1]) {
        studs.push({ d, x: s * 9.7, y: 0.12 });
        posts.push({ d, x: s * 10.8, y: 0.5 });
      }
      if (!gap(d + 4))
        for (const s of [-1, 1]) dash.push({ d, x: s * 3.3, y: 0.025 });
    }
  for (let d = -80; d < length + 140; d += 8)
    if (!gap(d) && !gap(d + 8))
      for (const s of [-1, 1]) rails.push({ d: d + 4, x: s * 10.8, y: 0.8 });
  for (let d = 0; d < length; d += 55)
    if (!gap(d))
      for (const s of [-1, 1]) supports.push({ d, x: s * 7, y: -13.35 });
  instances(new THREE.BoxGeometry(0.16, 0.14, 0.6), night ? glow : edge, studs);
  instances(new THREE.BoxGeometry(0.1, 0.012, 4), edge, dash);
  instances(new THREE.BoxGeometry(0.13, 0.2, 8.08), metal, rails);
  instances(new THREE.BoxGeometry(0.14, 1, 0.14), metal, posts);
  instances(new THREE.BoxGeometry(2.3, 26, 4), concrete, supports);
  const curb = [],
    joints = [],
    lowerRail = [],
    bolts = [];
  for (let d = -80; d < length + 120; d += 4)
    if (!gap(d) && !gap(d + 4)) {
      for (const side of [-1, 1]) {
        curb.push({
          d: d + 2,
          x: side * 10.02,
          y: 0.055,
          color: Math.floor(d / 4) % 3 ? 0xb9b8a9 : 0x4a5355,
        });
        lowerRail.push({ d: d + 2, x: side * 10.8, y: 0.59 });
        if (d % 32 === 0) bolts.push({ d, x: side * 10.71, y: 0.81 });
      }
      if (d % 48 === 0) joints.push({ d, x: 0, y: 0.012 });
    }
  instances(new THREE.BoxGeometry(0.4, 0.12, 3.96), mat(0xffffff, 0.95), curb);
  instances(new THREE.BoxGeometry(20, 0.012, 0.055), dark, joints);
  instances(new THREE.BoxGeometry(0.12, 0.075, 4.02), metal, lowerRail);
  instances(new THREE.SphereGeometry(0.04, 6, 4), edge, bolts);
  // Riveted gantry gates stay distinct from dangerous amber obstacles.
  const gateMeshes = [];
  course.gates.forEach((g, i) => {
    const group = groupAt(g.d, g.x);
    group.position.y += g.y ? 6.3 : 3.3;
    dynamics.add(group);
    const rim = mesh(new THREE.TorusGeometry(3.25, 0.15, 5, 6), teal, group);
    rim.rotation.z = Math.PI / 6;
    const light = mesh(new THREE.TorusGeometry(3.22, 0.06, 4, 6), glow, group);
    light.rotation.z = Math.PI / 6;
    light.position.z = 0.19;
    for (let j = 0; j < 3; j++)
      box(0.26, 0.12, 0.16, glow, (j - 1) * 0.5, 3.1, 0.16, group);
    gateMeshes.push({ group, index: i });
  });
  const hazardMeshes = [];
  course.obstacles.forEach((o, i) => {
    const g = groupAt(o.d, o.x);
    dynamics.add(g);
    if (o.kind === "traffic") {
      box(2.6, 0.4, 6.7, dark, 0, 0.65, 0, g);
      box(2.65, 2.1, 4.7, night ? metal : concrete, 0, 1.9, 0.9, g);
      box(2.6, 1.55, 1.9, orange, 0, 1.55, -2.5, g);
      box(2.3, 0.66, 0.04, dark, 0, 2, -3.48, g);
      for (const s of [-1, 1]) {
        box(0.5, 0.19, 0.07, amber, s * 0.93, 1.1, 3.29, g);
        box(0.4, 0.23, 0.07, glow, s * 0.95, 1, -3.5, g);
        for (const z of [-2.3, 2.2]) {
          const wheel = mesh(
            new THREE.CylinderGeometry(0.55, 0.55, 0.3, 12),
            dark,
            g,
          );
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(s * 1.3, 0.55, z);
        }
        for (let k = 0; k < 6; k++)
          box(0.06, 1.85, 0.08, edge, s * 1.34, 1.9, -1.1 + k * 0.7, g);
      }
      box(1.5, 0.12, 0.3, amber, 0, 2.4, -2.1, g);
    } else if (o.kind === "gantry") {
      for (const s of [-1, 1]) box(0.7, 8.4, 0.8, orange, s * 10.2, 4.2, 0, g);
      box(20, 5.1, 2.5, metal, 0, 5.85, 0, g);
      box(20, 0.28, 2.6, amber, 0, 3.44, 0, g);
      for (let x = -9; x < 10; x += 1.25) {
        const stripe = box(0.4, 1.1, 0.03, orange, x, 4.05, 1.27, g);
        stripe.rotation.z = -0.5;
      }
      sign("LOW / 3.3 M", 0, 7.3, 1.3, g, 6, 1.25, "#ffbb68");
    } else {
      box(o.w, o.h, o.depth, orange, 0, o.h / 2, 0, g).castShadow = true;
      box(o.w + 0.12, 0.13, o.depth + 0.1, edge, 0, o.h + 0.04, 0, g);
      for (let x = -o.w / 2 + 0.3; x < o.w / 2; x += 0.9) {
        const stripe = box(
          0.3,
          o.h * 0.8,
          0.035,
          dark,
          x,
          o.h * 0.5,
          o.depth / 2 + 0.02,
          g,
        );
        stripe.rotation.z = -0.42;
      }
      for (const s of [-1, 1])
        box(0.25, 0.2, 0.3, amber, s * (o.w / 2 - 0.3), o.h + 0.3, 0, g);
      if (o.kind === "sweeper") {
        const track = groupAt(o.d);
        box(19, 0.06, 3, metal, 0, 0.04, 0, track);
        for (const s of [-1, 1]) {
          box(1, 2, 3, concrete, s * 11.7, 1, 0, track);
          box(0.5, 0.2, 0.7, amber, s * 11.7, 2.2, 0, track);
        }
      }
    }
    hazardMeshes.push({ g, o, i });
  });
  for (const gap of course.gaps) {
    for (let n = 0; n < 5; n++)
      ribbon(
        -8.6,
        8.6,
        0.035,
        orange,
        gap.start - 8 - n * 9,
        gap.start - 7 - n * 9,
        false,
      );
    for (const s of [-1, 1]) {
      const p = worldPos(gap.start - 2, s * 11.4);
      box(0.4, 6, 0.6, orange, p.x, p.y + 3, p.z);
      box(0.8, 0.25, 0.9, amber, p.x, p.y + 6, p.z);
    }
  }
  for (const p of course.pads) {
    ribbon(p.x - 2.7, p.x + 2.7, 0.045, teal, p.d - 18, p.d + 2, false);
    for (let k = 0; k < 5; k++)
      for (const s of [-1, 1]) {
        const g = groupAt(p.d - k * 3, p.x);
        const b = box(0.25, 0.025, 2.6, glow, s * 0.85, 0.07, 0, g);
        b.rotation.y = s * 0.65;
      }
  }
  for (const r of course.ramps) {
    const g = groupAt(r.d, r.x);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          -3.5, 0, 10, 3.5, 0, 10, -3.5, 1.5, 0, 3.5, 0, 10, 3.5, 1.5, 0, -3.5,
          1.5, 0,
        ],
        3,
      ),
    );
    geo.computeVertexNormals();
    mesh(geo, orange, g);
    for (const x of [-3.2, 3.2]) {
      const rail = box(0.15, 0.06, 10.1, amber, x, 0.79, 5, g);
      rail.rotation.x = 0.15;
    }
  }
  // Lettering is world geometry, readable while approaching at speed.
  function sign(text, x, y, z, parent, w = 15, h = 2.4, color = "#b6ffe3") {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 128;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#13232d";
    ctx.fillRect(0, 0, 1024, 128);
    ctx.fillStyle = color;
    ctx.font = "600 72px Barlow, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 512, 68);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshBasicMaterial({ map: tex });
    const o = mesh(new THREE.PlaneGeometry(w, h), m, parent);
    o.position.set(x, y, z);
    return o;
  }
  // Bridge towers and suspension cables frame the Atlantic, not every route.
  if (coast)
    for (const d of [110, 910, 1660, 2430, 3230]) {
      const g = groupAt(d);
      for (const s of [-1, 1]) {
        box(1.6, 58, 3, edge, s * 15, 17, 0, g).castShadow = true;
        box(0.22, 42, 0.22, orange, s * 15, 20, 1.6, g);
        for (const offset of [-100, -65, -32, 32, 65, 100]) {
          const a = new THREE.Vector3(s * 14.8, 44, 0),
            b = new THREE.Vector3(s * 10.8, 1, offset);
          beamBetween(a, b, 0.055, metal, g);
        }
      }
      box(31, 1.1, 3, edge, 0, 44, 0, g);
      sign(
        "ATLANTIC / " + String(Math.floor(d / 1200) + 1).padStart(2, "0"),
        0,
        12,
        1.65,
        g,
        13,
        1.6,
      );
    }
  let rockSurface;
  // Continuous eroded terrain: close cliffs, horizontal strata and distant ridgelines.
  if (!night) {
    const cols = 64,
      rows = 360,
      width = canyon ? 550 : 900;
    for (const side of [-1, 1]) {
      const pos = [],
        colors = [],
        idx = [],
        base = new THREE.Color(canyon ? 0x652918 : 0x334f50),
        top = new THREE.Color(canyon ? 0xbc7446 : 0x89937a);
      for (let j = 0; j <= rows; j++) {
        const d = -500 + (j * (length + 1800)) / rows;
        for (let i = 0; i <= cols; i++) {
          const t = i / cols,
            offset = (canyon ? 39 : 75) + t * width;
          const n =
            Math.sin(d * 0.012 + offset * 0.017) * 0.45 +
            Math.sin(d * 0.031 - offset * 0.036) * 0.2 +
            Math.sin(d * 0.069 + offset * 0.093) * 0.08;
          const ridge = Math.sin(d * 0.003 + side * 2) * 0.5 + 0.5;
          let y;
          if (canyon) {
            const rise = 1 - Math.exp(-t * 28);
            y = 8 + rise * (34 + ridge * 58 + n * 28) + Math.sin(t * 20) * 15;
            y +=
              Math.sin(d * 0.041 + offset * 0.13) * 3.2 +
              Math.sin(d * 0.13 - offset * 0.19) * 1.3;
          } else {
            const rise = Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.8);
            y = -14 + rise * (35 + ridge * 125 + n * 70);
            y +=
              Math.sin(d * 0.016) * 8 + Math.sin(d * 0.083 + offset * 0.12) * 3;
            if (side === 1) y = (y + 14) * 0.48 - 14;
          }
          const x =
            roadX(d) + side * (offset + Math.sin(d * 0.019) * 10 * (1 - t));
          pos.push(x, y, -d);
          const band = canyon
            ? 0.48 + 0.23 * Math.sin(y * 0.28) + n * 0.12
            : Math.min(1, Math.max(0, (y + 10) / 100));
          const c = base.clone().lerp(top, Math.min(1, Math.max(0, band)));
          const noise = 0.88 + 0.12 * Math.sin(d * 0.1 + i * 2.7);
          c.multiplyScalar(noise);
          colors.push(c.r, c.g, c.b);
        }
      }
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const a = j * (cols + 1) + i,
            b = a + 1,
            c = a + cols + 1,
            e = c + 1;
          if (side === 1) idx.push(a, c, b, b, c, e);
          else idx.push(a, b, c, b, e, c);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const rockMat = rockMaterial(canyon);
      rockSurface = rockMat;
      const terrain = mesh(g, rockMat);
      terrain.castShadow = true;
    }
    if (canyon) {
      const cactus = mat(0x465b3a);
      const plants = [];
      ribbon(-45, 45, -14, mat(0x80513a), -200, length + 300, false);
      for (const d of [600, 2010, 3340]) {
        const g = groupAt(d),
          curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(-42, -35, 0),
            new THREE.Vector3(-31, 27, 0),
            new THREE.Vector3(-22, 34, -2),
            new THREE.Vector3(-4, 36, -3),
            new THREE.Vector3(17, 32, 1),
            new THREE.Vector3(29, 22, 0),
            new THREE.Vector3(42, -35, 0),
          ]);
        const archGeometry = new THREE.TubeGeometry(curve, 100, 5.7, 24, false),
          vertices = archGeometry.attributes.position,
          colors = [];
        const stone = new THREE.Color(0x9e5936);
        for (let i = 0; i < vertices.count; i++) {
          const x = vertices.getX(i),
            y = vertices.getY(i),
            z = vertices.getZ(i);
          const n =
            Math.sin(x * 0.44 + y * 0.27 + z * 0.35) * 0.75 +
            Math.sin(x * 0.21 - y * 0.38) * 0.55;
          vertices.setXYZ(
            i,
            x + n * 1.3,
            y + n * 1.2 + Math.sin(x * 0.8 + z * 0.6) * 0.4,
            z * 1.8 + n * 0.85,
          );
          colors.push(stone.r, stone.g, stone.b);
        }
        archGeometry.setAttribute(
          "color",
          new THREE.Float32BufferAttribute(colors, 3),
        );
        archGeometry.computeVertexNormals();
        const arch = mesh(archGeometry, rockSurface, g);
        arch.castShadow = true;
      }

      for (let i = 0; i < 85; i++) {
        const d = i * 49,
          side = i % 2 ? 1 : -1;
        plants.push({
          d,
          x: side * (19 + (i % 5) * 3),
          y: -1,
          scale: [1, 1 + (i % 4) * 0.25, 1],
        });
      }
      instances(
        new THREE.CylinderGeometry(0.18, 0.27, 4.6, 5),
        cactus,
        plants.map((p) => ({ ...p, y: -11.7 })),
      );
      for (let i = 0; i < 20; i++) {
        const d = i * 210 + 180,
          g = groupAt(d, (i % 2 ? 1 : -1) * 23);
        g.position.y -= 14;
        box(0.32, 1.6, 0.32, cactus, 0.8, 2, 0, g);
        box(0.95, 0.3, 0.3, cactus, 0.42, 1.3, 0, g);
      }
    }
  }
  if (!night) {
    const geo = new THREE.IcosahedronGeometry(1, 3),
      p = geo.attributes.position,
      colors = [];
    const stoneColor = new THREE.Color(canyon ? 0x9b7252 : 0x687265);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i),
        n =
          1 + 0.14 * Math.sin(x * 8 + y * 7) + 0.08 * Math.sin(z * 11 - y * 9);
      p.setXYZ(i, x * n, y * n, z * n);
      colors.push(stoneColor.r, stoneColor.g, stoneColor.b);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const rocks = [];
    for (let i = 0; i < 430; i++) {
      const d = (i * (length + 400)) / 430 - 160,
        side = i % 2 ? 1 : -1,
        a = (Math.sin(i * 91.31) * 43758.54) % 1,
        n = Math.abs(a);
      const h = canyon ? 3 + n * 12 : 4 + n * 13,
        x = side * (canyon ? 24 + n * 18 : 58 + n * 40);
      rocks.push({
        d,
        x,
        y: canyon ? -14 + h * 0.62 : -roadY(d) - 5 + h * 0.35,
        rotation: i * 2.399,
        scale: [4 + n * 6, h, 5 + n * 10],
      });
    }
    const stoneMat = rockMaterial(canyon);
    for (let d = -300; d < length + 600; d += 300) {
      const items = rocks.filter((p) => p.d >= d && p.d < d + 300);
      if (items.length) instances(geo, stoneMat, items);
    }
    if (coast) {
      const crowns = [];
      for (let i = 0; i < 190; i++) {
        const d = i * 24 - 150,
          x = -92 - (i % 4) * 12,
          h = 6 + (i % 5) * 1.3;
        // Trees rooted on the first shoreline ridge, never over the track.
        const ground = 14 + Math.sin(d * 0.014) * 4;
        for (const rotation of [0, Math.PI * 0.5])
          crowns.push({
            d,
            x,
            y: ground - roadY(d) + h * 0.5,
            rotation,
            scale: [h * 0.55, h, 1],
          });
      }
      instances(new THREE.PlaneGeometry(1, 1), pineMaterial(), crowns);
    }
  }
  // Tunnel shells use actual open ends and low-clearance signs; the central view remains clear.
  for (const t of course.tunnels) {
    for (let d = t.start; d < t.end; d += 12) {
      const g = groupAt(d);
      box(3, 12, 12.1, concrete, -13, 5, 0, g);
      box(3, 12, 12.1, concrete, 13, 5, 0, g);
      box(29, 2, 12.1, concrete, 0, 12, 0, g);
      for (const s of [-1, 1])
        box(0.16, 0.14, 11.8, night ? violet : amber, s * 10, 9, 0, g);
    }
    const g = groupAt(t.start - 7);
    sign(
      night ? "DOCK ACCESS / KEEP LOW" : "MINE PASS / KEEP LOW",
      0,
      10,
      0,
      g,
      20,
      2,
      "#ffd08a",
    );
  }
  const rotors = [];
  if (coast)
    for (let i = 0; i < 13; i++) {
      const d = i * 285 + 100,
        x = roadX(d) + (i % 2 ? 1 : -1) * (170 + (i % 3) * 60),
        h = 65 + (i % 4) * 8;
      const tower = mesh(new THREE.CylinderGeometry(0.7, 2.2, h, 10), edge);
      tower.position.set(x, h / 2, -d);
      const r = new THREE.Group();
      r.position.set(x, h, -d);
      root.add(r);
      dynamics.add(r);
      rotors.push(r);
      mesh(new THREE.SphereGeometry(1.8, 12, 8), edge, r);
      for (let j = 0; j < 3; j++) {
        const a = new THREE.Group();
        r.add(a);
        a.rotation.z = (j * Math.PI * 2) / 3;
        const blade = box(1.5, 25, 0.3, edge, 0, 13, 0, a);
        blade.rotation.z = 0.06;
      }
    }
  // Container yards, cranes and a distant skyline establish scale in the freight arena.
  if (night) {
    const containers = [],
      ribs = [],
      yardLines = [],
      bollards = [];
    const apron = roadMaterial(false);
    apron.color.setHex(0x697681);
    apron.roughness = 0.68;
    const yardPaint = mat(0xa19a69, 0.9);
    for (const side of [-1, 1]) {
      ribbon(side * 12, side * 90, -0.35, apron, -100, length + 120, false);
      for (const x of [14, 38, 84])
        ribbon(
          side * (x - 0.06),
          side * (x + 0.06),
          -0.325,
          yardPaint,
          -100,
          length + 120,
          false,
        );
      for (let d = -80; d < length + 100; d += 25) {
        yardLines.push({ d: d - 7, x: side * 26, y: -0.32 });
        bollards.push({ d: d - 9, x: side * 16, y: 0.2 });
      }
    }
    instances(new THREE.BoxGeometry(20, 0.025, 0.12), yardPaint, yardLines);
    instances(
      new THREE.CylinderGeometry(0.12, 0.18, 1.1, 8),
      yardPaint,
      bollards,
    );
    for (const d of [380, 1710, 2910, 3880]) {
      const g = groupAt(d);
      for (const side of [-1, 1]) {
        box(1, 32, 2, metal, side * 18, 16, 0, g);
        for (let y = 4; y < 30; y += 5)
          beamBetween(
            new THREE.Vector3(side * 18 - 2, y, 0),
            new THREE.Vector3(side * 18 + 2, y + 5, 0),
            0.16,
            orange,
            g,
          );
      }
      box(40, 1.2, 3, metal, 0, 32, 0, g);
      box(39, 0.2, 0.2, violet, 0, 31, 1.6, g);
      sign("PACIFIC / FREIGHT", 0, 26, 1.6, g, 18, 2, "#b3a1ff");
    }

    for (let i = 0; i < 540; i++) {
      const d = (i % 180) * 25 - 60,
        side = i % 2 ? 1 : -1,
        tier = Math.floor(i / 180),
        x = side * (22 + (i % 3) * 5),
        y = 1.6 + tier * 3.2;
      containers.push({
        d,
        x,
        y,
        scale: [1, 1, 1],
        color: [0x2d6972, 0xb3673b, 0x606d92, 0x38485c][i % 4],
      });
      for (let k = 0; k < 7; k++)
        ribs.push({
          d: d - 5 + k * 1.7,
          x: x - side * 1.52,
          y,
          scale: [1, 1, 1],
        });
    }
    instances(
      new THREE.BoxGeometry(3, 3, 12),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.7,
        metalness: 0.2,
        emissive: 0x243c48,
        emissiveIntensity: 0.3,
      }),
      containers,
    );
    instances(new THREE.BoxGeometry(0.06, 2.85, 0.13), metal, ribs);
    const facade = cityMaterial();
    for (let i = 0; i < 32; i++) {
      const d = i * 145 - 200,
        side = i % 2 ? 1 : -1,
        x = side * (110 + (i % 5) * 38),
        h = 35 + (i % 6) * 16,
        g = groupAt(d, x);
      box(26, h, 35, facade, 0, h / 2 - 22, 0, g);
      box(20, 0.65, 29, dark, 0, h - 21.7, 0, g);
      box(7, 3, 5, metal, 6, h - 20, 7, g);
      if (i % 3 === 0) {
        box(26, 0.25, 35, violet, 0, h - 22, 0, g);
        sign(
          ["FREIGHT / 09", "PACIFIC LINE", "NIGHT TRANSIT"][i % 3],
          0,
          h - 27,
          17.6,
          g,
          22,
          3,
          "#90e8ed",
        );
      }
    }
    for (let i = 0; i < 9; i++) {
      const d = i * 480 + 200,
        g = groupAt(d, (i % 2 ? 1 : -1) * 58);
      for (const s of [-1, 1]) {
        box(2, 68, 3, orange, s * 14, 12, 0, g);
        beamBetween(
          new THREE.Vector3(s * 14, -18, 0),
          new THREE.Vector3(-s * 14, 43, 0),
          0.4,
          metal,
          g,
        );
      }
      box(95, 2.2, 3, orange, -12, 46, 0, g);
      box(10, 6, 7, metal, 0, 48, 0, g);
      box(0.15, 42, 0.15, metal, -40, 25, 0, g);
      box(8, 1, 4, orange, -40, 4, 0, g);
      for (let k = 0; k < 6; k++)
        box(0.8, 0.2, 0.6, violet, -50 + k * 14, 47.3, 0, g);
    }
    for (const d of [1500, 3050]) {
      const g = groupAt(d, 190);
      box(40, 18, 170, metal, 0, -17, 0, g);
      box(37, 2, 165, concrete, 0, -7, 0, g);
      box(24, 30, 28, edge, 0, 7, -60, g);
      for (let j = 0; j < 12; j++)
        box(
          12,
          6,
          22,
          j % 2 ? orange : teal,
          (j % 2 ? 1 : -1) * 8,
          -2 + Math.floor(j / 6) * 6,
          (j % 6) * 24 - 55,
          g,
        );
    }
  }
  if (night)
    for (let i = 0; i < 14; i++) {
      const g = groupAt(170 + i * 285, (i % 2 ? 1 : -1) * 60),
        wall = mat(0x35434c, 0.8, 0.15);
      box(30, 14, 58, wall, 0, 7, 0, g);
      for (let k = 0; k < 5; k++) {
        box(0.12, 9, 8, dark, (i % 2 ? -1 : 1) * 15.05, 4.5, -22 + k * 11, g);
        box(0.14, 0.25, 7, amber, (i % 2 ? -1 : 1) * 15.15, 9, -22 + k * 11, g);
        for (let y = 1; y < 9; y += 1.1)
          box(
            0.15,
            0.05,
            7,
            metal,
            (i % 2 ? -1 : 1) * 15.16,
            y,
            -22 + k * 11,
            g,
          );
      }
      const roof = box(32, 0.6, 61, metal, 0, 14, 0, g);
      roof.rotation.z = 0.07;
      box(32, 0.15, 0.15, amber, 0, 14.5, 30.5, g);
    }
  const lamps = [];
  for (let d = 30; d < length; d += night ? 60 : 125) {
    const s = Math.floor(d / 60) % 2 ? 1 : -1,
      g = groupAt(d, s * 12);
    box(0.22, 10, 0.22, metal, 0, 5, 0, g);
    box(3.4, 0.22, 0.3, metal, -s * 1.6, 10, 0, g);
    box(2.7, 0.07, 0.4, night ? violet : edge, -s * 1.6, 9.82, 0, g);
    if (night) {
      const glowPlane = mesh(
        new THREE.PlaneGeometry(12, 27),
        new THREE.MeshBasicMaterial({
          color: d % 120 ? 0x618eb2 : 0xa47df0,
          transparent: true,
          opacity: 0.055,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
        g,
      );
      glowPlane.rotation.x = -Math.PI / 2;
      glowPlane.position.set(-s * 6, 0.08, 0);
      lamps.push(glowPlane);
    }
  }
  // Atmospheric sky, clouds and a glancing water highlight, all local shaders.
  const sky = mesh(
    new THREE.SphereGeometry(7000, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uNight: { value: night ? 1 : 0 },
        skyScan: { value: surfaces.sky || null },
        hasScan: { value: surfaces.sky ? 1 : 0 },
        uDesert: { value: canyon ? 1 : 0 },
      },
      vertexShader:
        "varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: `varying vec3 p;uniform float uNight;uniform float uDesert;uniform sampler2D skyScan;uniform float hasScan;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}void main(){vec3 d=normalize(p);float h=max(0.,d.y);vec3 low=mix(vec3(.72,.79,.77),vec3(.85,.64,.45),uDesert);vec3 high=mix(vec3(.18,.38,.49),vec3(.25,.38,.47),uDesert);vec3 col=mix(low,high,smoothstep(0.,.7,h));vec2 uv=d.xz/(h+.15);float cloud=noise(uv*2.)*.55+noise(uv*5.)*.25+noise(uv*11.)*.15;col=mix(col,vec3(.88,.85,.73),smoothstep(.55,.75,cloud)*smoothstep(.03,.2,h)*.5);float glow=pow(max(0.,dot(d,normalize(vec3(-.6,.18,-1.)))),28.);col+=vec3(.35,.17,.02)*glow;vec3 nc=mix(vec3(.13,.21,.28),vec3(.015,.03,.075),smoothstep(0.,.7,h));float star=pow(hash(floor(d.xz/(h+.25)*1200.)),180.)*smoothstep(.12,.5,h);nc+=star*.6;if(hasScan>.5 && uNight<.5){vec2 uv=vec2(atan(d.z,d.x)/6.283185+.5,asin(clamp(d.y,-1.,1.))/3.141593+.5);uv.y=.76+clamp(d.y,0.,1.)*.23;vec3 realSky=texture2D(skyScan,uv).rgb;col=mix(col,realSky,smoothstep(.055,.24,d.y)*.88);}
    col=mix(col,nc,uNight);gl_FragColor=vec4(col,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
    }),
  );
  dynamics.add(sky);
  const disk = mesh(
    new THREE.CircleGeometry(night ? 65 : 115, 48),
    new THREE.MeshBasicMaterial({
      color: night ? 0xd5f2f1 : 0xffdc9d,
      fog: false,
    }),
  );
  dynamics.add(disk);
  const water = mesh(
    new THREE.PlaneGeometry(24000, 24000),
    new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, night: { value: night ? 1 : 0 } },
      vertexShader:
        "varying vec3 w;void main(){vec4 v=modelMatrix*vec4(position,1.);w=v.xyz;gl_Position=projectionMatrix*viewMatrix*v;}",
      fragmentShader: `varying vec3 w;uniform float time;uniform float night;void main(){vec2 p=w.xz;float a=sin(p.x*.075+p.y*.11+time*.8);float b=sin(p.x*.17-p.y*.09-time*.6);float c=sin(p.x*.4+p.y*.28+time);vec3 n=normalize(vec3(a*.22+b*.09,1.,b*.16+c*.045));vec3 v=normalize(cameraPosition-w);vec3 l=normalize(vec3(-.6,.23,-1.));float spec=pow(max(0.,dot(reflect(-l,n),v)),90.);float fres=pow(1.-max(0.,dot(n,v)),3.);vec3 color=mix(vec3(.025,.17,.21),vec3(.19,.36,.4),fres)+vec3(.8,.65,.4)*spec*.65;color=mix(color,color*.25+vec3(.01,.025,.045),night);float fog=1.-exp(-distance(cameraPosition.xz,p)*.0014);color=mix(color,mix(vec3(.61,.74,.76),vec3(.09,.15,.2),night),fog);gl_FragColor=vec4(color,1.);}`,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = canyon ? -30 : -1;
  dynamics.add(water);
  const hemi = new THREE.HemisphereLight(
    night ? 0x7fabc7 : 0xd5e9fa,
    canyon ? 0x8d6040 : 0x40555c,
    night ? 0.7 : 0.65,
  );
  root.add(hemi);
  const sun = new THREE.DirectionalLight(
    night ? 0x9fc3ef : 0xffdfac,
    night ? 1.5 : 3.6,
  );
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -26,
    right: 26,
    top: 36,
    bottom: -20,
    near: 1,
    far: 320,
  });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.05;
  root.add(sun, sun.target);
  const headlights = new THREE.PointLight(
    night ? 0xb5eaff : 0xffffff,
    night ? 3 : 0,
    22,
    1.5,
  );
  root.add(headlights);
  const dockLights = [];
  if (night)
    for (let i = 0; i < 3; i++) {
      const light = new THREE.PointLight(
        i % 2 ? 0x9f71ff : 0x63d6e4,
        18,
        58,
        1.3,
      );
      root.add(light);
      dockLights.push(light);
    }
  let rain;
  if (night) {
    const p = [];
    for (let i = 0; i < 340; i++) {
      const x = Math.sin(i * 127.1) * 45,
        z = Math.sin(i * 311.7) * 75 - 40,
        y = ((i * 0.618) % 1) * 45;
      p.push(x, y, z, x - 0.07, y + 0.8, z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    rain = new THREE.LineSegments(
      geometry,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { time: { value: 0 } },
        vertexShader:
          "uniform float time;varying float fade;void main(){vec3 p=position;p.y=mod(p.y-time*22.,45.);fade=1.-abs(p.z+20.)/100.;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}",
        fragmentShader:
          "varying float fade;void main(){gl_FragColor=vec4(.45,.7,.85,.13*fade);}",
      }),
    );
    root.add(rain);
    dynamics.add(rain);
    rain.frustumCulled = false;
  }
  const finish = groupAt(length);
  box(24, 1.6, 1, orange, 0, 10, 0, finish);
  for (const s of [-1, 1]) box(1.1, 10, 1.1, orange, s * 12, 5, 0, finish);
  sign("FINISH / " + course.name, 0, 10, 0.56, finish, 20, 1.3);
  for (let i = 0; i < 24; i++)
    ribbon(
      -10 + (i * 20) / 24,
      -10 + ((i + 1) * 20) / 24,
      0.045,
      i % 2 ? edge : dark,
      length,
      length + 3,
      false,
    );
  let beamGroup;
  if (coast) {
    const d = length + 155,
      x = roadX(d);
    const base = mesh(new THREE.CylinderGeometry(65, 100, 35, 24), concrete);
    base.position.set(x, -2, -d);
    const tower = mesh(new THREE.CylinderGeometry(5, 10, 95, 24), edge);
    tower.position.set(x, 63, -d);
    for (const y of [45, 68, 91]) {
      const b = mesh(
        new THREE.CylinderGeometry(
          10 - (y - 16) * 0.053,
          10 - (y - 16) * 0.053,
          7,
          24,
        ),
        orange,
      );
      b.position.set(x, y, -d);
    }
    const lantern = mesh(new THREE.CylinderGeometry(7.5, 7.5, 7, 16), amber);
    lantern.position.set(x, 114, -d);
    const roof = mesh(new THREE.ConeGeometry(10, 7, 16), dark);
    roof.position.set(x, 122, -d);
    beamGroup = new THREE.Group();
    beamGroup.position.set(x, 114, -d);
    root.add(beamGroup);
    dynamics.add(beamGroup);
    const beam = mesh(
      new THREE.ConeGeometry(22, 380, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd793,
        transparent: true,
        opacity: 0.045,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
      beamGroup,
    );
    beam.rotation.z = Math.PI / 2;
    beam.position.x = 190;
  }
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d"),
    gradient = ctx.createRadialGradient(64, 64, 5, 64, 64, 62);
  gradient.addColorStop(0, "rgba(0,5,10,.7)");
  gradient.addColorStop(1, "rgba(0,5,10,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const shadow = mesh(
    new THREE.PlaneGeometry(4.2, 6.7),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  dynamics.add(shadow);
  const trails = [];
  for (const s of [-1, 1]) {
    const t = mesh(
      new THREE.PlaneGeometry(0.16, 13),
      new THREE.MeshBasicMaterial({
        color: 0x9dffe2,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    t.rotation.x = -Math.PI / 2;
    dynamics.add(t);
    trails.push({ t, s });
  }
  const particlePool = Array.from({ length: 96 }, () => ({
    life: 0,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
  }));
  let particleCursor = 0;
  const sparks = new THREE.InstancedMesh(
    new THREE.TetrahedronGeometry(0.1),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    particlePool.length,
  );
  sparks.frustumCulled = false;
  root.add(sparks);
  for (let i = 0; i < particlePool.length; i++) {
    object.scale.setScalar(0);
    object.updateMatrix();
    sparks.setMatrixAt(i, object.matrix);
    sparks.setColorAt(i, new THREE.Color(0x9cffe2));
  }
  function emit(type, s) {
    if (!["hit", "gate", "land", "pad", "launch"].includes(type)) return;
    const count = type === "hit" ? 26 : 18;
    for (let i = 0; i < count; i++) {
      const index = particleCursor++ % particlePool.length,
        p = particlePool[index],
        angle = (i / count) * Math.PI * 2;
      p.life = 0.55 + (i % 5) * 0.06;
      p.total = p.life;
      p.pos.copy(worldPos(s.d, s.x, s.y + 0.5));
      p.vel.set(
        Math.cos(angle) * (type === "hit" ? 8 : 5),
        2 + (i % 4) * 1.4,
        Math.sin(angle) * 4 + s.speed * 0.3,
      );
      sparks.setColorAt(
        index,
        new THREE.Color(
          type === "hit"
            ? 0xffb34e
            : type === "land" || type === "launch"
              ? 0xbb9a77
              : 0x8affdf,
        ),
      );
    }
    sparks.instanceColor.needsUpdate = true;
  }
  // Dynamic objects rotate/move as a unit; merge their repeated trim locally.
  root.updateMatrixWorld(true);
  for (const parent of [
    ...gateMeshes.map((g) => g.group),
    ...hazardMeshes.map((h) => h.g),
    ...rotors,
  ]) {
    const groups = new Map(),
      inverse = parent.matrixWorld.clone().invert();
    parent.traverse((o) => {
      if (o.isMesh && !o.material.map) {
        if (!groups.has(o.material)) groups.set(o.material, []);
        groups.get(o.material).push(o);
      }
    });
    for (const [material, parts] of groups) {
      if (parts.length < 2) continue;
      const positions = [],
        normals = [];
      for (const part of parts) {
        const g = part.geometry.index
          ? part.geometry.toNonIndexed()
          : part.geometry.clone();
        g.applyMatrix4(inverse.clone().multiply(part.matrixWorld));
        positions.push(...g.attributes.position.array);
        normals.push(...g.attributes.normal.array);
        g.dispose();
        part.geometry.dispose();
        part.removeFromParent();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
      mesh(g, material, parent).castShadow = true;
    }
  }
  // Merge rigid untextured parts by material AND 300 m district; far districts are culled.
  const batches = new Map();
  root.updateMatrixWorld(true);
  function gather(o) {
    if (dynamics.has(o) || o.isInstancedMesh) return;
    if (
      o.isMesh &&
      !o.material.isShaderMaterial &&
      !o.material.vertexColors &&
      !o.material.map
    ) {
      const key =
        o.material.uuid +
        "/" +
        Math.floor(-o.getWorldPosition(new THREE.Vector3()).z / 300);
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(o);
    }
    for (const c of o.children) gather(c);
  }
  gather(root);
  for (const parts of batches.values()) {
    if (parts.length < 2) continue;
    let count = 0;
    const gs = parts.map((p) => {
      const g = p.geometry.index
        ? p.geometry.toNonIndexed()
        : p.geometry.clone();
      g.applyMatrix4(p.matrixWorld);
      count += g.attributes.position.count;
      return g;
    });
    const positions = new Float32Array(count * 3),
      normals = new Float32Array(count * 3);
    let offset = 0;
    for (const g of gs) {
      positions.set(g.attributes.position.array, offset);
      normals.set(g.attributes.normal.array, offset);
      offset += g.attributes.position.array.length;
      g.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    g.computeBoundingSphere();
    const m = parts[0].material;
    for (const p of parts) {
      p.removeFromParent();
      p.geometry.dispose();
    }
    mesh(g, m).castShadow = true;
  }
  const districts = [];
  root.updateMatrixWorld(true);
  for (const o of root.children) {
    if (dynamics.has(o) || o.isLight) continue;
    const bounds = new THREE.Box3().setFromObject(o);
    if (!bounds.isEmpty() && bounds.max.z - bounds.min.z < 900)
      districts.push({ o, start: -bounds.max.z, end: -bounds.min.z });
  }
  return {
    root,
    sun,
    gateMeshes,
    worldPos,
    ROAD_Y: 22,
    roadY,
    emit,
    setQuality(low) {
      renderer.shadowMap.enabled = true;
      sun.castShadow = true;
      const size = low ? 1024 : 2048;
      if (sun.shadow.mapSize.x !== size) {
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
        sun.shadow.mapSize.set(size, size);
      }
    },
    update(s, dt, time) {
      for (const b of districts)
        b.o.visible =
          b.end > s.d - 180 && b.start < s.d + (night ? 1100 : 1400);
      for (let i = 0; i < particlePool.length; i++) {
        const p = particlePool[i];
        p.life = Math.max(0, p.life - dt);
        if (p.life) {
          p.vel.y -= 8 * dt;
          p.pos.addScaledVector(p.vel, dt);
          object.position.copy(p.pos);
          object.scale.setScalar((p.life / p.total) * (s.speed > 65 ? 1.5 : 1));
          object.rotation.set(time * 5 + i, time * 3, 0);
        } else object.scale.setScalar(0);
        object.updateMatrix();
        sparks.setMatrixAt(i, object.matrix);
      }
      sparks.instanceMatrix.needsUpdate = true;
      const x = roadX(s.d) + s.x,
        y = roadY(s.d);
      water.material.uniforms.time.value = time;
      sky.position.set(x, 0, -s.d);
      disk.position.set(x - 1800, night ? 1600 : 1050, -s.d - 6500);
      rotors.forEach(
        (r, i) => (r.rotation.z = time * (0.17 + (i % 3) * 0.025)),
      );
      if (beamGroup) beamGroup.rotation.y = time * 0.17;
      sun.position.set(x - 65, y + 85, -s.d - 65);
      sun.target.position.set(x, y, -s.d - 20);
      headlights.position.set(x, y + 2, -s.d - 6);
      dockLights.forEach((l, i) => {
        const d = Math.floor(s.d / 60) * 60 + 30 + i * 60,
          side = i % 2 ? 1 : -1;
        l.position.copy(worldPos(d, side * 10, 8));
      });
      if (rain) {
        rain.position.set(x, y, -s.d);
        rain.material.uniforms.time.value = time;
      }
      shadow.position.set(x, y + 0.055, -s.d);
      shadow.visible = !gap(s.d);
      shadow.material.opacity = Math.max(0.06, 0.64 - s.y / 12);
      shadow.rotation.z = Math.atan(roadSlope(s.d));
      shadow.scale.setScalar(1 + s.y * 0.06);
      for (const { t, s: side } of trails) {
        t.visible = s.boosting || s.padTime > 0;
        t.position.set(x + side * 0.9, y + s.y + 0.45, -s.d + 8);
      }
      for (const { group, index } of gateMeshes) {
        group.visible =
          !s.processed.has("g" + index) &&
          Math.abs(course.gates[index].d - s.d) < 700;
        group.rotation.z = Math.sin(time * 1.3 + index) * 0.02;
      }
      for (const { g, o } of hazardMeshes) {
        const p = hazardPose(o, s.time);
        g.position.copy(worldPos(p.d, p.x));
        g.rotation.y = -Math.atan(roadSlope(p.d));
        g.visible = p.d > s.d - 30 && p.d < s.d + 650;
      }
    },
    dispose() {
      const gs = new Set(),
        ms = new Set(),
        textures = new Set();
      root.traverse((o) => {
        if (o.geometry) gs.add(o.geometry);
        if (o.isInstancedMesh) o.dispose();
        if (o.material)
          for (const m of Array.isArray(o.material)
            ? o.material
            : [o.material]) {
            ms.add(m);
            for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
          }
      });
      for (const g of gs) g.dispose();
      for (const m of ms) m.dispose();
      for (const t of textures) if (!t.userData.shared) t.dispose();
      sun.shadow.map?.dispose();
      root.removeFromParent();
    },
  };
}
