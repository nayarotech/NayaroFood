'use client';

/**
 * A synthesised order chime — no audio asset to ship or 404.
 *
 * Browsers only allow audio after the user has interacted with the page, so
 * one AudioContext is created up front and resumed on the first click or key
 * press. After that, the chime plays even while the tab is in the background,
 * which is exactly when a kitchen needs it.
 */

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (context) return context;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  return context;
}

/** Call once on mount; unlocks audio at the first user gesture. */
export function primeAudio(): () => void {
  const unlock = () => {
    void getContext()?.resume();
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  return () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
}

export function audioUnlocked(): boolean {
  return context?.state === 'running';
}

/** Three rising notes — distinct from OS notification sounds. */
export function playChime(volume = 0.28): void {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  try {
    const start = ctx.currentTime + 0.02;
    [880, 1108.7, 1318.5].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      const at = start + index * 0.14;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(volume, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
      oscillator.start(at);
      oscillator.stop(at + 0.45);
    });
  } catch {
    // Blocked by autoplay policy until the first interaction. Not fatal.
  }
}

const SOUND_KEY = 'nayaro.alerts.sound';

export function soundEnabled(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // Private mode: the preference just won't persist.
  }
  window.dispatchEvent(new Event('nayaro:sound-pref'));
}
