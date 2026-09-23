import * as THREE from 'three';
import { Materials } from '../world/Materials.js';
import { NORMAL_SPEC, STAR_SPEC, MONSTER_SPEC, BUS_SPEC, SPORT_SPEC, TANK_SPEC } from './CarSpecs.js';

/**
 * 所有车辆全部用基础几何体程序化搭建，不引用任何外部模型资源。
 * 全部造型均为本项目原创设计，不模仿任何既有卡通角色的形象。
 * 粉色星星小车以星星为设计母题：星形大灯、星形轮毂、星形侧贴花与车顶星标，
 * 车身不做拟人面孔，避免与任何第三方角色产生混淆。
 */

function starGeometry(outer = 0.34, inner = 0.15, depth = 0.1) {
  const shape = new THREE.Shape();
  const pts = 5;
  for (let i = 0; i < pts * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 });
  geo.center();
  return geo;
}

function tireMesh(radius, width, color) {
  const g = new THREE.Group();

  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, width, 20),
    color ? new THREE.MeshStandardMaterial({ color, roughness: 0.9 }) : Materials.rubber()
  );
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  g.add(tire);

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.02, 12),
    new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.35, metalness: 0.7 })
  );
  hub.rotation.z = Math.PI / 2;
  g.add(hub);

  return g;
}

/**
 * 普通测试轿车：半写实四门轿车，无品牌无 Logo。
 */
export function buildNormalCar(shadows) {
  const group = new THREE.Group();

  const paint = new THREE.MeshStandardMaterial({ color: 0x3f6f9c, roughness: 0.42, metalness: 0.45 });
  const paintDark = new THREE.MeshStandardMaterial({ color: 0x2b4d6e, roughness: 0.5, metalness: 0.4 });

  // 主车身，细分足够多以便凹陷明显
  const bodyGeo = new THREE.BoxGeometry(1.9, 0.78, 4.3, 5, 3, 9);
  const bodyMesh = new THREE.Mesh(bodyGeo, paint);
  bodyMesh.position.set(0, 0.15, 0);
  bodyMesh.castShadow = shadows;
  bodyMesh.receiveShadow = shadows;
  group.add(bodyMesh);

  // 驾驶舱
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.6, 2.05), paint);
  cabin.position.set(0, 0.82, -0.28);
  cabin.castShadow = shadows;
  group.add(cabin);

  // 玻璃
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.5, 0.09), Materials.glass());
  glass.position.set(0, 0.83, 0.78);
  glass.rotation.x = -0.42;
  group.add(glass);

  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.45, 0.09), Materials.glass());
  rearGlass.position.set(0, 0.83, -1.33);
  rearGlass.rotation.x = 0.42;
  group.add(rearGlass);

  for (const sx of [-0.87, 0.87]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 1.5), Materials.glass());
    side.position.set(sx, 0.85, -0.28);
    group.add(side);
  }

  // 车灯
  for (const sx of [-0.62, 0.62]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.1), new THREE.MeshStandardMaterial({ color: 0xfff4cc, emissive: 0x554422, roughness: 0.3 }));
    hl.position.set(sx, 0.36, 2.17);
    group.add(hl);

    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.1), new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.4 }));
    tl.position.set(sx, 0.36, -2.17);
    group.add(tl);
  }

  const parts = [];
  const addPart = (name, geo, material, pos, size) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(pos[0], pos[1], pos[2]);
    m.castShadow = shadows;
    group.add(m);
    parts.push({ name, mesh: m, size, localPos: new THREE.Vector3(pos[0], pos[1], pos[2]) });
    return m;
  };

  addPart('hood', new THREE.BoxGeometry(1.76, 0.1, 1.3), paint, [0, 0.55, 1.42], [1.76, 0.1, 1.3]);
  addPart('trunk', new THREE.BoxGeometry(1.76, 0.1, 1.0), paint, [0, 0.55, -1.62], [1.76, 0.1, 1.0]);
  addPart('bumperF', new THREE.BoxGeometry(1.94, 0.4, 0.34), paintDark, [0, 0.16, 2.2], [1.94, 0.4, 0.34]);
  addPart('bumperR', new THREE.BoxGeometry(1.94, 0.4, 0.34), paintDark, [0, 0.16, -2.2], [1.94, 0.4, 0.34]);
  addPart('doorL', new THREE.BoxGeometry(0.12, 0.6, 1.15), paint, [-0.96, 0.42, -0.25], [0.12, 0.6, 1.15]);
  addPart('doorR', new THREE.BoxGeometry(0.12, 0.6, 1.15), paint, [0.96, 0.42, -0.25], [0.12, 0.6, 1.15]);

  // 后视镜
  for (const sx of [-1.02, 1.02]) {
    addPart('mirror', new THREE.BoxGeometry(0.16, 0.1, 0.24), paintDark, [sx, 0.82, 0.3], [0.16, 0.1, 0.24]);
  }

  const wheels = [];
  for (let i = 0; i < 4; i++) {
    const w = tireMesh(0.36, 0.3);
    w.traverse((o) => { if (o.isMesh) o.castShadow = shadows; });
    wheels.push(w);
  }

  return {
    group,
    bodyMesh,
    glassMeshes: [glass, rearGlass],
    wheels,
    parts,
    physics: NORMAL_SPEC
  };
}

