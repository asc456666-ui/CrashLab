import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const VEHICLE_KINDS = new Set(['car', 'scooter', 'trike', 'farm', 'excavator', 'dump', 'mixer', 'crane']);
const ANIMALS = new Set(['deer', 'cow', 'boar', 'rabbit']);

/** 卡通生物无血腥表现。每个角色合成一个绘制网格，近处巡游，被撞后交给物理。 */
export class Population {
  constructor(ctx) {
    this.ctx = ctx; this.actors = []; this.time = 0;
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    this.models = new Map();
    this.random = Math.random;
    this.adopted = false;
    this.wheelMatrix = new THREE.Matrix4(); this.wheelQuaternion = new THREE.Quaternion();
    this.wheelPosition = new THREE.Vector3(); this.wheelScale = new THREE.Vector3();
    this.wheelAxis = new THREE.Vector3(0, 1, 0);
    this.wheelMount = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    this.wheelGeometry = new THREE.CylinderGeometry(1, 1, 1, 12).toNonIndexed();
    const wheelColors = new Float32Array(this.wheelGeometry.attributes.position.count * 3);
    const wp = this.wheelGeometry.attributes.position, wn = this.wheelGeometry.attributes.normal;
    for (let i = 0; i < wp.count; i++) {
      const spoke = Math.abs(wn.getY(i)) > 0.5 && Math.sin(Math.atan2(wp.getX(i), wp.getZ(i)) * 4) > 0.3;
      const c = new THREE.Color(spoke ? 0xb7c4c4 : 0x243337);
      wheelColors.set([c.r, c.g, c.b], i * 3);
    }
    this.wheelGeometry.setAttribute('color', new THREE.BufferAttribute(wheelColors, 3));
  }

