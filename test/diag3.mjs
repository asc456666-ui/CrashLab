import * as CANNON from 'cannon-es';

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.broadphase = new CANNON.NaiveBroadphase(world);

const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(ground);
console.log('bodies in world =', world.bodies.length);

function rayDown(y, len, x, z) {
  const from = new CANNON.Vec3(x, y, z);
  const to = new CANNON.Vec3(x, y - len, z);
  const res = new CANNON.RaycastResult();
  world.rayTest(from, to, res);
  return res;
}

const a = rayDown(0.379, 0.71, 0.86, 1.34);
console.log('手动射线 y=0.379 len=0.71 -> hasHit=', a.hasHit, 'body=', !!a.body, 'dist=', a.distance);

const b = rayDown(0.625, 0.71, 0.86, -1.45);
console.log('手动射线 y=0.625 len=0.71 -> hasHit=', b.hasHit, 'body=', !!b.body, 'dist=', b.distance);

const c = rayDown(1.48, 0.71, 0.86, 1.34);
console.log('手动射线 y=1.48 len=0.71 -> hasHit=', c.hasHit, 'body=', !!c.body, 'dist=', c.distance);

// 倾斜 5 度的射线
const q = new CANNON.Quaternion();
q.setFromEuler(0.087, 0, 0);
const dir = new CANNON.Vec3(0, -1, 0);
const out = new CANNON.Vec3();
q.vmult(dir, out);
console.log('倾斜后方向 =', out.x.toFixed(3), out.y.toFixed(3), out.z.toFixed(3));

const from = new CANNON.Vec3(0.86, 0.379, 1.34);
const to = new CANNON.Vec3(
  from.x + out.x * 0.71,
  from.y + out.y * 0.71,
  from.z + out.z * 0.71
);
const res2 = new CANNON.RaycastResult();
world.rayTest(from, to, res2);
console.log('倾斜射线 -> hasHit=', res2.hasHit, 'to.y=', to.y.toFixed(3), 'dist=', res2.distance);
