/**
 * 家长控制。
 *
 * 打开应用先过一道密码，通过后开始计时。玩到设定的时长自动锁屏，
 * 解锁同样要输密码。修改时长也要输密码。
 * 密码固定为初始密码，不提供修改入口，避免被孩子改掉。
 */
const KEY = 'crashlab.parental.v1';

export const INITIAL_PIN = '456321';
export const LIMIT_CHOICES = [15, 30, 60, 0];

export class ParentalControl {
  constructor() {
    this.data = this.read();
    this.authorized = false;
    this.usedSeconds = 0;
    this.timedOut = false;
  }

  read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { limitMinutes: 30 };
      const d = JSON.parse(raw);
      const ok = LIMIT_CHOICES.includes(d.limitMinutes);
      return { limitMinutes: ok ? d.limitMinutes : 30 };
    } catch (err) {
      return { limitMinutes: 30 };
    }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (err) {
      /* 隐私模式下写不进去就只在本次会话生效 */
    }
  }

  verify(pin) {
    return pin === INITIAL_PIN;
  }

  get limitMinutes() {
    return this.data.limitMinutes;
  }

  get limited() {
    return this.data.limitMinutes > 0;
  }

  get remainingSeconds() {
    if (!this.limited) return Infinity;
    return Math.max(0, this.data.limitMinutes * 60 - this.usedSeconds);
  }

  setLimit(minutes) {
    this.data.limitMinutes = minutes;
    this.save();
  }

  /** 密码通过后正式开始本次游玩，计时从零起 */
  authorize() {
    this.authorized = true;
    this.usedSeconds = 0;
    this.timedOut = false;
  }

  /** 只在真正游玩时累计时长，停在菜单里不算 */
  tick(dt) {
    if (!this.authorized || this.timedOut || !this.limited) return;
    this.usedSeconds += dt;
    if (this.usedSeconds >= this.data.limitMinutes * 60) {
      this.timedOut = true;
    }
  }

  /** 家长解锁：清掉计时重新开始 */
  release() {
    this.timedOut = false;
    this.usedSeconds = 0;
  }
}
