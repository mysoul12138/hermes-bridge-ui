let audioContext: AudioContext | null = null
let unlocked = false
let audioBuffer: AudioBuffer | null = null
let loading = false

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
      // Pre-load the audio file
      loadBellAudio()
    })
    .catch(() => {
      // Browsers may reject until a direct user gesture; the next send will retry.
    })
}

async function loadBellAudio() {
  const ctx = getAudioContext()
  if (!ctx || audioBuffer || loading) return
  loading = true
  try {
    const resp = await fetch('/3924.wav')
    const arrayBuf = await resp.arrayBuffer()
    audioBuffer = await ctx.decodeAudioData(arrayBuf)
  } catch {
    // Failed to load; will retry on next play
    loading = false
  }
}

export function playCompletionBell() {
  const ctx = getAudioContext()
  if (!ctx) return

  const play = () => {
    if (audioBuffer) {
      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)
      source.start()
    }
  }

  if (ctx.state === 'suspended') {
    ctx.resume().then(play).catch(() => {})
    return
  }

  if (!audioBuffer && !loading) {
    loadBellAudio().then(play)
    return
  }
  play()
}
