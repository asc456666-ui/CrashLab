import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OpenWorld } from '../src/world/OpenWorld.js';
import { mat } from '../src/world/Materials.js';
import { Vehicle } from '../src/vehicle/Vehicle.js';
import { Settings } from '../src/core/Settings.js';
import { InputManager } from '../src/input/InputManager.js';
import { createBox } from '../src/physics/Helpers.js';
import { Arena } from '../src/world/Arena.js';

// 地形/物理测试无需 Canvas；浏览器验证覆盖实际纹理生成。
for (const key of ['wood', 'metal', 'metalDark', 'hazard']) mat(key, () => new THREE.MeshStandardMaterial());
function setup() {
  const ctx = { scene: new THREE.Scene(), world: new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) }), dynamics: [], staticMeshes: new Map(), waterZones: [], shadows: false, intactGlassMaterial: () => new THREE.MeshBasicMaterial() };
  ctx.world.broadphase = new CANNON.SAPBroadphase(ctx.world);
  const arena = { spawnPoints: Array.from({ length: 12 }, () => ({ pos: [0, 2, 0] })) };
  const world = new OpenWorld(ctx, arena);
  ctx.openWorld = world;
  return { ctx, arena, world };
}

test('construction fleet has seven collidable vehicle types with rotating wheels; distant traffic still moves', () => {
  const { ctx, world } = setup();
  const fleet = world.population.actors.filter(a => a.home.x > 2300);
  assert.equal(fleet.length, 42);
  assert.equal(new Set(fleet.map(a => a.kind)).size, 7);
  for (const a of fleet) assert.ok(a.wheels.length >= 2 && a.body.mass > 0);
  const cars = world.population.actors.filter(a => a.isVehicle);
  const before = cars.map(a => a.body.position.clone());
  for (let i = 0; i < 300; i++) { world.population.update(1 / 60, { x: -1000, z: 1000 }); ctx.world.step(1 / 60); }
  cars.forEach((a, i) => assert.ok(a.body.position.distanceTo(before[i]) > 0.5, `${a.kind} should move even far from the player`));
  assert.ok(new Set(cars.map(a => a.speed.toFixed(1))).size > 10);
});

test('nearby construction traffic drives on physical ground, repaths and animates wheels', () => {
  const { ctx, world } = setup();
  const fleet = world.population.actors.filter(a => a.home.x > 2300);
  const before = fleet.map(a => a.body.position.clone());
  const travelled = fleet.map(() => 0);
  for (let i = 0; i < 600; i++) {
    world.population.update(1 / 60, { x: 2600, z: 0 }); ctx.world.step(1 / 60); world.population.afterPhysics(1 / 60);
    fleet.forEach((a, j) => { travelled[j] = Math.max(travelled[j], a.body.position.distanceTo(before[j])); });
  }
  const moving = fleet.filter((a, i) => travelled[i] > 1);
  assert.equal(moving.length, fleet.length);
  for (const a of fleet) { assert.ok(a.goalSerial >= 2); assert.ok(a.wheelSpin > 1, `${a.kind} wheels: ${a.wheelSpin}`); assert.ok(a.body.position.y > -1); }
});

test('animal behaviors change collider posture, perform real jumps and choose varying random routes', () => {
  const { ctx, world } = setup(), population = world.population;
  const a = population.actors.find(a => a.kind === 'rabbit');
  createBox(ctx, { size: [60, 2, 60], pos: [-400, -1, 400], material: world.mats.road });
  a.home.set(-400, a.baseSize[1] / 2, 400); a.body.position.copy(a.home);
  a.route = [[-420, 380], [-380, 420]];
  const standing = a.baseSize[1] / 2;
  population.setBehavior(a, 'sit'); assert.ok(a.body.shapes[0].halfExtents.y < standing);
  population.setBehavior(a, 'lie'); assert.equal(a.body.shapes[0].halfExtents.y, a.baseSize[0] / 2);
  population.setBehavior(a, 'hop'); a.behaviorTimer = 10; population.chooseGoal(a);
  let highest = 0;
  for (let i = 0; i < 120; i++) { population.update(1 / 60, a.home); ctx.world.step(1 / 60); highest = Math.max(highest, a.body.position.y); }
  assert.ok(highest > standing + 0.6);
  const goals = new Set(); for (let i = 0; i < 20; i++) { population.chooseGoal(a); goals.add(`${a.goal.x.toFixed(1)},${a.goal.z.toFixed(1)}`); }
  assert.ok(goals.size > 15);
});

