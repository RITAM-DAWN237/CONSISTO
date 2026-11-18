// Synthesised notification sounds (Web Audio API) — no audio files to download or cache.
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

/** Call from a user gesture so later reminders are allowed to play audio. */
export function unlockAudio(): void {
  getCtx();
}

function tone(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, gain: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(start);
  o.stop(start + dur + 0.05);
}

export function playSound(id: string, volume = 1): void {
  if (!id || id === 'none') return;
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime + 0.02;
  const v = 0.16 * volume;
  switch (id) {
    case 'chime':
      [880, 1108.73, 1318.51].forEach((f, i) => tone(c, f, t + i * 0.13, 0.9, 'sine', v));
      break;
    case 'bell':
      tone(c, 660, t, 1.6, 'sine', v);
      tone(c, 1320, t, 1.1, 'sine', v * 0.4);
      tone(c, 1980, t, 0.7, 'sine', v * 0.2);
      break;
    case 'marimba':
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, f, t + i * 0.09, 0.35, 'sine', v));
      break;
    case 'digital':
      for (let i = 0; i < 3; i++) {
        tone(c, 1046, t + i * 0.24, 0.08, 'square', v * 0.45);
        tone(c, 1046, t + i * 0.24 + 0.1, 0.08, 'square', v * 0.45);
      }
      break;
    case 'soft':
      tone(c, 523.25, t, 0.6, 'triangle', v);
      tone(c, 659.25, t + 0.28, 0.8, 'triangle', v);
      break;
    case 'pop':
      tone(c, 740, t, 0.1, 'sine', v * 0.6);
      tone(c, 1180, t + 0.05, 0.14, 'sine', v * 0.5);
      break;
    case 'success':
      [659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(c, f, t + i * 0.1, 0.55, 'triangle', v));
      break;
    default:
      tone(c, 880, t, 0.5, 'sine', v);
  }
}

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
