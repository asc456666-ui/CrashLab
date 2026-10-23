import * as THREE from 'three';
import { createCylinder } from '../physics/Helpers.js';

/** 高速与独立小岛：小岛只能由高速传送门进入，离岛门固定回车库。 */
export class FrontierWorld {
  constructor(world) {
    this.world = world; this.ctx = world.ctx; this.portals = []; this.cooldown = 0;
    this.buildHighway(); this.buildIsland(); this.buildWorkIsland();
  }

  isIsland(p) { return p.x > 1500; }
  contains(p) {
    return (p.x > -180 && p.x < 540 && p.z < -480 && p.z > -1290) ||
      (p.x > 1530 && p.x < 2070 && Math.abs(p.z) < 270) ||
      (p.x > 2330 && p.x < 2870 && Math.abs(p.z) < 270);
  }

  portal(x, z, destination, label, color) {
    const group = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(8, 0.65, 8, 40), new THREE.MeshBasicMaterial({ color }));
    rim.position.y = 8.2; group.add(rim);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(7.6, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.23, side: THREE.DoubleSide, depthWrite: false }));
    disc.position.y = 8.2; group.add(disc);
    group.position.set(x, 0, z); this.ctx.scene.add(group);
    for (const dx of [-9, 9]) this.world.box([1.4, 11, 2], [x + dx, 5.5, z], this.world.mats.teal);
    this.world.label(label, x, 19, z);
    this.portals.push({ x, z, destination, rim, disc });
  }

  buildHighway() {
    const w = this.world;
    w.box([700, 2, 710], [180, -1.02, -925], w.mats.grass);
    w.patch(180, -945, 700, 670, w.mats.grass);
    w.road([250, -300], [220, -610], 48);
    w.road([220, -610], [220, -1220], 48);
    // 岔路连接地面主干道与跨线立交，两侧都有可自由选择的出口。
    w.slope([200, 0.1, -750], [-40, 0.1, -940], 23);
    w.slope([-40, 0.1, -940], [-110, 0.1, -900], 23);
    w.slope([-110, 0.1, -900], [30, 12, -900], 24);
    w.slope([30, 12, -900], [300, 12, -900], 24);
    w.slope([300, 12, -900], [470, 0.1, -900], 24);
    w.road([240, -700], [420, -740], 24);
    w.road([420, -740], [470, -900], 24);
    w.road([470, -900], [420, -1020], 24);
    w.slope([420, 0.1, -1020], [420, 13, -1060], 22, w.mats.orange);
    for (const x of [60, 125, 300]) w.box([3, 11.2, 3], [x, 5.6, -900], w.mats.cream);
    for (let z = -635; z > -1190; z -= 35) {
      if (Math.abs(z + 700) < 45 || Math.abs(z + 750) < 42 || Math.abs(z + 900) < 25) continue;
      for (const x of [194, 246]) w.box([0.6, 1.2, 27], [x, 0.6, z], w.mats.cream, { breakable: true });
    }
    for (const x of [208, 232]) for (let z = -540; z > -1200; z -= 18) w.decorate([0.2, 0.03, 7], [x, 0.19, z], w.mats.cream);
    w.label('滨海高速 · 左岔路通往立交桥', 220, 11, -680);
    w.label('小岛传送门  ↓', 220, 17, -1110);
    this.portal(206, -1190, 'island', '左门 · 生物小岛', 0x69e8ed);
    this.portal(234, -1190, 'work-island', '右门 · 工地小岛', 0xffb55d);
    w.landmark('interchange', '高速立交观景桥', [140, 12, -900]);
    w.landmark('highway-jump', '高速极限飞坡', [420, 13, -1060]);
    for (let i = 0; i < 10; i++) {
      const x = i % 2 ? 210 : 232;
      w.population.add('car', x, -650 - Math.floor(i / 2) * 105, { speed: 16 + i % 4 * 2, route: [[x, -640], [x, -1135]] });
    }
  }

  buildIsland() {
    const w = this.world;
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(850, 850), new THREE.MeshStandardMaterial({ color: 0x398eaa, roughness: 0.23, metalness: 0.2 }));
    ocean.rotation.x = -Math.PI / 2; ocean.position.set(1800, -1.3, 0); this.ctx.scene.add(ocean);
    const ground = createCylinder(this.ctx, { radius: 250, height: 4, pos: [1800, -2, 0], material: w.mats.sand, segments: 40 });
    ground.body.noBreak = true;
    const grass = new THREE.Mesh(new THREE.CircleGeometry(218, 40), w.overlayMaterial(w.mats.grass, 2));
    grass.rotation.x = -Math.PI / 2; grass.position.set(1800, 0.07, 0); grass.receiveShadow = this.ctx.shadows; this.ctx.scene.add(grass);
    w.road([1800, -185], [1800, 185], 30);
    w.road([1620, 0], [1980, 0], 25);
    for (let i = 0; i < 40; i++) {
      const angle = i * 2.399963, radius = 70 + i % 6 * 25;
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      if (Math.abs(x) < 27 || Math.abs(z) < 24) continue;
      w.population.add('tree', 1800 + x, z);
    }
    for (let i = 0; i < 260; i++) {
      const angle = i * 2.399963, radius = 38 + (i * 37) % 172;
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      if (Math.abs(x) < 22 || Math.abs(z) < 18) continue;
      w.decorate([2.4 + i % 3, 0.6 + i % 4 * 0.25, 2.4], [1800 + x, 0.5, z], w.mats.leaf, angle, 'grass');
    }
    for (let i = 0; i < 32; i++) {
      const angle = i * 2.399963, radius = 45 + i % 6 * 22;
      const x = 1800 + Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      w.population.add(['deer', 'cow', 'boar', 'rabbit'][i % 4], x, z, { route: [[x - 12, z - 9], [x + 12, z + 9]] });
    }
    for (let i = 0; i < 8; i++) {
      const x = 1680 + i % 4 * 75, z = i < 4 ? -70 : 95;
      w.population.add('monster', x, z, { route: [[x - 15, z], [x + 15, z + 16]], speed: 2.2 });
    }
    w.slope([1860, 0.1, 120], [1930, 9, 120], 22, w.mats.dirt);
    w.box([32, 9, 34], [1946, 4.5, 120], w.mats.dirt);
    w.label('生物小岛 · 畅快碰撞 自由探索', 1800, 12, -115);
    this.portal(1800, 190, 'garage', '离岛光门 · 返回车库', 0xf4cb79);
    w.landmark('island-grove', '怪兽林间空地', [1700, 0.2, 90]);
    w.landmark('island-lookout', '小岛观景坡', [1946, 9, 120]);
  }

  update(dt, vehicle) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const p = vehicle.body.position;
    for (const portal of this.portals) {
      portal.rim.rotation.z += dt * 0.55;
      portal.disc.material.opacity = 0.2 + Math.sin(this.world.elapsed * 2) * 0.08;
      if (!this.cooldown && Math.hypot(p.x - portal.x, p.z - portal.z) < 7 && p.y < 10) {
        this.cooldown = 3;
        this.ctx.onPortal?.(portal.destination);
        break;
      }
    }
  }

  buildWorkIsland() {
    const w = this.world;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(750, 750), new THREE.MeshStandardMaterial({ color: 0x398eaa, roughness: 0.23 }));
    water.rotation.x = -Math.PI / 2; water.position.set(2600, -1.3, 0); this.ctx.scene.add(water);
    const ground = createCylinder(this.ctx, { radius: 250, height: 4, pos: [2600, -2, 0], material: w.mats.dirt, segments: 40 });
    ground.body.noBreak = true;
    w.road([2600, -190], [2600, 185], 34); w.road([2410, 0], [2790, 0], 30);
    for (const side of [-1, 1]) {
      const x = 2600 + side * 120;
      for (const z of [-90, 0, 90]) {
        w.box([26, 1, 18], [x, 0.5, z], w.mats.cream, { breakable: true });
        w.box([3, 15, 3], [x - 14, 7.5, z + 14], w.mats.orange);
        w.box([3, 15, 3], [x + 14, 7.5, z + 14], w.mats.orange);
        w.box([34, 1, 22], [x, 15, z + 8], w.mats.teal);
      }
    }
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6, x = 2600 + Math.cos(angle) * 211, z = Math.sin(angle) * 211;
      w.box([12, 3 + i % 3 * 2, 9], [x, 1.5 + i % 3, z], i % 2 ? w.mats.orange : w.mats.cream, { breakable: true });
    }
    w.slope([2660, 0.1, 135], [2730, 10, 135], 22, w.mats.dirt);
    w.box([28, 10, 28], [2744, 5, 135], w.mats.dirt);
    const kinds = ['scooter', 'trike', 'farm', 'excavator', 'dump', 'mixer', 'crane'];
    for (let i = 0; i < 42; i++) {
      const angle = i * 2.399963, radius = 38 + i % 6 * 24;
      w.population.add(kinds[i % kinds.length], 2600 + Math.cos(angle) * radius, Math.sin(angle) * radius,
        { bounds: { x: 2600, z: 0, radius: 182 } });
    }
    w.label('工地小岛 · 电动车与工程车大集合', 2600, 13, -110);
    this.portal(2600, 190, 'garage', '离岛光门 · 返回车库', 0xf4cb79);
    w.landmark('work-fleet', '工程车集结地', [2520, 0.2, -50]);
    w.landmark('work-jump', '工地飞跃土坡', [2744, 10, 135]);
  }
}
