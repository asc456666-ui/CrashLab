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
  await page.waitForTimeout(2500);

  logs.push('[platform bodies] ' + JSON.stringify(await page.evaluate(() => {
    const w = window.CrashLab.world;
    return w.bodies
      .filter((b) => b.position.y > 5)
      .map((b) => ({
        y: +b.position.y.toFixed(2),
        x: +b.position.x.toFixed(1),
        z: +b.position.z.toFixed(1),
        mass: b.mass,
        shapes: b.shapes.length,
        shape: b.shapes[0] ? b.shapes[0].type : -1,
        he: b.shapes[0] && b.shapes[0].halfExtents ? [b.shapes[0].halfExtents.x, b.shapes[0].halfExtents.y, b.shapes[0].halfExtents.z] : null,
        aabbY: [+b.aabb.lowerBound.y.toFixed(2), +b.aabb.upperBound.y.toFixed(2)],
        aabbZ: [+b.aabb.lowerBound.z.toFixed(1), +b.aabb.upperBound.z.toFixed(1)]
      }))
      .slice(0, 12);
  })));

  logs.push('[manual ray] ' + JSON.stringify(await page.evaluate(() => {
    const w = window.CrashLab.world;
    const v = window.CrashLab.vehicle;
    const Vec3 = w.bodies[0].position.constructor;
    const RR = v.vehicle.wheelInfos[0].raycastResult.constructor;

    const out = [];
    for (const y of [32, 31.5, 30.89, 30.7]) {
      const from = new Vec3(0, y, -112);
      const to = new Vec3(0, y - 0.82, -112);
      const res = new RR();
      w.rayTest(from, to, res);
      out.push({ from: y, hasHit: res.hasHit, dist: +res.distance.toFixed(3), hitY: +res.hitPointWorld.y.toFixed(3) });
    }
    return out;
  })));

  logs.push('[wheel ray sources] ' + JSON.stringify(await page.evaluate(() => {
    const v = window.CrashLab.vehicle;
    return v.vehicle.wheelInfos.map((w) => {
      const cp = w.chassisConnectionPointWorld;
      const dw = w.directionWorld;
      return {
        cp: [+cp.x.toFixed(2), +cp.y.toFixed(3), +cp.z.toFixed(1)],
        dir: [+dw.x.toFixed(2), +dw.y.toFixed(2), +dw.z.toFixed(2)],
        restLen: w.suspensionRestLength,
        radius: w.radius,
        contact: !!(w.raycastResult && w.raycastResult.body)
      };
    });
  })));

  logs.push('[car] ' + JSON.stringify(await page.evaluate(() => {
    const v = window.CrashLab.vehicle;
    return {
      y: +v.body.position.y.toFixed(3),
      bottom: +(v.body.position.y + v.spec.offsetY - v.spec.halfExtents[1]).toFixed(3),
      spec: { offsetY: v.spec.offsetY, heY: v.spec.halfExtents[1], radius: v.spec.wheelRadius, connY: v.spec.connectionY, rest: v.spec.suspensionRestLength }
    };
  })));

  console.log(logs.join('\n'));
  await browser.close();
})().catch((e) => {
  console.log('FATAL ' + (e && e.stack ? e.stack : String(e)));
  process.exit(1);
});
