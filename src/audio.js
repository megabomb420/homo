/**
 * A tiny generative soundscape: wind, a low drone and a fire that crackles.
 * Nothing starts until the visitor asks for sound.
 */
export class Soundscape {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.nodes = null;
    this.stage = 0;
    this.fire = 0;
    this.snow = 0;
  }

  makeNoiseBuffer(seconds = 4) {
    const rate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, rate * seconds, rate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.018 * white) / 1.018;
      data[i] = last * 3.2;
    }
    return buffer;
  }

  makeCrackleBuffer(seconds = 4) {
    const rate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, rate * seconds, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * 0.018;
    }
    for (let i = 0; i < 80; i += 1) {
      const start = Math.floor(Math.random() * (data.length - rate * 0.08));
      const length = Math.floor(rate * (0.01 + Math.random() * 0.05));
      const amp = 0.12 + Math.random() * 0.5;
      for (let j = 0; j < length; j += 1) {
        const env = Math.pow(1 - j / length, 3);
        data[start + j] += (Math.random() * 2 - 1) * amp * env;
      }
    }
    return buffer;
  }

  async start() {
    if (this.enabled) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.ctx.destination);

      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 16;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.01;
      compressor.release.value = 0.4;
      compressor.connect(this.master);

      // Wind: filtered brown noise.
      this.windSource = this.ctx.createBufferSource();
      this.windSource.buffer = this.makeNoiseBuffer(5);
      this.windSource.loop = true;
      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = "lowpass";
      this.windFilter.frequency.value = 420;
      this.windFilter.Q.value = 0.4;
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0.055;
      this.windSource.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(compressor);

      // A slow, almost subliminal drone.
      this.droneGain = this.ctx.createGain();
      this.droneGain.gain.value = 0.028;
      const droneFilter = this.ctx.createBiquadFilter();
      droneFilter.type = "lowpass";
      droneFilter.frequency.value = 220;
      this.droneGain.connect(droneFilter);
      droneFilter.connect(compressor);
      this.drones = [55, 82.5, 110].map((frequency, i) => {
        const oscillator = this.ctx.createOscillator();
        oscillator.type = i === 2 ? "triangle" : "sine";
        oscillator.frequency.value = frequency;
        oscillator.detune.value = (i - 1) * 7;
        const gain = this.ctx.createGain();
        gain.gain.value = i === 2 ? 0.1 : 0.35;
        oscillator.connect(gain);
        gain.connect(this.droneGain);
        return oscillator;
      });

      // Fire: a loop of sparse pops.
      this.fireSource = this.ctx.createBufferSource();
      this.fireSource.buffer = this.makeCrackleBuffer(4);
      this.fireSource.loop = true;
      this.fireFilter = this.ctx.createBiquadFilter();
      this.fireFilter.type = "bandpass";
      this.fireFilter.frequency.value = 1400;
      this.fireFilter.Q.value = 0.7;
      this.fireGain = this.ctx.createGain();
      this.fireGain.gain.value = 0;
      this.fireSource.connect(this.fireFilter);
      this.fireFilter.connect(this.fireGain);
      this.fireGain.connect(compressor);

      this.drones.forEach((oscillator) => oscillator.start());
      this.windSource.start();
      this.fireSource.start();
    }

    await this.ctx.resume();
    this.enabled = true;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.5, now + 2.2);
    this.applyStage(true);
  }

  stop() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + 0.9);
    this.enabled = false;
  }

  async toggle() {
    if (this.enabled) {
      this.stop();
      return false;
    }
    await this.start();
    return true;
  }

  setStage(stageIndex, fire, snow) {
    this.stage = stageIndex;
    this.fire = fire;
    this.snow = snow;
    if (this.enabled) this.applyStage(false);
  }

  applyStage(immediate) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const smooth = immediate ? 0.05 : 1.4;
    const stage = this.stage;

    const windBase = [0.05, 0.038, 0.045, 0.135, 0.02, 0.032, 0.045][stage] ?? 0.05;
    const windCutoff = [380, 520, 300, 1600, 180, 260, 460][stage] ?? 400;
    const droneBase = [0.034, 0.026, 0.02, 0.025, 0.045, 0.038, 0.032][stage] ?? 0.03;
    const fireBase = this.fire * [0, 0, 0.17, 0.06, 0.16, 0.12, 0][stage] ?? 0;

    this.windGain.gain.setTargetAtTime(windBase + this.snow * 0.035, now, smooth);
    this.windFilter.frequency.setTargetAtTime(windCutoff, now, smooth);
    this.droneGain.gain.setTargetAtTime(droneBase, now, smooth);
    this.fireGain.gain.setTargetAtTime(fireBase, now, 0.7);
    this.drones.forEach((oscillator, i) => {
      const base = [55, 82.5, 110][i];
      const target = base * (1 + stage * 0.004);
      oscillator.frequency.setTargetAtTime(target, now, 1.5);
    });
  }
}