/**
 * 星星小车：原创粉色圆润小跑车，全车以五角星为设计母题。
 * 车身不做拟人面孔，没有眼睛、腮红与嘴，避免与任何既有卡通角色混淆。
 */
export function buildStarCar(shadows) {
  const group = new THREE.Group();

  const pink = new THREE.MeshStandardMaterial({ color: 0xff85bd, roughness: 0.42, metalness: 0.05 });
  const pinkDeep = new THREE.MeshStandardMaterial({ color: 0xe0478f, roughness: 0.45, metalness: 0.05 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xfff2e8, roughness: 0.35, metalness: 0.05 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.35, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2733, roughness: 0.6, metalness: 0.1 });

  // 主体：前低后高的圆润蛋形车壳，拉长轴距做出小车比例
  const bodyGeo = new THREE.SphereGeometry(1.0, 26, 20);
  const bodyMesh = new THREE.Mesh(bodyGeo, pink);
  bodyMesh.scale.set(0.9, 0.78, 1.32);
  bodyMesh.position.set(0, 0.24, 0);
  bodyMesh.castShadow = shadows;
  bodyMesh.receiveShadow = shadows;
  group.add(bodyMesh);

  // 车顶：独立的一块深色圆顶，和车身拉开层次
  const roof = new THREE.Mesh(new THREE.SphereGeometry(0.72, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), pinkDeep);
  roof.scale.set(0.86, 0.92, 1.1);
  roof.position.set(0, 0.5, -0.12);
  roof.castShadow = shadows;
  group.add(roof);

  // 底裙
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.26, 2.5), pinkDeep);
  skirt.position.set(0, -0.3, 0);
  group.add(skirt);

  // 挡风玻璃与后窗，参与玻璃破碎
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x9fd8e8,
    roughness: 0.12,
    metalness: 0.1,
    transparent: true,
    opacity: 0.72
  });
  const windshield = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), glassMat);
  windshield.scale.set(1.0, 0.9, 0.9);
  windshield.position.set(0, 0.6, 0.5);
  windshield.rotation.x = Math.PI * 0.42;
  group.add(windshield);

  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.42, 0.08), glassMat);
  rearGlass.position.set(0, 0.62, -0.78);
  rearGlass.rotation.x = -0.32;
  group.add(rearGlass);

  const parts = [];
  const addPart = (name, meshLike, pos, size, easy = false) => {
    meshLike.position.set(pos[0], pos[1], pos[2]);
    group.add(meshLike);
    parts.push({
      name,
      mesh: meshLike,
      size,
      localPos: new THREE.Vector3(pos[0], pos[1], pos[2]),
      easyDetach: easy
    });
    return meshLike;
  };

  // 星形大灯，左右各一颗，发光黄
  for (const sx of [-0.5, 0.5]) {
    const lamp = new THREE.Mesh(starGeometry(0.26, 0.115, 0.1), yellow);
    addPart('starLamp', lamp, [sx, 0.24, 1.14], [0.52, 0.52, 0.2], true);
  }

  // 前格栅：一道横向进气口，不做任何拟人表情
  addPart('grille', new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.14, 0.1), dark), [0, -0.06, 1.2], [0.72, 0.14, 0.1]);

  // 前后保险杠
  addPart('bumperF', new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.24, 0.3), cream), [0, -0.26, 1.3], [1.62, 0.24, 0.3]);
  addPart('bumperR', new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.24, 0.3), cream), [0, -0.26, -1.3], [1.62, 0.24, 0.3]);

  // 星形尾灯
  for (const sx of [-0.46, 0.46]) {
    const tail = new THREE.Mesh(starGeometry(0.18, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: 0xff5a4a, roughness: 0.4 }));
    addPart('starTail', tail, [sx, 0.22, -1.16], [0.36, 0.36, 0.16], true);
  }

  // 车顶星标，这辆车的辨识核心
  addPart('starRoof', new THREE.Mesh(starGeometry(0.34, 0.15, 0.12), yellow), [0, 1.16, -0.12], [0.68, 0.68, 0.24], true);
  addPart('starMast', new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 8), dark), [0, 0.95, -0.12], [0.1, 0.42, 0.1]);

  // 侧面星形贴花
  for (const sx of [-0.92, 0.92]) {
    const s = new THREE.Mesh(starGeometry(0.22, 0.1, 0.04), yellow);
    s.rotation.y = Math.PI / 2;
    addPart('starSide', s, [sx, 0.22, -0.05], [0.44, 0.44, 0.16], true);
  }

  // 星形尾翼
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.4), yellow);
  addPart('starWing', wing, [0, 0.86, -1.24], [1.5, 0.12, 0.4], true);

  const wheels = [];
  for (let i = 0; i < 4; i++) {
    const w = tireMesh(0.4, 0.34, 0x33303a);
    // 五角星轮毂
    const star = new THREE.Mesh(starGeometry(0.22, 0.1, 0.06), yellow);
    star.position.x = i % 2 === 0 ? -0.18 : 0.18;
    star.rotation.y = Math.PI / 2;
    w.add(star);
    w.traverse((o) => { if (o.isMesh) o.castShadow = shadows; });
    wheels.push(w);
  }

  return {
    group,
    bodyMesh,
    glassMeshes: [windshield, rearGlass],
    wheels,
    parts,
    physics: STAR_SPEC
  };
}

