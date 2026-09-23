import * as THREE from 'three';

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _mat = new THREE.Matrix4();

/**
 * 简化车身凹陷。碰撞点转局部坐标后按距离衰减推动附近顶点，累计变形并限制单顶点最大位移。
 * 物理碰撞体保持不变，只改视觉网格，避免每帧重建碰撞体拖垮手机性能。
 */
export class MeshDeformer {
  constructor(mesh, opts = {}) {
    this.mesh = mesh;
    this.maxOffset = opts.maxOffset ?? 0.3;
    this.radius = opts.radius ?? 0.8;
    this.strength = opts.strength ?? 1.0;
    this.falloffPower = opts.falloffPower ?? 2;

    const attr = mesh.geometry.attributes.position;
    this.attr = attr;
    this.original = Float32Array.from(attr.array);
    this.dirty = false;
  }

  deform(localPoint, localDir, strengthScale = 1) {
    const arr = this.attr.array;
    const orig = this.original;
    const r = this.radius;
    const rSq = r * r;
    const maxSq = this.maxOffset * this.maxOffset;
    let changed = false;

    for (let i = 0; i < arr.length; i += 3) {
      const ox = orig[i], oy = orig[i + 1], oz = orig[i + 2];
      const dx = ox - localPoint.x;
      const dy = oy - localPoint.y;
      const dz = oz - localPoint.z;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq > rSq) continue;

      let falloff = 1 - Math.sqrt(distSq) / r;
      for (let p = 1; p < this.falloffPower; p++) falloff *= falloff;

      const k = this.strength * strengthScale * falloff;
      let tx = arr[i] + localDir.x * k;
      let ty = arr[i + 1] + localDir.y * k;
      let tz = arr[i + 2] + localDir.z * k;

      const ddx = tx - ox, ddy = ty - oy, ddz = tz - oz;
      const dSq = ddx * ddx + ddy * ddy + ddz * ddz;

      if (dSq > maxSq) {
        const inv = this.maxOffset / Math.sqrt(dSq);
        tx = ox + ddx * inv;
        ty = oy + ddy * inv;
        tz = oz + ddz * inv;
      }

      arr[i] = tx;
      arr[i + 1] = ty;
      arr[i + 2] = tz;
      changed = true;
    }

    if (changed) {
      this.attr.needsUpdate = true;
      this.mesh.geometry.computeVertexNormals();
      this.mesh.geometry.computeBoundingSphere();
      this.dirty = true;
    }

    return changed;
  }

  /**
   * 用世界坐标直接变形。车身网格相对车体常有位移和缩放，
   * 例如星星小车是缩放过的球体，拿车体局部坐标去匹配顶点会错位，
   * 撞击点会落到网格外面，表现为撞了却不凹陷。这里统一转到网格自身空间。
   */
  deformAtWorld(worldPoint, worldDir, strengthScale = 1) {
    this.mesh.updateWorldMatrix(true, false);
    const inv = _mat.copy(this.mesh.matrixWorld).invert();
    const p = _v.copy(worldPoint).applyMatrix4(inv);
    const dir = _d.copy(worldDir).transformDirection(inv).normalize();

    // 保险：撞击点可能落在网格外面，直接算会一个顶点都不动，表现为撞了却不凹陷。
    // 这里把作用点沿"指向网格中心"的方向拉回到表面附近，方向不变。
    const geo = this.mesh.geometry;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const c = geo.boundingSphere.center;
    const r = geo.boundingSphere.radius;
    const maxLen = r * 0.9;

    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const dz = p.z - c.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (len > maxLen && len > 0.0001) {
      const k = maxLen / len;
      p.set(c.x + dx * k, c.y + dy * k, c.z + dz * k);
    }

    return this.deform(p, dir, strengthScale);
  }

  /**
   * 统计当前变形分布，用于碰撞复核：凹陷到底落在车的哪一侧。
   * 返回局部坐标下的变形质心、最大位移、参与变形的顶点数。
   */
  deformStats() {
    const arr = this.attr.array;
    const orig = this.original;

    let wx = 0;
    let wy = 0;
    let wz = 0;
    let weight = 0;
    let maxOffset = 0;
    let count = 0;

    for (let i = 0; i < arr.length; i += 3) {
      const dx = arr[i] - orig[i];
      const dy = arr[i + 1] - orig[i + 1];
      const dz = arr[i + 2] - orig[i + 2];
      const m = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (m > maxOffset) maxOffset = m;

      if (m > 0.008) {
        wx += orig[i] * m;
        wy += orig[i + 1] * m;
        wz += orig[i + 2] * m;
        weight += m;
        count++;
      }
    }

    return {
      centroid: weight > 0 ? [wx / weight, wy / weight, wz / weight] : null,
      maxOffset,
      count
    };
  }

  reset() {
    this.attr.array.set(this.original);
    this.attr.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this.mesh.geometry.computeBoundingSphere();
    this.dirty = false;
  }
}

export function worldToLocal(object3d, worldPoint) {
  return object3d.worldToLocal(_v.copy(worldPoint));
}

export function dirToLocal(object3d, worldDir) {
  const inv = new THREE.Matrix4().copy(object3d.matrixWorld).invert();
  const nm = new THREE.Matrix3().setFromMatrix4(inv);
  _d.copy(worldDir).applyMatrix3(nm).normalize();
  return _d;
}