test('automatic drift creates controlled sideslip, preserves upright driving and releases on straightening', () => {
  const { ctx, world } = setup();
  createBox(ctx, { size: [400, 2, 400], pos: [0, -1, 0], material: world.mats.road });
  const v = new Vehicle(ctx); v.reset({ pos: [0, 1.6, 0], yaw: 0 });
  for (let i = 0; i < 90; i++) { v.update(1 / 60, { throttle: 0, steer: 0, brake: 0 }); ctx.world.step(1 / 60); }
  v.body.velocity.set(0, 0, 20);
  let peak = 0, slip = 0;
  for (let i = 0; i < 90; i++) {
    v.update(1 / 60, { throttle: 0.7, steer: 0.65, brake: 0 }); ctx.world.step(1 / 60);
    peak = Math.max(peak, v.drift.amount);
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(v.body.quaternion);
    slip = Math.max(slip, Math.abs(v.body.velocity.x * f.z - v.body.velocity.z * f.x));
  }
  assert.ok(peak > 0.5 && slip > 0.5, `drift amount=${peak}, slip=${slip}`);
  assert.ok(!v.isFlipped && v.drift.distance > 5);
  for (let i = 0; i < 90; i++) { v.update(1 / 60, { throttle: 0.4, steer: 0, brake: 0 }); ctx.world.step(1 / 60); }
  assert.equal(v.drift.amount, 0);
  assert.ok(v.drift.visual.angleTo(new THREE.Quaternion()) < 1e-6);
  v.reset({ pos: [0, 20, 0], yaw: 0 }); v.body.velocity.set(0, 0, 20);
  v.update(1 / 60, { throttle: 1, steer: 1, brake: 0 }); assert.equal(v.drift.amount, 0);
  v.dispose();
});

test('new regions provide safe spawn entries, eighteen discoveries and bounded non-population props', () => {
  const { ctx, arena, world } = setup();
  assert.equal(world.regions.length, 10);
  assert.equal(arena.spawnPoints.length, 21);
  assert.equal(world.discoveries.length, 18);
  assert.equal(new Set(world.discoveries.map(s => s.id)).size, 18);
  const actors = new Set(world.population.actors.map(a => a.body));
  assert.ok(ctx.world.bodies.filter(b => b.type === CANNON.Body.DYNAMIC && !actors.has(b)).length <= 20);
  assert.equal(ctx.world.constraints.length, 1);
  for (const s of arena.spawnPoints.slice(12)) assert.ok(s.pos.every(Number.isFinite));
});

test('all slope top endpoints match physical collider and visual geometry', () => {
  const { world } = setup();
  for (const s of world.slopes) {
    const length = s.from.distanceTo(s.to);
    for (const [z, expected] of [[-length / 2, s.from], [length / 2, s.to]]) {
      const point = new THREE.Vector3(0, s.thickness / 2, z).applyQuaternion(s.mesh.quaternion).add(s.mesh.position);
      assert.ok(point.distanceTo(expected) < 1e-8);
    }
    assert.ok(s.mesh.quaternion.angleTo(new THREE.Quaternion().copy(s.body.quaternion)) < 1e-7);
    assert.equal(s.body.noBreak, true);
  }
});

test('mud reduces grip only within surface bounds and restores grip after exiting', () => {
  const { ctx, world } = setup();
  assert.equal(world.surfaceAt({ x: -350, y: 1, z: 140 }).type, 'mud');
  assert.equal(world.surfaceAt({ x: -350, y: 10, z: 140 }), null);
  const v = new Vehicle(ctx);
  v.body.position.set(-350, 1, 140);
  v.update(1 / 60, { throttle: 0, brake: 0, steer: 0, handbrake: false });
  assert.ok(v.vehicle.wheelInfos[0].frictionSlip < v.spec.frictionSlip);
  v.body.position.set(0, 1, 0);
  v.update(1 / 60, { throttle: 0, brake: 0, steer: 0, handbrake: false });
  assert.equal(v.vehicle.wheelInfos[0].frictionSlip, v.spec.frictionSlip);
  v.dispose();
});

test('lift and drawbridge move physically, stop at endpoints and reset completely', () => {
  const { ctx, world } = setup();
  world.liftTarget = 18;
  world.bridgeTarget = Math.PI / 3;
  for (let i = 0; i < 600; i++) { world.updateMechanisms(1 / 60); ctx.world.step(1 / 60); }
  assert.ok(Math.abs(world.lift.body.position.y + 0.4 - 18) < 0.01);
  assert.ok(Math.abs(2 * Math.atan2(world.bridge.body.quaternion.z, world.bridge.body.quaternion.w) - Math.PI / 3) < 0.01);
  world.reset();
  assert.equal(world.lift.body.position.y, -0.2);
  assert.equal(world.bridge.body.position.y, 1.6);
  assert.equal(world.bridge.body.velocity.length(), 0);
  assert.equal(world.crane.body.sleepState, CANNON.Body.SLEEPING);
});