/**
 * 大脚越野车：高底盘、超大轮胎、橙色车漆加防滚架与车顶灯排。
 */
export function buildMonsterCar(shadows) {
  const group = new THREE.Group();

  const paint = new THREE.MeshStandardMaterial({ color: 0xe2762a, roughness: 0.5, metalness: 0.3 });
  const paintDark = new THREE.MeshStandardMaterial({ color: 0x7d3f12, roughness: 0.6, metalness: 0.25 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.4, metalness: 0.7 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff0bb, emissive: 0x6b5522, roughness: 0.3 });

  const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.0, 4.1, 5, 4, 9), paint);
  bodyMesh.position.set(0, 0.35, 0);
  bodyMesh.castShadow = shadows;
  bodyMesh.receiveShadow = shadows;
  group.add(bodyMesh);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 1.9), paintDark);
  cabin.position.set(0, 1.05, -0.3);
  cabin.castShadow = shadows;
  group.add(cabin);

  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.58, 0.1), Materials.glass());
  glass.position.set(0, 1.06, 0.72);
  glass.rotation.x = -0.3;
  group.add(glass);

  for (const sx of [-0.9, 0.9]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.5, 1.6), Materials.glass());
    side.position.set(sx, 1.06, -0.32);
    group.add(side);
  }

  // 车顶灯排
  const lightBar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 0.24), metal);
  lightBar.position.set(0, 1.5, 0.5);
  group.add(lightBar);
  for (const sx of [-0.5, -0.17, 0.17, 0.5]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 10), lightMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(sx, 1.5, 0.63);
    group.add(lamp);
  }

  const parts = [];
  const addPart = (name, geo, material, pos, size) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(pos[0], pos[1], pos[2]);
    m.castShadow = shadows;
    group.add(m);
    parts.push({ name, mesh: m, size, localPos: new THREE.Vector3(pos[0], pos[1], pos[2]) });
    return m;
  };

  addPart('hood', new THREE.BoxGeometry(1.9, 0.12, 1.2), paint, [0, 0.88, 1.35], [1.9, 0.12, 1.2]);
  addPart('trunk', new THREE.BoxGeometry(1.9, 0.12, 0.9), paint, [0, 0.88, -1.5], [1.9, 0.12, 0.9]);
  addPart('bumperF', new THREE.BoxGeometry(2.24, 0.42, 0.36), metal, [0, 0.42, 2.14], [2.24, 0.42, 0.36]);
  addPart('bumperR', new THREE.BoxGeometry(2.24, 0.42, 0.36), metal, [0, 0.42, -2.14], [2.24, 0.42, 0.36]);
  addPart('doorL', new THREE.BoxGeometry(0.14, 0.7, 1.2), paintDark, [-1.06, 0.55, -0.3], [0.14, 0.7, 1.2]);
  addPart('doorR', new THREE.BoxGeometry(0.14, 0.7, 1.2), paintDark, [1.06, 0.55, -0.3], [0.14, 0.7, 1.2]);
  addPart('lightBar', new THREE.BoxGeometry(1.5, 0.18, 0.24), metal, [0, 1.5, 0.5], [1.5, 0.18, 0.24]);

  // 防滚架四根立柱，撞飞了很有戏
  for (const sx of [-1.0, 1.0]) {
    for (const sz of [0.6, -1.2]) {
      addPart('rollBar', new THREE.BoxGeometry(0.14, 0.95, 0.14), metal, [sx, 1.15, sz], [0.14, 0.95, 0.14]);
    }
  }

  for (const sx of [-1.14, 1.14]) {
    addPart('mirror', new THREE.BoxGeometry(0.16, 0.12, 0.26), metal, [sx, 1.2, 0.5], [0.16, 0.12, 0.26]);
  }

  const wheels = [];
  for (let i = 0; i < 4; i++) {
    const w = tireMesh(0.62, 0.46, 0x24262b);
    // 胎面花纹圈，让大脚车的轮子看着更粗野
    const tread = new THREE.Mesh(
      new THREE.TorusGeometry(0.6, 0.07, 6, 20),
      new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.95 })
    );
    tread.rotation.y = Math.PI / 2;
    w.add(tread);
    w.traverse((o) => { if (o.isMesh) o.castShadow = shadows; });
    wheels.push(w);
  }

  return {
    group,
    bodyMesh,
    glassMeshes: [glass],
    wheels,
    parts,
    physics: MONSTER_SPEC
  };
}

