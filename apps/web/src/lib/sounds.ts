/**
 * Sound engine using Web Audio API.
 * All sounds are synthesized — no audio files needed.
 * Sounds are off by default and controlled via the settings store.
 */

import { getSettings } from "./settings";

/* ── Audio context (lazy singleton) ────────────────────── */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/* ── Master volume (kept low so sounds aren't annoying) ── */
const MASTER_VOLUME = 0.12;

/* ── Helper: play a tone with envelope ───────────────── */

function playTone(
  freq: number,
  type: OscillatorType,
  duration: number,
  opts?: {
    volume?: number;
    delay?: number;
    detune?: number;
    attack?: number;
    decay?: number;
    filterFreq?: number;
    filterType?: BiquadFilterType;
  },
) {
  if (!getSettings().soundEnabled) return;
  const ac = getCtx();
  const now = ac.currentTime + (opts?.delay ?? 0);
  const vol = (opts?.volume ?? 1) * MASTER_VOLUME;
  const attack = opts?.attack ?? 0.01;
  const decay = opts?.decay ?? duration * 0.3;

  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  if (opts?.detune) osc.detune.value = opts.detune;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(vol, now + attack);
  gain.gain.setValueAtTime(vol, now + duration - decay);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  if (opts?.filterFreq) {
    const filter = ac.createBiquadFilter();
    filter.type = opts.filterType ?? "lowpass";
    filter.frequency.value = opts.filterFreq;
    osc.connect(filter);
    filter.connect(gain);
  } else {
    osc.connect(gain);
  }

  gain.connect(ac.destination);
  osc.start(now);
  osc.stop(now + duration + 0.05);
}

/* ── Helper: white-noise burst (for click/tap sounds) ── */

