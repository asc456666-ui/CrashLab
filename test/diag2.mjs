import * as CANNON from 'cannon-es';
import { NORMAL_SPEC } from '../src/vehicle/CarSpecs.js';

const spec = NORMAL_SPEC;

function build(BroadphaseCtor) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new BroadphaseCtor(world);

  const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);

  const body = new CANNON.Body({ mass: spec.mass });
  body.addShape(
    new CANNON.Box(new CANNON.Vec3(spec.halfExtents[0], spec.halfExtents[1], spec.halfExtents[2])),
    new CANNON.Vec3(0, spec.offsetY, 0)
  );
  body.position.set(0, 0.45, 0);
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
  return { world, body, vehicle };
}

function report(label, BroadphaseCtor) {
  const { world, body, vehicle } = build(BroadphaseCtor);
  for (let i = 0; i < 90; i++) world.step(1 / 60);

  console.log('=== ' + label + ' ===');
  console.log('车身 y=' + body.position.y.toFixed(3) + ' 四元数=' +
    [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w].map((v) => v.toFixed(3)).join(','));

  for (let i = 0; i < 4; i++) {
    const w = vehicle.wheelInfos[i];
    const cp = w.chassisConnectionPointWorld;
    const rr = w.raycastResult;
    console.log(
      `  w${i} connY=${cp.y.toFixed(3)} connZ=${cp.z.toFixed(2)} contact=${!!(rr && rr.body)}` +
      ` len=${(w.suspensionLength ?? -1).toFixed(3)} hitY=${rr && rr.hitPointWorld ? rr.hitPointWorld.y.toFixed(3) : 'NA'}`
    );
  }
}

report('NaiveBroadphase', CANNON.NaiveBroadphase);
report('SAPBroadphase', CANNON.SAPBroadphase);
