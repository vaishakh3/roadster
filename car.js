import * as THREE from './vendor/three.module.js';
import { createInterior } from './interior.js';
import { addFlightHardware } from './propulsion-mesh.js';

/** Original Roadster-inspired concept model.
 * The model points down -Z. All measurements are in meters. */
export function createCar() {
  const car = new THREE.Group();
  car.name = 'Roadster';
  const paint = new THREE.MeshPhysicalMaterial({color: 0xeeefec, metalness:.46, roughness:.215, envMapIntensity:1.35, clearcoat:1, clearcoatRoughness:.045, side:THREE.DoubleSide});
  const black = new THREE.MeshStandardMaterial({color:0x080b0d, metalness:.35, roughness:.31, side:THREE.DoubleSide});
  const intakeVoid=new THREE.MeshStandardMaterial({color:0x010203,metalness:0,roughness:1,side:THREE.DoubleSide});
  const carbon = new THREE.MeshStandardMaterial({color:0x10171b, metalness:.62, roughness:.33, side:THREE.DoubleSide});
  carbon.onBeforeCompile=shader=>{shader.vertexShader='varying vec3 vCarbonPosition;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCarbonPosition=position;');shader.fragmentShader='varying vec3 vCarbonPosition;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nvec2 weaveUv=vec2(vCarbonPosition.x+vCarbonPosition.z,vCarbonPosition.y+vCarbonPosition.z)*160.;float weave=mod(floor(weaveUv.x)+floor(weaveUv.y),2.);float strand=.5+.5*sin((weave>.5?weaveUv.x:weaveUv.y)*6.283185);diffuseColor.rgb*=.84+strand*.22;');};
  const rubber = new THREE.MeshStandardMaterial({color:0x111315, roughness:.86});
  rubber.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vTyre;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTyre=position;');
    shader.fragmentShader='varying vec3 vTyre;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float a=atan(vTyre.y,vTyre.z);float shoulder=1.-smoothstep(.085,.125,abs(vTyre.x));
      float ribs=smoothstep(.84,.98,cos(vTyre.x*150.));
      float cuts=smoothstep(.89,.99,cos(a*48.+abs(vTyre.x)*30.));
      diffuseColor.rgb*=1.-shoulder*(ribs*.35+cuts*.3);`);
  };
  const alloy = new THREE.MeshStandardMaterial({color:0x9aabae, metalness:.96, roughness:.22, side:THREE.DoubleSide});
  const darkAlloy = new THREE.MeshStandardMaterial({color:0x252e32, metalness:.92, roughness:.3, side:THREE.DoubleSide});
  const chrome = new THREE.MeshStandardMaterial({color:0xbac6c7, metalness:1, roughness:.15});
  const brake = new THREE.MeshStandardMaterial({color:0x70251b, metalness:.55, roughness:.35});
  const glass = new THREE.MeshPhysicalMaterial({color:0x202529, metalness:.08, roughness:.045, transmission:.28, thickness:.05, ior:1.5, attenuationColor:0xa3abaa, attenuationDistance:1.6, clearcoat:.6, clearcoatRoughness:.10, side:THREE.DoubleSide, envMapIntensity:1.3, iridescence:0, iridescenceIOR:1.24, iridescenceThicknessRange:[220,260]});
  const headlamp = new THREE.MeshStandardMaterial({color:0xe4f9ff, emissive:0xc4e9ff, emissiveIntensity:3.5, roughness:.14, side:THREE.DoubleSide});
  const tail = new THREE.MeshStandardMaterial({color:0xb5060c, emissive:0xff0816, emissiveIntensity:2.3, roughness:.17});
  const amber = new THREE.MeshStandardMaterial({color:0xffae46, emissive:0xff760c, emissiveIntensity:1.8});
  const lampLens=new THREE.MeshPhysicalMaterial({color:0xc5d1d4,metalness:.08,roughness:.055,clearcoat:1,clearcoatRoughness:.035,transparent:true,opacity:.26,depthWrite:false,side:THREE.DoubleSide,envMapIntensity:1.4});
  const wheels = [], brakeLights = [], thrusterJets = [];

  function mesh(geometry, material, parent=car) {
    const m = new THREE.Mesh(geometry,material);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function box(w,h,d,material,x=0,y=0,z=0,parent=car) {
    const m=mesh(new THREE.BoxGeometry(w,h,d), material,parent); m.position.set(x,y,z);return m;
  }
  function poly(points, material, parent=car) {
    const vertices=[];
    for(let i=1;i<points.length-1;i++) vertices.push(...points[0],...points[i],...points[i+1]);
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();return mesh(g,material,parent);
  }
  function wheelPanel(points,material,parent){const shape=new THREE.Shape();points.forEach((p,i)=>{i?shape.lineTo(-p[2],p[1]):shape.moveTo(-p[2],p[1])});shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth:.016,bevelEnabled:true,bevelThickness:.0035,bevelSize:.0035,bevelSegments:2,steps:1,curveSegments:8});g.rotateY(Math.PI/2);g.translate(points[0][0]-.008,0,0);return mesh(g,material,parent);}
  function line(points,material=black,r=.005,parent=car) {
    const c=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal');
    return mesh(new THREE.TubeGeometry(c,Math.max(6,Math.min(64,points.length*4)),r,5,false),material,parent);
  }
  function cyl(radius,length,material,x,y,z,axis='x',parent=car,segments=48) {
    const m=mesh(new THREE.CylinderGeometry(radius,radius,length,segments),material,parent);
    if(axis==='x')m.rotation.z=Math.PI/2;
    else if(axis==='z')m.rotation.x=Math.PI/2;
    m.position.set(x,y,z);return m;
  }
  function torus(radius,tube,material,x,y,z,axis='x',parent=car) {
    const m=mesh(new THREE.TorusGeometry(radius,tube,6,36),material,parent);
    if(axis==='x')m.rotation.y=Math.PI/2;
    else if(axis==='y')m.rotation.x=Math.PI/2;
    m.position.set(x,y,z);return m;
  }
  function strip(rows,material,parent=car) {
    const positions=[], indices=[];const cols=rows[0].length;
    for(const row of rows)for(const p of row)positions.push(...p);
    for(let i=0;i<rows.length-1;i++)for(let j=0;j<cols-1;j++){
      const a=i*cols+j,b=a+1,c=a+cols,d=c+1;
      indices.push(a,c,b,b,c,d);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return mesh(g,material,parent);
  }

  // Continuous, crease-controlled body patches. Dimensions are an original
  // Roadster-inspired interpretation, not manufacturer CAD.
  const frontZ=-1.45,rearZ=1.48, wheelY=.39, archR=.432;
  // z, outer half-width, hood/deck centre height, shoulder height, hood half-width
  const stations=[
    [-2.38,.93,.535,.535,.745],[-2.23,1.025,.585,.685,.724],
    [-1.92,1.065,.665,.800,.682],[-1.45,1.07,.746,.855,.620],
    [-1.02,1.048,.801,.858,.565],[-.66,1.016,.800,.868,.61],
    [0,1.008,.790,.880,.63],[.6,1.042,.814,.905,.64],
    [1.10,1.077,.833,.923,.64],[1.48,1.087,.826,.931,.65],
    [1.95,1.065,.783,.865,.72],[2.28,1.032,.744,.772,.76],
    [2.39,1.015,.733,.747,.77]
  ];
  function station(z){
    let i=0;while(i<stations.length-2&&z>stations[i+1][0])i++;
    const a=stations[i],b=stations[i+1],prev=stations[Math.max(0,i-1)],next=stations[Math.min(stations.length-1,i+2)];
    const t=THREE.MathUtils.clamp((z-a[0])/(b[0]-a[0]),0,1),h=b[0]-a[0];
    return a.map((v,j)=>j===0?z:(2*t*t*t-3*t*t+1)*v+(t*t*t-2*t*t+t)*h*(b[j]-prev[j])/(b[0]-prev[0])+(-2*t*t*t+3*t*t)*b[j]+(t*t*t-t*t)*h*(next[j]-a[j])/(next[0]-a[0]));
  }
  function bottom(z){for(const center of [frontZ,rearZ])if(Math.abs(z-center)<archR)return wheelY+Math.sqrt(archR*archR-(z-center)**2);return z<-1.88?.31:.222;}
  const zs=new Set([-1.03,.57,1.55,1.9]);for(let i=0;i<=80;i++)zs.add(-2.38+4.77*i/80);
  for(const z0 of [frontZ,rearZ])for(let i=0;i<=32;i++)zs.add(z0+Math.cos(Math.PI*i/32)*archR);
  const samples=[...zs].sort((a,b)=>a-b).map(station);
  function sideX(z,u){const w=station(z)[1],door=THREE.MathUtils.smoothstep(z,-1.18,-.82)*(1-THREE.MathUtils.smoothstep(z,.75,1.17));return w*(.972+.028*Math.sin(u*Math.PI*.5))-.014*u*u-.035*THREE.MathUtils.smoothstep(z,1.95,2.39)*u*u-.068*door*Math.pow(Math.sin(Math.PI*u),2);}
  // Central panels stop at the glazing; no duplicate painted surfaces beneath
  // the canopy or flying buttress can cause flickering/intersection highlights.
  const centerRow=([z,w,h,shoulder,inner])=>{
    const half=z>=1.9?THREE.MathUtils.lerp(.44,.77,(z-1.9)/.49):z>=1.55?THREE.MathUtils.lerp(.364,.44,(z-1.55)/.35):inner,row=[];
    for(let j=0;j<=16;j++){const t=j/16*2-1;row.push([t*half,h+.045*(1-t*t)*THREE.MathUtils.smoothstep(z,-2.38,-1.65),z]);}return row;
  };
  function hoodHeight(x,z){
    const [_,w,h,sh,inner]=station(z), t=Math.abs(x)/(w*.972), f=THREE.MathUtils.smoothstep(Math.abs(x),inner*.72,w*.972);
    const crown=.023*(1-t*t)*THREE.MathUtils.smoothstep(z,-2.38,-1.65);
    return THREE.MathUtils.lerp(h,sh,f)+crown;
  }
  const bonnet = samples.filter(row=>row[0]<=-1.03).map(([z,w,h,sh,inner])=>{
    const row=[];
    for(let j=0;j<=40;j++){
      const t=j/40*2-1,x=t*w*.972;
      row.push([x,hoodHeight(x,z),z]);
    }
    return row;
  });
  strip(bonnet,paint);
  strip(samples.filter(row=>row[0]>=1.55).map(centerRow),paint);
  for(const side of [-1,1]){
    // Deliberate diagonal shoulder crease and gently rolled outer fender.
    const shoulderRow=([z,w,h,sh,inner])=>{
      if(z>=1.9)inner=THREE.MathUtils.lerp(.44,.77,(z-1.9)/.49);
      const row=[];for(let j=0;j<=8;j++){const u=j/8;const x=THREE.MathUtils.lerp(inner,w*.972,u),crown=z>=1.9?.012:.033;const y=THREE.MathUtils.lerp(h,sh,u)+crown*Math.sin(Math.PI*u);row.push([side*x,y,z]);}return row;
    };
    strip(samples.filter(row=>row[0]>=-1.03 && row[0]<=.57).map(shoulderRow),paint);
    strip(samples.filter(row=>row[0]>=1.9).map(shoulderRow),paint);
    strip(samples.map(([z,w,h,sh,inner])=>{
      const row=[], low=bottom(z);for(let j=0;j<=6;j++){const u=j/6;const x=sideX(z,u);const y=THREE.MathUtils.lerp(sh,Math.min(sh-.025,low),u);row.push([side*x,y,z]);}return row;
    }),paint);
    strip(samples.filter(row=>row[0]<-1.882).map(([z,w,h,sh])=>[[side*(w-.014),bottom(z),z],[side*(w-.024),.179,z]]),carbon);
    // Finite, flush wheel opening return, no inverted/self-intersecting triangles.
    strip(samples.map(([z,w,h,sh])=>[[side*(w-.014),Math.min(sh-.025,bottom(z)),z],[side*(w-.054),Math.min(sh-.026,bottom(z)-.008),z]]),carbon);
    for(const z0 of [frontZ,rearZ]){
      const rows=[],edge=[];for(let i=0;i<=64;i++){
        const a=Math.PI*i/64,z=z0+Math.cos(a)*archR,y=wheelY+Math.sin(a)*archR,w=station(z)[1];
        rows.push([[side*(w-.014),y,z],[side*(w-.12),y+.006,z]]);edge.push([side*(w-.013),y+.002,z]);
      }strip(rows,black);line(edge,carbon,.003);
      const lip=[];
      for(let i=0;i<=48;i++){
        const a=Math.PI*i/48,section=[];
        for(let j=0;j<=3;j++){
          const t=j/3,r=archR+.003+t*.018,z=z0+Math.cos(a)*r,y=wheelY+Math.sin(a)*r,w=station(z)[1];
          section.push([side*(w-.011+.009*Math.sin(t*Math.PI)),y,z]);
        }
        lip.push(section);
      }
      strip(lip,paint);
    }
    // Tapered sill, bevel highlight and the uninterrupted door skin.
    poly([[side*1.007,.28,-.96],[side*1.041,.191,-.94],[side*1.067,.169,1.00],[side*1.043,.299,1.03],[side*.989,.27,.80]],carbon);
    line([[side*1.045,.195,-.94],[side*1.047,.188,-.3],[side*1.064,.184,.94]],darkAlloy,.004);
    const seam=[[-.87,.806],[-.80,.63],[-.70,.30],[-.55,.25],[.59,.267],[.78,.40],[.86,.86]];
    line(seam.map(([z,y])=>{const sh=station(z)[3],low=Math.min(sh-.025,bottom(z)),u=THREE.MathUtils.clamp((sh-y)/(sh-low),0,1);return [side*(sideX(z,u)+.0025),y,z]}),black,.0018);
    {const z=.65,y=.786,sh=station(z)[3],u=(sh-y)/(sh-bottom(z)),x=sideX(z,u);
      box(.008,.015,.115,black,side*(x+.004),y,z);
      box(.002,.003,.085,darkAlloy,side*(x+.009),y+.003,z-.005);
    }
    // Horizontal camera-mirror pod, very small at full-car scale.
    const pod=box(.115,.028,.082,carbon,side*1.065,.865,-.72);pod.rotation.y=side*.28;
    cyl(.009,.008,chrome,side*1.094,.865,-.674,'z',car,20);
    box(.008,.012,.065,amber,side*1.064,.697,-.96);
  }
  box(1.75,.072,4.28,black,0,.185,-.04);
  // Trapezoid fascia and shadowed lower intake: thin bright nose edge, deep black face.
  // One rounded bumper skin spans both corners. Its outer edge follows the
  // same cross-section as the body, avoiding the old three-piece fascia seams.
  const noseBand=[];
  for(let j=0;j<=14;j++){
    const t=j/14,half=.93*(.972+.028*Math.sin(t*Math.PI*.5))-.014*t*t,row=[];
    for(let k=0;k<=40;k++){
      const u=k/40*2-1,lower=.365-.055*THREE.MathUtils.smoothstep(Math.abs(u),.80,1);
      row.push([u*half,THREE.MathUtils.lerp(.535,lower,t),-2.382-.045*Math.sin(Math.PI*t)*(1-u*u*u*u)]);
    }
    noseBand.push(row);
  }
  strip(noseBand,paint);
  const opticalFascia=[];
  for(let j=0;j<=8;j++){
    const t=.12+j/8*.72,half=.93*(.972+.028*Math.sin(t*Math.PI*.5))-.014*t*t,row=[];
    for(let k=0;k<=28;k++){
      const u=(k/28*2-1)*THREE.MathUtils.lerp(.824,.86,j/8),lower=.365-.055*THREE.MathUtils.smoothstep(Math.abs(u),.80,1);
      row.push([u*half,THREE.MathUtils.lerp(.535,lower,t),-2.386-.045*Math.sin(Math.PI*t)*(1-u*u*u*u)]);
    }
    opticalFascia.push(row);
  }
  strip(opticalFascia,black);
  line([[-.742,.535,-2.391],[0,.539,-2.395],[.742,.535,-2.391]],alloy,.0025);
  poly([[-.792,.365,-2.29],[.792,.365,-2.29],[.810,.226,-2.29],[-.810,.226,-2.29]],intakeVoid);
  for(const side of [-1,1])poly([[side*.792,.365,-2.354],[side*.792,.365,-2.29],[side*.810,.226,-2.29],[side*.810,.226,-2.392]],carbon);
  for(const side of [-1,1]){
    // Recessed optical assembly. The housing follows the bonnet surface;
    // bright guide, reflector wells and a coated lens have separate real depths.
    const lampPoint=(x,z,lift=.004)=>[side*x,hoodHeight(x,z)+lift,z];
    const lampA=[.744,-2.348],lampB=[.988,-2.194],lampC=[.704,-1.982];
    function lensPatch(A,B,C,material,lift){
      const vertices=[],N=7,point=(a,b)=>lampPoint(A[0]+(B[0]-A[0])*a+(C[0]-A[0])*b,A[1]+(B[1]-A[1])*a+(C[1]-A[1])*b,lift);
      for(let i=0;i<N;i++)for(let j=0;j<N-i;j++){
        const a=i/N,b=j/N,step=1/N;vertices.push(...point(a,b),...point(a+step,b),...point(a,b+step));
        if(i+j<N-1)vertices.push(...point(a+step,b),...point(a+step,b+step),...point(a,b+step));
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();return mesh(g,material);
    }
    const centre=[(lampA[0]+lampB[0]+lampC[0])/3,(lampA[1]+lampB[1]+lampC[1])/3],
      inset=(p,t)=>p.map((v,i)=>THREE.MathUtils.lerp(v,centre[i],t));
    lensPatch(lampA,lampB,lampC,black,.007);
    const A=inset(lampA,.075),B=inset(lampB,.075),C=inset(lampC,.075);
    const rim=[];
    for(const [p,q]of [[A,B],[B,C],[C,A]])for(let j=0;j<12;j++){
      const t=j/12,edge=p.map((v,i)=>THREE.MathUtils.lerp(v,q[i],t)),inner=inset(edge,.035);
      rim.push([lampPoint(...edge,.012),lampPoint(...inner,.014)]);
    }
    rim.push(rim[0]);strip(rim,darkAlloy);
    const guide=[];
    for(let j=0;j<=20;j++){
      const t=.055+j/20*.89,p=C.map((v,i)=>THREE.MathUtils.lerp(v,B[i],t)),q=inset(p,.055);
      guide.push([lampPoint(...p,.020),lampPoint(...q,.020)]);
    }
    strip(guide,headlamp);
    for(let j=0;j<3;j++){
      const t=(j+.5)/3,p=C.map((v,i)=>THREE.MathUtils.lerp(v,B[i],t)),q=p.map((v,i)=>THREE.MathUtils.lerp(v,A[i],.30));
      const position=lampPoint(...q,.017), well=cyl(.024,.009,alloy,...position,'y',car,20);
      const lens=mesh(new THREE.SphereGeometry(.019,16,8),lampLens);lens.position.set(...lampPoint(...q,.023));lens.scale.y=.35;
      cyl(.015,.003,black,...lampPoint(...q,.023),'y',car,16);
      const led=q.map((v,i)=>THREE.MathUtils.lerp(v,A[i],.10));
      line([lampPoint(...q,.029),lampPoint(...led,.029)],headlamp,.0032);
    }
    lensPatch(inset(A,.015),inset(B,.015),inset(C,.015),lampLens,.034);
    // Black lower wrap turns the front corner without overlapping body patches.
    poly([[side*.810,.300,-2.391],[side*.916,.310,-2.391],[side*.93,.170,-2.412],[side*.830,.166,-2.413]],carbon);

  }
  poly([[-1.036,.180,-2.23],[-.91,.151,-2.441],[0,.156,-2.465],[.91,.151,-2.441],[1.036,.180,-2.23],[.84,.18,-2.31],[-.84,.18,-2.31]],carbon);
  line([[-1.034,.182,-2.24],[-.905,.160,-2.442],[0,.164,-2.458],[.905,.160,-2.442],[1.034,.182,-2.24]],darkAlloy,.004);
  // Fine intake mesh kept in shadow and batched with the rigid carbon assembly.
  for(const side of [-1,1])poly([[side*.58,.235,-2.398],[side*.78,.255,-2.390],[side*.74,.354,-2.355],[side*.65,.323,-2.362]],carbon);
  line([[-.78,.233,-2.397],[-.64,.249,-2.392],[0,.244,-2.393],[.64,.249,-2.392],[.78,.233,-2.397]],darkAlloy,.004);

  // Flush aircraft glazing. Flat central roof, subtle compound windshield curvature.
  const canopy=[[-1.03,.880,.770,.860],[-.83,.800,.898,.883],[-.58,.728,1.024,1.009],[-.32,.673,1.161,1.146],[-.20,.655,1.197,1.182],[.22,.650,1.210,1.195],[.57,.620,1.201,1.186],[.78,.577,1.145,1.130],[1.04,.506,1.035,1.020],[1.38,.397,.861,.846],[1.55,.355,.833,.825]];
  // Broad, planar roof and straight windshield follow the revealed wedge silhouette.
  for(const row of canopy){row[2]+=.018;row[3]+=.012;row[1]*=1.025;}
  function canopyRow(row){const[z,w,h,e]=row,out=[];for(let j=0;j<=12;j++){const t=j/12*2-1;out.push([t*w,h-(h-e)*Math.pow(Math.abs(t),2)+.022*(1-t*t),z]);}return out;}
  // Resample along Z to avoid normal jumps while retaining the roof break.
  const canopyRows=[];for(let i=0;i<canopy.length-1;i++)for(let j=0;j<4;j++){
    const t=j/4,a=canopy[i],b=canopy[i+1],prev=canopy[Math.max(0,i-1)],next=canopy[Math.min(canopy.length-1,i+2)],dz=b[0]-a[0];
    canopyRows.push(canopyRow(a.map((v,k)=>k===0?THREE.MathUtils.lerp(a[0],b[0],t):(2*t*t*t-3*t*t+1)*v+(t*t*t-2*t*t+t)*dz*(b[k]-prev[k])/(b[0]-prev[0])+(-2*t*t*t+3*t*t)*b[k]+(t*t*t-t*t)*dz*(next[k]-a[k])/(next[0]-a[0]))));
  }canopyRows.push(canopyRow(canopy.at(-1)));strip(canopyRows,glass);
  // Ceramic glazing border and a narrow painted A-pillar make the glass sit
  // inside a fitted frame. Both follow the same surface as the canopy.
  for(const side of [-1,1]){
    const border=[],pillar=[];
    for(const row of canopyRows){
      const edge=side>0?row.at(-1):row[0],next=side>0?row.at(-2):row[1],p=(inset,lift)=>{
        const t=inset/Math.abs(next[0]-edge[0]);
        return [THREE.MathUtils.lerp(edge[0],next[0],t),THREE.MathUtils.lerp(edge[1],next[1],t)+lift,edge[2]];
      };
      border.push([p(0,.002),p(.026,.002)]);
      if(edge[2]<=-.2)pillar.push([p(-.004,.003),p(.002,.007),p(.010,.003)]);
    }
    strip(border,black);strip(pillar,paint);
  }
  for(const index of [0,16,24]){
    const row=canopyRows[index],next=canopyRows[index+1],frit=[];
    for(let j=0;j<row.length;j++){
      const p=row[j],q=next[j],t=.012/(q[2]-p[2]);
      frit.push([[p[0],p[1]+.002,p[2]],[THREE.MathUtils.lerp(p[0],q[0],t),THREE.MathUtils.lerp(p[1],q[1],t)+.002,THREE.MathUtils.lerp(p[2],q[2],t)]]);
    }
    strip(frit,black);
  }
  for(const side of [-1,1]){
    const top=canopy.slice(0,8).map(([z,x,h,y])=>[z,x,y]);
    function glassSill(z,x,y){const outer=.908-(z+1.03)*.016,st=station(z),u=(outer-st[4])/(st[1]*.972-st[4]),base=THREE.MathUtils.lerp(st[2],st[3],u)+.033*Math.sin(Math.PI*u)+.004,t=THREE.MathUtils.smoothstep(z,.57,1.2525);return [THREE.MathUtils.lerp(outer,x,t),THREE.MathUtils.lerp(base,y,t)];}
    const sideEdges=[];
    const sideRows=canopyRows.filter(row=>row[0][2]<=1.2526).map(row=>{const z=row[0][2],p=side>0?row.at(-1):row[0],[lowerX,lowerY]=glassSill(z,Math.abs(p[0]),p[1]),out=[];for(let i=0;i<=12;i++){const u=i/12;out.push([THREE.MathUtils.lerp(p[0],side*lowerX,u)+side*.009*Math.sin(Math.PI*u),THREE.MathUtils.lerp(p[1],lowerY,u),z]);}sideEdges.push([side*lowerX,lowerY+.002,z]);return out;});if(side<0)for(const row of sideRows)row.reverse();strip(sideRows,glass);
    line(canopyRows.filter(row=>row[0][2]<=1.2526).map(row=>{const p=side>0?row.at(-1):row[0];return [p[0]+side*.002,p[1]+.002,p[2]]}),black,.0021);
    line(sideEdges,black,.0021);
    // The flying buttress is a single continuous patch from canopy edge to
    // shoulder, with aligned longitudinal stations and no overlapping triangles.
    const sail=[],sailControls=canopy.slice(6).map(([z,x,h,y])=>[z,x,y]);sailControls.push([1.9,.44,station(1.9)[2]]);
    for(let step=0;step<=80;step++){
      const z=.57+(1.9-.57)*step/80;let i=0;while(i<sailControls.length-2&&z>sailControls[i+1][0])i++;
      const a=sailControls[i],b=sailControls[i+1],prev=sailControls[Math.max(0,i-1)],next=sailControls[Math.min(sailControls.length-1,i+2)],t=(z-a[0])/(b[0]-a[0]),dz=b[0]-a[0];
      const val=k=>(2*t*t*t-3*t*t+1)*a[k]+(t*t*t-2*t*t+t)*dz*(b[k]-prev[k])/(b[0]-prev[0])+(-2*t*t*t+3*t*t)*b[k]+(t*t*t-t*t)*dz*(next[k]-a[k])/(next[0]-a[0]);
      let inner=val(1),edge=val(2);if(z<1.2525)[inner,edge]=glassSill(z,inner,edge);const[_,outer,deck,sh]=station(z),points=[];for(let j=0;j<=16;j++){const u=j/16;points.push([side*THREE.MathUtils.lerp(inner,outer*.972,u),THREE.MathUtils.lerp(edge,sh,u)+.012*Math.sin(Math.PI*u),z]);}sail.push(points);
    }strip(sail,paint);
    line(canopy.slice(6).map(([z,x,h,y])=>[side*x,y+.0015,z]),black,.0018);

  }
  {const row=canopy[4];line(canopyRow(row).map(p=>[p[0],p[1]+.0015,p[2]]),black,.0012);}

  // Reference-informed sculpted two-seat interior under physical coated glazing.
  const interior=createInterior(THREE);car.add(interior);

  // Low-profile tires, five angular forged spokes and broad satin aero sectors.
  function createWheel(side,z) {
    const pivot=new THREE.Group();pivot.position.set(side*(z>0?1.01:.995),wheelY,z);car.add(pivot);
    const spin=new THREE.Group();pivot.add(spin);
    const profile=[new THREE.Vector2(.306,-.139),new THREE.Vector2(.339,-.138),new THREE.Vector2(.371,-.124),new THREE.Vector2(.389,-.097),new THREE.Vector2(.395,-.055),new THREE.Vector2(.395,.055),new THREE.Vector2(.389,.097),new THREE.Vector2(.371,.124),new THREE.Vector2(.339,.138),new THREE.Vector2(.306,.139)];
    const tireGeometry=new THREE.LatheGeometry(profile,64);tireGeometry.rotateZ(Math.PI/2);mesh(tireGeometry,rubber,spin);
    // Tread grooves are shaded at tyre scale instead of 400 tiny tube meshes.
    // This preserves the curved silhouette and removes 48k racing triangles.
    const out=side*.141;cyl(.313,.04,darkAlloy,side*.072,0,0,'x',spin,80);
    torus(.312,.007,alloy,out,0,0,'x',spin);torus(.296,.002,chrome,out+side*.003,0,0,'x',spin);
    cyl(.259,.018,darkAlloy,side*.079,0,0,'x',pivot,72);
    torus(.236,.016,alloy,side*.09,0,0,'x',pivot);
    const caliper=box(.066,.19,.079,brake,side*.104,.08,.198,pivot);caliper.rotation.x=-.3;
    for(let j=0;j<24;j++)for(const r of [.204,.238]){const a=j/24*Math.PI*2,hole=mesh(new THREE.CircleGeometry(.005,8),black,pivot);hole.rotation.y=Math.PI/2;hole.position.set(side*.102,Math.sin(a)*r,Math.cos(a)*r);hole.castShadow=false;}
    for(let j=0;j<5;j++){
      const a=j/5*Math.PI*2,p=(r,off=0,x=out)=>[x,Math.cos(a+off)*r,Math.sin(a+off)*r];
      for(const fork of [-1,1]){
        const angle=fork*.12;
        wheelPanel([p(.058,angle-.13),p(.180,angle-.065),p(.302,angle+fork*.075-.047),p(.302,angle+fork*.075+.047),p(.170,angle+.065),p(.062,angle+.13)],darkAlloy,spin);
        const face=[];
        for(let k=0;k<=8;k++){
          const t=k/8,r=THREE.MathUtils.lerp(.082,.302,t),angleT=angle+fork*.075*t;
          face.push([p(r,angleT-.027,out+side*(.009+.008*Math.sin(Math.PI*t))),p(r,angleT+.027,out+side*(.009+.008*Math.sin(Math.PI*t)))]);
        }
        strip(face,alloy,spin);
      }
    }
    cyl(.061,.031,carbon,out+side*.01,0,0,'x',spin,40);
    cyl(.032,.033,darkAlloy,out+side*.014,0,0,'x',spin,32);
    for(let j=0;j<5;j++){const a=j/5*Math.PI*2;cyl(.006,.035,chrome,out+side*.016,Math.sin(a)*.046,Math.cos(a)*.046,'x',spin,8);}
    torus(.354,.0011,darkAlloy,out-side*.002,0,0,'x',spin);
    wheels.push({pivot,spin,front:z<0});
  }
  for(const side of [-1,1])for(const z of [frontZ,rearZ])createWheel(side,z);

  // Shallow compound curvature keeps the tail a formed body panel instead of
  // a flat board. The continuous optical cassette sits proud of its upper edge.
  const tailPanel=[];
  for(let j=0;j<=8;j++){
    const t=j/8,row=[];
    for(let i=0;i<=40;i++){
      const u=i/40*2-1,x=u*THREE.MathUtils.lerp(1.015,1.01,t),lower=.465+.07*THREE.MathUtils.smoothstep(Math.abs(u),.77,1);
      const ax=Math.abs(x),upper=ax<=.77?.733+.045*(1-(ax/.77)**2):THREE.MathUtils.lerp(.733,.747,THREE.MathUtils.clamp((ax-.77)/(1.015*.972-.77),0,1))+.012*Math.sin(Math.PI*THREE.MathUtils.clamp((ax-.77)/(1.015*.972-.77),0,1));
      row.push([x,THREE.MathUtils.lerp(upper,lower,t),2.394+.042*t+.014*Math.sin(Math.PI*t)*(1-u*u)]);
    }
    tailPanel.push(row);
  }
  strip(tailPanel,paint);
  box(2.036,.069,.036,black,0,.699,2.409);
  const rearLine=[];for(let i=0;i<=40;i++){const x=-1.012+i/40*2.024;rearLine.push([x,.710-.014*(1-(x/1.012)**2),2.433-.012*(x/1.012)**2]);}
  const opticalRibbon=points=>strip(points.map(([x,y,z])=>[[x,y-.012,z-.003],[x,y-.008,z+.005],[x,y+.008,z+.005],[x,y+.012,z-.003]]),tail);
  brakeLights.push(opticalRibbon(rearLine));
  line(rearLine.map(([x,y,z])=>[x,y+.023,z-.004]),darkAlloy,.002);
  for(const side of [-1,1]){
    brakeLights.push(opticalRibbon([[side*1.01,.710,2.42],[side*1.025,.711,2.39],[side*1.027,.711,2.36]]));
    // Tail inset echoes the long flying buttress, underneath the optical line.
    poly([[side*.97,.652,2.429],[side*.68,.628,2.436],[side*.54,.537,2.442],[side*.93,.483,2.434]],carbon);
    poly([[side*1.018,.535,2.415],[side*.928,.482,2.433],[side*.875,.14,2.46],[side*1.03,.202,2.368]],carbon);
  }
  // Deep carbon rear cassette with four upper open pipes and four lower turbines.
  box(1.71,.40,.13,black,0,.321,2.373);
  box(1.74,.055,.14,carbon,0,.132,2.435);
  box(1.68,.026,.11,carbon,0,.357,2.435);
  for(const side of [-1,1])box(.035,.29,.13,carbon,side*.862,.269,2.434);
  poly([[-.88,.119,2.44],[-.86,.165,2.50],[.86,.165,2.50],[.88,.119,2.44]],carbon);
  line([[-.88,.155,2.465],[-.875,.435,2.455],[-.72,.508,2.445],[.72,.508,2.445],[.875,.435,2.455],[.88,.155,2.465]],carbon,.013);
  for(const x of [-.62,-.207,.207,.62]) {
    // Actual hollow barrels have inner sidewalls and a deeply shadowed end cap.
    const pipe=mesh(new THREE.CylinderGeometry(.065,.061,.15,48,1,true),darkAlloy);pipe.rotation.x=Math.PI/2;pipe.position.set(x,.433,2.447);
    torus(.064,.0037,chrome,x,.433,2.524,'z');
    cyl(.057,.003,black,x,.433,2.383,'z',car,48);
    const fan=mesh(new THREE.CylinderGeometry(.156,.141,.075,64,1,true),carbon);fan.rotation.x=Math.PI/2;fan.position.set(x,.252,2.427);
    cyl(.141,.006,black,x,.252,2.393,'z',car,64);torus(.148,.006,darkAlloy,x,.252,2.468,'z');
    // Individual swept impeller vanes produce a recognizable radial turbine face.
    for(let j=0;j<11;j++){
      const a=j/11*Math.PI*2,p=(r,o)=>[x+Math.sin(a+o)*r,.252+Math.cos(a+o)*r,2.462];
      poly([p(.039,-.3),p(.142,.1),p(.145,.39),p(.064,.54)],darkAlloy);
    }
    cyl(.041,.025,darkAlloy,x,.252,2.47,'z',car,40);torus(.037,.003,alloy,x,.252,2.486,'z');
    const cone=mesh(new THREE.ConeGeometry(.038,.038,40),carbon);cone.rotation.x=Math.PI/2;cone.position.set(x,.252,2.498);
    const jetGeo=new THREE.ConeGeometry(.13,.9,16,1,true);jetGeo.rotateX(-Math.PI/2);jetGeo.translate(0,0,.45);
    const jet=mesh(jetGeo,new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
      uniforms:{time:{value:0},phase:{value:x*13}},
      vertexShader:`varying vec2 vUv;varying vec3 vNormal;varying vec3 vView;
        void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.);vView=-p.xyz;gl_Position=projectionMatrix*p;}`,
      fragmentShader:`varying vec2 vUv;varying vec3 vNormal;varying vec3 vView;uniform float time;uniform float phase;
        void main(){
          float w=.7+.3*sin(vUv.y*46.-time*32.+phase+sin(vUv.x*19.));
          float edge=pow(abs(dot(normalize(vNormal),normalize(vView))),.8);
          float fade=smoothstep(0.,.58,vUv.y)*(1.-smoothstep(.94,1.,vUv.y));
          gl_FragColor=vec4(.72,.85,1.,fade*edge*w*.22);
        }`,
    }),car);jet.position.set(x,.433,2.528);jet.visible=false;jet.castShadow=false;jet.receiveShadow=false;thrusterJets.push(jet);
  }
  for(const x of [-.836,-.413,0,.413,.836]){
    poly([[x,.113,2.24],[x,.13,2.516],[x,.371,2.488],[x,.355,2.30]],carbon);
    line([[x,.133,2.51],[x,.37,2.485]],darkAlloy,.0025);
  }
  const flightHardware=addFlightHardware(car,{carbon,alloy,darkAlloy,black,paint}, {
    surfacePosition(port){
      const [px,py,z]=port.position,side=Math.sign(px);
      if(port.kind==='attitude'){
        const x=side*.94,[_,w,h,sh,inner]=station(z),t=Math.abs(x)/(w*.972);
        let y;
        if(z<0){const f=THREE.MathUtils.smoothstep(Math.abs(x),inner*.72,w*.972);y=THREE.MathUtils.lerp(h,sh,f)+.023*(1-t*t)*THREE.MathUtils.smoothstep(z,-2.38,-1.65);}
        else {const u=(Math.abs(x)-inner)/(w*.972-inner);y=THREE.MathUtils.lerp(h,sh,u)+.033*Math.sin(Math.PI*u);}
        return [x,y+.012,z];
      }
      if(port.kind==='side'){const sh=station(z)[3],low=Math.min(sh-.025,bottom(z)),u=THREE.MathUtils.clamp((sh-py)/(sh-low),0,1);return [side*(sideX(z,u)+.010),py,z];}
      return [side*.965,.15,z];
    }
  });
  // Active airfoil folds inside the rear body when stowed. Endplates stay inboard
  // of the quarter panels; the controller still raises the same whole group.
  const wing=new THREE.Group();wing.name='Active rear wing';wing.position.set(0,.49,2.02);car.add(wing);
  for(const side of [-1,1]){
    strip([[[side*.57,-.03,-.13],[side*.61,-.03,-.07]],[[side*.57,.10,-.17],[side*.61,.10,-.09]],[[side*.57,.22,-.08],[side*.61,.22,-.015]]],darkAlloy,wing);
    cyl(.019,.045,alloy,side*.59,.21,-.045,'x',wing,20);
  }
  const airfoil=[];for(let i=0;i<=20;i++){
    const x=-.995+i/20*1.99,sw=.05*(x/.995)**2;
    airfoil.push([[x,.223,.22+sw],[x,.244,.16+sw],[x,.248,-.12+sw],[x,.236,-.18+sw],[x,.211,-.12+sw],[x,.209,.17+sw],[x,.223,.22+sw]]);
  }strip(airfoil,carbon,wing);
  // Painted leading face and wide dark-chamfered endplates match the deployed reference.
  strip(airfoil.map(row=>[row[2],row[3]]),paint,wing);
  for(const side of [-1,1]){
    poly([[side*.998,.28,-.18],[side*.998,.27,.27],[side*.998,.105,.34],[side*.998,.065,.16],[side*.998,.12,-.21]],carbon,wing);
    line([[side*1.000,.28,-.18],[side*1.000,.27,.27],[side*1.000,.106,.34]],carbon,.0035,wing);
  }
  wing.userData.restY=.79;
  // One fitted service-panel shutline follows the compound bonnet crown.
  for(const side of [-1,1]){
    const edge=[[-1.07,.558],[-1.35,.603],[-1.72,.65],[-2.05,.708],[-2.31,.748]];
    line(edge.map(([z,x])=>[side*x,hoodHeight(x,z)+.002,z]),black,.0012);
  }
  {const row=[];for(let i=0;i<=20;i++){const x=(i/20*2-1)*.558;row.push([x,hoodHeight(x,-1.07)+.002,-1.07]);}line(row,black,.0012);}

  // Small machined badges add scale without relying on any texture downloads.
  box(.044,.003,.008,chrome,0,hoodHeight(0,-1.90)+.003,-1.90);
  box(.008,.003,.027,chrome,0,hoodHeight(0,-1.89)+.003,-1.89);
  box(.055,.016,.005,darkAlloy,0,.482,2.426);
  if(typeof document!=='undefined') {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#0d1214';ctx.fillRect(0,0,512,128);
    ctx.font='500 35px sans-serif';ctx.fillStyle='#a4b2b7';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('R D S T R',256,64);
    const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;
    const plate=mesh(new THREE.PlaneGeometry(.25,.105),new THREE.MeshStandardMaterial({map:t,metalness:.45,roughness:.34}),car);plate.position.set(0,.573,2.451);
  }
  // Batch rigid parts by material. The detailed rotor perforations and spokes cost
  // only a handful of draw calls, while steering, wheel spin, lights and vapor stay independent.
  function batchRigid(group,exclude=new Set()) {
    const batches=new Map();
    for(const child of [...group.children]) {
      if(!child.isMesh || exclude.has(child) || !child.visible || Array.isArray(child.material) || child.material.map)continue;
      if(!batches.has(child.material))batches.set(child.material,[]);
      batches.get(child.material).push(child);
    }
    for(const [material,parts] of batches) {
      if(parts.length<2)continue;
      let count=0;const geometries=[];
      for(const part of parts) {
        part.updateMatrix();
        const g=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();
        g.applyMatrix4(part.matrix);if(!g.attributes.normal)g.computeVertexNormals();
        count+=g.attributes.position.array.length;geometries.push(g);
      }
      const positions=new Float32Array(count),normals=new Float32Array(count);let offset=0;
      for(const g of geometries) {
        positions.set(g.attributes.position.array,offset);normals.set(g.attributes.normal.array,offset);
        offset+=g.attributes.position.array.length;g.dispose();
      }
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
      geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
      if(material===paint){
        const coincident=new Map();
        for(let i=0;i<positions.length;i+=3){
          const key=`${Math.round(positions[i]*2000)},${Math.round(positions[i+1]*2000)},${Math.round(positions[i+2]*2000)}`;
          if(!coincident.has(key))coincident.set(key,[]);coincident.get(key).push(i);
        }
        const source=normals.slice();
        for(const group of coincident.values())if(group.length>1)for(const i of group){
          let x=0,y=0,z=0;
          for(const j of group){const dot=source[i]*source[j]+source[i+1]*source[j+1]+source[i+2]*source[j+2];if(Math.abs(dot)>.62){const sign=Math.sign(dot);x+=source[j]*sign;y+=source[j+1]*sign;z+=source[j+2]*sign;}}
          const length=Math.hypot(x,y,z)||1;normals[i]=x/length;normals[i+1]=y/length;normals[i+2]=z/length;
        }
      }
      geometry.computeBoundingSphere();
      for(const part of parts){group.remove(part);part.geometry.dispose();}
      mesh(geometry,material,group);
    }
  }
  for(const wheel of wheels){batchRigid(wheel.spin);batchRigid(wheel.pivot);}
  batchRigid(wing);
  batchRigid(car,new Set([...brakeLights,...thrusterJets,...flightHardware.jets]));
  let cockpitOn=false;car.userData={interior,setCockpit:on=>{on=!!on;if(cockpitOn===on)return;cockpitOn=on;glass.transparent=true;glass.opacity=on?.22:1;glass.depthWrite=!on;glass.needsUpdate=true;interior.visible=on;},setDetail:detailed=>{const t=detailed?.20:0;if(glass.transmission!==t){glass.transmission=t;glass.side=detailed?THREE.DoubleSide:THREE.FrontSide;glass.needsUpdate=true;}interior.visible=!!detailed||cockpitOn;},wheels,brakeLights,thrusterJets,flightHardware,wing,paintMaterial:paint,glassMaterial:glass,headlightMaterial:headlamp};
  return car;
}
