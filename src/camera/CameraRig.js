import * as THREE from 'three';

export const CAMERA_MODES = ['跟随', '近距', '自由', '车头'];

const _up = new THREE.Vector3();
const _loopOffset = new THREE.Vector3();

/**
 * 四档摄像机。跟车与近距用于驾驶，自由用于撞完以后绕车观察，车头是第一人称。
 * 撞击时提供抖动，但有上限，避免孩子看着晕。
 */
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 0;
    this.shakeAmount = 0;
    this.orbitAngle = 0;
    this.orbitNeedsInit = true;
    this.dragDelta = 0;
    // 跟随视角专用的相机方位角，平滑追随车头朝向
    this.camYaw = 0;
    // 切换档位后的第一帧直接贴合目标机位，避免镜头从上一档的位置飞过去
    this.snapNext = true;

    this.position = new THREE.Vector3(0, 5, -12);
    this.lookAt = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._desiredLook = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._offset = new THREE.Vector3();
    this._shakeOffset = new THREE.Vector3();
  }

  cycle() {
    return this.setMode((this.mode + 1) % CAMERA_MODES.length);
  }

  setMode(mode) {
    const next = Math.max(0, Math.min(CAMERA_MODES.length - 1, mode));
    if (next === this.mode) return CAMERA_MODES[next];

    this.mode = next;
    // 进入自由视角时重新以当前机位初始化环绕角，并且丢掉上一档残留的拖拽量
    if (this.mode === 2) this.orbitNeedsInit = true;
    this.dragDelta = 0;
    this.snapNext = true;
    return CAMERA_MODES[next];
  }

  addDrag(delta) {
    // 只有自由视角吃拖拽。之前在任何档位都累积，切到自由视角的瞬间镜头会突然弹一下
    if (this.mode !== 2) return;
    this.dragDelta += delta;
  }

  shake(amount) {
    this.shakeAmount = Math.min(1.2, this.shakeAmount + amount);
  }

  update(dt, vehicle) {
    const g = vehicle.group;
    const p = g.position;

    this._fwd.set(0, 0, 1).applyQuaternion(g.quaternion);
    const yaw = Math.atan2(this._fwd.x, this._fwd.z);

    let rate = 6;

    if (vehicle.inLoop && this.mode !== 2) {
      // 三百六十度圆环内部：换成跟着车身一起翻滚的贴身机位。
      // 用世界坐标定位的话相机会落在圆环壁外面，画面被整个挡住。
      // 这里用车身局部偏移，相机永远贴在车后上方，看得见前方赛道。
      _loopOffset.set(0, 1.5, -4.4).applyQuaternion(g.quaternion);
      this._desired.copy(p).add(_loopOffset);
      this._desiredLook.copy(p).addScaledVector(this._fwd, 9);

      const k = this._snap(dt, 13);
      this.position.lerp(this._desired, k);
      this.lookAt.lerp(this._desiredLook, k);
    } else if (this.mode === 3) {
      // 车头第一人称
      _up.set(0, 1, 0).applyQuaternion(g.quaternion);

      if (_up.y < 0.35) {
        // 车翻得比较厉害时不能再顺着车顶方向放相机，否则镜头会钻进地面里，
        // 退化成车顶正上方的俯视机位
        this._desired.set(p.x, p.y + 6.5, p.z - 0.001);
        this._desiredLook.copy(p);
        rate = 8;
      } else {
        this._desired.copy(p).addScaledVector(_up, 0.62).addScaledVector(this._fwd, 0.35);
        this._desiredLook.copy(this._desired).addScaledVector(this._fwd, 10);
        rate = 18;
      }

      this.position.lerp(this._desired, this._snap(dt, rate));
      this.lookAt.lerp(this._desiredLook, this._snap(dt, rate));
    } else if (this.mode === 2) {
      // 自由观察
      if (this.orbitNeedsInit) {
        this.orbitAngle = Math.atan2(this.position.x - p.x, this.position.z - p.z);
        this.orbitNeedsInit = false;
      }
      this.orbitAngle += this.dragDelta * 0.005;
      this.dragDelta = 0;

      const r = 13;
      this._desired.set(p.x + Math.sin(this.orbitAngle) * r, p.y + 5.5, p.z + Math.cos(this.orbitAngle) * r);
      this._desiredLook.copy(p);

      const k = this._snap(dt, 5);
      this.position.lerp(this._desired, k);
      this.lookAt.lerp(this._desiredLook, k);
    } else {
      // 相机方位角平滑跟随车头朝向。直接插值位置会让转向时相机明显滞后，
      // 车身滑出画面中心甚至看不到前方，所以这里先平滑角度再算位置。
      let dy = yaw - this.camYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;

      const speedFactor = Math.min(1, vehicle.speedKmh / 150);
      const yawRate = this.mode === 1 ? 10 : 6.5 + speedFactor * 6;
      this.camYaw += dy * Math.min(1, dt * yawRate);

      const dist = this.mode === 1 ? 5.2 : 8.6;
      const height = this.mode === 1 ? 2.0 : 3.2;

      this._offset.set(-Math.sin(this.camYaw) * dist, height, -Math.cos(this.camYaw) * dist);
      this._desired.copy(p).add(this._offset);
      this._desiredLook.copy(p).addScaledVector(this._fwd, 4).setY(p.y + 0.9);

      const k = this._snap(dt, this.mode === 1 ? 14 : 10);
      this.position.lerp(this._desired, k);
      this.lookAt.lerp(this._desiredLook, k);
    }

    // 抖动
    if (this.shakeAmount > 0.001) {
      const a = this.shakeAmount * 0.45;
      this._shakeOffset.set(
        (Math.random() - 0.5) * a,
        (Math.random() - 0.5) * a,
        (Math.random() - 0.5) * a
      );
      this.shakeAmount *= Math.max(0, 1 - dt * 4.5);
    } else {
      this._shakeOffset.set(0, 0, 0);
      this.shakeAmount = 0;
    }

    this.camera.position.copy(this.position).add(this._shakeOffset);
    this.camera.lookAt(this.lookAt);

    this.snapNext = false;
  }

  /** 刚切换档位的第一帧直接贴合，之后按速率平滑跟随 */
  _snap(dt, rate) {
    if (this.snapNext) return 1;
    return Math.min(1, dt * rate);
  }

  snapTo(vehicle) {
    const p = vehicle.group.position;
    this._fwd.set(0, 0, 1).applyQuaternion(vehicle.group.quaternion);
    const yaw = Math.atan2(this._fwd.x, this._fwd.z);
    this.camYaw = yaw;
    const dist = this.mode === 1 ? 5.2 : 8.6;
    const height = this.mode === 1 ? 2.0 : 3.2;

    this.position.set(p.x - Math.sin(yaw) * dist, p.y + height, p.z - Math.cos(yaw) * dist);
    this.lookAt.copy(p);
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.lookAt);
    this.snapNext = true;
  }
}
