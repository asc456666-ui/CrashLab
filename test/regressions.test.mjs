import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Vehicle } from '../src/vehicle/Vehicle.js';
import { DebrisField } from '../src/vehicle/Debris.js';
import { Game } from '../src/core/Game.js';
import { Platform } from '../src/core/Platform.js';
import { ParentalControl } from '../src/core/ParentalControl.js';
import { Arena } from '../src/world/Arena.js';
import { createBox } from '../src/physics/Helpers.js';

function context() {
  return { scene: new THREE.Scene(), world: new CANNON.World(), dynamics: [], staticMeshes: new Map(), shadows: false, intactGlassMaterial: () => new THREE.MeshBasicMaterial() };
}

function game() {
  const g = Object.create(Game.prototype);
  Object.assign(g, {
    paused: false, backgroundPaused: false, pinMode: null, state: 'playing', parental: new ParentalControl(),
    audio: { resume() {}, suspend() {}, updateEngine() {}, stopEngine() {} },
    vehicle: { update() {}, syncVisual() {} },
    input: { enabled: true, update() {}, release() {}, state: {} },
    time: { scale: 1 }, world: { step() {} }, ctx: { dynamics: [] }, arena: { updateMovers() {}, openWorld: { update() {}, population: { afterPhysics() {} } } },
    fx: { update() {} }, cameraRig: { update() {} },
    ui: { updateHUD() {}, setAirHint() {}, showPanel() {}, setPlaying() {}, hideBanner() {}, showMessage() {}, showPinPad() {}, hidePinPad() {}, hideAllPanels() {}, pinError() {}, resetPinInput() {}, worldMap: { update() {} } },
    updateSun() {}, checkFlipHint() {}, renderer: { render() {} },
    fpsTimer: 0, fpsFrames: 0, frameCount: 0, lastTime: 0, score: 0, bestScore: 0
  });
  return g;
}

test('repeated vehicle disposal removes physics callbacks', () => {
  const ctx = context();
  let staleUpdates = 0;
  for (let i = 0; i < 12; i++) {
    const v = new Vehicle(ctx);
    v.vehicle.updateVehicle = () => staleUpdates++;
    v.dispose();
  }
  ctx.world.step(1 / 60);
  assert.equal(staleUpdates, 0);
  assert.equal(ctx.world.bodies.length, 0);
  assert.equal(ctx.scene.children.length, 0);
});

test('disposing a vehicle frees owned rendering assets without disposing cached glass', () => {
  const v = new Vehicle(context());
  let geometryDisposed = 0, paintDisposed = 0, glassDisposed = 0;
  v.built.bodyMesh.geometry.addEventListener('dispose', () => geometryDisposed++);
  v.built.bodyMesh.material.addEventListener('dispose', () => paintDisposed++);
  const shared = v.built.glassMeshes[0].material;
  const listener = () => glassDisposed++;
  shared.addEventListener('dispose', listener);
  v.dispose();
  shared.removeEventListener('dispose', listener);
  assert.equal(geometryDisposed, 1);
  assert.equal(paintDisposed, 1);
  assert.equal(glassDisposed, 0);
});

test('debris clear and capacity eviction remove orphan meshes and release generated geometry', () => {
  const ctx = context();
  const d = new DebrisField(ctx, 1);
  let disposed = 0;
  const spawn = () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    mesh.userData.disposeOnRecycle = true;
    mesh.geometry.addEventListener('dispose', () => disposed++);
    d.spawn(mesh, [1, 1, 1], new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3());
    return mesh;
  };
  const first = spawn();
  const second = spawn();
  assert.equal(first.parent, null);
  d.clear();
  assert.equal(second.parent, null);
  assert.equal(disposed, 2);
  assert.equal(ctx.world.bodies.length, 0);
  assert.equal(ctx.dynamics.length, 0);
});

