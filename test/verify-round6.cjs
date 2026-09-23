/**
 * 第六轮四项反馈的验证。
 * 车损速率再减半、车损满触发爆炸并出大提示、坡道恢复高度、圆环内贴心相机。
 */
const { chromium } = require('playwright-core');

const CHROME = 'C:\\Users\\46971\\.agent-browser\\browsers\\chrome-153.0.8010.52\\chrome.exe';
const URL = 'http://127.0.0.1:8899/';
const OUT = 'C:\\Users\\46971\\Desktop\\WB1\\_verify\\round6.json';

const carState = () => {
  const g = window.CrashLab;
  const v = g.vehicle;
  if (!v) return null;
  const cam = g.camera.position;
  const p = v.group.position;
  return {
    x: +p.x.toFixed(1),
    y: +p.y.toFixed(1),
    z: +p.z.toFixed(1),
    speed: Math.round(v.speedKmh),
    health: +v.vehicleHealth.toFixed(4),
    damageShown: Math.round((1 - v.vehicleHealth) * 100),
    exploded: v.exploded,
    wrecked: v.wrecked,
    burning: v.burning,
    partsLeft: v.liveParts.length,
    inLoop: !!v.inLoop,
    camDist: +Math.hypot(cam.x - p.x, cam.y - p.y, cam.z - p.z).toFixed(2),
    camToLoopCenter: +Math.hypot(cam.x - 40, cam.y - 12, cam.z - 190).toFixed(2)
  };
};

const banner = () => {
  const el = document.getElementById('banner');
  return { on: el.classList.contains('on'), text: el.textContent };
};

const ram = (speed) => {
  const v = window.CrashLab.vehicle;
  const q = v.body.quaternion;
  const fx = 2 * (q.x * q.z + q.w * q.y);
  const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
  const len = Math.hypot(fx, fz) || 1;
  v.body.velocity.set((fx / len) * speed, 0, (fz / len) * speed);
  v.body.wakeUp();
};

