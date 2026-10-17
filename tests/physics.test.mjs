import assert from 'node:assert/strict';
import {
  createState,stepPhysics,GRAVITY,BODY_CENTER_Y,
  getBodyAxes,getGroundClearance,getSupportHeight,
  normalizeQuaternion,quaternionFromAxisAngle,quaternionFromEuler,quaternionMultiply,rotateVector,
} from '../physics.js';

const DT=1/120;
let checks=0;
const test=(name,fn)=>{fn();checks++;console.log(`PASS: ${name}`);};
const near=(a,b,epsilon=1e-6)=>assert(Math.abs(a-b)<=epsilon,`${a} differs from ${b} by more than ${epsilon}`);
const run=(s,input,time,onRoad=true,dt=DT)=>{
  for(let elapsed=0;elapsed<time-1e-10;elapsed+=dt)stepPhysics(s,input,Math.min(dt,time-elapsed),onRoad);
  return s;
};
const airborne=(assist=true,height=80)=>Object.assign(createState(),{
  y:height,hoverTarget:height,hover:true,assist,grounded:false,suctionActive:false,
});
const allFinite=value=>typeof value==='number'?Number.isFinite(value):
  value&&typeof value==='object'?Object.values(value).every(allFinite):true;
const sameAttitude=(a,b,tolerance=1e-6)=>{
  const dot=Math.abs(a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w);
  near(dot,1,tolerance);
};

