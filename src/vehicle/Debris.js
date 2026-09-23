import * as CANNON from 'cannon-es';
import * as THREE from 'three';

/**
 * 脱落零件与掉落的轮子统一由这里接管。
 * 超过上限自动回收最老的一个，保证场景活动刚体数量可控。
 */
export class DebrisField {
  constructor(ctx, maxCount = 26) {
    this.ctx = ctx;
    this.maxCount = maxCount;
    this.items = [];
    this._v = new THREE.Vector3();
  }

  spawn(mesh, size, worldPos, worldQuat, velocity, angularVel, mass = 14) {
    if (this.items.length >= this.maxCount) {
      this.recycleOldest();
    }

    if (mesh.parent) mesh.parent.remove(mesh);
    this.ctx.scene.add(mesh);
    mesh.position.copy(worldPos);
    mesh.quaternion.copy(worldQuat);

    const half = new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2);
    const body = new CANNON.Body({ mass, shape: new CANNON.Box(half) });
    body.position.set(worldPos.x, worldPos.y, worldPos.z);
    body.quaternion.set(worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w);
    body.velocity.set(velocity.x, velocity.y, velocity.z);
    body.angularVelocity.set(
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 6
    );
    body.linearDamping = 0.06;
    body.angularDamping = 0.12;
    this.ctx.world.addBody(body);
    this.ctx.dynamics.push({ mesh, body });

    this.items.push({
      mesh,
      body,
      home: {
        parent: null,
        localPos: new THREE.Vector3(),
        localQuat: new THREE.Quaternion(),
        localScale: new THREE.Vector3(1, 1, 1)
      }
    });

    return body;
  }

  /**
   * 记录零件归属，Reset 时可以准确回到车上原来的位置。
   */
  setHome(index, parent, localPos, localQuat, localScale) {
    const item = this.items[index];
    if (!item) return;
    item.home.parent = parent;
    item.home.localPos.copy(localPos);
    item.home.localQuat.copy(localQuat);
    item.home.localScale.copy(localScale || new THREE.Vector3(1, 1, 1));
  }

  recycleOldest() {
    const item = this.items.shift();
    if (!item) return;

    this.ctx.world.removeBody(item.body);
    const di = this.ctx.dynamics.findIndex((d) => d.body === item.body);
    if (di >= 0) this.ctx.dynamics.splice(di, 1);

    if (item.home.parent) {
      this.ctx.scene.remove(item.mesh);
      item.home.parent.add(item.mesh);
      item.mesh.position.copy(item.home.localPos);
      item.mesh.quaternion.copy(item.home.localQuat);
      item.mesh.scale.copy(item.home.localScale);
      item.mesh.visible = true;
    } else {
      this.ctx.scene.remove(item.mesh);
    }
  }

  update() {
    // 位置同步由 Game 统一遍历 dynamics 完成，这里只做出界回收
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.body.position.y < -30) {
        this.removeAt(i);
      }
    }
  }

  removeAt(i) {
    const item = this.items[i];
    this.items.splice(i, 1);
    this.ctx.world.removeBody(item.body);
    const di = this.ctx.dynamics.findIndex((d) => d.body === item.body);
    if (di >= 0) this.ctx.dynamics.splice(di, 1);

    if (item.home.parent) {
      this.ctx.scene.remove(item.mesh);
      item.home.parent.add(item.mesh);
      item.mesh.position.copy(item.home.localPos);
      item.mesh.quaternion.copy(item.home.localQuat);
      item.mesh.scale.copy(item.home.localScale);
      item.mesh.visible = true;
    }
  }

  clear() {
    while (this.items.length) {
      this.removeAt(this.items.length - 1);
    }
  }
}
