const WINDOW_SECONDS = 0.1;
const MIN_DELAY_SECONDS = 0.05;
const BUFFER_SECONDS = 0.8;

class PitchShiftProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.sampleRateValue = sampleRate;
    this.windowSize = Math.max(64, Math.round(this.sampleRateValue * WINDOW_SECONDS));
    this.minDelay = Math.max(32, Math.round(this.sampleRateValue * MIN_DELAY_SECONDS));
    this.bufferLength = nextPowerOfTwo(Math.round(this.sampleRateValue * BUFFER_SECONDS));
    this.channelBuffers = [];
    this.writeIndex = 0;
    this.phase = 0;
    this.phaseOffset = 0.5;
    this.semitones = 0;
    this.ratio = 1;
    this.volume = 1;
    this.muted = false;

    this.port.onmessage = (event) => {
      const data = event.data ?? {};

      if (data.type === "set-semitones") {
        const semitones = Number(data.semitones);
        this.semitones = Number.isFinite(semitones) ? semitones : 0;
        this.ratio = Math.pow(2, this.semitones / 12);
      }

      if (data.type === "sync-media-state") {
        this.volume = clamp(Number(data.volume), 0, 1, 1);
        this.muted = Boolean(data.muted);
      }
    };
  }

  ensureBuffers(channelCount) {
    while (this.channelBuffers.length < channelCount) {
      this.channelBuffers.push(new Float32Array(this.bufferLength));
    }
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!output?.length) {
      return true;
    }

    const channelCount = output.length;
    this.ensureBuffers(channelCount);

    const frameCount = output[0].length;

    for (let i = 0; i < frameCount; i += 1) {
      for (let channel = 0; channel < channelCount; channel += 1) {
        const outChannel = output[channel];
        const inChannel = input[channel] || input[0] || ZERO_BLOCK;
        const ring = this.channelBuffers[channel];
        const inputSample = inChannel[i] || 0;
        ring[this.writeIndex] = inputSample;

        let sample = inputSample;

        if (Math.abs(this.ratio - 1) > 0.0001) {
          sample = this.readShiftedSample(ring, this.phase, this.phaseOffset);
        }

        outChannel[i] = this.muted ? 0 : sample * this.volume;
      }

      this.advancePhase();
      this.writeIndex = (this.writeIndex + 1) & (this.bufferLength - 1);
    }

    return true;
  }

  readShiftedSample(ring, phaseA, offset) {
    const phaseB = (phaseA + offset) % 1;
    const delayA = this.computeDelay(phaseA);
    const delayB = this.computeDelay(phaseB);
    const sampleA = readInterpolated(ring, this.writeIndex - delayA, this.bufferLength);
    const sampleB = readInterpolated(ring, this.writeIndex - delayB, this.bufferLength);
    const gainA = hann(phaseA);
    const gainB = hann(phaseB);
    const norm = gainA + gainB || 1;

    return (sampleA * gainA + sampleB * gainB) / norm;
  }

  computeDelay(phase) {
    const slopeMagnitude = Math.abs(1 - this.ratio);
    const sweep = slopeMagnitude * this.windowSize;

    if (this.ratio > 1) {
      return this.minDelay + (1 - phase) * sweep;
    }

    return this.minDelay + phase * sweep;
  }

  advancePhase() {
    const increment = Math.abs(1 - this.ratio) / this.windowSize;
    this.phase += increment;

    if (this.phase >= 1) {
      this.phase -= 1;
    }
  }
}

function hann(phase) {
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);
}

function readInterpolated(buffer, position, bufferLength) {
  const mask = bufferLength - 1;
  const wrapped = positiveModulo(position, bufferLength);
  const indexA = Math.floor(wrapped);
  const indexB = (indexA + 1) & mask;
  const fraction = wrapped - indexA;

  return buffer[indexA] + (buffer[indexB] - buffer[indexA]) * fraction;
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function nextPowerOfTwo(value) {
  let result = 1;

  while (result < value) {
    result <<= 1;
  }

  return result;
}

function clamp(value, min, max, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, value));
}

const ZERO_BLOCK = new Float32Array(128);

registerProcessor("pitch-shift-processor", PitchShiftProcessor);
