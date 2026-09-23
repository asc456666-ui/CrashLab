const STEPS = [1.0, 0.25, 0.1];

/**
 * 慢动作。物理步进与粒子更新统一乘 scale，避免慢放后物理表现异常。
 */
export class TimeControl {
  constructor() {
    this.index = 0;
    this.scale = 1.0;
  }

  cycle() {
    this.index = (this.index + 1) % STEPS.length;
    this.scale = STEPS[this.index];
    return this.scale;
  }

  reset() {
    this.index = 0;
    this.scale = 1.0;
  }

  label() {
    return this.scale === 1 ? '1x' : this.scale + 'x';
  }
}
