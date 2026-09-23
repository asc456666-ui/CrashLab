/**
 * 第八轮六项反馈的验证。
 * 翻滚抑制、飞坡后不立即翻滚、六车通过性、开炮键位置、炮击一切目标、行人车流走动。
 */
const { chromium } = require('playwright-core');

const CHROME = 'C:\\Users\\46971\\.agent-browser\\browsers\\chrome-153.0.8010.52\\chrome.exe';
const URL = 'http://127.0.0.1:8899/';
const OUT = 'C:\\Users\\46971\\Desktop\\WB1\\_verify\\round8.json';

const carState = () => {
  const g = window.CrashLab;
  const v = g.vehicle;
  if (!v) return null;
  const q = v.body.quaternion;
  const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
  return {
    type: v.spec.id,
    x: +v.body.position.x.toFixed(1),
    y: +v.body.position.y.toFixed(1),
    z: +v.body.position.z.toFixed(1),
    speed: Math.round(v.speedKmh),
    tilt: +(Math.acos(Math.max(-1, Math.min(1, upY))) * 180 / Math.PI).toFixed(1),
    airTime: +v.airTime.toFixed(2),
    airSpin: +v.airSpin.toFixed(2),
    airRoll: +v.airRoll.toFixed(2),
    grounded: v.vehicle.wheelInfos.filter((w) => w.raycastResult && w.raycastResult.body).length
  };
};

