import * as THREE from "./vendor/three.module.js";
import { HDRLoader } from "./vendor/HDRLoader.js";

// Loaded once and shared across venues. The production build embeds these URLs.
const urls = {
  road: "assets/runtime/asphalt_color.webp",
  roadNormal: "assets/runtime/asphalt_normal.webp",
  roadRoughness: "assets/runtime/asphalt_roughness.webp",
  rock: "assets/runtime/sandstone_color.webp",
  environment: "assets/runtime/venice_sunset_512.hdr",
};
export const surfaces = {};
export async function loadVisualAssets(renderer, onProgress) {
  let done = 0;
  await Promise.all(
    Object.entries(urls).map(async ([key, url]) => {
      try {
        const texture = await (
          key === "environment" ? new HDRLoader() : new THREE.TextureLoader()
        ).loadAsync(url);
        if (key === "environment") {
          const pmrem = new THREE.PMREMGenerator(renderer);
          surfaces.environmentTarget = pmrem.fromEquirectangular(texture);
          surfaces.environment = surfaces.environmentTarget.texture;
          texture.userData.shared = true;
          surfaces.sky = texture;
          pmrem.dispose();
        } else {
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.anisotropy = Math.min(
            8,
            renderer.capabilities.getMaxAnisotropy(),
          );
          if (key === "road" || key === "rock")
            texture.colorSpace = THREE.SRGBColorSpace;
          texture.userData.shared = true;
          surfaces[key] = texture;
        }
      } catch (error) {
        console.warn("Visual asset unavailable:", key, error.message);
      }
      onProgress?.(++done / Object.keys(urls).length);
    }),
  );
}

export function roadMaterial(wet) {
  const material = new THREE.MeshStandardMaterial({
    color: wet ? 0x929eac : 0xbfc2c7,
    roughness: wet ? 0.27 : 0.88,
    metalness: wet ? 0.18 : 0.015,
    map: surfaces.road || null,
    normalMap: surfaces.roadNormal || null,
    roughnessMap: surfaces.roadRoughness || null,
    normalScale: new THREE.Vector2(wet ? 0.24 : 0.52, wet ? 0.24 : 0.52),
    envMapIntensity: wet ? 1.6 : 0.38,
  });
  material.customProgramCacheKey = () => "scanned-road-" + wet;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "varying vec3 vRoad; varying vec2 vRoadUv;\n" +
      shader.vertexShader.replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvRoad=(modelMatrix*vec4(transformed,1.)).xyz;vRoadUv=uv;",
      );
    shader.fragmentShader =
      "varying vec3 vRoad; varying vec2 vRoadUv;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      float tireLine=pow(abs(sin(vRoadUv.x*1.9)),24.);
      float repaired=step(.94,sin(vRoad.z*.079+sin(vRoad.x*.4)));
      float grain=.5+.5*sin(vRoad.z*.31+sin(vRoad.x*.43));
      diffuseColor.rgb=mix(vec3(.035),diffuseColor.rgb*2.2,.88)*(1.-tireLine*.17-repaired*.08)*(.94+grain*.12);`,
      );
  };
  const compile = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    compile(shader);
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
      float puddle=smoothstep(.4,.8,sin(vRoad.z*.075+sin(vRoad.x*.6))*sin(vRoad.x*.3+vRoad.z*.023));
      roughnessFactor=mix(roughnessFactor,${wet ? ".10" : ".85"},puddle*${wet ? ".8" : ".25"});`,
    );
  };
  return material;
}

