const NS = 'http://www.w3.org/2000/svg';

/** 地图与小地图使用同一组真实区域坐标，不加载在线地图。 */
export class WorldMap {
  constructor(world, handlers) {
    this.world = world;
    this.lastUpdate = 0;
    this.overlay = document.createElement('div');
    this.overlay.id = 'worldMap';
    this.overlay.className = 'overlay hidden';
    this.overlay.innerHTML = `
      <section class="world-map-panel" role="dialog" aria-modal="true" aria-labelledby="mapTitle">
        <header><div><p class="map-eyebrow">自由探索 · 无需比赛</p><h2 id="mapTitle">驾驶游乐世界</h2></div><button class="btn map-close" aria-label="关闭地图">继续驾驶 ×</button></header>
        <div class="world-map-layout"><div class="world-map-drawing"></div><div class="world-destinations"><p class="map-help">选择区域即可传送。靠近机关按 E 或点击互动。</p><div class="destination-list"></div></div></div>
        <footer><span class="map-progress"></span><span>破坏会保留 · 青色圆环是探索地标</span><button class="btn reset-buildings">重置建筑</button></footer>
      </section>`;
    document.getElementById('stage').append(this.overlay);
    this.svg = this.makeMap(false);
    this.overlay.querySelector('.world-map-drawing').append(this.svg);
    const list = this.overlay.querySelector('.destination-list');
    for (const region of world.regions) {
      const button = document.createElement('button');
      button.className = 'destination';
      button.style.setProperty('--region-color', region.color);
      button.dataset.destination = region.id;
      button.disabled = !!region.portalOnly;
      button.innerHTML = `<strong>${region.name}</strong><small>${region.subtitle}</small><span>传送 →</span>`;
      button.addEventListener('click', () => handlers.onTeleport(region.spawnIndex));
      list.append(button);
    }
    this.overlay.querySelector('.map-close').addEventListener('click', handlers.onClose);
    this.overlay.querySelector('.reset-buildings').addEventListener('click', handlers.onResetBuildings);
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !this.overlay.classList.contains('hidden')) handlers.onClose();
    });

    this.mini = document.createElement('div');
    this.mini.className = 'mini-world';
    this.mini.innerHTML = '<span class="mini-region">碰撞实验场</span><div class="mini-drawing"></div><span class="mini-progress"></span>';
    this.miniSvg = this.makeMap(true);
    this.mini.querySelector('.mini-drawing').append(this.miniSvg);
    document.getElementById('hud').append(this.mini);
    this.action = document.getElementById('worldAction');
    this.action.addEventListener('click', handlers.onInteract);
  }

  element(name, attrs) {
    const el = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    return el;
  }

  makeMap(mini) {
    const svg = this.element('svg', { viewBox: '-600 -1300 1200 1900', role: 'img', 'aria-label': '开放世界地图' });
    svg.append(this.element('rect', { x: -600, y: -1300, width: 1200, height: 1900, rx: 34, fill: '#243f3d' }));
    for (let t = -500; t <= 500; t += 100) {
      svg.append(this.element('path', { d: `M${t},-600 V600 M-600,${t} H600`, stroke: '#b1d3cb', 'stroke-opacity': 0.08, 'stroke-width': 2 }));
    }
    for (const r of this.world.regions) {
      const x = r.mapX ?? r.x, z = r.mapZ ?? r.z, scale = r.mapScale ?? 1;
      svg.append(this.element('rect', { x: x - r.w * scale / 2, y: z - r.d * scale / 2, width: r.w * scale, height: r.d * scale, rx: 18, fill: r.color, 'fill-opacity': 0.22, stroke: r.color, 'stroke-width': mini ? 5 : 2 }));
      if (!mini) {
        const text = this.element('text', { x, y: z, fill: '#f1f7f2', 'text-anchor': 'middle', 'font-size': 27, 'font-weight': 700 });
        text.textContent = r.name; svg.append(text);
      }
    }
    svg.append(this.element('path', { d: 'M-220,-300 H250 V310 H-220 Z M-220,-150 H-275 M-220,90 H-350 M250,-130 H330 M250,190 H310 M0,285 V325 H-62 M0,-260 V-350', stroke: '#d6cba7', 'stroke-width': mini ? 7 : 11, fill: 'none', opacity: 0.75 }));
    svg.append(this.element('path', { d: 'M250,-300 L220,-610 V-1220 M200,-750 L-40,-940 L-110,-900 H470 L420,-1020 M240,-700 L420,-740 L470,-900 M-370,-1070 V-850 M-478,-960 H-262', stroke: '#f0d5a1', 'stroke-width': mini ? 8 : 12, fill: 'none', opacity: 0.8 }));
    for (const [x, z, color] of [[206, -1190, '#7bf6ed'], [234, -1190, '#ffb55d'], [-370, -846, '#ffdd96'], [-370, -486, '#ffdd96']]) svg.append(this.element('circle', { cx: x, cy: z, r: 14, fill: 'none', stroke: color, 'stroke-width': 5 }));
    for (const spot of this.world.discoveries) {
      const point = this.project(spot.pos);
      svg.append(this.element('circle', { cx: point.x, cy: point.z, r: mini ? 10 : 7, fill: '#83e7ca', 'data-spot': spot.id, opacity: 0.55 }));
    }
    const player = this.element('g', { class: 'map-player' });
    player.append(this.element('circle', { r: mini ? 28 : 20, fill: '#f8f7ee', 'fill-opacity': 0.15 }));
    player.append(this.element('path', { d: 'M0,18 L-12,-12 L0,-6 L12,-12 Z', fill: '#fff5bf', stroke: '#172e30', 'stroke-width': 3 }));
    svg.append(player);
    return svg;
  }

  update(vehicle, now = performance.now()) {
    if (now - this.lastUpdate < 100) return;
    this.lastUpdate = now;
    const p = vehicle.body.position, q = vehicle.body.quaternion;
    const point = this.project(p), island = p.x > 1500;
    this.miniSvg.setAttribute('viewBox', p.x > 2250 ? '-540 -770 340 340' : island ? '-540 -1130 340 340' : p.z < -600 ? '-200 -1320 780 840' : '-600 -600 1200 1200');
    const yaw = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y)) * 180 / Math.PI;
    for (const svg of [this.svg, this.miniSvg]) {
      svg.querySelector('.map-player').setAttribute('transform', `translate(${point.x} ${point.z}) rotate(${-yaw})`);
      svg.querySelectorAll('[data-spot]').forEach(el => el.setAttribute('opacity', this.world.found.has(el.dataset.spot) ? '1' : '.35'));
    }
    this.mini.querySelector('.mini-region').textContent = this.world.region.name;
    const count = `发现 ${this.world.foundCount} / ${this.world.discoveries.length}`;
    this.mini.querySelector('.mini-progress').textContent = count;
    this.overlay.querySelector('.map-progress').textContent = count + ' · 高速与小岛已开放';
    this.overlay.querySelectorAll('[data-destination]').forEach(button => { button.disabled = island || this.world.regions.find(r => r.id === button.dataset.destination)?.portalOnly; });
    this.overlay.querySelector('.map-help').textContent = island ? '离岛请沿主路驶入金色光门，直接返回车库。' : '高速尽头左门通生物岛，右门通工地岛。靠近机关按 E 互动。';
    const action = this.world.nearestAction;
    this.action.classList.toggle('hidden', !action);
    if (action) this.action.textContent = `E  ${action.name}`;
  }

  project(p) { if (p.x > 2250) return { x: -370 + (p.x - 2600) * 0.6, z: -600 + p.z * 0.6 }; return p.x > 1500 ? { x: -370 + (p.x - 1800) * 0.6, z: -960 + p.z * 0.6 } : p; }

  show(vehicle) { this.lastUpdate = -Infinity; this.update(vehicle); this.overlay.classList.remove('hidden'); }
  hide() { this.overlay.classList.add('hidden'); }
}
