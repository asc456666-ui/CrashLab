import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Vehicle } from '../src/vehicle/Vehicle.js';
import { createBox } from '../src/physics/Helpers.js';

function flat(type='normal') {
  const ctx={scene:new THREE.Scene(),world:new CANNON.World({gravity:new CANNON.Vec3(0,-9.82,0)}),dynamics:[],staticMeshes:new Map(),shadows:false,intactGlassMaterial:()=>new THREE.MeshBasicMaterial()};
  createBox(ctx,{size:[3000,2,3000],pos:[0,-1,0],material:new THREE.MeshBasicMaterial()});
  const v=new Vehicle(ctx,type);v.reset({pos:[0,1.6,0],yaw:0});
  return {ctx,v};
}

for (const type of ['normal','star','sport']) for (const hz of [30,60,120]) {
  test(`${type} ${hz}Hz: repeated turns have bounded sideslip, no visual snap, and recover`,()=>{
    const {ctx,v}=flat(type),dt=1/hz;
    for(let i=0;i<hz*2;i++){v.update(dt,{throttle:0,steer:0,brake:0});ctx.world.step(1/60,dt,4);}
    v.body.velocity.set(0,0,20);
    let maxSlip=0,maxJump=0,minUp=1,last=v.group.quaternion.clone(),recoverySlip=0,stepped=0;
    for(let i=0;i<hz*10;i++) {
      const t=i/hz,steer=t<2?0:t<4?.75:t<6?-.75:0;
      v.update(dt,{throttle:.6,steer,brake:0});ctx.world.step(1/60,dt,4);v.syncVisual(true);
      const f=new THREE.Vector3(0,0,1).applyQuaternion(v.body.quaternion),vel=v.body.velocity;
      const slip=Math.abs(Math.atan2(vel.x*f.z-vel.z*f.x,vel.x*f.x+vel.z*f.z))*180/Math.PI;
      maxSlip=Math.max(maxSlip,slip);maxJump=Math.max(maxJump,last.angleTo(v.group.quaternion)*180/Math.PI);last.copy(v.group.quaternion);
      minUp=Math.min(minUp,1-2*(v.body.quaternion.x**2+v.body.quaternion.z**2));
      if(t>8)recoverySlip=Math.max(recoverySlip,slip);if(v.drift.amount>.2)stepped++;
      if(t<1.9)assert.equal(v.drift.amount,0,'straight driving never triggers drift');
      assert.ok(v.drift.visual.angleTo(new THREE.Quaternion())<1e-8,'no artificial chassis yaw');
    }
    assert.ok(maxSlip<15,`side slip ${maxSlip}`);
    assert.ok(maxJump<(hz===30?4:2.5),`visual jump ${maxJump}`);
    assert.ok(minUp>.95 && recoverySlip<2 && stepped>hz/2);
    assert.equal(v.drift.amount,0);
    v.dispose();
  });
}

test('120Hz rendering interpolates between physics steps and resets interpolation on teleport',()=>{
  const {ctx,v}=flat();
  const dt=1/120;
  for(let i=0;i<240;i++){v.update(dt,{throttle:0,steer:0,brake:0});ctx.world.step(1/60,dt,4);}
  v.body.velocity.set(0,0,15);let moves=0,previous=v.body.position.z;
  for(let i=0;i<120;i++){v.update(dt,{throttle:.3,steer:0,brake:0});ctx.world.step(1/60,dt,4);v.syncVisual(true);if(Math.abs(v.group.position.z-previous)>1e-5)moves++;previous=v.group.position.z;}
  assert.ok(moves>=118,`${moves}/120 frames advanced`);
  v.reset({pos:[900,1.6,900],yaw:90});ctx.world.step(1/60,dt,4);v.syncVisual(true);
  assert.ok(Math.abs(v.group.position.x-900)<.1 && Math.abs(v.group.position.z-900)<.1);
  const relative=v.built.wheels[0].position.clone().sub(v.group.position);
  assert.ok(relative.length()<4,'wheels remain attached to the interpolated chassis');
  v.dispose();
});