// World-space triplanar sampling avoids stretched textures on vertical cliffs.
export function rockMaterial(canyon) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    side: THREE.DoubleSide,
  });
  if (!surfaces.rock) return material;
  material.customProgramCacheKey = () => "world-strata-rock-v2-" + canyon;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rockScan = { value: surfaces.rock };
    shader.vertexShader =
      "varying vec3 vStone;varying vec3 vStoneNormal;\n" +
      shader.vertexShader.replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
        vec4 stonePosition=vec4(transformed,1.);vec3 stoneNormal=normal;
        #ifdef USE_INSTANCING
        stonePosition=instanceMatrix*stonePosition;
        mat3 stoneInstance=mat3(instanceMatrix);
        stoneNormal/=vec3(dot(stoneInstance[0],stoneInstance[0]),dot(stoneInstance[1],stoneInstance[1]),dot(stoneInstance[2],stoneInstance[2]));
        stoneNormal=stoneInstance*stoneNormal;
        #endif
        vStone=(modelMatrix*stonePosition).xyz;vStoneNormal=normalize(mat3(modelMatrix)*stoneNormal);`,
      );
    shader.fragmentShader =
      "varying vec3 vStone;varying vec3 vStoneNormal;uniform sampler2D rockScan;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      vec3 blend=pow(abs(normalize(vStoneNormal)),vec3(4.));blend/=max(.001,blend.x+blend.y+blend.z);
      vec3 scan=texture2D(rockScan,vStone.zy*.42).rgb*blend.x+texture2D(rockScan,vStone.xz*.42).rgb*blend.y+texture2D(rockScan,vStone.xy*.42).rgb*blend.z;
      float detail=dot(scan,vec3(.299,.587,.114));
      diffuseColor.rgb*=mix(.48,1.65,detail);
      ${canyon ? "float strata=sin(vStone.y*1.8+sin(vStone.z*.04)*2.);float fineStrata=sin(vStone.y*8.+sin(vStone.x*.15));diffuseColor.rgb*=.95+.035*strata+.016*fineStrata;" : ""}`,
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
      vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);
      vec3 r1=cross(sy,normal),r2=cross(normal,sx);float det=dot(sx,r1);
      normal=normalize(abs(det)*normal-sign(det)*(dFdx(detail)*r1+dFdy(detail)*r2)*.16);`,
    );
  };
  return material;
}

// Original cutout vegetation. Branch tiers and sparse needles keep a natural
// silhouette at distance without thousands of individually shaded leaves.
export function pineMaterial() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 512;
  const x = c.getContext("2d");
  let seed = 217;
  const rand = () =>
    ((seed = Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  x.fillStyle = "#71614c";
  x.fillRect(124, 55, 7, 445);
  for (let tier = 0; tier < 21; tier++) {
    const y = 35 + tier * 20,
      width = 10 + tier * 4.7;
    for (let j = 0; j < 55; j++) {
      const side = rand() > 0.5 ? 1 : -1,
        t = rand(),
        px = 128 + side * width * t,
        py = y + 16 * t + rand() * 13;
      x.strokeStyle = ["#243e32", "#385241", "#516147", "#6a7050"][
        Math.floor(rand() * 4)
      ];
      x.lineWidth = 1 + rand() * 2;
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + side * (3 + rand() * 9), py + 6 + rand() * 10);
      x.stroke();
    }
    x.fillStyle = "#40553f";
    x.beginPath();
    x.moveTo(128, y - 16);
    x.lineTo(128 - width * 0.75, y + 22);
    x.lineTo(128 + width * 0.76, y + 21);
    x.closePath();
    x.fill();
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({
    map,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 1,
    color: 0xc6d2bc,
  });
}

export function cityMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: 0x273542,
    roughness: 0.58,
    metalness: 0.32,
    emissive: 0x152029,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "varying vec3 vFacade;varying vec3 vFacadeNormal;\n" +
      shader.vertexShader.replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvFacade=(modelMatrix*vec4(transformed,1.)).xyz;vFacadeNormal=normalize(mat3(modelMatrix)*normal);",
      );
    shader.fragmentShader =
      "varying vec3 vFacade;varying vec3 vFacadeNormal;\n" +
      shader.fragmentShader
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
      vec2 facade=mix(vFacade.xy,vFacade.zy,step(.5,abs(vFacadeNormal.x)))*vec2(.23,.3);
      vec2 tile=fract(facade),cell=floor(facade);
      float windowMask=step(.18,tile.x)*step(tile.x,.8)*step(.2,tile.y)*step(tile.y,.72)*(1.-step(.5,abs(vFacadeNormal.y)));
      float occupied=step(.38,fract(sin(dot(cell,vec2(31.23,73.71)))*44123.3));
      float variation=fract(sin(dot(cell,vec2(12.8,91.1)))*1337.1);
      diffuseColor.rgb*=.7+windowMask*.55;
      diffuseColor.rgb*=.86+.14*step(.035,tile.x)*step(.035,tile.y);`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
      totalEmissiveRadiance+=mix(vec3(.32,.6,.8),vec3(.86,.61,.30),step(.67,variation))*windowMask*occupied*(.5+variation);`,
        );
  };
  return material;
}

// Fine weathering in world space gives concrete a scale without another image
// download. Instances use the same world coordinates as merged district meshes.
export function concreteMaterial(color) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.91,
    metalness: 0.025,
  });
  material.customProgramCacheKey = () => "weathered-concrete-v1";
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "varying vec3 vConcrete;\n" +
      shader.vertexShader.replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
      vec4 concretePosition=vec4(transformed,1.);
      #ifdef USE_INSTANCING
      concretePosition=instanceMatrix*concretePosition;
      #endif
      vConcrete=(modelMatrix*concretePosition).xyz;`,
      );
    shader.fragmentShader =
      "varying vec3 vConcrete;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      float speck=fract(sin(dot(floor(vConcrete*24.),vec3(12.9898,78.233,39.425)))*43758.5453);
      float runoff=.5+.5*sin(vConcrete.x*1.7+sin(vConcrete.z*.64));
      diffuseColor.rgb*=.86+speck*.16-runoff*.065;
      diffuseColor.rgb*=.97+.03*sin(vConcrete.y*7.);`,
      );
  };
  return material;
}

export function scrubMaterial(canyon) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  let seed = canyon ? 613 : 921;
  const random = () =>
    ((seed = Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const colors = canyon
    ? ["#6f6943", "#8d8153", "#b1a16e", "#696b44"]
    : ["#344a37", "#516847", "#71845b", "#9b9d65"];
  for (let i = 0; i < 125; i++) {
    const x = 64 + (random() - 0.5) * 100,
      y = 20 + random() * 91;
    ctx.strokeStyle = colors[i % colors.length];
    ctx.lineWidth = 0.8 + random() * 1.4;
    ctx.beginPath();
    ctx.moveTo(64 + (x - 64) * 0.2, 125);
    ctx.quadraticCurveTo(x, 90, x, y);
    ctx.stroke();
    if (i % 3 === 0) {
      ctx.fillStyle = colors[(i + 1) % colors.length];
      ctx.beginPath();
      ctx.ellipse(
        x,
        y,
        2 + random() * 3,
        1 + random() * 2,
        random() * 3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({
    map,
    alphaTest: 0.48,
    side: THREE.DoubleSide,
    roughness: 1,
    color: 0xd9d7c3,
  });
}
