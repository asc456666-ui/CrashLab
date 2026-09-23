const { chromium } = require('playwright-core');

const CHROME = 'C:\\Users\\46971\\.agent-browser\\browsers\\chrome-153.0.8010.52\\chrome.exe';

const probe = () => {
  const g = window.CrashLab;
  const v = g.vehicle;
  return {
    state: g.state,
    inputEnabled: g.input.enabled,
    throttle: g.input.state.throttle,
    brake: g.input.state.brake,
    bodyY: +v.body.position.y.toFixed(3),
    vel: [+v.body.velocity.x.toFixed(2), +v.body.velocity.y.toFixed(2), +v.body.velocity.z.toFixed(2)],
    wheels: v.vehicle.wheelInfos.map((w) => ({
      contact: !!(w.raycastResult && w.raycastResult.body),
      len: +w.suspensionLength.toFixed(3),
      force: Math.round(w.suspensionForce),
      engine: Math.round(w.engineForce),
      brake: Math.round(w.brake)
    }))
  };
};

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
  await page.waitForTimeout(1500);

  logs.push('=== 跑道出生点 ===');
  await page.evaluate(() => window.CrashLab.setSpawn(0));
  await page.waitForTimeout(2000);
  logs.push('[idle] ' + JSON.stringify(await page.evaluate(probe)));
  await page.keyboard.down('w');
  await page.waitForTimeout(1500);
  logs.push('[gas] ' + JSON.stringify(await page.evaluate(probe)));
  await page.keyboard.up('w');

  logs.push('=== 坠台出生点 ===');
  await page.evaluate(() => window.CrashLab.setSpawn(2));
  await page.waitForTimeout(2500);
  logs.push('[idle] ' + JSON.stringify(await page.evaluate(probe)));
  await page.keyboard.down('w');
  await page.waitForTimeout(1500);
  logs.push('[gas] ' + JSON.stringify(await page.evaluate(probe)));
  await page.keyboard.up('w');

  logs.push('[spawn2] ' + JSON.stringify(await page.evaluate(() => window.CrashLab.arena.spawnPoints[2])));
  logs.push('[platform] ' + JSON.stringify(await page.evaluate(() => {
    const v = window.CrashLab.vehicle;
    return { carY: v.body.position.y, carBottom: v.body.position.y + v.spec.offsetY - v.spec.halfExtents[1] };
  })));

  console.log(logs.join('\n'));
  await browser.close();
})().catch((e) => {
  console.log('FATAL ' + (e && e.stack ? e.stack : String(e)));
  process.exit(1);
});
