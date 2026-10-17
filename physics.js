/**
 * Units: metres, seconds, radians. q maps body coordinates (+X right, +Y up,
 * -Z forward) into world coordinates. wx/wy/wz are BODY angular velocities:
 * +wx = nose up, +wy = yaw left, +wz = bank left. q is authoritative.
 *
 * y is the centre-of-mass altitude minus BODY_CENTER_Y. Render the model at
 * (x,y+BODY_CENTER_Y,z) - rotateVector(q,{x:0,y:BODY_CENTER_Y,z:0}); this rotates
 * the existing tyre-base-origin model around its body centre. Ground contact
 * uses the full oriented body box, not y alone. pitch/roll/yaw are telemetry.
 *
 * hover enables flight engines; assist enables altitude hold and auto-level.
 * landing requests a powered, level descent and ignores flight commands until
 * cancelled. With engines off the car remains ballistic, including its attitude.
 * recover levels with gas, never teleports or restores reserve. Thruster telemetry
 * is actual delivered acceleration: forwardThrust/liftThrust (m/s²), torqueThrust
 * (body rad/s²), plus forward/lift/torqueFraction in [0,1].
 */
export const clamp = (x,a,b)=>Math.max(a,Math.min(b,x));
export const BODY_CENTER_Y = .65;
export const BODY_HALF_EXTENTS = Object.freeze({x:1.04,y:.65,z:2.35});
export const GRAVITY = 9.81;
const TAU = Math.PI*2, MAX_STEP = 1/120, MAX_FRAME = .25;
const finite = (v,fallback=0)=>Number.isFinite(v)?v:fallback;
const bounded = (v,min,max,fallback=0)=>clamp(finite(v,fallback),min,max);
const vec = (x=0,y=0,z=0)=>({x,y,z});

export function normalizeQuaternion(q){
  const x=finite(q?.x),y=finite(q?.y),z=finite(q?.z),w=finite(q?.w);
  const n=Math.hypot(x,y,z,w);
  return n>1e-12&&Number.isFinite(n)?{x:x/n,y:y/n,z:z/n,w:w/n}:{x:0,y:0,z:0,w:1};
}
export function quaternionMultiply(a,b){
  return {x:a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y,
    y:a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x,
    z:a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w,
    w:a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z};
}
export function quaternionFromAxisAngle(axis,angle){
  const n=Math.hypot(finite(axis?.x),finite(axis?.y),finite(axis?.z));
  if(n<1e-12||!Number.isFinite(n)||!Number.isFinite(angle))return {x:0,y:0,z:0,w:1};
  const k=Math.sin(angle*.5)/n;
  return normalizeQuaternion({x:axis.x*k,y:axis.y*k,z:axis.z*k,w:Math.cos(angle*.5)});
}
/** Euler YXZ order, matching the original Three.js car convention. */
export function quaternionFromEuler(pitch=0,yaw=0,roll=0){
  return normalizeQuaternion(quaternionMultiply(quaternionMultiply(
    quaternionFromAxisAngle(vec(0,1,0),finite(yaw)),
    quaternionFromAxisAngle(vec(1,0,0),finite(pitch))),
    quaternionFromAxisAngle(vec(0,0,1),finite(roll))));
}
export function rotateVector(q,v){
  const tx=2*(q.y*v.z-q.z*v.y),ty=2*(q.z*v.x-q.x*v.z),tz=2*(q.x*v.y-q.y*v.x);
  return {x:v.x+q.w*tx+q.y*tz-q.z*ty,
    y:v.y+q.w*ty+q.z*tx-q.x*tz,
    z:v.z+q.w*tz+q.x*ty-q.y*tx};
}
export function getBodyAxes(q){
  return {right:rotateVector(q,vec(1,0,0)),up:rotateVector(q,vec(0,1,0)),forward:rotateVector(q,vec(0,0,-1))};
}
export function getSupportHeight(q){
  const a=getBodyAxes(q);
  return Math.abs(a.right.y)*BODY_HALF_EXTENTS.x+Math.abs(a.up.y)*BODY_HALF_EXTENTS.y+
    Math.abs(a.forward.y)*BODY_HALF_EXTENTS.z-BODY_CENTER_Y;
}
export function getGroundClearance(s){return s.y-getSupportHeight(s.q);}