test('Ground acceleration, brakes, reverse and left steering retain their conventions',()=>{
  let s=createState();run(s,{throttle:1},4);assert(s.speed>40&&s.z<0);
  const fast=s.speed;run(s,{brake:1},1);assert(s.speed<fast-20);
  s=createState();run(s,{throttle:1,steer:1},2);assert(s.x<0&&s.yaw>0);
  s=createState();run(s,{brake:1},2);assert(s.speed<0&&s.z>0);
});
test('Ground boost adds thrust and consumes finite reserve',()=>{
  const a=createState(),b=createState();run(a,{throttle:1},2);run(b,{throttle:1,boost:true},2);
  assert(b.speed>a.speed&&b.charge<60);assert(b.forwardThrust>0&&b.thrust.forward>0);
});
test('Assist launches and stabilizes at the requested default altitude',()=>{
  const s=createState();s.hover=true;run(s,{},4);
  assert(s.y>2&&s.y<3.5);assert(!s.grounded&&!s.suctionActive);assert(s.charge<100);
  assert(s.liftThrust>0);near(s.liftThrust,GRAVITY,.1);
});
test('Every helper uses local −Z forward and normalized YXZ orientation',()=>{
  const yaw=quaternionFromEuler(0,Math.PI/2,0);
  const f=rotateVector(yaw,{x:0,y:0,z:-1});near(f.x,-1);near(f.y,0);near(f.z,0);
  const p=getBodyAxes(quaternionFromEuler(Math.PI/2,0,0));near(p.forward.y,1);
  const r=getBodyAxes(quaternionFromEuler(0,0,Math.PI/2));near(r.right.y,1);
  const twice=quaternionMultiply(quaternionFromAxisAngle({x:1,y:0,z:0},Math.PI),quaternionFromAxisAngle({x:1,y:0,z:0},Math.PI));
  sameAttitude(normalizeQuaternion(twice),{x:0,y:0,z:0,w:1});
  sameAttitude(normalizeQuaternion({x:NaN,y:0,z:0,w:0}),{x:0,y:0,z:0,w:1});
  near(BODY_CENTER_Y,.65);
});
test('Pitch, yaw and roll each respond independently with documented signs',()=>{
  for(const [input,rate,coordinate] of [['pitch','wx','x'],['yaw','wy','y'],['roll','wz','z']]){
    const positive=airborne(),negative=airborne();
    run(positive,{[input]:1},.3);run(negative,{[input]:-1},.3);
    assert(positive[rate]>0&&negative[rate]<0);
    assert(positive.q[coordinate]>0&&negative.q[coordinate]<0);
    for(const other of ['wx','wy','wz'].filter(v=>v!==rate))near(positive[other],0);
  }
});
test('Assist and acro both complete genuine 360° loops and barrel rolls',()=>{
  for(const assist of [true,false])for(const [axis,count] of [['pitch','flips'],['roll','rolls']]){
    const s=airborne(assist,120);let inverted=false;
    for(let k=0;k<3*120;k++){
      stepPhysics(s,{[axis]:1},DT);if(getBodyAxes(s.q).up.y<-.8)inverted=true;
    }
    assert(inverted,`${axis} never passed through inverted in ${assist?'assist':'acro'}`);
    assert(s[count]>=1,`${axis} failed to count full angular travel`);
    assert(!s.crashed&&getGroundClearance(s)>0);
    assert(s.tricks.total>=1&&s.tricks.last.includes('360'));
    near(Math.hypot(...Object.values(s.q)),1,1e-10);
  }
});
test('A yaw spin requires a full revolution and cannot be faked by Euler wrap',()=>{
  const s=airborne();run(s,{yaw:1},2);assert.equal(s.spins,0);
  run(s,{yaw:1},2);assert.equal(s.spins,1);
});
test('Counter-steering resets partial trick accumulation; ground steering never earns stunts',()=>{
  const s=airborne();run(s,{roll:1},.5);assert(s.rollProgress>0);
  run(s,{roll:-1},.6);assert(s.rollProgress<0);assert.equal(s.rolls,0);
  const ground=createState();run(ground,{throttle:1,steer:1,pitch:1,roll:1,yaw:1},12);
  assert.equal(ground.flips+ground.rolls+ground.spins,0);
});
test('Assist levels without input; acro retains inverted attitude and angular inertia',()=>{
  const assist=airborne(),acro=airborne(false);
  assist.q=quaternionFromEuler(.7,0,.6);acro.q={...assist.q};
  run(assist,{},2.5);run(acro,{},2.5);
  assert(getBodyAxes(assist.q).up.y>.999);sameAttitude(acro.q,quaternionFromEuler(.7,0,.6));
  const spin=airborne(false);run(spin,{roll:1},.5);const before=spin.wz;
  run(spin,{},.5);assert(spin.wz>before*.8&&spin.wz<before);
});
test('All lift follows body up and all forward/boost thrust follows the actual nose',()=>{
  const upright=airborne(false),inverted=airborne(false);
  inverted.q=quaternionFromEuler(Math.PI,0,0);
  stepPhysics(upright,{},DT);stepPhysics(inverted,{},DT);
  assert(Math.abs(upright.vy)<.001&&inverted.vy<-.15);
  const pitched=airborne(false);pitched.q=quaternionFromEuler(Math.PI/2,0,0);
  stepPhysics(pitched,{throttle:1,boost:true,lift:-1},DT);
  assert(pitched.vy>0&&Math.abs(pitched.vz)<1e-8);
  const upsideAssist=airborne(true);upsideAssist.q=quaternionFromEuler(Math.PI,0,0);
  stepPhysics(upsideAssist,{pitch:1},DT);
  assert.equal(upsideAssist.liftThrust,0);assert(upsideAssist.vy<0);
  const banked=airborne(true);banked.q=quaternionFromEuler(0,0,.6);
  stepPhysics(banked,{roll:.1},DT);assert(banked.vx<0);
});
test('Airbrake reduces motion without applying reverse engine propulsion',()=>{
  const a=airborne(false),b=airborne(false);a.vz=b.vz=-50;
  run(a,{},.5);run(b,{brake:1},.5);
  assert(Math.abs(b.vz)<Math.abs(a.vz)*.6&&b.vz<0);
  const still=airborne();run(still,{brake:1},.5);near(still.vz,0);
});
test('Turning engines off preserves quaternion attitude and ballistic momentum',()=>{
  const s=airborne(false);s.q=quaternionFromEuler(.3,.5,.7);const before={...s.q};
  s.hover=false;s.vx=10;s.wz=.7;
  stepPhysics(s,{},DT);
  assert(s.vx>9.9&&s.vy<0&&s.wz>.69);assert(!s.grounded&&!s.suctionActive);
  assert(Math.abs(s.q.z-before.z)>1e-4);assert.equal(s.liftThrust,0);
});
test('Empty reserve disables every thruster, including held recovery and landing',()=>{
  const s=airborne();s.charge=0;s.landing=true;s.q=quaternionFromEuler(.8,.4,.5);s.wx=.8;
  const before={...s.q};stepPhysics(s,{recover:true,throttle:1,boost:true,lift:1,roll:1},DT);
  assert(!s.hover&&!s.landing&&s.vy<0);assert(s.wx>.79);
  assert.equal(s.charge,0);assert.equal(s.forwardThrust+s.liftThrust+s.torqueFraction,0);
  assert.equal(s.thrust.lift+s.thrust.forward+Math.abs(s.thrust.pitch)+Math.abs(s.thrust.roll)+Math.abs(s.thrust.yaw),0);
  assert.notDeepEqual(s.q,before);
  run(s,{recover:true},.5);assert.equal(s.charge,0);assert(!s.suctionActive);
});
test('A fractional remaining reserve delivers only proportional thrust',()=>{
  const full=airborne(false),last=airborne(false);last.charge=.0001;
  stepPhysics(full,{throttle:1,boost:true,roll:1,lift:1},DT);
  stepPhysics(last,{throttle:1,boost:true,roll:1,lift:1},DT);
  assert(last.forwardThrust>0&&last.forwardThrust<full.forwardThrust*.01);
  assert.equal(last.charge,0);assert(!last.hover);
});
test('Thruster use drains reserve, and no airborne coast/braking/recovery refills it',()=>{
  for(const input of [{},{pitch:1},{roll:1},{yaw:1},{lift:1},{throttle:1},{throttle:1,boost:true},{recover:true}]){
    const s=airborne();run(s,input,.5);assert(s.charge<100);
  }
  const s=airborne();s.hover=false;s.charge=40;run(s,{brake:1},1);
  assert.equal(s.charge,40);assert(!s.grounded&&!s.suctionActive);
});
test('Powered landing ignores conflicting commands and lands safely on the actual plane',()=>{
  const s=airborne(true,12);s.landing=true;s.q=quaternionFromEuler(.3,0,.2);
  for(let k=0;k<8*120&&!s.grounded;k++)stepPhysics(s,{pitch:1,roll:1,yaw:1,lift:1,throttle:1,boost:true},DT);
  assert(s.grounded&&!s.hover&&!s.landing&&!s.crashed);near(s.y,0,1e-5);
  assert(getBodyAxes(s.q).up.y>.9999&&s.charge<100);
});
test('Cancelling landing captures the present hover altitude',()=>{
  const s=airborne(true,20);s.landing=true;run(s,{},1);
  s.landing=false;const altitude=s.y;stepPhysics(s,{},DT);
  near(s.hoverTarget,altitude,.001);assert(s.hover);
});
test('Inverted and high-impact landings crash; gentle upright contact does not',()=>{
  const inverted=airborne(false,3);inverted.hover=false;inverted.q=quaternionFromEuler(Math.PI,0,0);
  run(inverted,{},1.5);assert(inverted.crashed&&inverted.crashCount===1);
  const hard=airborne(false,3);hard.hover=false;hard.vy=-30;run(hard,{},.2);
  assert(hard.crashed&&hard.impactSpeed>25);
  const gentle=airborne(false,1);gentle.hover=false;gentle.vy=-1;run(gentle,{},1);
  assert(gentle.grounded&&!gentle.crashed&&gentle.suctionActive);
  const seededImpact=createState();seededImpact.vy=-40;stepPhysics(seededImpact,{},DT);
  assert(seededImpact.crashed);
});
test('Crash recovery settles the oriented body but stays locked with no free refill',()=>{
  const s=airborne(false,3);s.hover=false;s.charge=42;s.q=quaternionFromEuler(Math.PI,0,0);
  run(s,{},1);const afterImpact=s.charge;assert(s.crashed);
  s.hover=true;s.landing=true;
  run(s,{recover:true,throttle:1,boost:true,lift:1},8);
  assert(s.crashed&&!s.hover&&!s.landing&&!s.suctionActive);
  assert.equal(s.crashCount,1);near(s.charge,afterImpact);near(s.y,0);near(getBodyAxes(s.q).up.y,1);
});
test('Oriented body extent prevents nose/roof tunnelling and false ground suction',()=>{
  const s=airborne(false,1);s.hover=false;s.q=quaternionFromEuler(Math.PI/2,0,0);s.vy=-200;
  assert(getSupportHeight(s.q)>1.6);
  stepPhysics(s,{},.25);assert(s.crashed&&getGroundClearance(s)>=-1e-8&&!s.suctionActive);
  const nearGround=airborne(false,.08);nearGround.hover=false;nearGround.vy=4;
  stepPhysics(nearGround,{},DT);assert(!nearGround.grounded&&!nearGround.suctionActive);
});
test('Only upright, supported, low-speed parked cars recharge',()=>{
  const s=createState();s.charge=20;run(s,{},1);assert(s.charge>20);
  const fast=createState();fast.charge=20;fast.vz=-20;run(fast,{},1);assert.equal(fast.charge,20);
  const high=airborne(false,2);high.charge=20;high.hover=false;run(high,{brake:1},.2);assert.equal(high.charge,20);
});
test('Quaternion remains authoritative when ground telemetry is stale',()=>{
  const s=createState();s.q=quaternionFromEuler(0,Math.PI/2,0);s.yaw=0;
  run(s,{throttle:1},.5);assert(s.x<0);near(s.z,0,1e-8);near(s.yaw,Math.PI/2);
});
test('Reset returns fresh independent quaternions, counters, flags and velocities',()=>{
  const a=createState(2,3,.5),b=createState(2,3,.5);
  a.q.x=1;a.thrust.roll=1;a.tricks.flips=3;a.crashed=true;
  assert.equal(b.q.x,0);assert.equal(b.thrust.roll,0);assert.equal(b.tricks.flips,0);
  assert(!b.crashed&&!b.hover&&!b.landing&&b.assist&&b.grounded);
  assert.equal(b.wx+b.wy+b.wz+b.vx+b.vy+b.vz,0);assert.equal(b.charge,100);
  sameAttitude(b.q,quaternionFromEuler(0,.5,0));
});
test('Invalid dt is a no-op, stalls are capped and frame rates agree',()=>{
  for(const dt of [0,-1,NaN,Infinity,-Infinity]){
    const s=createState(),before=JSON.stringify(s);stepPhysics(s,{throttle:1},dt);assert.equal(JSON.stringify(s),before);
  }
  const a=airborne(),b=airborne();stepPhysics(a,{pitch:.4,roll:.3,throttle:1},100);stepPhysics(b,{pitch:.4,roll:.3,throttle:1},.25);
  sameAttitude(a.q,b.q);near(a.y,b.y);near(a.charge,b.charge);
  const reference=airborne();run(reference,{pitch:.3,roll:-.4,yaw:.2,throttle:.6},2,true,1/120);
  for(const dt of [1/60,1/30,.1]){
    const s=airborne();run(s,{pitch:.3,roll:-.4,yaw:.2,throttle:.6},2,true,dt);
    sameAttitude(s.q,reference.q,1e-8);near(s.y,reference.y,1e-7);near(s.charge,reference.charge,1e-7);
  }
});
test('Malformed inputs and sustained randomized 3D flight remain finite and bounded',()=>{
  let seed=0x13579bdf;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  let s=airborne(false,150);
  for(let k=0;k<24000;k++){
    if(k%1800===0)s=airborne(k%3600===0,150);
    const input={pitch:rand()*2-1,roll:rand()*2-1,yaw:rand()*2-1,lift:rand()*2-1,
      throttle:rand(),brake:rand()>.9?1:0,boost:rand()>.7,recover:rand()>.99};
    if(k%1000===5){input.pitch=NaN;input.roll=Infinity;input.throttle='bad';}
    stepPhysics(s,input,[1/120,1/60,.03,.1][k%4],rand()>.5);
    assert(allFinite(s),`nonfinite state on step ${k}`);
    near(Math.hypot(...Object.values(s.q)),1,1e-9);
    assert(s.charge>=0&&s.charge<=100);
    assert(Math.abs(s.wx)<=3.6&&Math.abs(s.wy)<=2.4&&Math.abs(s.wz)<=3.6);
    assert(getGroundClearance(s)>=-1e-8);
    if(s.suctionActive)assert(s.grounded&&!s.hover&&!s.crashed&&s.y<.6);
  }
});
console.log(`\n${checks} physics checks passed.`);
