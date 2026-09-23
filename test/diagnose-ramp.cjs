/**
 * 飞坡诊断。让普通车冲小坡，逐帧记录位置、速度、四轮接地与悬挂压缩，
 * 看是失去接地还是动力不足还是被几何挡住。
 */
const { chromium } = require('playwright-core');

const CHROME = 'C:\\Users\\46971\\.agent-browser\\browsers\\chrome-153.0.8010.52\\chrome.exe';
const URL = 'http://127.0.0.1:8899/';

const sample = () => {
  const g = window.CrashLab;
  const v = g.vehicle;
  const vh = v.vehicle;
  const wheels = [];
  for (let i = 0; i < 4; i++) {
    const w = vh.wheelInfos[i];
    const rr = w.raycastResult;
    wheels.push({
      i,
      grounded: !!(rr && rr.body),
      rayY: rr && rr.body ? +rr.hitPointWorld.y.toFixed(2) : null,
      susp: +w.suspensionLength.toFixed(3),
      skid: +(w.skidInfo || 0).toFixed ? +(w.skidInfo || 0).toFixed(2) : 0
    });
  }

  const q = v.body.quaternion;
  const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
  const fwd = { x: 2 * (q.x * q.z + q.w * q.y), z: 1 - 2 * (q.x * q.x + q.y * q.y) };

  return {
    t: +(performance.now() / 1000).toFixed(2),
    x: +v.body.position.x.toFixed(2),
    y: +v.body.position.y.toFixed(2),
    z: +v.body.position.z.toFixed(2),
    speed: Math.round(v.speedKmh),
    vy: +v.body.velocity.y.toFixed(2),
    tilt: +(Math.acos(Math.max(-1, Math.min(1, upY))) * 180 / Math.PI).toFixed(0),
    fwdZ: +fwd.z.toFixed(2),
    grounded: wheels.filter((w) => w.grounded).length,
    wheels
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

  // 先报一下场景里与跳台区相关的静态体，核对几何
  const geo = await page.evaluate(() => {
    const g = window.CrashLab;
    const out = [];
    for (const b of g.world.bodies) {
      if (b.mass !== 0) continue;
      const p = b.position;
      if (p.x > -52 && p.x < -24 && p.z > -50 && p.z < -14) {
        const sh = b.shapes[0];
        const he = sh.halfExtents;
        out.push({
          x: +p.x.toFixed(2),
          y: +p.y.toFixed(2),
          z: +p.z.toFixed(2),
          he: [+he.x.toFixed(2), +he.y.toFixed(2), +he.z.toFixed(2)]
        });
      }
    }
    return out;
  });
  lines.push('=== STATIC BODIES NEAR RAMPS ===');
  for (const o of geo) lines.push(JSON.stringify(o));

  await page.evaluate(() => { window.CrashLab.setSpawn(1); window.CrashLab.spawnVehicle('normal'); });
  await page.waitForTimeout(1500);
  lines.push('=== RUN normal ===');
  await page.keyboard.down('w');
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(400);
    const s = await page.evaluate(sample);
    lines.push(JSON.stringify(s));
    if (s.tilt > 60) break;
  }
  await page.keyboard.up('w');

  // 再测一次，这次把坡前留出更长助跑：从 z 负七十起步
  await page.evaluate(() => {
    const g = window.CrashLab;
    g.setSpawn(1);
    g.spawnVehicle('normal');
    const v = g.vehicle;
    v.body.position.set(-38, 1.6, -70);
    v.body.quaternion.setFromEuler(0, 0, 0);
    v.body.velocity.set(0, 0, 0);
    v.body.wakeUp();
    v.syncVisual();
  });
  await page.waitForTimeout(1200);
  lines.push('=== RUN normal from z=-70 ===');
  await page.keyboard.down('w');
  for (let i = 0; i < 22; i++) {
    await page.waitForTimeout(400);
    const s = await page.evaluate(sample);
    lines.push(JSON.stringify(s));
    if (s.tilt > 60 || s.z > -18) break;
  }
  await page.keyboard.up('w');

  require('fs').writeFileSync('C:\\Users\\46971\\Desktop\\WB1\\_verify\\ramp-diag.txt', lines.join('\n'), 'utf8');
  console.log('WROTE diag');
  await browser.close();
})().catch((e) => {
  require('fs').appendFileSync(
    'C:\\Users\\46971\\Desktop\\WB1\\_verify\\ramp-diag.txt',
    '\nFATAL ' + (e && e.stack ? e.stack : e),
    'utf8'
  );
  process.exit(1);
});
