import { Settings } from '../core/Settings.js';

const $ = (id) => document.getElementById(id);

/**
 * DOM 界面层。菜单、车辆选择、设置、HUD 都在这里，按钮做得大，方便孩子直接点。
 */
export class UI {
  constructor(handlers) {
    this.handlers = handlers;
    this.panels = {
      menu: $('menu'),
      garage: $('garage'),
      settings: $('settings')
    };

    this.hud = $('hud');
    this.controls = $('controls');
    this.tools = $('tools');

    this.speedEl = $('hudSpeed');
    this.damageBar = $('barDamage');
    this.engineBar = $('barEngine');
    this.txtDamage = $('txtDamage');
    this.txtEngine = $('txtEngine');
    this.txtWheels = $('txtWheels');
    this.timeRow = $('timeRow');
    this.txtTime = $('txtTime');
    this.scoreEl = $('hudScore');
    this.bestEl = $('hudBest');
    this.bannerEl = $('banner');
    this.bannerTimer = null;
    this.fpsEl = $('fps');
    this.msgEl = $('msgline');
    this.msgTimer = null;

    this.pinValue = '';
    this.pinSubmit = null;

    this.bindNav();
    this.bindGarage();
    this.bindSettings();
    this.bindPinPad();
    this.bindLimit();
    this.syncSettingsFromSave();
    this.syncGarageSelection();
  }

  bindNav() {
    document.querySelectorAll('[data-nav]').forEach((el) => {
      el.addEventListener('click', () => {
        const nav = el.getAttribute('data-nav');
        this.handlers.onNav?.(nav);
      });
    });
  }

  bindGarage() {
    document.querySelectorAll('[data-vehicle]').forEach((el) => {
      el.addEventListener('click', () => {
        document.querySelectorAll('[data-vehicle]').forEach((c) => c.classList.remove('selected'));
        el.classList.add('selected');
        this.handlers.onVehicle?.(el.getAttribute('data-vehicle'));
      });
    });
  }

  bindSettings() {
    const vol = $('setVolume');
    vol.value = Math.round(Settings.data.volume * 100);
    vol.addEventListener('input', () => {
      this.handlers.onVolume?.(vol.value / 100);
    });

    const seg = (id, key, cast) => {
      const el = $(id);
      el.querySelectorAll('button').forEach((b) => {
        b.addEventListener('click', () => {
          el.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          const attr = 'data-' + Object.keys(b.dataset)[0];
          const raw = b.getAttribute(attr);
          this.handlers[key]?.(cast ? cast(raw) : raw);
        });
      });
    };

    seg('setQuality', 'onQuality', Number);
    seg('setFps', 'onFps', Number);
    seg('setSpawn', 'onSpawn', Number);
  }

