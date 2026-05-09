let audioContext: AudioContext | null = null
let unlocked = false
let audioBuffer: AudioBuffer | null = null
let loadPromise: Promise<void> | null = null

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
      ensureLoaded()
    })
    .catch(() => {
      // Browsers may reject until a direct user gesture; the next send will retry.
    })
}

function ensureLoaded(): Promise<void> {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    const ctx = getAudioContext()
    if (!ctx) return
    try {
      const resp = await fetch('/3924.wav')
      const arrayBuf = await resp.arrayBuffer()
      audioBuffer = await ctx.decodeAudioData(arrayBuf)
    } catch {
      loadPromise = null // allow retry
    }
  })()
  return loadPromise
}

function doPlay() {
  const ctx = getAudioContext()
  if (!ctx || !audioBuffer) return
  const source = ctx.createBufferSource()
  source.buffer = audioBuffer
  source.connect(ctx.destination)
  source.start()
}

export function playCompletionBell() {
  const ctx = getAudioContext()
  if (!ctx) return

  const play = () => doPlay()

  if (ctx.state === 'suspended') {
    ctx.resume().then(play).catch(() => {})
    return
  }

  if (audioBuffer) {
    play()
  } else {
    // Load first, then play — handles both "not started" and "still loading"
    ensureLoaded().then(play)
  }
}
