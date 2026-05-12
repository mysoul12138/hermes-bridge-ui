/**
 * Convert speed multiplier (0.5-2.0) to Edge TTS rate string.
 * Edge TTS rate format: "+/-NN%"
 */
export function speedToEdgeRate(speed: number): string {
  const percent = Math.round((speed - 1) * 100)
  return percent >= 0 ? `+${percent}%` : `${percent}%`
}

/**
 * Convert pitch offset in Hz (-20..20) to Edge TTS pitch string.
 * Edge TTS pitch format: "+/-NNHz"
 */
export function hzToEdgePitch(hz: number): string {
  const rounded = Math.round(hz)
  return rounded >= 0 ? `+${rounded}Hz` : `${rounded}Hz`
}
