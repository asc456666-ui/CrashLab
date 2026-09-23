/**
 * Release APK 离线验收。
 * 从真实签名包里解出 assets/public，在浏览器里以 offline 模式跑一遍完整流程，
 * 确认不依赖任何外部域名，且星星小车可选中并正常驾驶。
 */
const { chromium } = require('playwright-core');
const { serve } = require('./static-server.cjs');

const CHROME = 'C:\\Users\\46971\\.agent-browser\\browsers\\chrome-153.0.8010.52\\chrome.exe';
const APK_ASSETS = 'C:\\Users\\46971\\AppData\\Local\\Temp\\releasecheck';

(async () => {
  const server = await serve(APK_ASSETS, 8901);
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  // 先联网加载首屏，再切断网络，验证后续运行不依赖任何外部资源。
  // 直接 offline 起手会连本地服务都拒绝，达不到验证目的。
  const ctx = await browser.newContext({ viewport: { width: 900, height: 500 } });
  const page = await ctx.newPage();

  const external = [];
  const errors = [];
  page.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1')) external.push(r.url()); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('http://127.0.0.1:8901/', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.CrashLab, null, { timeout: 30000 });
  await page.waitForTimeout(1500);

  external.length = 0;
  await ctx.setOffline(true);

  for (const ch of '456321') {
    await page.click(`[data-pin="${ch}"]`);
    await page.waitForTimeout(70);
  }
  await page.waitForTimeout(700);

  await page.click('[data-nav="garage"]');
  await page.waitForTimeout(500);
  await page.click('[data-vehicle="star"]');
  await page.waitForTimeout(300);
  await page.click('#garage [data-nav="menu"]');
  await page.waitForTimeout(300);
  await page.click('#menu [data-nav="play"]');
  await page.waitForTimeout(1500);

  const spawned = await page.evaluate(() => window.CrashLab.vehicle.spec.id);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(5000);
  await page.keyboard.up('ArrowUp');

  const state = await page.evaluate(() => ({
    speed: Math.round(window.CrashLab.vehicle.speedKmh),
    damagePct: Math.round((1 - window.CrashLab.vehicle.vehicleHealth) * 100)
  }));

  await page.screenshot({ path: 'C:\\Users\\46971\\Desktop\\WB1\\_verify\\release-apk-offline.png' });

  console.log(JSON.stringify({ externalRequests: external.length, errors, spawned, ...state }, null, 2));
  await browser.close();
  server.close();
})();
