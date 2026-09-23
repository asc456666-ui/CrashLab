/**
 * 查车在山林里卡住时撞上了什么。
 * 让车一路开过去，卡住后把它周围五米内的刚体全列出来。
 */
const { chromium } = require('playwright-core');
const { serve } = require('./static-server.cjs');

const CHROME = 'C:\\Users\\46971\\.agent-browser\\browsers\\chrome-153.0.8010.52\\chrome.exe';
const DIST = 'C:\\Users\\46971\\Desktop\\WB1\\CrashLabWeb\\dist';
const OUT = 'C:\\Users\\46971\\Desktop\\WB1\\_verify\\forest-stuck.txt';

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

  await page.goto('http://127.0.0.1:8899/', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.CrashLab, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  for (const ch of '456321') { await page.click(`[data-pin="${ch}"]`); await page.waitForTimeout(60); }
  await page.waitForTimeout(500);
  await page.click('[data-nav="play"]');
  await page.waitForTimeout(1500);

  await page.evaluate(() => { window.CrashLab.setSpawn(10); window.CrashLab.spawnVehicle('normal'); });
  await page.waitForTimeout(1400);

  await page.keyboard.down('w');
  const run = [];
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(450);
    const s = await page.evaluate(() => {
      const v = window.CrashLab.vehicle;
      return {
        x: +v.body.position.x.toFixed(1),
        y: +v.body.position.y.toFixed(2),
        z: +v.body.position.z.toFixed(1),
        speed: Math.round(v.speedKmh)
      };
    });
    run.push(s);
  }
  await page.keyboard.up('w');

  lines.push('=== DRIVING ===');
  for (const r of run) lines.push(`x=${r.x} y=${r.y} z=${r.z} speed=${r.speed}`);

  const last = run[run.length - 1];
  const near = await page.evaluate((pos) => {
    const g = window.CrashLab;
    const out = [];
    for (const b of g.world.bodies) {
      if (b === g.vehicle.body) continue;
      const dx = b.position.x - pos.x;
      const dy = b.position.y - pos.y;
      const dz = b.position.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 6) continue;
      const he = b.shapes[0].halfExtents;
      out.push({
        mass: b.mass,
        dist: +dist.toFixed(1),
        dx: +dx.toFixed(1),
        dy: +dy.toFixed(1),
        dz: +dz.toFixed(1),
        pos: [+b.position.x.toFixed(1), +b.position.y.toFixed(1), +b.position.z.toFixed(1)],
        he: he ? [+he.x.toFixed(1), +he.y.toFixed(1), +he.z.toFixed(1)] : 'no-box'
      });
    }
    return out;
  }, last);

  lines.push('=== STOPPED AT x=' + last.x + ' z=' + last.z + ' y=' + last.y + ' ===');
  lines.push('nearby bodies within 6m: ' + near.length);
  for (const n of near) {
    lines.push(`mass=${n.mass} dist=${n.dist} offset=[${n.dx},${n.dy},${n.dz}] pos=[${n.pos}] halfExtents=[${n.he}]`);
  }

  require('fs').writeFileSync(OUT, lines.join('\n'), 'utf8');
  console.log('WROTE stuck');
  await browser.close();
  server.close();
})().catch((e) => {
  require('fs').writeFileSync(OUT, 'FATAL ' + (e && e.stack ? e.stack : e), 'utf8');
  console.log('FATAL ' + (e && e.stack ? e.stack : String(e)));
  process.exit(1);
});
