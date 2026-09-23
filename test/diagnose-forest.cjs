/**
 * 山林地形诊断。沿两条线逐点把车吊到空中落下，读四个轮子的接地高度，
 * 还原出地形剖面，看是不是连续的丘陵缓坡而不是一个个尖坡。
 */
const { chromium } = require('playwright-core');
const { serve } = require('./static-server.cjs');

const CHROME = 'C:\\Users\\46971\\.agent-browser\\browsers\\chrome-153.0.8010.52\\chrome.exe';
const DIST = 'C:\\Users\\46971\\Desktop\\WB1\\CrashLabWeb\\dist';
const URL = 'http://127.0.0.1:8899/';
const OUT = 'C:\\Users\\46971\\Desktop\\WB1\\_verify\\forest-profile.txt';

const dropAt = (cfg) => {
  const g = window.CrashLab;
  const v = g.vehicle;
  v.body.position.set(cfg.x, cfg.y0, cfg.z);
  v.body.quaternion.setFromEuler(0, 0, 0);
  v.body.velocity.set(0, 0, 0);
  v.body.angularVelocity.set(0, 0, 0);
  v.body.wakeUp();
  v.syncVisual();
};

const groundY = () => {
  const v = window.CrashLab.vehicle;
  const hits = [];
  for (const w of v.vehicle.wheelInfos) {
    const rr = w.raycastResult;
    hits.push(rr && rr.body ? rr.hitPointWorld.y : null);
  }
  const valid = hits.filter((h) => h !== null);
  const wheelY = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  // 车体中心减去静态离地高度，作为备选读数
  const bodyY = v.body.position.y - v.spec.resetHeight;
  return {
    wheel: wheelY === null ? null : +wheelY.toFixed(2),
    body: +bodyY.toFixed(2),
    grounded: valid.length
  };
};

(async () => {
  const server = await serve(DIST, 8899);

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
  const lines = [];
  page.on('pageerror', (e) => lines.push('ERR ' + (e && e.message ? e.message : e)));

  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.CrashLab, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  for (const ch of '456321') { await page.click(`[data-pin="${ch}"]`); await page.waitForTimeout(60); }
  await page.waitForTimeout(500);
  await page.click('[data-nav="play"]');
  await page.waitForTimeout(1500);

  // 高程函数的理论值，用来和物理实测对照
  const theory = await page.evaluate(() => {
    const out = [];
    for (let z = -50; z <= 170; z += 10) {
      out.push({ z, h: +window.CrashLab.arena.forestHeightAt(0, z - 60).toFixed(2) });
    }
    return out;
  });
  lines.push('=== THEORY along local x=0 (world x=-120) ===');
  lines.push(theory.map((t) => `z=${t.z} h=${t.h}`).join('\n'));

  await page.evaluate(() => { window.CrashLab.setSpawn(10); window.CrashLab.spawnVehicle('normal'); });
  await page.waitForTimeout(1400);

  // 沿 z 方向的剖面
  lines.push('=== PHYSICS PROFILE along world x=-120 ===');
  const profZ = [];
  for (let z = -50; z <= 170; z += 12) {
    await page.evaluate(dropAt, { x: -120, y0: 6, z });
    await page.waitForTimeout(2100);
    const y = await page.evaluate(groundY);
    profZ.push({ z, y: y.wheel !== null ? y.wheel : y.body });
    lines.push(`z=${z} wheel=${y.wheel} bodyApprox=${y.body} grounded=${y.grounded}`);
  }

  // 沿 x 方向的剖面
  lines.push('=== PHYSICS PROFILE along world z=60 ===');
  const profX = [];
  for (let x = -180; x <= -60; x += 12) {
    await page.evaluate(dropAt, { x, y0: 6, z: 60 });
    await page.waitForTimeout(2100);
    const y = await page.evaluate(groundY);
    profX.push({ x, y: y.wheel !== null ? y.wheel : y.body });
    lines.push(`x=${x} wheel=${y.wheel} bodyApprox=${y.body} grounded=${y.grounded}`);
  }

  // 连续性检查：相邻采样点的高差
  const diffsZ = [];
  for (let i = 1; i < profZ.length; i++) {
    if (profZ[i].y === null || profZ[i - 1].y === null) continue;
    diffsZ.push(+(profZ[i].y - profZ[i - 1].y).toFixed(2));
  }
  const diffsX = [];
  for (let i = 1; i < profX.length; i++) {
    if (profX[i].y === null || profX[i - 1].y === null) continue;
    diffsX.push(+(profX[i].y - profX[i - 1].y).toFixed(2));
  }

  lines.push('=== CONTINUITY ===');
  lines.push('z-step drops (10m apart): ' + diffsZ.join(' '));
  lines.push('x-step drops (10m apart): ' + diffsX.join(' '));

  const validZ = profZ.filter((p) => p.y !== null).map((p) => p.y);
  const validX = profX.filter((p) => p.y !== null).map((p) => p.y);
  lines.push('z profile range: ' + (validZ.length ? Math.min(...validZ) + ' .. ' + Math.max(...validZ) : 'n/a'));
  lines.push('x profile range: ' + (validX.length ? Math.min(...validX) + ' .. ' + Math.max(...validX) : 'n/a'));
  lines.push('max absolute step (z): ' + (diffsZ.length ? Math.max(...diffsZ.map(Math.abs)) : 'n/a'));
  lines.push('max absolute step (x): ' + (diffsX.length ? Math.max(...diffsX.map(Math.abs)) : 'n/a'));

  // 在草地上跑一段，看能不能顺畅加速
  await page.evaluate(() => { window.CrashLab.setSpawn(10); window.CrashLab.spawnVehicle('normal'); });
  await page.waitForTimeout(1400);
  await page.keyboard.down('w');
  const run = [];
  for (let i = 0; i < 14; i++) {
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => {
      const v = window.CrashLab.vehicle;
      const q = v.body.quaternion;
      const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
      return {
        z: +v.body.position.z.toFixed(1),
        y: +v.body.position.y.toFixed(2),
        speed: Math.round(v.speedKmh),
        tilt: +(Math.acos(Math.max(-1, Math.min(1, upY))) * 180 / Math.PI).toFixed(0)
      };
    });
    run.push(s);
  }
  await page.keyboard.up('w');
  lines.push('=== DRIVING THROUGH FOREST ===');
  for (const r of run) lines.push(`z=${r.z} y=${r.y} speed=${r.speed} tilt=${r.tilt}`);

  require('fs').writeFileSync(OUT, lines.join('\n'), 'utf8');
  console.log('WROTE profile');
  await browser.close();
  server.close();
})().catch((e) => {
  require('fs').writeFileSync(OUT, 'FATAL ' + (e && e.stack ? e.stack : e), 'utf8');
  console.log('FATAL ' + (e && e.stack ? e.stack : String(e)));
  process.exit(1);
});