for (const explode of [false, true]) {
  test(`repair restores local part rotations after ${explode ? 'explosion' : 'collision'}`, () => {
    const v = new Vehicle(context());
    v.body.quaternion.setFromEuler(0.2, Math.PI / 2, 0.3);
    v.syncVisual();
    v.group.updateMatrixWorld(true);
    const originals = v.liveParts.map(p => ({ mesh: p.mesh, quat: p.mesh.quaternion.clone(), pos: p.mesh.position.clone() }));
    if (explode) v.blastParts();
    else v.tryDetachPart(v.group.localToWorld(v.liveParts[0].localPos.clone()), 100);
    assert.ok(v.debris.items.length > 0);
    v.reset({ pos: [0, 2, 0], yaw: 0 });
    for (const { mesh, quat, pos } of originals) {
      assert.ok(quat.angleTo(mesh.quaternion) < 1e-7);
      assert.ok(pos.distanceTo(mesh.position) < 1e-7);
      assert.equal(mesh.parent, v.group);
    }
    v.dispose();
  });
}

test('explicit scene reset restores shattered static structures without duplication', () => {
  const ctx = context();
  const v = new Vehicle(ctx, 'tank');
  const target = createBox(ctx, { size: [2, 2, 2], pos: [10, 1, 10] });
  const arena = { ctx, dynamicSpawns: [], staticSpawns: [{ ...target, parent: ctx.scene }], heavyBlock: null, resetHeavyBlock: Arena.prototype.resetHeavyBlock };
  assert.equal(v.shatterStatic(target.body, new THREE.Vector3(10, 1, 10)), true);
  v.dispose();
  Arena.prototype.resetObstacles.call(arena);
  Arena.prototype.resetObstacles.call(arena);
  assert.equal(ctx.world.bodies.filter(b => b === target.body).length, 1);
  assert.equal(target.mesh.parent, ctx.scene);
  assert.equal(ctx.staticMeshes.get(target.body), target.mesh);
  assert.equal(ctx.scene.children.length, 1);
});

test('switching vehicles preserves broken walls and moved props, resets only the drop hammer', () => {
  const ctx = context();
  const wall = createBox(ctx, { size: [2, 2, 2], pos: [10, 1, 10] });
  const brick = createBox(ctx, { size: [1, 1, 1], pos: [20, 0.5, 10], mass: 8 });
  const hammer = createBox(ctx, { size: [6, 6, 6], pos: [0, 17, 46], mass: 900 });
  const g = game();
  Object.assign(g, { ctx, vehicle: null, spawnIndex: 0 });
  g.parental.authorize();
  g.cameraRig.snapTo = () => {};
  g.fx.clear = () => {};
  g.ui.setFireVisible = () => {};
  g.arena = {
    ctx, heavyBlock: hammer,
    spawnPoints: [{ pos: [0, 2, 0], yaw: 0 }],
    staticSpawns: [{ ...wall, parent: ctx.scene }],
    dynamicSpawns: [{ body: brick.body, pos: brick.body.position.clone(), quat: brick.body.quaternion.clone() }],
    resetHeavyBlock: Arena.prototype.resetHeavyBlock,
    resetObstacles: Arena.prototype.resetObstacles
  };
  g.spawnVehicle('tank');
  g.vehicle.shatterStatic(wall.body, new THREE.Vector3(10, 1, 10));
  brick.body.position.x = 40;
  hammer.body.position.y = 3;
  g.spawnVehicle('normal');
  assert.equal(ctx.world.bodies.includes(wall.body), false);
  assert.equal(wall.mesh.parent, null);
  assert.equal(brick.body.position.x, 40);
  assert.equal(hammer.body.position.y, 17);
  assert.equal(hammer.body.sleepState, CANNON.Body.SLEEPING);
  g.vehicle.vehicleHealth = 0.5;
  g.resetBuildings();
  assert.equal(wall.mesh.parent, ctx.scene);
  assert.equal(brick.body.position.x, 20);
  assert.equal(g.vehicle.vehicleHealth, 0.5);
  g.vehicle.dispose();
});

test('foreground lifecycle cannot resume a parental lock', () => {
  const g = game();
  g.parental.authorize();
  g.parental.timedOut = true;
  g.pinMode = 'unlock';
  g.setPaused(true);
  g.setBackgroundPaused(true);
  g.setBackgroundPaused(false);
  assert.equal(g.paused, true);
  assert.equal(g.input.enabled, false);
  g.onPinSubmit('456321');
  assert.equal(g.paused, false);
  assert.equal(g.input.enabled, true);
});

