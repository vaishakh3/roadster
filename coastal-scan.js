import * as THREE from "./vendor/three.module.js";
import { coastalCliffData } from "./assets/coastal-scan/coastal-cliff-data.js";

// CC0: Coastal Cliff 01, Rob Tuytel / Rico Cilliers, Poly Haven.
// Offline simplification preserves the scan's own UV layout. These are not
// tiled textures projected onto a procedural shape. See assets/coastal-scan.
const urls = {
  color: "assets/runtime/coastal_scan_color.webp",
  normal: "assets/runtime/coastal_scan_normal.webp",
  arm: "assets/runtime/coastal_scan_arm.webp",
};
const prepared = {
  ready: false,
  textures: {},
  near: null,
  far: null,
  failure: null,
};
let pending;

function decodeGeometry(lod) {
  const bytes = Uint8Array.from(atob(lod.base64), (c) => c.charCodeAt(0));
  if (bytes.length !== lod.vertices * 13 + lod.triangles * 6)
    throw new Error("Coastal scan geometry length mismatch");
  const view = new DataView(bytes.buffer);
  const position = new Float32Array(lod.vertices * 3);
  const normal = new Float32Array(lod.vertices * 3);
  const uv = new Float32Array(lod.vertices * 2);
  const index = new Uint16Array(lod.triangles * 3);
  const bounds = coastalCliffData.bounds;
  let offset = 0;
  for (let i = 0; i < position.length; i++, offset += 2) {
    const axis = i % 3;
    position[i] =
      bounds.min[axis] +
      (view.getUint16(offset, true) / 65535) *
        (bounds.max[axis] - bounds.min[axis]);
  }
  for (let i = 0; i < normal.length; i++, offset++)
    normal[i] = view.getInt8(offset) / 127;
  for (let i = 0; i < normal.length; i += 3) {
    const length = Math.hypot(normal[i], normal[i + 1], normal[i + 2]) || 1;
    normal[i] /= length;
    normal[i + 1] /= length;
    normal[i + 2] /= length;
  }
  for (let i = 0; i < uv.length; i++, offset += 2)
    uv[i] = view.getUint16(offset, true) / 65535;
  for (let i = 0; i < index.length; i++, offset += 2)
    index[i] = view.getUint16(offset, true);
  if (offset !== bytes.length)
    throw new Error("Coastal scan geometry length mismatch");
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute("uv1", new THREE.BufferAttribute(uv.slice(), 2));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function loadScanTexture(key, url, renderer, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error(`Optional coastal scan ${key} timed out`));
    }, timeoutMs);
    Promise.resolve()
      .then(() => new THREE.TextureLoader().loadAsync(url))
      .then(
        (texture) => {
          // ImageLoader has no cancellation API. Dispose late completions so an
          // abandoned optional load cannot retain a texture after boot continues.
          if (settled) {
            texture.dispose();
            return;
          }
          settled = true;
          clearTimeout(timer);
          try {
            texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.anisotropy = Math.min(
              8,
              renderer?.capabilities?.getMaxAnisotropy?.() || 2,
            );
            if (key === "color") texture.colorSpace = THREE.SRGBColorSpace;
            texture.userData.shared = true;
            resolve([key, texture]);
          } catch (error) {
            texture.dispose();
            reject(error);
          }
        },
        (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        },
      );
  });
}

export function coastalScanStatus() {
  return {
    ready: prepared.ready,
    loading: !!pending,
    failure: prepared.failure,
  };
}

