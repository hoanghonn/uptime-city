// Live check: ElevenLabs speaks a command as 24 kHz PCM, we stream it through /ws/stt at real-time pace
// and print what Muse Voice Transcribe heard. Needs the server running (npm run dev:server). Bills real usage.
import WebSocket from 'ws'

const text = process.argv[2] ?? 'Round robin balancer, two large servers, SQL with an index and a replica.'
const res = await fetch('https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=pcm_24000', {
  method: 'POST',
  headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY!, 'Content-Type': 'application/json' },
  body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }),
})
const pcm = Buffer.from(await res.arrayBuffer())
console.log(`speech: ${res.status}, ${(pcm.length / 48000).toFixed(1)} s of audio`)

const ws = new WebSocket('ws://localhost:8787/ws/stt')
const started = Date.now()
ws.on('message', (d) => console.log(`${Date.now() - started} ms`, d.toString()))
ws.on('close', () => console.log('closed'))
ws.on('open', async () => {
  const frame = 24000 * 2 * 0.08
  for (let i = 0; i < pcm.length; i += frame) {
    ws.send(pcm.subarray(i, i + frame))
    await new Promise((r) => setTimeout(r, 80))
  }
  ws.send(JSON.stringify({ type: 'end' }))
})
