import { Game } from './core/Game.js';
import { Settings } from './core/Settings.js';
import { Platform } from './core/Platform.js';

const canvas = document.getElementById('scene');
const game = new Game(canvas);

// 音量初始化
window.addEventListener('pointerdown', () => {
  if (Settings.data.volume >= 0) game.audio.setVolume(Settings.data.volume);
}, { once: true });

// PWA：只在浏览器里注册离线缓存。打进 APK 后资源本来就随包安装，
// 再挂 service worker 反而会拦截 Capacitor 本地服务器的请求，所以原生端直接跳过
if (!Platform.isNative && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// 阻止双指缩放与长按菜单，避免孩子误触
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());

window.CrashLab = game;