/**
 * 城市小巴：长车身、方窗排、车顶空调，撞起来像推土机。
 */
export function buildBusCar(shadows) {
  const group = new THREE.Group();

  const paint = new THREE.MeshStandardMaterial({ color: 0x2f9e8f, roughness: 0.45, metalness: 0.25 });
  const paintDark = new THREE.MeshStandardMaterial({ color: 0x1f6f66, roughness: 0.5, metalness: 0.2 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xf2efe4, roughness: 0.5 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x51565c, roughness: 0.4, metalness: 0.65 });

  const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.7, 6.2, 5, 4, 11), paint);
  bodyMesh.position.set(0, 0.45, 0);
  bodyMesh.castShadow = shadows;
  bodyMesh.receiveShadow = shadows;
  group.add(bodyMesh);

  // 车顶奶白色顶盖
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.14, 6.0), cream);
  roof.position.set(0, 1.36, 0);
  group.add(roof);

  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.95, 0.14), Materials.glass());
  glass.position.set(0, 1.05, 3.06);
  glass.rotation.x = -0.08;
  group.add(glass);

  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 0.14), Materials.glass());
  rearGlass.position.set(0, 1.1, -3.06);
  group.add(rearGlass);

  const sideWindows = [];
  for (const sx of [-1.06, 1.06]) {
    for (const sz of [-1.7, -0.5, 0.7, 1.9]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.72, 1.05), Materials.glass());
      win.position.set(sx, 1.1, sz);
      group.add(win);
      sideWindows.push(win);
    }
  }

  const parts = [];
  const addPart = (name, geo, material, pos, size) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(pos[0], pos[1], pos[2]);
    m.castShadow = shadows;
    group.add(m);
    parts.push({ name, mesh: m, size, localPos: new THREE.Vector3(pos[0], pos[1], pos[2]) });
    return m;
  };

  addPart('hood', new THREE.BoxGeometry(2.0, 0.16, 0.8), paintDark, [0, 1.24, 2.6], [2.0, 0.16, 0.8]);
  addPart('bumperF', new THREE.BoxGeometry(2.2, 0.5, 0.4), metal, [0, 0.36, 3.28], [2.2, 0.5, 0.4]);
  addPart('bumperR', new THREE.BoxGeometry(2.2, 0.5, 0.4), metal, [0, 0.36, -3.28], [2.2, 0.5, 0.4]);
  addPart('acUnit', new THREE.BoxGeometry(1.5, 0.3, 1.7), cream, [0, 1.58, -0.6], [1.5, 0.3, 1.7]);
  addPart('doorL', new THREE.BoxGeometry(0.16, 1.3, 1.4), paintDark, [-1.06, 0.55, 2.1], [0.16, 1.3, 1.4]);
  addPart('doorR', new THREE.BoxGeometry(0.16, 1.3, 1.4), paintDark, [1.06, 0.55, 2.1], [0.16, 1.3, 1.4]);

  for (const sx of [-1.2, 1.2]) {
    addPart('mirror', new THREE.BoxGeometry(0.18, 0.16, 0.3), metal, [sx, 1.24, 2.9], [0.18, 0.16, 0.3]);
  }

  const wheels = [];
  for (let i = 0; i < 4; i++) {
    const w = tireMesh(0.45, 0.34);
    w.traverse((o) => { if (o.isMesh) o.castShadow = shadows; });
    wheels.push(w);
  }

  return {
    group,
    bodyMesh,
    glassMeshes: [glass, rearGlass, ...sideWindows],
    wheels,
    parts,
    physics: BUS_SPEC
  };
}

