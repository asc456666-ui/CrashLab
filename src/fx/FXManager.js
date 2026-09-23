import * as THREE from 'three';
import { ObjectPool } from '../core/ObjectPool.js';

function dotTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Burst {
  constructor(scene, count, texture, size, color, blending) {
    this.count = count;
    this.life = 0;
    this.maxLife = 1;

    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.PointsMaterial({
      size,
      map: texture,
      color,
      transparent: true,
      depthWrite: false,
      blending,
      opacity: 0
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);

    this.velocities = new Float32Array(count * 3);
    this.positions = pos;
    this.geo = geo;
    this.mat = mat;
  }

  fire(origin, spread, upBias, speed, life) {
    this.life = life;
    this.maxLife = life;
    this.mat.opacity = 1;
    this.points.visible = true;

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      this.positions[i3] = origin.x + (Math.random() - 0.5) * 0.2;
      this.positions[i3 + 1] = origin.y + (Math.random() - 0.5) * 0.2;
      this.positions[i3 + 2] = origin.z + (Math.random() - 0.5) * 0.2;

      this.velocities[i3] = (Math.random() - 0.5) * spread * speed;
      this.velocities[i3 + 1] = Math.random() * speed * upBias;
      this.velocities[i3 + 2] = (Math.random() - 0.5) * spread * speed;
    }

    this.geo.attributes.position.needsUpdate = true;
  }

  update(dt, gravity) {
    if (this.life <= 0) return false;

    this.life -= dt;
    if (this.life <= 0) {
      this.points.visible = false;
      this.mat.opacity = 0;
      return false;
    }

    const t = this.life / this.maxLife;
    this.mat.opacity = t;

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      this.velocities[i3 + 1] += gravity * dt;
      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * dt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt;
      this.velocities[i3] *= 1 - dt * 0.9;
      this.velocities[i3 + 2] *= 1 - dt * 0.9;
    }

    this.geo.attributes.position.needsUpdate = true;
    return true;
  }

  dispose() {
    this.points.parent?.remove(this.points);
    this.geo.dispose();
    this.mat.dispose();
  }
}

/**
 * 爆炸时向外扩散的冲击环，同时只存在一个。
 */
class BlastRing {
  constructor(scene) {
    const geo = new THREE.RingGeometry(0.6, 1.0, 36);
    geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.MeshBasicMaterial({
      color: 0xffd27a,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.life = 0;
    this.maxLife = 0.9;
  }

  fire(pos) {
    this.mesh.position.copy(pos);
    this.mesh.position.y += 0.35;
    this.mesh.scale.set(1, 1, 1);
    this.mat.opacity = 0.8;
    this.mesh.visible = true;
    this.life = this.maxLife;
  }

  update(dt) {
    if (this.life <= 0) return;
    this.life -= dt;
    if (this.life <= 0) {
      this.mesh.visible = false;
      this.mat.opacity = 0;
      return;
    }
    const t = 1 - this.life / this.maxLife;
    const s = 1 + t * 17;
    this.mesh.scale.set(s, 1, s);
    this.mat.opacity = (1 - t) * 0.8;
  }

  reset() {
    this.life = 0;
    this.mesh.visible = false;
    this.mat.opacity = 0;
  }
}

/**
 * 火花、烟雾、火焰与爆炸。全部走对象池，撞击时不会反复创建销毁。
 */
export class FXManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = ctx.scene;

    const sparkTex = dotTexture('rgba(255,240,180,1)', 'rgba(255,120,0,0)');
    const smokeTex = dotTexture('rgba(230,230,230,0.9)', 'rgba(120,120,120,0)');
    const fireTex = dotTexture('rgba(255,225,150,1)', 'rgba(255,60,0,0)');
    const waterTex = dotTexture('rgba(220,245,255,0.95)', 'rgba(60,140,220,0)');

    this.sparkPool = new ObjectPool(
      () => new Burst(this.scene, 14, sparkTex, 0.34, 0xffcf5a, THREE.AdditiveBlending),
      (b) => { b.life = 0; b.points.visible = false; b.mat.opacity = 0; },
      20
    );

    this.smokePool = new ObjectPool(
      () => new Burst(this.scene, 10, smokeTex, 1.1, 0x9aa0a4, THREE.NormalBlending),
      (b) => { b.life = 0; b.points.visible = false; b.mat.opacity = 0; },
      20
    );

    this.flamePool = new ObjectPool(
      () => new Burst(this.scene, 12, fireTex, 0.8, 0xff8a2b, THREE.AdditiveBlending),
      (b) => { b.life = 0; b.points.visible = false; b.mat.opacity = 0; },
      14
    );

    this.waterPool = new ObjectPool(
      () => new Burst(this.scene, 12, waterTex, 0.5, 0xbfe6ff, THREE.NormalBlending),
      (b) => { b.life = 0; b.points.visible = false; b.mat.opacity = 0; },
      12
    );

    this.blastRing = new BlastRing(this.scene);
  }

