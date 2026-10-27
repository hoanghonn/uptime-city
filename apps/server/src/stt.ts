import WebSocket from 'ws'

export const STT_URL = 'wss://api.meta.ai/v1/asr/realtime'
export const STT_MODEL = 'muse-voice-transcribe-1.0'
/** Game vocabulary the model would otherwise mishear ("SQL" came back as "Sukul"). */
export const STT_KEYWORDS = [
  'SQL', 'NoSQL', 'Redis', 'cache', 'load balancer', 'round robin', 'least connections', 'API server', 'read replica',
  'index', 'replica', 'queue', 'worker', 'CDN', 'object storage', 'Kafka', 'Nova', 'Rusty', 'failover',
]

/** The parts of a `ws` WebSocket the bridge uses, so tests can pass fakes. */
export type SocketLike = {
  send(data: string | Buffer): void
  close(): void
  on(event: 'message', cb: (data: Buffer, isBinary: boolean) => void): unknown
  on(event: 'close', cb: (code: number) => void): unknown
  on(event: 'open', cb: () => void): unknown
  on(event: 'error', cb: (err: Error) => void): unknown
}

export const openUpstream = (): SocketLike => new WebSocket(`${STT_URL}?sessionId=uptime-${crypto.randomUUID()}`) as unknown as SocketLike

/**
 * One push-to-talk utterance: browser audio -> Muse Voice Transcribe -> transcript events back to the browser.
 * The API key only ever travels on the upstream socket.
 */
export function bridgeStt(browser: SocketLike, connect: () => SocketLike, apiKey: string): void {
  const upstream = connect()
  const pending: Buffer[] = []
  let ready = false
  let lastPartial = ''
  let finalSent = false
  let browserClosed = false
  let endRequested = false

  const toBrowser = (msg: object) => { if (!browserClosed) browser.send(JSON.stringify(msg)) }
  const sendFinal = (text: string) => {
    if (finalSent) return
    finalSent = true
    toBrowser({ type: 'final', text })
  }

  upstream.on('open', () => {
    upstream.send(JSON.stringify({ authorization: { accessToken: `Bearer ${apiKey}` }, audioEncoding: 'PCM_24KHZ', model: STT_MODEL, mode: 'PUSH_TO_TALK', languageBias: ['English'], keywords: STT_KEYWORDS }))
  })

  upstream.on('message', (data, isBinary) => {
    if (isBinary) return
    let ev: any
    try { ev = JSON.parse(data.toString()) } catch { return }
    if (!ready && ev.sessionId) {
      ready = true
      for (const chunk of pending.splice(0)) upstream.send(chunk)
      if (endRequested) upstream.send(JSON.stringify({ type: 'endStream' }))
      return
    }
    if (ev.type === 'error') {
      finalSent = true // the error is the last word on this utterance
      toBrowser({ type: 'error' })
      upstream.close()
      return
    }
    if (ev.type === 'transcript' && typeof ev.transcript === 'string') {
      if (ev.final) sendFinal(ev.transcript.trim())
      else {
        lastPartial = ev.transcript
        toBrowser({ type: 'partial', text: ev.transcript })
      }
    }
  })

  upstream.on('close', () => {
    sendFinal(lastPartial.trim())
    if (!browserClosed) { browserClosed = true; browser.close() }
  })
  upstream.on('error', () => { toBrowser({ type: 'error' }) })

  browser.on('message', (data, isBinary) => {
    if (isBinary) {
      if (ready) upstream.send(data)
      else pending.push(data)
      return
    }
    let msg: any
    try { msg = JSON.parse(data.toString()) } catch { return }
    if (msg.type === 'end') {
      endRequested = true
      if (ready) upstream.send(JSON.stringify({ type: 'endStream' }))
    }
  })
  browser.on('close', () => {
    browserClosed = true
    upstream.close()
  })
}