test('unlock while backgrounded stays paused until foregrounded', () => {
  const g = game();
  g.setBackgroundPaused(true);
  g.setPaused(false);
  assert.equal(g.paused, true);
  g.setBackgroundPaused(false);
  assert.equal(g.paused, true);
  assert.equal(g.pinMode, 'resume');
  g.onPinSubmit('456321');
  assert.equal(g.paused, false);
});

test('low frame rate uses wall time for parental limit but clamps physics time', () => {
  globalThis.requestAnimationFrame = () => {};
  const g = game();
  let physicsSeconds = 0;
  g.vehicle.update = dt => physicsSeconds += dt;
  g.parental.authorize();
  for (let i = 1; i <= 600; i++) g.loop(i * 100);
  assert.ok(Math.abs(g.parental.usedSeconds - 60) < 1e-7);
  assert.ok(Math.abs(physicsSeconds - 30) < 1e-7);
});

test('every settings entry requires a fresh PIN, including after leaving settings', () => {
  const g = game();
  g.parental.authorize();
  const panels = [];
  g.ui.showPanel = name => panels.push(name);
  for (let i = 0; i < 2; i++) {
    g.onNav('settings');
    assert.equal(g.pinMode, 'settings');
    assert.equal(g.paused, true);
    assert.notEqual(panels.at(-1), 'settings');
    g.onPinSubmit('000000');
    assert.equal(g.settingsAuthorized, false);
    g.onPinSubmit('456321');
    assert.equal(g.settingsAuthorized, true);
    assert.equal(panels.at(-1), 'settings');
    g.onNav('menu');
  }
});

test('every background return revokes authorization and preserves used play time', () => {
  const g = game();
  g.parental.authorize(); g.parental.usedSeconds = 200;
  for (let i = 0; i < 3; i++) {
    g.setBackgroundPaused(true);
    assert.equal(g.parental.authorized, false);
    g.setBackgroundPaused(false);
    assert.equal(g.paused, true);
    g.onPinSubmit('000000');
    assert.equal(g.parental.authorized, false);
    g.onPinSubmit('456321');
    assert.equal(g.parental.authorized, true);
    assert.equal(g.parental.usedSeconds, 200);
  }
});

test('play cannot bypass a pending settings PIN', () => {
  const g = game();
  g.parental.authorize(); g.pinMode = 'settings'; g.state = 'menu';
  g.startGame();
  assert.equal(g.state, 'menu');
  assert.equal(g.pinMode, 'settings');
});

test('native quit invokes App.exitApp rather than closing a browser window', async () => {
  const original = { isNative: Platform.isNative, app: Platform.app, ready: Platform.ready };
  let exits = 0;
  try {
    Platform.isNative = true;
    Platform.app = null;
    Platform.ready = Promise.resolve({ App: { async exitApp() { exits++; } } });
    await Platform.quit(game());
    assert.equal(exits, 1);
  } finally { Object.assign(Platform, original); }
});

test('Android back closes the map before leaving the game', () => {
  const previous = Platform.game;
  let closed = false;
  try {
    Platform.game = { mapOpen: true, closeWorldMap() { closed = true; } };
    Platform.onBack();
    assert.equal(closed, true);
  } finally { Platform.game = previous; }
});

test('browser quit stops play, clears controls and explains how to close the tab', async () => {
  const original = { isNative: Platform.isNative, window: globalThis.window };
  const g = game();
  let released = false;
  let closed = false;
  let message = '';
  g.input.release = () => { released = true; };
  g.ui.showMessage = text => { message = text; };
  try {
    Platform.isNative = false;
    globalThis.window = { close() { closed = true; } };
    g.onNav('quit');
    assert.equal(g.state, 'menu');
    assert.equal(g.input.enabled, false);
    assert.equal(released, true);
    assert.equal(closed, true);
    assert.match(message, /关闭此标签页/);
  } finally { Platform.isNative = original.isNative; globalThis.window = original.window; }
});