  model(kind, variant = 0) {
    const key = `${kind}:${variant % 4}`;
    if (this.models.has(key)) return this.models.get(key);
    const parts = [];
    const add = (shape, color, pos, scale = [1, 1, 1], rotation = [0, 0, 0]) => {
      const geometry = shape.index ? shape.toNonIndexed() : shape;
      if (geometry !== shape) shape.dispose();
      geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale)));
      const c = new THREE.Color(color), colors = new Float32Array(geometry.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometry.deleteAttribute('uv'); parts.push(geometry);
    };
    const box = (size, pos, color) => add(new THREE.BoxGeometry(...size), color, pos);
    const ball = (size, pos, color) => add(new THREE.IcosahedronGeometry(1, 1), color, pos, size);
    let size, mass, wheels = [];
    if (kind === 'car') {
      const paint = [0x59bfc1, 0xefb954, 0xe77978, 0x9497d5][variant % 4];
      box([2.1, 0.8, 4.5], [0, 0, 0], paint);
      box([1.8, 0.75, 2.2], [0, 0.7, -0.15], 0x405c72);
      for (const x of [-1, 1]) for (const z of [-1.45, 1.45]) wheels.push({ pos: [x, -0.2, z], r: 0.48, width: 0.3 });
      for (const x of [-0.7, 0.7]) box([0.4, 0.22, 0.1], [x, 0.05, 2.26], 0xfff0b0);
      size = [2.2, 1.8, 4.5]; mass = 320;
    } else if (kind === 'scooter' || kind === 'trike') {
      const color = [0x57afca, 0xe5a85d, 0xbc8fd1, 0x76b68a][variant % 4];
      box([0.7, 0.2, 1.9], [0, -0.4, 0], color);
      box([0.3, 1.1, 0.25], [0, 0.1, 0.85], color);
      box([0.9, 0.12, 0.18], [0, 0.7, 0.85], 0x35454a);
      box([0.6, 0.16, 0.7], [0, 0.05, -0.25], 0x314147);
      ball([0.27, 0.27, 0.27], [0, 0.95, -0.05], 0xf2cb7d);
      box([0.5, 0.6, 0.35], [0, 0.45, -0.1], 0x446c90);
      if (kind === 'trike') {
        box([1.5, 0.75, 1.2], [0, 0.05, -1.1], color);
        for (const x of [-0.75, 0.75]) wheels.push({ pos: [x, -0.5, -1.05], r: 0.4, width: 0.22 });
      } else wheels.push({ pos: [0, -0.5, -0.8], r: 0.36, width: 0.18 });
      wheels.push({ pos: [0, -0.5, 0.95], r: 0.36, width: 0.18 });
      size = [kind === 'trike' ? 1.7 : 0.9, 2.1, kind === 'trike' ? 3.1 : 2.6]; mass = kind === 'trike' ? 115 : 65;
    } else if (kind === 'farm') {
      box([1.7, 1, 3.5], [0, -0.05, 0.1], 0x5c9556);
      box([1.7, 1.6, 1.7], [0, 1.15, -0.6], 0x405b67);
      box([2, 0.2, 2], [0, 2.05, -0.6], 0x83b36b);
      box([0.18, 1.7, 0.18], [0.6, 1.05, 1.2], 0x334147);
      for (const x of [-1.15, 1.15]) {
        wheels.push({ pos: [x, -0.6, -1.2], r: 0.95, width: 0.55 });
        wheels.push({ pos: [x, -0.9, 1.3], r: 0.65, width: 0.4 });
      }
      size = [2.8, 3.8, 4.2]; mass = 360;
    } else if (['excavator', 'dump', 'mixer', 'crane'].includes(kind)) {
      const yellow = variant % 2 ? 0xe7ae44 : 0xe28f3e;
      box([2.7, 0.8, 5.8], [0, -0.7, 0], 0x485354);
      box([2.35, 1.7, 1.9], [0, 0.5, 1.65], yellow);
      box([2, 0.85, 0.12], [0, 0.85, 2.63], 0x3a6579);
      if (kind === 'excavator') {
        for (const x of [-1.55, 1.55]) box([0.85, 0.75, 4.8], [x, -1.1, -0.1], 0x354547);
        box([1.8, 0.8, 3], [0, 0.25, -1], yellow);
        add(new THREE.BoxGeometry(0.55, 0.7, 3.4), yellow, [0, 1.4, -1.8], [1, 1, 1], [-0.65, 0, 0]);
        add(new THREE.BoxGeometry(0.5, 0.65, 2.5), yellow, [0, 1.65, -4], [1, 1, 1], [0.8, 0, 0]);
        box([1.8, 0.9, 1], [0, 0.65, -5], 0x596264);
      } else if (kind === 'dump') {
        box([2.8, 1.5, 3.6], [0, 0.65, -1.1], yellow);
        box([2.5, 0.25, 3.4], [0, 1.45, -1.1], 0xb39767);
      } else if (kind === 'mixer') {
        add(new THREE.CylinderGeometry(1.15, 0.85, 3.6, 12), 0xe4e0cb, [0, 0.8, -1], [1, 1, 1], [Math.PI / 2 + 0.15, 0, 0]);
        box([0.8, 0.4, 1.5], [0, 0, -3], yellow);
      } else {
        box([2.5, 1.2, 3.2], [0, 0.5, -0.8], yellow);
        add(new THREE.BoxGeometry(0.65, 0.65, 6), yellow, [0, 2, -0.3], [1, 1, 1], [-0.22, 0, 0]);
        box([0.12, 1.7, 0.12], [0, 1, 2.6], 0x41505b);
      }
      for (const x of [-1.45, 1.45]) for (const z of [-1.9, 0, 1.9]) wheels.push({ pos: [x, -1, z], r: 0.65, width: 0.45 });
      size = [4, 3.7, kind === 'excavator' ? 8 : 6.4]; mass = kind === 'excavator' ? 650 : 520;
    } else if (kind === 'person') {
      box([0.85, 1.1, 0.5], [0, 0.1, 0], [0xd97757, 0x5b9ac1, 0xd4ad55, 0x7fbd95][variant % 4]);
      ball([0.35, 0.38, 0.34], [0, 0.98, 0], 0xe6bb94);
      for (const x of [-0.25, 0.25]) box([0.3, 0.85, 0.35], [x, -0.85, 0], 0x334553);
      for (const x of [-0.56, 0.56]) box([0.22, 0.95, 0.24], [x, 0.02, 0], 0xe6bb94);
      size = [1.25, 2.7, 0.65]; mass = 28;
    } else if (kind === 'tree') {
      box([0.9, 6, 0.9], [0, -1, 0], 0x79573d);
      ball([4.5, 4.2, 4.5], [0, 3.6, 0], [0x417b46, 0x53864a, 0x366b45, 0x6a9252][variant % 4]);
      size = [1.2, 8, 1.2]; mass = 45;
    } else if (kind === 'monster') {
      const color = [0x82bd69, 0xb194d6, 0xde9c62, 0x58b5ad][variant % 4];
      ball([2.3, 2.7, 1.7], [0, 0.2, 0], color);
      for (const x of [-1.9, 1.9]) ball([0.6, 1.7, 0.65], [x, -0.2, 0], color);
      for (const x of [-1, 1]) { box([1, 1.1, 1.4], [x, -2.2, 0.2], color); ball([0.55, 0.6, 0.3], [x * 0.7, 1.6, 1.45], 0xfff5d4); ball([0.22, 0.28, 0.15], [x * 0.7, 1.6, 1.72], 0x283a45); }
      for (const x of [-1.3, 1.3]) add(new THREE.ConeGeometry(0.45, 1.3, 5), 0xf5dfb0, [x, 2.7, 0]);
      size = [4.7, 6, 3.5]; mass = 160;
    } else {
      const rabbit = kind === 'rabbit', deer = kind === 'deer', cow = kind === 'cow';
      const color = cow ? 0xe1dbbe : rabbit ? 0xd8bfa0 : deer ? 0xb88655 : 0x9c765e;
      const scale = rabbit ? 0.65 : 1;
      ball([0.75 * scale, 0.7 * scale, 1.3 * scale], [0, 0, 0], color);
      ball([0.5 * scale, 0.62 * scale, 0.6 * scale], [0, 0.55 * scale, 1.12 * scale], color);
      for (const x of [-0.48, 0.48]) for (const z of [-0.8, 0.75]) box([0.26 * scale, 0.9 * scale, 0.3 * scale], [x * scale, -0.65 * scale, z * scale], cow ? 0x6c6256 : color);
      for (const x of [-0.34, 0.34]) {
        ball([0.13 * scale, 0.14 * scale, 0.1 * scale], [x * scale, 0.7 * scale, 1.6 * scale], 0x273a39);
        if (rabbit) box([0.22, 1.2, 0.22], [x * scale, 1.1, 0.8], color);
        if (deer || cow) box([0.14, deer ? 1.1 : 0.5, 0.14], [x, deer ? 1.3 : 1.05, 1.05], 0xf1d8aa);
      }
      if (cow) ball([0.5, 0.45, 0.7], [0.4, 0.1, -0.3], 0x4a4740);
      size = rabbit ? [0.95, 1.9, 2.2] : [1.6, deer ? 3 : 2.3, 3.3]; mass = rabbit ? 9 : cow ? 90 : 45;
    }
    const geometry = mergeGeometries(parts); parts.forEach(g => g.dispose());
    const result = { geometry, size, mass, wheels }; this.models.set(key, result); return result;
  }

  add(kind, x, z, options = {}) {
    const variant = this.actors.length;
    const model = this.model(kind, variant);
    const mesh = new THREE.Group();
    const visual = new THREE.Group(); mesh.add(visual);
    const skin = new THREE.Mesh(model.geometry, this.material); skin.castShadow = this.ctx.shadows; visual.add(skin);
    let wheelMesh = null;
    if (model.wheels.length) { wheelMesh = new THREE.InstancedMesh(this.wheelGeometry, this.material, model.wheels.length); visual.add(wheelMesh); }
    const y = (options.groundY || 0) + model.size[1] / 2;
    mesh.position.set(x, y, z); this.ctx.scene.add(mesh);
    const body = new CANNON.Body({ mass: model.mass, shape: new CANNON.Box(new CANNON.Vec3(...model.size.map(n => n / 2))), allowSleep: true });
    body.position.set(x, y, z); body.linearDamping = 0.12; body.angularDamping = 0.35;
    this.ctx.world.addBody(body); body.updateAABB(); body.sleep();
    this.ctx.dynamics.push({ mesh, body });
    const baseSpeed = options.speed || (VEHICLE_KINDS.has(kind) ? ({ scooter: 6, trike: 4.5, farm: 3.5, excavator: 2, dump: 4, mixer: 3.5, crane: 3 }[kind] || 9) : kind === 'monster' ? 2 : 1.4);
    const actor = { kind, mesh, visual, skin, wheelMesh, wheels: model.wheels, baseSize: model.size, body, home: body.position.clone(), route: options.route || [[x - 24, z - 24], [x + 24, z + 24]], target: 1, baseSpeed, speed: baseSpeed, knocked: 0, active: false, groundY: options.groundY || 0, phase: this.random() * 6.28, wheelSpin: 0, stuck: 0, heading: 0, lastPosition: body.position.clone(), checkTimer: 1, behavior: 'walk', behaviorTimer: 2 + this.random() * 5, bounds: options.bounds };
    actor.isVehicle = VEHICLE_KINDS.has(kind);
    actor.isAnimal = ANIMALS.has(kind);
    body.populationActor = actor;
    body.addEventListener('collide', event => {
      if (kind === 'tree') return;
      const contact = event.contact;
      // 接地的正常冲击不应让整辆车进入长时间倒地状态。
      if (Math.abs(contact?.ni?.y || 0) > 0.65) return;
      const impact = Math.abs(contact?.getImpactVelocityAlongNormal() || 0);
      if (event.body?.populationActor && impact < 9) { actor.checkTimer = 0; actor.stuck += 0.5; return; }
      if (event.body?.mass === 0 && impact < 9) { this.chooseGoal(actor); return; }
      if (impact > 3) { actor.knocked = event.body?.populationActor ? 2.5 : 6; body.wakeUp(); }
    });
    this.actors.push(actor);
    this.chooseGoal(actor);
    if (actor.isAnimal) this.setBehavior(actor, ['walk', 'run', 'hop', 'sit', 'lie'][this.actors.filter(a => a.isAnimal).length % 5]);
    this.animateActor(actor, 0);
    return actor;
  }

  seedMain() {
    const hubs = [[0, 230], [350, -130], [335, 205], [-365, 100]];
    for (let i = 0; i < 16; i++) {
      const [x, z] = hubs[i % hubs.length];
      const px = x + 20 + Math.floor(i / 4) * 5;
      this.add('person', px, z + 16, { groundY: i % hubs.length === 2 && px < 360 ? 2 : 0, route: [[x + 15, z + 16], [x + 40, z + 16]] });
    }
    for (let i = 0; i < 8; i++) {
      const x = i % 2 ? 241 : 258, z = -210 + Math.floor(i / 2) * 130;
      this.add('car', x, z, { speed: 11 + i % 3, route: [[x, -265], [x, 280]] });
    }
    for (let i = 0; i < 8; i++) this.add(i % 2 ? 'deer' : 'rabbit', -325 - i * 13, 260 - i % 3 * 14);
  }

  adoptMovers(movers = []) {
    for (const mover of movers) {
      const body = mover.body, kind = mover.legs ? 'person' : 'car';
      const half = body.shapes[0]?.halfExtents;
      const baseSize = half ? [half.x * 2, half.y * 2, half.z * 2] : [1, 2, 1];
      const a = { kind, mesh: this.ctx.dynamics.find(d => d.body === body)?.mesh, visual: null, body, home: body.position.clone(), route: [[mover.from.x, mover.from.z], [mover.goal.x, mover.goal.z]], target: 1, baseSpeed: mover.speed, speed: mover.speed, knocked: 0, active: false, groundY: body.position.y - baseSize[1] / 2, baseSize, phase: this.random() * 6.28, wheelSpin: 0, stuck: 0, heading: 0, lastPosition: body.position.clone(), checkTimer: 1, behavior: 'walk', behaviorTimer: 5, isVehicle: kind === 'car', isAnimal: false, legs: mover.legs, adopted: true };
      body.populationActor = a;
      body.addEventListener('collide', event => {
        if (Math.abs(event.contact?.ni?.y || 0) > 0.65) return;
        const impact = Math.abs(event.contact?.getImpactVelocityAlongNormal() || 0);
        if (impact > 4 && event.body?.mass > 0 && !event.body.populationActor) { a.knocked = 6; body.wakeUp(); }
        else if (impact > 1) this.chooseGoal(a);
      });
      this.actors.push(a); this.chooseGoal(a);
    }
    this.adopted = true;
  }

  chooseGoal(a) {
    const p = a.body.position;
    let goal;
    for (let attempt = 0; attempt < 8; attempt++) {
      if (a.bounds?.radius) {
        const angle = this.random() * Math.PI * 2, radius = Math.sqrt(this.random()) * a.bounds.radius;
        goal = { x: a.bounds.x + Math.cos(angle) * radius, z: a.bounds.z + Math.sin(angle) * radius };
      } else {
        const xs = a.route.map(point => point[0]), zs = a.route.map(point => point[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
        const padX = maxX - minX < 4 ? 1.5 : 0, padZ = maxZ - minZ < 4 ? 1.5 : 0;
        goal = { x: minX - padX + this.random() * (maxX - minX + padX * 2), z: minZ - padZ + this.random() * (maxZ - minZ + padZ * 2) };
      }
      if (Math.hypot(goal.x - p.x, goal.z - p.z) < (a.isVehicle ? 14 : 6)) continue;
      if (a.active && this.pathBlocked(a, goal)) continue;
      break;
    }
    a.goal = goal; a.goalSerial = (a.goalSerial || 0) + 1;
    a.speed = a.baseSpeed * (0.6 + this.random() * 0.85);
    if (a.goalSerial === 1) { a.heading = Math.atan2(goal.x - p.x, goal.z - p.z); a.body.quaternion.setFromEuler(0, a.heading, 0); }
  }

  pathBlocked(a, goal) {
    const p = a.body.position, dx = goal.x - p.x, dz = goal.z - p.z, len = Math.hypot(dx, dz);
    if (len < 0.01) return false;
    let blocked = false;
    const reach = Math.min(12, len);
    this.ctx.world.raycastAll(new CANNON.Vec3(p.x, p.y, p.z), new CANNON.Vec3(p.x + dx / len * reach, p.y, p.z + dz / len * reach), { skipBackfaces: true }, hit => {
      if (hit.body === a.body) return;
      if (hit.body.type === CANNON.Body.STATIC || hit.body.populationActor?.kind === 'tree') blocked = true;
    });
    return blocked;
  }

  setBehavior(a, behavior) {
    a.behavior = behavior;
    a.behaviorTimer = 2 + this.random() * (behavior === 'lie' || behavior === 'sit' ? 6 : 4);
    a.hopTimer = 0.15 + this.random() * 0.5;
    if (!a.isAnimal) return;
    const size = a.baseSize, shape = a.body.shapes[0];
    const h = behavior === 'lie' ? [size[1] / 2, size[0] / 2, size[2] / 2] : [size[0] / 2, size[1] / 2 * (behavior === 'sit' ? 0.68 : 1), size[2] / 2];
    shape.halfExtents.set(...h); shape.updateConvexPolyhedronRepresentation(); shape.updateBoundingSphereRadius();
    a.body.position.y = a.groundY + h[1] + 0.03;
    a.body.velocity.y = 0;
    a.body.updateBoundingRadius(); a.body.updateMassProperties(); a.body.updateAABB();
  }

  update(dt, player) {
    this.time += dt;
    for (const a of this.actors) {
      if (a.kind === 'tree') continue;
      const p = a.body.position, distance = Math.hypot(p.x - player.x, p.z - player.z);
      const near = distance < 270;
      if (a.knocked > 0) {
        a.knocked -= dt;
        if (a.knocked <= 0 && distance > 9) this.restore(a);
        else if (a.knocked <= 0) a.knocked = 0.6;
        continue;
      }
      const upY = 1 - 2 * (a.body.quaternion.x ** 2 + a.body.quaternion.z ** 2);
      if (upY < 0.55 || p.y < a.groundY - 5) { a.knocked = 3; continue; }
      a.active = near;
      a.behaviorTimer -= dt;
      if (a.isAnimal && a.behaviorTimer <= 0 && Math.abs(a.body.velocity.y) < 1.5 && p.y < a.groundY + a.body.shapes[0].halfExtents.y + 0.2) {
        this.setBehavior(a, ['walk', 'walk', 'run', 'hop', 'sit', 'lie'][Math.floor(this.random() * 6)]);
        this.chooseGoal(a);
      }
      const resting = a.isAnimal && (a.behavior === 'sit' || a.behavior === 'lie');
      if (resting) { a.body.velocity.x *= Math.exp(-dt * 8); a.body.velocity.z *= Math.exp(-dt * 8); continue; }
      const goal = a.goal || { x: a.home.x, z: a.home.z };
      const dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz);
      if (d < (a.isVehicle ? 6 : 2.5) || (a.isVehicle && a.behaviorTimer <= 0)) { this.chooseGoal(a); a.behaviorTimer = 5 + this.random() * 8; }
      let delta = Math.atan2(a.goal.x - p.x, a.goal.z - p.z) - a.heading;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      const turnRate = a.isVehicle ? 2 : 3.5;
      a.heading += Math.max(-dt * turnRate, Math.min(dt * turnRate, delta));
      const turnSlow = a.isVehicle ? Math.max(0.13, Math.cos(Math.min(1.5, Math.abs(delta)))) : 1;
      const behaviorSpeed = a.behavior === 'run' ? 2 : a.behavior === 'hop' ? 1.4 : 1;
      const speed = a.speed * turnSlow * behaviorSpeed;
      const vx = Math.sin(a.heading) * speed, vz = Math.cos(a.heading) * speed;
      a.body.quaternion.setFromEuler(0, a.heading, 0); a.body.angularVelocity.set(0, 0, 0);
      if (!near) {
        // 远处车辆仍推进随机巡游位置；休眠刚体不参与每帧接触求解。
        a.body.sleep();
        if (a.isVehicle) { p.x += vx * dt; p.z += vz * dt; p.y = a.home.y; a.body.updateAABB(); }
        continue;
      }
      a.body.wakeUp(); a.body.velocity.x = vx; a.body.velocity.z = vz;
      if (a.isAnimal && a.behavior === 'hop') {
        a.hopTimer -= dt;
        const floor = a.groundY + a.body.shapes[0].halfExtents.y;
        if (a.hopTimer <= 0 && p.y < floor + 0.15 && a.body.velocity.y < 1) {
          a.body.velocity.y = a.kind === 'rabbit' ? 5 : 4;
          a.hopTimer = 0.9 + this.random() * 0.7;
        }
      }
      a.checkTimer -= dt;
      if (a.checkTimer <= 0) {
        const moved = Math.hypot(p.x - a.lastPosition.x, p.z - a.lastPosition.z);
        a.stuck = moved < 0.25 ? a.stuck + 1 : Math.max(0, a.stuck - 1);
        a.lastPosition.copy(p); a.checkTimer = 1;
        if (a.stuck >= 2 || this.pathBlocked(a, a.goal)) this.chooseGoal(a);
        if (a.stuck >= 5 && distance > 12) this.restore(a);
      }
    }
  }

  animateActor(a, dt) {
    if (a.legs) for (let i = 0; i < a.legs.length; i++) a.legs[i].rotation.x = Math.sin(this.time * 7 + i * Math.PI + a.phase) * 0.45;
    if (!a.visual) return;
    const rest = a.behavior === 'lie' || a.behavior === 'sit';
    const blend = Math.min(1, dt * 8 + (dt === 0 ? 1 : 0));
    const z = a.behavior === 'lie' ? Math.PI / 2 : 0, x = a.behavior === 'sit' ? -0.2 : 0;
    a.visual.rotation.z += (z - a.visual.rotation.z) * blend;
    a.visual.rotation.x += (x - a.visual.rotation.x) * blend;
    a.visual.scale.y += ((a.behavior === 'sit' ? 0.68 : 1) - a.visual.scale.y) * blend;
    a.visual.position.y = a.isVehicle ? -0.2 : !rest && !a.knocked ? Math.sin(this.time * (a.behavior === 'run' ? 13 : 7) + a.phase) * 0.04 : 0;
    if (a.wheelMesh) {
      a.wheelSpin += (a.active ? Math.hypot(a.body.velocity.x, a.body.velocity.z) : a.speed) * dt;
      a.wheels.forEach((wheel, i) => {
        this.wheelQuaternion.setFromAxisAngle(this.wheelAxis, a.wheelSpin / wheel.r).premultiply(this.wheelMount);
        this.wheelPosition.set(...wheel.pos); this.wheelScale.set(wheel.r, wheel.width, wheel.r);
        a.wheelMesh.setMatrixAt(i, this.wheelMatrix.compose(this.wheelPosition, this.wheelQuaternion, this.wheelScale));
      });
      a.wheelMesh.instanceMatrix.needsUpdate = true;
      if (!a.wheelMesh.boundingSphere) a.wheelMesh.computeBoundingSphere();
    }
  }

  afterPhysics(dt) { for (const a of this.actors) if (a.active || a.isAnimal) this.animateActor(a, dt); }

  restore(a) {
    if (a.isAnimal) this.setBehavior(a, 'walk');
    a.body.position.copy(a.home); a.body.quaternion.set(0, 0, 0, 1);
    a.body.velocity.set(0, 0, 0); a.body.angularVelocity.set(0, 0, 0);
    a.body.force.set(0, 0, 0); a.body.torque.set(0, 0, 0);
    a.body.updateAABB(); a.knocked = 0; a.stuck = 0; a.body.sleep();
    this.chooseGoal(a);
  }

  reset() { for (const actor of this.actors) this.restore(actor); }
}