export function createState(x=0,z=0,yaw=0){
  yaw=finite(yaw);
  return {x:finite(x),z:finite(z),y:0,yaw,q:quaternionFromEuler(0,yaw,0),
    speed:0,vx:0,vz:0,vy:0,wx:0,wy:0,wz:0,steer:0,roll:0,pitch:0,
    charge:100,heat:0,hover:false,assist:true,landing:false,hoverTarget:2.8,
    grounded:true,suctionActive:true,boosting:false,slip:0,distance:0,topSpeed:0,
    crashed:false,crashCount:0,crashTimer:0,impactSpeed:0,
    flips:0,rolls:0,spins:0,tricks:{flips:0,rolls:0,spins:0,total:0},
    flipProgress:0,rollProgress:0,spinProgress:0,
    forwardThrust:0,liftThrust:0,torqueThrust:vec(),thrust:{lift:0,forward:0,pitch:0,roll:0,yaw:0},
    forwardFraction:0,liftFraction:0,torqueFraction:0,
    _wasHover:false,_wasLanding:false,_rechargeDelay:0};
}
function sanitize(s){
  for(const key of ['x','y','z'])s[key]=bounded(s[key],-1e7,1e7);
  for(const key of ['vx','vy','vz'])s[key]=bounded(s[key],-220,220);
  for(const key of ['wx','wy','wz'])s[key]=bounded(s[key],-3.6,3.6);
  for(const key of ['yaw','pitch','roll','speed','steer','slip','distance','topSpeed','crashCount','crashTimer','impactSpeed','flips','rolls','spins','flipProgress','rollProgress','spinProgress','_rechargeDelay'])s[key]=finite(s[key]);
  s.q=s.q?normalizeQuaternion(s.q):quaternionFromEuler(s.pitch,s.yaw,s.roll);
  s.charge=bounded(s.charge,0,100);s.heat=bounded(s.heat,0,100);
  s.hoverTarget=bounded(s.hoverTarget,0,180,2.8);
  s.assist=s.assist!==false;s.hover=!!s.hover;s.landing=!!s.landing;
  if(!s.torqueThrust)s.torqueThrust=vec();
  if(!s.tricks)s.tricks={flips:s.flips,rolls:s.rolls,spins:s.spins,total:s.flips+s.rolls+s.spins};
}
function readInput(input={}){
  input=input||{};
  return {throttle:bounded(input.throttle,0,1),brake:bounded(input.brake,0,1),
    steer:bounded(input.steer,-1,1),pitch:bounded(input.pitch,-1,1),
    yaw:bounded(input.yaw??input.steer,-1,1),roll:bounded(input.roll,-1,1),
    lift:bounded(input.lift,-1,1),boost:!!input.boost,drift:!!input.drift,recover:!!input.recover};
}
function telemetry(s){
  const a=getBodyAxes(s.q),horizontal=Math.hypot(a.forward.x,a.forward.z);
  if(horizontal>.025){
    const heading=Math.atan2(-a.forward.x,-a.forward.z);
    s.yaw+=Math.atan2(Math.sin(heading-s.yaw),Math.cos(heading-s.yaw));
  }
  s.pitch=Math.asin(clamp(a.forward.y,-1,1));
  s.roll=Math.atan2(a.right.y,a.up.y);
  s.speed=s.vx*a.forward.x+s.vy*a.forward.y+s.vz*a.forward.z;
  s.slip=Math.abs(s.vx*a.right.x+s.vy*a.right.y+s.vz*a.right.z);
  s.tricks.flips=s.flips;s.tricks.rolls=s.rolls;s.tricks.spins=s.spins;
  s.tricks.total=s.flips+s.rolls+s.spins;
  s.thrust={lift:s.liftThrust/14,forward:s.forwardThrust/21,
    pitch:s.torqueThrust.x/22,roll:s.torqueThrust.z/24,yaw:s.torqueThrust.y/12};
}
function clearThrust(s){
  s.boosting=false;s.forwardThrust=0;s.liftThrust=0;s.torqueThrust=vec();
  s.forwardFraction=0;s.liftFraction=0;s.torqueFraction=0;
}
function resetTrickProgress(s){s.flipProgress=0;s.rollProgress=0;s.spinProgress=0;}
function trackTricks(s,i,dt){
  if(s.grounded||s.crashed||s.landing||i.recover||getGroundClearance(s)<.2){resetTrickProgress(s);return;}
  for(const [rate,progress,count] of [['wx','flipProgress','flips'],['wz','rollProgress','rolls'],['wy','spinProgress','spins']]){
    const delta=s[rate]*dt;
    if(Math.abs(s[rate])<.05)continue;
    if(s[progress]*delta<0)s[progress]=0;
    s[progress]+=delta;
    while(Math.abs(s[progress])>=TAU){s[count]++;s.tricks.last=count==='flips'?'FLIP 360':count==='rolls'?'BARREL ROLL 360':'SPIN 360';s[progress]-=Math.sign(s[progress])*TAU;}
  }
}
function integrateOrientation(s,dt){
  const n=Math.hypot(s.wx,s.wy,s.wz);
  if(n>1e-10)s.q=normalizeQuaternion(quaternionMultiply(s.q,quaternionFromAxisAngle(vec(s.wx,s.wy,s.wz),n*dt)));
}
/** Shortest rotation aligning body up with world up, expressed in body axes. */
function levelError(q){
  const worldUpLocal=rotateVector({x:-q.x,y:-q.y,z:-q.z,w:q.w},vec(0,1,0));
  const angle=Math.acos(clamp(worldUpLocal.y,-1,1));
  const n=Math.hypot(worldUpLocal.x,worldUpLocal.z);
  if(n<1e-7)return angle>1?vec(Math.PI,0,0):vec();
  return vec(worldUpLocal.z*angle/n,0,-worldUpLocal.x*angle/n);
}
function levelOnGround(s,dt){
  const error=levelError(s.q),angle=Math.hypot(error.x,error.z);
  if(angle>1e-8)s.q=normalizeQuaternion(quaternionMultiply(s.q,
    quaternionFromAxisAngle(error,angle*(1-Math.exp(-dt*5)))));
  s.wx=s.wy=s.wz=0;
  s.y=Math.max(0,getSupportHeight(s.q));s.vy=0;
}
function stepCrash(s,dt,onRoad){
  clearThrust(s);s.hover=false;s.landing=false;s.grounded=false;s.suctionActive=false;
  s.crashTimer=Math.max(0,s.crashTimer-dt);
  s.vx*=Math.exp(-dt*4);s.vz*=Math.exp(-dt*4);
  s.x+=s.vx*dt;s.z+=s.vz*dt;
  levelOnGround(s,dt);
  resetTrickProgress(s);
  if(s.crashTimer===0){
    telemetry(s);s.q=quaternionFromEuler(0,s.yaw,0);s.y=0;
    s.grounded=true;s.suctionActive=false; // Wreck stays locked until explicit reset.
  }
}
function stepGround(s,i,dt,onRoad){
  clearThrust(s);s.grounded=true;s.suctionActive=!!onRoad;s.landing=false;
  s.wx=s.wy=s.wz=0;s.vy=0;resetTrickProgress(s);
  s.steer+=(i.steer-s.steer)*(1-Math.exp(-dt*7));
  const fx=-Math.sin(s.yaw),fz=-Math.cos(s.yaw),rx=Math.cos(s.yaw),rz=-Math.sin(s.yaw);
  let forward=s.vx*fx+s.vz*fz,lateral=s.vx*rx+s.vz*rz;
  const oldSpeed=forward;
  const boostFraction=i.boost&&i.throttle>0?Math.min(1,s.charge/(26*dt)):0;
  s.boosting=boostFraction>0;
  s.charge=Math.max(0,s.charge-26*boostFraction*dt);
  s.forwardThrust=24*boostFraction*i.throttle;s.forwardFraction=s.forwardThrust/42;
  forward+=(i.throttle*19.4*(1-Math.min(Math.max(forward,0)/115,.87))+s.forwardThrust)*dt;
  const drag=.18+forward*forward*.0026+(onRoad?0:3.2);
  if(Math.abs(forward)>.03)forward-=Math.sign(forward)*Math.min(Math.abs(forward),drag*dt);
  if(i.brake)forward=forward>.7?Math.max(0,forward-i.brake*30*dt):Math.max(-10,forward-i.brake*7*dt);
  const speedAbs=Math.abs(forward),steerAngle=s.steer*(.55/(1+speedAbs*.022));
  const yawRate=clamp(forward*Math.tan(steerAngle)/3,-1.65,1.65);
  s.yaw+=yawRate*dt;
  lateral-=yawRate*forward*dt*(i.drift?.98:.4);
  lateral*=Math.exp(-dt*(i.drift?2:s.suctionActive?10:4.2));
  s.vx=-Math.sin(s.yaw)*forward+Math.cos(s.yaw)*lateral;
  s.vz=-Math.cos(s.yaw)*forward-Math.sin(s.yaw)*lateral;
  s.x+=s.vx*dt;s.z+=s.vz*dt;
  s.roll+=(clamp(-s.steer*speedAbs*.0024,-.095,.095)-s.roll)*(1-Math.exp(-dt*6));
  s.pitch+=(clamp((forward-oldSpeed)*-.018,-.05,.07)-s.pitch)*(1-Math.exp(-dt*5));
  s.q=quaternionFromEuler(s.pitch,s.yaw,s.roll);
  s.y=Math.max(0,getSupportHeight(s.q));
  // This is a parked-car game approximation. No recharge in flight, while
  // inverted/crashed, at driving speed, or during the post-impact lockout.
  if(!s.boosting&&i.throttle===0&&speedAbs<3&&s._rechargeDelay===0)
    s.charge=Math.min(100,s.charge+dt*(i.brake?6:4));
}
function stepAir(s,i,dt){
  clearThrust(s);s.grounded=false;s.suctionActive=false;
  s.steer+=(i.yaw-s.steer)*(1-Math.exp(-dt*7));
  if(s.charge<=0){s.hover=false;s.landing=false;}
  const powered=s.hover||s.landing;
  const recovery=i.recover||s.landing;
  const assisted=s.assist||recovery;
  let pitch=s.landing?0:i.pitch,roll=s.landing?0:i.roll,yaw=s.landing?0:i.yaw;
  if(recovery)pitch=roll=0;
  if(s.landing)yaw=0;
  const attitudePowered=(powered||i.recover)&&s.charge>0;
  const ax=getBodyAxes(s.q);
  let lift=0,forward=0,torque=vec();
  if(attitudePowered){
    if(assisted){
      torque.x=pitch?((pitch*2.8-s.wx)*7.5):-s.wx*4.8;
      torque.y=(yaw*1.8-s.wy)*5.5;
      torque.z=roll?((roll*3.2-s.wz)*7.5):-s.wz*4.8;
      // Deliberate pitch/roll commands disable levelling on BOTH axes. Thus
      // even a full inverted passage never meets an artificial angle limit.
      if(Math.abs(pitch)<.04&&Math.abs(roll)<.04){
        const e=levelError(s.q);torque.x+=e.x*9;torque.z+=e.z*9;
      }
    }else{
      torque=vec(pitch*5.8,yaw*3.4,roll*6.6);
    }
    torque.x=clamp(torque.x,-22,22);torque.y=clamp(torque.y,-12,12);torque.z=clamp(torque.z,-24,24);
  }
  if(powered&&s.charge>0){
    if(s.landing){
      // Level first rather than descending an inverted car into the floor.
      const desiredVy=ax.up.y<.87?Math.max(0,Math.min(3,(getSupportHeight(s.q)+1.2-s.y)*3)):
        -Math.min(3,Math.max(.45,s.y*.9));
      lift=GRAVITY+clamp((desiredVy-s.vy)*4,-GRAVITY,18);
    }else if(assisted){
      s.hoverTarget=clamp(s.hoverTarget+i.lift*dt*6,.8,180);
      lift=GRAVITY+clamp((s.hoverTarget-s.y)*5-s.vy*3.7,-GRAVITY,18);
    }else{
      // Neutral lift balances gravity only while upright. Inverted acro lift
      // points down; throttle/boost always follows the actual body nose.
      lift=clamp(GRAVITY+i.lift*16,0,28);
    }
    const throttle=s.landing?0:i.throttle;
    forward=throttle*(18+(i.boost?24:0));
    // All lift comes from the physical underbody nozzles. Stabilisation can
    // compensate moderate bank but cannot push world-up while inverted.
    if(assisted)lift=ax.up.y>.3?clamp(lift/ax.up.y,0,28):0;
  }
  const torqueMagnitude=Math.hypot(torque.x,torque.y,torque.z);
  const burn=(powered?1.4:0)+lift*.2+forward*.075+(i.boost&&forward>0?20:0)+torqueMagnitude*.1;
  const power=burn>0?Math.min(1,s.charge/(burn*dt)):0;
  s.charge=Math.max(0,s.charge-burn*power*dt);
  lift*=power;forward*=power;torque.x*=power;torque.y*=power;torque.z*=power;
  s.forwardThrust=forward;s.liftThrust=lift;s.torqueThrust=torque;
  s.forwardFraction=forward/42;s.liftFraction=clamp(lift/28,0,1);
  s.torqueFraction=clamp(Math.hypot(torque.x,torque.y,torque.z)/28,0,1);
  s.boosting=i.boost&&forward>18&&!s.landing;
  const passiveDamping=Math.exp(-dt*(assisted&&attitudePowered?.12:.3));
  s.wx=clamp((s.wx+torque.x*dt)*passiveDamping,-3.6,3.6);
  s.wy=clamp((s.wy+torque.y*dt)*passiveDamping,-2.4,2.4);
  s.wz=clamp((s.wz+torque.z*dt)*passiveDamping,-3.6,3.6);
  integrateOrientation(s,dt);
  const axes=getBodyAxes(s.q);
  const liftAxis=axes.up;
  s.vx+=(axes.forward.x*forward+liftAxis.x*lift)*dt;
  s.vy+=(axes.forward.y*forward+liftAxis.y*lift-GRAVITY)*dt;
  s.vz+=(axes.forward.z*forward+liftAxis.z*lift)*dt;
  const airspeed=Math.hypot(s.vx,s.vy,s.vz),drag=Math.exp(-dt*(.025+airspeed*.0016+i.brake*1.7));
  s.vx*=drag;s.vy*=drag;s.vz*=drag;
  s.x+=s.vx*dt;s.y+=s.vy*dt;s.z+=s.vz*dt;
  const floor=getSupportHeight(s.q);
  if(s.y<=floor){
    s.y=Math.max(0,floor);
    const impact=Math.max(0,-s.vy);
    const unsafe=axes.up.y<.86||impact>7.5||Math.hypot(s.wx,s.wy,s.wz)>2.4;
    if(unsafe){
      s.crashed=true;s.crashCount++;s.crashTimer=1.4;s.impactSpeed=impact;
      s._rechargeDelay=3;s.hover=false;s.landing=false;
      s.vx*=.55;s.vz*=.55;s.vy=0;s.wx=s.wy=s.wz=0;clearThrust(s);resetTrickProgress(s);
    }else if(s.vy<=.15){
      s.vy=0;s.wx=s.wy=s.wz=0;
      if(s.landing||!s.hover){
        s.hover=false;s.landing=false;s.grounded=true;
        telemetry(s);s.q=quaternionFromEuler(0,s.yaw,0);s.y=0;
        clearThrust(s);resetTrickProgress(s);
      }
    }
  }
  if(s.charge<=1e-10){s.charge=0;s.hover=false;s.landing=false;}
  trackTricks(s,i,dt);
}
export function stepPhysics(s,input,dt,onRoad=true){
  // Ignore invalid/negative time. Cap stalls, then substep all dynamics and
  // collision tests so a dropped frame cannot skip through the support plane.
  if(!s||!Number.isFinite(dt)||dt<=0)return s;
  sanitize(s);telemetry(s);const i=readInput(input),duration=Math.min(dt,MAX_FRAME);
  const count=Math.max(1,Math.ceil(duration/MAX_STEP)),h=duration/count;
  if(s.hover&&!s._wasHover)s.hoverTarget=Math.max(2.8,s.y);
  if(!s.landing&&s._wasLanding&&s.hover)s.hoverTarget=Math.max(.8,s.y);
  for(let k=0;k<count;k++){
    s._rechargeDelay=Math.max(0,s._rechargeDelay-h);
    const axes=getBodyAxes(s.q),clearance=getGroundClearance(s);
    const supported=clearance<=.012&&clearance>=-.04&&axes.up.y>.96&&s.y<.6&&Math.abs(s.vy)<=.15;
    if(s.crashed)stepCrash(s,h,onRoad);
    else if(supported&&!s.hover&&!s.landing)stepGround(s,i,h,onRoad);
    else stepAir(s,i,h);
    s.distance+=Math.hypot(s.vx,s.vy,s.vz)*h;
    s.heat=clamp(s.heat+h*(s.boosting?14:-8),0,100);
    telemetry(s);s.topSpeed=Math.max(s.topSpeed,Math.hypot(s.vx,s.vy,s.vz));
    s.suctionActive=!!(s.grounded&&!s.hover&&!s.crashed&&onRoad&&getBodyAxes(s.q).up.y>.96&&s.y<.6);
  }
  s._wasHover=s.hover;s._wasLanding=s.landing;
  return s;
}