/**
 * 红色跑车：低矮流线车身加尾翼，大油门时排气管喷火。
 */
export function buildSportCar(shadows) {
  const group = new THREE.Group();

  const red = new THREE.MeshStandardMaterial({ color: 0xd12b2b, roughness: 0.28, metalness: 0.55 });
  const redDeep = new THREE.MeshStandardMaterial({ color: 0x8f1a1a, roughness: 0.4, metalness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.55, metalness: 0.3 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.25, metalness: 0.85 });
  const tail = new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0x8a1208, roughness: 0.35 });

  const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.5, 5, 3, 9), red);
  bodyMesh.position.set(0, 0.1, 0);
  bodyMesh.castShadow = shadows;
  bodyMesh.receiveShadow = shadows;
  group.add(bodyMesh);

  // 低矮座舱
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.42, 1.7), redDeep);
  cabin.position.set(0, 0.55, -0.15);
  cabin.castShadow = shadows;
  group.add(cabin);

  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.4, 1.5), Materials.glass());
  glass.position.set(0, 0.58, -0.15);
  group.add(glass);

  // 前唇与尾翼
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.12, 0.7), dark);
  splitter.position.set(0, -0.16, 2.0);
  group.add(splitter);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.1, 0.44), dark);
  wing.position.set(0, 0.62, -2.1);
  group.add(wing);
  for (const sx of [-0.72, 0.72]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.36, 0.14), dark);
    strut.position.set(sx, 0.42, -2.1);
    group.add(strut);
  }

  // 尾灯与排气管
  const tails = [];
  for (const sx of [-0.62, 0.62]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.1), tail);
    lamp.position.set(sx, 0.16, -2.24);
    group.add(lamp);
    tails.push(lamp);
  }

  const pipes = [];
  for (const sx of [-0.34, 0.34]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 10), chrome);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(sx, -0.06, -2.28);
    group.add(pipe);
    pipes.push(pipe);
  }

  const parts = [];
  const addPart = (name, geo, material, pos, size) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(pos[0], pos[1], pos[2]);
    m.castShadow = shadows;
    group.add(m);
    parts.push({ name, mesh: m, size, localPos: new THREE.Vector3(pos[0], pos[1], pos[2]) });
    return m;
  };

  addPart('hood', new THREE.BoxGeometry(1.76, 0.1, 1.4), red, [0, 0.42, 1.45], [1.76, 0.1, 1.4]);
  addPart('trunk', new THREE.BoxGeometry(1.76, 0.1, 0.9), red, [0, 0.42, -1.6], [1.76, 0.1, 0.9]);
  addPart('bumperF', new THREE.BoxGeometry(1.96, 0.3, 0.3), redDeep, [0, 0.06, 2.24], [1.96, 0.3, 0.3]);
  addPart('bumperR', new THREE.BoxGeometry(1.96, 0.3, 0.3), redDeep, [0, 0.06, -2.24], [1.96, 0.3, 0.3]);
  addPart('wing', new THREE.BoxGeometry(1.86, 0.1, 0.44), dark, [0, 0.62, -2.1], [1.86, 0.1, 0.44]);
  addPart('doorL', new THREE.BoxGeometry(0.1, 0.44, 1.3), redDeep, [-0.97, 0.16, -0.1], [0.1, 0.44, 1.3]);
  addPart('doorR', new THREE.BoxGeometry(0.1, 0.44, 1.3), redDeep, [0.97, 0.16, -0.1], [0.1, 0.44, 1.3]);

  for (const sx of [-1.06, 1.06]) {
    addPart('mirror', new THREE.BoxGeometry(0.16, 0.09, 0.22), dark, [sx, 0.5, 0.42], [0.16, 0.09, 0.22]);
  }

  const wheels = [];
  for (let i = 0; i < 4; i++) {
    const w = tireMesh(0.36, 0.34, 0x24262b);
    w.traverse((o) => { if (o.isMesh) o.castShadow = shadows; });
    wheels.push(w);
  }

  return {
    group,
    bodyMesh,
    glassMeshes: [glass],
    wheels,
    parts,
    physics: SPORT_SPEC,
    flamePipes: pipes
  };
}

