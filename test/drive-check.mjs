import * as CANNON from 'cannon-es';
import { NORMAL_SPEC } from '../src/vehicle/CarSpecs.js';

/**
 * 纯物理离线校验：确认引擎力符号让车往 +Z 前进，转向符号让车往 +X 右转。
 * 不需要浏览器，直接在 Node 里跑。
 */

function makeWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.defaultContactMaterial.friction = 0.6;

  // 注意：不能用旋转过的 Plane 当地面。cannon-es 的 Plane 世界 AABB 计算不考虑旋转，
  // 会导致车辆前半部分的悬挂射线检测不到地面。改用大 Box，顶面正好在 y=0。
  const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(400, 1, 400)) });
  ground.position.set(0, -1, 0);
  world.addBody(ground);
  return world;
}

function makeVehicle(world, spec) {
  const body = new CANNON.Body({ mass: spec.mass });
  body.addShape(
    new CANNON.Box(new CANNON.Vec3(spec.halfExtents[0], spec.halfExtents[1], spec.halfExtents[2])),
    new CANNON.Vec3(0, spec.offsetY, 0)
  );
  body.position.set(0, spec.resetHeight, 0);
  body.angularDamping = 0.22;
  // 注意：不要手动 addBody，RaycastVehicle.addToWorld 内部会添加，重复添加会导致物理异常

  const vehicle = new CANNON.RaycastVehicle({
    chassisBody: body,
    indexRightAxis: 0,
    indexUpAxis: 1,
    indexForwardAxis: 2
  });

  const base = {
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
    useCustomSlidingRotationalSpeed: true
  };

  const pts = [
    [-spec.axleX, spec.connectionY, spec.axleZ],
    [spec.axleX, spec.connectionY, spec.axleZ],
    [-spec.axleX, spec.connectionY, -spec.axleZ],
    [spec.axleX, spec.connectionY, -spec.axleZ]
  ];

  for (const p of pts) {
    vehicle.addWheel({
      ...base,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      axleLocal: new CANNON.Vec3(1, 0, 0),
      chassisConnectionPointLocal: new CANNON.Vec3(p[0], p[1], p[2])
    });
  }

  vehicle.addToWorld(world);
  return { body, vehicle };
}

function run({ steer = 0, steps = 240 }) {
  const spec = NORMAL_SPEC;
  const world = makeWorld();
  const { body, vehicle } = makeVehicle(world, spec);

  for (let i = 0; i < steps; i++) {
    for (let w = 0; w < 4; w++) {
      vehicle.applyEngineForce(spec.motorSign * spec.motorForce, w);
      vehicle.setBrake(0, w);
    }
    vehicle.setSteeringValue(spec.steerSign * steer * spec.steerMax, 0);
    vehicle.setSteeringValue(spec.steerSign * steer * spec.steerMax, 1);
    world.step(1 / 60);
  }

  return {
    x: body.position.x,
    y: body.position.y,
    z: body.position.z,
    speed: body.velocity.length() * 3.6
  };
}

const straight = run({ steer: 0 });
console.log('直行结果:', JSON.stringify(straight));
console.log('  -> 车头应指向 +Z，z 明显为正:', straight.z > 5 ? 'PASS' : 'FAIL');

const right = run({ steer: 1 });
console.log('右打方向结果:', JSON.stringify(right));
console.log('  -> 右转时 x 应为正:', right.x > 1 ? 'PASS' : 'FAIL');

const left = run({ steer: -1 });
console.log('左打方向结果:', JSON.stringify(left));
console.log('  -> 左转时 x 应为负:', left.x < -1 ? 'PASS' : 'FAIL');

console.log('静止车高 y =', straight.y.toFixed(3), '（轮子半径', NORMAL_SPEC.wheelRadius, '）');
