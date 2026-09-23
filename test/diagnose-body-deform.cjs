/**
 * 专项排查：车身变形车辆正面撞墙为什么没有产生车身变形。
 * 同时打印 bodyMesh 的变换关系，用来核对局部坐标与几何坐标是否错配。
 */
const { chromium } = require('playwright-core');

const CHROME = 'C:\\Users\\46971\\.agent-browser\\browsers\\chrome-153.0.8010.52\\chrome.exe';

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  page.on('pageerror', (e) => logs.push('[pageerror] ' + (e && e.message ? e.message : String(e))));

  await page.goto('http://localhost:5173', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.click('[data-nav="play"]');
  await page.waitForTimeout(1500);

  await page.evaluate(() => window.CrashLab.spawnVehicle('star'));
  await page.waitForTimeout(1500);

  logs.push('[mesh transform] ' + JSON.stringify(await page.evaluate(() => {
    const v = window.CrashLab.vehicle;
    const m = v.built.bodyMesh;
    const g = v.deformer.attr.array;
    let maxR = 0;
    for (let i = 0; i < g.length; i += 3) {
      const r = Math.sqrt(g[i] * g[i] + g[i + 1] * g[i + 1] + g[i + 2] * g[i + 2]);
      if (r > maxR) maxR = r;
    }
    return {
      meshPos: [m.position.x, m.position.y, m.position.z],
      meshScale: [m.scale.x, m.scale.y, m.scale.z],
      vertexCount: g.length / 3,
      maxVertexRadius: +maxR.toFixed(3),
      deformRadius: v.deformer.radius,
      deformStrength: v.deformer.strength,
      maxOffset: v.deformer.maxOffset
    };
  })));

  await page.evaluate(() => {
    const v = window.CrashLab.vehicle;
    window.CrashLab.resetVehicle();
    v.body.position.set(0, 0.6, 55);
    v.body.quaternion.setFromEuler(0, 0, 0);
    v.body.velocity.set(0, 0, 34);
    v.body.angularVelocity.set(0, 0, 0);
    v.body.wakeUp();
    v.syncVisual();
  });

  const start = Date.now();
  let hit = false;
  while (Date.now() - start < 8000) {
    const h = await page.evaluate(() => window.CrashLab.vehicle.vehicleHealth);
    if (h < 0.999) { hit = true; break; }
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(250);

  logs.push('[after impact] ' + JSON.stringify(await page.evaluate(() => {
    const v = window.CrashLab.vehicle;
    const st = v.deformer.deformStats();
    return {
      hit: true,
      lastImpactInfo: v.lastImpactInfo,
      centroid: st.centroid ? st.centroid.map((n) => +n.toFixed(2)) : null,
      maxOffset: +st.maxOffset.toFixed(3),
      deformedVerts: st.count,
      health: +v.vehicleHealth.toFixed(2)
    };
  })));
  logs.push('hit=' + hit);

  console.log(logs.join('\n'));
  await browser.close();
})().catch((e) => {
  console.log('FATAL ' + (e && e.stack ? e.stack : String(e)));
  process.exit(1);
});
