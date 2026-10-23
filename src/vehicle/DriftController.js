import * as THREE from 'three';

/** 渐进调整后轮抓地，保留物理转向；不强推侧向速度或车身旋转。 */
export class DriftController {
  constructor(vehicle) {
    this.vehicle = vehicle;
    this.visual = new THREE.Quaternion();
    this.forward = new THREE.Vector3();
    this.point = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.amount = 0; this.distance = 0; this.smokeTimer = 0; this.steer = 0;
    this.slipAngle = 0; this.visual.identity();
  }

  update(dt, input, grounded) {
    const v = this.vehicle, body = v.body;
    const speed = Math.hypot(body.velocity.x, body.velocity.z);
    const up = 1 - 2 * (body.quaternion.x ** 2 + body.quaternion.z ** 2);
    const eligible = ['normal', 'star', 'sport'].includes(v.type) && !v.wrecked && !v.inLoop && up > 0.85 && !v.wheelDetached.some(Boolean);
    this.forward.set(0, 0, 1).applyQuaternion(body.quaternion);
    const f = this.forward;
    const forwards = f.x * body.velocity.x + f.z * body.velocity.z;
    const lateral = body.velocity.x * f.z - body.velocity.z * f.x;
    this.slipAngle = Math.atan2(lateral, Math.max(1, forwards));
    this.steer += (input.steer - this.steer) * (1 - Math.exp(-dt * 5));
    const turn = THREE.MathUtils.clamp((Math.abs(this.steer) - 0.25) / 0.5, 0, 1);
    const pace = THREE.MathUtils.clamp((speed - 12) / 10, 0, 1);
    const highSpeedLimit = THREE.MathUtils.clamp(1 - (speed - 35) / 35, 0.3, 1);
    const target = eligible && grounded >= 3 && forwards > 10 && input.throttle > 0.15 && !input.brake && !input.handbrake ? turn * pace * highSpeedLimit : 0;
    // 接地短暂变化时平滑退出，避免悬挂颠簸让外观和抓地反复跳变。
    this.amount += (target - this.amount) * (1 - Math.exp(-dt * (target > this.amount ? 2.5 : 5)));
    if (this.amount < 0.005) this.amount = 0;
    if (eligible && grounded >= 2 && this.amount > 0) {
      const gripReduction = this.amount * 0.48 * THREE.MathUtils.clamp(1 - Math.abs(this.slipAngle) / 0.16, 0, 1);
      for (let i = 2; i < 4; i++) v.vehicle.wheelInfos[i].frictionSlip *= 1 - gripReduction;
      // 只抑制过大的甩尾角速度，不主动制造偏航，也不覆盖车轮转向。
      const excess = Math.max(0, Math.abs(this.slipAngle) - 0.18);
      if (excess > 0) body.angularVelocity.y *= Math.exp(-dt * excess * 8 * this.amount);
      this.distance += speed * dt * this.amount;
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0 && this.amount > 0.35 && speed > 12) {
        for (const side of [-1, 1]) {
          this.point.set(side * v.spec.halfExtents[0], -0.45, -v.spec.halfExtents[2] * 0.8).applyQuaternion(body.quaternion).add(body.position);
          v.ctx.fx?.smoke(this.point, 0.25);
        }
        this.smokeTimer = 0.28;
      }
    } else if (this.amount === 0) this.distance = 0;
  }
}


