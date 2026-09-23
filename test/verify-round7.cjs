/**
 * 第七轮六项需求的验证。
 * 山林、城市、车库、两辆新车与坦克炮、起飞高度与横向特技、提示时长。
 */
const { chromium } = require('playwright-core');

const CHROME = 'C:\\Users\\46971\\.agent-browser\\browsers\\chrome-153.0.8010.52\\chrome.exe';
const URL = 'http://127.0.0.1:8899/';
const OUT = 'C:\\Users\\46971\\Desktop\\WB1\\_verify\\round7.json';

const carState = () => {
  const g = window.CrashLab;
  const v = g.vehicle;
  if (!v) return null;
  const p = v.group.position;
  return {
    type: v.spec.id,
    x: +p.x.toFixed(1),
    y: +p.y.toFixed(1),
    z: +p.z.toFixed(1),
    speed: Math.round(v.speedKmh),
    airSpin: +v.airSpin.toFixed(2),
    airRoll: +v.airRoll.toFixed(2),
    airTime: +v.airTime.toFixed(2),
    cannonCooldown: +v.cannonCooldown.toFixed(2),
    hasCannon: !!v.spec.hasCannon,
    hasFlame: !!v.spec.hasFlame,
    mass: v.spec.mass
  };
};

const sceneStats = () => {
  const g = window.CrashLab;
  const bodies = g.world.bodies;
  const inBox = (b, x0, x1, z0, z1) => b.position.x > x0 && b.position.x < x1 && b.position.z > z0 && b.position.z < z1;

  const trees = bodies.filter((b) => b.mass === 42 && inBox(b, -190, -50, -65, 185));
  const buildings = bodies.filter((b) => b.mass === 260 && inBox(b, -80, 80, 170, 290));
  const cityCars = bodies.filter((b) => b.mass === 220 && inBox(b, -80, 80, 170, 290));
  const peds = bodies.filter((b) => b.mass === 34 && inBox(b, -80, 80, 170, 290));
  const garage = bodies.filter((b) => b.mass === 0 && inBox(b, 18, 34, -262, -242));

  return {
    trees: trees.length,
    buildings: buildings.length,
    cityCars: cityCars.length,
    peds: peds.length,
    garageParts: garage.length,
    spawnPoints: g.arena.spawnPoints.length,
    totalBodies: bodies.length,
    dynamicBodies: g.ctx.dynamics.length,
    renderCalls: g.renderer.info.render.calls,
    tris: g.renderer.info.render.triangles,
    fps: g.fpsValue
  };
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

  // 过家长密码，然后必须点开始游戏，否则按键不生效
  for (const ch of '456321') { await page.click(`[data-pin="${ch}"]`); await page.waitForTimeout(60); }
  await page.waitForTimeout(600);
  await page.click('[data-nav="play"]');
  await page.waitForTimeout(1500);

  report.steps.scene = await page.evaluate(sceneStats);
  save();

  // ---------- 六辆车都能开 ----------
  report.steps.cars = [];
  for (const type of ['normal', 'sport', 'tank']) {
    await page.evaluate((t) => { window.CrashLab.setSpawn(0); window.CrashLab.spawnVehicle(t); }, type);
    await page.waitForTimeout(1400);
    const fireVisible = await page.evaluate(() => !document.getElementById('btnFire').classList.contains('hide'));
    await page.keyboard.down('w');
    await page.waitForTimeout(3500);
    await page.keyboard.up('w');
    const st = await page.evaluate(carState);
    report.steps.cars.push({ ...st, fireButtonVisible: fireVisible });
    save();
  }

  // ---------- 跑车尾焰 ----------
  await page.evaluate(() => { window.CrashLab.setSpawn(0); window.CrashLab.spawnVehicle('sport'); });
  await page.waitForTimeout(1400);
  await page.keyboard.down('w');
  await page.waitForTimeout(1500);
  const flameOn = await page.evaluate(() => window.CrashLab.fx.flamePool.active.length);
  await page.keyboard.up('w');
  await page.waitForTimeout(900);
  const flameOff = await page.evaluate(() => window.CrashLab.fx.flamePool.active.length);
  report.steps.exhaustFlame = { whileThrottle: flameOn, afterRelease: flameOff };
  save();

  // ---------- 坦克开炮打建筑 ----------
  await page.evaluate(() => {
    const g = window.CrashLab;
    g.setSpawn(11);
    g.spawnVehicle('tank');
  });
  await page.waitForTimeout(1500);

  // 把坦克摆到第一栋楼正前方
  await page.evaluate(() => {
    const g = window.CrashLab;
    const v = g.vehicle;
    v.body.position.set(-44, 2.0, 190);
    v.body.quaternion.setFromEuler(0, 0, 0);
    v.body.velocity.set(0, 0, 0);
    v.body.angularVelocity.set(0, 0, 0);
    v.body.wakeUp();
    v.syncVisual();
  });
  await page.waitForTimeout(1200);

  const before = await page.evaluate(() => {
    const g = window.CrashLab;
    const out = [];
    for (const b of g.world.bodies) {
      if (b.mass !== 260) continue;
      if (b.position.x < -60 || b.position.x > -28) continue;
      if (b.position.z < 180 || b.position.z > 215) continue;
      out.push({ x: +b.position.x.toFixed(2), y: +b.position.y.toFixed(2), z: +b.position.z.toFixed(2) });
    }
    return out;
  });

  await page.evaluate(() => window.CrashLab.fireCannon());
  await page.waitForTimeout(2000);

  const after = await page.evaluate(() => {
    const g = window.CrashLab;
    const out = [];
    for (const b of g.world.bodies) {
      if (b.mass !== 260) continue;
      if (b.position.x < -80 || b.position.x > -10) continue;
      if (b.position.z < 170 || b.position.z > 240) continue;
      out.push({ x: +b.position.x.toFixed(2), y: +b.position.y.toFixed(2), z: +b.position.z.toFixed(2) });
    }
    return out;
  });

  report.steps.tankShot = { before, after, score: await page.evaluate(() => window.CrashLab.score) };
  save();

  // ---------- 起飞高度 ----------
  await page.evaluate(() => { window.CrashLab.setSpawn(1); window.CrashLab.spawnVehicle('normal'); });
  await page.waitForTimeout(1400);
  let maxY = 0;
  await page.keyboard.down('w');
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(420);
    const s = await page.evaluate(carState);
    if (s.y > maxY) maxY = s.y;
  }
  await page.keyboard.up('w');
  report.steps.jumpHeightNormal = +maxY.toFixed(2);
  save();

  // ---------- 横向翻转 ----------
  await page.evaluate(() => { window.CrashLab.spawnVehicle('normal'); window.CrashLab.score = 0; });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const v = window.CrashLab.vehicle;
    v.body.position.y = 24;
    v.body.velocity.set(0, 0, 20);
    v.body.angularVelocity.set(0, 0, 0);
    v.body.wakeUp();
    v.syncVisual();
  });
  await page.keyboard.down('a');
  let maxRoll = 0;
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(300);
    const s = await page.evaluate(carState);
    if (Math.abs(s.airRoll) > maxRoll) maxRoll = Math.abs(s.airRoll);
  }
  await page.keyboard.up('a');
  await page.waitForTimeout(1600);
  report.steps.rollTrick = { maxRoll: +maxRoll.toFixed(2), score: await page.evaluate(() => window.CrashLab.score) };
  save();

  // ---------- 损毁提示 ----------
  await page.evaluate(() => { window.CrashLab.setSpawn(3); window.CrashLab.spawnVehicle('normal'); });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { window.CrashLab.vehicle.vehicleHealth = 0.01; });
  await page.waitForTimeout(2500);

  report.steps.destroyNotice = await page.evaluate(() => ({
    bannerOn: document.getElementById('banner').classList.contains('on'),
    bannerPulse: document.getElementById('banner').classList.contains('pulse'),
    bannerText: document.getElementById('banner').textContent,
    msgOn: document.getElementById('msgline').classList.contains('on'),
    msgText: document.getElementById('msgline').textContent,
    exploded: window.CrashLab.vehicle.exploded
  }));

  // 等三秒再看提示是否还在
  await page.waitForTimeout(3500);
  report.steps.destroyNoticeLater = await page.evaluate(() => ({
    bannerOn: document.getElementById('banner').classList.contains('on'),
    msgOn: document.getElementById('msgline').classList.contains('on')
  }));

  report.steps.sceneAfter = await page.evaluate(sceneStats);
  save();

  clearInterval(timer);
  save();
  console.log('WROTE ' + OUT);
  await browser.close();
})().catch((e) => {
  require('fs').writeFileSync(OUT.replace('round7.json', 'fatal7.txt'), e && e.stack ? e.stack : String(e), 'utf8');
  console.log('FATAL ' + (e && e.stack ? e.stack : String(e)));
  process.exit(1);
});