const launchLoop = () => {
  const g = window.CrashLab;
  const v = g.vehicle;
  v.body.position.set(40, 1.6, -250);
  v.body.quaternion.setFromEuler(0, 0, 0);
  v.body.velocity.set(0, 0, 34);
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
  const report = { errors: [], damageRate: [], explode: {}, ramps: [], loop: [], banner: {} };
  const save = () => require('fs').writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
  const timer = setInterval(save, 1000);

  page.on('pageerror', (e) => report.errors.push(String(e && e.message ? e.message : e)));
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push(m.text()); });

  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.CrashLab, null, { timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.click('[data-nav="play"]');
  await page.waitForTimeout(1500);

  // ---------- 车损速率 ----------
  await page.evaluate(() => { window.CrashLab.setSpawn(0); window.CrashLab.spawnVehicle('normal'); });
  await page.waitForTimeout(1200);
  for (let i = 1; i <= 4; i++) {
    await page.evaluate(ram, 33);
    await page.waitForTimeout(3600);
    report.damageRate.push({ hit: i, ...(await page.evaluate(carState)) });
    save();
  }

  // ---------- 爆炸与提示 ----------
  await page.evaluate(() => { window.CrashLab.setSpawn(3); window.CrashLab.spawnVehicle('normal'); });
  await page.waitForTimeout(1200);

  // 显示已经到 100% 但血量还没到 0 的区间，看会不会爆
  await page.evaluate(() => { window.CrashLab.vehicle.vehicleHealth = 0.015; });
  await page.waitForTimeout(2500);
  report.explode.atShown100 = await page.evaluate(carState);
  report.banner.atShown100 = await page.evaluate(banner);
  save();

  await page.evaluate(() => { window.CrashLab.vehicle.vehicleHealth = 0.6; });
  await page.waitForTimeout(1500);
  report.explode.afterReset0 = await page.evaluate(carState);
  report.banner.afterReset0 = await page.evaluate(banner);
  save();

  // 真实路径：反复撞墙直到炸
  await page.evaluate(() => { window.CrashLab.setSpawn(0); window.CrashLab.resetVehicle(); });
  await page.waitForTimeout(1200);
  let explodedAt = -1;
  for (let i = 1; i <= 14; i++) {
    await page.evaluate(ram, 34);
    await page.waitForTimeout(3200);
    const s = await page.evaluate(carState);
    report.explode['hit' + i] = s;
    if (s.exploded) { explodedAt = i; break; }
  }
  report.explode.explodedAtHit = explodedAt;
  report.banner.afterExplode = await page.evaluate(banner);
  save();

  // 重置后提示要消失
  await page.evaluate(() => window.CrashLab.resetVehicle());
  await page.waitForTimeout(1200);
  report.banner.afterReset = await page.evaluate(banner);
  report.explode.afterReset = await page.evaluate(carState);
  save();

  // ---------- 坡道高度与通过性 ----------
  report.ramps.push(await page.evaluate(() => {
    const g = window.CrashLab;
    const out = { jumpRamps: [], waveRamps: [] };
    for (const b of g.world.bodies) {
      if (b.mass !== 0) continue;
      const p = b.position;
      const he = b.shapes[0].halfExtents;
      if (p.x > -52 && p.x < -24 && p.z > -46 && p.z < 40) {
        out.jumpRamps.push({ y: +p.y.toFixed(2), z: +p.z.toFixed(1), hy: +he.y.toFixed(2), hz: +he.z.toFixed(2) });
      }
      if (p.x > -30 && p.x < -10 && p.z > -256 && p.z < -160) {
        out.waveRamps.push({ y: +p.y.toFixed(2), z: +p.z.toFixed(1), hz: +he.z.toFixed(2) });
      }
    }
    return out;
  }));

  // 坡道通过性必须同时看两件事：车能不能开过去，以及有没有真的起飞。
  // 只看能不能开过去的话，坡被埋进地下也会判定通过。
  for (const type of ['normal', 'star', 'bus']) {
    await page.evaluate((t) => { window.CrashLab.setSpawn(1); window.CrashLab.spawnVehicle(t); }, type);
    await page.waitForTimeout(1400);

    let maxY = 0;
    let airborne = 0;
    await page.keyboard.down('w');
    for (let i = 0; i < 18; i++) {
      await page.waitForTimeout(450);
      const s = await page.evaluate(carState);
      if (s.y > maxY) maxY = s.y;
      if (s.y > 1.6) airborne++;
    }
    await page.keyboard.up('w');
    await page.waitForTimeout(1200);
    const s = await page.evaluate(carState);
    report.ramps.push({
      type,
      endZ: s.z,
      endSpeed: s.speed,
      maxY: +maxY.toFixed(2),
      airborneSamples: airborne,
      passed: s.z > -22,
      flew: maxY > 1.6
    });
    save();
  }

  // 波浪坡：密集采样看起伏
  await page.evaluate(() => { window.CrashLab.setSpawn(6); window.CrashLab.spawnVehicle('normal'); });
  await page.waitForTimeout(1400);
  await page.keyboard.down('w');
  const waveSamples = [];
  let waveMaxY = 0;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(260);
    const s = await page.evaluate(carState);
    waveSamples.push({ z: s.z, y: s.y, speed: s.speed });
    if (s.y > waveMaxY) waveMaxY = s.y;
  }
  await page.keyboard.up('w');
  report.ramps.push({ type: 'wave', maxY: +waveMaxY.toFixed(2), samples: waveSamples });

  // ---------- 圆环视角 ----------
  await page.evaluate(() => { window.CrashLab.spawnVehicle('normal'); window.CrashLab.setSpawn(7); });
  await page.waitForTimeout(1400);
  await page.evaluate(launchLoop);
  await page.keyboard.down('w');
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(400);
    report.loop.push(await page.evaluate(carState));
  }
  await page.keyboard.up('w');
  save();

  clearInterval(timer);
  save();
  console.log('WROTE ' + OUT);
  await browser.close();
})().catch((e) => {
  require('fs').writeFileSync(OUT.replace('round6.json', 'fatal6.txt'), e && e.stack ? e.stack : String(e), 'utf8');
  console.log('FATAL ' + (e && e.stack ? e.stack : String(e)));
  process.exit(1);
});
