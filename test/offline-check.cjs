/**
 * 断网验收：用 APK 里解出来的真实资源起一个本地静态服务，跑起游戏后切断网络，
 * 确认游戏继续可玩、无报错、且全程没有任何外部域名请求。
 */
const { chromium } = require('playwright-core');

const CHROME = 'C:\\Users\\46971\\.agent-browser\\browsers\\chrome-153.0.8010.52\\chrome.exe';
const URL = 'http://127.0.0.1:8899/';
const OUT = 'C:\\Users\\46971\\Desktop\\WB1\\_offline_check\\result.json';

const driveIntoWall = (speed) => {
  const g = window.CrashLab;
  const v = g.vehicle;
  g.resetVehicle();
  // 出生点正前方就是混凝土墙，直接给一个朝前的初速
  const yaw = v.body.quaternion.clone();
  const fx = 2 * (yaw.x * yaw.y + yaw.w * yaw.z);
  const fz = 1 - 2 * (yaw.x * yaw.x + yaw.y * yaw.y);
  const len = Math.hypot(fx, fz) || 1;
  v.body.velocity.set((fx / len) * speed, 0, (fz / len) * speed);
  v.body.wakeUp();
  return { fx: fx / len, fz: fz / len };
};

const readState = () => {
  const g = window.CrashLab;
  const v = g.vehicle;
  const base = {
    state: g.state,
    paused: !!g.paused,
    fps: g.fpsValue,
    hasVehicle: !!v,
    rendererCalls: g.renderer.info.render.calls,
    rendererTris: g.renderer.info.render.triangles,
    pixelRatio: g.renderer.getPixelRatio(),
    bodies: g.world.bodies.length
  };
  if (!v) return base;

  const st = v.deformer.deformStats();
  return {
    ...base,
    speed: Math.round(v.speedKmh),
    damage: Math.round((1 - v.vehicleHealth) * 100),
    engine: Math.round(v.engineHealth * 100),
    deformedVerts: st.count,
    maxOffset: +st.maxOffset.toFixed(3),
    wheelsOff: v.wheelDetached.filter(Boolean).length,
    glassBroken: v.glassBroken,
    impactCount: v.impactLog.length
  };
};

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });

  const context = await browser.newContext({ viewport: { width: 800, height: 450 } });
  const page = await context.newPage();

  const report = { url: URL, requests: [], external: [], errors: [], failed: [], steps: [] };
  const save = () => require('fs').writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
  const saveTimer = setInterval(save, 1000);
  page.on('request', (r) => report.requests.push(r.url()));
  page.on('requestfailed', (r) => report.failed.push(r.url() + ' :: ' + (r.failure() || {}).errorText));
  page.on('pageerror', (e) => report.errors.push('[pageerror] ' + (e && e.message ? e.message : String(e))));
  page.on('console', (m) => {
    if (m.type() === 'error') report.errors.push('[console.error] ' + m.text());
  });

  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.CrashLab, null, { timeout: 30000 });
  await page.waitForTimeout(2500);

  report.steps.push({ step: 'loaded', ...(await page.evaluate(readState)) });

  await page.click('[data-nav="play"]');
  await page.waitForTimeout(1500);

  // 联网状态下先撞一次，确认基线正常
  await page.evaluate(driveIntoWall, 34);
  await page.waitForTimeout(6000);
  report.steps.push({ step: 'crash-online', ...(await page.evaluate(readState)) });

  // 切断网络
  await context.setOffline(true);
  await page.waitForTimeout(1500);
  report.steps.push({ step: 'after-offline', ...(await page.evaluate(readState)) });

  // 离线状态下换车、撞墙、修车，确认全流程仍可用
  await page.evaluate(() => window.CrashLab.spawnVehicle('star'));
  await page.waitForTimeout(2000);
  await page.evaluate(driveIntoWall, 30);
  await page.waitForTimeout(6000);
  report.steps.push({ step: 'star-crash-offline', ...(await page.evaluate(readState)) });

  await page.evaluate(() => window.CrashLab.resetVehicle());
  await page.waitForTimeout(1500);
  report.steps.push({ step: 'reset-offline', ...(await page.evaluate(readState)) });

  // 菜单往返。页面上有多个 data-nav=menu 按钮，直接走游戏导航接口更稳
  await page.evaluate(() => window.CrashLab.onNav('menu'));
  await page.waitForTimeout(1000);
  await page.click('[data-nav="play"]');
  await page.waitForTimeout(2000);
  report.steps.push({ step: 'menu-roundtrip-offline', ...(await page.evaluate(readState)) });

  report.external = report.requests.filter((u) => !u.startsWith('http://127.0.0.1:8899') && !u.startsWith('data:') && !u.startsWith('blob:'));
  report.requestCount = report.requests.length;
  report.uniqueRequests = Array.from(new Set(report.requests));

  clearInterval(saveTimer);
  save();
  console.log('WROTE ' + OUT);
  await browser.close();
})().catch((e) => {
  require('fs').writeFileSync(OUT.replace('result.json', 'fatal.txt'), (e && e.stack ? e.stack : String(e)), 'utf8');
  console.log('FATAL ' + (e && e.stack ? e.stack : String(e)));
  process.exit(1);
});
