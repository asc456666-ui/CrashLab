/**
 * 场景逐项截图：星星小车、自由视角、跳台、坠落、落锤、慢动作。
 * 同时回报渲染开销，用来判断手机端是否吃得消。
 */
const { chromium } = require('playwright-core');

const CHROME = 'C:\\Users\\46971\\.agent-browser\\browsers\\chrome-153.0.8010.52\\chrome.exe';
const OUT = 'C:\\Users\\46971\\Desktop\\WB1\\shots\\';

const snap = () => {
  const v = window.CrashLab.vehicle;
  const p = v.body.position;
  return {
    kmh: Math.round(v.speedKmh),
    y: +p.y.toFixed(1),
    health: +v.vehicleHealth.toFixed(2),
    partsLeft: v.liveParts.length,
    wheels: v.wheelDetached.filter(Boolean).length
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
    if (m.type() === 'error') logs.push('[console.error] ' + m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400) logs.push('[http' + r.status() + '] ' + r.url());
  });

  await page.goto('http://localhost:5173', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3000);

  // 星星小车
  await page.click('[data-nav="garage"]');
  await page.waitForTimeout(300);
  await page.click('[data-vehicle="star"]');
  await page.waitForTimeout(300);
  await page.click('#garage [data-nav="play"]');
  await page.waitForTimeout(2500);
  await page.keyboard.down('w');
  await page.waitForTimeout(1800);
  await page.keyboard.up('w');
  await page.waitForTimeout(600);
  await page.screenshot({ path: OUT + 'star_follow.png' });

  // 自由视角绕车
  await page.click('[data-tap="camera"]');
  await page.waitForTimeout(200);
  await page.click('[data-tap="camera"]');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: OUT + 'star_orbit.png' });

  await page.click('[data-tap="camera"]');
  await page.waitForTimeout(200);
  await page.click('[data-tap="camera"]');
  await page.waitForTimeout(1200);

  // 跳台区
  await page.evaluate(() => window.CrashLab.setSpawn(1));
  await page.waitForTimeout(1500);
  await page.keyboard.down('w');
  await page.waitForTimeout(3200);
  await page.screenshot({ path: OUT + 'ramp_jump.png' });
  await page.waitForTimeout(2000);
  await page.keyboard.up('w');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + 'ramp_land.png' });
  logs.push('[ramp] ' + JSON.stringify(await page.evaluate(snap)));

  // 坠落台：冲下平台
  await page.evaluate(() => window.CrashLab.setSpawn(2));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + 'tower_top.png' });
  await page.keyboard.down('w');
  await page.waitForTimeout(3000);
  await page.keyboard.up('w');
  await page.waitForTimeout(900);
  await page.screenshot({ path: OUT + 'tower_fall.png' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: OUT + 'tower_land.png' });
  logs.push('[tower] ' + JSON.stringify(await page.evaluate(snap)));

  // 落锤区：车停在正下方，落锤
  await page.evaluate(() => window.CrashLab.setSpawn(3));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.CrashLab.arena.dropHeavyBlock());
  await page.waitForTimeout(2600);
  await page.screenshot({ path: OUT + 'heavy_block.png' });
  logs.push('[heavy] ' + JSON.stringify(await page.evaluate(snap)));

  // 慢动作
  await page.click('[data-tap="slowmo"]');
  await page.waitForTimeout(900);
  await page.screenshot({ path: OUT + 'slowmo.png' });

  logs.push('[render] ' + JSON.stringify(await page.evaluate(() => {
    const g = window.CrashLab;
    return {
      calls: g.renderer.info.render.calls,
      triangles: g.renderer.info.render.triangles,
      geometries: g.renderer.info.memory.geometries,
      textures: g.renderer.info.memory.textures,
      bodies: g.world.bodies.length,
      dynamics: g.ctx.dynamics.length,
      fps: g.fpsValue,
      timeScale: g.time.scale
    };
  })));

  console.log(logs.join('\n'));
  await browser.close();
})().catch((e) => {
  console.log('FATAL ' + (e && e.stack ? e.stack : String(e)));
  process.exit(1);
});
