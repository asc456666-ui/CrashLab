import * as THREE from 'three';

/**
 * 全部贴图用 Canvas 程序化生成，项目不引用任何外部美术资源。
 */

function makeCanvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { canvas: c, ctx: c.getContext('2d') };
}

function speckle(ctx, size, count, colors, minR, maxR, alpha) {
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = alpha * (0.4 + Math.random() * 0.6);
    ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
    const r = minR + Math.random() * (maxR - minR);
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function finish(canvas, repeat) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function asphaltTexture(repeat = 40) {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#33383d';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 2600, ['#2b3034', '#3d434a', '#454b52', '#262a2e'], 0.5, 2.4, 0.8);
  return finish(canvas, repeat);
}

export function concreteTexture(repeat = 12) {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#a9a59f';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 1400, ['#9c9892', '#b8b4ad', '#8d8983'], 1, 4, 0.38);
  ctx.strokeStyle = 'rgba(90,96,100,0.5)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    let x = Math.random() * size;
    let y = Math.random() * size;
    ctx.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      x += (Math.random() - 0.5) * 40;
      y += (Math.random() - 0.5) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return finish(canvas, repeat);
}

export function hazardTexture(repeat = 6) {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#f2c200';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#1b1b1b';
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-Math.PI / 4);
  for (let i = -size; i < size; i += 64) {
    ctx.fillRect(i, -size, 32, size * 2);
  }
  ctx.restore();
  speckle(ctx, size, 500, ['#d8ad00', '#ffe14d'], 1, 3, 0.25);
  return finish(canvas, repeat);
}

export function metalTexture(repeat = 4, tint = '#8d9399') {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 4) {
    ctx.globalAlpha = 0.06 + Math.random() * 0.06;
    ctx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#333333';
    ctx.fillRect(0, y, size, 2);
  }
  ctx.globalAlpha = 1;
  return finish(canvas, repeat);
}

export function woodTexture(repeat = 2) {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#a9743f';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 12) {
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = y % 24 === 0 ? '#8a5b2c' : '#c08b53';
    ctx.fillRect(0, y, size, 6);
  }
  ctx.globalAlpha = 1;
  return finish(canvas, repeat);
}

export function rockTexture(repeat = 3) {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#7b7268';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 900, ['#6a6259', '#8b8175', '#5d564e'], 2, 8, 0.5);
  return finish(canvas, repeat);
}

export function skyTexture() {
  const size = 512;
  const { canvas, ctx } = makeCanvas(size);
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, '#4a7fb5');
  g.addColorStop(0.55, '#9dc3e6');
  g.addColorStop(1, '#e6eef3');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

// ---- 材质缓存，避免重复生成导致的显存浪费 ----

const cache = new Map();

export function mat(key, factory) {
  if (!cache.has(key)) cache.set(key, factory());
  return cache.get(key);
}

export const Materials = {
  asphalt: () => mat('asphalt', () => new THREE.MeshStandardMaterial({ map: asphaltTexture(60), roughness: 0.95, metalness: 0.02 })),
  concrete: () => mat('concrete', () => new THREE.MeshStandardMaterial({ map: concreteTexture(6), roughness: 0.9, metalness: 0.03 })),
  hazard: () => mat('hazard', () => new THREE.MeshStandardMaterial({ map: hazardTexture(4), roughness: 0.7, metalness: 0.1 })),
  metal: () => mat('metal', () => new THREE.MeshStandardMaterial({ map: metalTexture(3), roughness: 0.42, metalness: 0.85 })),
  metalDark: () => mat('metalDark', () => new THREE.MeshStandardMaterial({ map: metalTexture(3, '#5d646b'), roughness: 0.5, metalness: 0.8 })),
  wood: () => mat('wood', () => new THREE.MeshStandardMaterial({ map: woodTexture(2), roughness: 0.85 })),
  rock: () => mat('rock', () => new THREE.MeshStandardMaterial({ map: rockTexture(3), roughness: 1.0 })),
  rubber: () => mat('rubber', () => new THREE.MeshStandardMaterial({ color: 0x1b1b1e, roughness: 0.85 })),
  glass: () => mat('glass', () => new THREE.MeshStandardMaterial({
    color: 0xbfe4ff, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.42
  })),
  glassCracked: () => mat('glassCracked', () => new THREE.MeshStandardMaterial({
    color: 0xd8e8f0, roughness: 0.55, metalness: 0.05, transparent: true, opacity: 0.62
  }))
};
