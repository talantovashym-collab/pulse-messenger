// Pulse Sound Synthesizer using Web Audio API (Zero external assets needed)
class SoundManager {
  constructor() {
    this.audioCtx = null;
    this.muted = localStorage.getItem('pulse_muted') === 'true';
  }

  ensureContext() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('pulse_muted', this.muted);
    return this.muted;
  }

  isMuted() {
    return this.muted;
  }

  playSent() {
    if (this.muted) return;
    try {
      this.ensureContext();
      if (!this.audioCtx) return;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      // Pleasant quick rising pop
      osc.frequency.setValueAtTime(600, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(900, this.audioCtx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.09);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  playReceived() {
    if (this.muted) return;
    try {
      this.ensureContext();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;

      // First chime
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc1.connect(gain1);
      gain1.connect(this.audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.16);

      // Second harmonizing chime
      const osc2 = this.audioCtx.createOscillator();
      const gain2 = this.audioCtx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(880.00, now + 0.08); // A5
      gain2.gain.setValueAtTime(0.15, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc2.connect(gain2);
      gain2.connect(this.audioCtx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.3);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  // Ringing tones for WebRTC calls
  startOutgoingRinging() {
    this.stopRinging();
    if (this.muted) return;
    this.ringInterval = setInterval(() => {
      try {
        this.ensureContext();
        if (!this.audioCtx) return;
        const now = this.audioCtx.currentTime;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 1.25);
      } catch (e) {}
    }, 2800);
  }

  startIncomingRingtone() {
    this.stopRinging();
    if (this.muted) return;
    const playNotes = () => {
      try {
        this.ensureContext();
        if (!this.audioCtx) return;
        const now = this.audioCtx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach((freq, idx) => {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.12);
          gain.gain.setValueAtTime(0.12, now + idx * 0.12);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.2);
          osc.connect(gain);
          gain.connect(this.audioCtx.destination);
          osc.start(now + idx * 0.12);
          osc.stop(now + idx * 0.12 + 0.22);
        });
      } catch (e) {}
    };
    playNotes();
    this.ringInterval = setInterval(playNotes, 2400);
  }

  stopRinging() {
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
  }

  // Play melodic voice memo fallback
  playVoiceMemoMelody() {
    try {
      this.ensureContext();
      if (!this.audioCtx) return;
      const now = this.audioCtx.currentTime;
      const notes = [440, 554.37, 659.25, 830.61, 880]; // A4, C#5, E5, G#5, A5
      notes.forEach((freq, idx) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.35);
        gain.gain.setValueAtTime(0.2, now + idx * 0.35);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.35 + 0.55);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now + idx * 0.35);
        osc.stop(now + idx * 0.35 + 0.6);
      });
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  // Synthesize an audible WAV audio file (used when no physical mic is attached or on fallback)
  async generateAudibleVoiceBlob(durationSec = 3) {
    const sampleRate = 44100;
    const numSamples = Math.floor(sampleRate * durationSec);
    const OfflineCtxClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineCtxClass) {
      return new Blob([], { type: 'audio/wav' });
    }
    const offlineCtx = new OfflineCtxClass(1, numSamples, sampleRate);

    const notes = [329.63, 392.00, 440.00, 523.25, 587.33, 659.25];
    const step = durationSec / notes.length;
    notes.forEach((freq, i) => {
      const osc = offlineCtx.createOscillator();
      const gain = offlineCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, i * step);
      gain.gain.setValueAtTime(0.25, i * step);
      gain.gain.exponentialRampToValueAtTime(0.001, (i + 1) * step);
      osc.connect(gain);
      gain.connect(offlineCtx.destination);
      osc.start(i * step);
      osc.stop((i + 1) * step);
    });

    const renderedBuffer = await offlineCtx.startRendering();
    const channelData = renderedBuffer.getChannelData(0);
    return this.encodeWAV(channelData, sampleRate);
  }

  // Standard PCM WAV encoder
  encodeWAV(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }
}

window.sounds = new SoundManager();
