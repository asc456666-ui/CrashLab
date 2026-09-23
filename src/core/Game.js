import * as THREE from 'three';
import * as CANNON from 'cannon-es';

import { Arena } from '../world/Arena.js';
import { Materials } from '../world/Materials.js';
import { syncDynamics } from '../physics/Helpers.js';
import { Vehicle } from '../vehicle/Vehicle.js';
import { CameraRig } from '../camera/CameraRig.js';
import { InputManager } from '../input/InputManager.js';
import { FXManager } from '../fx/FXManager.js';
import { AudioEngine } from '../fx/AudioEngine.js';
import { UI } from '../ui/UI.js';
import { Settings } from './Settings.js';
import { TimeControl } from './TimeControl.js';
import { Platform } from './Platform.js';
import { ParentalControl } from './ParentalControl.js';

/**
 * 游戏主类。装配渲染、物理、地图、车辆、摄像机、界面，并驱动主循环。
 */
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = 'menu';
    this.paused = false;
    this.spawnIndex = Settings.data.spawn;
    this.score = 0;
    this.bestScore = Settings.data.bestScore | 0;
    this.combo = 0;
    this.lastScoreMs = 0;
    this.lastBestSaveMs = 0;
    this.flipHintMs = 0;
    this.frameCount = 0;
    this.fpsValue = 0;
    this.fpsTimer = 0;
    this.fpsFrames = 0;
    this.lastTime = performance.now();

    this.initRenderer();
    this.initScene();
    this.initPhysics();

    this.ctx.shadows = Settings.quality.shadows;
    this.ctx.shadowSize = Settings.quality.shadowSize;

    this.arena = new Arena(this.ctx);

    this.fx = new FXManager(this.ctx);
    this.audio = new AudioEngine();
    this.ctx.fx = this.fx;
    this.ctx.audio = this.audio;

    this.cameraRig = new CameraRig(this.camera);
    this.ctx.cameraRig = this.cameraRig;
    this.camera.position.set(0, 6, -14);

    this.time = new TimeControl();
    this.input = new InputManager();
    this.bindInput();

    this.ui = new UI({
      onNav: (n) => this.onNav(n),
      onVehicle: (v) => this.onVehicle(v),
      onVolume: (v) => this.setVolume(v),
      onQuality: (q) => this.setQuality(q),
      onFps: (f) => Settings.set('fps', f),
      onSpawn: (s) => this.setSpawn(s),
      onLimit: (m) => this.onLimitChange(m)
    });

    this.parental = new ParentalControl();
    this.pinMode = null;
    this.pendingLimit = this.parental.limitMinutes;
    this.ui.syncLimitButtons(this.parental.limitMinutes);

    this.ctx.ui = this.ui;
    this.ctx.onImpact = (impact, otherBody) => this.registerImpact(impact, otherBody);
    this.ctx.onTrick = (label, score) => this.registerTrick(label, score);
    this.ctx.onExplode = () => this.onVehicleExploded();
    this.ctx.onCannonHit = (point, body) => this.registerCannonHit(body);

    this.bindDrag();
    window.addEventListener('resize', () => this.resize());
    this.resize();

    Platform.init(this);

    // 每次打开都要先过家长密码，通过后计时才开始
    this.requestGate();

    requestAnimationFrame((t) => this.loop(t));
  }

  initRenderer() {
    const q = Settings.quality;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: q.antialias,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 900);

    this.ctx = {
      scene: this.scene,
      world: null,
      dynamics: [],
      // 静态刚体到网格的映射，坦克炮打碎结构时要用
      staticMeshes: new Map(),
      shadows: Settings.quality.shadows,
      shadowSize: Settings.quality.shadowSize,
      vehicleMaterial: null,
      crackedGlassMaterial: () => Materials.glassCracked(),
      intactGlassMaterial: () => Materials.glass()
    };
  }

  initPhysics() {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.solver.iterations = 8;
    world.allowSleep = true;
    world.defaultContactMaterial.friction = 0.45;
    world.defaultContactMaterial.restitution = 0.12;

    const vehicleMat = new CANNON.Material('vehicle');
    const groundMat = new CANNON.Material('ground');

    world.addContactMaterial(new CANNON.ContactMaterial(vehicleMat, groundMat, {
      friction: 0.9,
      restitution: 0.08
    }));

    this.ctx.world = world;
    this.ctx.vehicleMaterial = vehicleMat;
    this.ctx.groundMaterial = groundMat;
    this.world = world;
  }

  bindInput() {
    this.input.on('camera', () => {
      const mode = this.cameraRig.cycle();
      this.ui.showMessage('视角：' + mode);
    });

    this.input.on('slowmo', () => {
      const s = this.time.cycle();
      this.ui.showMessage('速度：' + s + 'x');
    });

    this.input.on('reset', () => this.resetVehicle());
    this.input.on('flip', () => this.flipVehicle());
    this.input.on('fire', () => this.fireCannon());
    this.input.on('heavy', () => this.arena.dropHeavyBlock());
    this.input.on('menu', () => this.onNav('menu'));
  }

  bindDrag() {
    let dragging = false;
    let lastX = 0;

    this.canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      this.cameraRig.addDrag(e.clientX - lastX);
      lastX = e.clientX;
    });

    const stop = () => { dragging = false; };
    this.canvas.addEventListener('pointerup', stop);
    this.canvas.addEventListener('pointercancel', stop);
    this.canvas.addEventListener('pointerleave', stop);
  }

  onNav(nav) {
    switch (nav) {
      case 'play':
        this.startGame();
        break;
      case 'garage':
        this.ui.showPanel('garage');
        break;
      case 'settings':
        this.ui.showPanel('settings');
        break;
      case 'menu':
        this.state = 'menu';
        this.ui.showPanel('menu');
        this.ui.setPlaying(false);
        this.ui.hideBanner();
        this.input.enabled = false;
        this.audio.stopEngine();
        Settings.set('bestScore', this.bestScore);
        this.score = 0;
        break;
      case 'quit':
        this.state = 'menu';
        this.ui.showPanel('menu');
        this.ui.setPlaying(false);
        this.audio.stopEngine();
        window.close();
        break;
      default:
        break;
    }
  }

  onVehicle(id) {
    Settings.set('vehicle', id);
    if (this.state === 'playing') {
      this.spawnVehicle(id);
    }
  }

  startGame() {
    // 没通过家长密码就进不去
    if (!this.parental.authorized || this.parental.timedOut) {
      this.requestGate();
      return;
    }

    this.audio.start();
    this.state = 'playing';
    this.ui.hideAllPanels();
    this.ui.setPlaying(true);
    this.input.enabled = true;
    this.spawnVehicle(Settings.data.vehicle);
  }

  spawnVehicle(type) {
    if (this.vehicle) {
      this.vehicle.dispose();
      this.vehicle = null;
    }

    this.arena.resetObstacles();
    this.fx.clear();

    this.score = 0;
    this.combo = 0;
    this.lastScoreMs = 0;

    this.vehicle = new Vehicle(this.ctx, type);
    this.vehicle.onAutoReset = () => this.resetVehicle();
    this.resetVehicle();
    this.cameraRig.snapTo(this.vehicle);
    this.ui.setFireVisible(!!this.vehicle.spec.hasCannon);
    this.ui.hideBanner();
  }

  resetVehicle() {
    if (!this.vehicle) return;
    const spawn = this.arena.spawnPoints[this.spawnIndex] || this.arena.spawnPoints[0];
    this.vehicle.reset(spawn);
    this.cameraRig.snapTo(this.vehicle);
    this.fx.clear();
    this.ui.hideBanner();
    this.ui.showMessage('车辆已修复');
  }

  /**
   * 一键翻正。车翻过来以后不用重置整局，把姿态摆正、速度与血量都保留。
   */
  flipVehicle() {
    if (this.state !== 'playing' || !this.vehicle) return;
    this.vehicle.flipUpright();
    this.fx.clear();
    this.ui.showMessage('已翻正');
  }

  /**
   * 空中特技计分。腾空期间完成整圈翻转才算数，落地瞬间结算。
   */
  registerTrick(label, score) {
    this.score += score;
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      Settings.set('bestScore', this.bestScore);
    }
    this.ui.showBanner(label + '\n+' + score, 2400);
    this.cameraRig.shake(0.35);
  }

  onVehicleExploded() {
    this.ui.showBanner('车辆已报废\n请按重置键', 0);
    this.ui.pulseBanner(true);
    this.ui.showMessage('按重置键修好车辆继续玩', 6000);
  }

  /** 坦克开炮。打中建筑给高分，打中小车行人给少量分。 */
  fireCannon() {
    if (this.state !== 'playing' || this.paused || !this.vehicle) return;
    this.vehicle.fireCannon();
  }

  registerCannonHit(body) {
    if (!body || body.mass <= 0) return;

    if (body.mass >= 200) {
      this.score += 200;
      this.ui.showMessage('命中建筑 +200', 2200);
    } else {
      this.score += 60;
    }

    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      Settings.set('bestScore', this.bestScore);
    }
  }

  /**
   * 打开应用时的密码门。没有通过之前计时不会开始，也进不去游戏。
   */
  requestGate() {
    this.pinMode = 'gate';
    this.setPaused(true);
    this.ui.showPinPad({
      title: '家长验证',
      hint: '请输入六位密码，通过后开始游戏',
      onSubmit: (pin) => this.onPinSubmit(pin)
    });
  }

  /** 玩到设定时长自动锁屏 */
  onTimeUp() {
    this.pinMode = 'unlock';
    this.setPaused(true);
    this.ui.setPlaying(false);
    this.ui.showPinPad({
      title: '时间到了',
      hint: '本次游玩时间已用完，请家长输入密码解锁',
      onSubmit: (pin) => this.onPinSubmit(pin)
    });
  }

  /** 设置里改时长也要过密码，通过之后才生效 */
  onLimitChange(minutes) {
    if (minutes === this.parental.limitMinutes) return;

    this.pendingLimit = minutes;
    this.pinMode = 'limit';
    this.setPaused(true);
    this.ui.showPinPad({
      title: '家长验证',
      hint: '修改游玩时长需要输入密码',
      onSubmit: (pin) => this.onPinSubmit(pin)
    });
  }

  onPinSubmit(pin) {
    if (!this.parental.verify(pin)) {
      this.ui.pinError('密码不对，请再试一次');
      this.ui.resetPinInput();
      return;
    }

    const mode = this.pinMode;
    this.pinMode = null;
    this.ui.hidePinPad();

    if (mode === 'gate') {
      this.parental.authorize();
      this.setPaused(false);
      this.ui.showMessage('可以开始了');
      return;
    }

    if (mode === 'unlock') {
      this.parental.release();
      this.ui.setPlaying(true);
      this.setPaused(false);
      this.ui.showMessage('已解锁，计时重新开始');
      return;
    }

    if (mode === 'limit') {
      this.parental.setLimit(this.pendingLimit);
      this.ui.syncLimitButtons(this.pendingLimit);
      this.setPaused(false);
      this.ui.showMessage(this.pendingLimit ? '时长已设为 ' + this.pendingLimit + ' 分钟' : '已设为不限时');
    }
  }

  /**
   * 撞击计分。撞得越狠分越高，撞飞可推动的障碍额外加分，
   * 短时间连续撞击有连击加成，鼓励孩子连续冲撞。
   */
  registerImpact(impact, otherBody) {
    const now = performance.now();
    if (now - this.lastScoreMs < 220) return;

    if (now - this.lastScoreMs < 1600) this.combo = Math.min(this.combo + 1, 5);
    else this.combo = 1;
    this.lastScoreMs = now;

    const movable = otherBody && otherBody.mass > 0 && otherBody !== this.vehicle?.body;
    const base = Math.min(160, Math.round(impact * 1.4)) + (movable ? 30 : 0);
    this.score += Math.round(base * (1 + (this.combo - 1) * 0.25));

    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      // localStorage 写得别太勤，手机上会卡
      if (now - this.lastBestSaveMs > 1200) {
        this.lastBestSaveMs = now;
        Settings.set('bestScore', this.bestScore);
      }
    }
  }

  /**
   * 翻车提示。车翻过来又基本不动的时候提醒孩子按翻正键，
   * 提示过之后静默几秒，避免一直刷屏。
   */
  checkFlipHint(dt) {
    if (!this.vehicle || !this.vehicle.isFlipped) {
      this.flipHintMs = 0;
      return;
    }
    if (this.vehicle.speedKmh > 8) {
      this.flipHintMs = 0;
      return;
    }

    this.flipHintMs += dt * 1000;
    if (this.flipHintMs > 1500) {
      this.ui.showMessage('车翻了 · 按翻正键');
      this.flipHintMs = -3500;
    }
  }

  setSpawn(index) {
    this.spawnIndex = index;
    Settings.set('spawn', index);
    if (this.vehicle) this.resetVehicle();
  }

  setVolume(v) {
    Settings.set('volume', v);
    this.audio.setVolume(v);
  }

  /**
   * 切后台时暂停：停掉物理推进与音频，回前台再恢复，避免后台耗电和回来瞬间炸帧。
   */
  setPaused(on) {
    const next = !!on;
    if (this.paused === next) return;
    this.paused = next;

    if (this.paused) {
      this.audio.suspend();
      if (this.input) this.input.release?.();
    } else {
      this.audio.resume();
      this.lastTime = performance.now();
    }
  }

  setQuality(level) {
    Settings.set('quality', level);
    const q = Settings.quality;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.shadowMap.enabled = q.shadows;

    if (this.arena.sun) {
      this.arena.sun.castShadow = q.shadows;
      this.arena.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      if (this.arena.sun.shadow.map) {
        this.arena.sun.shadow.map.dispose();
        this.arena.sun.shadow.map = null;
      }
    }

    this.ui.showMessage('画质：' + q.name + '（部分效果重进后完全生效）');
  }

  /**
   * 让阳光与阴影相机跟着车走，保证任何区域都有阴影且精度够用。
   */
  updateSun() {
    const sun = this.arena.sun;
    if (!sun || !this.vehicle) return;

    const p = this.vehicle.group.position;
    sun.position.set(p.x + 55, p.y + 85, p.z + 38);
    sun.target.position.set(p.x, p.y, p.z);
    sun.target.updateMatrixWorld();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));

    const raw = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    this.fpsTimer += raw;
    this.fpsFrames++;
    if (this.fpsTimer >= 0.5) {
      this.fpsValue = Math.round(this.fpsFrames / this.fpsTimer);
      this.fpsTimer = 0;
      this.fpsFrames = 0;
    }

    // 家长设的时长按真实时间累计，慢动作不缩短
    if (this.state === 'playing' && !this.paused) {
      this.parental.tick(raw);
      if (this.parental.timedOut && !this.pinMode) this.onTimeUp();
    }

    if (this.state === 'playing' && this.vehicle && !this.paused) {
      const dt = raw * this.time.scale;

      this.input.update();
      this.vehicle.update(dt, this.input.state);
      this.world.step(1 / 60, dt, 4);
      this.vehicle.syncVisual();
      syncDynamics(this.ctx.dynamics);
      this.arena.updateMovers(dt);

      this.fx.update(dt);

      this.updateSun();
      this.cameraRig.update(raw, this.vehicle);

      this.audio.updateEngine(this.vehicle.speedKmh, this.input.state.throttle, this.vehicle.engineHealth > 0.01);
      this.ui.updateHUD(this.vehicle, this.time.scale, this.fpsValue, this.score, this.bestScore, this.parental.remainingSeconds);
      this.ui.setAirHint(this.vehicle.airTime > 0.35);
      this.checkFlipHint(raw);
    }

    this.frameCount++;
    const renderEvery = Settings.data.fps >= 60 ? 1 : 2;
    if (this.frameCount % renderEvery === 0) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
