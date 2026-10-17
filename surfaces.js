import * as THREE from "./vendor/three.module.js";
import { HDRLoader } from "./vendor/HDRLoader.js";

// Loaded once and shared across venues. The production build embeds these URLs.
const urls = {
  road: "assets/realism/asphalt_track_diff_1k.jpg",
  roadNormal: "assets/realism/asphalt_track_nor_gl_1k.jpg",
  roadRoughness: "assets/realism/asphalt_track_rough_1k.jpg",
  rock: "assets/realism/sandstone_cracks_diff_1k.jpg",
  environment: "assets/realism/venice_sunset_1k.hdr",
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
      "varying vec3 vRoad;\n" +
      shader.vertexShader.replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvRoad=(modelMatrix*vec4(transformed,1.)).xyz;",
      );
    shader.fragmentShader =
      "varying vec3 vRoad;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      float tireLine=pow(abs(sin(vRoad.x*.48+sin(vRoad.z*.006)*.3)),18.);
      float repaired=step(.94,sin(vRoad.z*.079+sin(vRoad.x*.4)));
      diffuseColor.rgb=mix(vec3(.045),diffuseColor.rgb*2.6,.82)*(1.-tireLine*.11-repaired*.055);`,
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
  material.customProgramCacheKey = () => "scanned-rock-" + canyon;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rockScan = { value: surfaces.rock };
    shader.vertexShader =
      "varying vec3 vStone;varying vec3 vStoneNormal;\n" +
      shader.vertexShader.replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvStone=(modelMatrix*vec4(transformed,1.)).xyz;vStoneNormal=normalize(mat3(modelMatrix)*normal);",
      );
    shader.fragmentShader =
      "varying vec3 vStone;varying vec3 vStoneNormal;uniform sampler2D rockScan;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      vec3 blend=pow(abs(normalize(vStoneNormal)),vec3(4.));blend/=max(.001,blend.x+blend.y+blend.z);
      vec3 scan=texture2D(rockScan,vStone.zy*.12).rgb*blend.x+texture2D(rockScan,vStone.xz*.12).rgb*blend.y+texture2D(rockScan,vStone.xy*.12).rgb*blend.z;
      float detail=dot(scan,vec3(.299,.587,.114));
      diffuseColor.rgb*=mix(.52,1.45,detail);
      ${canyon ? "diffuseColor.rgb*=.95+.05*sin(vStone.y*.55+sin(vStone.z*.025));" : ""}`,
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
      vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);
      vec3 r1=cross(sy,normal),r2=cross(normal,sx);float det=dot(sx,r1);
      normal=normalize(abs(det)*normal-sign(det)*(dFdx(detail)*r1+dFdy(detail)*r2)*.55);`,
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
