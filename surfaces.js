import * as THREE from "./vendor/three.module.js";
import { HDRLoader } from "./vendor/HDRLoader.js";

// Loaded once and shared across venues. The production build embeds these URLs.
const urls = {
  road: "assets/runtime/asphalt_color.webp",
  roadNormal: "assets/runtime/asphalt_normal.webp",
  roadRoughness: "assets/runtime/asphalt_roughness.webp",
  rock: "assets/runtime/sandstone_color.webp",
  rockNormal: "assets/runtime/sandstone_normal.webp",
  foliage: "assets/runtime/foliage_branches.webp",
  bark: "assets/runtime/bark_color.webp",
  detail: "assets/runtime/surface_detail.webp",
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
          if (["road", "rock", "foliage", "bark"].includes(key))
            texture.colorSpace = THREE.SRGBColorSpace;
          if (key === "road" || key === "roadNormal" || key === "roadRoughness")
            texture.repeat.set(0.34, 0.34);
          if (key === "foliage")
            texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
          if (key === "bark") texture.repeat.set(2, 4);
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

// A finite shadow map should fade at its boundary instead of exposing a hard
// moving rectangle on asphalt. This alters only each material's shader source;
// the shared Three.js chunks and other rendering programs stay untouched.
const stableShadowChunk = THREE.ShaderChunk.shadowmap_pars_fragment.replace(
  "return mix( 1.0, shadow, shadowIntensity );",
  `float border=min(min(shadowCoord.x,1.0-shadowCoord.x),min(shadowCoord.y,1.0-shadowCoord.y));
   float coverage=smoothstep(0.0,0.085,border)*smoothstep(0.0,0.035,1.0-shadowCoord.z);
   return mix(1.0,shadow,shadowIntensity*coverage);`,
);
// A shared 256px linear data texture replaces repeated fragment noise hashing.
// RGB carry broad weathering, medium mottling and fine aggregate respectively.
let detailFallback;
function detailTexture() {
  if (surfaces.detail) return surfaces.detail;
  if (!detailFallback) {
    detailFallback = new THREE.DataTexture(
      new Uint8Array([128, 128, 128, 255]),
      1,
      1,
    );
    detailFallback.wrapS = detailFallback.wrapT = THREE.RepeatWrapping;
    detailFallback.userData.shared = true;
    detailFallback.needsUpdate = true;
  }
  return detailFallback;
}
function worldProjection(shader, name) {
  shader.vertexShader =
    `varying vec3 ${name};varying vec3 ${name}Normal;\n` +
    shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
    vec4 detailPosition=vec4(transformed,1.);vec3 detailNormal=normal;
    #ifdef USE_INSTANCING
    detailPosition=instanceMatrix*detailPosition;
    mat3 detailInstance=mat3(instanceMatrix);
    detailNormal/=vec3(dot(detailInstance[0],detailInstance[0]),dot(detailInstance[1],detailInstance[1]),dot(detailInstance[2],detailInstance[2]));
    detailNormal=detailInstance*detailNormal;
    #endif
    ${name}=(modelMatrix*detailPosition).xyz;
    ${name}Normal=normalize(mat3(modelMatrix)*detailNormal);`,
    );
  shader.uniforms.surfaceDetail = { value: detailTexture() };
  shader.fragmentShader =
    `varying vec3 ${name};varying vec3 ${name}Normal;uniform sampler2D surfaceDetail;\n` +
    shader.fragmentShader;
}
function relief(shader, height, strength) {
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <normal_fragment_maps>",
    `#include <normal_fragment_maps>
    vec3 detailDx=dFdx(-vViewPosition),detailDy=dFdy(-vViewPosition);
    vec3 detailR1=cross(detailDy,normal),detailR2=cross(normal,detailDx);
    float detailDet=dot(detailDx,detailR1);
    normal=normalize(abs(detailDet)*normal-sign(detailDet)*(dFdx(${height})*detailR1+dFdy(${height})*detailR2)*${strength});`,
  );
}
export function roadMaterial(wet, type = "road") {
  const road = type === "road";
  const material = new THREE.MeshStandardMaterial({
    color: wet ? 0x9ca6ad : 0xb8bab7,
    roughness: wet ? 0.46 : 0.91,
    metalness: wet ? 0.065 : 0.015,
    map: surfaces.road || null,
    normalMap: surfaces.roadNormal || null,
    roughnessMap: surfaces.roadRoughness || null,
    normalScale: new THREE.Vector2(wet ? 0.42 : 0.95, wet ? 0.42 : 0.95),
    envMapIntensity: wet ? 1.15 : 0.38,
  });
  material.customProgramCacheKey = () =>
    "worn-aggregate-asphalt-v6-" + wet + "-" + type;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.surfaceDetail = { value: detailTexture() };
    shader.vertexShader =
      "varying vec2 vRoadUv;\n" +
      shader.vertexShader.replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvRoadUv=uv;",
      );
    shader.fragmentShader =
      "varying vec2 vRoadUv;uniform sampler2D surfaceDetail;\n" +
      shader.fragmentShader
        .replace("#include <shadowmap_pars_fragment>", stableShadowChunk)
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
        vec2 metres=vRoadUv*2.;
        vec3 wear=texture2D(surfaceDetail,metres*vec2(.006,.0016)).rgb;
        vec3 grain=texture2D(surfaceDetail,metres*vec2(.11,.065)).rgb;
        float macro=wear.r,patches=wear.g;
        float laneOffset=abs(mod(metres.x+3.3,6.6)-3.3);
        float rubber=(1.-smoothstep(.10,.55,abs(laneOffset-.88)))*(.35+.65*patches);
        float shoulder=smoothstep(7.65,9.65,abs(metres.x));
        float repair=smoothstep(.57,.73,patches)*smoothstep(.44,.59,macro);
        // Sealed transverse fractures have soft edges at distance, never a
        // repeating high-frequency checker or a screen-space moire pattern.
        float fracture=abs(mod(metres.y+sin(metres.x*1.3)*.12+grain.r*.12+32.,67.)-33.5);
        float seal=(1.-smoothstep(.025,.048+fwidth(fracture),fracture))*(.35+.65*wear.b);
        diffuseColor.rgb*=2.25*(.75+macro*.42+grain.g*.15-repair*.19-seal*.20${road ? "-rubber*.17" : ""});
        ${road ? "diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.23,1.16,1.02),shoulder*(.22+patches*.27));" : ""}
      `,
        )
        .replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>
        float wetPatch=smoothstep(.38,.74,macro)*smoothstep(.30,.68,patches);
        roughnessFactor=clamp(roughnessFactor,${wet ? ".28,.64" : ".73,.96"});
        roughnessFactor=mix(roughnessFactor,${wet ? ".18" : ".76"},wetPatch*${wet ? ".78" : ".28"});
        roughnessFactor=clamp(roughnessFactor+grain.b*.07${road ? "-rubber*.055" : ""},${wet ? ".18,.69" : ".69,.98"});
      `,
        );
  };
  return material;
}

// Three projected samples retain the scan's mineral surface on all cliff faces;
// two small data-map reads add metre-scale land cover and eroded strata.
export function rockMaterial(canyon, terrain = false) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    side: THREE.DoubleSide,
    envMapIntensity: 0.3,
  });
  if (!surfaces.rock) return material;
  material.customProgramCacheKey = () =>
    "mineral-terrain-v8-" +
    canyon +
    "-" +
    terrain +
    "-" +
    !!surfaces.rockNormal;
  material.onBeforeCompile = (shader) => {
    worldProjection(shader, "vStone");
    shader.uniforms.rockScan = { value: surfaces.rock };
    shader.fragmentShader =
      "uniform sampler2D rockScan;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      vec3 stoneN=normalize(vStoneNormal);
      vec3 blend=pow(abs(stoneN),vec3(4.));blend/=max(.001,blend.x+blend.y+blend.z);
      vec3 scan=texture2D(rockScan,vStone.zy*.19).rgb*blend.x+texture2D(rockScan,vStone.xz*.19).rgb*blend.y+texture2D(rockScan,vStone.xy*.19).rgb*blend.z;
      vec3 broad=texture2D(surfaceDetail,vStone.xz*.0016+vStone.y*.0008).rgb;
      vec3 erosion=texture2D(surfaceDetail,vec2(vStone.x+vStone.z*.61,vStone.y)*vec2(.014,.022)).rgb;
      float detail=dot(scan,vec3(.299,.587,.114));
      float mineral=clamp((detail-.46)*1.8+.94,.48,1.42);
      diffuseColor.rgb*=mineral*(.73+broad.r*.45+erosion.g*.16);
      ${
        canyon
          ? `
        float bed=vStone.y*.42+erosion.r*2.2+broad.g;
        float band=.5+.5*sin(bed*6.283185);
        float seam=1.-smoothstep(.055,.18+fwidth(bed),abs(fract(bed)-.18));
        float oxide=smoothstep(.32,.72,broad.b+erosion.r*.20);
        diffuseColor.rgb*=mix(vec3(.92,.88,.81),vec3(1.10,.94,.77),oxide);
        diffuseColor.rgb*=.88+band*.18-seam*.12;
      `
          : terrain
            ? `
        float exposed=(1.-smoothstep(.48,.88,stoneN.y))*smoothstep(.24,.75,erosion.r+broad.g*.22);
        float dry=smoothstep(.48,.76,broad.b+erosion.g*.17);
        diffuseColor.rgb*=mix(vec3(.77,.92,.68),vec3(1.16,1.07,.77),dry);
        float stoneLight=dot(diffuseColor.rgb,vec3(.24,.57,.19));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(stoneLight)*vec3(1.18,1.11,.99),exposed*.86);
      `
            : "diffuseColor.rgb*=mix(vec3(.94,.99,.97),vec3(1.05,1.01,.95),broad.g);"
      }
      float rockRelief=detail+erosion.b*.065;
    `,
      );
    relief(shader, "rockRelief", canyon ? ".24" : ".19");
    if (surfaces.rockNormal) {
      // One dominant-axis normal lookup adds the scan's fine surface relief.
      // Large forms retain smoothly blended triplanar color and bump above.
      shader.uniforms.rockNormalScan = { value: surfaces.rockNormal };
      shader.fragmentShader =
        "uniform sampler2D rockNormalScan;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        vec3 stoneAbs=abs(stoneN);
        vec2 stoneUV;vec3 stoneT,stoneB;
        if(stoneAbs.y>max(stoneAbs.x,stoneAbs.z)){
          stoneUV=vStone.xz;stoneT=vec3(1.,0.,0.);stoneB=vec3(0.,0.,1.);
        }else if(stoneAbs.x>stoneAbs.z){
          stoneUV=vStone.zy;stoneT=vec3(0.,0.,1.);stoneB=vec3(0.,1.,0.);
        }else{
          stoneUV=vStone.xy;stoneT=vec3(1.,0.,0.);stoneB=vec3(0.,1.,0.);
        }
        vec2 stoneMicro=texture2D(rockNormalScan,stoneUV*.19).xy*2.-1.;
        vec3 stonePerturb=stoneT*stoneMicro.x+stoneB*stoneMicro.y;
        stonePerturb-=stoneN*dot(stoneN,stonePerturb);
        normal=normalize(normal+mat3(viewMatrix)*stonePerturb*.54);`,
      );
    }
  };
  return material;
}

// Original branch photography-style atlas shared by all nearby tree species.
// Alpha testing keeps depth/shadows deterministic, without sorted transparency.
export function foliageMaterial() {
  const material = new THREE.MeshStandardMaterial({
    map: surfaces.foliage || pineMaterial().map,
    vertexColors: true,
    alphaTest: 0.36,
    side: THREE.DoubleSide,
    roughness: 0.92,
    color: 0xf4f4ec,
    envMapIntensity: 0.3,
  });
  material.customProgramCacheKey = () => "layered-botanical-foliage-v8";
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n totalEmissiveRadiance+=diffuseColor.rgb*.035;",
    );
  };
  return material;
}

export function barkMaterial() {
  return new THREE.MeshStandardMaterial({
    map: surfaces.bark || null,
    bumpMap: surfaces.bark || null,
    bumpScale: 0.055,
    color: 0xc8c3b4,
    roughness: 0.96,
    envMapIntensity: 0.22,
  });
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
  x.fillStyle = "#736b52";
  x.fillRect(124, 38, 7, 468);
  // Asymmetric drooping branches form broken edges and gaps between crowns.
  // Small needle groups remain part of this single alpha-tested texture.
  const colors = ["#385441", "#48664b", "#62795a", "#7d8d66", "#526f51"];
  const clump = (cx, cy, w, h, color) => {
    x.fillStyle = color;
    x.beginPath();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2,
        r = (k % 2 ? 0.72 : 1) * (0.82 + rand() * 0.18);
      const px = cx + Math.cos(a) * w * r,
        py = cy + Math.sin(a) * h * r;
      k ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.closePath();
    x.fill();
  };
  for (let tier = 20; tier >= 0; tier--) {
    const y = 28 + tier * 20,
      width = 9 + Math.pow(tier / 20, 0.87) * 106;
    for (const side of [-1, 1]) {
      const reach = width * (0.78 + rand() * 0.22),
        drop = 13 + rand() * 13,
        baseY = y + (rand() - 0.5) * 10;
      x.strokeStyle = "#41573e";
      x.lineWidth = 2.3;
      x.beginPath();
      x.moveTo(128, baseY - 5);
      x.quadraticCurveTo(
        128 + side * reach * 0.6,
        baseY + 5,
        128 + side * reach,
        baseY + drop,
      );
      x.stroke();
      for (let j = 0; j < 13; j++) {
        const t = j / 12,
          cx = 128 + side * reach * t + (rand() - 0.5) * 6,
          cy = baseY + drop * t + (rand() - 0.5) * 9;
        clump(
          cx,
          cy,
          5 + (1 - t) * 9,
          7 + (1 - t) * 9,
          colors[(tier + j + (side > 0 ? 1 : 0)) % colors.length],
        );
        for (let n = 0; n < 3; n++) {
          x.strokeStyle = colors[(j + n + 2) % colors.length];
          x.lineWidth = 0.8 + rand();
          x.beginPath();
          x.moveTo(cx, cy);
          x.lineTo(cx + side * (4 + rand() * 8), cy + 4 + rand() * 8);
          x.stroke();
        }
      }
    }
    clump(128 + (rand() - 0.5) * 7, y - 7, 6 + tier * 0.3, 14, colors[2]);
  }
  if (surfaces.foliage?.image) {
    // The distant crown uses the same real branch shapes as near geometry,
    // composed once into a cheap whole-tree cutout, with an exposed older trunk.
    x.clearRect(0, 0, 256, 512);
    x.strokeStyle = "#6d6658";
    x.lineWidth = 7;
    x.beginPath();
    x.moveTo(124, 510);
    x.bezierCurveTo(132, 370, 119, 246, 132, 79);
    x.stroke();
    const source = surfaces.foliage.image,
      cell = source.width / 2;
    for (let level = 0; level < 14; level++) {
      const y = 365 - level * 21,
        reach = 28 + Math.sin((level / 14) * Math.PI) * 63;
      for (const side of [-1, 1]) {
        const cx = 128 + side * reach * (0.32 + rand() * 0.47),
          cy = y + (rand() - 0.5) * 20;
        x.strokeStyle = "#746a50";
        x.lineWidth = 2;
        x.beginPath();
        x.moveTo(128, y + 14);
        x.lineTo(cx, cy);
        x.stroke();
        x.save();
        x.translate(cx, cy);
        x.rotate(side * (0.2 + rand() * 0.35));
        const tile = level % 3 === 0 ? 1 : 0,
          w = 65 + reach * 0.45,
          h = 76 + rand() * 19;
        x.drawImage(
          source,
          tile * cell,
          0,
          cell,
          cell,
          -w * 0.5,
          -h * 0.65,
          w,
          h,
        );
        x.restore();
      }
    }
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({
    map,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 0.96,
    color: 0xe0e6d8,
    emissive: 0x26351e,
    emissiveIntensity: 0.16,
    envMapIntensity: 0.3,
  });
}

// Curtain wall bays have dark spandrels, narrow metal mullions and irregular
// occupied floors. Pixel-width edges converge at distance instead of shimmering.
export function cityMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: 0x415966,
    roughness: 0.39,
    metalness: 0.42,
    emissive: 0x0c1219,
    envMapIntensity: 0.9,
  });
  material.customProgramCacheKey = () => "curtainwall-facade-v6";
  material.onBeforeCompile = (shader) => {
    worldProjection(shader, "vFacade");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      vec2 facade=mix(vFacade.xy,vFacade.zy,step(.5,abs(vFacadeNormal.x)))*vec2(.48,.285);
      vec2 tile=fract(facade),cell=floor(facade),aa=max(fwidth(facade)*.7,vec2(.006));
      vec2 edge=min(tile,1.-tile);
      float wall=1.-step(.55,abs(vFacadeNormal.y));
      float glazing=smoothstep(.025-aa.x,.025+aa.x,edge.x)*smoothstep(.15-aa.y,.15+aa.y,tile.y)*smoothstep(.045-aa.y,.045+aa.y,1.-tile.y)*wall;
      vec3 variation=texture2D(surfaceDetail,(cell+.5)*.017).rgb;
      float occupied=step(.54,variation.g)*step(.29,fract(cell.x*.427+cell.y*.179));
      float frame=1.-smoothstep(.012-aa.x,.012+aa.x,edge.x);
      diffuseColor.rgb*=mix(.48,1.08,glazing)*(.8+variation.r*.35);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.14,.19,.22),frame*wall*.55);
    `,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
      roughnessFactor=mix(.70,.20+variation.b*.19,glazing);
    `,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
      totalEmissiveRadiance+=mix(vec3(.31,.48,.58),vec3(.68,.47,.24),step(.55,variation.r))*glazing*occupied*(.32+variation.b*.6);
    `,
      );
  };
  return material;
}

