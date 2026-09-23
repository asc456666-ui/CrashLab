/**
 * 山林地形块体检。直接列出每块地面的刚体位置，和高程函数的理论值对照，
 * 看是高程算错了还是块摆错了。比用车去探测快得多也准得多。
 */
const { chromium } = require('playwright-core');
const { serve } = require('./static-server.cjs');

const CHROME = 'C:\\Users\\46971\\.agent-browser\\browsers\\chrome-153.0.8010.52\\chrome.exe';
const DIST = 'C:\\Users\\46971\\Desktop\\WB1\\CrashLabWeb\\dist';
const OUT = 'C:\\Users\\46971\\Desktop\\WB1\\_verify\\forest-blocks.txt';

(async () => {
  const server = await serve(DIST, 8899);
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
  const lines = [];
  page.on('pageerror', (e) => lines.push('ERR ' + (e && e.message ? e.message : e)));

  await page.goto('http://127.0.0.1:8899/', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.CrashLab, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  for (const ch of '456321') { await page.click(`[data-pin="${ch}"]`); await page.waitForTimeout(60); }
  await page.waitForTimeout(500);
  await page.click('[data-nav="play"]');
  await page.waitForTimeout(1500);

  const rows = await page.evaluate(() => {
    const g = window.CrashLab;
    const arena = g.arena;
    const cx = -120;
    const cz = 60;
    const out = [];

    for (const b of g.world.bodies) {
      if (b.mass !== 0) continue;
      const lx = b.position.x - cx;
      const lz = b.position.z - cz;
      if (Math.abs(lx) > 75 || Math.abs(lz) > 130) continue;
      const he = b.shapes[0].halfExtents;
      // 地面块半厚 1.2，主大地面半厚 2，据此区分
      if (he.y > 1.4 || he.y < 0.9) continue;
      if (he.x < 8) continue;

      // 直接读网格上的欧拉角，别自己从四元数换算，容易搞错轴
      const mesh = g.ctx.staticMeshes.get(b);
      const rx = mesh ? (mesh.rotation.x * 180 / Math.PI) : 0;
      const rz = mesh ? (mesh.rotation.z * 180 / Math.PI) : 0;

      out.push({
        x: +b.position.x.toFixed(1),
        y: +b.position.y.toFixed(2),
        z: +b.position.z.toFixed(1),
        hy: +he.y.toFixed(2),
        hx: +he.x.toFixed(1),
        hz: +he.z.toFixed(1),
        rotXdeg: +rx.toFixed(1),
        rotZdeg: +rz.toFixed(1),
        theoryCenter: +arena.forestHeightAt(lx, lz).toFixed(2)
      });
    }

    return out;
  });

  lines.push('=== FOREST GROUND BLOCKS (actual vs theory) ===');
  lines.push('说明：块中心 y 应约等于 theoryCenter - 1.06（厚度一半 1.2 再抬 0.14），且 theory 应全部为正');
  lines.push('blockCount=' + rows.length);
  for (const r of rows) {
    const expect = +(r.theoryCenter - 1.06).toFixed(2);
    lines.push(
      `x=${r.x} z=${r.z} actualY=${r.y} expectY=${expect} diff=${+(r.y - expect).toFixed(2)} ` +
      `theoryH=${r.theoryCenter} rotX=${r.rotXdeg} rotZ=${r.rotZdeg} hy=${r.hy} hz=${r.hz}`
    );
  }

  const diffs = rows.map((r) => r.y - (r.theoryCenter - 1.06));
  if (diffs.length) {
    lines.push('=== DIFF SUMMARY ===');
    lines.push('min=' + Math.min(...diffs).toFixed(2) + ' max=' + Math.max(...diffs).toFixed(2));
    const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    lines.push('avg=' + avg.toFixed(2));
  }

  require('fs').writeFileSync(OUT, lines.join('\n'), 'utf8');
  console.log('WROTE blocks');
  await browser.close();
  server.close();
})().catch((e) => {
  require('fs').writeFileSync(OUT, 'FATAL ' + (e && e.stack ? e.stack : e), 'utf8');
  console.log('FATAL ' + (e && e.stack ? e.stack : String(e)));
  process.exit(1);
});