function playNoise(duration: number, opts?: { volume?: number; delay?: number; filterFreq?: number }) {
  if (!getSettings().soundEnabled) return;
  const ac = getCtx();
  const now = ac.currentTime + (opts?.delay ?? 0);
  const vol = (opts?.volume ?? 0.5) * MASTER_VOLUME;

  const bufferSize = ac.sampleRate * duration;
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ac.createBufferSource();
  source.buffer = buffer;

  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = opts?.filterFreq ?? 4000;
  filter.Q.value = 0.8;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(vol, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  source.start(now);
  source.stop(now + duration + 0.01);
}

/* ═══════════════════════════════════════════════════════ */
/*  PUBLIC SOUND API                                      */
/* ═══════════════════════════════════════════════════════ */

/** Soft click for button hover */
export function playHover() {
  playNoise(0.04, { volume: 0.15, filterFreq: 6000 });
}

/** Crisp tap for button press */
export function playPress() {
  playTone(800, "sine", 0.06, { volume: 0.4, attack: 0.003, decay: 0.04 });
  playNoise(0.03, { volume: 0.2, filterFreq: 5000 });
}

/** Gentle notification — it's your turn */
export function playYourTurn() {
  playTone(523, "sine", 0.15, { volume: 0.5, filterFreq: 2000 });
  playTone(659, "sine", 0.15, { volume: 0.5, delay: 0.12, filterFreq: 2000 });
  playTone(784, "sine", 0.25, { volume: 0.6, delay: 0.24, filterFreq: 2000 });
}

/** Countdown tick (3-2-1) */
export function playCountdownTick() {
  playTone(440, "sine", 0.1, { volume: 0.5, attack: 0.005, decay: 0.08 });
}

/** Countdown final — GO! */
export function playCountdownGo() {
  playTone(523, "sine", 0.12, { volume: 0.6, attack: 0.005 });
  playTone(784, "sine", 0.2, { volume: 0.7, delay: 0.1 });
}

/** Timer running low warning (last ~5 seconds) */
export function playTimerUrgent() {
  playTone(880, "square", 0.06, { volume: 0.25, filterFreq: 2000 });
}

/** Successful submission (clue, guess, vote) */
export function playSubmit() {
  playTone(600, "sine", 0.1, { volume: 0.45, attack: 0.005 });
  playTone(800, "sine", 0.12, { volume: 0.4, delay: 0.08 });
}

/** Correct answer / positive reveal */
export function playCorrect() {
  playTone(523, "sine", 0.12, { volume: 0.5, attack: 0.005 });
  playTone(659, "sine", 0.12, { volume: 0.5, delay: 0.1 });
  playTone(784, "sine", 0.18, { volume: 0.55, delay: 0.2 });
  playTone(1047, "sine", 0.25, { volume: 0.45, delay: 0.32 });
}

/** Wrong answer / negative reveal */
export function playWrong() {
  playTone(350, "sawtooth", 0.15, { volume: 0.3, filterFreq: 1200 });
  playTone(280, "sawtooth", 0.2, { volume: 0.35, delay: 0.12, filterFreq: 1000 });
}

/** Phase change / new round starting */
export function playPhaseChange() {
  playTone(440, "sine", 0.1, { volume: 0.4, attack: 0.005 });
  playTone(554, "sine", 0.1, { volume: 0.4, delay: 0.08 });
  playTone(659, "sine", 0.15, { volume: 0.45, delay: 0.16 });
}

/** Game over / results reveal */
export function playGameOver() {
  playTone(392, "sine", 0.2, { volume: 0.45 });
  playTone(494, "sine", 0.2, { volume: 0.45, delay: 0.15 });
  playTone(587, "sine", 0.2, { volume: 0.5, delay: 0.3 });
  playTone(784, "sine", 0.35, { volume: 0.55, delay: 0.45 });
}

/** Victory fanfare — you/your team won */
export function playVictory() {
  playTone(523, "sine", 0.12, { volume: 0.5 });
  playTone(659, "sine", 0.12, { volume: 0.5, delay: 0.1 });
  playTone(784, "sine", 0.12, { volume: 0.55, delay: 0.2 });
  playTone(1047, "sine", 0.3, { volume: 0.6, delay: 0.3 });
  playTone(784, "sine", 0.1, { volume: 0.3, delay: 0.55 });
  playTone(1047, "sine", 0.35, { volume: 0.55, delay: 0.63 });
}

/** Player joined the lobby */
export function playPlayerJoin() {
  playTone(600, "sine", 0.08, { volume: 0.3, attack: 0.005 });
  playTone(750, "sine", 0.1, { volume: 0.3, delay: 0.06 });
}

/** Player left */
export function playPlayerLeave() {
  playTone(500, "sine", 0.08, { volume: 0.25 });
  playTone(380, "sine", 0.12, { volume: 0.25, delay: 0.06 });
}

/** Puzzle solved (Shikaku) */
export function playPuzzleSolved() {
  playTone(523, "sine", 0.1, { volume: 0.5 });
  playTone(659, "sine", 0.1, { volume: 0.5, delay: 0.08 });
  playTone(784, "sine", 0.15, { volume: 0.55, delay: 0.16 });
}

/** Reveal / uncover moment */
export function playReveal() {
  playTone(350, "sine", 0.15, { volume: 0.35 });
  playTone(440, "sine", 0.15, { volume: 0.4, delay: 0.1 });
  playTone(523, "sine", 0.15, { volume: 0.4, delay: 0.2 });
  playTone(659, "sine", 0.2, { volume: 0.45, delay: 0.3 });
}

/** Letter hint revealed (Chain Reaction) */
export function playHint() {
  playTone(700, "sine", 0.08, { volume: 0.3, attack: 0.005 });
}

/** Vote cast */
export function playVote() {
  playTone(500, "sine", 0.08, { volume: 0.35, attack: 0.005 });
  playTone(650, "sine", 0.1, { volume: 0.3, delay: 0.06 });
}

/** Game start */
export function playGameStart() {
  playTone(440, "sine", 0.1, { volume: 0.45 });
  playTone(554, "sine", 0.1, { volume: 0.45, delay: 0.1 });
  playTone(659, "sine", 0.12, { volume: 0.5, delay: 0.2 });
  playTone(880, "sine", 0.2, { volume: 0.55, delay: 0.3 });
}
