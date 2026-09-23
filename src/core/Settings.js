import { Capacitor } from '@capacitor/core';

const KEY = 'crashlab.settings.v1';

export const QUALITY_PRESETS = [
  { name: '低', pixelRatio: 1.0, shadows: false, shadowSize: 512, particleScale: 0.35, antialias: false },
  { name: '中', pixelRatio: 1.5, shadows: true, shadowSize: 1024, particleScale: 0.75, antialias: true },
  { name: '高', pixelRatio: 2.0, shadows: true, shadowSize: 2048, particleScale: 1.0, antialias: true }
];

const DEFAULTS = {
  volume: 0.8,
  quality: 1,
  fps: 60,
  vehicle: 'normal',
  spawn: 0,
  bestScore: 0
};

/** 手机上按核心数挑初始画质，低端机直接落低档，保证第一次打开就跑得动 */
function defaultQuality() {
  if (!Capacitor.isNativePlatform()) return DEFAULTS.quality;
  const cores = navigator.hardwareConcurrency || 4;
  return cores <= 4 ? 0 : 1;
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, quality: defaultQuality() };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (err) {
    return { ...DEFAULTS, quality: defaultQuality() };
  }
}

export const Settings = {
  data: read(),

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (err) {
      /* 隐私模式下写入失败时静默降级，不影响游玩 */
    }
  },

  set(key, value) {
    this.data[key] = value;
    this.save();
  },

  get quality() {
    return QUALITY_PRESETS[Math.min(QUALITY_PRESETS.length - 1, Math.max(0, this.data.quality | 0))];
  }
};
