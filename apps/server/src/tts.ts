import { VOICES, type VoiceName } from './voices'

export const TTS_MODEL = 'eleven_flash_v2_5'
export const MAX_TTS_CHARS = 200

export type TtsDeps = { apiKey: string; fetch?: typeof fetch }

/** Returns MP3 bytes, or null when the provider refuses (the browser then uses its own voice). */
export async function synthesize(deps: TtsDeps, voice: VoiceName, text: string): Promise<Uint8Array | null> {
  const f = deps.fetch ?? fetch
  const res = await f(`https://api.elevenlabs.io/v1/text-to-speech/${VOICES[voice].id}`, {
    method: 'POST',
    headers: { 'xi-api-key': deps.apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: TTS_MODEL }),
  })
  if (!res.ok) return null
  return new Uint8Array(await res.arrayBuffer())
}
