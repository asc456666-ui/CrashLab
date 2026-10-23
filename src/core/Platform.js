import { Capacitor } from '@capacitor/core';

/**
 * 原生壳桥接层。
 * 网页版直接跑浏览器时全部自动跳过，不产生任何影响。
 * 打进 Android APK 后才生效：返回键优先回主菜单、切后台暂停物理与音频。
 */
export const Platform = {
  isNative: Capacitor.isNativePlatform(),
  app: null,
  game: null,
  ready: null,

  async init(game) {
    this.game = game;
    document.addEventListener('visibilitychange', () => this.game?.setBackgroundPaused(document.hidden));
    if (!this.isNative) {
      window.addEventListener('blur', () => this.game?.setBackgroundPaused(true));
      window.addEventListener('focus', () => { if (!document.hidden) this.game?.setBackgroundPaused(false); });
    }
    if (!this.isNative) return false;

    try {
      this.ready = import('@capacitor/app');
      const mod = await this.ready;
      this.app = mod.App;
    } catch (err) {
      return false;
    }

    // 返回键：只要不在主菜单，一律先回主菜单；已停在主菜单才真正退出
    this.app.addListener('backButton', () => this.onBack());

    // 切后台/回前台：暂停与恢复物理和音频
    this.app.addListener('appStateChange', (state) => {
      this.game?.setBackgroundPaused(!state.isActive);
    });
    this.app.addListener('pause', () => this.game?.setBackgroundPaused(true));
    this.app.addListener('resume', () => this.game?.setBackgroundPaused(false));

    return true;
  },

  async quit(game = this.game) {
    if (this.isNative) {
      try {
        const app = this.app || (await this.ready)?.App;
        if (!app) throw new Error('App plugin unavailable');
        await app.exitApp();
      } catch (err) {
        game?.ui.showMessage('退出失败，请使用系统返回键退出');
      }
      return;
    }

    // 普通浏览器标签页通常不允许由脚本关闭，保留菜单并给出操作提示。
    game?.ui.showMessage('已停止游戏，请关闭此标签页退出', 6000);
    window.close();
  },

  onBack() {
    const g = this.game;
    if (!g) return;
    if (g.mapOpen) {
      g.closeWorldMap();
      return;
    }

    const menuVisible = !g.ui.panels.menu.classList.contains('hidden');
    if (menuVisible) {
      g.onNav('quit');
      return;
    }

    g.onNav('menu');
    g.ui.showMessage('已返回主菜单');
  }
};
