import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const IDENTITY = new THREE.Quaternion();

/** 坡道起飞、双击油门自动选招与着陆反馈。方向键不再触发特技。 */
export class FlightController {
  constructor(vehicle) { this.vehicle = vehicle; this.visual = new THREE.Quaternion(); this.reset(); }

  reset() {
    this.airborne = false; this.rampGrace = 0; this.pending = 0;
    this.stunt = null; this.stunts = 0; this.boostUsed = false;
    this.takeoffY = 0; this.peak = 0; this.trailTimer = 0;
    this.visual.identity();
    this.vehicle.airTime = 0;
  }

  requestStunt() { if (!this.vehicle.wrecked) this.pending = 0.4; }

  begin() {
    const v = this.vehicle;
    this.airborne = true; this.takeoffY = v.body.position.y; this.peak = 0;
    this.stunts = 0; this.boostUsed = false;
    if (this.rampGrace > 0 && v.body.velocity.y > 1 && v.speedKmh > 28) {
      const speed = Math.hypot(v.body.velocity.x, v.body.velocity.z);
      v.body.velocity.y = Math.max(v.body.velocity.y, Math.min(24, 13 + speed * 0.17));
      v.ctx.fx?.flightBurst?.(new THREE.Vector3().copy(v.body.position));
    }
  }

  chooseStunt() {
    const v = this.vehicle, vy = v.body.velocity.y;
    if (vy < -9 && !this.boostUsed) {
      this.boostUsed = true; v.body.velocity.y = 11;
      return { name: '喷射跃升', axis: 'x', turns: -1, duration: 1.15, style: 'boost' };
    }
    if (vy > 5) return { name: '云端后空翻', axis: 'x', turns: -1, duration: 1.2, style: 'flip' };
    if (Math.abs(vy) < 5 && this.peak > 12) return { name: '天空螺旋', axis: 'compound', turns: 1, duration: 1.25, style: 'spiral' };
    if (v.speedKmh > 90) return { name: '疾风回旋', axis: 'y', turns: 1, duration: 1.05, style: 'spin' };
    return { name: '流星侧翻', axis: 'z', turns: 1, duration: 1.1, style: 'roll' };
  }

  update(dt, grounded) {
    const v = this.vehicle;
    this.pending = Math.max(0, this.pending - dt);
    this.rampGrace = Math.max(0, this.rampGrace - dt);
    if (grounded > 0) {
      if (v.vehicle.wheelInfos.some(w => w.raycastResult.body?.launchRamp)) this.rampGrace = 0.2;
      if (this.airborne) this.land();
      return;
    }
    if (!this.airborne) this.begin();
    v.airTime += dt;
    this.peak = Math.max(this.peak, v.body.position.y - this.takeoffY);
    if (this.pending > 0 && v.airTime > 0.18 && (this.peak > 1 || v.body.velocity.y > 3 || v.airTime > 0.6) && !this.stunt && !v.wrecked) {
      this.pending = 0;
      this.stunt = { ...this.chooseStunt(), elapsed: 0 };
      v.ctx.ui?.showMessage(this.stunt.name, 1400);
      v.ctx.fx?.flightBurst?.(new THREE.Vector3().copy(v.body.position));
    }
    if (this.stunt) {
      const s = this.stunt;
      s.elapsed += dt;
      const progress = Math.min(1, s.elapsed / s.duration);
      const eased = progress * progress * (3 - 2 * progress);
      const angle = eased * Math.PI * 2 * s.turns;
      const euler = new THREE.Euler(s.axis === 'x' ? angle : 0, s.axis === 'y' || s.axis === 'compound' ? angle : 0, s.axis === 'z' || s.axis === 'compound' ? angle : 0);
      this.visual.setFromEuler(euler);
      if (progress === 1) { this.stunts++; this.stunt = null; this.visual.identity(); }
    }
    // 镜头围绕飞行轨迹，车体保持可控；特技只改变完整车辆的视觉姿态。
    v.body.angularVelocity.x *= Math.exp(-dt * 3);
    v.body.angularVelocity.z *= Math.exp(-dt * 3);
    if (v.airTime > 0.35 && !v.inLoop) {
      const q = new THREE.Quaternion().copy(v.body.quaternion);
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      const level = new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(forward.x, forward.z));
      q.slerp(level, Math.min(1, dt * 1.7));
      v.body.quaternion.copy(q);
    }
    this.trailTimer -= dt;
    if (this.trailTimer <= 0 && v.airTime > 0.18) {
      this.trailTimer = 0.055;
      v.ctx.fx?.flightTrail?.(new THREE.Vector3().copy(v.body.position), this.stunt?.style);
    }
  }

  land() {
    const v = this.vehicle;
    if (v.airTime > 0.6 && (this.peak > 3 || this.stunts)) {
      v.ctx.fx?.landing?.(new THREE.Vector3().copy(v.body.position), this.peak);
      v.ctx.cameraRig?.shake(Math.min(0.45, this.peak * 0.01));
      v.ctx.onTrick?.(`飞跃 ${Math.round(this.peak)}m${this.stunts ? ' · ' + this.stunts + ' 连特技' : ' · 成功着陆'}`, 80 + Math.round(this.peak * 5) + this.stunts * 260);
    }
    this.airborne = false; v.airTime = 0; this.stunt = null;
    this.visual.copy(IDENTITY); this.pending = 0;
  }
}
