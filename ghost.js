import * as THREE from "./vendor/three.module.js";

// A projected time reference, deliberately unlike the opaque race opponents.
// One merged shell, one contour batch and one sign: no lights or shadow casts.
export function createGhost(car) {
  const root = new THREE.Group();
  root.name = "Non-solid personal ghost";
  const positions = [],
    normals = [],
    indices = [];
  const point = new THREE.Vector3(),
    normal = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  for (const part of car.children) {
    if (
      !part.isMesh ||
      ![car.userData.paintMaterial, car.userData.glassMaterial].includes(
        part.material,
      )
    )
      continue;
    part.updateMatrix();
    normalMatrix.getNormalMatrix(part.matrix);
    const g = part.geometry,
      p = g.attributes.position,
      n = g.attributes.normal,
      offset = positions.length / 3;
    for (let i = 0; i < p.count; i++) {
      point.fromBufferAttribute(p, i).applyMatrix4(part.matrix);
      normal.fromBufferAttribute(n, i).applyNormalMatrix(normalMatrix);
      positions.push(point.x, point.y, point.z);
      normals.push(normal.x, normal.y, normal.z);
    }
    for (let i = 0; i < (g.index?.count || p.count); i++)
      indices.push(offset + (g.index ? g.index.getX(i) : i));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  const uniforms = { alpha: { value: 1 } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `varying vec3 vNormal; varying vec3 vView; varying vec3 vLocal;
      void main(){vLocal=position;vec4 view=modelViewMatrix*vec4(position,1.);vView=-view.xyz;vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*view;}`,
    fragmentShader: `uniform float alpha;varying vec3 vNormal;varying vec3 vView;varying vec3 vLocal;
      void main(){float rim=pow(1.-abs(dot(normalize(vNormal),normalize(vView))),1.5);
      float bands=step(.6,fract(vLocal.y*15.));
      gl_FragColor=vec4(vec3(.30,.95,1.),alpha*(.025+rim*.3+bands*.1));}`,
  });
  root.add(new THREE.Mesh(geometry, material));
  const linesMaterial = new THREE.LineBasicMaterial({
    color: 0x8ceeff,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
  });
  root.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 32),
      linesMaterial,
    ),
  );
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 80;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#061923e8";
  ctx.fillRect(0, 0, 256, 80);
  ctx.strokeStyle = "#8ceeff";
  ctx.setLineDash([8, 6]);
  ctx.strokeRect(2, 2, 252, 76);
  ctx.fillStyle = "#b8f6ff";
  ctx.font = "bold 30px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("GHOST", 128, 33);
  ctx.font = "18px sans-serif";
  ctx.fillText("PASS THROUGH", 128, 61);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const labelMaterial = new THREE.SpriteMaterial({
    map: texture,
    depthWrite: false,
    transparent: true,
    opacity: 0.9,
  });
  const label = new THREE.Sprite(labelMaterial);
  label.position.set(0, 2.55, 0);
  label.scale.set(3.6, 1.125, 1);
  root.add(label);
  root.userData.setProximity = (distance) => {
    const fade = THREE.MathUtils.smoothstep(distance, 1.5, 10);
    uniforms.alpha.value = fade;
    linesMaterial.opacity = 0.58 * fade;
    labelMaterial.opacity = 0.35 + 0.55 * fade;
  };
  root.visible = false;
  return root;
}
