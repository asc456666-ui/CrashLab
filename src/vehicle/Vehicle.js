import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { CAR_BUILDERS } from './CarBuilder.js';
import { SPECS } from './CarSpecs.js';
import { MeshDeformer } from './MeshDeformer.js';
import { DebrisField } from './Debris.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _force = new CANNON.Vec3();
const _cv = new CANNON.Vec3();
const _cvOut = new CANNON.Vec3();

// 空中特技的目标角速度，单位弧度每秒
const AIR_PITCH_RATE = 5.4;
const AIR_ROLL_RATE = 5.8;
// 判定完成一圈特技需要的累计转角，给一点宽容，不用严格满 360 度
const TRICK_FULL_TURN = 5.4;
// 接地时主动稳定器的强度，越大越不容易翻
const STABILITY_DAMP = 3.2;
// 车损越高车漆越焦黑
const SOOT_COLOR = new THREE.Color(0x2a2422);

/**
 * 一辆车。物理走 cannon 的 RaycastVehicle，视觉变形与零件脱落是简化实现，
 * 不追求 BeamNG 级软体物理，只保证撞起来反馈明显且手机能跑得动。
 */
export class Vehicle {
  constructor(ctx, type = 'normal') {
    this.ctx = ctx;
    this.type = type;
    this.spec = SPECS[type] || SPECS.normal;

    const built = CAR_BUILDERS[type](ctx.shadows);
    this.built = built;
    this.group = built.group;
    this.deformer = new MeshDeformer(built.bodyMesh, {
      maxOffset: this.spec.deformMaxOffset,
      radius: this.spec.deformRadius,
      strength: this.spec.deformStrength
    });

    this.vehicleHealth = 1;
    this.engineHealth = 1;
    this.steerValue = 0;
    this.wheelDetached = [false, false, false, false];
    this.wheelHealth = [1, 1, 1, 1];
    this.glassBroken = false;
    this.lastImpactMs = 0;
    this.impactLog = [];
    this.liveParts = built.parts.slice();

    // 车损表现与空中特技的状态
    this.paintBase = built.bodyMesh.material.color.clone();
    this.paintRoughness = built.bodyMesh.material.roughness;
    this.smokeTimer = 0;
    this.fireTimer = 0;
    this.burning = false;
    this.exploded = false;
    this.wrecked = false;
    this.airTime = 0;
    this.airSpin = 0;
    this.airRoll = 0;
    this.inWater = false;
    this.waterTimer = 0;
    this.flameTimer = 0;
    this.cannonCooldown = 0;

    // 四个轮子默认共用一份橡胶材质，克隆成各自独立，才能单独表现磨损
    for (const w of built.wheels) {
      w.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        if (o.material.color) o.userData.baseColor = o.material.color.clone();
      });
    }
    this.deadTireColor = new THREE.Color(0x4a352a);

    ctx.scene.add(this.group);
    for (const w of built.wheels) ctx.scene.add(w);

    this.debris = new DebrisField(ctx, 24);

    this.buildPhysics();
    this.bindCollision();
  }

  buildPhysics() {
    const s = this.spec;
    const ctx = this.ctx;

    const shape = new CANNON.Box(new CANNON.Vec3(s.halfExtents[0], s.halfExtents[1], s.halfExtents[2]));
    this.body = new CANNON.Body({ mass: s.mass, material: ctx.vehicleMaterial });
    this.body.addShape(shape, new CANNON.Vec3(0, s.offsetY, 0));
    this.body.angularDamping = s.angularDamping ?? 0.22;
    this.body.linearDamping = 0.02;
    this.body.position.set(0, s.resetHeight, 0);
    this.body.allowSleep = false;

    this.vehicle = new CANNON.RaycastVehicle({
      chassisBody: this.body,
      indexRightAxis: 0,
      indexUpAxis: 1,
      indexForwardAxis: 2
    });

    const pts = [
      [-s.axleX, s.connectionY, s.axleZ],
      [s.axleX, s.connectionY, s.axleZ],
      [-s.axleX, s.connectionY, -s.axleZ],
      [s.axleX, s.connectionY, -s.axleZ]
    ];

    for (const p of pts) {
      this.vehicle.addWheel({
        radius: s.wheelRadius,
        directionLocal: new CANNON.Vec3(0, -1, 0),
        suspensionStiffness: s.suspensionStiffness,
        suspensionRestLength: s.suspensionRestLength,
        frictionSlip: s.frictionSlip,
        dampingRelaxation: s.dampingRelaxation,
        dampingCompression: s.dampingCompression,
        maxSuspensionForce: s.maxSuspensionForce,
        rollInfluence: s.rollInfluence,
        axleLocal: new CANNON.Vec3(1, 0, 0),
        maxSuspensionTravel: s.maxSuspensionTravel,
        customSlidingRotationalSpeed: -30,
        useCustomSlidingRotationalSpeed: true,
        chassisConnectionPointLocal: new CANNON.Vec3(p[0], p[1], p[2])
      });
    }

    this.vehicle.addToWorld(ctx.world);
  }

  bindCollision() {
    this.body.addEventListener('collide', (e) => this.onCollide(e));
  }

  onCollide(e) {
    const now = performance.now();
    // 冷却太短会把一次撞击拆成好几次，凹陷和音效都会重复叠加
    if (now - this.lastImpactMs < 150) return;

    const contact = e.contact;
    if (!contact) return;

    const impact = Math.abs(contact.getImpactVelocityAlongNormal());
    if (impact < 2.5) return;
    this.lastImpactMs = now;

    // 车辆既可能是 contact.bi 也可能是 contact.bj。一律按 bi 处理会让
    // 接触点算到对方身上，凹陷就会跑到车的另一侧去。
    const carIsBi = contact.bi === this.body;
    const contactBody = carIsBi ? contact.bi : contact.bj;
    const relPoint = carIsBi ? contact.ri : contact.rj;

    const wp = new CANNON.Vec3();
    contactBody.position.vadd(relPoint, wp);
    const worldPoint = new THREE.Vector3(wp.x, wp.y, wp.z);

    // cannon 的 ni 由 bi 指向 bj，取反才是撞击推进车体的方向；
    // 车辆若是 bj，方向要反过来。
    const n = contact.ni;
    const sign = carIsBi ? -1 : 1;
    const worldNormal = new THREE.Vector3(n.x * sign, n.y * sign, n.z * sign).normalize();

    this.applyImpact(impact, worldPoint, worldNormal);

    // 交给上层计分。对方是能被撞飞的活动刚体时会额外加分
    const other = carIsBi ? contact.bj : contact.bi;
    this.ctx.onImpact?.(impact, other);
  }

  applyImpact(impact, worldPoint, worldNormal) {
    const s = this.spec;

    // 世界法线转车身局部方向
    _m.copy(this.group.matrixWorld).invert();
    const localPoint = this.group.worldToLocal(_v.copy(worldPoint)).clone();
    const localDir = _v2.copy(worldNormal).transformDirection(_m).normalize();

    // 调试用：按顺序记录前几次撞击的局部坐标，用于核对凹陷位置是否正确
    if (this.impactLog.length < 6) {
      this.impactLog.push({
        local: [+localPoint.x.toFixed(2), +localPoint.y.toFixed(2), +localPoint.z.toFixed(2)],
        dir: [+localDir.x.toFixed(2), +localDir.y.toFixed(2), +localDir.z.toFixed(2)],
        impact: +impact.toFixed(1)
      });
    }

    // 单次撞击的车损系数。已经连降两轮，撞坏一辆车需要反复撞很久
    const damage = Math.min(0.1, (impact - 2) * 0.0035);
    if (damage > 0) {
      let engineWeight = 0.45;
      if (localPoint.z > 1.0) engineWeight = 0.85;
      else if (localPoint.z < -1.0) engineWeight = 0.25;

      this.vehicleHealth = Math.max(0, this.vehicleHealth - damage);
      this.engineHealth = Math.max(0, this.engineHealth - damage * engineWeight);
    }

    const strengthScale = Math.min(2.2, impact * 0.055);
    this.deformer.deformAtWorld(worldPoint, worldNormal, strengthScale);

    this.ctx.fx?.sparks(worldPoint, impact);
    this.ctx.audio?.crash(impact);
    this.ctx.cameraRig?.shake(Math.min(1, impact / 26));

    if (impact >= s.wheelDamageThreshold) this.damageWheels(worldPoint, impact);
    if (impact >= s.partDetachSpeed) this.tryDetachPart(worldPoint, impact);
    if (!this.glassBroken && impact >= 8 && localPoint.z > 0.4) this.breakGlass();
  }

  /**
   * 轮胎先累积损伤、抓地力衰减，彻底报废了才脱落。
   * 撞到哪一侧就伤哪一侧的轮子，撞击点离轮子越近伤得越重。
   */
  damageWheels(worldPoint, impact) {
    let best = -1;
    let bestDist = 1.6;

    for (let i = 0; i < 4; i++) {
      if (this.wheelHealth[i] <= 0) continue;
      this.vehicle.updateWheelTransform(i);
      const t = this.vehicle.wheelInfos[i].worldTransform;
      const d = Math.hypot(t.position.x - worldPoint.x, t.position.y - worldPoint.y, t.position.z - worldPoint.z);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }

    if (best < 0) return;

    const near = 1 - bestDist / 2.2;
    const dmg = Math.min(0.55, (impact - this.spec.wheelDamageThreshold) * 0.022) * near;
    if (dmg <= 0.001) return;

    this.wheelHealth[best] = Math.max(0, this.wheelHealth[best] - dmg);
    this.refreshWheelLook(best);

    if (this.wheelHealth[best] <= 0) {
      this.detachWheel(best, worldPoint);
      this.ctx.ui?.showMessage('轮胎已报废，掉了一个');
    }
  }

  /** 把轮子血量映射成外观：轻微漏气压扁，颜色往焦黑走，抓地力同步下降。 */
  refreshWheelLook(i) {
    const h = this.wheelHealth[i];
    const info = this.vehicle.wheelInfos[i];
    if (info) info.frictionSlip = this.spec.frictionSlip * (0.4 + 0.6 * h);

    const wheel = this.built.wheels[i];
    if (!wheel) return;

    const squish = 1 - (1 - h) * 0.24;
    wheel.scale.set(1, squish, squish);

    const tire = wheel.children[0];
    if (tire && tire.material && tire.material.color && tire.userData.baseColor) {
      tire.material.color.copy(tire.userData.baseColor).lerp(this.deadTireColor, (1 - h) * 0.85);
    }
  }

  detachWheel(i, worldPoint) {
    const w = this.vehicle.wheelInfos[i];
    w.suspensionStiffness = 0;
    w.maxSuspensionForce = 0;
    w.frictionSlip = 0;
    this.wheelDetached[i] = true;

    const mesh = this.built.wheels[i];
    const pos = new THREE.Vector3(w.worldTransform.position.x, w.worldTransform.position.y, w.worldTransform.position.z);
    const quat = new THREE.Quaternion(w.worldTransform.quaternion.x, w.worldTransform.quaternion.y, w.worldTransform.quaternion.z, w.worldTransform.quaternion.w);

    const vel = new THREE.Vector3(this.body.velocity.x, this.body.velocity.y, this.body.velocity.z);
    vel.addScaledVector(_v2.copy(worldPoint).sub(pos).normalize(), -2);

    const s = this.spec;
    const body = this.debris.spawn(mesh, [s.wheelRadius * 2, s.wheelRadius * 2, s.wheelWidth], pos, quat, vel, null, 12);
    if (body) {
      this.debris.setHome(this.debris.items.length - 1, this.ctx.scene, pos.clone(), quat.clone());
    }
  }

  tryDetachPart(worldPoint, impact) {
    if (!this.liveParts.length) return;

    const s = this.spec;
    let best = -1;
    let bestScore = Infinity;

    for (let i = 0; i < this.liveParts.length; i++) {
      const part = this.liveParts[i];

      // 星星小车的星星装饰判定范围更大、门槛更低，撞一下更容易飞出去
      const reach = part.easyDetach ? 1.9 : 1.4;
      const need = part.easyDetach ? s.partDetachSpeed * 0.7 : s.partDetachSpeed;
      if (impact < need) continue;

      _v.copy(part.localPos);
      this.group.localToWorld(_v);
      const d = _v.distanceTo(worldPoint);
      if (d > reach) continue;

      const score = d / reach;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }

    if (best < 0) return;

    const part = this.liveParts[best];
    this.liveParts.splice(best, 1);

    _v.copy(part.localPos);
    const worldPos = this.group.localToWorld(_v.clone());
    _q.copy(this.group.quaternion).multiply(part.mesh.quaternion);

    const vel = new THREE.Vector3(this.body.velocity.x, this.body.velocity.y, this.body.velocity.z);
    vel.x += (Math.random() - 0.5) * 4;
    vel.y += 2 + Math.random() * 3;
    vel.z += (Math.random() - 0.5) * 4;

    this.debris.spawn(part.mesh, part.size, worldPos, _q, vel, null, 10);
    const idx = this.debris.items.length - 1;
    this.debris.setHome(idx, this.group, part.localPos, part.mesh.quaternion.clone(), part.mesh.scale.clone());
  }

  breakGlass() {
    this.glassBroken = true;
    for (const g of this.built.glassMeshes) {
      g.material = this.ctx.crackedGlassMaterial();
    }
  }

  update(dt, input) {
    const s = this.spec;
    const body = this.body;
    const vel = body.velocity;
    const speedKmh = vel.length() * 3.6;

    // 车头方向（局部 +Z）
    _q.copy(body.quaternion);
    const forward = _v.set(0, 0, 1).applyQuaternion(_q);
    const forwardSpeed = forward.x * vel.x + forward.y * vel.y + forward.z * vel.z;

    // 车损不再影响动力与极速，撞烂了照样能开
    const powerScale = 1;
    let engine = 0;
    let brake = 0;

    if (this.wrecked) {
      engine = 0;
    } else if (input.throttle > 0.01 && speedKmh < s.maxSpeedKmh) {
      engine = s.motorSign * input.throttle * s.motorForce * powerScale * 0.6;
    }

    if (input.brake > 0.01 && !this.wrecked) {
      if (forwardSpeed > 1.2) {
        brake = input.brake * s.brakeForce;
      } else {
        engine = -s.motorSign * input.brake * s.motorForce * powerScale * 0.35;
      }
    }

    if (input.handbrake) {
      brake = s.handbrakeForce;
      engine = 0;
    }

    for (let i = 0; i < 4; i++) {
      this.vehicle.applyEngineForce(engine, i);
      this.vehicle.setBrake(brake, i);
    }

    // 速度上去以后收窄转向角，避免高速一把方向就把车带翻
    let steerLimit = s.steerMax;
    if (speedKmh > 70) {
      steerLimit = s.steerMax * Math.max(0.18, 1 - (speedKmh - 70) / 240);
    }

    const steerTarget = s.steerSign * input.steer * steerLimit;
    this.steerValue += (steerTarget - this.steerValue) * Math.min(1, dt * s.steerSpeed);
    this.vehicle.setSteeringValue(this.steerValue, 0);
    this.vehicle.setSteeringValue(this.steerValue, 1);

    // 接地判断与下压力
    let grounded = 0;
    for (let i = 0; i < 4; i++) {
      if (this.vehicle.wheelInfos[i].raycastResult && this.vehicle.wheelInfos[i].raycastResult.body) grounded++;
    }

    if (grounded > 0) {
      // 下压力沿世界竖直方向向下压。第二个参数是相对刚体中心的偏移，
      // 早先误传了 body.position 世界坐标，等于给车体塞了一个几米长的力臂，
      // 结果平坦路面直线行驶也会被自己的扭矩掀翻。
      // 系数比早期版本小得多，否则高速下压力会把车死死压在地上，坡顶甩不起来。
      const f = -s.downforce * speedKmh * speedKmh * 0.0012;
      body.applyForce(_force.set(0, f, 0), CANNON.Vec3.ZERO);
    }

    if (grounded > 0) this.applyActiveStability(dt);

    if (grounded === 0) {
      this.airTime += dt;
      // 刚离地那一下不响应特技，否则车头立刻一栽，看着像刚上坡就摔
      if (this.canStartTrick()) this.updateAirTricks(dt, input);
    } else if (this.airTime > 0.35) {
      // 真的腾空过才结算特技，压过减速带那种小颠簸不算
      this.settleTricks();
      this.airTime = 0;
    } else {
      this.airTime = 0;
      this.airSpin = 0;
      this.airRoll = 0;
    }

    this.checkHardLanding(grounded);
    this.updateDamageVisual(dt);
    this.applyWaterDrag(dt);
    this.updateLoopFlag();
    this.updateExhaustFlame(dt, input);

    if (this.cannonCooldown > 0) this.cannonCooldown -= dt;

    this.syncVisual();
    this.debris.update();

    if (body.position.y < -25) this.requestReset();
  }

  /**
   * 硬着陆。悬挂会吸收大部分垂直冲击，导致高空坠落几乎测不到碰撞，
   * 所以这里直接用垂直速度骤减来判断落地力度。
   */
  checkHardLanding(grounded) {
    const vy = this.body.velocity.y;

    if (this.wasAirborne && grounded > 0 && this.lastVy < -9) {
      const impact = Math.min(40, -this.lastVy * 0.95);
      _v.set(this.body.position.x, this.body.position.y - 0.35, this.body.position.z);
      this.applyImpact(impact, _v, new THREE.Vector3(0, 1, 0));
    }

    this.wasAirborne = grounded === 0;
    this.lastVy = vy;
  }

  /**
   * 特技启动门槛。
   * 刚离开坡面就翻滚的话，车头会直接栽进地面，看起来就是刚上坡就摔了。
   * 这里要求腾空够久，并且已经过了上升最快的阶段，
   * 也就是飞到接近最高点时才允许做动作，符合往上飞再翻的手感。
   */
  canStartTrick() {
    if (this.airTime < 0.42) return false;
    return this.body.velocity.y < 4.2;
  }

  /**
   * 接地时的主动稳定，等效于装了防倾杆加俯仰阻尼，再加一根很硬的回正弹簧。
   * 先绕着车体横轴与纵轴分别削掉一部分角速度，再按车顶偏离竖直的程度主动往回扳。
   * 这样过弯侧倾和撞完乱转都会明显收敛，只会往一个方向温和地倒，不再动不动翻过去。
   * 空中不启用，特技不受影响。
   */
  applyActiveStability(dt) {
    const body = this.body;

    // 车体局部横轴在世界中的方向
    _cv.set(1, 0, 0);
    body.quaternion.vmult(_cv, _cvOut);
    const axX = _cvOut.x;
    const axY = _cvOut.y;
    const axZ = _cvOut.z;

    // 车体局部纵轴
    _cv.set(0, 0, 1);
    body.quaternion.vmult(_cv, _cvOut);
    const azX = _cvOut.x;
    const azY = _cvOut.y;
    const azZ = _cvOut.z;

    // 车顶方向
    _cv.set(0, 1, 0);
    body.quaternion.vmult(_cv, _cvOut);
    const upX = _cvOut.x;
    const upY = _cvOut.y;
    const upZ = _cvOut.z;

    const w = body.angularVelocity;
    const pitchRate = w.x * axX + w.y * axY + w.z * axZ;
    const rollRate = w.x * azX + w.y * azY + w.z * azZ;

    const k = Math.min(0.6, dt * STABILITY_DAMP);
    const pitchCut = pitchRate * k;
    // 横滚比俯仰压得更狠，翻车绝大多数是侧着翻的
    const rollCut = rollRate * k * 1.6;

    w.x -= axX * pitchCut + azX * rollCut;
    w.y -= axY * pitchCut + azY * rollCut;
    w.z -= axZ * pitchCut + azZ * rollCut;

    // 车顶明显偏离竖直就主动往回扳，高速急转向时主要靠这一下稳住
    const tilt = Math.acos(Math.max(-1, Math.min(1, upY)));
    if (tilt > 0.2) {
      let rx = -upZ;
      let rz = upX;
      const rl = Math.hypot(rx, rz);

      if (rl > 0.001) {
        const strength = Math.min(4, (tilt - 0.2) * 5) * dt;
        rx /= rl;
        rz /= rl;
        w.x += rx * strength;
        w.z += rz * strength;
      }
    }
  }

  /**
   * 空中特技。油门做前空翻，刹车做后空翻，左右方向键做侧翻。
   * 目标角速度沿着车身局部轴合成后转成世界角速度，再平滑逼近，
   * 这样无论车在空中是什么姿态，翻的方向都跟玩家看到的车身一致。
   */
  updateAirTricks(dt, input) {
    const pitch = input.throttle - input.brake;
    const roll = -input.steer;

    const targetPitch = pitch * AIR_PITCH_RATE;
    const targetRoll = roll * AIR_ROLL_RATE;

    // 车身局部横轴在世界中的方向
    _cv.set(1, 0, 0);
    this.body.quaternion.vmult(_cv, _cvOut);
    const axX = _cvOut.x;
    const axY = _cvOut.y;
    const axZ = _cvOut.z;

    // 车身局部纵轴在世界中的方向
    _cv.set(0, 0, 1);
    this.body.quaternion.vmult(_cv, _cvOut);
    const azX = _cvOut.x;
    const azY = _cvOut.y;
    const azZ = _cvOut.z;

    const wx = axX * targetPitch + azX * targetRoll;
    const wy = axY * targetPitch + azY * targetRoll;
    const wz = axZ * targetPitch + azZ * targetRoll;

    const k = Math.min(1, dt * 5);
    const w = this.body.angularVelocity;
    w.x += (wx - w.x) * k;
    w.y += (wy - w.y) * k;
    w.z += (wz - w.z) * k;

    // 带符号累计，这样结算时能分辨出是前空翻还是后空翻、往哪边滚
    this.airSpin += targetPitch * dt;
    this.airRoll += targetRoll * dt;
  }

  /**
   * 落地结算。按腾空期间累计转过的整圈数与方向判定动作名称。
   * 同时有俯仰和滚转就算复合动作，油门加方向键一起按就能做出来。
   */
  settleTricks() {
    const spin = this.airSpin;
    const roll = this.airRoll;
    this.airSpin = 0;
    this.airRoll = 0;

    const flips = Math.floor(Math.abs(spin) / TRICK_FULL_TURN);
    const rolls = Math.floor(Math.abs(roll) / TRICK_FULL_TURN);
    if (flips <= 0 && rolls <= 0) return;

    const label = this.trickName(flips, spin > 0, rolls, roll > 0);
    this.ctx.onTrick?.(label, flips * 260 + rolls * 220);
  }

  trickName(flips, forward, rolls, left) {
    const flipWord = forward ? '前空翻' : '后空翻';
    const rollWord = left ? '左侧翻' : '右侧翻';

    if (flips > 0 && rolls > 0) {
      const total = flips + rolls;
      if (total >= 4) return '疯狂螺旋 ' + total + ' 连';
      if (total >= 3) return '三段螺旋';
      return '螺旋翻转';
    }

    if (flips >= 3) return flips + ' 连' + flipWord;
    if (flips === 2) return '双' + flipWord;
    if (flips === 1) return flipWord;

    if (rolls >= 3) return rolls + ' 连' + rollWord;
    if (rolls === 2) return '双' + rollWord;
    return rollWord;
  }

  /**
   * 水池阻力。轮子泡在水里明显跑不动，速度快的时候还会带起水花。
   */
  applyWaterDrag(dt) {
    const zones = this.ctx.waterZones;
    if (!zones || !zones.length) return;

    const p = this.body.position;
    let inWater = false;

    for (const z of zones) {
      if (p.x > z.minX && p.x < z.maxX && p.z > z.minZ && p.z < z.maxZ && p.y < 2.4) {
        inWater = true;
        break;
      }
    }

    this.inWater = inWater;
    if (!inWater) return;

    const v = this.body.velocity;
    // 阻力不能太大，否则车进去就彻底停住出不来了
    const k = Math.max(0, 1 - dt * 0.6);
    v.x *= k;
    v.z *= k;

    const speed = Math.hypot(v.x, v.z);
    this.waterTimer -= dt;
    if (this.waterTimer <= 0 && speed > 4) {
      this.waterTimer = 0.08;
      _v.set(p.x, 0.4, p.z);
      this.ctx.fx?.water(_v.clone(), speed);
    }
  }

  /**
   * 是否进到了三百六十度圆环内部。相机要用这个标记切成贴身机位，
   * 不然圆环壁会把整个画面挡住，什么都看不见。
   */
  updateLoopFlag() {    const loop = this.ctx.loopZone;
    if (!loop) {
      this.inLoop = false;
      return;
    }

    const p = this.body.position;
    this.inLoop =
      p.x > loop.minX && p.x < loop.maxX &&
      p.z > loop.minZ && p.z < loop.maxZ &&
      p.y < 30;
  }

  /** 跑车大油门时排气管往外喷火 */
  updateExhaustFlame(dt, input) {
    if (!this.spec.hasFlame || this.wrecked) return;

    this.flameTimer -= dt;
    if (this.flameTimer > 0) return;
    if (input.throttle < 0.5) return;

    this.flameTimer = 0.045;
    _v.set(0, -0.05, -2.35).applyQuaternion(this.group.quaternion).add(this.group.position);
    this.ctx.fx?.flames(_v.clone());
  }

  /**
   * 坦克开炮。从炮口沿车头方向打一条射线，
   * 命中活动刚体就给它一个朝前的冲量，建筑那种大块会被直接掀飞。
   */
  fireCannon() {
    if (!this.spec.hasCannon || this.cannonCooldown > 0 || this.wrecked) return false;
    this.cannonCooldown = 1.15;

    _v.set(0, 0, 1).applyQuaternion(this.group.quaternion).normalize();

    // 射线方向比车头略微下压一点，这样低一些的目标也能打到，
    // 不然炮口高度以上的矮墙和砖块永远打不着
    _v2.copy(_v);
    _v2.y -= 0.07;
    _v2.normalize();

    const len = this.spec.cannonLength || 4.2;
    const hgt = this.spec.cannonHeight || 1.3;

    const muzzle = this.group.position.clone();
    muzzle.y += hgt;
    muzzle.addScaledVector(_v, len);

    const to = muzzle.clone().addScaledVector(_v2, 75);

    this.ctx.fx?.muzzle(muzzle, _v.clone());
    this.ctx.audio?.crash(28);
    this.ctx.cameraRig?.shake(0.6);

    const ray = new CANNON.Ray(
      new CANNON.Vec3(muzzle.x, muzzle.y, muzzle.z),
      new CANNON.Vec3(to.x, to.y, to.z)
    );
    const result = new CANNON.RaycastResult();
    ray.intersectWorld(this.ctx.world, { mode: CANNON.Ray.CLOSEST, result, skipBackfaces: true });

    if (!result.hasHit || !result.body) return true;

    const hit = new THREE.Vector3(result.hitPointWorld.x, result.hitPointWorld.y, result.hitPointWorld.z);
    const target = result.body;

    if (target.mass > 0 && target !== this.body) {
      const dir = new CANNON.Vec3(_v.x, _v.y + 0.22, _v.z);
      dir.normalize();
      target.wakeUp();
      target.applyImpulse(dir.scale(target.mass * 30), new CANNON.Vec3(0, 0, 0));
      this.ctx.fx?.explosion(hit);
    } else if (target !== this.body) {
      // 静态结构直接打碎，墙、护栏、砖、坡、楼底座都不例外
      if (!this.shatterStatic(target, hit)) this.ctx.fx?.sparks(hit, 26);
    }

    // 后坐力，车往后挫一下
    this.body.velocity.x -= _v.x * 1.4;
    this.body.velocity.z -= _v.z * 1.4;

    this.ctx.onCannonHit?.(hit, target);
    return true;
  }

  /**
   * 把静态结构打碎。原刚体从物理世界移除，原地炸出一堆碎块。
   * 太大的结构不动，比如地面，打穿的话整个场地就没法玩了。
   */
  shatterStatic(body, hitPoint) {
    const map = this.ctx.staticMeshes;
    const mesh = map && map.get(body);
    if (!mesh) return false;
    if (body.noBreak) return false;

    const shape = body.shapes[0];
    const he = shape && shape.halfExtents;
    if (!he) return false;
    if (he.x > 25 || he.y > 25 || he.z > 25) return false;

    map.delete(body);
    this.ctx.world.removeBody(body);
    if (mesh.parent) mesh.parent.remove(mesh);

    const mat = mesh.material;
    const sizeX = Math.max(0.8, he.x * 0.55);
    const sizeY = Math.max(0.8, he.y * 0.55);
    const sizeZ = Math.max(0.8, he.z * 0.55);

    const pieces = 6;
    for (let i = 0; i < pieces; i++) {
      const chunk = new THREE.Mesh(new THREE.BoxGeometry(sizeX, sizeY, sizeZ), mat);
      const pos = new THREE.Vector3(
        hitPoint.x + (Math.random() - 0.5) * sizeX * 2.4,
        hitPoint.y + (Math.random() - 0.5) * sizeY * 2.2 + sizeY * 0.5,
        hitPoint.z + (Math.random() - 0.5) * sizeZ * 2.4
      );
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 13,
        5 + Math.random() * 8,
        (Math.random() - 0.5) * 13
      );

      this.debris.spawn(chunk, [sizeX, sizeY, sizeZ], pos, new THREE.Quaternion(), vel, null, 16);
    }

    this.ctx.fx?.explosion(hitPoint);
    return true;
  }

  /**
   * 车损的视觉与特效表现。车漆逐渐焦黑、过半冒烟、更严重开始起火，
   * 车损见底则原地爆炸。
   */
  updateDamageVisual(dt) {
    const h = this.vehicleHealth;

    // 车漆往焦黑方向走，粗糙度同步升高
    const soot = Math.min(1, (1 - h) * 1.15);
    const paint = this.built.bodyMesh.material;
    paint.color.copy(this.paintBase).lerp(SOOT_COLOR, soot * 0.8);
    paint.roughness = 0.42 + soot * 0.45;

    const pos = this.group.position;
    const quat = this.group.quaternion;

    // 引擎盖位置，跟着车身姿态走
    _v.set(0, 0.55, 1.3).applyQuaternion(quat).add(pos);

    this.smokeTimer -= dt;
    if (h < 0.55 && this.smokeTimer <= 0) {
      this.smokeTimer = h < 0.28 ? 0.13 : 0.36;
      this.ctx.fx?.smoke(_v.clone(), h < 0.28 ? 2.2 : 0.9);
    }

    this.fireTimer -= dt;
    if (h < 0.32 && this.fireTimer <= 0) {
      this.fireTimer = h < 0.15 ? 0.08 : 0.15;
      this.ctx.fx?.flames(_v.clone());
      this.burning = true;
    }

    // 界面上的车损是四舍五入显示的，血量掉到百分之二以下就已经显示 100%，
    // 判定阈值必须跟显示对齐，否则会出现显示满车损却迟迟不炸的情况
    if (h <= 0.02 && !this.exploded) this.explode();
  }

  /** 车损清零，原地爆炸。零件全部炸飞，动力切断，需要重置才能继续开。 */
  explode() {    this.exploded = true;
    this.wrecked = true;

    const p = this.group.position.clone();
    p.y += 0.5;

    this.ctx.fx?.explosion(p);
    this.ctx.audio?.crash(38);
    this.ctx.cameraRig?.shake(1.3);

    this.blastParts();
    this.ctx.onExplode?.(this);
  }

  /** 把还在车上的零件一次性炸出去 */
  blastParts() {
    while (this.liveParts.length) {
      const part = this.liveParts.pop();

      _v.copy(part.localPos);
      const worldPos = this.group.localToWorld(_v.clone());
      _q.copy(this.group.quaternion).multiply(part.mesh.quaternion);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 15,
        5 + Math.random() * 9,
        (Math.random() - 0.5) * 15
      );

      this.debris.spawn(part.mesh, part.size, worldPos, _q, vel, null, 10);
      const idx = this.debris.items.length - 1;
      this.debris.setHome(idx, this.group, part.localPos, part.mesh.quaternion.clone(), part.mesh.scale.clone());
    }
  }

  syncVisual() {
    this.group.position.copy(this.body.position);
    this.group.quaternion.copy(this.body.quaternion);

    for (let i = 0; i < 4; i++) {
      if (this.wheelDetached[i]) continue;
      this.vehicle.updateWheelTransform(i);
      const t = this.vehicle.wheelInfos[i].worldTransform;
      const wheel = this.built.wheels[i];
      wheel.position.set(t.position.x, t.position.y, t.position.z);
      wheel.quaternion.set(t.quaternion.x, t.quaternion.y, t.quaternion.z, t.quaternion.w);
    }
  }

  get speedKmh() {
    const v = this.body.velocity;
    return Math.hypot(v.x, v.y, v.z) * 3.6;
  }

  requestReset() {
    if (this.onAutoReset) this.onAutoReset();
  }

  /**
   * 一键翻正。把车摆回正立姿态，保留水平速度，清掉角速度与残余力。
   * 给孩子的保底功能，翻车以后不用整局重置。
   */
  flipUpright() {
    const body = this.body;

    // 用车头方向的水平投影重建正立姿态，朝向尽量保持不变
    _q.copy(body.quaternion);
    _v.set(0, 0, 1).applyQuaternion(_q);
    _v.y = 0;
    if (_v.lengthSq() < 1e-4) _v.set(0, 0, 1);
    _v.normalize();

    body.quaternion.setFromEuler(0, Math.atan2(_v.x, _v.z), 0);

    // 抬到悬挂接地点以上，避免摆正的瞬间卡进地面
    const lift = this.spec.resetHeight + 0.15;
    if (body.position.y < lift) body.position.y = lift;

    body.velocity.y = Math.max(0, body.velocity.y);
    body.angularVelocity.set(0, 0, 0);
    body.force.set(0, 0, 0);
    body.torque.set(0, 0, 0);
    body.wakeUp();

    this.steerValue = 0;
    this.syncVisual();
    return true;
  }

  /** 车是否翻倒了，用于界面提示与自动提示玩家按键 */
  get isFlipped() {
    _q.copy(this.body.quaternion);
    _v.set(0, 1, 0).applyQuaternion(_q);
    return _v.y < 0.25;
  }

  /**
   * 一键修复。不重新加载场景，只把车辆自身的物理、网格、零件、轮胎、血量全部还原。
   */
  reset(spawn) {
    const s = this.spec;

    // 高底盘车需要的离地高度更高，出生点给的 y 不够就抬到车自己的高度
    const spawnY = Math.max(spawn.pos[1], s.resetHeight);

    this.body.position.set(spawn.pos[0], spawnY, spawn.pos[2]);
    this.body.quaternion.setFromEuler(0, THREE.MathUtils.degToRad(spawn.yaw || 0), 0);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.force.set(0, 0, 0);
    this.body.torque.set(0, 0, 0);
    this.body.wakeUp();

    this.vehicleHealth = 1;
    this.engineHealth = 1;
    this.steerValue = 0;
    this.glassBroken = false;
    this.impactLog.length = 0;

    // 清掉车损表现与特技状态
    this.smokeTimer = 0;
    this.fireTimer = 0;
    this.burning = false;
    this.exploded = false;
    this.wrecked = false;
    this.airTime = 0;
    this.airSpin = 0;
    this.airRoll = 0;

    const paint = this.built.bodyMesh.material;
    paint.color.copy(this.paintBase);
    paint.roughness = this.paintRoughness;

    this.deformer.reset();
    this.debris.clear();
    this.liveParts = this.built.parts.slice();

    // 四轮无条件还原：可能存在只损伤压扁、还没脱落的轮子
    for (let i = 0; i < 4; i++) {
      const w = this.vehicle.wheelInfos[i];
      w.suspensionStiffness = s.suspensionStiffness;
      w.maxSuspensionForce = s.maxSuspensionForce;
      w.frictionSlip = s.frictionSlip;
      this.wheelDetached[i] = false;
      this.wheelHealth[i] = 1;
      this.refreshWheelLook(i);
    }

    for (const g of this.built.glassMeshes) {
      g.material = this.ctx.intactGlassMaterial();
    }

    for (let i = 0; i < 4; i++) {
      this.vehicle.updateWheelTransform(i);
    }

    this.syncVisual();
  }

  dispose() {
    this.debris.clear();
    this.ctx.world.removeBody(this.body);
    this.ctx.scene.remove(this.group);
    for (const w of this.built.wheels) this.ctx.scene.remove(w);
  }
}
