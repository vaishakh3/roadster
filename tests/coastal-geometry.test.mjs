import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.js";
import { surfaces } from "../surfaces.js";
import { COURSES } from "../courses.js";
import { roadX, roadY } from "../run.js";
import { createCoastalShowcase } from "../coastal-showcase.js";
import { createCoastalRoadside } from "../coastal-roadside.js";
import { coastalCliffData } from "../assets/coastal-scan/coastal-cliff-data.js";

let count = 0;
async function test(name, fn) {
  await fn();
  console.log("PASS " + name);
  count++;
}
const originalLoader = THREE.TextureLoader.prototype.loadAsync;
const originalFoliage = surfaces.foliage;
surfaces.foliage = new THREE.Texture();
const root = new THREE.Group();
const args = { root, course: COURSES[0], roadX, roadY };
const showcase = createCoastalShowcase(args);
const rails = createCoastalRoadside(args);

function audit(world) {
  const seen = new Set();
  const p = new THREE.Vector3(),
    instance = new THREE.Matrix4(),
    matrix = new THREE.Matrix4();
  let minOffset = Infinity,
    invalid = 0,
    indexErrors = 0;
  for (const low of [false, true])
    for (const d of [810, 910, 1010, 1110, 1210]) {
      world.update(d, low, 0);
      root.updateMatrixWorld(true);
      world.root.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const geometry = mesh.geometry,
          position = geometry.attributes.position;
        if (!seen.has(geometry)) {
          seen.add(geometry);
          for (const attribute of Object.values(geometry.attributes))
            for (const value of attribute.array)
              if (!Number.isFinite(value)) invalid++;
          assert.equal(geometry.attributes.normal.count, position.count);
          assert.equal((geometry.index?.count || position.count) % 3, 0);
          if (geometry.index)
            for (const index of geometry.index.array)
              if (index < 0 || index >= position.count) indexErrors++;
        }
        for (
          let slot = 0;
          slot < (mesh.isInstancedMesh ? mesh.count : 1);
          slot++
        ) {
          if (mesh.isInstancedMesh) mesh.getMatrixAt(slot, instance);
          else instance.identity();
          matrix.multiplyMatrices(mesh.matrixWorld, instance);
          for (let i = 0; i < position.count; i++) {
            p.fromBufferAttribute(position, i).applyMatrix4(matrix);
            if (!Number.isFinite(p.x + p.y + p.z)) invalid++;
            minOffset = Math.min(minOffset, Math.abs(p.x - roadX(-p.z)));
          }
        }
      });
    }
  return { geometries: seen.size, invalid, indexErrors, minOffset };
}
function observeDisposal(world) {
  let instances = 0,
    disposedInstances = 0;
  const resources = new Set(),
    counts = new Map();
  for (const low of [false, true])
    for (const d of [810, 910, 1010, 1110, 1210]) {
      world.update(d, low, 0);
      world.root.traverse((mesh) => {
        if (!mesh.isMesh) return;
        resources.add(mesh.geometry);
        for (const material of Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material])
          resources.add(material);
      });
    }
  for (const resource of resources) {
    counts.set(resource, 0);
    resource.addEventListener("dispose", () =>
      counts.set(resource, counts.get(resource) + 1),
    );
  }
  world.root.traverse((mesh) => {
    if (mesh.isInstancedMesh) {
      instances++;
      mesh.addEventListener("dispose", () => disposedInstances++);
    }
  });
  world.dispose();
  world.dispose();
  assert.equal(world.root.parent, null);
  assert.equal(
    disposedInstances,
    instances,
    "instance buffers must receive disposal exactly once",
  );
  for (const [resource, disposed] of counts)
    assert.equal(disposed, 1, resource.type + " must be disposed once");
  return instances;
}
try {
  await test("Coastal showcase geometry and both LODs have finite attributes and valid indices", () => {
    const result = audit(showcase);
    assert.equal(result.invalid, 0);
    assert.equal(result.indexErrors, 0);
    assert.ok(result.geometries > 10);
    assert.ok(result.minOffset > 11);
  });
  await test("Coastal apron stays below the paved verge without floating shoulder edges", () => {
    let sampled = 0;
    for (const low of [false, true])
      for (const d of [810, 910, 1010, 1110, 1210]) {
        showcase.update(d, low);
        showcase.root.traverse((mesh) => {
          if (mesh.name !== "Weathered layered rock cutting") return;
          const p = mesh.geometry.attributes.position;
          for (let i = 0; i < p.count; i++) {
            const station = -p.getZ(i),
              offset = roadX(station) - p.getX(i);
            if (offset < 11 || offset > 16.11) continue;
            const height = p.getY(i) - roadY(station);
            assert.ok(height >= -0.43 && height <= -0.31);
            sampled++;
          }
        });
      }
    assert.ok(sampled > 100);
  });
  await test("Route-conforming rail hardware stays outside the ten-metre driving corridor", () => {
    const result = audit(rails);
    assert.equal(result.invalid, 0);
    assert.equal(result.indexErrors, 0);
    assert.ok(result.minOffset > 10.5);
  });
  await test("Coastal scenery resources stay bounded across repeated quality and distance changes", () => {
    const geometries = new Set(),
      meshes = new Set();
    const visit = () =>
      root.traverse((o) => {
        if (o.isMesh) {
          meshes.add(o);
          geometries.add(o.geometry);
        }
      });
    for (let round = 0; round < 3; round++)
      for (const low of [false, true])
        for (const d of [810, 910, 1010, 1110, 1210]) {
          showcase.update(d, low, 0);
          rails.update(d, low);
          visit();
        }
    const before = [meshes.size, geometries.size];
    for (let round = 0; round < 3; round++)
      for (const low of [false, true])
        for (const d of [810, 910, 1010, 1110, 1210]) {
          showcase.update(d, low, 0);
          rails.update(d, low);
          visit();
        }
    assert.deepEqual([meshes.size, geometries.size], before);
    assert.equal(showcase.stats.newLights, 0);
    assert.equal(rails.stats.newLights, 0);
  });
  await test("Showcase disposes instance buffers, geometry and materials exactly once", () =>
    assert.ok(observeDisposal(showcase) > 0));
  await test("Coastal rail disposal is idempotent", () =>
    observeDisposal(rails));

  const scan = await import("../coastal-scan.js?geometry-test");
  let mapLoads = 0;
  THREE.TextureLoader.prototype.loadAsync = async () => {
    mapLoads++;
    return new THREE.Texture();
  };
  await test("Unavailable scan safely returns null and a successful load is cached", async () => {
    assert.equal(scan.createCoastalScan(args), null);
    assert.equal(await scan.loadCoastalScan(), true);
    assert.equal(await scan.loadCoastalScan(), true);
    assert.equal(mapLoads, 3);
  });
  const formations = scan.createCoastalScan(args);
  await test("Scanned formations preserve valid UVs, indices and safe route clearance", () => {
    const result = audit(formations);
    assert.equal(result.invalid, 0);
    assert.equal(result.indexErrors, 0);
    assert.ok(result.minOffset > 16);
    formations.root.traverse((mesh) => {
      if (mesh.isMesh)
        for (const value of mesh.geometry.attributes.uv.array)
          assert.ok(value >= 0 && value <= 1);
    });
    assert.equal(formations.stats.nearTriangles, 9999);
    assert.equal(formations.stats.farTriangles, 1500);
    assert.ok(
      formations.stats.geometryPayloadBytes +
        formations.stats.texturePayloadBytes <
        1800000,
    );
  });
  await test("Scanned formation disposal is idempotent and keeps shared maps reusable", () => {
    observeDisposal(formations);
    assert.equal(scan.coastalScanStatus().ready, true);
    const again = scan.createCoastalScan(args);
    assert.ok(again);
    again.dispose();
  });
  const oldWarn = console.warn;
  console.warn = () => {}; // Expected optional-asset failures below are asserted.
  try {
    let disposed = 0;
    const makeTexture = () => {
      const t = new THREE.Texture();
      t.addEventListener("dispose", () => disposed++);
      return t;
    };
    const failure = await import("../coastal-scan.js?missing-map-test");
    THREE.TextureLoader.prototype.loadAsync = async (url) => {
      if (url.includes("normal")) throw Error("Expected missing map");
      return makeTexture();
    };
    await test("Missing scan map disposes successful maps and leaves safe fallback", async () => {
      assert.equal(await failure.loadCoastalScan(), false);
      assert.equal(disposed, 2);
      assert.equal(failure.createCoastalScan(args), null);
      assert.equal(failure.coastalScanStatus().loading, false);
    });
    const late = await import("../coastal-scan.js?timeout-test");
    let resolveLate = [];
    THREE.TextureLoader.prototype.loadAsync = () =>
      new Promise((resolve) => resolveLate.push(resolve));
    await test("Scan timeout ends boot wait and disposes late texture completions", async () => {
      assert.equal(
        await late.loadCoastalScan(null, null, { timeoutMs: 50 }),
        false,
      );
      assert.equal(late.coastalScanStatus().loading, false);
      for (const resolve of resolveLate) resolve(makeTexture());
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(disposed, 5);
      assert.equal(late.createCoastalScan(args), null);
    });
    const partial = await import("../coastal-scan.js?decode-failure-test");
    THREE.TextureLoader.prototype.loadAsync = async () => makeTexture();
    const oldFar = coastalCliffData.lods.far.base64,
      oldDispose = THREE.BufferGeometry.prototype.dispose;
    let geometryDisposed = 0;
    THREE.BufferGeometry.prototype.dispose = function () {
      geometryDisposed++;
      return oldDispose.call(this);
    };
    await test("Partial scan decode failure cleans geometry and maps, then retry succeeds", async () => {
      try {
        coastalCliffData.lods.far.base64 = "";
        assert.equal(await partial.loadCoastalScan(), false);
      } finally {
        coastalCliffData.lods.far.base64 = oldFar;
        THREE.BufferGeometry.prototype.dispose = oldDispose;
      }
      assert.equal(geometryDisposed, 1);
      assert.equal(disposed, 8);
      assert.equal(partial.createCoastalScan(args), null);
      assert.equal(await partial.loadCoastalScan(), true);
      const retry = partial.createCoastalScan(args);
      assert.ok(retry);
      retry.dispose();
    });
  } finally {
    console.warn = oldWarn;
  }
  assert.equal(root.children.length, 0);
  console.log(`${count} coastal geometry checks passed`);
} finally {
  THREE.TextureLoader.prototype.loadAsync = originalLoader;
  surfaces.foliage.dispose();
  surfaces.foliage = originalFoliage;
}
