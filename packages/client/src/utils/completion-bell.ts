let audioContext: AudioContext | null = null
let unlocked = false

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext
  if (!AudioContextCtor) return null
  if (!audioContext) audioContext = new AudioContextCtor()
  return audioContext
}

export function unlockCompletionBell() {
  const ctx = getAudioContext()
  if (!ctx || unlocked) return
  const resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve()
  resume
    .then(() => {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      gain.gain.value = 0.0001
      oscillator.connect(gain)
      gain.connect(ctx.destination)
      oscillator.start()
      oscillator.stop(ctx.currentTime + 0.01)
      unlocked = true
    })
    .catch(() => {
      // Browsers may reject until a direct user gesture; the next send will retry.
    })
}

/**
 * Play a rich, textured completion chime.
 *
 * Design: three ascending notes (E5 → G#5 → B5) forming a bright major-third
 * arpeggio. Each note is built from a fundamental + soft overtones to mimic
 * a glass/crystal timbre. A shared convolver-style reverb tail (simulated via
 * parallel delayed quiet copies) gives a sense of space. Peak gain is 0.16
 * (~2× the old 0.08).
 */
export function playCompletionBell() {
  const ctx = getAudioContext()
  if (!ctx) return
  const start = ctx.currentTime

  // --- Master gain (overall volume) ---
  const master = ctx.createGain()
  master.gain.value = 0.16
  master.connect(ctx.destination)

  // --- Notes definition ---
  // E5=659.26  G#5=830.61  B5=987.77
  const notes = [
    { freq: 659.26, offset: 0.0,  dur: 0.32, peak: 1.0  },
    { freq: 830.61, offset: 0.12, dur: 0.30, peak: 0.90 },
    { freq: 987.77, offset: 0.24, dur: 0.38, peak: 0.95 },
  ]

  for (const note of notes) {
    const t0 = start + note.offset
    const noteGain = ctx.createGain()
    noteGain.connect(master)

    // Fundamental
    _tone(ctx, noteGain, note.freq, t0, note.dur, note.peak)
    // Soft 2nd harmonic (octave) — gives warmth
    _tone(ctx, noteGain, note.freq * 2, t0, note.dur * 0.65, note.peak * 0.18)
    // Very faint 3rd harmonic — adds shimmer
    _tone(ctx, noteGain, note.freq * 3, t0, note.dur * 0.4, note.peak * 0.06)
  }

  // --- Reverb tail (simulated) ---
  // A quiet, slightly delayed echo of each note to create depth
  const reverbGain = ctx.createGain()
  reverbGain.gain.value = 0.04
  reverbGain.connect(ctx.destination)

  for (const note of notes) {
    const t0 = start + note.offset + 0.08
    _tone(ctx, reverbGain, note.freq, t0, note.dur * 1.2, note.peak * 0.5)
  }
}

/**
 * Internal: create a single oscillator with a smooth attack–decay envelope.
 */
function _tone(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  t0: number,
  dur: number,
  peak: number,
) {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, t0)

  // Envelope: quick attack (6 ms), sustain, smooth exponential decay
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)

  osc.connect(g)
  g.connect(dest)

  osc.start(t0)
  osc.stop(t0 + dur + 0.02) // small buffer past decay
}
