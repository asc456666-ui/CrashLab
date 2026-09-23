/**
 * 碰撞复核：把车摆到指定位姿并给定速度撞向目标，然后检查凹陷落在车的哪一侧。
 * 判定依据是变形顶点的局部坐标质心，而不是肉眼看截图。
 */
const { chromium } = require('playwright-core');

const CHROME = 'C:\\Users\\46971\\.agent-browser\\browsers\\chrome-153.0.8010.52\\chrome.exe';

const setupCrash = (cfg) => {
  const g = window.CrashLab;
  const v = g.vehicle;

  g.resetVehicle();

  const yaw = (cfg.yawDeg * Math.PI) / 180;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);

  v.body.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);

  if (cfg.rollDeg) {
    v.body.quaternion.setFromEuler(0, yaw, (cfg.rollDeg * Math.PI) / 180);
  } else {
    v.body.quaternion.setFromEuler(0, yaw, 0);
  }

  const side = cfg.side || 0;
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);

  v.body.velocity.set(fx * cfg.speed + rx * side, cfg.vy || 0, fz * cfg.speed + rz * side);
  v.body.angularVelocity.set(0, 0, 0);
  v.body.wakeUp();
  v.syncVisual();
};

const readState = () => {
  const g = window.CrashLab;
  const v = g.vehicle;
  const st = v.deformer.deformStats();

  return {
    centroid: st.centroid ? st.centroid.map((n) => +n.toFixed(2)) : null,
    maxOffset: +st.maxOffset.toFixed(3),
    deformedVerts: st.count,
    health: +v.vehicleHealth.toFixed(2),
    engine: +v.engineHealth.toFixed(2),
    wheelsOff: v.wheelDetached.map((b, i) => (b ? i : -1)).filter((i) => i >= 0),
    partsLeft: v.liveParts.length,
    partNames: v.liveParts.map((p) => p.name),
    glassBroken: v.glassBroken,
    glassMeshCount: v.built.glassMeshes.length,
    firstImpact: v.impactLog[0] || null,
    impactCount: v.impactLog.length,
    y: +v.body.position.y.toFixed(1),
    z: +v.body.position.z.toFixed(1)
  };
};

const cases = [
  { name: '普通车 正面撞墙', vehicle: 'normal', yawDeg: 0, pos: [0, 0.6, 55], speed: 18, wait: 5000 },
  { name: '普通车 车尾撞墙', vehicle: 'normal', yawDeg: 180, pos: [0, 0.6, 55], speed: -34, wait: 5000 },
  { name: '普通车 侧面撞护栏', vehicle: 'normal', yawDeg: 0, pos: [54, 0.6, 0], speed: 0, side: 18, wait: 4500 },
  { name: '普通车 车顶落地', vehicle: 'normal', yawDeg: 0, rollDeg: 180, pos: [0, 14, -60], speed: 0, vy: -6, wait: 5000 },
  { name: '星星小车 正面撞墙', vehicle: 'star', yawDeg: 0, pos: [0, 0.6, 55], speed: 18, wait: 5000 },
  { name: '星星小车 车尾撞墙', vehicle: 'star', yawDeg: 180, pos: [0, 0.6, 55], speed: -34, wait: 5000 },
  { name: '星星小车 侧面撞护栏', vehicle: 'star', yawDeg: 0, pos: [54, 0.6, 0], speed: 0, side: 18, wait: 4500 },
  { name: '星星小车 车顶落地', vehicle: 'star', yawDeg: 0, rollDeg: 180, pos: [0, 14, -60], speed: 0, vy: -6, wait: 5000 }
];

async function waitFirstImpact(page, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const h = await page.evaluate(() => window.CrashLab.vehicle.vehicleHealth);
    if (h < 0.999) return true;
    await page.waitForTimeout(80);
  }
  return false;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  page.on('pageerror', (e) => logs.push('[pageerror] ' + (e && e.message ? e.message : String(e))));
  page.on('console', (m) => { if (m.type() === 'error') logs.push('[console.error] ' + m.text()); });

  await page.goto('http://localhost:5173', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.click('[data-nav="play"]');
  await page.waitForTimeout(1500);

  for (const c of cases) {
    await page.evaluate((t) => window.CrashLab.spawnVehicle(t), c.vehicle);
    await page.waitForTimeout(1200);

    await page.evaluate(setupCrash, c);

    // 在第一次撞击的瞬间取值，避免后续翻滚和二次碰撞污染变形分布
    const hit = await waitFirstImpact(page, c.wait);
    await page.waitForTimeout(200);
    const st = await page.evaluate(readState);
    st.hitDetected = hit;

    logs.push(c.name + ' ' + JSON.stringify(st));
  }

  console.log(logs.join('\n'));
  await browser.close();
})().catch((e) => {
  console.log('FATAL ' + (e && e.stack ? e.stack : String(e)));
  process.exit(1);
});
