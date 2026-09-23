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

  async init(game) {
    this.game = game;
    if (!this.isNative) return false;

    try {
      const mod = await import('@capacitor/app');
      this.app = mod.App;
    } catch (err) {
      return false;
    }

    // 返回键：只要不在主菜单，一律先回主菜单；已停在主菜单才真正退出
    this.app.addListener('backButton', () => this.onBack());

    // 切后台/回前台：暂停与恢复物理和音频
    this.app.addListener('appStateChange', (state) => {
      this.game?.setPaused(!state.isActive);
    });
    this.app.addListener('pause', () => this.game?.setPaused(true));
    this.app.addListener('resume', () => this.game?.setPaused(false));

    return true;
  },

  onBack() {
    const g = this.game;
    if (!g) return;

    const menuVisible = !g.ui.panels.menu.classList.contains('hidden');
    if (menuVisible) {
      this.app?.exitApp();
      return;
    }

    g.onNav('menu');
    g.ui.showMessage('已返回主菜单');
  }
};