// Metal sheet seams, fine folded ribs and rain streaks provide
// facade depth on the existing batched boxes. No extra mesh or transparency.
export function warehouseMaterial(
  color = 0x87949b,
  { roof = false, night = false } = {},
) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: roof ? 0.62 : 0.66,
    metalness: 0.32,
    envMapIntensity: 0.66,
    emissive: night ? 0x1b2c35 : 0x000000,
    emissiveIntensity: night ? 0.1 : 0,
  });
  material.customProgramCacheKey = () => "formed-metal-cladding-v6";
  material.onBeforeCompile = (shader) => {
    worldProjection(shader, "vCladding");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <shadowmap_pars_fragment>", stableShadowChunk)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      vec3 claddingN=abs(normalize(vCladdingNormal));
      vec2 panel=claddingN.y>.6?vCladding.xz:mix(vCladding.xy,vCladding.zy,step(.5,claddingN.x));
      vec3 weather=texture2D(surfaceDetail,panel*vec2(.014,.009)).rgb;
      vec3 runoff=texture2D(surfaceDetail,panel*vec2(.18,.012)).rgb;
      float ribPhase=panel.x*25.132741;
      float ribFade=1.-smoothstep(.7,2.5,fwidth(ribPhase));
      float rib=cos(ribPhase)*ribFade;
      vec2 sheets=panel/vec2(3.,4.5),edge=min(fract(sheets),1.-fract(sheets));
      vec2 sheetAA=max(fwidth(sheets),vec2(.002));
      float joint=1.-smoothstep(.004,.008+sheetAA.x,edge.x);
      joint=max(joint,1.-smoothstep(.003,.006+sheetAA.y,edge.y));
      float stain=smoothstep(.55,.83,runoff.r)*(.24+weather.g*.4);
      diffuseColor.rgb*=.84+weather.r*.24+rib*.055-joint*.21-stain*.18;
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.09,.88,.72),smoothstep(.73,.9,weather.b)*.32);
      float metalRelief=rib*.010-joint*.002;
    `,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
      roughnessFactor=clamp(roughnessFactor+(weather.b-.5)*.18+stain*.15,.4,.9);
    `,
      );
    relief(shader, "metalRelief", "1.0");
  };
  return material;
}

