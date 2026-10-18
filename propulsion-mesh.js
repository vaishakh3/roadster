import * as THREE from "./vendor/three.module.js";
import { FLIGHT_PORTS } from "./propulsion.js";

export function addFlightHardware(car, materials, options = {}) {
  const { carbon, alloy, darkAlloy, black, paint = carbon } = materials;
  const jets = [],
    fans = [];
  const axis = new THREE.Vector3(0, 1, 0);
  const add = (g, m, pos, q) => {
    const o = new THREE.Mesh(g, m);
    o.position.fromArray(pos);
    if (q) o.quaternion.copy(q);
    o.castShadow = true;
    o.receiveShadow = true;
    car.add(o);
    return o;
  };
  // Outlet lips are only millimetres proud of the surface. Oval recesses and a
  // machined throat read as integrated hardware, not cylinders bolted to a car.
  const nozzleGeo = new THREE.CylinderGeometry(0.046, 0.041, 0.018, 24, 1, true);
  const ringGeo = new THREE.TorusGeometry(0.049, 0.0032, 5, 24);
  const coreGeo = new THREE.CircleGeometry(0.046, 24);
  const surroundGeo = new THREE.RingGeometry(0.052, 0.069, 28);
  const surroundTrim = new THREE.RingGeometry(0.067, 0.071, 28);
  const vaporGeo = new THREE.ConeGeometry(0.25, 1.7, 12, 6, true);
  // Cone tip at nozzle, exhaust expands outwards along +Y.
  vaporGeo.rotateZ(Math.PI);
  vaporGeo.translate(0, 0.85, 0);
  const shader = {
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, power: { value: 0 }, phase: { value: 0 } },
    vertexShader:
      "varying vec2 vUv;varying vec3 vN;varying vec3 vV;void main(){vUv=uv;vN=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.);vV=-p.xyz;gl_Position=projectionMatrix*p;}",
    fragmentShader: `varying vec2 vUv;varying vec3 vN;varying vec3 vV;uniform float time;uniform float power;uniform float phase;
      void main(){float t=1.-vUv.y;float grain=.65+.35*sin(vUv.x*31.+t*46.-time*45.+phase+sin(t*21.-time*17.));
      float silhouette=pow(abs(dot(normalize(vN),normalize(vV))),.55);
      float fade=(1.-smoothstep(.25,1.,t))*smoothstep(0.,.06,t);
      gl_FragColor=vec4(.91,.96,1.,sqrt(power)*fade*grain*(.45+.35*silhouette));}`,
  };
  FLIGHT_PORTS.forEach((port, i) => {
    const direction = new THREE.Vector3(...port.exhaust),
      q = new THREE.Quaternion().setFromUnitVectors(axis, direction);
    const pos = new THREE.Vector3(...(options.surfacePosition?.(port) || port.position));
    const barrel = add(nozzleGeo, darkAlloy, pos.clone().addScaledVector(direction, -.007).toArray(), q);
    barrel.scale.z = port.kind === "side" ? 1.25 : 1.55;
    const face = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      direction,
    );
    const tip = pos.clone().addScaledVector(direction, 0.004);
    const ring = add(ringGeo, darkAlloy, tip.toArray(), face);
    const core = add(coreGeo, black, pos.toArray(), face);
    const surround = add(surroundGeo, carbon, pos.clone().addScaledVector(direction,.001).toArray(), face);
    const trim = add(surroundTrim, paint, pos.clone().addScaledVector(direction,.002).toArray(), face);
    for(const part of [ring,core,surround,trim])part.scale.y = port.kind === "side" ? 1.25 : 1.55;
    // Two shallow internal ribs show the inset without a bright chrome mouth.
    for(const sign of [-1,1]) {
      const ribGeo=new THREE.BoxGeometry(.055,.003,.004);
      ribGeo.translate(0,sign*.025,.002);
      add(ribGeo,darkAlloy,pos.toArray(),face);
    }
    const material = new THREE.ShaderMaterial(shader);
    material.uniforms = THREE.UniformsUtils.clone(shader.uniforms);
    material.uniforms.phase.value = i * 2.3;
    const plume = add(vaporGeo, material, tip.toArray(), q);
    plume.visible = false;
    plume.castShadow = plume.receiveShadow = false;
    plume.name = port.id;
    jets.push(plume);
  });
  // Recessed underfloor suction plenums, seals and visible impellers.
  for (const z of [-0.75, 0.75]) {
    const housing = add(
      new THREE.CylinderGeometry(0.39, 0.39, 0.06, 32, 1, true),
      carbon,
      [0, 0.16, z],
    );
    housing.name = "Underfloor suction plenum";
    const face = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, -1, 0),
    );
    add(new THREE.CircleGeometry(0.38, 32), black, [0, 0.18, z], face);
    add(
      new THREE.TorusGeometry(0.39, 0.025, 6, 32),
      darkAlloy,
      [0, 0.125, z],
      face,
    );
    const rotor = new THREE.Group();
    rotor.position.set(0, 0.13, z);
    car.add(rotor);
    fans.push(rotor);
    const positions = [];
    for (let j = 0; j < 9; j++) {
      const a = (j * Math.PI * 2) / 9;
      const p = (r, t) => [Math.cos(a + t) * r, 0, Math.sin(a + t) * r];
      positions.push(...p(0.07, 0), ...p(0.35, 0.18), ...p(0.32, 0.5));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.computeVertexNormals();
    rotor.add(new THREE.Mesh(g, darkAlloy));
  }
  return { jets, fans };
}
