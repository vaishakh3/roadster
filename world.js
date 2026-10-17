import * as THREE from './vendor/three.module.js';

const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seeded = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return x - Math.floor(x); };
const smooth = t => t * t * (3 - 2 * t);
function noise(x, y) {
 const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
 const a = seeded(ix + iy * 173), b = seeded(ix + 1 + iy * 173), c = seeded(ix + (iy + 1) * 173), d = seeded(ix + 1 + (iy + 1) * 173);
 return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
function fbm(x, y) { return noise(x, y) * .53 + noise(x * 2.07 + 13, y * 2.07) * .27 + noise(x * 4.17, y * 4.17 + 19) * .13 + noise(x * 8.4, y * 8.4) * .07; }
function material(color, roughness = .8, metalness = 0) { return new THREE.MeshStandardMaterial({ color, roughness, metalness }); }
function mesh(geometry, mat, x = 0, y = 0, z = 0) {
 const o = new THREE.Mesh(geometry, mat); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o;
}
function label(text, w = 1024, h = 128, color = '#f0e9d7', bg = '#252a2a') {
 const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d');
 ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); ctx.fillStyle = color; ctx.font = `500 ${h * .37}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, h / 2);
 const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// All surface maps are original, generated once at startup and shared by batches.
function surfaceTexture(kind) {
 const c = document.createElement('canvas'); c.width = c.height = 512; const ctx = c.getContext('2d');
 const road = kind === 'road', concrete = kind === 'concrete';
 ctx.fillStyle = road ? '#45484a' : concrete ? '#b0aba0' : '#aaa08a'; ctx.fillRect(0, 0, 512, 512);
 for (let i = 0; i < 30000; i++) {
  const v = seeded(i * 3 + 15), w = seeded(i * 3 + 16), n = seeded(i * 3 + 17);
  ctx.fillStyle = road ? `rgba(${n > .52 ? '204,211,207' : '13,17,20'},${.035 + n * .14})` : `rgba(${n > .5 ? '235,226,200' : '76,64,47'},${.025 + n * .12})`;
  const s = road ? .6 + n * 1.6 : .6 + n * 2.4; ctx.fillRect(v * 512, w * 512, s, s);
 }
 // Large soft aggregate variation breaks up the repeating fine grain.
 for (let i = 0; i < 48; i++) {
  const x = seeded(i * 11 + 55) * 512, y = seeded(i * 13 + 56) * 512, r = 14 + seeded(i + 100) * 70;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, road ? '#151b2011' : '#6353370e'); g.addColorStop(1, '#00000000'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
 }
 if (concrete) {
  ctx.strokeStyle = '#625d5025'; ctx.lineWidth = .5;
  for (let i = 0; i < 15; i++) { let x = seeded(i * 7) * 512, y = seeded(i * 3 + 500) * 512; ctx.beginPath(); ctx.moveTo(x, y); for (let j = 0; j < 4; j++) { x += seeded(i * 6 + j) * 24 - 12; y += seeded(i * 10 + j) * 24 - 12; ctx.lineTo(x, y); } ctx.stroke(); }
 }
 const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

export function createWorld(scene, renderer) {
 const obstacles=[];
 const world = new THREE.Group(); world.name = 'Afterdark proving ground'; scene.add(world);
 scene.background = new THREE.Color('#07111e'); scene.fog = new THREE.FogExp2('#0a1827', .0021);
 const sunDirection = new THREE.Vector3(-160, 95, -110).normalize();
 // Deep blue night, low cloud decks and a restrained lunar key light.
 const skyMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, uniforms: { sunDirection: { value: sunDirection } },
  vertexShader: 'varying vec3 vDirection; void main(){ vDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `varying vec3 vDirection; uniform vec3 sunDirection;
   float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
   void main(){
    vec3 d=normalize(vDirection); float h=max(d.y,0.); float sun=max(dot(d,sunDirection),0.);
    vec3 zenith=vec3(.002,.006,.017), horizon=vec3(.032,.070,.12);
    vec3 c=mix(horizon,zenith,pow(h,.43));
    c+=vec3(.014,.033,.075)*pow(sun,12.); c+=vec3(.045,.006,.018)*pow(max(0.,d.x),7.)*(1.-h);
    vec2 cp=d.xz/max(.11,d.y+.1); float wisps=n(cp*vec2(.9,3.2)+5.)*.57+n(cp*vec2(2.,8.))*.28+n(cp*vec2(4.,17.))*.15;
    float cloud=smoothstep(.57,.78,wisps)*smoothstep(.05,.24,h)*(1.-smoothstep(.65,.92,h));
    c=mix(c,vec3(.045,.073,.11),cloud*.36);
    c+=vec3(.09,.13,.22)*pow(sun,160.)*.18;
    c+=vec3(.8,.95,1.25)*smoothstep(.99991,.99998,sun);
    c=mix(vec3(.006,.012,.02),c,smoothstep(-.045,.015,d.y));
    gl_FragColor=vec4(c,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`
 });
 const sky = new THREE.Mesh(new THREE.SphereGeometry(1950, 48, 24), skyMaterial); sky.name = 'Afterdark atmosphere'; sky.frustumCulled = false; scene.add(sky);
 const envScene = new THREE.Scene(); envScene.add(sky.clone());
 // Broad, restrained cloud reflections create readable automotive highlight bands.
 const cloudMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(.33, .57, .86), side: THREE.DoubleSide });
 for (const [x, y, z, sx, sz, rz] of [[-28, 32, 6, 42, 8, -.18], [15, 42, -26, 28, 5, .4]]) {
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), cloudMaterial); panel.position.set(x, y, z); panel.rotation.set(-Math.PI / 2, 0, rz); envScene.add(panel);
 }
 const reflectionFloor = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), new THREE.MeshBasicMaterial({ color: '#292e31', side: THREE.DoubleSide })); reflectionFloor.rotation.x = -Math.PI / 2; reflectionFloor.position.y = -2; envScene.add(reflectionFloor);
 const softbox = new THREE.Mesh(new THREE.PlaneGeometry(19, 3.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.65, 2.0), side: THREE.DoubleSide })); softbox.position.set(-6, 11, -5); softbox.rotation.set(-Math.PI / 2, 0, -.23); envScene.add(softbox);
 const sidebox = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 9), new THREE.MeshBasicMaterial({ color: new THREE.Color(.2, 1.1, 1.75), side: THREE.DoubleSide })); sidebox.position.set(10, 6, 7); sidebox.lookAt(0, 1, 0); envScene.add(sidebox);
 const redbox=new THREE.Mesh(new THREE.PlaneGeometry(2.5,12),new THREE.MeshBasicMaterial({color:new THREE.Color(1.6,.04,.09),side:THREE.DoubleSide}));redbox.position.set(-12,6,3);redbox.lookAt(0,2,0);envScene.add(redbox);
 const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(envScene, .04, .1, 2200).texture; pmrem.dispose(); scene.environmentIntensity = .65;
 const hemisphereLight=new THREE.HemisphereLight('#a1c9ed', '#101c2a', .42);scene.add(hemisphereLight);
 const sun = new THREE.DirectionalLight('#b2cdf4', .55); sun.position.set(-160, 95, -110); sun.castShadow = true;
 sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -21, right: 21, top: 21, bottom: -21, near: 1, far: 420 }); sun.shadow.bias = -.00012; sun.shadow.normalBias = .022; sun.shadow.radius = 2; scene.add(sun, sun.target);

 const sand = surfaceTexture('ground'); sand.repeat.set(160, 160);
 const groundMaterial = new THREE.MeshStandardMaterial({ map: sand, color: '#253748', roughness: .44, metalness: .32 });
 // World-space mineral patches are independent of the small repeating sand map.
 groundMaterial.onBeforeCompile = shader => {
  shader.vertexShader = 'varying vec3 vGroundPosition;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGroundPosition=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader = 'varying vec3 vGroundPosition;\nfloat terrainHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\nfloat terrainNoise(vec2 p){vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(terrainHash(i),terrainHash(i+vec2(1.,0.)),f.x),mix(terrainHash(i+vec2(0.,1.)),terrainHash(i+vec2(1.,1.)),f.x),f.y);}\n' + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\nfloat mineral=terrainNoise(vGroundPosition.xz*.035)*.7+terrainNoise(vGroundPosition.xz*.14)*.3; diffuseColor.rgb*=mix(vec3(.77,.74,.68),vec3(1.09,1.05,.97),mineral);');
 };
 const ground = mesh(new THREE.PlaneGeometry(3600, 3600), groundMaterial); ground.rotation.x = -Math.PI / 2; ground.position.y = -.08; ground.castShadow = false; world.add(ground);

 // Track and gate coordinates are deliberately unchanged from the driving model.
 const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 100), new THREE.Vector3(-85, 0, 100), new THREE.Vector3(-140, 0, 55), new THREE.Vector3(-130, 0, -30), new THREE.Vector3(-70, 0, -83), new THREE.Vector3(15, 0, -100), new THREE.Vector3(95, 0, -75), new THREE.Vector3(140, 0, -15), new THREE.Vector3(120, 0, 65), new THREE.Vector3(65, 0, 98)], true, 'catmullrom', .4);
 const width = 16, N = 640, center = []; for (let i = 0; i < N; i++) center.push(curve.getPointAt(i / N));
 const asphalt = surfaceTexture('road'); asphalt.repeat.set(3, 115);
 function ribbon(offset, w, mat, height = .01, start = 0, end = 1) {
  const p = [], u = [], ix = [], steps = Math.ceil(N * (end - start));
  for (let i = 0; i <= steps; i++) { const t = start + (end - start) * i / steps, c = curve.getPointAt(t), tangent = curve.getTangentAt(t), nx = -tangent.z, nz = tangent.x;
   for (const side of [-1, 1]) { p.push(c.x + nx * (offset + side * w / 2), height, c.z + nz * (offset + side * w / 2)); u.push(side * .5 + .5, t); }
  }
  for (let i = 0; i < steps; i++) { const j = i * 2; ix.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); g.setIndex(ix); g.computeVertexNormals(); const o = mesh(g, mat); o.castShadow = false; world.add(o); return o;
 }
 const runoffTexture = surfaceTexture('ground'); runoffTexture.repeat.set(2, 105);
 ribbon(0, 25, new THREE.MeshStandardMaterial({ map: runoffTexture, color: '#253748', roughness: .35, metalness: .4, side: THREE.DoubleSide }), -.035);
 ribbon(0, 18.5, material('#203243', .32, .55), -.015);
 ribbon(0, width, new THREE.MeshPhysicalMaterial({ map: asphalt, roughness: .22, metalness: .32, clearcoat: .9, clearcoatRoughness: .16, color: '#516676', side: THREE.DoubleSide }));
 const lineMat = new THREE.MeshStandardMaterial({color:'#b3e6e7',roughness:.45,emissive:'#4c8e9b',emissiveIntensity:.18}); ribbon(-width / 2 + .42, .12, lineMat, .022); ribbon(width / 2 - .42, .12, lineMat, .022);
 // Rubbered-in racing line: subtle variable-opacity texture rather than a black stripe.
 const wearCanvas = document.createElement('canvas'); wearCanvas.width = 256; wearCanvas.height = 512; const wc = wearCanvas.getContext('2d'); wc.clearRect(0, 0, 256, 512);
 for (let i = 0; i < 2700; i++) { const x = seeded(i * 3) * 256, y = seeded(i * 3 + 1) * 512, alpha = Math.pow(Math.sin(x / 256 * Math.PI), 2) * .035; wc.fillStyle = `rgba(8,13,17,${alpha})`; wc.fillRect(x, y, .5 + seeded(i + 63), 5 + seeded(i + 108) * 28); }
 const wear = new THREE.CanvasTexture(wearCanvas); wear.wrapS = wear.wrapT = THREE.RepeatWrapping; wear.repeat.set(1, 36); ribbon(-1.3, 5.5, new THREE.MeshStandardMaterial({ map: wear, transparent: true, depthWrite: false, roughness: .75 }), .018);
 const dummy = new THREE.Object3D();
 function instanceBoxes(name, entries, mat, shadows = true) {
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, entries.length); inst.name = name;
  entries.forEach((e, i) => { dummy.position.set(e[0], e[1], e[2]); dummy.rotation.set(0, e[6] || 0, 0); dummy.scale.set(e[3], e[4], e[5]); dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix); });
  inst.castShadow = shadows; inst.receiveShadow = true; world.add(inst); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0); return inst;
 }
 const cyanLight = new THREE.MeshBasicMaterial({color:new THREE.Color(.3,2.7,3.4)}), redLight = new THREE.MeshBasicMaterial({color:new THREE.Color(3.2,.08,.16)});
 const cyanGlow = new THREE.MeshBasicMaterial({color:'#19c7f1',transparent:true,opacity:.15,depthWrite:false,blending:THREE.AdditiveBlending});
 const redGlow = new THREE.MeshBasicMaterial({color:'#ff2547',transparent:true,opacity:.12,depthWrite:false,blending:THREE.AdditiveBlending});
 // Glowing light-guide cores and feathered wet-surface spill, each a single ribbon.
 const edgeGlowCanvas=document.createElement('canvas');edgeGlowCanvas.width=64;edgeGlowCanvas.height=2;const edgeGlowContext=edgeGlowCanvas.getContext('2d');for(let x=0;x<64;x++){const a=Math.exp(-Math.pow((x-31.5)/11,2));edgeGlowContext.fillStyle=`rgba(255,255,255,${a})`;edgeGlowContext.fillRect(x,0,1,2);}const edgeGlowMap=new THREE.CanvasTexture(edgeGlowCanvas);
 const edgeCyanGlow=new THREE.MeshBasicMaterial({map:edgeGlowMap,color:'#03bbef',transparent:true,opacity:.38,depthWrite:false,blending:THREE.AdditiveBlending});const edgeRedGlow=new THREE.MeshBasicMaterial({map:edgeGlowMap,color:'#ff173b',transparent:true,opacity:.22,depthWrite:false,blending:THREE.AdditiveBlending});
 for(const side of [-1,1]){ribbon(side*7.82,.065,cyanLight,.035);ribbon(side*7.82,1.6,edgeCyanGlow,.031);ribbon(side*8.75,.075,redLight,.11);ribbon(side*8.75,1.0,edgeRedGlow,.032);}
 const lightSpillCanvas=document.createElement('canvas');lightSpillCanvas.width=128;lightSpillCanvas.height=128;const lightSpillContext=lightSpillCanvas.getContext('2d');const lightSpillGradient=lightSpillContext.createRadialGradient(64,64,2,64,64,64);lightSpillGradient.addColorStop(0,'rgba(255,255,255,.7)');lightSpillGradient.addColorStop(.24,'rgba(255,255,255,.25)');lightSpillGradient.addColorStop(1,'rgba(255,255,255,0)');lightSpillContext.fillStyle=lightSpillGradient;lightSpillContext.fillRect(0,0,128,128);const lightSpillMap=new THREE.CanvasTexture(lightSpillCanvas);
 function lightPools(entries,color,opacity=.2){const o=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:lightSpillMap,color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending}),entries.length);entries.forEach((e,i)=>{dummy.position.set(e[0],e[1],e[2]);dummy.rotation.set(-Math.PI/2,0,e[5]||0);dummy.scale.set(e[3],e[4],1);dummy.updateMatrix();o.setMatrixAt(i,dummy.matrix);});dummy.scale.set(1,1,1);dummy.rotation.set(0,0,0);o.name='Neon surface spill';world.add(o);return o;}
 const kerbsWhite = [], kerbsRed = [];
 for (let i = 0; i < 650; i++) {
  const t = i / 650, c = curve.getPointAt(t), d = curve.getTangentAt(t), a = Math.atan2(d.x, d.z);
  // Kerbs live on corner sections; long straights stay restrained.
  if (t < .065 || t > .94 || (t > .37 && t < .43)) continue;
  for (const side of [-1, 1]) (i % 4 < 2 ? kerbsWhite : kerbsRed).push([c.x - d.z * side * 8.5, .035, c.z + d.x * side * 8.5, 1.1, .11, 1.13, a]);
 }
 instanceBoxes('Warm white kerbs', kerbsWhite, material('#596d7b', .4, .3), false); instanceBoxes('Oxide kerbs', kerbsRed, material('#421a29', .32, .3), false);
 const steel = material('#868c8b', .42, .75), dark = material('#262b2b', .59, .3), roadPosts = [], reflectors = [];
 for (let i = 0; i < 100; i++) { const c = curve.getPointAt(i / 100), d = curve.getTangentAt(i / 100), a = Math.atan2(d.x, d.z); for (const side of [-1, 1]) { roadPosts.push([c.x - d.z * side * 11.2, .36, c.z + d.x * side * 11.2, .1, .72, .13, a]); reflectors.push([c.x - d.z * side * 11.2, .61, c.z + d.x * side * 11.2, .13, .14, .16, a]); } }
 instanceBoxes('Track delineators', roadPosts, material('#b9b6a9', .76), false); instanceBoxes('Road reflectors', reflectors, cyanLight, false);
 // Continuous curved Armco on the outside of the far bends, with matching posts.
 const barriers = [], barrierSupports = [];
 for (const [from, to] of [[.12, .34], [.53, .8]]) {
  const count = Math.ceil((to - from) * 390);
  for (let i = 0; i < count; i++) { const t = from + (to - from) * i / count, c = curve.getPointAt(t), d = curve.getTangentAt(t), a = Math.atan2(d.x, d.z), x = c.x - d.z * 14.7, z = c.z + d.x * 14.7;
   barriers.push([x, .65, z, .12, .30, 2.24, a], [x, .91, z, .12, .13, 2.24, a]); if (i % 2 === 0) barrierSupports.push([x, .46, z, .14, .92, .18, a]);
  }
 }
 for(const e of barriers)obstacles.push({x:e[0],z:e[2],halfX:e[3]/2,halfZ:e[5]/2,height:1.05,angle:e[6]});
 instanceBoxes('Satin steel Armco', barriers, steel, false); instanceBoxes('Armco uprights', barrierSupports, dark, false);

 const activeGate = new THREE.MeshStandardMaterial({ color: '#ff3854', emissive: '#ff173f', emissiveIntensity: 3.1, metalness: .45, roughness: .35 });
 const inactiveGate = new THREE.MeshStandardMaterial({color:'#3598ba',emissive:'#1e9bbd',emissiveIntensity:1.0,roughness:.3,metalness:.5}); const gates = [], gateStructure = [], gateFeet = [];
 for (let i = 0; i < 12; i++) {
  const t = i / 12, c = curve.getPointAt(t), d = curve.getTangentAt(t), g = new THREE.Group(); g.position.copy(c); g.rotation.y = Math.atan2(-d.x, -d.z); const parts = [];
  const highlights = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), inactiveGate, 3);
  for (let sideIndex=0;sideIndex<2;sideIndex++) { const side=sideIndex?1:-1, rotation=g.rotation.y, gx=c.x+Math.cos(rotation)*side*8.9,gz=c.z-Math.sin(rotation)*side*8.9;
   gateStructure.push([gx,3.75,gz,.46,7.5,.7,rotation]); gateFeet.push([gx,.07,gz,.48,.13,.65,rotation]);
   dummy.position.set(side*8.9,3.8,.37);dummy.rotation.set(0,0,0);dummy.scale.set(.11,6.9,.08);dummy.updateMatrix();highlights.setMatrixAt(sideIndex,dummy.matrix);
  }
  dummy.position.set(0,7.35,.37);dummy.scale.set(17.9,.11,.08);dummy.updateMatrix();highlights.setMatrixAt(2,dummy.matrix);dummy.scale.set(1,1,1);parts.push(highlights);g.add(highlights);gateStructure.push([c.x,7.45,c.z,18.3,.46,.7,g.rotation.y]);
  if (i === 0) {  const sign = mesh(new THREE.PlaneGeometry(7.4, .42), new THREE.MeshBasicMaterial({ map: label('ROADSTER   /   AFTERDARK', 1024, 64), side: THREE.DoubleSide }), 0, 7.45, .37); g.add(sign); }
  else { gateStructure.push([c.x+Math.cos(g.rotation.y)*8.9,6.35,c.z-Math.sin(g.rotation.y)*8.9,1.2,.72,.12,g.rotation.y]); const sign = mesh(new THREE.PlaneGeometry(1.1, .64), new THREE.MeshBasicMaterial({ map: label(String(i).padStart(2, '0'), 128, 80), side: THREE.DoubleSide }), 8.9, 6.35, .39); sign.castShadow=false;g.add(sign); }
  world.add(g); gates.push({ group: g, point: c, t, parts });
 }
 instanceBoxes('Checkpoint steelwork', gateStructure, dark, false); instanceBoxes('Checkpoint footings', gateFeet, steel, false);
 function setGate(index) { gates.forEach((g, i) => g.parts.forEach(p => { p.material = i === index ? activeGate : inactiveGate; })); } setGate(1);
 const start = curve.getPointAt(0), tan = curve.getTangentAt(0), yaw = Math.atan2(-tan.x, -tan.z);
 const checker = document.createElement('canvas'); checker.width = 256; checker.height = 32; const cc = checker.getContext('2d');
 for (let y = 0; y < 2; y++) for (let x = 0; x < 16; x++) { cc.fillStyle = (x + y) % 2 ? '#d8d7ca' : '#383d3d'; cc.fillRect(x * 16, y * 16, 16, 16); }
 const ct = new THREE.CanvasTexture(checker); ct.colorSpace = THREE.SRGBColorSpace; const stripe = mesh(new THREE.PlaneGeometry(15.4, 1.6), new THREE.MeshStandardMaterial({ map: ct, roughness: .95 })); stripe.rotation.set(-Math.PI / 2, 0, yaw); stripe.position.set(start.x, .028, start.z); stripe.castShadow = false; world.add(stripe);

 // Quiet modern test pavilion: honed concrete, dark fins, glazing, open bays.
 const concreteMap = surfaceTexture('concrete'); concreteMap.repeat.set(4, 4);
 const concrete = new THREE.MeshStandardMaterial({ map: concreteMap, color: '#354957', roughness: .4, metalness: .4 });
 const floorMap = concreteMap.clone(); floorMap.repeat.set(12, 10);
 const apron = mesh(new THREE.PlaneGeometry(104, 76), new THREE.MeshStandardMaterial({ map: floorMap, color: '#324452', roughness: .24, metalness: .38 }), 32, -.01, 151); apron.rotation.x = -Math.PI / 2; apron.castShadow = false; world.add(apron);
 const joints = [], parking = [];
 for (let x = -20; x <= 84; x += 8) joints.push([x, .003, 151, .035, .008, 76]);
 for (let z = 113; z <= 189; z += 8) joints.push([32, .003, z, 104, .008, .035]);
 for (let x = -10; x <= 14; x += 4) parking.push([x, .013, 132, .09, .012, 8]);
 instanceBoxes('Concrete expansion joints', joints, material('#4b5356', 1), false); instanceBoxes('Service bay markings', parking, lineMat, false);
 const plinth = mesh(new THREE.BoxGeometry(18, .12, 13), new THREE.MeshStandardMaterial({ color: '#424b50', roughness: .36, metalness: .14, map: concreteMap }), 30, .03, 134); world.add(plinth);

 // Bounded showroom-only planar reflection. Projection clipping follows the MIT
 // licensed Three.js Reflector algorithm (Three.js Authors); satin/fade shader is original.
 const reflectionTarget = new THREE.WebGLRenderTarget(768, 512, { type: THREE.HalfFloatType, depthBuffer: true, samples: 0 });
 const reflectionMatrix = new THREE.Matrix4(), reflectionCamera = new THREE.PerspectiveCamera();
 const reflectionMaterial = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { reflection: { value: reflectionTarget.texture }, reflectionMatrix: { value: reflectionMatrix } },
  vertexShader: 'uniform mat4 reflectionMatrix; varying vec4 vReflection; varying vec2 vFloorUv; void main(){vFloorUv=uv;vReflection=reflectionMatrix*vec4(position,1.);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform sampler2D reflection; varying vec4 vReflection; varying vec2 vFloorUv;
   void main(){vec2 uv=vReflection.xy/vReflection.w;vec2 px=vec2(3.2/768.,3.2/512.);vec3 c=texture2D(reflection,uv).rgb*.4;c+=(texture2D(reflection,uv+vec2(px.x,0.)).rgb+texture2D(reflection,uv-vec2(px.x,0.)).rgb+texture2D(reflection,uv+vec2(0.,px.y)).rgb+texture2D(reflection,uv-vec2(0.,px.y)).rgb)*.15;vec2 edge=smoothstep(vec2(0.),vec2(.12),vFloorUv)*smoothstep(vec2(0.),vec2(.12),1.-vFloorUv);gl_FragColor=vec4(c,edge.x*edge.y*.08);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`
 });
 const floorReflection = new THREE.Mesh(new THREE.PlaneGeometry(17.95, 12.95), reflectionMaterial); floorReflection.name='Satin showroom reflection'; floorReflection.rotation.x=-Math.PI/2;floorReflection.position.set(30,.093,134);floorReflection.renderOrder=2;world.add(floorReflection);
 const mirrorPosition=new THREE.Vector3(),cameraPosition=new THREE.Vector3(),normal=new THREE.Vector3(),view=new THREE.Vector3(),look=new THREE.Vector3(),target=new THREE.Vector3(),rotation=new THREE.Matrix4(),clipPlane=new THREE.Plane(),clip=new THREE.Vector4(),q=new THREE.Vector4();
 let reflectionBusy=false,lastReflection=-Infinity,reflectionEnabled=true,reflectionInterval=100;
 floorReflection.onBeforeRender=(activeRenderer,activeScene,camera)=>{
  if(!reflectionEnabled||reflectionBusy||performance.now()-lastReflection<reflectionInterval)return;lastReflection=performance.now();
  mirrorPosition.setFromMatrixPosition(floorReflection.matrixWorld);cameraPosition.setFromMatrixPosition(camera.matrixWorld);
  if(cameraPosition.distanceToSquared(mirrorPosition)>1800)return;
  rotation.extractRotation(floorReflection.matrixWorld);normal.set(0,0,1).applyMatrix4(rotation);view.subVectors(mirrorPosition,cameraPosition);if(view.dot(normal)>0)return;
  view.reflect(normal).negate().add(mirrorPosition);rotation.extractRotation(camera.matrixWorld);look.set(0,0,-1).applyMatrix4(rotation).add(cameraPosition);target.subVectors(mirrorPosition,look).reflect(normal).negate().add(mirrorPosition);
  reflectionCamera.position.copy(view);reflectionCamera.up.set(0,1,0).applyMatrix4(rotation).reflect(normal);reflectionCamera.lookAt(target);reflectionCamera.far=camera.far;reflectionCamera.updateMatrixWorld();reflectionCamera.projectionMatrix.copy(camera.projectionMatrix);
  reflectionMatrix.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1).multiply(reflectionCamera.projectionMatrix).multiply(reflectionCamera.matrixWorldInverse).multiply(floorReflection.matrixWorld);
  clipPlane.setFromNormalAndCoplanarPoint(normal,mirrorPosition).applyMatrix4(reflectionCamera.matrixWorldInverse);clip.set(clipPlane.normal.x,clipPlane.normal.y,clipPlane.normal.z,clipPlane.constant);const projection=reflectionCamera.projectionMatrix.elements;
  q.set((Math.sign(clip.x)+projection[8])/projection[0],(Math.sign(clip.y)+projection[9])/projection[5],-1,(1+projection[10])/projection[14]);clip.multiplyScalar(2/clip.dot(q));projection[2]=clip.x;projection[6]=clip.y;projection[10]=clip.z+1-.002;projection[14]=clip.w;
  reflectionBusy=true;floorReflection.visible=false;const oldTarget=activeRenderer.getRenderTarget(),oldXr=activeRenderer.xr.enabled,oldShadow=activeRenderer.shadowMap.autoUpdate;activeRenderer.xr.enabled=false;activeRenderer.shadowMap.autoUpdate=false;
  activeRenderer.setRenderTarget(reflectionTarget);activeRenderer.state.buffers.depth.setMask(true);if(activeRenderer.autoClear===false)activeRenderer.clear();activeRenderer.render(activeScene,reflectionCamera);
  activeRenderer.xr.enabled=oldXr;activeRenderer.shadowMap.autoUpdate=oldShadow;activeRenderer.setRenderTarget(oldTarget);if(camera.viewport!==undefined)activeRenderer.state.viewport(camera.viewport);floorReflection.visible=true;reflectionBusy=false;
 };
 const studio=new THREE.Group();studio.name='Photographic design studio';scene.add(studio);const studioFloor=mesh(new THREE.PlaneGeometry(160,160),new THREE.MeshStandardMaterial({color:0x20252a,metalness:.05,roughness:.58}),30,.09,134);studioFloor.rotation.x=-Math.PI/2;studioFloor.castShadow=false;studio.add(studioFloor);studio.add(floorReflection);const outdoorFog=scene.fog,outdoorBackground=scene.background;
 function setQuality(quality,coarse){reflectionEnabled=quality!=='low'&&!coarse;reflectionInterval=quality==='high'?70:150;reflectionTarget.setSize?.(quality==='high'?768:384,quality==='high'?512:256);}
 function setShowroom(visible){sun.color.set(visible?'#fff0d8':'#b2cdf4');hemisphereLight.color.set(visible?'#d8e5f2':'#a1c9ed');hemisphereLight.groundColor.set(visible?'#675742':'#101c2a');world.visible=!visible;studio.visible=visible;sky.visible=!visible;scene.fog=visible?new THREE.FogExp2('#11151a',.038):outdoorFog;scene.background=visible?new THREE.Color('#11151a'):outdoorBackground;floorReflection.visible=visible;lastReflection=-Infinity;}
 const inset = material('#343b3c', .55, .3); instanceBoxes('Presentation pad reveals', [[21.1, .096, 134, .04, .01, 12.8], [38.9, .096, 134, .04, .01, 12.8], [30, .096, 127.6, 17.8, .01, .04], [30, .096, 140.4, 17.8, .01, .04]], inset, false);
 const warmLight = cyanLight; instanceBoxes('Inset presentation lights', [[22, .10, 134, .035, .012, 8], [38, .10, 134, .035, .012, 8]], warmLight, false);
 const building = new THREE.Group(); building.position.set(36, 0, 143); building.name = 'Roadster design pavilion';
 building.add(mesh(new THREE.BoxGeometry(64, .12, 25), material('#40494d', .62, .12), 0, -.01, 0));
 building.add(mesh(new THREE.BoxGeometry(64, .44, 25), concrete, 0, 8.15, 0));
 building.add(mesh(new THREE.BoxGeometry(61, .23, 22), dark, 0, 7.82, 0));
 building.add(mesh(new THREE.BoxGeometry(60, 7.8, .7), dark, 0, 4, 10.6));
 const stone = material('#77766a', .88), glass = new THREE.MeshPhysicalMaterial({ color: '#85918d', roughness: .09, metalness: .55, transparent: true, opacity: .72, clearcoat: .7, clearcoatRoughness: .08 });
 for (const x of [29.8]) building.add(mesh(new THREE.BoxGeometry(.65, 7.8, 22), concrete, x, 4, 0));
 building.add(mesh(new THREE.BoxGeometry(13, 6.6, .2), glass, -23, 4.0, -8.8));


 for (const x of [-29, -25, -21, -17]) building.add(mesh(new THREE.BoxGeometry(.08, 6.8, .24), dark, x, 4, -8.95));
 for (const x of [-14.8, 12.4, 27.5]) building.add(mesh(new THREE.BoxGeometry(.22, 7.8, .28), steel, x, 4, -10.2));
 for (let i = 0; i < 14; i++) building.add(mesh(new THREE.BoxGeometry(.095, 1.1, 22), dark, -28 + i * 4.3, 7.4, 0));
 for (const x of [.5, 17]) { building.add(mesh(new THREE.BoxGeometry(11, .045, .11), warmLight, x, 7.64, -4)); building.add(mesh(new THREE.BoxGeometry(11, .045, .11), warmLight, x, 7.64, 4)); }
 const facadeFins = []; for (let i = 0; i < 67; i++) facadeFins.push([6.25 + i * .9, 4.3, 153.2, .1, 7.1, .18]); instanceBoxes('Rear pavilion fins', facadeFins, material('#424641', .72), true);
 const signMat = new THREE.MeshBasicMaterial({ map: label('R O A D S T E R', 1024, 128, '#e9e2cf', '#272d2b'), side: THREE.DoubleSide });
 const sign = mesh(new THREE.PlaneGeometry(11.2, 1.4), signMat, -23, 6.2, -9.03); sign.rotation.y = Math.PI; building.add(sign);
 const technicalSign = mesh(new THREE.PlaneGeometry(6.3, .45), new THREE.MeshBasicMaterial({ map: label('V E H I C L E    D Y N A M I C S', 1024, 80), side: THREE.DoubleSide }), 13, 5.2, 10.21); technicalSign.rotation.y = Math.PI; building.add(technicalSign);
 // Interior workshop equipment reads at driving scale without becoming clutter.
 for (const x of [1, 7, 18, 24]) { building.add(mesh(new THREE.BoxGeometry(2.6, 1.15, 1), dark, x, .85, 9.3)); building.add(mesh(new THREE.BoxGeometry(2.7, .09, 1.08), steel, x, 1.46, 9.3)); }
 world.add(building);
 building.updateWorldMatrix(true, true);
 const architectureBatches = new Map();
 building.traverse(o => { if (!o.isMesh) return; const key=o.material.uuid; if(!architectureBatches.has(key))architectureBatches.set(key,{material:o.material,geometries:[]}); const geometry=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()); geometry.applyMatrix4(o.matrixWorld); architectureBatches.get(key).geometries.push(geometry); });
 for(const batch of architectureBatches.values()) { const merged=new THREE.BufferGeometry(); for(const key of ['position','normal','uv']){const list=batch.geometries.map(g=>g.attributes[key]);const size=list[0].itemSize;const data=new Float32Array(list.reduce((n,a)=>n+a.array.length,0));let offset=0;for(const a of list){data.set(a.array,offset);offset+=a.array.length;}merged.setAttribute(key,new THREE.Float32BufferAttribute(data,size));}const object=mesh(merged,batch.material);object.name='Pavilion material batch';world.add(object);for(const g of batch.geometries)g.dispose();}
 world.remove(building);
 const backdropMap = label('R O A D S T E R', 1024, 160, '#a9afad', '#272e30');
 const backWall = mesh(new THREE.PlaneGeometry(18, 2.8), new THREE.MeshStandardMaterial({ map: backdropMap, roughness: .65 }), 37, 4.2, 153.22); backWall.rotation.y = Math.PI; world.add(backWall);
 instanceBoxes('Hangar edge lighting', [[36, 7.66, 131.25, 60, .055, .08], [36, .2, 152.95, 56, .045, .06]], warmLight, false);
 // Small service fixtures, bollards and architectural planting, all batched.
 const bollards = [], bollardCaps = [];
 for (const x of [-18, -12, -6, 0, 6, 54, 60, 66, 72, 78]) { bollards.push([x, .4, 116, .14, .8, .14]); bollardCaps.push([x, .72, 116, .15, .05, .15]); }
 instanceBoxes('Apron bollards', bollards, dark, false); instanceBoxes('Bollard reflectors', bollardCaps, lineMat, false);
 const planter = material('#5d625b', .88); for (const x of [-3, 81]) world.add(mesh(new THREE.BoxGeometry(4, .65, 21), planter, x, .25, 142));

 // Low-key physical air targets retain their original gameplay positions.
 const flightRings = [];
 for (let i = 0; i < 7; i++) {
  const g = new THREE.Group(); g.position.set(25 + Math.sin(i * 1.1) * 70, [3.2, 5, 7, 10, 14, 9, 4][i], 20 - i * 12); g.rotation.y = i * .32;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3, .075, 6, 64), new THREE.MeshStandardMaterial({ color: '#51dbf4', emissive: '#12bee9', emissiveIntensity: .5, roughness: .5, metalness: .45 })); g.add(ring);
  const tabs=new THREE.InstancedMesh(new THREE.BoxGeometry(.16,.38,.12),dark,4);for (let j = 0; j < 4; j++) { const a=j*TAU/4;dummy.position.set(Math.sin(a)*3,Math.cos(a)*3,0);dummy.rotation.set(0,0,-a);dummy.scale.set(1,1,1);dummy.updateMatrix();tabs.setMatrixAt(j,dummy.matrix); }g.add(tabs);
  world.add(g); flightRings.push(g);
 }

 // A continuous, irregular mountain basin with fractured ridgelines and strata.
 const terrainPositions = [], terrainUVs = [], terrainColors = [], terrainIndices = [], angular = 320, radial = 40;
 const cLow = new THREE.Color('#203349'), cHigh = new THREE.Color('#32465a'), cRock = new THREE.Color('#132438'), col = new THREE.Color();
 function terrainHeight(x, z) {
  const r = Math.hypot(x, z), a = Math.atan2(x, z), fade = smooth(clamp((r - 350) / 260));
  const crestRadius = 810 + Math.sin(a * 3 + 1.1) * 95 + Math.sin(a * 7 + .3) * 65;
  const crest = Math.exp(-Math.pow((r - crestRadius) / 240, 2));
  const ridge = .56 + .44 * (1 - Math.abs(2 * fbm(x * .007, z * .007) - 1));
  const spurs = fbm(x * .018 + 7, z * .018) - .5;
  const distant = Math.exp(-Math.pow((r - 1330) / 330, 2)) * (70 + 130 * fbm(x * .003 + 20, z * .003));
  return fade * (crest * (35 + ridge * 108 + 34 * Math.sin(a * 5 + 2) + 21 * Math.sin(a * 13 + 1.4)) + spurs * crest * 78 + distant) - 1.5;
 }
 for (let b = 0; b <= radial; b++) {
  const radius = 235 + Math.pow(b / radial, 1.3) * 1530;
  for (let i = 0; i <= angular; i++) {
   const a = i / angular * TAU, jitter = b === 0 ? 0 : Math.sin(a * 31 + b * .8) * 4, r = radius + jitter, x = Math.sin(a) * r, z = Math.cos(a) * r, y = terrainHeight(x, z);
   terrainPositions.push(x, y, z); terrainUVs.push(x / 65, z / 65);
   const detail = fbm(x * .031, z * .031), strata = Math.sin(y * .18 + noise(x * .015, z * .015) * 7) * .045;
   col.copy(cLow).lerp(cHigh, clamp(y / 300 * .6 + detail * .35 + strata)); col.lerp(cRock, clamp((detail - .52) * 1.3)); terrainColors.push(col.r, col.g, col.b);
  }
 }
 for (let b = 0; b < radial; b++) for (let i = 0; i < angular; i++) { const j = b * (angular + 1) + i, k = j + angular + 1; terrainIndices.push(j, k, j + 1, j + 1, k, k + 1); }
 const terrainGeometry = new THREE.BufferGeometry(); terrainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(terrainPositions, 3)); terrainGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(terrainPositions.length), 3)); terrainGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(terrainUVs, 2)); terrainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(terrainColors, 3)); terrainGeometry.setIndex(terrainIndices); terrainGeometry.computeVertexNormals();
 const mountainMap = surfaceTexture('ground'); mountainMap.repeat.set(1, 1); const mountains = mesh(terrainGeometry, new THREE.MeshStandardMaterial({ map: mountainMap, bumpMap: mountainMap, bumpScale: 2.1, vertexColors: true, roughness: 1, side: THREE.DoubleSide })); mountains.name = 'Fractured desert ranges'; mountains.castShadow = false; world.add(mountains);

 // A dense, layered research city built from instanced architectural modules.
 const cityMapCanvas=document.createElement('canvas');cityMapCanvas.width=128;cityMapCanvas.height=512;const cityCtx=cityMapCanvas.getContext('2d');cityCtx.fillStyle='#07111c';cityCtx.fillRect(0,0,128,512);
 for(let y=0;y<64;y++)for(let x=0;x<8;x++){const n=seeded(y*19+x*7+35);if(n<.47)continue;cityCtx.fillStyle=n>.88?'#a4d8e0':n>.7?'#236884':'#153948';cityCtx.fillRect(x*16+3,y*8+2,9,2);}
 for(let y=0;y<512;y+=64){cityCtx.fillStyle='#2b677b';cityCtx.fillRect(0,y,128,1);}const cityMap=new THREE.CanvasTexture(cityMapCanvas);cityMap.colorSpace=THREE.SRGBColorSpace;cityMap.anisotropy=4;
 const cityMaterial=new THREE.MeshStandardMaterial({color:'#7b96aa',map:cityMap,emissive:'#59bdd7',emissiveMap:cityMap,emissiveIntensity:.65,roughness:.3,metalness:.55});
 const cityMass=[],cityPlinths=[],cityCrowns=[],cyanSpines=[],redSpines=[],lamps=[],lampHeads=[],surfaceSpills=[];
 const signature=[[-230,95,138,25,24],[-256,122,93,20,20],[-222,52,72,30,20],[212,-36,114,22,24],[48,-245,151,24,23]];
 for(let i=0;i<100;i++){
  let x,z,h,w,d;if(i<signature.length){[x,z,h,w,d]=signature[i];}else{const a=seeded(i*11+8)*TAU,r=205+seeded(i*11+9)*420;x=Math.sin(a)*r;z=Math.cos(a)*r;h=25+Math.pow(seeded(i*11+10),1.5)*120;w=12+seeded(i+85)*22;d=12+seeded(i+86)*22;}
  if(z>110&&z<205&&x>-35&&x<110)continue;const a=(Math.floor(seeded(i+40)*4)*Math.PI/2);
  obstacles.push({x,z,halfX:w/2,halfZ:d/2,height:h,angle:a});
  cityMass.push([x,h/2,z,w,h,d,a]);cityMass.push([x+w*.12,h*.89,z-d*.08,w*.58,h*.24,d*.58,a]);cityPlinths.push([x,2,z,w+8,4,d+8,a]);cityCrowns.push([x,h+1,z,w+1,.8,d+1,a]);
  const lights=i%4===0?redSpines:cyanSpines;lights.push([x-w*.5-.1,h*.52,z-d*.5-.12,.16,h*.96,.18,a],[x+w*.5+.1,h*.52,z+d*.5+.12,.16,h*.96,.18,a]);
  if(i%3===0)lights.push([x,h+3.5,z,.18,6,.18]);
 }
 instanceBoxes('Illuminated research towers',cityMass,cityMaterial,false);instanceBoxes('Megastructure foundations',cityPlinths,material('#172735',.5,.5),false);instanceBoxes('Tower crown decks',cityCrowns,material('#2d4352',.35,.7),false);instanceBoxes('Cyan architectural spines',cyanSpines,cyanLight,false);instanceBoxes('Crimson beacon spines',redSpines,redLight,false);
 // High-speed transit ring and monumental supports frame the first straight.
 const transitPath=new THREE.CatmullRomCurve3(Array.from({length:80},(_,i)=>{const a=i/80*TAU;return new THREE.Vector3(Math.sin(a)*194,23+Math.sin(a*2)*2,Math.cos(a)*169);}),true);
 const transit=mesh(new THREE.TubeGeometry(transitPath,220,1.15,6,true),material('#233948',.3,.65));transit.castShadow=false;world.add(transit);
 const transitLight=mesh(new THREE.TubeGeometry(transitPath,220,.085,5,true),cyanLight);transitLight.position.y=1.25;transitLight.castShadow=false;world.add(transitLight);
 const supports=[];for(let i=0;i<18;i++){const p=transitPath.getPointAt(i/18);supports.push([p.x,p.y*.5,p.z,1.2,p.y,1.5]);}
 instanceBoxes('Transit pylons',supports,material('#273e4c',.38,.6),false);
 // Close-range lamps, reflections and utility towers maintain depth at speed.
 for(let i=0;i<44;i++){const t=i/44,c=curve.getPointAt(t),d=curve.getTangentAt(t),a=Math.atan2(d.x,d.z);for(const side of [-1,1]){const x=c.x-d.z*side*12.9,z=c.z+d.x*side*12.9;lamps.push([x,2.8,z,.15,5.6,.18,a]);lampHeads.push([x,5.55,z,.18,.12,2.6,a]);surfaceSpills.push([x,.024,z,5.5,9,a]);}}
 instanceBoxes('Track lighting masts',lamps,material('#253d4a',.4,.7),false);instanceBoxes('Track area light emitters',lampHeads,cyanLight,false);lightPools(surfaceSpills,'#00b8ed',.18);
 const portalSpills=gates.map(g=>[g.point.x,.038,g.point.z,18,4,g.group.rotation.y]);lightPools(portalSpills,'#0dbbec',.13);
 // Sculptural energy infrastructure in the infield, clear of gates and driving line.
 const facilities=[[-77,18,34],[-42,51,18],[85,30,28],[-15,-69,24]];
 const reactors=[],reactorRibs=[],reactorBands=[],reactorPools=[];
 for(const [x,z,h]of facilities){obstacles.push({x,z,halfX:4,halfZ:4,height:h});reactors.push([x,h*.5,z,8,h,8],[x,1.1,z,15,2.2,15]);for(let j=0;j<4;j++){const a=j*TAU/4;reactorRibs.push([x+Math.sin(a)*5,h*.5,z+Math.cos(a)*5,.3,h+.8,.3]);}reactorBands.push([x,h*.72,z-4.15,8,.18,.12],[x,h*.72,z+4.15,8,.18,.12],[x-4.15,h*.72,z,.12,.18,8],[x+4.15,h*.72,z,.12,.18,8]);reactorPools.push([x,.021,z,28,28]);}
 instanceBoxes('Infield power modules',reactors,cityMaterial,false);instanceBoxes('Infield exoskeleton ribs',reactorRibs,material('#547381',.3,.6),false);instanceBoxes('Reactor status bands',reactorBands,redLight,false);lightPools(reactorPools,'#cf163d',.15);
 // Local luminous volumes soften fixtures without an expensive full-screen bloom.
 const haloEntries=lampHeads.map(e=>[e[0],e[1],e[2],e[3]*3,e[4]*4,e[5]*1.2,e[6]]);instanceBoxes('Soft fixture halos',haloEntries,cyanGlow,false);
 const panelJoints=[];for(let x=-320;x<=320;x+=24)panelJoints.push([x,-.045,0,.035,.01,640]);for(let z=-320;z<=320;z+=24)panelJoints.push([0,-.045,z,640,.01,.035]);instanceBoxes('Campus deck panel seams',panelJoints,material('#0d1c2a',.4,.4),false);

 function nearest(x, z) { let min = Infinity, idx = 0; for (let i = 0; i < N; i += 2) { const d = (center[i].x - x) ** 2 + (center[i].z - z) ** 2; if (d < min) { min = d; idx = i; } } return { distance: Math.sqrt(min), index: idx, t: idx / N, point: center[idx] }; }
 return { world, obstacles, curve, center, gates, flightRings, setGate, setShowroom, setQuality, nearest, sun, sky, spawn: { x: start.x - tan.x * 7, z: start.z - tan.z * 7, yaw }, garage: { x: 30, z: 134, yaw: -Math.PI * .17 }, trackWidth: width };
}
