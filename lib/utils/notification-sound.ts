let sharedAudioContext: AudioContext | null = null;
let lastPlayedAt = 0;

type NotificationSoundOptions = {
  minIntervalMs?: number;
  frequencyHz?: number;
  volume?: number;
  durationMs?: number;
};

const DEFAULT_MIN_INTERVAL_MS = 800;
const DEFAULT_FREQUENCY_HZ = 880;
const DEFAULT_VOLUME = 0.07;
const DEFAULT_DURATION_MS = 180;

const getAudioContext = () => {
  if (typeof window === 'undefined') return null;
  const AudioContextCtor =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!sharedAudioContext) {
    sharedAudioContext = new AudioContextCtor();
  }
  return sharedAudioContext;
};

export const playNotificationSound = (options?: NotificationSoundOptions) => {
  const minIntervalMs = Math.max(
    0,
    Number(options?.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS)
  );
  const now = Date.now();
  if (now - lastPlayedAt < minIntervalMs) return;
  lastPlayedAt = now;

  try {
    const audioContext = getAudioContext();
    if (!audioContext) return;

    if (audioContext.state === 'suspended') {
      void audioContext.resume().catch(() => {
        // Autoplay policies may block until user interaction.
      });
    }

    const startAt = audioContext.currentTime;
    const durationMs = Math.max(
      40,
      Number(options?.durationMs ?? DEFAULT_DURATION_MS)
    );
    const duration = durationMs / 1000;
    const frequencyHz = Math.max(
      220,
      Number(options?.frequencyHz ?? DEFAULT_FREQUENCY_HZ)
    );
    const volume = Math.min(
      0.3,
      Math.max(0.01, Number(options?.volume ?? DEFAULT_VOLUME))
    );

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequencyHz, startAt);

    gainNode.gain.setValueAtTime(0.0001, startAt);
    gainNode.gain.exponentialRampToValueAtTime(volume, startAt + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      startAt + duration
    );

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.02);
  } catch {
    // Keep UX safe: sound failures should not break notifications.
  }
};

export default playNotificationSound;
