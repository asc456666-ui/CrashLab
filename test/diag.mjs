import * as CANNON from 'cannon-es';
import { NORMAL_SPEC } from '../src/vehicle/CarSpecs.js';

const spec = NORMAL_SPEC;
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);

const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(ground);

const body = new CANNON.Body({ mass: spec.mass });
body.addShape(
  new CANNON.Box(new CANNON.Vec3(spec.halfExtents[0], spec.halfExtents[1], spec.halfExtents[2])),
  new CANNON.Vec3(0, spec.offsetY, 0)
);
body.position.set(0, spec.resetHeight, 0);
body.angularDamping = 0.22;

const vehicle = new CANNON.RaycastVehicle({
  chassisBody: body,
  indexRightAxis: 0,
  indexUpAxis: 1,
  indexForwardAxis: 2
});

const pts = [
  [-spec.axleX, spec.connectionY, spec.axleZ],
  [spec.axleX, spec.connectionY, spec.axleZ],
  [-spec.axleX, spec.connectionY, -spec.axleZ],
  [spec.axleX, spec.connectionY, -spec.axleZ]
];

for (const p of pts) {
  vehicle.addWheel({
    radius: spec.wheelRadius,
    directionLocal: new CANNON.Vec3(0, -1, 0),
    suspensionStiffness: spec.suspensionStiffness,
    suspensionRestLength: spec.suspensionRestLength,
    frictionSlip: spec.frictionSlip,
    dampingRelaxation: spec.dampingRelaxation,
    dampingCompression: spec.dampingCompression,
    maxSuspensionForce: spec.maxSuspensionForce,
    rollInfluence: spec.rollInfluence,
    axleLocal: new CANNON.Vec3(1, 0, 0),
    maxSuspensionTravel: spec.maxSuspensionTravel,
    customSlidingRotationalSpeed: -30,
    useCustomSlidingRotationalSpeed: true,
    chassisConnectionPointLocal: new CANNON.Vec3(p[0], p[1], p[2])
  });
}

vehicle.addToWorld(world);

function stepAll(n, force) {
  for (let i = 0; i < n; i++) {
    for (let w = 0; w < 4; w++) {
      vehicle.applyEngineForce(force, w);
      vehicle.setBrake(0, w);
    }
    world.step(1 / 60);
  }
}

stepAll(60, spec.motorForce);

console.log('--- 60 步后（正向力 ' + spec.motorForce + '）---');
console.log('body y =', body.position.y.toFixed(3), ' z =', body.position.z.toFixed(3), ' vel =', body.velocity.z.toFixed(3));
console.log('currentVehicleSpeedKmHour =', vehicle.currentVehicleSpeedKmHour.toFixed(2));

for (let i = 0; i < 4; i++) {
  const w = vehicle.wheelInfos[i];
  const rr = w.raycastResult;
  console.log(
    `wheel${i} contact=${rr && !!rr.body} suspLen=${(w.suspensionLength ?? -1).toFixed(3)}` +
    ` suspForce=${(w.suspensionForce ?? -1).toFixed(1)} engine=${w.engineForce}` +
    ` fwdImp=${(w.forwardImpulse ?? -1).toFixed(3)} skid=${(w.skidInfo ?? -1).toFixed(3)}`
  );
}

stepAll(60, -spec.motorForce);
console.log('--- 再 60 步（反向力）---');
console.log('body z =', body.position.z.toFixed(3), ' vel.z =', body.velocity.z.toFixed(3));
console.log('speed kmh =', vehicle.currentVehicleSpeedKmHour.toFixed(2));