  /**
   * 家长密码盘。输入满六位自动提交，提交后是否通过由外部决定。
   * 时长那一组不走通用的自动高亮，要通过验证才点亮。
   */
  bindPinPad() {
    $('pinKeys').querySelectorAll('[data-pin]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.preventDefault();
        const k = b.getAttribute('data-pin');

        if (k === 'clear') this.pinValue = '';
        else if (k === 'back') this.pinValue = this.pinValue.slice(0, -1);
        else if (this.pinValue.length < 6) this.pinValue += k;

        this.pinError('');
        this.renderPinDots();

        if (this.pinValue.length === 6 && this.pinSubmit) {
          this.pinSubmit(this.pinValue);
        }
      });
    });
  }

  bindLimit() {
    $('setLimit').querySelectorAll('[data-limit]').forEach((b) => {
      b.addEventListener('click', () => {
        this.handlers.onLimit?.(Number(b.getAttribute('data-limit')));
      });
    });
  }

  syncLimitButtons(minutes) {
    $('setLimit').querySelectorAll('[data-limit]').forEach((b) => {
      b.classList.toggle('on', Number(b.getAttribute('data-limit')) === minutes);
    });
  }

  renderPinDots() {
    $('pinDots').querySelectorAll('i').forEach((d, i) => {
      d.classList.toggle('on', i < this.pinValue.length);
    });
  }

  resetPinInput() {
    this.pinValue = '';
    this.renderPinDots();
  }

  showPinPad(opts = {}) {
    $('pinTitle').textContent = opts.title || '家长验证';
    $('pinHint').textContent = opts.hint || '请输入六位密码';
    this.pinError('');
    this.resetPinInput();
    this.pinSubmit = opts.onSubmit || null;
    $('pinpad').classList.remove('hidden');
  }

  hidePinPad() {
    $('pinpad').classList.add('hidden');
    this.pinSubmit = null;
    this.resetPinInput();
  }

  pinError(text) {
    $('pinError').textContent = text || '';
  }

  syncSettingsFromSave() {
    const d = Settings.data;
    $('setVolume').value = Math.round(d.volume * 100);

    const mark = (id, attr, value) => {
      const el = $(id);
      el.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('on', b.getAttribute(attr) === String(value));
      });
    };

    mark('setQuality', 'data-q', d.quality);
    mark('setFps', 'data-f', d.fps);
    mark('setSpawn', 'data-s', d.spawn);
  }

  showPanel(name) {
    for (const key in this.panels) {
      this.panels[key].classList.toggle('hidden', key !== name);
    }
    if (name === 'garage') this.syncGarageSelection();
  }

  /** 车辆卡片按存档里选中的那辆高亮，避免新增车辆后默认高亮对不上 */
  syncGarageSelection() {
    const current = Settings.data.vehicle;
    document.querySelectorAll('[data-vehicle]').forEach((el) => {
      el.classList.toggle('selected', el.getAttribute('data-vehicle') === current);
    });
  }

  hideAllPanels() {
    for (const key in this.panels) this.panels[key].classList.add('hidden');
  }

  setPlaying(on) {
    this.hud.classList.toggle('hidden', !on);
    this.controls.classList.toggle('hidden', !on);
    this.tools.classList.toggle('hidden', !on);
  }

  updateHUD(vehicle, timeScale, fps, score = 0, best = 0, remainingSeconds = Infinity) {
    const speed = Math.round(vehicle.speedKmh);
    this.speedEl.textContent = speed;

    const damage = Math.round((1 - vehicle.vehicleHealth) * 100);
    const engine = Math.round(vehicle.engineHealth * 100);

    this.damageBar.style.width = damage + '%';
    this.engineBar.style.width = engine + '%';
    this.txtDamage.textContent = damage + '%';
    this.txtEngine.textContent = engine + '%';

    this.damageBar.className = damage > 60 ? 'low' : damage > 30 ? 'mid' : '';
    this.engineBar.className = engine < 30 ? 'low' : engine < 60 ? 'mid' : '';

    this.txtWheels.textContent = this.wheelText(vehicle);
    this.scoreEl.textContent = score;
    this.bestEl.textContent = best;

    // 家长设了时长才显示剩余时间
    if (Number.isFinite(remainingSeconds)) {
      this.timeRow.style.display = '';
      const m = Math.floor(remainingSeconds / 60);
      const s = Math.floor(remainingSeconds % 60);
      this.txtTime.textContent = m + ':' + String(s).padStart(2, '0');
    } else {
      this.timeRow.style.display = 'none';
    }

    this.fpsEl.textContent = fps + ' fps' + (timeScale !== 1 ? ' · ' + timeScale + 'x' : '');
  }

  wheelText(vehicle) {
    const health = vehicle.wheelHealth || [];
    const gone = health.filter((h) => h <= 0).length;
    const hurt = health.filter((h) => h > 0 && h < 0.65).length;

    if (gone && hurt) return gone + ' 个已掉 · ' + hurt + ' 个受损';
    if (gone) return gone + ' 个已掉';
    if (hurt) return hurt + ' 个受损';
    return '完好';
  }

  showMessage(text, ms = 3400) {
    const el = this.msgEl;
    el.textContent = text;
    el.classList.add('on');

    if (this.msgTimer) clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => {
      el.classList.remove('on');
      this.msgTimer = null;
    }, ms);
  }

  /**
   * 画面正中的大提示。爆炸这类需要孩子马上看到的事情走这里，
   * 不传 duration 就一直挂着，直到重置或换车。
   */
  showBanner(text, duration) {
    this.bannerEl.textContent = text;
    this.bannerEl.classList.add('on');

    if (this.bannerTimer) {
      clearTimeout(this.bannerTimer);
      this.bannerTimer = null;
    }

    if (duration) {
      this.bannerTimer = setTimeout(() => this.hideBanner(), duration);
    }
  }

  /** 报废这类要一直提醒的提示，额外加个呼吸边框 */
  pulseBanner(on) {
    this.bannerEl.classList.toggle('pulse', !!on);
  }

  /** 开炮键只在坦克上出现 */
  setFireVisible(on) {
    const el = document.getElementById('btnFire');
    if (el) el.classList.toggle('hide', !on);
  }

  /** 腾空时提示特技按键 */
  setAirHint(on) {
    const el = document.getElementById('airhint');
    if (el) el.classList.toggle('on', !!on);
  }

  hideBanner() {
    this.bannerEl.classList.remove('on');
    this.bannerEl.classList.remove('pulse');
    if (this.bannerTimer) {
      clearTimeout(this.bannerTimer);
      this.bannerTimer = null;
    }
  }
}
