/**
 * 统一输入。键盘与触屏各写一份，最终取两者的较大值，互不干扰。
 */
export class InputManager {
  constructor() {
    this.state = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    this.touch = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    this.handlers = {};
    this.keys = new Set();
    this.enabled = true;

    this.bindKeyboard();
    this.bindButtons();
  }

  on(name, fn) {
    this.handlers[name] = fn;
  }

  emit(name) {
    const fn = this.handlers[name];
    if (fn) fn();
  }

  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      this.keys.add(k);

      if (k === 'c') this.emit('camera');
      else if (k === 't') this.emit('slowmo');
      else if (k === 'r') this.emit('reset');
      else if (k === 'f') this.emit('flip');
      else if (k === 'x') this.emit('fire');
      else if (k === 'h') this.emit('heavy');
      else if (k === 'escape') this.emit('menu');
    });

    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  bindButtons() {
    document.querySelectorAll('[data-hold]').forEach((el) => {
      const action = el.getAttribute('data-hold');
      const down = (e) => { e.preventDefault(); this.setHold(action, true); };
      const up = (e) => { e.preventDefault(); this.setHold(action, false); };

      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    });

    document.querySelectorAll('[data-tap]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.emit(el.getAttribute('data-tap'));
      });
    });
  }

  setHold(action, value) {
    switch (action) {
      case 'throttle': this.touch.throttle = value ? 1 : 0; break;
      case 'brake': this.touch.brake = value ? 1 : 0; break;
      case 'handbrake': this.touch.handbrake = value; break;
      case 'steerL': this.touch.steer = value ? -1 : (this.touch.steer === -1 ? 0 : this.touch.steer); break;
      case 'steerR': this.touch.steer = value ? 1 : (this.touch.steer === 1 ? 0 : this.touch.steer); break;
      default: break;
    }
  }

  /** 切后台或回主菜单时把按键状态清干净，防止回来时油门还踩着 */
  release() {
    this.keys.clear();
    this.touch.throttle = 0;
    this.touch.brake = 0;
    this.touch.steer = 0;
    this.touch.handbrake = false;
    this.state.throttle = 0;
    this.state.brake = 0;
    this.state.steer = 0;
    this.state.handbrake = false;
  }

  update() {
    if (!this.enabled) {
      this.state.throttle = 0;
      this.state.brake = 0;
      this.state.steer = 0;
      return;
    }

    const k = this.keys;
    const kbThrottle = (k.has('w') || k.has('arrowup')) ? 1 : 0;
    const kbBrake = (k.has('s') || k.has('arrowdown')) ? 1 : 0;

    this.state.throttle = Math.max(kbThrottle, this.touch.throttle);
    this.state.brake = Math.max(kbBrake, this.touch.brake);

    let steer = this.touch.steer;
    if (k.has('a') || k.has('arrowleft')) steer -= 1;
    if (k.has('d') || k.has('arrowright')) steer += 1;
    this.state.steer = Math.max(-1, Math.min(1, steer));

    this.state.handbrake = this.touch.handbrake || k.has(' ') || k.has('spacebar');
  }
}