const movers = () => {
  const out = [];
  for (const m of window.CrashLab.arena.movers) {
    out.push({
      kind: m.kind,
      x: +m.body.position.x.toFixed(2),
      z: +m.body.position.z.toFixed(2),
      knocked: m.knocked,
      meshes: m.kind === 'ped' ? m.legs.length + 2 : 6
    });
  }
  return out;
};

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
  const report = { errors: [], steps: {} };
  const save = () => require('fs').writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
  const timer = setInterval(save, 1000);

  page.on('pageerror', (e) => report.errors.push(String(e && e.message ? e.message : e)));
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push(m.text()); });

  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.CrashLab, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  for (const ch of '456321') { await page.click(`[data-pin="${ch}"]`); await page.waitForTimeout(60); }
  await page.waitForTimeout(500);
  await page.click('[data-nav="play"]');
  await page.waitForTimeout(1500);

  // ---------- 1 直线与高速转向的翻滚抑制 ----------
  await page.evaluate(() => { window.CrashLab.setSpawn(0); window.CrashLab.spawnVehicle('normal'); });
  await page.waitForTimeout(1400);
  await page.keyboard.down('w');
  let straightMax = 0;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(500);
    const s = await page.evaluate(carState);
    if (s.tilt > straightMax) straightMax = s.tilt;
  }
  let turnMax = 0;
  await page.keyboard.down('d');
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(400);
    const s = await page.evaluate(carState);
    if (s.tilt > turnMax) turnMax = s.tilt;
  }
  await page.keyboard.up('d');
  await page.keyboard.up('w');
  report.steps.rollSuppression = { straightMaxTilt: straightMax, turnMaxTilt: turnMax };
  save();

  // ---------- 2 起跳后不立即翻滚 ----------
  await page.evaluate(() => { window.CrashLab.setSpawn(1); window.CrashLab.spawnVehicle('normal'); });
  await page.waitForTimeout(1400);
  const earlySpins = [];
  await page.keyboard.down('w');
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(180);
    const s = await page.evaluate(carState);
    if (s.airTime > 0 && s.airTime < 0.45) {
      earlySpins.push({ airTime: s.airTime, airSpin: s.airSpin, y: s.y });
    }
  }
  await page.keyboard.up('w');
  report.steps.earlySpin = {
    samplesInGraceWindow: earlySpins.length,
    maxSpinInWindow: earlySpins.reduce((a, b) => Math.max(a, Math.abs(b.airSpin)), 0)
  };
  save();

  // ---------- 3 六辆车冲跳台区 ----------
  report.steps.rampsAllCars = [];
  for (const type of ['normal', 'star', 'monster', 'bus', 'sport', 'tank']) {
    await page.evaluate((t) => { window.CrashLab.setSpawn(1); window.CrashLab.spawnVehicle(t); }, type);
    await page.waitForTimeout(1500);
    let maxY = 0;
    let minSpeed = 999;
    let startZ = null;
    await page.keyboard.down('w');
    for (let i = 0; i < 22; i++) {
      await page.waitForTimeout(400);
      const s = await page.evaluate(carState);
      if (startZ === null) startZ = s.z;
      if (s.y > maxY) maxY = s.y;
      if (i > 4 && s.speed < minSpeed) minSpeed = s.speed;
    }
    await page.keyboard.up('w');
    await page.waitForTimeout(800);
    const end = await page.evaluate(carState);
    report.steps.rampsAllCars.push({
      type,
      startZ,
      endZ: end.z,
      maxY: +maxY.toFixed(2),
      minSpeedDuring: minSpeed,
      passable: end.z > -22,
      flew: maxY > 2.0
    });
    save();
  }

  // ---------- 4 开炮键位置 ----------
  await page.evaluate(() => { window.CrashLab.setSpawn(0); window.CrashLab.spawnVehicle('tank'); });
  await page.waitForTimeout(1400);
  report.steps.fireButton = await page.evaluate(() => {
    const btn = document.getElementById('btnFire');
    const rect = btn.getBoundingClientRect();
    const inTools = !!btn.closest('#tools');
    const inActionPad = !!btn.closest('.pad-action');
    const padRect = document.querySelector('.pad-left').getBoundingClientRect();
    return {
      inTools,
      inActionPad,
      visible: !btn.classList.contains('hide'),
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      steerPadTop: Math.round(padRect.top),
      aboveSteerPad: rect.bottom <= padRect.top + 4,
      viewportH: window.innerHeight
    };
  });
  save();

  // ---------- 5 坦克炮击毁静态结构 ----------
  const staticBefore = await page.evaluate(() => window.CrashLab.ctx.staticMeshes.size);
  await page.evaluate(() => {
    const g = window.CrashLab;
    const v = g.vehicle;
    // 摆到高速跑道尽头的大墙前，墙高六米，正好在炮口射线上
    v.body.position.set(0, 2.0, 120);
    v.body.quaternion.setFromEuler(0, 0, 0);
    v.body.velocity.set(0, 0, 0);
    v.body.angularVelocity.set(0, 0, 0);
    v.body.wakeUp();
    v.syncVisual();
  });
  await page.waitForTimeout(1400);

  const destroyed = [];
  for (let i = 0; i < 3; i++) {
    const before = await page.evaluate(() => window.CrashLab.ctx.staticMeshes.size);
    await page.evaluate(() => window.CrashLab.fireCannon());
    await page.waitForTimeout(1700);
    const after = await page.evaluate(() => window.CrashLab.ctx.staticMeshes.size);
    destroyed.push({ shot: i + 1, staticBefore: before, staticAfter: after, removed: before - after });
  }
  report.steps.cannonDestruction = {
    staticBefore,
    shots: destroyed,
    debrisCount: await page.evaluate(() => window.CrashLab.vehicle.debris.items.length)
  };
  save();

  // 再打一棵树，验证动态目标也能打飞
  await page.evaluate(() => {
    const g = window.CrashLab;
    const v = g.vehicle;
    v.body.position.set(-120, 2.0, -20);
    v.body.quaternion.setFromEuler(0, 0, 0);
    v.body.velocity.set(0, 0, 0);
    v.body.wakeUp();
    v.syncVisual();
  });
  await page.waitForTimeout(1400);
  const treeBefore = await page.evaluate(() => {
    const out = [];
    for (const b of window.CrashLab.world.bodies) {
      if (b.mass !== 42) continue;
      if (b.position.z < -60 || b.position.z > 10) continue;
      out.push({ z: +b.position.z.toFixed(1) });
    }
    return out.length;
  });
  await page.evaluate(() => window.CrashLab.fireCannon());
  await page.waitForTimeout(1800);
  report.steps.cannonVsTree = await page.evaluate((n) => {
    let moved = 0;
    for (const b of window.CrashLab.world.bodies) {
      if (b.mass !== 42) continue;
      const sp = Math.hypot(b.velocity.x, b.velocity.y, b.velocity.z);
      if (sp > 1) moved++;
    }
    return { treesNearStart: n, treesInMotion: moved };
  }, treeBefore);
  save();

  // ---------- 6 行人车流走动 ----------
  const moversA = await page.evaluate(movers);
  await page.waitForTimeout(3000);
  const moversB = await page.evaluate(movers);

  const moved = [];
  for (let i = 0; i < Math.min(moversA.length, moversB.length); i++) {
    const a = moversA[i];
    const b = moversB[i];
    moved.push({
      kind: a.kind,
      moved: +Math.hypot(b.x - a.x, b.z - a.z).toFixed(2),
      knocked: b.knocked,
      meshes: a.meshes
    });
  }
  report.steps.movers = {
    total: moversA.length,
    cars: moved.filter((m) => m.kind === 'car'),
    peds: moved.filter((m) => m.kind === 'ped')
  };
  save();

  report.steps.perf = await page.evaluate(() => ({
    totalBodies: window.CrashLab.world.bodies.length,
    dynamicBodies: window.CrashLab.ctx.dynamics.length,
    renderCalls: window.CrashLab.renderer.info.render.calls,
    tris: window.CrashLab.renderer.info.render.triangles,
    fps: window.CrashLab.fpsValue
  }));
  save();

  clearInterval(timer);
  save();
  console.log('WROTE ' + OUT);
  await browser.close();
})().catch((e) => {
  require('fs').writeFileSync(OUT.replace('round8.json', 'fatal8.txt'), e && e.stack ? e.stack : String(e), 'utf8');
  console.log('FATAL ' + (e && e.stack ? e.stack : String(e)));
  process.exit(1);
});