  sparks(point, impact) {
    const n = this.sparkPool.spawn();
    if (!n) return;
    const power = Math.min(2.4, impact * 0.08);
    n.fire(point, 1.6, 1.1, 3.4 + power * 2.2, 0.45 + Math.random() * 0.2);
  }

  smoke(point, density) {
    const n = this.smokePool.spawn();
    if (!n) return;
    n.fire(point, 0.5, 1.0, 0.7 + density, 1.3 + Math.random() * 0.8);
  }

  /** 起火的火苗，向上飘的一条小火焰 */
  flames(point) {
    const n = this.flamePool.spawn();
    if (!n) return;
    n.fire(point, 0.9, 1.5, 1.4 + Math.random() * 1.3, 0.45 + Math.random() * 0.35);
  }

  /** 涉水时溅起的水花，速度越快溅得越高 */
  water(point, speed) {
    const n = this.waterPool.spawn();
    if (!n) return;
    n.fire(point, 1.4, 0.9 + Math.min(1.4, speed * 0.05), 2.2 + Math.min(4, speed * 0.12), 0.5 + Math.random() * 0.3);
  }

  /** 坦克炮口火光 */
  muzzle(point) {
    const f = this.flamePool.spawn();
    if (f) f.fire(point, 1.3, 0.7, 8, 0.35);

    const s = this.sparkPool.spawn();
    if (s) s.fire(point, 1.0, 0.9, 17, 0.3);

    const m = this.smokePool.spawn();
    if (m) m.fire(point, 1.6, 1.1, 2.6, 1.4);
  }

  /** 爆炸：火球加火花加黑烟加冲击环一起上，持续得久一点才看得清 */
  explosion(point) {
    const f = this.flamePool.spawn();
    if (f) f.fire(point, 2.6, 1.5, 9.5, 1.6);

    const f2 = this.flamePool.spawn();
    if (f2) f2.fire(point, 1.6, 1.8, 4.5, 2.2);

    for (let i = 0; i < 3; i++) {
      const s = this.sparkPool.spawn();
      if (s) s.fire(point, 3.4, 1.2, 12 + i * 4, 1.3 + i * 0.2);
    }

    for (let i = 0; i < 3; i++) {
      const m = this.smokePool.spawn();
      if (m) m.fire(point, 2.2, 1.3, 3.4, 3.4 + i * 0.5);
    }

    this.blastRing.fire(point);
  }

  update(dt) {
    for (const b of this.sparkPool.active.slice()) {
      if (!b.update(dt, -6)) this.sparkPool.recycle(b);
    }
    for (const b of this.smokePool.active.slice()) {
      if (!b.update(dt, 0.55)) this.smokePool.recycle(b);
    }
    for (const b of this.flamePool.active.slice()) {
      if (!b.update(dt, 1.6)) this.flamePool.recycle(b);
    }
    for (const b of this.waterPool.active.slice()) {
      if (!b.update(dt, -9)) this.waterPool.recycle(b);
    }
    this.blastRing.update(dt);
  }

  clear() {
    this.sparkPool.clear();
    this.smokePool.clear();
    this.flamePool.clear();
    this.waterPool.clear();
    this.blastRing.reset();
  }
}
