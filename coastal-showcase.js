import * as THREE from "./vendor/three.module.js";
import { noise, terrainHeight } from "./terrain.js";
import { treeCrownGeometry, treeTrunkGeometry } from "./tree-geometry.js";
import {
  coastalRockMaterial,
  foliageMaterial,
  barkMaterial,
} from "./surfaces.js";

/**
 * A 500 m, fully three-dimensional North Atlantic road cutting.
 * Geometry is authored in route coordinates; no scenery changes the race mesh.
 * Five material-batched tiles share tree/groundcover geometry. The section adds
 * no lights, render targets, network requests or per-frame geometry allocation.
 */
export function createCoastalShowcase({ root, course, roadX, roadY }) {
  const START = 760,
    END = 1260,
    TILE = 100;
  const group = new THREE.Group();
  group.name = "Coastal showcase / slate cutting";
  root.add(group);
  const geometries = new Set(),
    materials = new Set(),
    tiles = [];
  const ownGeometry = (g) => (geometries.add(g), g);
  const ownMaterial = (m) => (materials.add(m), m);
  const stone = ownMaterial(
    coastalRockMaterial({ vertexColors: true, bakedAO: true }),
  );
  stone.color.setHex(0xffffff);
  stone.envMapIntensity = 0.22;
  const leaves = ownMaterial(foliageMaterial());
  leaves.color.setHex(0xb9c5ae);
  const bark = ownMaterial(barkMaterial());
  const grass = ownMaterial(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 1,
      envMapIntensity: 0.15,
    }),
  );
  const concrete = ownMaterial(
    new THREE.MeshStandardMaterial({
      color: 0x8f9388,
      vertexColors: true,
      roughness: 0.95,
      envMapIntensity: 0.2,
    }),
  );
  const iron = ownMaterial(
    new THREE.MeshStandardMaterial({
      color: 0x727b78,
      roughness: 0.61,
      metalness: 0.65,
      envMapIntensity: 0.5,
    }),
  );
  const foam = ownMaterial(
    new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv;varying vec3 vWorld;
      void main(){vUv=uv;vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;
      gl_Position=projectionMatrix*viewMatrix*p;}`,
      fragmentShader: `uniform float time;varying vec2 vUv;varying vec3 vWorld;
      void main(){
        float grain=sin(vWorld.x*2.83+vWorld.z*1.79)*sin(vWorld.z*3.31-vWorld.x*1.47);
        float swell=.5+.5*sin(vWorld.x*.53+vWorld.z*.37-time*.8);
        float edge=1.-smoothstep(.13,.94,vUv.y);
        float broken=smoothstep(-.23,.35,grain+sin(vUv.x*97.)*.5);
        float alpha=edge*(.17+broken*.43)*(.65+swell*.35);
        if(alpha<.025)discard;
        gl_FragColor=vec4(vec3(.62,.72,.70),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    }),
  );
  const hash = (n) => {
    const x = Math.sin(n * 127.1 + 32.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const smooth = (x) => {
    x = THREE.MathUtils.clamp(x, 0, 1);
    return x * x * (3 - 2 * x);
  };
  const sectionWeight = (d) =>
    smooth((d - START) / 48) * smooth((END - d) / 58);
  const profiles = [
    [11.08, -0.42],
    [16.1, -0.32],
    [18.3, 1.6],
    [20.2, 4.7],
    [21.6, 10.2],
    [23.8, 10.5],
    [25.2, 16.7],
    [28.3, 16.4],
    [31.3, 21.3],
    [35.8, 20.8],
    [41.2, 25.2],
    [48.4, 26.4],
    [58, 25.1],
    [72, 23.8],
    [91, 20.2],
    [118, 16],
    [156, 9],
    [208, 0],
  ];
  // Two projecting headlands and a sheltered recessed cove give the cutting a
  // landscape-scale rhythm. Interpolation is shared by every LOD and tile.
  const headlands = [
    [760, 0.5, 14],
    [805, 0.76, 12],
    [855, 0.59, 1],
    [910, 0.83, 19],
    [970, 0.4, 47],
    [1030, 0.64, 31],
    [1090, 0.59, 8],
    [1150, 0.61, 0],
    [1210, 0.77, 17],
    [1260, 0.48, 24],
  ];
  function landform(d) {
    let i = 0;
    while (i < headlands.length - 2 && headlands[i + 1][0] < d) i++;
    const a = headlands[i],
      b = headlands[i + 1],
      t = smooth((d - a[0]) / (b[0] - a[0]));
    return {
      height: THREE.MathUtils.lerp(a[1], b[1], t),
      setback: THREE.MathUtils.lerp(a[2], b[2], t),
    };
  }
  function profile(d, row) {
    const [offset, height] = profiles[row];
    // The apron meets the paved verge at a stable elevation. Cliff undulation
    // must not lift these first rows into a floating ribbon above the road.
    if (row < 2)
      return new THREE.Vector3(roadX(d) - offset, roadY(d) + height, -d);
    const w = sectionWeight(d),
      form = landform(d);
    const ledge = row > 1 && row < 11;
    const undulation =
      noise(d * 0.012, 8.7) * 6.8 + noise(d * 0.039, 2.1) * 1.6;
    const joint = Math.pow(Math.max(0, 1 - Math.abs(noise(d * 0.086, 7.1))), 7);
    const layer = [0, 0, 1, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8, 9, 10, 11, 12, 13][
      row
    ];
    const fracture = noise(d * 0.14, layer * 0.51) * 0.23;
    // Broad fault blocks interrupt the road-cut benches. They are deliberately
    // independent of the fine scan: geology has a readable 15–40 m scale.
    const fault = noise(d * 0.029, layer * 0.45);
    const x =
      offset +
      form.setback * smooth((row - 1) / 4) * smooth((17 - row) / 3) +
      w *
        (row < 2
          ? 0
          : undulation * smooth((row - 1) / 5) +
            (ledge ? fracture * 0.9 + fault * 0.9 : 0));
    const base = terrainHeight(d, x, -1, false, roadY);
    // Back of the ridge joins the continuous landscape. All foreground edges
    // close into terrain; a flight view never reveals a cardboard cliff face.
    const backing = smooth((208 - offset) / 78);
    const ridgeY =
      roadY(d) +
      height * form.height +
      undulation * 0.55 +
      (ledge
        ? fracture * 1.6 + fault * 3.8 - joint * 2.1
        : noise(d * 0.026, row * 0.13) * 2.4);
    const y = THREE.MathUtils.lerp(
      base - 0.15,
      Math.max(base + 0.2, ridgeY),
      w * backing,
    );
    return new THREE.Vector3(roadX(d) - x, y, -d);
  }
  function surfacePoint(d, row) {
    const i = Math.min(profiles.length - 2, Math.floor(row)),
      t = row - i;
    const p = profile(d, i).lerp(profile(d, i + 1), t);
    if (i >= 2 && i < 11) {
      const relief =
        (noise(d * 0.12, row * 0.81) * 0.9 +
          noise(d * 0.31, row * 1.43) * 0.18) *
        Math.sin(t * Math.PI) *
        sectionWeight(d);
      p.x += relief;
      p.y += relief * 0.22;
    }
    return p;
  }
  // Near-tree placements sample the same sculpted surface used by its mesh.
  function landPoint(d, offset) {
    let i = 0;
    while (i < profiles.length - 2 && profiles[i + 1][0] < offset) i++;
    const t = THREE.MathUtils.clamp(
      (offset - profiles[i][0]) / (profiles[i + 1][0] - profiles[i][0]),
      0,
      1,
    );
    return surfacePoint(d, i + t);
  }
  function surfaceColor(d, row) {
    const variation = 0.88 + noise(d * 0.063, row * 0.67) * 0.085;
    return new THREE.Color().setRGB(variation, variation, variation);
  }
  function geometryFromArrays(position, color, uv, index, normal, ao) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
    if (color)
      g.setAttribute("color", new THREE.Float32BufferAttribute(color, 3));
    if (uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    if (ao)
      g.setAttribute("coastalAO", new THREE.Float32BufferAttribute(ao, 1));
    if (index) g.setIndex(index);
    if (normal)
      g.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
    else g.computeVertexNormals();
    g.computeBoundingSphere();
    return ownGeometry(g);
  }
  function cuttingGeometry(start, end, low) {
    const positions = [],
      colors = [],
      uv = [],
      normals = [],
      indices = [],
      ao = [];
    const count = low ? 24 : 48;
    // Duplicate ledge edges across strips to retain a cut-rock silhouette.
    // Analytic tangent normals on shared station boundaries avoid tile seams.
    for (let r = 0; r < profiles.length - 1; r++) {
      const first = positions.length / 3;
      for (let k = 0; k <= count; k++) {
        const d = start + ((end - start) * k) / count;
        for (const row of [r, r + 0.5, r + 1]) {
          const p = surfacePoint(d, row),
            a = surfacePoint(d + 0.08, row),
            b = surfacePoint(d - 0.08, row);
          const across = surfacePoint(d, Math.min(r + 1, row + 0.015)).sub(
            surfacePoint(d, Math.max(r, row - 0.015)),
          );
          const normal = new THREE.Vector3()
            .crossVectors(a.sub(b), across)
            .normalize();
          positions.push(p.x, p.y, p.z);
          const col = surfaceColor(d, row);
          colors.push(col.r, col.g, col.b);
          const occlusion = (r) =>
            [4, 6, 8].includes(r) ? 0.7 : r < 2 ? 0.85 : 0.98;
          ao.push(
            THREE.MathUtils.lerp(occlusion(r), occlusion(r + 1), row - r),
          );
          uv.push(
            d * 0.15,
            THREE.MathUtils.lerp(profiles[r][0], profiles[r + 1][0], row - r) *
              0.15,
          );
          normals.push(normal.x, normal.y, normal.z);
        }
        if (k < count) {
          for (let across = 0; across < 2; across++) {
            const a = first + k * 3 + across;
            indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
          }
        }
      }
    }
    return geometryFromArrays(positions, colors, uv, indices, normals, ao);
  }
  // General geometry batching keeps sculptural detail in one draw per surface.
  class Batch {
    constructor() {
      this.p = [];
      this.n = [];
      this.c = [];
      this.uv = [];
      this.ao = [];
    }
    add(g, matrix, color = 0xffffff) {
      const source = g.index ? g.toNonIndexed() : g;
      const p = source.getAttribute("position"),
        n = source.getAttribute("normal"),
        uv = source.getAttribute("uv");
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix),
        v = new THREE.Vector3(),
        t = new THREE.Vector3(),
        col = new THREE.Color(color);
      const colorAttribute = source.getAttribute("color"),
        ao = source.getAttribute("coastalAO");
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(matrix);
        this.p.push(v.x, v.y, v.z);
        t.fromBufferAttribute(n, i).applyMatrix3(normalMatrix).normalize();
        this.n.push(t.x, t.y, t.z);
        this.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
        this.ao.push(ao ? ao.getX(i) : 1);
        this.c.push(
          col.r * (colorAttribute ? colorAttribute.getX(i) : 1),
          col.g * (colorAttribute ? colorAttribute.getY(i) : 1),
          col.b * (colorAttribute ? colorAttribute.getZ(i) : 1),
        );
      }
      if (source !== g) source.dispose();
    }
    finish() {
      return geometryFromArrays(this.p, this.c, this.uv, null, this.n, this.ao);
    }
  }
  const transform = (p, s = [1, 1, 1], rotation = 0) =>
    new THREE.Matrix4().compose(
      p,
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        rotation,
      ),
      new THREE.Vector3(...s),
    );
  function addMesh(tile, geometry, material, name) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.receiveShadow = true;
    tile.add(mesh);
    return mesh;
  }
  const cube = new THREE.BoxGeometry(1, 1, 1);
  function makeGrass() {
    const p = [],
      c = [],
      uv = [];
    for (let i = 0; i < 11; i++) {
      const angle = i * 2.399963,
        r = hash(i + 37) * 0.28,
        h = 0.29 + hash(i + 71) * 0.61;
      const x = Math.cos(angle) * r,
        z = Math.sin(angle) * r,
        w = 0.022 + hash(i + 18) * 0.025;
      const tip = [
        x + Math.cos(angle) * h * 0.32,
        h,
        z + Math.sin(angle) * h * 0.32,
      ];
      for (const v of [[x - w, 0, z], [x + w, 0, z], tip]) {
        p.push(...v);
        const s = v[1] > 0 ? 1 : 0.44;
        c.push(0.3 * s, 0.37 * s, 0.19 * s);
        uv.push(v[0], v[1]);
      }
    }
    return geometryFromArrays(p, c, uv);
  }
  const grassGeometry = makeGrass();
  const crownNear = ownGeometry(treeCrownGeometry(true)),
    crownFar = ownGeometry(treeCrownGeometry(true, true));
  const trunk = ownGeometry(treeTrunkGeometry(true));
  const trunkFar = ownGeometry(
    new THREE.CylinderGeometry(0.007, 0.024, 0.78, 5, 1),
  );
  trunkFar.translate(0, 0.36, 0);
  for (const g of [crownNear, crownFar, trunk, trunkFar]) {
    const p = g.attributes.position,
      normals = g.attributes.normal;
    const jacobian = new THREE.Matrix3(),
      normal = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i),
        z = p.getZ(i);
      jacobian
        .set(1, 0.4 * y, 0, 0, 0.99 - 0.26 * y, 0, 0, 0.23 * z, 1 + y * 0.23)
        .invert()
        .transpose();
      normal.fromBufferAttribute(normals, i).applyMatrix3(jacobian).normalize();
      normals.setXYZ(i, normal.x, normal.y, normal.z);
      p.setXYZ(
        i,
        p.getX(i) + y * y * 0.2,
        y * (0.99 - 0.13 * y),
        z * (1 + y * 0.23),
      );
    }
    g.computeBoundingSphere();
  }
  function instances(tile, g, m, items, name) {
    const mesh = new THREE.InstancedMesh(g, m, items.length);
    mesh.name = name;
    items.forEach((item, i) => {
      mesh.setMatrixAt(i, transform(item.p, item.s, item.rotation));
      if (item.color) mesh.setColorAt(i, new THREE.Color(item.color));
    });
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    tile.add(mesh);
    return mesh;
  }
  // No sphere-derived boulders: individual lithic blocks use stepped, sheared
  // polygon courses, fractured crowns and flatter ocean-eroded lower benches.
  function slateStack(seed, low = false) {
    const p = [],
      c = [],
      uv = [],
      indices = [],
      ao = [];
    const sides = low ? 6 : 28,
      levels = low
        ? [0, 0.19, 0.44, 0.71, 1]
        : [0, 0.15, 0.19, 0.39, 0.44, 0.65, 0.71, 0.89, 1],
      benches = low
        ? [1.12, 0.94, 0.8, 0.69, 0.58]
        : [1.12, 1.07, 1.05, 0.95, 0.99, 0.84, 0.86, 0.68, 0.61];
    function point(i, j) {
      const a = (i / sides) * Math.PI * 2;
      const h = levels[j],
        facet =
          1 + 0.18 * noise(Math.cos(a) * 2.4 + seed, Math.sin(a) * 2.4 + seed);
      const bench = benches[j];
      const breakage =
        1 +
        0.16 * noise(Math.cos(a) * 3 + seed, Math.sin(a) * 3 + j * 0.51) +
        (low
          ? 0
          : noise(Math.cos(a) * 6 + seed, Math.sin(a) * 6 + j * 0.5) * 0.065);
      const tilt =
        Math.sin(a + seed * 0.31) * 0.13 +
        noise(Math.cos(a) * 3 + seed, Math.sin(a) * 3) * 0.06;
      return [
        Math.cos(a) * facet * bench * breakage + h * 0.12,
        h * (1 + tilt) +
          (j === levels.length - 1 ? noise(i * 0.31, seed) * 0.14 : 0),
        Math.sin(a) * facet * bench * breakage - h * 0.15,
      ];
    }
    for (let j = 0; j < levels.length; j++)
      for (let i = 0; i < sides; i++) {
        const v = point(i, j);
        p.push(...v);
        uv.push(i / sides, levels[j]);
        const shade = 0.85 + noise(i * 0.13 + seed, j * 0.44) * 0.11;
        c.push(shade, shade, shade);
        ao.push(j < 2 ? 0.62 : [2, 4, 6].includes(j) ? 0.75 : 0.98);
        if (j < levels.length - 1) {
          const a = j * sides + i,
            b = j * sides + ((i + 1) % sides);
          indices.push(a, a + sides, b, b, a + sides, b + sides);
        }
      }
    const cap = p.length / 3;
    p.push(0.12, 1, -0.15);
    c.push(0.86, 0.86, 0.86);
    ao.push(1);
    uv.push(0.5, 0.5);
    for (let i = 0; i < sides; i++)
      indices.push(
        cap,
        (levels.length - 1) * sides + ((i + 1) % sides),
        (levels.length - 1) * sides + i,
      );
    const g = geometryFromArrays(p, c, uv, indices, null, ao);
    return g;
  }
  function foamRing(batch, center, rx, rz, seed) {
    const p = [],
      uv = [],
      idx = [],
      count = 70;
    for (let i = 0; i <= count; i++) {
      const a = (i / count) * Math.PI * 2,
        variation =
          1 + 0.15 * noise(Math.cos(a) * 2.4 + seed, Math.sin(a) * 2.4 + seed);
      for (const edge of [0, 1]) {
        const radius = variation + (edge ? 0.34 : 0);
        p.push(
          center.x + Math.cos(a) * rx * radius,
          -0.91 + Math.sin(a * 5 + seed) * 0.016,
          center.z + Math.sin(a) * rz * radius,
        );
        uv.push(i / count, edge);
      }
      if (i < count) {
        const q = i * 2;
        idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
      }
    }
    const g = geometryFromArrays(p, null, uv, idx);
    batch.add(g, new THREE.Matrix4());
    g.dispose();
    geometries.delete(g);
  }
  let treeCount = 0,
    grassCount = 0,
    stackCount = 0;
  for (let start = START; start < END; start += TILE) {
    const end = start + TILE,
      center = (start + end) / 2,
      tile = new THREE.Group();
    tile.name = `Slate cutting ${start}–${end} m`;
    group.add(tile);
    const near = cuttingGeometry(start, end, false),
      far = cuttingGeometry(start, end, true);
    const cutting = addMesh(
      tile,
      near,
      stone,
      "Weathered layered rock cutting",
    );
    const stoneBatch = new Batch(),
      concreteBatch = new Batch(),
      metalBatch = new Batch(),
      foamBatch = new Batch();
    // Sloping blocks at the cliff toe and weather-split slabs on the benches.
    for (let j = 0; j < 22; j++) {
      const seed = start + j * 17,
        d = start + 3 + hash(seed) * 94;
      if (sectionWeight(d) < 0.3) continue;
      const offset = 17 + hash(seed + 1) * 3.8,
        p = landPoint(d, offset),
        size = 0.25 + hash(seed + 2) * 0.75;
      const g = slateStack(seed, true);
      stoneBatch.add(
        g,
        transform(
          p.add(new THREE.Vector3(0, -0.11, 0)),
          [size * 1.5, size * 0.44, size * 2.1],
          hash(seed + 8) * Math.PI,
        ),
        0xffffff,
      );
      g.dispose();
      geometries.delete(g);
    }
    // Roadside concrete has individual expansion joints, drain slots and an
    // exposed foundation. All these pieces become two draw calls per tile.
    for (let d = start + 2; d < end; d += 4) {
      if (sectionWeight(d) < 0.99) continue;
      const p = new THREE.Vector3(roadX(d) - 13.1, roadY(d) - 0.4, -d);
      const slope = -Math.atan((roadX(d + 0.1) - roadX(d - 0.1)) / 0.2);
      concreteBatch.add(
        cube,
        transform(p, [0.72, 1.05, 3.94], slope),
        0xb8b6a5,
      );
      concreteBatch.add(
        cube,
        transform(
          p.clone().add(new THREE.Vector3(0, 0.62, 0)),
          [0.89, 0.19, 3.96],
          slope,
        ),
        0xd8d5c4,
      );
      // Drain grates sit behind the guardrail, with separated tines and a frame.
      if (Math.round(d) % 12 === 6) {
        for (let k = 0; k < 6; k++)
          metalBatch.add(
            cube,
            transform(
              p.clone().add(new THREE.Vector3(0.67, -0.08, (k - 2.5) * 0.1)),
              [0.48, 0.07, 0.035],
              slope,
            ),
          );
        for (const s of [-1, 1])
          metalBatch.add(
            cube,
            transform(
              p.clone().add(new THREE.Vector3(0.67, -0.08, s * 0.32)),
              [0.55, 0.07, 0.05],
              slope,
            ),
          );
      }
    }
    // Freestanding sea stacks stay far outside all road/flight routes. Their
    // mass extends below sea level, with small foam fringes at the intersection.
    const offshore = [
      {
        d: start + 24,
        x: 45 + hash(start + 32) * 19,
        w: 5 + hash(start + 91) * 6,
        h: 9 + hash(start + 62) * 13,
      },
      {
        d: start + 65,
        x: 104 + hash(start + 33) * 36,
        w: 11 + hash(start + 51) * 9,
        h: 22 + hash(start + 15) * 21,
      },
    ];
    for (let j = 0; j < offshore.length; j++) {
      const s = offshore[j],
        seed = start + j * 11;
      const p = new THREE.Vector3(roadX(s.d) + s.x, -7.3, -s.d);
      const g = slateStack(seed);
      stoneBatch.add(
        g,
        transform(
          p,
          [s.w, s.h, s.w * (1.18 + hash(seed) * 0.5)],
          hash(seed + 14) * 0.3,
        ),
        0xffffff,
      );
      foamRing(
        foamBatch,
        p,
        s.w * 1.09,
        s.w * 1.09 * (1.18 + hash(seed) * 0.5),
        seed,
      );
      g.dispose();
      geometries.delete(g);
      stackCount++;
    }
    addMesh(
      tile,
      stoneBatch.finish(),
      stone,
      "Fractured talus and tidal stacks",
    );
    addMesh(
      tile,
      concreteBatch.finish(),
      concrete,
      "Coping and drained retaining wall",
    );
    addMesh(tile, metalBatch.finish(), iron, "Roadside drainage grates");
    const foamMesh = addMesh(
      tile,
      foamBatch.finish(),
      foam,
      "Broken tidal foam",
    );
    foamMesh.receiveShadow = false;
    foamMesh.renderOrder = 1;
    const trees = [];
    for (let j = 0; j < 10; j++) {
      const seed = start + j * 13,
        d = start + 8 + hash(seed + 3) * 84;
      if (sectionWeight(d) < 0.55) continue;
      const offset = [36, 47, 60, 72, 90][j % 5] + hash(seed + 5) * 5;
      const p = landPoint(d, offset);
      p.y -= 0.08;
      const h = 8 + hash(seed + 2) * 9;
      trees.push({
        p,
        s: [h * (0.9 + hash(seed + 6) * 0.27), h, h],
        rotation: -0.15 + hash(seed + 7) * 0.5,
        color: [0xb2bc9a, 0xc7c5a5, 0xaeb99c][j % 3],
      });
    }
    const crowns = instances(
      tile,
      crownNear,
      leaves,
      trees,
      "Wind-shaped maritime crowns",
    );
    const trunks = instances(
      tile,
      trunk,
      bark,
      trees.map((tree) => ({ ...tree, color: 0xffffff })),
      "Exposed branching trunks",
    );
    trunks.castShadow = false;
    crowns.castShadow = false;
    treeCount += trees.length;
    const plants = [];
    for (let j = 0; j < 160; j++) {
      const seed = start + j * 7,
        d = start + 1 + hash(seed + 24) * 98;
      if (sectionWeight(d) < 0.4) continue;
      const offset =
        j % 4 === 0 ? 15.4 + hash(seed + 9) * 1.1 : 33 + hash(seed + 9) * 58;
      const p = landPoint(d, offset);
      p.y -= 0.025;
      const h = 0.65 + hash(seed + 5) * 1.1;
      plants.push({ p, s: [h, h, h], rotation: hash(seed + 8) * 6.28 });
    }
    const groundcover = instances(
      tile,
      grassGeometry,
      grass,
      plants,
      "Sparse maritime grass",
    );
    grassCount += plants.length;
    tiles.push({
      tile,
      center,
      start,
      end,
      cutting,
      near,
      far,
      crowns,
      trunks,
      groundcover,
      foamMesh,
    });
  }
  cube.dispose();
  let disposed = false;
  function update(d, low = false, time = 0) {
    if (disposed) return;
    foam.uniforms.time.value = time;
    for (const t of tiles) {
      const delta = t.center - d;
      t.tile.visible = delta > -170 && delta < 1400;
      if (!t.tile.visible) continue;
      const near = Math.abs(delta) < (low ? 155 : 285);
      t.cutting.geometry = near ? t.near : t.far;
      t.crowns.geometry = near ? crownNear : crownFar;
      t.trunks.geometry = near ? trunk : trunkFar;
      t.groundcover.visible = Math.abs(delta) < (low ? 100 : 190);
      t.foamMesh.visible = Math.abs(delta) < (low ? 420 : 650);
    }
  }
  update(0);
  const triangleCount = (g) =>
    g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  const stats = {
    sectionMeters: END - START,
    tiles: tiles.length,
    trees: treeCount,
    grassTufts: grassCount,
    seaStacks: stackCount,
    nearCliffTriangles: tiles.reduce((n, t) => n + triangleCount(t.near), 0),
    farCliffTriangles: tiles.reduce((n, t) => n + triangleCount(t.far), 0),
    drawCallsAllTiles: tiles.reduce((n, t) => n + t.tile.children.length, 0),
    ownedGeometryBytes: [...geometries].reduce(
      (n, g) =>
        n +
        Object.values(g.attributes).reduce(
          (a, b) => a + b.array.byteLength,
          0,
        ) +
        (g.index?.array.byteLength || 0),
      0,
    ),
    newLights: 0,
    sharedTextureAssets: true,
  };
  return {
    root: group,
    bounds: {
      start: START,
      end: END,
      minRockRoadOffset: 11.08,
      minHardwareRoadOffset: 12.0,
    },
    stats,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.traverse((object) => {
        if (object.isInstancedMesh) object.dispose();
      });
      group.removeFromParent();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
