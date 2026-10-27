// Generates apps/web/public/lines/<key>.mp3 for every fixed line. Skips files that exist. Bills ElevenLabs characters.
import { existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { synthesize } from '../src/tts'
import { LINES } from '../src/voices'

const dir = fileURLToPath(new URL('../../web/public/lines/', import.meta.url))
const force = process.argv.includes('--force')
for (const [key, line] of Object.entries(LINES)) {
  const file = `${dir}${key}.mp3`
  if (existsSync(file) && !force) continue
  const audio = await synthesize({ apiKey: process.env.ELEVENLABS_API_KEY! }, line.voice, line.text)
  if (!audio) throw new Error(`ElevenLabs refused ${key}`)
  writeFileSync(file, audio)
  console.log(`${key}: ${audio.length} bytes`)
}
