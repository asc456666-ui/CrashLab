/**
 * 波浪坡落体诊断。把车吊在指定坐标上方自由落体，看它停在哪，
 * 就能知道那个位置到底有没有坡。
 */
const { chromium } = require('playwright-core');

const CHROME = 'C:\\Users\\46971\\.agent-browser\\browsers\\chrome-153.0.8010.52\\chrome.exe';
const URL = 'http://127.0.0.1:8899/';

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

const where = () => {
  const v = window.CrashLab.vehicle;
  return {
    x: +v.body.position.x.toFixed(2),
    y: +v.body.position.y.toFixed(2),
    z: +v.body.position.z.toFixed(2)
  };
};

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  const lines = [];
  page.on('pageerror', (e) => lines.push('ERR ' + (e && e.message ? e.message : e)));

  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.CrashLab, null, { timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.click('[data-nav="play"]');
  await page.waitForTimeout(1500);

  // 先列出波浪区所有静态体的完整坐标
  lines.push('=== WAVE AREA STATIC BODIES ===');
  const bodies = await page.evaluate(() => {
    const g = window.CrashLab;
    const out = [];
    for (const b of g.world.bodies) {
      if (b.mass !== 0) continue;
      const p = b.position;
      // 只保留波浪区范围内的静态体
      if (p.z > -160 || p.z < -260) continue;
      if (p.x < -60 || p.x > 20) continue;
      const he = b.shapes[0].halfExtents;
      out.push({
        x: +p.x.toFixed(2),
        y: +p.y.toFixed(2),
        z: +p.z.toFixed(2),
        he: [+he.x.toFixed(2), +he.y.toFixed(2), +he.z.toFixed(2)]
      });
    }
    return out;
  });
  for (const b of bodies) lines.push(JSON.stringify(b));

  await page.evaluate(() => { window.CrashLab.setSpawn(6); window.CrashLab.spawnVehicle('normal'); });
  await page.waitForTimeout(1500);
  lines.push('=== SPAWN 6 POSITION ===');
  lines.push(JSON.stringify(await page.evaluate(where)));

  const spots = [
    { name: 'first-ramp-center', x: -20, z: -244 },
    { name: 'first-ramp-start', x: -20, z: -249 },
    { name: 'ramp-top', x: -20, z: -239 },
    { name: 'between-ramps', x: -20, z: -236 },
    { name: 'spawn-point', x: -20, z: -252 }
  ];

  for (const s of spots) {
    await page.evaluate(dropAt, { x: s.x, y0: 12, z: s.z });
    await page.waitForTimeout(2200);
    const w = await page.evaluate(where);
    lines.push(s.name + ' dropped at x' + s.x + ' z' + s.z + ' -> landed ' + JSON.stringify(w));
  }

  // 沿 z 轴扫一遍，找出每个 z 上的静止高度，用来还原地形剖面
  lines.push('=== PROFILE ALONG x=-20 ===');
  for (let z = -252; z <= -160; z += 4) {
    await page.evaluate(dropAt, { x: -20, y0: 9, z });
    await page.waitForTimeout(3000);
    const w = await page.evaluate(where);
    lines.push('z=' + z + ' y=' + w.y + ' x=' + w.x);
  }

  require('fs').writeFileSync('C:\\Users\\46971\\Desktop\\WB1\\_verify\\wave-diag.txt', lines.join('\n'), 'utf8');
  console.log('WROTE wave diag');
  await browser.close();
})().catch((e) => {
  require('fs').writeFileSync('C:\\Users\\46971\\Desktop\\WB1\\_verify\\wave-diag.txt', 'FATAL ' + (e && e.stack ? e.stack : e), 'utf8');
  process.exit(1);
});
