import * as THREE from "./vendor/three.module.js";
import { HDRLoader } from "./vendor/HDRLoader.js";

// One photographic sky supplies both the visible atmosphere and the filtered
// reflection/ambient light. PMREM is prepared once, never during a racing frame.
export const coastalAtmosphere = { sky: null, environment: null };
export const COASTAL_LIGHT = {
  fog: 0x8799a9,
  exposure: 0.96,
  rotation: 1.65,
};
export async function loadCoastalAtmosphere(renderer) {
  if (coastalAtmosphere.sky && coastalAtmosphere.environment) return;
  let sky, generator, target;
  try {
    sky = await new HDRLoader().loadAsync("assets/runtime/coastal_dusk_1k.hdr");
    // Rotation moves the equirectangular longitude beyond 0..1. Repeating
    // horizontally keeps the visible sky/water coherent with the PMREM;
    // latitude remains clamped to avoid sampling across the poles.
    sky.wrapS = THREE.RepeatWrapping;
    sky.wrapT = THREE.ClampToEdgeWrapping;
    sky.needsUpdate = true;
    generator = new THREE.PMREMGenerator(renderer);
    target = generator.fromEquirectangular(sky);
    sky.userData.shared = true;
    target.texture.userData.shared = true;
    coastalAtmosphere.sky = sky;
    coastalAtmosphere.environment = target.texture;
    coastalAtmosphere.target = target;
  } catch (error) {
    target?.dispose();
    sky?.dispose();
    console.warn(
      "Coastal sky unavailable; using procedural fallback.",
      error.message,
    );
  } finally {
    generator?.dispose();
  }
}

const environmentLookup = `
vec2 coastalUV(vec3 d){
  return vec2(atan(d.z,d.x)/6.2831853+.5+rotation/6.2831853,
              asin(clamp(d.y,-1.,1.))/3.14159265+.5);
}
vec3 coastalSky(vec3 direction){
  vec3 sky=texture2D(skyScan,coastalUV(direction)).rgb;
  return mix(vec3(.15,.23,.32),sky*.26,hasScan);
}`;
const uniforms = () => ({
  skyScan: { value: coastalAtmosphere.sky },
  hasScan: { value: coastalAtmosphere.sky ? 1 : 0 },
  rotation: { value: COASTAL_LIGHT.rotation },
  haze: { value: new THREE.Color(COASTAL_LIGHT.fog) },
});
// Three's fog color is converted into the current output color space and
// mixed after tone mapping/color conversion. Match that ordering here instead
// of treating the display-referred haze as HDR illumination (which lifts it).
// linearToOutputTexel also handles the linear offscreen warm-up target.
export function coastalSkyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: uniforms(),
    vertexShader: `varying vec3 direction;
      void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 direction;uniform sampler2D skyScan;
      uniform float rotation,hasScan;uniform vec3 haze;
      ${environmentLookup}
      void main(){
        vec3 d=normalize(direction);
        vec3 color=coastalSky(d);
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb=mix(linearToOutputTexel(vec4(haze,1.)).rgb,
          gl_FragColor.rgb,smoothstep(-.025,.09,d.y));
      }`,
  });
}

// Wave slopes are world anchored and derivative-filtered. Distant ripples fade
// into the photographed sky reflection instead of sparkling at subpixel scale.
export function coastalWaterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms(), time: { value: 0 } },
    vertexShader: `varying vec3 world;
      void main(){vec4 p=modelMatrix*vec4(position,1.);world=p.xyz;
        gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader: `varying vec3 world;uniform sampler2D skyScan;
      uniform float rotation,hasScan,time;uniform vec3 haze;
      ${environmentLookup}
      float wave(vec2 p,vec2 direction,float frequency,float speed){
        float phase=dot(p,direction)*frequency+time*speed;
        return sin(phase)*(1.-smoothstep(.25,1.5,fwidth(phase)));
      }
      void main(){
        vec2 p=world.xz;
        float swell=wave(p,vec2(.7,.45),.17,.43);
        float crosswave=wave(p,vec2(-.4,.8),.39,-.56);
        float ripple=wave(p,vec2(.8,-.3),1.9,.8);
        vec3 n=normalize(vec3(swell*.068+crosswave*.027,1.,crosswave*.044+ripple*.013));
        vec3 v=normalize(cameraPosition-world);
        vec3 reflected=reflect(-v,n);
        reflected.y=max(.012,reflected.y);
        float fresnel=.035+.66*pow(1.-max(0.,dot(n,v)),4.);
        vec3 color=mix(vec3(.012,.037,.051),coastalSky(reflected)*.42,fresnel);
        color+=vec3(.012,.021,.024)*swell;
        float mist=1.-exp(-distance(cameraPosition.xz,p)*.00115);
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb=mix(gl_FragColor.rgb,
          linearToOutputTexel(vec4(haze,1.)).rgb,mist*.76);
      }`,
  });
}
