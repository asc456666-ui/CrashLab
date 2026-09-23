/**
 * 真实浏览器冒烟测试：加载、控错、进游戏、加速、撞墙、重置，全程截图。
 * 使用 agent-browser 下载的 Chrome，由 playwright-core 驱动。
 */
const { chromium } = require('playwright-core');

const CHROME = 'C:\\Users\\46971\\.agent-browser\\browsers\\chrome-153.0.8010.52\\chrome.exe';
const OUT = 'C:\\Users\\46971\\Desktop\\WB1\\';

const snap = () => {
  const g = window.CrashLab;
  if (!g || !g.vehicle) return null;
  const v = g.vehicle;
  const p = v.body.position;
  return {
    kmh: Math.round(v.speedKmh),
    pos: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)],
    vehicleHealth: +v.vehicleHealth.toFixed(3),
    engineHealth: +v.engineHealth.toFixed(3),
    partsLeft: v.liveParts.length,
    wheelsDetached: v.wheelDetached.filter(Boolean).length,
    glass: v.glassBroken,
    fps: g.fpsValue
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
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push('[' + m.type() + '] ' + m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400) logs.push('[http' + r.status() + '] ' + r.url());
  });

  await page.goto('http://localhost:5173', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: OUT + 'shot_menu.png' });

  logs.push('[boot] ' + JSON.stringify(await page.evaluate(() => {
    const c = document.getElementById('scene');
    return {
      title: document.title,
      hasGL: !!(c && (c.getContext('webgl2') || c.getContext('webgl'))),
      gameReady: !!window.CrashLab
    };
  })));

  await page.click('[data-nav="play"]');
  await page.waitForTimeout(1500);
  logs.push('[start] ' + JSON.stringify(await page.evaluate(snap)));

  await page.keyboard.down('w');
  await page.waitForTimeout(5000);
  logs.push('[accel5s] ' + JSON.stringify(await page.evaluate(snap)));

  await page.waitForTimeout(6000);
  logs.push('[accel11s] ' + JSON.stringify(await page.evaluate(snap)));

  await page.waitForTimeout(6000);
  await page.keyboard.up('w');
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + 'shot_crash.png' });
  logs.push('[afterCrash] ' + JSON.stringify(await page.evaluate(snap)));

  await page.click('[data-tap="reset"]');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: OUT + 'shot_reset.png' });
  logs.push('[afterReset] ' + JSON.stringify(await page.evaluate(snap)));

  console.log(logs.join('\n'));
  await browser.close();
})().catch((e) => {
  console.log('FATAL ' + (e && e.stack ? e.stack : String(e)));
  process.exit(1);
});
