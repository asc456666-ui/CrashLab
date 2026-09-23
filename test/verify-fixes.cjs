/**
 * 六项问题的修复验证。
 * 全部用客观数值判定：车身倾角、相机高度、轮胎血量、姿态上方向、音频增益。
 */
const { chromium } = require('playwright-core');

const CHROME = 'C:\\Users\\46971\\.agent-browser\\browsers\\chrome-153.0.8010.52\\chrome.exe';
const URL = 'http://127.0.0.1:8899/';
const OUT = 'C:\\Users\\46971\\Desktop\\WB1\\_verify\\fixes.json';

const tiltInfo = () => {
  const v = window.CrashLab.vehicle;
  if (!v) return null;
  const q = v.body.quaternion;
  const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
  return {
    tiltDeg: +(Math.acos(Math.max(-1, Math.min(1, upY))) * 180 / Math.PI).toFixed(1),
    upY: +upY.toFixed(3),
    x: +v.body.position.x.toFixed(1),
    z: +v.body.position.z.toFixed(1),
    speed: Math.round(v.speedKmh),
    wheelsOff: v.wheelDetached.filter(Boolean).length,
    wheelHealth: v.wheelHealth.map((h) => +h.toFixed(2))
  };
};

const camInfo = () => {
  const g = window.CrashLab;
  const c = g.camera.position;
  const p = g.vehicle ? g.vehicle.group.position : { x: 0, y: 0, z: 0 };
  return {
    mode: g.cameraRig.mode,
    camX: +c.x.toFixed(1),
    camY: +c.y.toFixed(1),
    camZ: +c.z.toFixed(1),
    carY: +p.y.toFixed(1),
    dist: +Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z).toFixed(1),
    finite: Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.z)
  };
};

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });

  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  const report = { consoleErrors: [], pageErrors: [], straight: [], cameras: [], vehicles: [], wheels: [], flip: {}, audio: {}, content: {} };
  const save = () => require('fs').writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
  const timer = setInterval(save, 1000);

  page.on('pageerror', (e) => report.pageErrors.push(String(e && e.message ? e.message : e)));
  page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text()); });

  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.CrashLab, null, { timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.click('[data-nav="play"]');
  await page.waitForTimeout(1500);

  // ---------- 1. 平路直线行驶，看会不会自己翻 ----------
  await page.evaluate(() => { window.CrashLab.setSpawn(0); window.CrashLab.resetVehicle(); });
  await page.waitForTimeout(1200);
  report.straight.push({ t: 0, ...(await page.evaluate(tiltInfo)) });

  await page.keyboard.down('w');
  for (const t of [3, 6, 9, 12, 15]) {
    await page.waitForTimeout(3000);
    report.straight.push({ t, ...(await page.evaluate(tiltInfo)) });
  }
  await page.keyboard.up('w');
  await page.waitForTimeout(500);
  save();

  // ---------- 2. 视角切换 ----------
  await page.evaluate(() => { window.CrashLab.setSpawn(0); window.CrashLab.resetVehicle(); });
  await page.waitForTimeout(1000);
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.CrashLab.input.emit('camera'));
    await page.waitForTimeout(1300);
    report.cameras.push({ step: 'normal-' + i, ...(await page.evaluate(camInfo)) });
  }

  // 倒扣状态下测车头视角，之前会钻进地面
  await page.evaluate(() => {
    const v = window.CrashLab.vehicle;
    v.body.quaternion.setFromEuler(Math.PI, 0, 0);
    v.body.velocity.set(0, 0, 0);
    v.body.angularVelocity.set(0, 0, 0);
    v.body.position.y += 0.6;
    v.syncVisual();
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => window.CrashLab.cameraRig.setMode(3));
  await page.waitForTimeout(1400);
  report.cameras.push({ step: 'flipped-headcam', ...(await page.evaluate(camInfo)) });
  await page.evaluate(() => window.CrashLab.cameraRig.setMode(2));
  await page.waitForTimeout(1400);
  report.cameras.push({ step: 'flipped-free', ...(await page.evaluate(camInfo)) });
  await page.evaluate(() => window.CrashLab.cameraRig.setMode(0));
  save();

  // ---------- 6. 一键翻正 ----------
  await page.evaluate(() => {
    const v = window.CrashLab.vehicle;
    v.body.quaternion.setFromEuler(Math.PI * 0.85, 0.4, 0.2);
    v.body.velocity.set(0, 0, 0);
    v.body.angularVelocity.set(0, 2, 0);
    v.body.position.y += 0.5;
    v.syncVisual();
  });
  await page.waitForTimeout(700);
  report.flip.before = await page.evaluate(tiltInfo);
  await page.evaluate(() => window.CrashLab.flipVehicle());
  await page.waitForTimeout(1600);
  report.flip.after = await page.evaluate(tiltInfo);
  save();

  // ---------- 5. 轮胎：单次撞击不应掉，累积损伤后报废 ----------
  await page.evaluate(() => { window.CrashLab.setSpawn(0); window.CrashLab.resetVehicle(); });
  await page.waitForTimeout(1200);

  const ram = (speed) => {
    const v = window.CrashLab.vehicle;
    const q = v.body.quaternion;
    const fx = 2 * (q.x * q.z + q.w * q.y);
    const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
    const len = Math.hypot(fx, fz) || 1;
    v.body.velocity.set((fx / len) * speed, 0, (fz / len) * speed);
    v.body.wakeUp();
  };

  for (let i = 1; i <= 8; i++) {
    await page.evaluate(ram, 33);
    await page.waitForTimeout(3400);
    report.wheels.push({ hit: i, ...(await page.evaluate(tiltInfo)) });
    save();
  }

  // ---------- 3. 四辆车都能跑 ----------
  for (const type of ['normal', 'star', 'monster', 'bus']) {
    await page.evaluate((t) => window.CrashLab.spawnVehicle(t), type);
    await page.waitForTimeout(1600);
    await page.keyboard.down('w');
    await page.waitForTimeout(2600);
    await page.keyboard.up('w');
    const st = await page.evaluate(tiltInfo);
    const fps = await page.evaluate(() => window.CrashLab.fpsValue);
    const bodies = await page.evaluate(() => window.CrashLab.world.bodies.length);
    const calls = await page.evaluate(() => window.CrashLab.renderer.info.render.calls);
    const tris = await page.evaluate(() => window.CrashLab.renderer.info.render.triangles);
    report.vehicles.push({ type, fps, bodies, calls, tris, ...st });
    save();
  }

  // ---------- 4. 音量参数 ----------
  report.audio = await page.evaluate(() => {
    const a = window.CrashLab.audio;
    return {
      ready: a.ready,
      volume: a.volume,
      masterGain: a.master ? +a.master.gain.value.toFixed(3) : null,
      engineGain: a.engineGain ? +a.engineGain.gain.value.toFixed(3) : null,
      hasLimiter: !!a.limiter,
      limiterThreshold: a.limiter ? a.limiter.threshold.value : null
    };
  });

  // ---------- 内容统计 ----------
  report.content = await page.evaluate(() => {
    const g = window.CrashLab;
    const dyn = g.ctx.dynamics.map((d) => ({ m: d.body.mass, x: d.body.position.x, z: d.body.position.z, y: d.body.position.y }));
    const pins = dyn.filter((d) => d.x > -26 && d.x < -14 && d.z > 88 && d.z < 102 && d.m > 0 && d.m < 6);
    const bricks = dyn.filter((d) => d.x > 14 && d.x < 26 && d.z > 58 && d.z < 86 && d.m > 6 && d.m < 10);
    return {
      spawnPoints: g.arena.spawnPoints.length,
      vehicleTypes: Object.keys(g.constructor === Object ? {} : {}) && ['normal', 'star', 'monster', 'bus'],
      dynamicBodies: dyn.length,
      pins: pins.length,
      bricks: bricks.length,
      totalBodies: g.world.bodies.length
    };
  });

  clearInterval(timer);
  save();
  console.log('WROTE ' + OUT);
  await browser.close();
})().catch((e) => {
  require('fs').writeFileSync(OUT.replace('fixes.json', 'fatal.txt'), e && e.stack ? e.stack : String(e), 'utf8');
  console.log('FATAL ' + (e && e.stack ? e.stack : String(e)));
  process.exit(1);
});
