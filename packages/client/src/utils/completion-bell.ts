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

export function playCompletionBell() {
  const ctx = getAudioContext()
  if (!ctx) return
  const start = ctx.currentTime

  const play = () => {
    // Three-note ascending arpeggio (E5 → G#5 → B5) with harmonics
    const notes = [
      { frequency: 659, offset: 0.0,  duration: 0.28 },
      { frequency: 831, offset: 0.10, duration: 0.26 },
      { frequency: 988, offset: 0.20, duration: 0.32 },
    ]

    for (const note of notes) {
      // Fundamental — warm sine
      _playTone(ctx, note.frequency, start + note.offset, note.duration, 0.14)
      // 2nd harmonic (octave up) — adds body
      _playTone(ctx, note.frequency * 2, start + note.offset, note.duration * 0.6, 0.025)
      // 3rd harmonic — adds shimmer
      _playTone(ctx, note.frequency * 3, start + note.offset, note.duration * 0.35, 0.008)
    }

    // Reverb tail — faint delayed echoes
    for (const note of notes) {
      _playTone(ctx, note.frequency, start + note.offset + 0.06, note.duration * 1.1, 0.015)
    }
  }

  if (ctx.state === 'suspended') {
    ctx.resume().then(play).catch(() => {})
    return
  }
  play()
}

function _playTone(
  ctx: AudioContext,
  freq: number,
  t0: number,
  dur: number,
  peak: number,
) {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, t0)

  // Smooth attack–decay envelope
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)

  osc.connect(g)
  g.connect(ctx.destination)

  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}