/**
 * 坦克：厚实车体加炮塔炮管，履带包住四个大轮。
 */
export function buildTankCar(shadows) {
  const group = new THREE.Group();

  const armor = new THREE.MeshStandardMaterial({ color: 0x5c6650, roughness: 0.72, metalness: 0.35 });
  const armorDark = new THREE.MeshStandardMaterial({ color: 0x3f4738, roughness: 0.78, metalness: 0.3 });
  const tread = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.92 });
  const barrel = new THREE.MeshStandardMaterial({ color: 0x6d7663, roughness: 0.5, metalness: 0.55 });

  const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(2.56, 1.24, 5.2, 5, 4, 9), armor);
  bodyMesh.position.set(0, 0.5, 0);
  bodyMesh.castShadow = shadows;
  bodyMesh.receiveShadow = shadows;
  group.add(bodyMesh);

  // 两侧履带外壳
  for (const sx of [-1.32, 1.32]) {
    const track = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 4.6), tread);
    track.position.set(sx, 0.06, 0);
    track.castShadow = shadows;
    group.add(track);
  }

  // 炮塔
  const turret = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.15, 0.9, 10), armorDark);
  turret.position.set(0, 1.5, -0.35);
  turret.castShadow = shadows;
  group.add(turret);

  // 炮管，向车头方向伸出
  const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 3.6, 10), barrel);
  gun.rotation.x = Math.PI / 2;
  gun.position.set(0, 1.62, 1.55);
  gun.castShadow = shadows;
  group.add(gun);

  const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.4, 10), armorDark);
  muzzleBrake.rotation.x = Math.PI / 2;
  muzzleBrake.position.set(0, 1.62, 3.3);
  group.add(muzzleBrake);

  const parts = [];
  const addPart = (name, geo, material, pos, size) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(pos[0], pos[1], pos[2]);
    m.castShadow = shadows;
    group.add(m);
    parts.push({ name, mesh: m, size, localPos: new THREE.Vector3(pos[0], pos[1], pos[2]) });
    return m;
  };

  addPart('hatch', new THREE.BoxGeometry(0.8, 0.16, 0.8), armorDark, [0, 2.0, -0.35], [0.8, 0.16, 0.8]);
  addPart('stowage', new THREE.BoxGeometry(1.6, 0.4, 0.6), armorDark, [0, 1.15, -2.3], [1.6, 0.4, 0.6]);
  addPart('plowF', new THREE.BoxGeometry(2.5, 0.5, 0.4), armorDark, [0, 0.2, 2.65], [2.5, 0.5, 0.4]);
  addPart('trackL', new THREE.BoxGeometry(0.5, 1.0, 4.6), tread, [-1.32, 0.06, 0], [0.5, 1.0, 4.6]);
  addPart('trackR', new THREE.BoxGeometry(0.5, 1.0, 4.6), tread, [1.32, 0.06, 0], [0.5, 1.0, 4.6]);

  const wheels = [];
  for (let i = 0; i < 4; i++) {
    const w = tireMesh(0.5, 0.56, 0x2a2c30);
    w.traverse((o) => { if (o.isMesh) o.castShadow = shadows; });
    wheels.push(w);
  }

  return {
    group,
    bodyMesh,
    glassMeshes: [],
    wheels,
    parts,
    physics: TANK_SPEC
  };
}

export const CAR_BUILDERS = {
  normal: buildNormalCar,
  star: buildStarCar,
  monster: buildMonsterCar,
  bus: buildBusCar,
  sport: buildSportCar,
  tank: buildTankCar
};
