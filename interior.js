/** Sculpted two-seat cabin, in metres, facing -Z. No external assets required.
 * The returned group is rigid and material-batched, including UVs and normals. */
export function createInterior(THREE) {
  const root = new THREE.Group();
  root.name = 'Sculpted Roadster cockpit';
  const materials = {
    leather: new THREE.MeshStandardMaterial({ color: 0xc6c9c5, roughness: .67, metalness: .015 }),
    insert: new THREE.MeshStandardMaterial({ color: 0x7e8788, roughness: .89 }),
    shell: new THREE.MeshStandardMaterial({ color: 0x171d20, roughness: .4, metalness: .13 }),
    suede: new THREE.MeshStandardMaterial({ color: 0x22282c, roughness: .96 }),
    dash: new THREE.MeshStandardMaterial({ color: 0x30383d, roughness: .73, metalness: .025 }),
    black: new THREE.MeshStandardMaterial({ color: 0x0c1115, roughness: .61, metalness: .09 }),
    alloy: new THREE.MeshStandardMaterial({ color: 0x78878d, roughness: .31, metalness: .83 }),
    stitch: new THREE.MeshStandardMaterial({ color: 0x6b7473, roughness: .92 }),
    red: new THREE.MeshStandardMaterial({ color: 0x831e20, roughness: .44, metalness: .16, emissive: 0x3b0809, emissiveIntensity: .24 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x070d12, roughness: .15, metalness: .12, clearcoat: 1, clearcoatRoughness: .08 }),
    ui: new THREE.MeshBasicMaterial({ color: 0x76949c, toneMapped: false }),
    uiDim: new THREE.MeshBasicMaterial({ color: 0x233f48, toneMapped: false }),
  };

  // Subtle deterministic leather grain. This uses a GPU texture rather than
  // extra geometry; no canvas, image downloads, or browser globals are needed.
  const grainSize = 64, grainData = new Uint8Array(grainSize * grainSize * 4);
  let seed = 1427;
  for (let i = 0; i < grainData.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = 154 + (seed >>> 26);
    grainData[i] = grainData[i + 1] = grainData[i + 2] = value;
    grainData[i + 3] = 255;
  }
  const grain = new THREE.DataTexture(grainData, grainSize, grainSize, THREE.RGBAFormat);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(9, 9);
  grain.magFilter = THREE.LinearFilter;
  grain.minFilter = THREE.LinearMipmapLinearFilter;
  grain.generateMipmaps = true;
  grain.needsUpdate = true;
  materials.leather.bumpMap = grain; materials.leather.bumpScale = .00032;
  materials.insert.bumpMap = grain; materials.insert.bumpScale = .0006;

  function mesh(geometry, material, parent = root) {
    const item = new THREE.Mesh(geometry, material);
    item.castShadow = item.receiveShadow = true;
    parent.add(item);
    return item;
  }
  function box(w, h, d, material, x, y, z, parent = root) {
    const item = mesh(new THREE.BoxGeometry(w, h, d), material, parent);
    item.position.set(x, y, z);
    return item;
  }
  // Analytic rounded cuboid with continuous corner normals. The wide central
  // regions stay planar; every edge receives two genuine bevel intervals.
  function roundedGeometry(w, h, d, radius) {
    const half = [w / 2, h / 2, d / 2], r = Math.min(radius, ...half.map(v => v * .95));
    const positions = [], normals = [], uvs = [], indices = [];
    const cuts = half.map(v => [-v, -v + r * .293, -v + r, v - r, v - r * .293, v]);
    const faces = [[0, 1, 2, 1], [0, 2, 1, -1], [1, 2, 0, 1], [1, 0, 2, -1], [2, 0, 1, 1], [2, 1, 0, -1]];
    for (const [axis, u, v, sign] of faces) {
      const start = positions.length / 3;
      for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) {
        const p = [0, 0, 0]; p[axis] = sign * half[axis]; p[u] = cuts[u][i]; p[v] = cuts[v][j];
        const core = p.map((value, k) => Math.max(-half[k] + r, Math.min(half[k] - r, value)));
        const n = p.map((value, k) => value - core[k]), length = Math.hypot(...n);
        for (let k = 0; k < 3; k++) { n[k] /= length; positions.push(core[k] + n[k] * r); normals.push(n[k]); }
        uvs.push(i / 5, j / 5);
      }
      for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
        const a = start + j * 6 + i, b = a + 1, c = a + 6, e = c + 1;
        indices.push(a, b, c, b, e, c);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    return geometry;
  }
  function rounded(w, h, d, r, material, x, y, z, parent = root) {
    const item = mesh(roundedGeometry(w, h, d, r), material, parent);
    item.position.set(x, y, z); return item;
  }
  function curve(points, radius, material, parent = root, segments = 20, sides = 5) {
    const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    return mesh(new THREE.TubeGeometry(path, segments, radius, sides, false), material, parent);
  }
  // A superellipse loft provides a soft stitched furniture silhouette instead
  // of rectangular seat blocks. Each row is [height, width, depth, centreZ].
  function loft(rows, material, parent = root, exponent = .5) {
    const p = [], uv = [], indices = [], sides = 24;
    rows.forEach(([y, w, d, z], row) => {
      for (let i = 0; i <= sides; i++) {
        const a = Math.PI * 2 * i / sides, c = Math.cos(a), s = Math.sin(a);
        p.push(Math.sign(c) * Math.pow(Math.abs(c), exponent) * w / 2, y, z + Math.sign(s) * Math.pow(Math.abs(s), exponent) * d / 2);
        uv.push(i / sides, row / (rows.length - 1));
        if (row && i < sides) {
          const k = row * (sides + 1) + i, b = k - sides - 1;
          indices.push(k, k + 1, b, k + 1, b + 1, b);
        }
      }
    });
    // End caps are inset under adjacent upholstery but remain closed.
    for (const row of [0, rows.length - 1]) {
      const [y, , , z] = rows[row], centre = p.length / 3;
      p.push(0, y, z); uv.push(.5, .5);
      for (let i = 0; i < sides; i++) {
        const a = row * (sides + 1) + i;
        if (row) indices.push(centre, a + 1, a); else indices.push(centre, a, a + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return mesh(geometry, material, parent);
  }

  // The tub is below the seat cushion. Footwells continue under the dashboard.
  rounded(1.43, .055, 1.69, .025, materials.suede, 0, .519, -.01);
  rounded(1.35, .20, .10, .025, materials.black, 0, .64, .69);
  for (const side of [-1, 1]) {
    const seat = new THREE.Group(); seat.name = side < 0 ? 'Driver sport seat' : 'Passenger sport seat';
    seat.position.x = side * .36; root.add(seat);
    rounded(.435, .075, .51, .035, materials.shell, 0, .568, .035, seat);
    rounded(.315, .060, .455, .028, materials.leather, 0, .607, .015, seat);
    const cushion = rounded(.250, .032, .390, .014, materials.insert, 0, .638, -.001, seat);
    const cp = cushion.geometry.attributes.position;
    for(let i=0;i<cp.count;i++) {
      const x=cp.getX(i),z=cp.getZ(i);
      cp.setX(i,x*(.96+.04*Math.cos(z/.195*Math.PI*.5)));
      cp.setY(i,cp.getY(i)+.004*(1-(x/.125)**2));
    }
    cushion.geometry.computeVertexNormals();
    // Separate raised thigh supports cast narrow, convincing shadows.
    for (const s of [-1, 1]) {
      const thigh = rounded(.085, .112, .440, .039, materials.leather, s * .168, .635, .035, seat);
      thigh.rotation.z = -s * .13;
      curve([[s * .157, .684, -.158], [s * .161, .692, -.04], [s * .161, .692, .145], [s * .146, .674, .218]], .00135, materials.stitch, seat, 18, 4);
    }
    // The black shell peeks around pale shoulder wings and follows the recline.
    loft([[.620,.338,.094,.293],[.656,.385,.110,.313],[.76,.422,.102,.337],[.97,.438,.093,.375],[1.055,.386,.085,.395],[1.085,.300,.068,.407]], materials.shell, seat);
    loft([[.644,.286,.071,.269],[.673,.326,.080,.282],[.80,.345,.080,.306],[.99,.334,.078,.338],[1.057,.267,.065,.355],[1.073,.235,.030,.365]], materials.leather, seat);
    const padRows = [[.692,.175,.012,.249],[.712,.235,.025,.254],[.80,.247,.032,.269],[.94,.238,.030,.293],[1.018,.215,.022,.306],[1.030,.183,.010,.309]];
    loft(padRows, materials.insert, seat, .42);
    // Pronounced lumbar/shoulder bolsters; widths taper towards the integrated headrest.
    for (const s of [-1, 1]) {
      const bolster = loft([[.647,.037,.055,.242],[.68,.073,.110,.246],[.79,.083,.121,.268],[.94,.079,.109,.298],[1.02,.068,.090,.326],[1.055,.022,.032,.354]], materials.leather, seat, .67);
      bolster.position.x = s * .165;
      curve([[s*.146,.678,.195],[s*.143,.77,.205],[s*.146,.94,.246],[s*.143,1.025,.294]], .00145, materials.stitch, seat, 24, 4);
    }
    loft([[1.038,.126,.060,.397],[1.063,.193,.090,.402],[1.092,.210,.101,.408],[1.155,.200,.097,.416],[1.181,.169,.073,.420],[1.190,.123,.030,.422]],materials.leather,seat,.6);
    rounded(.139, .077, .012, .0055, materials.insert, 0, 1.119, .359, seat).rotation.x = .12;
    curve([[-.075,1.081,.355],[-.079,1.157,.369],[0,1.176,.380],[.079,1.157,.369],[.075,1.081,.355]], .0013, materials.stitch, seat, 26, 4);
    // Subtle horizontal stitch channels across the back insert.
    for (const y of [.755, .818, .881, .944]) {
      let row=0;while(row<padRows.length-2&&y>padRows[row+1][0])row++;
      const a=padRows[row],b=padRows[row+1],t=(y-a[0])/(b[0]-a[0]);
      const z=a[3]+(b[3]-a[3])*t-(a[2]+(b[2]-a[2])*t)/2-.0011;
      curve([[-.109,y,z],[0,y-.003,z-.001],[.109,y,z]], .0009, materials.stitch, seat, 10, 4);
    }
    // Harness slots, belt webbing and a restrained red release button.
    for (const s of [-1,1]) rounded(.059,.015,.008,.0035,materials.black,s*.101,1.038,.320,seat);
    rounded(.026,.066,.034,.010,materials.black,-side*.239,.636,.168,seat).rotation.z=side*.16;
    rounded(.019,.011,.023,.0045,materials.red,-side*.242,.667,.169,seat);
    curve([[side*.202,1.044,.401],[side*.218,.89,.36],[side*.23,.672,.151]],.009,materials.black,seat,14,5);
  }

  // Wide, shallow padded dash with a continuous floating horizontal vent slot.
  const dashTop = rounded(1.42, .105, .300, .040, materials.dash, 0, .800, -.669);
  const positions = dashTop.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    positions.setY(i, positions.getY(i) + .012 * (1 - (x/.71)**2));
    positions.setZ(i, z + .026 * (1 - (x/.71)**2));
  }
  positions.needsUpdate = true; dashTop.geometry.computeVertexNormals();
  rounded(1.36,.060,.057,.018,materials.black,0,.754,-.510);
  rounded(1.29,.012,.012,.005,materials.alloy,0,.784,-.476);
  for (const side of [-1,1]) {
    rounded(.444,.023,.010,.0045,materials.shell,side*.415,.754,-.475);
    for (let i=0;i<3;i++) box(.417,.002,.010,materials.black,side*.415,.746+i*.007,-.467);
    curve([[side*.05,.850,-.539],[side*.34,.842,-.553],[side*.66,.831,-.550]],.0015,materials.stitch,root,24,4);
  }

  // A narrow rising console leaves clear footwells and room between the seats.
  rounded(.183,.093,.823,.035,materials.shell,0,.573,-.112);
  const bridge = rounded(.162,.051,.565,.022,materials.black,0,.624,-.219); bridge.rotation.x = -.15;
  rounded(.171,.066,.278,.027,materials.leather,0,.662,.219);
  rounded(.116,.008,.161,.0038,materials.glass,0,.677,-.203).rotation.x=-.15;
  for (const s of [-1,1]) curve([[s*.084,.603,-.538],[s*.085,.635,-.09],[s*.087,.653,.112]],.0025,materials.alloy,root,20,5);
  // Small recessed cup well behind the control surface.
  const cup = mesh(new THREE.CylinderGeometry(.034,.031,.018,24),materials.black); cup.position.set(0,.635,.004);
  const cupRim = mesh(new THREE.TorusGeometry(.034,.003,5,24),materials.alloy); cupRim.rotation.x=Math.PI/2;cupRim.position.set(0,.645,.004);

  // Compact portrait screen, tilted towards the occupants. UI is intentionally
  // quiet: a line drawing of the car, status ticks and two bottom touch controls.
  const screen = new THREE.Group(); screen.position.set(.012,.866,-.498);screen.rotation.x=-.10;root.add(screen);
  rounded(.257,.207,.023,.009,materials.black,0,0,0,screen);
  rounded(.239,.189,.004,.0018,materials.glass,0,0,.013,screen);
  box(.039,.003,.001,materials.ui,-.084,.077,.0155,screen);
  box(.018,.003,.001,materials.uiDim,.089,.077,.0155,screen);
  curve([[-.087,.008,.016],[-.068,.020,.016],[-.036,.027,.016],[-.015,.047,.016],[.042,.047,.016],[.071,.028,.016],[.095,.017,.016],[.092,-.007,.016],[-.087,-.007,.016],[-.087,.008,.016]],.0013,materials.uiDim,screen,40,4);
  curve([[-.030,.027,.016],[-.011,.041,.016],[.039,.041,.016],[.061,.027,.016],[-.030,.027,.016]],.0008,materials.ui,screen,18,4);
  for (const x of [-.052,.061]) {const wheel=mesh(new THREE.TorusGeometry(.015,.0014,4,16),materials.ui,screen);wheel.position.set(x,-.006,.017);}
  for (let i=0;i<5;i++) box(.011,.002,.001, i===0?materials.ui:materials.uiDim,-.085+i*.023,-.047,.016,screen);
  for (const s of [-1,1]) {box(.034,.003,.001,materials.ui,s*.073,-.076,.016,screen);box(.015,.0015,.001,materials.uiDim,s*.073,-.085,.016,screen);}

  // Roadster-style squared yoke: two thick sculpted grips and a lower bridge,
  // rather than a circular steering wheel. Soft alloy edges catch light.
  const yoke = new THREE.Group(); yoke.position.set(-.36,.865,-.386); yoke.rotation.x=-.12;root.add(yoke);
  rounded(.052,.052,.106,.021,materials.black,0,-.021,-.068,yoke).rotation.x=.26;
  for (const s of [-1,1]) {
    curve([[s*.072,.078,0],[s*.130,.078,0],[s*.153,.052,0],[s*.156,-.049,0],[s*.132,-.076,0],[s*.074,-.073,0]],.018,materials.black,yoke,26,8);
    curve([[s*.077,.090,-.004],[s*.138,.085,-.004],[s*.169,.054,-.004],[s*.171,-.055,-.004],[s*.143,-.089,-.004],[s*.075,-.086,-.004]],.0045,materials.alloy,yoke,24,5);
    const spoke=rounded(.082,.023,.029,.010,materials.shell,s*.084,-.014,.004,yoke);spoke.rotation.z=s*.12;
    rounded(.031,.024,.012,.005,materials.black,s*.084,.012,.024,yoke);
    box(.011,.002,.001,materials.uiDim,s*.084,.015,.031,yoke);
  }
  rounded(.162,.033,.037,.015,materials.black,0,-.072,0,yoke);
  const hub = rounded(.127,.105,.046,.021,materials.dash,0,-.004,.016,yoke);
  const hp = hub.geometry.attributes.position;
  for(let i=0;i<hp.count;i++) hp.setX(i,hp.getX(i)*(1+hp.getY(i)*2.0));
  hp.needsUpdate=true;hub.geometry.computeVertexNormals();
  box(.012,.017,.001,materials.alloy,0,.006,.040,yoke);
  box(.030,.003,.001,materials.alloy,0,.015,.041,yoke);

  // Clean door cards with padded rails, inset pulls and a very muted red line.
  // All trims stay below the window sills so they never touch the outer glazing.
  for (const side of [-1,1]) {
    rounded(.075,.183,1.075,.033,materials.dash,side*.747,.692,-.015);
    rounded(.063,.052,1.128,.022,materials.suede,side*.747,.801,-.028);
    rounded(.026,.079,.708,.012,materials.black,side*.707,.653,.072);
    curve([[side*.707,.730,-.413],[side*.704,.744,-.300],[side*.704,.729,.180],[side*.705,.706,.442]],.005,materials.red,root,30,5);
    curve([[side*.704,.716,-.404],[side*.699,.723,-.286],[side*.699,.708,.174],[side*.703,.687,.421]],.007,materials.alloy,root,30,5);
    rounded(.030,.024,.184,.011,materials.black,side*.689,.709,-.115);
    rounded(.018,.014,.099,.006,materials.alloy,side*.674,.711,-.125);
    curve([[side*.714,.816,-.486],[side*.713,.823,-.2],[side*.713,.818,.455]],.0013,materials.stitch,root,26,4);
  }

  // One draw per material. Preserve UVs for the leather grain and move normals
  // into root space. No custom shaders or Three.js addon imports are required.
  root.updateMatrixWorld(true);
  const batches = new Map();
  root.traverse(item => {
    if (!item.isMesh) return;
    if (!batches.has(item.material)) batches.set(item.material, []);
    const g = item.geometry.index ? item.geometry.toNonIndexed() : item.geometry.clone();
    g.applyMatrix4(item.matrixWorld);
    if (!g.attributes.normal) g.computeVertexNormals();
    batches.get(item.material).push(g);
  });
  root.traverse(item => { if (item.isMesh) item.geometry.dispose(); });
  root.clear();
  let triangles = 0;
  for (const [material, geometries] of batches) {
    const count = geometries.reduce((n,g) => n + g.attributes.position.count,0);
    const positions = new Float32Array(count*3), normals = new Float32Array(count*3), uvs = new Float32Array(count*2);
    let offset = 0;
    for (const g of geometries) {
      positions.set(g.attributes.position.array,offset*3); normals.set(g.attributes.normal.array,offset*3);
      if (g.attributes.uv) uvs.set(g.attributes.uv.array,offset*2);
      offset+=g.attributes.position.count; g.dispose();
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('normal',new THREE.BufferAttribute(normals,3));g.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
    g.computeBoundingSphere();g.computeBoundingBox();
    const item=mesh(g,material);item.name='Cabin '+Object.keys(materials).find(key=>materials[key]===material);
    triangles+=count/3;
  }
  root.userData = { triangles, drawCalls: root.children.length, grainTexture: grain };
  return root;
}
