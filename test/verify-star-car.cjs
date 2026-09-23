/**
 * 星星小车原创化后的验证：能选到、能生成、能开、能撞出凹陷、玻璃可破碎。
 */
const { chromium } = require('playwright-core');
const { serve } = require('./static-server.cjs');
const path = require('path');

const CHROME = 'C:\\Users\\46971\\.agent-browser\\browsers\\chrome-153.0.8010.52\\chrome.exe';
const URL = 'http://127.0.0.1:8899/';
const OUT = 'C:\\Users\\46971\\Desktop\\WB1\\_verify\\star-car.json';

const carState = () => {
  const g = window.CrashLab;
  const v = g.vehicle;
  if (!v) return null;
  return {
    type: v.spec.id,
    label: v.spec.label,
    x: +v.body.position.x.toFixed(1),
    y: +v.body.position.y.toFixed(1),
    z: +v.body.position.z.toFixed(1),
    speed: Math.round(v.speedKmh),
    parts: v.liveParts.length,
    glasses: v.built.glassMeshes.length,
    carDamagePct: Math.round((1 - v.vehicleHealth) * 100),
    enginePct: Math.round(v.engineHealth * 100)
  };
};

(async () => {
  const server = await serve(path.resolve(__dirname, '..', 'dist'), 8899);
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
  const report = { errors: [], steps: {} };
  const save = () => require('fs').writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
  const timer = setInterval(save, 1000);

  page.on('console', (m) => { if (m.type() === 'error') report.errors.push(m.text()); });
  page.on('pageerror', (e) => report.errors.push('pageerror: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.CrashLab, null, { timeout: 30000 });
  await page.waitForTimeout(1500);

  // 过家长控制密码盘
  if (await page.evaluate(() => !document.getElementById('pinpad').classList.contains('hidden'))) {
    for (const ch of '456321') {
      await page.click(`[data-pin="${ch}"]`);
      await page.waitForTimeout(70);
    }
    await page.waitForTimeout(600);
  }
  report.steps.pinPassed = await page.evaluate(() =>
    document.getElementById('pinpad').classList.contains('hidden'));

  // 打开车库并选星星小车
  await page.click('[data-nav="garage"]');
  await page.waitForTimeout(500);
  await page.click('[data-vehicle="star"]');
  await page.waitForTimeout(400);
  report.steps.selected = await page.evaluate(() =>
    document.querySelector('[data-vehicle="star"]').classList.contains('selected'));
  await page.click('#garage [data-nav="menu"]');
  await page.waitForTimeout(400);
  await page.click('#menu [data-nav="play"]');
  await page.waitForTimeout(1500);

  report.steps.spawn = await page.evaluate(carState);

  // 全油门冲 4 秒
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(4000);
  report.steps.drive = await page.evaluate(carState);
  await page.keyboard.up('ArrowUp');

  // 全速直行撞向场地尽头，检验凹陷与玻璃破碎
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(9000);
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(1200);
  report.steps.afterCrash = await page.evaluate(carState);

  await page.screenshot({ path: 'C:\\Users\\46971\\Desktop\\WB1\\_verify\\star-car.png' });

  clearInterval(timer);
  save();
  await browser.close();
  server.close();
  console.log(JSON.stringify(report, null, 2));
})();
