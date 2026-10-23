import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createBox, createCylinder } from '../physics/Helpers.js';
import { Materials } from './Materials.js';
import { Settings } from '../core/Settings.js';
import { Population } from './Population.js';
import { FrontierWorld } from './FrontierWorld.js';

export const WORLD_REGIONS = [
  { id: 'lab', name: '碰撞实验场', subtitle: '自由碰撞 · 城市与山林', x: 0, z: 0, w: 490, d: 590, color: '#8498ad', spawn: [0, 1.5, -250], yaw: 0 },
  { id: 'mountain', name: '云顶山地', subtitle: '连续爬坡 · 山顶观景台', x: -355, z: -220, w: 230, d: 190, color: '#a2b987', spawn: [-260, 1.6, -150], yaw: -90 },
  { id: 'marsh', name: '浅湾湿地', subtitle: '泥地涉水 · 木桥与营地', x: -365, z: 160, w: 230, d: 210, color: '#5dbcae', spawn: [-275, 1.6, 90], yaw: -90 },
  { id: 'works', name: '采石工地', subtitle: '吊装落物 · 升降平台', x: 365, z: -165, w: 230, d: 220, color: '#e9ad61', spawn: [270, 1.6, -130], yaw: 90 },
  { id: 'harbor', name: '集装箱港口', subtitle: '开合桥 · 货箱与仓库', x: 385, z: 185, w: 250, d: 230, color: '#63a8d5', spawn: [290, 1.6, 190], yaw: 90 },
  { id: 'parking', name: '天空停车楼', subtitle: '双层坡道 · 屋顶跳跃', x: 0, z: 400, w: 180, d: 170, color: '#ac9add', spawn: [-62, 1.6, 325], yaw: 0 },
  { id: 'playground', name: '机械游乐谷', subtitle: '跷跷板 · 飞坡与滚筒', x: 0, z: -425, w: 250, d: 190, color: '#ed8e9d', spawn: [0, 1.6, -350], yaw: 180 },
  { id: 'highway', name: '滨海高速', subtitle: '高速车流 · 岔路与立交', x: 180, z: -890, w: 690, d: 800, color: '#dfc476', spawn: [220, 1.6, -540], yaw: 180 },
  { id: 'island', name: '生物小岛', subtitle: '经高速尽头光门进入', x: 1800, z: 0, w: 500, d: 500, mapX: -370, mapZ: -960, mapScale: 0.6, color: '#9bd881', spawn: [1800, 1.6, -155], yaw: 0, portalOnly: true },
  { id: 'work-island', name: '工地小岛', subtitle: '右侧橙色光门进入', x: 2600, z: 0, w: 500, d: 500, mapX: -370, mapZ: -600, mapScale: 0.6, color: '#eab16c', spawn: [2600, 1.6, -155], yaw: 0, portalOnly: true }
];

function groundTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const c = canvas.getContext('2d');
  c.fillStyle = '#eeece6'; c.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1800; i++) {
    c.fillStyle = i % 3 ? '#d1cec5' : '#fffdf5';
    c.fillRect((i * 47) % 128, (i * 71 + Math.floor(i / 128) * 17) % 128, 1 + i % 3, 1 + i % 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(12, 12); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** 新区域共享地面、低面数装饰与有限的动态道具，保持离线可玩。 */
export class OpenWorld {
  constructor(ctx, arena) {
    this.ctx = ctx;
    this.arena = arena;
    this.regions = WORLD_REGIONS;
    this.actions = [];
    this.surfaces = [];
    this.discoveries = [];
    this.slopes = [];
    this.elapsed = 0;
    this.nearestAction = null;
    this.region = this.regions[0];
    this.found = new Set(Array.isArray(Settings.data.discoveries) ? Settings.data.discoveries : []);
    this.batches = new Map();
    this.overlayMats = new Map();
    this.mats = {
      grass: new THREE.MeshStandardMaterial({ color: 0x68875a, roughness: 1 }),
      dirt: new THREE.MeshStandardMaterial({ color: 0xa78962, roughness: 1 }),
      mud: new THREE.MeshStandardMaterial({ color: 0x65513b, roughness: 0.72 }),
      road: new THREE.MeshStandardMaterial({ color: 0x454e55, roughness: 0.95 }),
      sand: new THREE.MeshStandardMaterial({ color: 0xc5b28c, roughness: 1 }),
      teal: new THREE.MeshStandardMaterial({ color: 0x258d90, roughness: 0.65 }),
      orange: new THREE.MeshStandardMaterial({ color: 0xd58949, roughness: 0.8 }),
      blue: new THREE.MeshStandardMaterial({ color: 0x4a7da1, roughness: 0.7 }),
      cream: new THREE.MeshStandardMaterial({ color: 0xe3dbc6, roughness: 0.9 }),
      leaf: new THREE.MeshStandardMaterial({ color: 0x3b684a, roughness: 1 }),
      trunk: new THREE.MeshStandardMaterial({ color: 0x74553e, roughness: 1 }),
      beacon: new THREE.MeshStandardMaterial({ color: 0x8ffff0, emissive: 0x18786c, emissiveIntensity: 0.8, metalness: 0.3, roughness: 0.3 })
    };
    const texture = groundTexture();
    for (const key of ['grass', 'dirt', 'sand', 'mud']) this.mats[key].map = texture;
    this.buildConnections();
    this.buildMountain();
    this.buildMarsh();
    this.buildWorks();
    this.buildHarbor();
    this.buildParking();
    this.buildPlayground();
    this.buildRepairPads();
    this.population = new Population(ctx);
    this.population.seedMain();
    this.population.adoptMovers(arena.movers);
    this.frontier = new FrontierWorld(this);
    this.flushBatches();
    for (const region of this.regions.slice(1)) {
      region.spawnIndex = arena.spawnPoints.length;
      arena.spawnPoints.push({ pos: region.spawn, yaw: region.yaw });
    }
    this.regions[0].spawnIndex = 0;
  }

  box(size, pos, material, options = {}) {
    const result = createBox(this.ctx, { size, pos, material, ...options });
    if (!options.breakable && !options.mass) result.body.noBreak = true;
    return result;
  }

  // 重复的道路装饰、树木与集装箱肋条合批；不为纯装饰添加物理体。
  decorate(size, pos, material, rotation = 0, kind = 'box') {
    if (kind === 'box' && size[1] < 0.2 && !material.polygonOffset) material = this.overlayMaterial(material, pos[1] >= 0.14 ? 4 : 3);
    const key = `${material.uuid}:${kind}`;
    if (!this.batches.has(key)) this.batches.set(key, { material, kind, transforms: [] });
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation), new THREE.Vector3(...size));
    this.batches.get(key).transforms.push(matrix);
  }

  flushBatches() {
    for (const { material, kind, transforms } of this.batches.values()) {
      const geometry = kind === 'tree' || kind === 'grass' ? new THREE.ConeGeometry(0.5, 1, kind === 'grass' ? 3 : 7) : new THREE.BoxGeometry(1, 1, 1);
      const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
      transforms.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.receiveShadow = this.ctx.shadows;
      mesh.castShadow = this.ctx.shadows && kind === 'tree';
      mesh.computeBoundingSphere();
      this.ctx.scene.add(mesh);
    }
    this.batches.clear();
  }

  overlayMaterial(material, layer = 2) {
    const key = `${material.uuid}:${layer}`;
    if (!this.overlayMats.has(key)) {
      const copy = material.clone(); copy.polygonOffset = true;
      copy.polygonOffsetFactor = -layer; copy.polygonOffsetUnits = -layer;
      this.overlayMats.set(key, copy);
    }
    return this.overlayMats.get(key);
  }

  patch(x, z, w, d, material, y) {
    const base = material === this.mats.grass;
    y ??= base ? 0.025 : 0.075;
    this.decorate([w, 0.02, d], [x, y, z], this.overlayMaterial(material, base ? 1 : 2));
  }

  road(a, b, width = 16) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
    this.decorate([width, 0.025, len + 1], [(a[0] + b[0]) / 2, 0.14, (a[1] + b[1]) / 2], this.overlayMaterial(this.mats.road, 3), yaw);
    for (let t = 10; t < len - 6; t += 18) {
      this.decorate([0.3, 0.025, 7], [a[0] + dx * t / len, 0.18, a[1] + dz * t / len], this.overlayMaterial(this.mats.cream, 4), yaw);
    }
  }

  /** 顶面端点严格对齐；旋转与平移同时用于视觉及物理。 */
  slope(from, to, width = 15, material = this.mats.road) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const delta = b.clone().sub(a);
    const yaw = Math.atan2(delta.x, delta.z);
    const pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -pitch));
    const thickness = 1.4;
    const center = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, -thickness / 2, 0).applyQuaternion(quat));
    const item = this.box([width, thickness, delta.length() + 0.4], center.toArray(), this.overlayMaterial(material, 1));
    item.mesh.quaternion.copy(quat);
    item.body.quaternion.copy(quat);
    item.body.updateAABB();
    item.body.launchRamp = pitch > 0.14 && delta.length() < 70;
    this.slopes.push({ ...item, from: a, to: b, width, thickness });
    return item;
  }

  label(text, x, y, z, color = '#e3f5ee') {
    // 地标文字只建一次纹理，无外部字体或资源请求。
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const c = canvas.getContext('2d');
    c.fillStyle = '#172a31'; c.fillRect(0, 0, 512, 128);
    c.fillStyle = color; c.font = 'bold 42px sans-serif'; c.textAlign = 'center';
    c.fillText(text, 256, 78);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: true }));
    sprite.position.set(x, y, z); sprite.scale.set(9, 2.25, 1);
    sprite.onBeforeRender = (_renderer, _scene, camera) => {
      sprite.material.opacity = THREE.MathUtils.clamp((camera.position.distanceTo(sprite.position) - 12) / 20, 0, 1);
    };
    this.ctx.scene.add(sprite);
  }

  landmark(id, name, pos) {
    const marker = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.16, 5, 16), this.mats.beacon);
    marker.position.set(pos[0], pos[1] + 2, pos[2]);
    marker.visible = !this.found.has(id);
    this.ctx.scene.add(marker);
    this.discoveries.push({ id, name, pos: new THREE.Vector3(...pos), marker });
  }

  addAction(name, pos, callback, radius = 22) {
    this.actions.push({ name, pos: new THREE.Vector3(...pos), callback, radius });
  }

  buildConnections() {
    for (const [x, z, w, d] of [[-450, 0, 300, 1200], [450, 0, 300, 1200], [0, -450, 600, 300], [0, 450, 600, 300]]) this.patch(x, z, w, d, this.mats.grass);
    for (const [a, b] of [
      [[-220, -300], [250, -300]], [[250, -300], [250, 310]], [[250, 310], [-220, 310]], [[-220, 310], [-220, -300]],
      [[-220, -150], [-275, -150]], [[-220, 90], [-350, 90]], [[250, -130], [330, -130]], [[250, 190], [310, 190]],
      [[0, 285], [0, 325]], [[0, 325], [-62, 325]], [[0, -260], [0, -350]]
    ]) this.road(a, b);
    for (let i = 0; i < 48; i++) {
      const x = -550 + ((i * 137) % 1100), z = -540 + ((i * 193) % 1080);
      if (Math.abs(x) < 510 && Math.abs(z) < 510) continue;
      this.decorate([2, 7, 2], [x, 3.5, z], this.mats.trunk);
      this.decorate([12, 18, 12], [x, 14, z], this.mats.leaf, i, 'tree');
    }
    this.ctx.scene.fog = new THREE.Fog(0xb3c9cf, 350, 1000);
  }

  buildMountain() {
    this.patch(-355, -220, 230, 190, this.mats.dirt);
    const nodes = [[-260, 0.08, -150], [-415, 18, -150], [-415, 34, -270], [-285, 48, -270]];
    // 坡道接到平台边缘，而不是平台中心，避免平台前缘高于斜面形成台阶。
    this.slope(nodes[0], [-399, 18, -150], 18, this.mats.dirt);
    this.slope([-415, 18, -166], [-415, 34, -254], 18, this.mats.dirt);
    this.slope([-399, 34, -270], [-301, 48, -270], 18, this.mats.dirt);
    for (let i = 1; i < nodes.length; i++) {
      const [x, y, z] = nodes[i];
      this.box([32, y, 32], [x, y / 2, z], this.mats.dirt);
      for (const dx of [-14, 14]) for (const dz of [-14, 14]) this.box([0.5, 1.4, 0.5], [x + dx, y + 0.7, z + dz], Materials.wood());
    }
    // 山体在道路下面，顶部低于对应行车面，不形成拦路台阶。
    for (const [size, pos] of [ [[100, 4, 80], [-365, 2, -150]], [[80, 18, 90], [-415, 9, -225]], [[80, 32, 65], [-310, 16, -270]] ]) this.box(size, pos, this.mats.dirt);
    this.label('云顶山地 · 沿坡登顶', -267, 8, -145);
    this.label('云顶观景台  48m', -285, 55, -280);
    this.landmark('summit', '云顶观景台', [-285, 48, -270]);
    this.landmark('mountain-corner', '半山转角', [-415, 18, -150]);
    this.slope([-285, 48, -260], [-285, 54, -232], 10, Materials.hazard());
  }

  buildMarsh() {
    this.patch(-365, 160, 225, 205, this.mats.sand);
    this.patch(-355, 150, 125, 95, this.mats.mud, 0.11);
    this.surfaces.push({ minX: -417, maxX: -292, minZ: 102, maxZ: 198, type: 'mud', grip: 0.58, drag: 0.65 });
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x429c9d, transparent: true, opacity: 0.65, roughness: 0.22, metalness: 0.2 });
    this.patch(-395, 220, 100, 42, waterMat, 0.21);
    this.ctx.waterZones.push({ minX: -445, maxX: -345, minZ: 199, maxZ: 241, y: 0.21 });
    this.slope([-448, 0.05, 220], [-425, 2.4, 220], 13, Materials.wood());
    this.box([60, 0.7, 13], [-395, 2.05, 220], Materials.wood());
    this.slope([-365, 2.4, 220], [-342, 0.05, 220], 13, Materials.wood());
    for (const z of [213.2, 226.8]) this.box([60, 0.7, 0.5], [-395, 3.1, z], Materials.wood(), { breakable: true });
    for (let i = 0; i < 7; i++) {
      this.decorate([2, 5, 2], [-455 + i * 28, 2.5, 265], this.mats.trunk);
      this.decorate([10, 13, 10], [-455 + i * 28, 10, 265], this.mats.leaf, 0, 'tree');
    }
    // 营地是有实体碰撞的可绕行棚屋。
    this.box([20, 0.5, 18], [-450, 0.25, 90], Materials.wood());
    for (const dx of [-8, 8]) this.box([0.7, 5, 14], [-450 + dx, 2.5, 90], this.mats.teal);
    this.box([20, 0.5, 18], [-450, 5.2, 90], this.mats.teal);
    this.label('浅湾湿地 · 泥路与涉水', -280, 8, 95);
    this.landmark('camp', '林边营地', [-450, 0.5, 90]);
    this.landmark('wooden-bridge', '浅湾木桥', [-395, 2.4, 220]);
  }

  buildWorks() {
    this.patch(365, -165, 225, 215, this.mats.sand);
    for (let i = 0; i < 4; i++) {
      const x = 320 + i * 36;
      this.slope([x, 0.05, -220], [x, 6 + i * 2, -185], 22, this.mats.dirt);
      this.slope([x, 6 + i * 2, -185], [x, 0.05, -150], 22, this.mats.dirt);
    }
    for (let i = 0; i < 8; i++) this.box([2.6, 2.6, 2.6], [385 + (i % 4) * 4, 1.3 + Math.floor(i / 4) * 2.7, -105], i % 2 ? Materials.wood() : this.mats.orange, { mass: 35 });
    for (const x of [340, 360]) this.box([1, 22, 1], [x, 11, -110], this.mats.orange);
    this.box([25, 1.2, 3], [350, 22, -110], this.mats.orange);
    this.decorate([0.15, 7, 0.15], [350, 18, -110], Materials.metalDark());
    this.crane = this.box([7, 6, 7], [350, 14, -110], Materials.metal(), { mass: 700 });
    this.crane.body.allowSleep = true; this.crane.body.sleep();
    this.addAction('吊机：释放 / 收回重物', [350, 1, -110], () => {
      const b = this.crane.body;
      if (b.sleepState === CANNON.Body.SLEEPING && b.position.y > 10) b.wakeUp();
      else {
        b.position.set(350, 14, -110); b.quaternion.set(0, 0, 0, 1);
        b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0); b.force.set(0, 0, 0); b.torque.set(0, 0, 0); b.updateAABB(); b.sleep();
      }
      return '吊机已操作，留意上方重物';
    }, 30);
    this.lift = this.box([18, 0.8, 18], [450, -0.2, -100], this.mats.orange);
    this.lift.body.type = CANNON.Body.KINEMATIC;
    this.ctx.dynamics.push(this.lift);
    this.liftHeight = 0.2; this.liftTarget = 0.2;
    for (const x of [439, 461]) this.box([1, 23, 1], [x, 11.5, -100], Materials.metalDark());
    this.box([35, 1, 30], [450, 17.5, -65], this.mats.cream);
    this.slope([450, 18, -91], [450, 18, -79], 18, this.mats.orange);
    this.addAction('升降台：升起 / 降下', [450, 2, -100], () => {
      this.liftTarget = this.liftTarget > 5 ? 0.2 : 18;
      return this.liftTarget > 5 ? '升降台正在升起' : '升降台正在下降';
    }, 27);
    this.label('采石工地 · E 操作机关', 277, 8, -130);
    this.landmark('works-roof', '工地高空平台', [450, 18, -65]);
    this.landmark('sand-crest', '砂丘之巅', [428, 12, -185]);
  }

  container(x, y, z, color, size = [24, 6, 10]) {
    const item = this.box(size, [x, y + size[1] / 2, z], color, { breakable: true });
    const ribs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, size[1] - 0.4, size[2] + 0.08), color, 11);
    for (let i = 0; i < 11; i++) ribs.setMatrixAt(i, new THREE.Matrix4().makeTranslation(-10 + i * 2, 0, 0));
    item.mesh.add(ribs);
  }

  buildHarbor() {
    this.patch(385, 185, 245, 225, this.mats.road);
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x397e9e, transparent: true, opacity: 0.8, roughness: 0.2, metalness: 0.25 });
    this.patch(385, 190, 50, 125, waterMat, 0.19);
    this.ctx.waterZones.push({ minX: 360, maxX: 410, minZ: 127, maxZ: 253, y: 0.19 });
    for (const x of [335, 435]) this.box([50, 2, 130], [x, 1, 190], this.mats.cream);
    this.slope([285, 0.05, 190], [310, 2, 190], 18);
    this.slope([460, 2, 190], [480, 0.05, 190], 18);
    this.bridge = this.box([50, 0.8, 17], [385, 1.6, 190], Materials.hazard());
    this.bridge.body.type = CANNON.Body.KINEMATIC;
    this.ctx.dynamics.push(this.bridge);
    this.bridgeAngle = 0; this.bridgeTarget = 0;
    this.addAction('港口桥：打开 / 放平', [360, 3, 190], () => {
      this.bridgeTarget = this.bridgeTarget > 0 ? 0 : Math.PI / 3;
      return this.bridgeTarget > 0 ? '港口桥正在打开' : '港口桥正在放平';
    }, 36);
    for (const [x, z, mat] of [[327, 143, this.mats.teal], [327, 232, this.mats.orange], [434, 143, this.mats.blue], [434, 235, this.mats.orange]]) this.container(x, 2, z, mat);
    this.container(327, 8, 232, this.mats.blue);
    this.slope([327, 2, 170], [327, 14, 227], 12, this.mats.teal);
    for (let i = 0; i < 6; i++) this.box([2.4, 2.4, 2.4], [422 + (i % 3) * 5, 3.2, 204 + Math.floor(i / 3) * 7], Materials.wood(), { mass: 25 });
    // 可以从正面驶入的大仓库。
    for (const x of [477, 513]) this.box([1, 13, 45], [x, 6.5, 110], this.mats.blue, { breakable: true });
    this.box([36, 13, 1], [495, 6.5, 88], this.mats.blue, { breakable: true });
    this.box([38, 1, 47], [495, 13, 110], this.mats.cream);
    this.label('集装箱港口 · 开合桥', 288, 8, 178);
    this.landmark('container-top', '集装箱屋顶', [327, 14, 232]);
    this.landmark('warehouse', '港口秘密仓库', [495, 0.1, 105]);
  }

  buildParking() {
    this.patch(0, 400, 175, 165, this.mats.road);
    for (const y of [8, 16]) {
      this.box([108, 0.9, 112], [0, y - 0.45, 389], this.mats.cream);
      // 两端留出与侧坡连接的宽开口。
      for (const x of [-53, 53]) this.box([0.5, 1, 62], [x, y + 0.5, 390], this.mats.teal);
      for (let i = -3; i <= 3; i++) this.decorate([0.25, 0.02, 12], [i * 12, y + 0.02, 383], this.mats.road);
    }
    for (const x of [-42, 42]) for (const z of [350, 430]) this.box([2.2, 16, 2.2], [x, 8, z], this.mats.teal);
    this.slope([-62, 0.05, 325], [-62, 8, 426], 18);
    this.slope([-71, 8, 435], [-43, 8, 435], 18);
    this.slope([43, 8, 435], [71, 8, 435], 18);
    this.slope([62, 8, 426], [62, 16, 349], 18);
    this.slope([71, 16, 340], [43, 16, 340], 18);
    this.slope([0, 16, 440], [0, 22, 465], 13, Materials.hazard());
    this.box([40, 1, 32], [0, 10.5, 500], this.mats.teal);
    this.slope([0, 11, 515], [0, 0.05, 558], 18);
    this.label('天空停车楼 · 沿侧坡上楼', -62, 8, 322);
    this.landmark('parking-roof', '停车楼天台', [-20, 16, 410]);
    this.landmark('sky-island', '屋顶落脚台', [0, 11, 500]);
  }

  buildPlayground() {
    this.patch(0, -425, 245, 185, this.mats.sand);
    for (let i = 0; i < 3; i++) {
      this.slope([-78 + i * 55, 0.05, -370], [-78 + i * 55, 7 + i * 3, -410], 17, [this.mats.teal, this.mats.orange, this.mats.blue][i]);
      this.slope([-78 + i * 55, 7 + i * 3, -447], [-78 + i * 55, 0.05, -490], 20, this.mats.dirt);
    }
    const base = this.box([5, 2, 5], [92, 1, -405], Materials.metalDark());
    this.seesaw = this.box([14, 0.7, 38], [92, 2.4, -405], this.mats.orange, { mass: 500 });
    this.seesaw.body.angularDamping = 0.6;
    const hinge = new CANNON.HingeConstraint(base.body, this.seesaw.body, { pivotA: new CANNON.Vec3(0, 1.4, 0), pivotB: new CANNON.Vec3(), axisA: new CANNON.Vec3(1, 0, 0), axisB: new CANNON.Vec3(1, 0, 0), collideConnected: false });
    this.ctx.world.addConstraint(hinge);
    this.slope([92, 0.05, -370], [92, 2.75, -386], 15, this.mats.teal);
    this.slope([92, 2.75, -424], [92, 0.05, -440], 15, this.mats.teal);
    // 大滚筒可被推动；轴沿 X，能顺着地面滚动。
    for (let i = 0; i < 3; i++) createCylinder(this.ctx, { radius: 2.5, height: 8, pos: [70 + i * 13, 2.5, -475], rot: [0, 0, 90], mass: 110, material: this.mats.blue, segments: 12 });
    this.label('机械游乐谷 · 自由试跳', 0, 8, -350);
    this.landmark('jump-gap', '飞跃峡谷', [-23, 8, -430]);
    this.landmark('seesaw', '平衡机关', [92, 2.75, -405]);
  }

  buildRepairPads() {
    for (const [x, z] of [[-250, -130], [-275, 65], [270, -90], [280, 220], [-90, 320], [115, -345]]) {
      this.patch(x, z, 14, 14, this.mats.teal, 0.09);
      this.decorate([1, 0.03, 9], [x, 0.12, z], this.mats.cream);
      this.decorate([9, 0.03, 1], [x, 0.12, z], this.mats.cream);
      this.addAction('维修站：原地修好车辆', [x, 1, z], vehicle => {
        const position = vehicle.body.position;
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(vehicle.group.quaternion);
        vehicle.reset({ pos: [position.x, position.y + 0.3, position.z], yaw: THREE.MathUtils.radToDeg(Math.atan2(forward.x, forward.z)) });
        this.ctx.fx?.clear();
        this.ctx.ui?.hideBanner();
        return '维修完成，继续探索吧';
      }, 12);
    }
  }

  surfaceAt(pos) {
    if (pos.y > 3) return null;
    return this.surfaces.find(s => pos.x > s.minX && pos.x < s.maxX && pos.z > s.minZ && pos.z < s.maxZ) || null;
  }

  interact(vehicle) {
    this.findAction(vehicle.body.position);
    if (!this.nearestAction) return '附近没有机关，靠近维修站、吊机、升降台或港口桥再试';
    return this.nearestAction.callback(vehicle);
  }

  findAction(pos) {
    let nearest = null, best = Infinity;
    for (const action of this.actions) {
      // 机关控制允许在升降台不同高度操作，但限制在机构所在的高度范围。
      const d = Math.hypot(pos.x - action.pos.x, pos.z - action.pos.z);
      if (d < action.radius && Math.abs(pos.y - action.pos.y) < 24 && d < best) { nearest = action; best = d; }
    }
    this.nearestAction = nearest;
  }

  update(dt, vehicle) {
    this.elapsed += dt;
    const p = vehicle.body.position;
    this.region = this.regions.slice(1).find(r => Math.abs(p.x - r.x) < r.w / 2 && Math.abs(p.z - r.z) < r.d / 2) || this.regions[0];
    this.findAction(p);
    for (const spot of this.discoveries) {
      if (this.found.has(spot.id)) continue;
      spot.marker.rotation.y += dt;
      if (spot.pos.distanceTo(p) < 9) {
        this.found.add(spot.id); spot.marker.visible = false;
        Settings.set('discoveries', [...this.found]);
        this.ctx.ui?.showMessage(`发现：${spot.name}  ·  ${this.foundCount} / ${this.discoveries.length}`, 4500);
      }
    }
    this.updateMechanisms(dt);
    this.population.update(dt, p);
    this.frontier.update(dt, vehicle);
    if (!this.frontier.contains(p) && (Math.abs(p.x) > 590 || Math.abs(p.z) > 590)) {
      vehicle.body.velocity.x *= Math.exp(-dt * 3);
      vehicle.body.velocity.z *= Math.exp(-dt * 3);
      if (Math.abs(p.x) > 610 || Math.abs(p.z) > 610) vehicle.requestReset();
    }
  }

  get foundCount() { return this.discoveries.filter(d => this.found.has(d.id)).length; }

  updateMechanisms(dt) {
    if (dt <= 0) return;
    this.liftHeight = this.lift.body.position.y + 0.4;
    const liftNext = THREE.MathUtils.clamp(this.liftTarget - this.liftHeight, -dt * 2.5, dt * 2.5);
    this.lift.body.velocity.set(0, liftNext / dt, 0);

    this.bridgeAngle = 2 * Math.atan2(this.bridge.body.quaternion.z, this.bridge.body.quaternion.w);
    const turn = THREE.MathUtils.clamp(this.bridgeTarget - this.bridgeAngle, -dt * 0.3, dt * 0.3);
    this.bridgeAngle += turn;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.bridgeAngle);
    const center = new THREE.Vector3(25, -0.4, 0).applyQuaternion(q).add(new THREE.Vector3(360, 2, 190));
    // 运动在物理步进之前给出速度，供车体接触求解。
    this.bridge.body.velocity.set((center.x - this.bridge.body.position.x) / dt, (center.y - this.bridge.body.position.y) / dt, 0);
    this.bridge.body.angularVelocity.set(0, 0, turn / dt);
  }

  reset() {
    this.bridgeAngle = 0; this.bridgeTarget = 0;
    this.liftHeight = 0.2; this.liftTarget = 0.2;
    this.lift.body.position.set(450, -0.2, -100);
    this.bridge.body.position.set(385, 1.6, 190);
    this.bridge.body.quaternion.set(0, 0, 0, 1);
    for (const item of [this.lift, this.bridge]) {
      item.body.velocity.set(0, 0, 0); item.body.angularVelocity.set(0, 0, 0); item.body.updateAABB();
      item.mesh.position.copy(item.body.position); item.mesh.quaternion.copy(item.body.quaternion);
    }
    this.crane.body.sleep();
    this.nearestAction = null;
    this.population?.reset();
  }
}
