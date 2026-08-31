type AudioWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

function createContext() {
  const AudioContextClass = window.AudioContext || (window as AudioWindow).webkitAudioContext;
  if (!AudioContextClass) return null;
  const context = new AudioContextClass();
  if (context.state === 'suspended') void context.resume();
  return context;
}

function tone(context: AudioContext, frequency: number, duration: number, type: OscillatorType = 'sine', delay = 0) {
  window.setTimeout(() => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    gain.gain.setValueAtTime(0.45, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  }, delay);
}

export function initializeScannerAudio() {
  try { createContext()?.close(); } catch { /* El navegador puede bloquear audio antes de la interacción. */ }
}

export function playScanTone(kind: 'success' | 'warning' | 'error') {
  try {
    const context = createContext();
    if (!context) return;
    if (kind === 'success') {
      tone(context, 659.25, 0.08);
      tone(context, 880, 0.15, 'sine', 70);
    } else if (kind === 'warning') {
      tone(context, 880, 0.1, 'triangle');
      tone(context, 620, 0.14, 'triangle', 100);
    } else {
      tone(context, 150, 0.24, 'sawtooth');
      tone(context, 125, 0.34, 'square', 270);
    }
    window.setTimeout(() => void context.close(), 900);
  } catch { /* El sonido es auxiliar; nunca debe bloquear el escaneo. */ }
}