test('discoveries count once, survive restart and require spatial proximity', () => {
  const { world } = setup();
  world.found.clear();
  const old = Settings.data.discoveries;
  const spot = world.discoveries[0];
  const vehicle = { body: { position: spot.pos.clone(), velocity: new CANNON.Vec3() }, requestReset() {} };
  try {
    world.update(0.01, vehicle); world.update(0.01, vehicle);
    assert.equal(world.foundCount, 1);
    assert.equal(spot.marker.visible, false);
    const second = setup().world;
    assert.equal(second.foundCount, 1);
    assert.equal(second.discoveries[0].marker.visible, false);
  } finally { Settings.data.discoveries = old; }
});

test('elevator carries a real vehicle up to the high platform', () => {
  const { ctx, world } = setup();
  const v = new Vehicle(ctx);
  v.reset({ pos: [450, 1.6, -100], yaw: 0 });
  const input = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  for (let i = 0; i < 90; i++) { v.update(1 / 60, input); world.updateMechanisms(1 / 60); ctx.world.step(1 / 60); }
  world.liftTarget = 18;
  for (let i = 0; i < 600; i++) { v.update(1 / 60, input); world.updateMechanisms(1 / 60); ctx.world.step(1 / 60); }
  assert.ok(v.body.position.y > 18 && v.body.position.y < 20);
  assert.ok(Math.abs(v.body.position.x - 450) < 1);
  v.dispose();
});

test('parking upper ramp is driveable from the turning platform to the roof', () => {
  const { ctx } = setup();
  const v = new Vehicle(ctx);
  v.reset({ pos: [62, 9.6, 430], yaw: 180 });
  let highest = 0;
  for (let i = 0; i < 1500 && v.body.position.z > 340; i++) {
    v.update(1 / 60, { throttle: v.speedKmh < 45 ? 0.5 : 0, brake: 0, steer: 0, handbrake: false });
    ctx.world.step(1 / 60);
    highest = Math.max(highest, v.body.position.y);
  }
  assert.ok(highest > 15, `highest: ${highest}`);
  assert.ok(v.body.position.z < 340, `position: ${v.body.position.z}`);
  v.dispose();
});

test('double throttle tap triggers once, holding or steering does not trigger a stunt', () => {
  const input = Object.create(InputManager.prototype);
  input.enabled = true; input.handlers = {}; input.lastThrottleTap = -Infinity;
  let stunts = 0; input.on('stunt', () => stunts++);
  input.tapThrottle(1000); input.tapThrottle(1250);
  assert.equal(stunts, 1);
  input.tapThrottle(2000); input.tapThrottle(2500);
  assert.equal(stunts, 1);
  input.enabled = false; input.tapThrottle(2600);
  assert.equal(stunts, 1);
});

test('automatic stunt choice responds to ascent, apex, descent and speed', () => {
  const { ctx } = setup();
  const v = new Vehicle(ctx), f = v.flight;
  v.body.velocity.set(5, 10, 0); assert.equal(f.chooseStunt().style, 'flip');
  f.peak = 20; v.body.velocity.y = 0; assert.equal(f.chooseStunt().style, 'spiral');
  v.body.velocity.y = -12; assert.equal(f.chooseStunt().style, 'boost');
  v.body.velocity.set(40, -6, 0); assert.equal(f.chooseStunt().style, 'spin');
  v.body.velocity.set(5, -6, 0); assert.equal(f.chooseStunt().style, 'roll');
  v.dispose();
});

test('ramp departure boosts height and steering alone leaves stunt inactive', () => {
  const { ctx } = setup();
  const v = new Vehicle(ctx), f = v.flight;
  v.body.velocity.set(0, 5, 18);
  v.vehicle.wheelInfos[0].raycastResult.body = { launchRamp: true };
  f.update(1 / 60, 4);
  f.update(1 / 60, 0);
  assert.ok(v.body.velocity.y > 15);
  for (let i = 0; i < 30; i++) f.update(1 / 60, 0);
  assert.equal(f.stunt, null);
  f.requestStunt(); f.update(1 / 60, 0);
  assert.ok(f.stunt);
  for (let i = 0; i < 100; i++) f.update(1 / 60, 0);
  assert.ok(f.stunts > 0);
  assert.ok(f.visual.angleTo(new THREE.Quaternion()) < 1e-6);
  v.dispose();
});

