import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * 同时创建 three 网格与 cannon 刚体的辅助函数，保证视觉与物理永远对齐。
 */

export function createBox(ctx, opts) {
  const {
    size,
    pos,
    rot = [0, 0, 0],
    mass = 0,
    material = null,
    physMaterial = null,
    castShadow = true
  } = opts;

  const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const mesh = new THREE.Mesh(geo, material || new THREE.MeshStandardMaterial({ color: 0x9aa0a4 }));
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.rotation.set(THREE.MathUtils.degToRad(rot[0]), THREE.MathUtils.degToRad(rot[1]), THREE.MathUtils.degToRad(rot[2]));
  mesh.castShadow = ctx.shadows && castShadow;
  mesh.receiveShadow = ctx.shadows;
  ctx.scene.add(mesh);

  const shape = new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2));
  const body = new CANNON.Body({ mass, shape, material: physMaterial || undefined });
  body.position.set(pos[0], pos[1], pos[2]);
  body.quaternion.setFromEuler(
    THREE.MathUtils.degToRad(rot[0]),
    THREE.MathUtils.degToRad(rot[1]),
    THREE.MathUtils.degToRad(rot[2])
  );
  ctx.world.addBody(body);
  // 关键：cannon-es 新建刚体的 AABB 是局部坐标且 aabbNeedsUpdate 为 false，
  // 不刷新的话远处的静态碰撞体不会被射线检测到，车辆悬挂会直接失效。
  body.updateAABB();

  if (mass > 0) {
    ctx.dynamics.push({ mesh, body });
  } else if (ctx.staticMeshes) {
    // 静态体也留一份刚体到网格的映射，坦克炮打中时要能找到它并打碎
    ctx.staticMeshes.set(body, mesh);
  }

  return { mesh, body };
}

export function createCylinder(ctx, opts) {
  const { radius, height, pos, rot = [0, 0, 0], mass = 0, material = null, segments = 16 } = opts;

  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, segments),
    material || new THREE.MeshStandardMaterial({ color: 0x9aa0a4 })
  );
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.rotation.set(THREE.MathUtils.degToRad(rot[0]), THREE.MathUtils.degToRad(rot[1]), THREE.MathUtils.degToRad(rot[2]));
  mesh.castShadow = ctx.shadows;
  mesh.receiveShadow = ctx.shadows;
  ctx.scene.add(mesh);

  const shape = new CANNON.Cylinder(radius, radius, height, segments);
  const body = new CANNON.Body({ mass, shape });
  body.position.set(pos[0], pos[1], pos[2]);
  body.quaternion.setFromEuler(
    THREE.MathUtils.degToRad(rot[0]),
    THREE.MathUtils.degToRad(rot[1]),
    THREE.MathUtils.degToRad(rot[2])
  );
  ctx.world.addBody(body);
  body.updateAABB();

  if (mass > 0) ctx.dynamics.push({ mesh, body });

  return { mesh, body };
}

export function syncDynamics(dynamics) {
  for (let i = 0; i < dynamics.length; i++) {
    const d = dynamics[i];
    d.mesh.position.copy(d.body.position);
    d.mesh.quaternion.copy(d.body.quaternion);
  }
}
