/**
 * 家长控制验证。
 * 打开要密码、错的不放行、对的放行、改时长要密码、到点锁屏、解锁要密码。
 */
const { chromium } = require('playwright-core');

const CHROME = 'C:\\Users\\46971\\.agent-browser\\browsers\\chrome-153.0.8010.52\\chrome.exe';
const URL = 'http://127.0.0.1:8899/';
const OUT = 'C:\\Users\\46971\\Desktop\\WB1\\_verify\\parental.json';

const pinVisible = () => !document.getElementById('pinpad').classList.contains('hidden');
const pinTitle = () => document.getElementById('pinTitle').textContent;
const pinErr = () => document.getElementById('pinError').textContent;

const state = () => {
  const g = window.CrashLab;
  return {
    authorized: g.parental.authorized,
    timedOut: g.parental.timedOut,
    limitMinutes: g.parental.limitMinutes,
    usedSeconds: +g.parental.usedSeconds.toFixed(1),
    remaining: g.parental.remainingSeconds === Infinity ? 'inf' : Math.round(g.parental.remainingSeconds),
    pinMode: g.pinMode,
    paused: g.paused,
    gameState: g.state,
    pinVisible: !document.getElementById('pinpad').classList.contains('hidden'),
    pinTitle: document.getElementById('pinTitle').textContent,
    pinErr: document.getElementById('pinError').textContent,
    limitHighlight: Array.from(document.querySelectorAll('#setLimit button'))
      .filter((b) => b.classList.contains('on'))
      .map((b) => b.getAttribute('data-limit'))
  };
};

async function press(page, pin) {
  for (const ch of pin) {
    await page.click(`[data-pin="${ch}"]`);
    await page.waitForTimeout(70);
  }
  await page.waitForTimeout(250);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
  const report = { errors: [], steps: {} };
  const save = () => require('fs').writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
  const timer = setInterval(save, 1000);

  page.on('pageerror', (e) => report.errors.push(String(e && e.message ? e.message : e)));
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push(m.text()); });

  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.CrashLab, null, { timeout: 30000 });
  await page.waitForTimeout(1500);

  // 1 打开就要求密码
  report.steps.onLoad = await page.evaluate(state);
  save();

  // 2 错密码不放行
  await press(page, '123456');
  report.steps.wrongPin = await page.evaluate(state);
  save();

  // 3 对密码放行
  await press(page, '456321');
  report.steps.rightPin = await page.evaluate(state);
  save();

  // 4 没通过密码时进不了游戏（用一个没授权的场景验证：直接看 authorized 与 state）
  await page.click('[data-nav="play"]');
  await page.waitForTimeout(2000);
  report.steps.afterPlay = await page.evaluate(state);
  report.steps.hudHidden = await page.evaluate(() => document.getElementById('hud').classList.contains('hidden'));
  save();

  // 5 进设置改时长，必须过密码
  await page.evaluate(() => window.CrashLab.onNav('menu'));
  await page.waitForTimeout(600);
  await page.evaluate(() => window.CrashLab.onNav('settings'));
  await page.waitForTimeout(600);
  await page.click('#setLimit [data-limit="15"]');
  await page.waitForTimeout(800);
  report.steps.limitPinAsked = await page.evaluate(state);
  save();

  await press(page, '456321');
  report.steps.limitApplied = await page.evaluate(state);
  save();

  // 6 到点锁屏
  await page.evaluate(() => {
    const g = window.CrashLab;
    g.onNav('play');
    g.parental.usedSeconds = g.parental.limitMinutes * 60 - 1.2;
  });
  await page.waitForTimeout(3000);
  report.steps.timedOut = await page.evaluate(state);
  save();

  // 7 解锁
  await press(page, '456321');
  report.steps.afterUnlock = await page.evaluate(state);
  save();

  // 8 不限时也要过密码
  await page.evaluate(() => window.CrashLab.onNav('menu'));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.CrashLab.onNav('settings'));
  await page.waitForTimeout(500);
  await page.click('#setLimit [data-limit="0"]');
  await page.waitForTimeout(700);
  const askedAgain = await page.evaluate(state);
  await press(page, '456321');
  report.steps.unlimited = { askedAgain, result: await page.evaluate(state) };
  save();

  clearInterval(timer);
  save();
  console.log('WROTE ' + OUT);
  await browser.close();
})().catch((e) => {
  require('fs').writeFileSync(OUT.replace('parental.json', 'fatal-parental.txt'), e && e.stack ? e.stack : String(e), 'utf8');
  console.log('FATAL ' + (e && e.stack ? e.stack : String(e)));
  process.exit(1);
});
