/**
 * 第八轮八项需求的客观验证。
 * 车损与动力解耦、极速、飞坡通过性、空中特技、视角跟随、新场地、车损速率、起火爆炸。
 */
const { chromium } = require('playwright-core');

const CHROME = 'C:\\Users\\46971\\.agent-browser\\browsers\\chrome-153.0.8010.52\\chrome.exe';
const URL = 'http://127.0.0.1:8899/';
const OUT = 'C:\\Users\\46971\\Desktop\\WB1\\_verify\\round5.json';

const carState = () => {
  const g = window.CrashLab;
  const v = g.vehicle;
  if (!v) return null;
  const q = v.body.quaternion;
  const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
  const fwd = { x: 2 * (q.x * q.z + q.w * q.y), z: 1 - 2 * (q.x * q.x + q.y * q.y) };
  return {
    speed: Math.round(v.speedKmh),
    x: +v.body.position.x.toFixed(1),
    y: +v.body.position.y.toFixed(1),
    z: +v.body.position.z.toFixed(1),
    tiltDeg: +(Math.acos(Math.max(-1, Math.min(1, upY))) * 180 / Math.PI).toFixed(1),
    health: +v.vehicleHealth.toFixed(2),
    engine: +v.engineHealth.toFixed(2),
    exploded: v.exploded,
    wrecked: v.wrecked,
    burning: v.burning,
    partsLeft: v.liveParts.length,
    wheelsOff: v.wheelDetached.filter(Boolean).length,
    inWater: v.inWater,
    yaw: +Math.atan2(fwd.x, fwd.z).toFixed(3),
    camYaw: +window.CrashLab.cameraRig.camYaw.toFixed(3),
    airSpin: +v.airSpin.toFixed(2),
    airRoll: +v.airRoll.toFixed(2),
    score: window.CrashLab.score
  };
};

const yawDelta = () => {
  const g = window.CrashLab;
  const v = g.vehicle;
  const q = v.body.quaternion;
  const fx = 2 * (q.x * q.z + q.w * q.y);
  const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
  const yaw = Math.atan2(fx, fz);
  let d = yaw - g.cameraRig.camYaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return +Math.abs(d).toFixed(3);
};

