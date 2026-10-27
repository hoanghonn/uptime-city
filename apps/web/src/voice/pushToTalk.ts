export type PttState = 'idle' | 'listening' | 'thinking' | 'no-mic' | 'error'

/** Linear resample to 24 kHz mono, then convert to signed 16-bit PCM. */
export function resampleTo24k(input: Float32Array, rate: number): Int16Array {
  const ratio = rate / 24000
  const out = new Int16Array(Math.floor(input.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const i1 = Math.min(i0 + 1, input.length - 1)
    const v = input[i0] + (input[i1] - input[i0]) * (pos - i0)
    const c = Math.max(-1, Math.min(1, v))
    out[i] = c < 0 ? Math.round(c * 32768) : Math.round(c * 32767)
  }
  return out
}

type Capture = { stop(): void }
export type PttOptions = {
  wsUrl: string
  onState(s: PttState): void
  onPartial(text: string): void
  onFinal(text: string): void
  getUserMedia?: () => Promise<MediaStream>
  createSocket?: (url: string) => WebSocket
  /** Starts sending 24 kHz PCM frames to `send`; injectable for tests. */
  startCapture?: (stream: MediaStream, send: (pcm: Int16Array) => void) => Promise<Capture>
}

const FRAME_SAMPLES = 1920 // 80 ms at 24 kHz

/** Default capture: an AudioWorklet posts raw float chunks; we resample and send 80 ms frames. */
async function workletCapture(stream: MediaStream, send: (pcm: Int16Array) => void): Promise<Capture> {
  const ctx = new AudioContext()
  await ctx.audioWorklet.addModule('/pcm-worklet.js')
  const source = ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(ctx, 'pcm-capture')
  let buffer = new Int16Array(0)
  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    const chunk = resampleTo24k(e.data, ctx.sampleRate)
    const merged = new Int16Array(buffer.length + chunk.length)
    merged.set(buffer)
    merged.set(chunk, buffer.length)
    buffer = merged
    while (buffer.length >= FRAME_SAMPLES) {
      send(buffer.slice(0, FRAME_SAMPLES))
      buffer = buffer.slice(FRAME_SAMPLES)
    }
  }
  source.connect(node)
  return {
    stop() {
      if (buffer.length) send(buffer)
      source.disconnect()
      node.disconnect()
      stream.getTracks().forEach((t) => t.stop())
      void ctx.close()
    },
  }
}

/** Hold to talk: opens one /ws/stt session per utterance. */
export class PushToTalk {
  private socket: WebSocket | null = null
  private capture: Capture | null = null
  private active = false
  private opts: Required<PttOptions>

  constructor(opts: PttOptions) {
    this.opts = {
      getUserMedia: () => navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }),
      createSocket: (url) => new WebSocket(url),
      startCapture: workletCapture,
      ...opts,
    }
  }

  async start(): Promise<void> {
    if (this.active) return
    this.active = true
    let stream: MediaStream
    try {
      stream = await this.opts.getUserMedia()
    } catch {
      this.active = false
      this.opts.onState('no-mic')
      return
    }
    const socket = this.opts.createSocket(this.opts.wsUrl)
    socket.binaryType = 'arraybuffer'
    this.socket = socket
    const queue: Int16Array[] = []
    socket.onopen = () => { for (const f of queue.splice(0)) socket.send(f as Int16Array<ArrayBuffer>) }
    socket.onmessage = (e: MessageEvent) => this.onMessage(String(e.data))
    socket.onclose = () => { if (this.socket === socket) this.socket = null }
    this.opts.onState('listening')
    this.capture = await this.opts.startCapture(stream, (pcm) => {
      if (socket.readyState === 1) socket.send(pcm as Int16Array<ArrayBuffer>)
      else queue.push(pcm)
    })
  }

  stop(): void {
    if (!this.active) return
    this.active = false
    this.capture?.stop()
    this.capture = null
    const socket = this.socket
    if (!socket) return
    const end = JSON.stringify({ type: 'end' })
    if (socket.readyState === 1) socket.send(end)
    else socket.addEventListener?.('open', () => socket.send(end))
    this.opts.onState('thinking')
  }

  private onMessage(raw: string) {
    let msg: { type: string; text?: string }
    try { msg = JSON.parse(raw) } catch { return }
    if (msg.type === 'partial') this.opts.onPartial(msg.text ?? '')
    if (msg.type === 'error') { this.opts.onState('error'); this.socket?.close() }
    if (msg.type === 'final') {
      const text = (msg.text ?? '').trim()
      this.opts.onState('idle')
      if (text) this.opts.onFinal(text)
      this.socket?.close()
    }
  }
}
