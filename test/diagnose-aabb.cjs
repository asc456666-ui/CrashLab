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
  page.on('pageerror', (e) => logs.push('[pageerror] ' + (e.message || e)));

  await page.goto('http://localhost:5173', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.click('[data-nav="play"]');
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.CrashLab.setSpawn(2));
  await page.waitForTimeout(2200);

  logs.push('[before] ' + JSON.stringify(await page.evaluate(() => {
    const w = window.CrashLab.world;
    const v = window.CrashLab.vehicle;
    const plat = w.bodies.find((b) => Math.abs(b.position.y - 30) < 1 && b.mass === 0);
    const gnd = w.bodies.find((b) => b.position.y === -1);
    return {
      platAabb: [+plat.aabb.lowerBound.y.toFixed(2), +plat.aabb.upperBound.y.toFixed(2), +plat.aabb.lowerBound.z.toFixed(1), +plat.aabb.upperBound.z.toFixed(1)],
      platNeedsUpdate: plat.aabbNeedsUpdate,
      groundAabb: [+gnd.aabb.lowerBound.y.toFixed(1), +gnd.aabb.upperBound.y.toFixed(1), +gnd.aabb.lowerBound.z.toFixed(1), +gnd.aabb.upperBound.z.toFixed(1)],
      contact: v.vehicle.wheelInfos.map((x) => !!(x.raycastResult && x.raycastResult.body))
    };
  })));

  logs.push('[updateAABB all] ' + JSON.stringify(await page.evaluate(() => {
    const w = window.CrashLab.world;
    let n = 0;
    for (const b of w.bodies) { b.updateAABB(); n++; }
    const plat = w.bodies.find((b) => Math.abs(b.position.y - 30) < 1 && b.mass === 0);
    return {
      count: n,
      platAabb: [+plat.aabb.lowerBound.y.toFixed(2), +plat.aabb.upperBound.y.toFixed(2), +plat.aabb.lowerBound.z.toFixed(1), +plat.aabb.upperBound.z.toFixed(1)]
    };
  })));

  await page.waitForTimeout(1500);

  logs.push('[after 1.5s] ' + JSON.stringify(await page.evaluate(() => {
    const w = window.CrashLab.world;
    const v = window.CrashLab.vehicle;
    const plat = w.bodies.find((b) => Math.abs(b.position.y - 30) < 1 && b.mass === 0);
    return {
      platAabb: [+plat.aabb.lowerBound.y.toFixed(2), +plat.aabb.upperBound.y.toFixed(2), +plat.aabb.lowerBound.z.toFixed(1), +plat.aabb.upperBound.z.toFixed(1)],
      carY: +v.body.position.y.toFixed(3),
      contact: v.vehicle.wheelInfos.map((x) => !!(x.raycastResult && x.raycastResult.body)),
      len: v.vehicle.wheelInfos.map((x) => +x.suspensionLength.toFixed(3))
    };
  })));

  console.log(logs.join('\n'));
  await browser.close();
})().catch((e) => {
  console.log('FATAL ' + (e && e.stack ? e.stack : String(e)));
  process.exit(1);
});