export async function loadCoastalScan(
  renderer,
  onProgress,
  { timeoutMs = 10000 } = {},
) {
  if (prepared.ready) {
    onProgress?.(1);
    return true;
  }
  if (pending) {
    const ready = await pending;
    onProgress?.(1);
    return ready;
  }
  const wait = Math.max(50, Math.min(20000, Number(timeoutMs) || 10000));
  pending = (async () => {
    let done = 0,
      near = null,
      far = null,
      textures = {};
    prepared.failure = null;
    try {
      const results = await Promise.allSettled(
        Object.entries(urls).map(async ([key, url]) => {
          try {
            return await loadScanTexture(key, url, renderer, wait);
          } finally {
            onProgress?.(++done / 3);
          }
        }),
      );
      textures = Object.fromEntries(
        results
          .filter((item) => item.status === "fulfilled")
          .map((item) => item.value),
      );
      const failure = results.find((item) => item.status === "rejected");
      if (failure) throw failure.reason;
      near = decodeGeometry(coastalCliffData.lods.near);
      far = decodeGeometry(coastalCliffData.lods.far);
      Object.assign(prepared, {
        textures,
        near,
        far,
        ready: true,
        failure: null,
      });
      return true;
    } catch (error) {
      near?.dispose();
      far?.dispose();
      for (const texture of Object.values(textures)) texture.dispose();
      Object.assign(prepared, {
        textures: {},
        near: null,
        far: null,
        ready: false,
        failure: error?.message || "Optional cliff textures unavailable",
      });
      console.warn("Coastal scan skipped:", prepared.failure);
      return false;
    }
  })();
  try {
    return await pending;
  } finally {
    pending = null;
  }
}

export function createCoastalScan({ root, roadX, roadY }) {
  if (!prepared.ready) return null;
  const group = new THREE.Group();
  group.name = "Scanned North Atlantic coastal formations";
  root.add(group);
  const material = new THREE.MeshStandardMaterial({
    map: prepared.textures.color,
    normalMap: prepared.textures.normal,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughnessMap: prepared.textures.arm,
    roughness: 1,
    aoMap: prepared.textures.arm,
    aoMapIntensity: 0.72,
    metalness: 0,
    color: 0xffffff,
    side: THREE.DoubleSide,
    envMapIntensity: 0.32,
  });
  const placements = [
    // Bury the scan's irregular capture boundary below the talus apron. The
    // lower edge varies several metres along the original cliff; placing only
    // its global minimum at ground level leaves that boundary visibly hanging.
    { d: 850, offset: 24, along: 1.22, height: 2.05, depth: 1.35, base: -6.0 },
    {
      d: 1120,
      offset: 24,
      along: 1.5,
      height: 2.65,
      depth: 1.55,
      base: -6.1,
    },
  ];
  let minimumClearance = Infinity;
  function conform(source, site) {
    const geometry = source.clone(),
      p = geometry.attributes.position,
      n = geometry.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i),
        d = site.d + x * site.along;
      const rx = (roadX(d + 0.05) - roadX(d - 0.05)) / 0.1,
        ry = (roadY(d + 0.05) - roadY(d - 0.05)) / 0.1;
      const nx = n.getZ(i) / site.depth,
        ny = n.getY(i) / site.height,
        nz = rx * nx + ry * ny - n.getX(i) / site.along;
      const length = Math.hypot(nx, ny, nz) || 1;
      n.setXYZ(i, nx / length, ny / length, nz / length);
      p.setXYZ(
        i,
        roadX(d) - site.offset + z * site.depth,
        roadY(d) +
          site.base +
          (y - coastalCliffData.bounds.min[1]) * site.height,
        -d,
      );
      minimumClearance = Math.min(
        minimumClearance,
        site.offset - z * site.depth,
      );
    }
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }
  const formations = placements.map((site) => {
    const near = conform(prepared.near, site),
      far = conform(prepared.far, site);
    const mesh = new THREE.Mesh(near, material);
    mesh.name = `Photogrammetry cliff at ${site.d} m`;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    group.add(mesh);
    return { mesh, near, far, site };
  });
  let disposed = false;
  function update(d, low = false) {
    if (disposed) return;
    for (const formation of formations) {
      const delta = formation.site.d - d;
      formation.mesh.visible = delta > -180 && delta < 1400;
      formation.mesh.geometry =
        Math.abs(delta) < (low ? 160 : 290) ? formation.near : formation.far;
    }
  }
  update(0);
  return {
    root: group,
    bounds: { start: 790, end: 1192, minimumRoadOffset: minimumClearance },
    stats: {
      formations: formations.length,
      drawCalls: formations.length,
      nearTriangles: coastalCliffData.lods.near.triangles,
      farTriangles: coastalCliffData.lods.far.triangles,
      geometryPayloadBytes:
        coastalCliffData.lods.near.bytes + coastalCliffData.lods.far.bytes,
      texturePayloadBytes: 676482,
      gpuTextureBytes: 8388604,
    },
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const formation of formations) {
        formation.near.dispose();
        formation.far.dispose();
      }
      material.dispose();
    },
  };
}
