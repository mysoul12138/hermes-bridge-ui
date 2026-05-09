type AudioContextConstructor = typeof AudioContext

type WindowWithWebkitAudio = Window & typeof globalThis & {
  webkitAudioContext?: AudioContextConstructor
}

let audioContext: AudioContext | null = null
let audioBuffer: AudioBuffer | null = null
let loadPromise: Promise<void> | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null

  const AudioContextCtor = window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext
  if (!AudioContextCtor) return null

  if (!audioContext) {
    audioContext = new AudioContextCtor()
  }

  return audioContext
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

export function primeCompletionSound(): void {
  const ctx = getAudioContext()
  if (!ctx || ctx.state !== 'suspended') return

  void ctx.resume().catch(() => {
    // Browser autoplay policy may still reject until a user gesture. Ignore; the
    // next send action will try again.
  })

  // Pre-load audio file
  ensureLoaded()
}

export async function playCompletionSound(): Promise<boolean> {
  const ctx = getAudioContext()
  if (!ctx) return false

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    // Ensure audio is loaded (handles both "not started" and "still loading")
    if (!audioBuffer) {
      await ensureLoaded()
    }

    if (audioBuffer) {
      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)
      source.start()
      return true
    }

    return false
  } catch (err) {
    console.warn('Failed to play completion sound:', err)
    return false
  }
}

export function __resetCompletionSoundForTests(): void {
  audioContext = null
  audioBuffer = null
  loadPromise = null
}
