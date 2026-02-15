/** 8-bit sound effects using Web Audio API. Zero audio files. */

let ctx = null;

function getCtx() {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function playNote(freq, duration, type = "square", volume = 0.15, startTime = 0) {
  const c = getCtx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + startTime);
  gain.gain.setValueAtTime(volume, c.currentTime + startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + startTime + duration);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(c.currentTime + startTime);
  osc.stop(c.currentTime + startTime + duration);
}

function playSweep(startFreq, endFreq, duration, type = "sawtooth", volume = 0.1) {
  const c = getCtx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(endFreq, c.currentTime + duration);
  gain.gain.setValueAtTime(volume, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + duration);
}

export function questComplete() {
  // Arpeggio C5→E5→G5→C6
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => playNote(f, 0.2, "square", 0.12, i * 0.1));
}

export function chestOpen() {
  // Ascending sweep
  playSweep(200, 800, 0.4, "sawtooth", 0.08);
}

export function lootDrop() {
  // High ping
  playNote(1200, 0.15, "sine", 0.1);
  playNote(1600, 0.15, "sine", 0.08, 0.08);
}

export function levelUp() {
  // Fanfare: 5 notes + bass hit
  const melody = [523.25, 659.25, 783.99, 1046.5, 1318.5];
  melody.forEach((f, i) => playNote(f, 0.25, "square", 0.12, i * 0.12));
  // Bass
  playNote(130.81, 0.5, "triangle", 0.2, 0);
  playNote(196, 0.4, "triangle", 0.15, 0.3);
}

export function stepComplete() {
  // Soft click
  playNote(800, 0.08, "sine", 0.08);
}

export function enemyPop() {
  // Quick descending pop
  playSweep(600, 200, 0.15, "square", 0.1);
  playNote(1000, 0.06, "sine", 0.08, 0.05);
}

export function comboPop() {
  // Rising combo sting
  playNote(800, 0.1, "square", 0.08);
  playNote(1000, 0.1, "square", 0.08, 0.06);
  playNote(1200, 0.15, "square", 0.1, 0.12);
}

export function dailyReward() {
  // Sparkling fanfare
  const notes = [440, 554.37, 659.25, 880, 1108.73];
  notes.forEach((f, i) => playNote(f, 0.3, "sine", 0.1, i * 0.08));
  playNote(130.81, 0.6, "triangle", 0.12, 0);
}

export function achievementPing() {
  // Two-note achievement
  playNote(880, 0.15, "sine", 0.1);
  playNote(1320, 0.25, "sine", 0.12, 0.1);
}

export function stepDone() {
  // Satisfying step complete ding
  playNote(660, 0.12, "sine", 0.1);
  playNote(880, 0.15, "sine", 0.08, 0.08);
}

export function coinClick(pitch = 0) {
  // Quick satisfying coin ding, pitch rises with combo
  const base = 1200 + pitch * 50;
  playNote(base, 0.06, "sine", 0.06);
  playNote(base * 1.5, 0.04, "sine", 0.04, 0.03);
}

export function coinMilestone() {
  // Cash register ka-ching
  playNote(1400, 0.08, "square", 0.08);
  playNote(1800, 0.08, "square", 0.06, 0.06);
  playNote(2200, 0.12, "sine", 0.08, 0.12);
}

let ambientOsc = null;
let ambientGain = null;

export function startAmbient() {
  const c = getCtx();
  if (ambientOsc) return;

  ambientOsc = c.createOscillator();
  ambientGain = c.createGain();
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();

  ambientOsc.type = "triangle";
  ambientOsc.frequency.setValueAtTime(65, c.currentTime);
  ambientGain.gain.setValueAtTime(0.03, c.currentTime);

  lfo.type = "sine";
  lfo.frequency.setValueAtTime(0.2, c.currentTime);
  lfoGain.gain.setValueAtTime(10, c.currentTime);

  lfo.connect(lfoGain);
  lfoGain.connect(ambientOsc.frequency);
  ambientOsc.connect(ambientGain);
  ambientGain.connect(c.destination);

  lfo.start();
  ambientOsc.start();
}

export function stopAmbient() {
  if (ambientOsc) {
    ambientOsc.stop();
    ambientOsc = null;
    ambientGain = null;
  }
}

/** Must be called from user gesture to unlock audio */
export function unlock() {
  const c = getCtx();
  if (c.state === "suspended") c.resume();
}