test('population has collidable animals, monsters, people and traffic; collisions suspend wandering', () => {
  const { world } = setup();
  const counts = {};
  for (const a of world.population.actors) {
    counts[a.kind] = (counts[a.kind] || 0) + 1;
    assert.ok(a.body.mass > 0 && a.body.collisionResponse);
    assert.equal(a.skin.geometry.groups.length, 0);
  }
  assert.ok(counts.person >= 16 && counts.car >= 18 && counts.monster === 8);
  assert.ok(counts.deer + counts.rabbit + counts.cow + counts.boar >= 40);
  const animal = world.population.actors.find(a => a.kind === 'deer');
  animal.body.dispatchEvent({ type: 'collide', contact: { getImpactVelocityAlongNormal: () => 8 } });
  assert.ok(animal.knocked > 0);
});

test('portals route highway to island and island exit specifically to garage, with cooldown', () => {
  const { ctx, world } = setup();
  const visits = [];
  ctx.onPortal = destination => visits.push(destination);
  const v = { body: { position: new CANNON.Vec3(206, 1, -1190) } };
  world.frontier.update(0.01, v); world.frontier.update(0.01, v);
  assert.deepEqual(visits, ['island']);
  world.frontier.cooldown = 0; v.body.position.set(1800, 1, 190);
  world.frontier.update(0.01, v);
  assert.deepEqual(visits, ['island', 'garage']);
  assert.equal(world.frontier.contains(v.body.position), true);
  world.frontier.cooldown = 0; v.body.position.set(234, 1, -1190);
  world.frontier.update(0.01, v);
  assert.equal(visits.at(-1), 'work-island');
  world.frontier.cooldown = 0; v.body.position.set(2600, 1, 190);
  world.frontier.update(0.01, v);
  assert.equal(visits.at(-1), 'garage');
  assert.equal(world.frontier.contains(v.body.position), true);
});

test('ground overlays have distinct depth layers and do not mutate shared materials', () => {
  const { ctx, world } = setup();
  const grass = world.overlayMaterial(world.mats.grass, 1), road = world.overlayMaterial(world.mats.grass, 3);
  assert.notEqual(grass, road);
  assert.ok(grass.polygonOffset && road.polygonOffsetUnits < grass.polygonOffsetUnits);
  assert.equal(world.mats.grass.polygonOffset, false);
  const mark = createBox(ctx, { size: [2, 0.04, 2], pos: [0, 0.04, 0], material: world.mats.cream });
  assert.ok(mark.mesh.material.polygonOffset);
  assert.notEqual(mark.mesh.material, world.mats.cream);
});

test('real ramp flight reaches over fifteen metres and completes a requested stunt before landing', () => {
  const { ctx, world } = setup();
  createBox(ctx, { size: [180, 2, 500], pos: [0, -1, 40], material: world.mats.road });
  Arena.prototype.buildRamp.call({ ctx }, 0, 0, 20, 16, 20, world.mats.dirt);
  const v = new Vehicle(ctx);
  v.reset({ pos: [0, 1.6, -35], yaw: 0 }); v.body.velocity.set(0, 0, 23);
  let highest = 0, requested = false, landed = '';
  ctx.onTrick = label => { landed = label; };
  for (let i = 0; i < 1000 && !landed; i++) {
    v.update(1 / 60, { throttle: v.speedKmh < 100 ? 0.5 : 0, steer: 0, brake: 0, handbrake: false });
    if (v.flight.peak > 2 && !requested) { v.flight.requestStunt(); requested = true; }
    ctx.world.step(1 / 60);
    highest = Math.max(highest, v.body.position.y);
  }
  assert.ok(highest > 15, `height: ${highest}`);
  assert.ok(requested && landed.includes('连特技'), `landing: ${landed}`);
  v.dispose();
});

test('both interchange approaches can be driven up onto the elevated bridge', () => {
  const { ctx } = setup();
  let blocked = false;
  ctx.world.raycastAll(new CANNON.Vec3(240, 0.8, -700), new CANNON.Vec3(265, 0.8, -706), {}, result => {
    if (result.body.type === CANNON.Body.STATIC) blocked = true;
  });
  assert.equal(blocked, false, 'right fork entrance must not be blocked by guardrails');
  const v = new Vehicle(ctx);
  for (const [x, yaw, target, sign] of [[-110, 90, 100, 1], [470, -90, 270, -1]]) {
    v.reset({ pos: [x, 1.6, -900], yaw });
    let highest = 0;
    for (let i = 0; i < 1800 && (sign > 0 ? v.body.position.x < target : v.body.position.x > target); i++) {
      v.update(1 / 60, { throttle: v.speedKmh < 60 ? 0.5 : 0, brake: 0, steer: 0, handbrake: false });
      ctx.world.step(1 / 60); highest = Math.max(highest, v.body.position.y);
    }
    assert.ok(highest > 12, `bridge height: ${highest}`);
    assert.ok(sign > 0 ? v.body.position.x >= target : v.body.position.x <= target);
  }
  v.dispose();
});