export function architecturalGlassMaterial(night = false) {
  const material = new THREE.MeshStandardMaterial({
    color: night ? 0x527183 : 0x6f8990,
    roughness: 0.2,
    metalness: 0.44,
    envMapIntensity: 1.35,
    emissive: night ? 0x244453 : 0x000000,
    emissiveIntensity: night ? 0.22 : 0,
  });
  material.customProgramCacheKey = () => "architectural-glass-v6";
  material.onBeforeCompile = (shader) => {
    worldProjection(shader, "vGlazing");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      vec2 pane=mix(vGlazing.xy,vGlazing.zy,step(.5,abs(vGlazingNormal.x)));
      vec3 dirt=texture2D(surfaceDetail,pane*vec2(.08,.015)).rgb;
      diffuseColor.rgb*=.86+dirt.r*.18;
    `,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
      roughnessFactor=.15+dirt.g*.16;
    `,
      );
  };
  return material;
}

// Weathered cast concrete shares the same packed data as roads and geology.
export function concreteMaterial(color) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.91,
    metalness: 0.025,
  });
  material.customProgramCacheKey = () => "weathered-cast-concrete-v6";
  material.onBeforeCompile = (shader) => {
    worldProjection(shader, "vConcrete");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <shadowmap_pars_fragment>", stableShadowChunk)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      vec3 concreteN=abs(normalize(vConcreteNormal));
      vec2 plane=concreteN.y>.6?vConcrete.xz:mix(vConcrete.xy,vConcrete.zy,step(.5,concreteN.x));
      vec3 casting=texture2D(surfaceDetail,plane*vec2(.025,.011)).rgb;
      vec3 grit=texture2D(surfaceDetail,plane*.58).rgb;
      float runoff=smoothstep(.46,.8,casting.g)*(.4+casting.r*.6);
      float jointDist=abs(mod(plane.y+.9,1.8)-.9);
      float joint=1.-smoothstep(.008,.018+fwidth(jointDist),jointDist);
      diffuseColor.rgb*=.80+casting.r*.24+grit.g*.09-runoff*.13-joint*.08;
      float concreteRelief=grit.b*.015;
    `,
      );
    relief(shader, "concreteRelief", "1.0");
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
