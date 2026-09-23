/**
 * 针对性复验：坠台能否冲下去并摔坏，落锤能否砸到车。
 * headless 下帧率低，物理时间比真实时间慢，所以等待时间给得比较宽松。
 */
const { chromium } = require('playwright-core');

const CHROME = 'C:\\Users\\46971\\.agent-browser\\browsers\\chrome-153.0.8010.52\\chrome.exe';
const OUT = 'C:\\Users\\46971\\Desktop\\WB1\\shots\\';

const snap = () => {
  const g = window.CrashLab;
  const v = g.vehicle;
  const p = v.body.position;
  const hb = g.arena.heavyBlock.body;
  return {
    car: {
      y: +p.y.toFixed(1),
      z: +p.z.toFixed(1),
      kmh: Math.round(v.speedKmh),
      health: +v.vehicleHealth.toFixed(2),
      parts: v.liveParts.length,
      wheels: v.wheelDetached.filter(Boolean).length
    },
    blockY: +hb.position.y.toFixed(1)
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
  page.on('pageerror', (e) => logs.push('[pageerror] ' + (e && e.message ? e.message : String(e))));
  page.on('console', (m) => { if (m.type() === 'error') logs.push('[console.error] ' + m.text()); });

  await page.goto('http://localhost:5173', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.click('[data-nav="play"]');
  await page.waitForTimeout(1200);

  // 坠台
  await page.evaluate(() => window.CrashLab.setSpawn(2));
  await page.waitForTimeout(2000);
  logs.push('[tower-idle] ' + JSON.stringify(await page.evaluate(snap)));
  await page.keyboard.down('w');
  await page.waitForTimeout(6000);
  await page.keyboard.up('w');
  logs.push('[tower-air] ' + JSON.stringify(await page.evaluate(snap)));
  await page.screenshot({ path: OUT + 'tower_fall.png' });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: OUT + 'tower_land.png' });
  logs.push('[tower-land] ' + JSON.stringify(await page.evaluate(snap)));

  // 落锤
  await page.evaluate(() => window.CrashLab.setSpawn(3));
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.CrashLab.arena.dropHeavyBlock());
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + 'heavy_falling.png' });
  logs.push('[heavy-1.5s] ' + JSON.stringify(await page.evaluate(snap)));
  await page.waitForTimeout(5000);
  await page.screenshot({ path: OUT + 'heavy_block.png' });
  logs.push('[heavy-6.5s] ' + JSON.stringify(await page.evaluate(snap)));

  console.log(logs.join('\n'));
  await browser.close();
})().catch((e) => {
  console.log('FATAL ' + (e && e.stack ? e.stack : String(e)));
  process.exit(1);
});
