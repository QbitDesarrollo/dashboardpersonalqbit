let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

export type SoundType = 'chime' | 'bell' | 'pop' | 'ding' | 'soft';

export const SOUND_LABELS: Record<SoundType, string> = {
  chime: 'Chime (dos tonos)',
  bell: 'Campana',
  pop: 'Pop',
  ding: 'Ding',
  soft: 'Suave',
};

export const SOUND_TYPES = Object.keys(SOUND_LABELS) as SoundType[];

function playTone(
  ctx: AudioContext,
  freq: number,
  startAt: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(volume, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration);
}

function playChime(ctx: AudioContext) {
  const now = ctx.currentTime;
  playTone(ctx, 659.25, now, 0.15, 0.3);       // E5
  playTone(ctx, 783.99, now + 0.18, 0.15, 0.3); // G5
}

function playBell(ctx: AudioContext) {
  const now = ctx.currentTime;
  playTone(ctx, 830.61, now, 0.4, 0.25, 'sine');      // G#5
  playTone(ctx, 1244.51, now, 0.3, 0.1, 'sine');       // D#6 harmonic
  playTone(ctx, 1661.22, now, 0.2, 0.05, 'triangle');  // G#6 overtone
}

function playPop(ctx: AudioContext) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);
  gain.gain.setValueAtTime(0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.1);
}

function playDing(ctx: AudioContext) {
  const now = ctx.currentTime;
  playTone(ctx, 1046.5, now, 0.35, 0.3, 'sine'); // C6 single bright tone
}

function playSoft(ctx: AudioContext) {
  const now = ctx.currentTime;
  playTone(ctx, 440, now, 0.25, 0.15, 'triangle');      // A4
  playTone(ctx, 554.37, now + 0.2, 0.25, 0.15, 'triangle'); // C#5
}

const soundPlayers: Record<SoundType, (ctx: AudioContext) => void> = {
  chime: playChime,
  bell: playBell,
  pop: playPop,
  ding: playDing,
  soft: playSoft,
};

/**
 * Plays a notification sound of the given type.
 * Defaults to 'chime' if type is not recognized.
 */
export function playNotificationSound(type: SoundType = 'chime') {
  const ctx = getAudioContext();
  if (!ctx) return;
  const player = soundPlayers[type] || soundPlayers.chime;
  player(ctx);
}
