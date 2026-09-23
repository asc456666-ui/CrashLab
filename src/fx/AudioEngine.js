/**
 * 全部音效用 WebAudio 实时合成，不引入任何外部音频文件，也就没有任何版权风险。
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.ready = false;
    this.lastCrashMs = 0;
  }

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }

    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;

    // 撞击声疊起来容易削顶，串一个限幅器把峰值压住，这样整体音量可以开得更大
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.18;

    this.master.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);

    // 引擎：锯齿波 + 低通，靠音高变化表现加速
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 60;

    this.engineSub = this.ctx.createOscillator();
    this.engineSub.type = 'square';
    this.engineSub.frequency.value = 30;

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 400;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;

    this.engineOsc.connect(this.engineFilter);
    this.engineSub.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);

    this.engineOsc.start();
    this.engineSub.start();

    this.noise = this.makeNoiseBuffer();
    this.ready = true;
  }

  makeNoiseBuffer() {
    const len = this.ctx.sampleRate * 0.6;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    return buf;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  updateEngine(speedKmh, throttle, alive) {
    if (!this.ready) return;

    const target = alive ? 52 + speedKmh * 1.5 + throttle * 26 : 40;
    this.engineOsc.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineSub.frequency.setTargetAtTime(target * 0.5, this.ctx.currentTime, 0.1);
    this.engineFilter.frequency.setTargetAtTime(320 + speedKmh * 7 + throttle * 260, this.ctx.currentTime, 0.1);
    this.engineGain.gain.setTargetAtTime(alive ? 0.13 + throttle * 0.16 : 0.05, this.ctx.currentTime, 0.12);
  }

  /**
   * 撞击声。强度越大越低沉越响，并带一个短促的金属高频。
   */
  crash(impact) {
    if (!this.ready) return;

    const now = performance.now();
    if (now - this.lastCrashMs < 70) return;
    this.lastCrashMs = now;

    const t = this.ctx.currentTime;
    const strength = Math.min(1, impact / 28);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 240 - strength * 120;
    filter.Q.value = 0.8;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.34 + strength * 0.85, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2 + strength * 0.38);

    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + 0.7);

    // 轻撞击额外加一点金属脆响
    if (strength > 0.25) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(900 + Math.random() * 700, t);
      osc.frequency.exponentialRampToValueAtTime(220, t + 0.16);

      const g2 = this.ctx.createGain();
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(0.1 + strength * 0.28, t + 0.012);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);

      osc.connect(g2).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.3);
    }
  }

  stopEngine() {
    if (!this.ready) return;
    this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
  }
}