const launch = (cfg) => {
  const v = window.CrashLab.vehicle;
  const q = v.body.quaternion;
  const fx = 2 * (q.x * q.z + q.w * q.y);
  const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
  const len = Math.hypot(fx, fz) || 1;
  v.body.position.y = 22;
  v.body.velocity.set((fx / len) * cfg.speed, cfg.up || 0, (fz / len) * cfg.speed);
  v.body.angularVelocity.set(0, 0, 0);
  v.body.wakeUp();
  v.syncVisual();
};

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });

  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  const report = { errors: [], topSpeed: [], damageDecouple: [], ramps: [], tricks: [], camera: [], water: [], explode: {}, content: {} };
  const save = () => require('fs').writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
  const timer = setInterval(save, 1000);

  page.on('pageerror', (e) => report.errors.push(String(e && e.message ? e.message : e)));
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push(m.text()); });

  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.CrashLab, null, { timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.click('[data-nav="play"]');
  await page.waitForTimeout(1500);

  // ---------- 极速 ----------
  await page.evaluate(() => { window.CrashLab.setSpawn(0); window.CrashLab.resetVehicle(); });
  await page.waitForTimeout(1200);
  await page.keyboard.down('w');
  let best = 0;
  let bestT = 0;
  for (let t = 2; t <= 26; t += 2) {
    await page.waitForTimeout(2000);
    const s = await page.evaluate(carState);
    report.topSpeed.push({ t, ...s });
    if (s.speed > best) { best = s.speed; bestT = t; }
    if (s.speed < 5 && t > 6) break;
  }
  await page.keyboard.up('w');
  report.bestSpeed = best;
  report.bestSpeedAt = bestT;
  save();

  // ---------- 车损不影响车速 ----------
  await page.evaluate(() => {
    window.CrashLab.setSpawn(0);
    window.CrashLab.resetVehicle();
    const v = window.CrashLab.vehicle;
    v.vehicleHealth = 0.15;
    v.engineHealth = 0.15;
  });
  await page.waitForTimeout(1000);
  await page.keyboard.down('w');
  let hurtBest = 0;
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(2000);
    const s = await page.evaluate(carState);
    if (s.speed > hurtBest) hurtBest = s.speed;
  }
  await page.keyboard.up('w');
  report.damageDecouple = { healthyTop: best, damagedTop: hurtBest };
  save();

  // ---------- 飞坡通过性 ----------
  for (const type of ['normal', 'star', 'monster', 'bus']) {
    await page.evaluate((t) => {
      window.CrashLab.setSpawn(1);
      window.CrashLab.spawnVehicle(t);
    }, type);
    await page.waitForTimeout(1500);

    const startZ = (await page.evaluate(carState)).z;
    await page.keyboard.down('w');
    await page.waitForTimeout(7000);
    await page.keyboard.up('w');
    await page.waitForTimeout(1200);
    const end = await page.evaluate(carState);

    report.ramps.push({
      type,
      startZ,
      endZ: end.z,
      passed: end.z > -22,
      endSpeed: end.speed,
      endTilt: end.tiltDeg,
      stuckAtWall: end.speed < 3 && end.z < -24
    });
    save();
  }

  // ---------- 空中特技 ----------
  for (const [label, key] of [['frontflip-throttle', 'w'], ['backflip-brake', 's']]) {
    await page.evaluate(() => {
      window.CrashLab.spawnVehicle('normal');
      window.CrashLab.score = 0;
    });
    await page.waitForTimeout(1200);
    await page.evaluate(launch, { speed: 24, up: 9 });
    await page.keyboard.down(key);
    // 累计转角要在空中读，落地瞬间会被结算清零
    let maxSpin = 0;
    let airSamples = 0;
    for (let i = 0; i < 9; i++) {
      await page.waitForTimeout(300);
      const mid = await page.evaluate(carState);
      if (mid.y > 1.5) airSamples++;
      if (mid.airSpin > maxSpin) maxSpin = mid.airSpin;
    }
    await page.keyboard.up(key);
    await page.waitForTimeout(1600);
    const s = await page.evaluate(carState);
    report.tricks.push({ label, maxSpin: +maxSpin.toFixed(2), airSamples, score: s.score, tilt: s.tiltDeg });
    save();
  }

  // 侧翻
  await page.evaluate(() => { window.CrashLab.spawnVehicle('normal'); window.CrashLab.score = 0; });
  await page.waitForTimeout(1200);
  await page.evaluate(launch, { speed: 18, up: 10 });
  await page.keyboard.down('a');
  let rollSpin = 0;
  for (let i = 0; i < 9; i++) {
    await page.waitForTimeout(300);
    const mid = await page.evaluate(carState);
    if (mid.airRoll > rollSpin) rollSpin = mid.airRoll;
  }
  await page.keyboard.up('a');
  await page.waitForTimeout(1600);
  const rollState = await page.evaluate(carState);
  report.tricks.push({ label: 'barrel-roll-steer', maxSpin: +rollSpin.toFixed(2), score: rollState.score, tilt: rollState.tiltDeg });
  save();

  // ---------- 视角跟随转向 ----------
  await page.evaluate(() => {
    window.CrashLab.setSpawn(0);
    window.CrashLab.spawnVehicle('normal');
  });
  await page.waitForTimeout(1200);
  await page.keyboard.down('w');
  await page.waitForTimeout(6000);
  await page.keyboard.down('d');
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(700);
    report.camera.push({ step: 'turn-right-' + i, delta: await page.evaluate(yawDelta), ...(await page.evaluate(carState)) });
  }
  await page.keyboard.up('d');
  await page.waitForTimeout(2500);
  report.camera.push({ step: 'settled', delta: await page.evaluate(yawDelta) });
  await page.keyboard.up('w');
  save();

  // ---------- 水池 ----------
  await page.evaluate(() => {
    window.CrashLab.setSpawn(8);
    window.CrashLab.spawnVehicle('normal');
  });
  await page.waitForTimeout(1500);
  await page.keyboard.down('w');
  const waterSamples = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(1200);
    waterSamples.push(await page.evaluate(carState));
  }
  await page.keyboard.up('w');
  report.water = waterSamples;
  save();

  // ---------- 起火与爆炸 ----------
  await page.evaluate(() => {
    window.CrashLab.setSpawn(3);
    window.CrashLab.spawnVehicle('normal');
  });
  await page.waitForTimeout(1200);

  await page.evaluate(() => { window.CrashLab.vehicle.vehicleHealth = 0.4; });
  await page.waitForTimeout(2500);
  report.explode.midDamage = await page.evaluate(carState);

  await page.evaluate(() => { window.CrashLab.vehicle.vehicleHealth = 0.05; });
  await page.waitForTimeout(2500);
  report.explode.lowDamage = await page.evaluate(carState);

  await page.evaluate(() => { window.CrashLab.vehicle.vehicleHealth = 0.0005; });
  await page.waitForTimeout(2500);
  report.explode.afterZero = await page.evaluate(carState);
  await page.waitForTimeout(2000);
  report.explode.afterZero2 = await page.evaluate(carState);
  save();

  // ---------- 内容统计 ----------
  report.content = await page.evaluate(() => {
    const g = window.CrashLab;
    const bodies = g.world.bodies;
    const dyn = g.ctx.dynamics;
    const inBox = (b, x0, x1, z0, z1) => b.position.x > x0 && b.position.x < x1 && b.position.z > z0 && b.position.z < z1;
    return {
      spawnPoints: g.arena.spawnPoints.length,
      waterZones: g.arena.waterZones.length,
      dynamicBodies: dyn.length,
      totalBodies: bodies.length,
      waveRamps: bodies.filter((b) => b.mass === 0 && inBox(b, -30, -10, -255, -175)).length,
      loopSegments: bodies.filter((b) => b.mass === 0 && inBox(b, 28, 52, -215, -165)).length,
      renderCalls: g.renderer.info.render.calls,
      tris: g.renderer.info.render.triangles,
      fps: g.fpsValue
    };
  });

  clearInterval(timer);
  save();
  console.log('WROTE ' + OUT);
  await browser.close();
})().catch((e) => {
  require('fs').writeFileSync(OUT.replace('round5.json', 'fatal5.txt'), e && e.stack ? e.stack : String(e), 'utf8');
  console.log('FATAL ' + (e && e.stack ? e.stack : String(e)));
  process.exit(1);
});
