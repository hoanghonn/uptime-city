import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { bridgeStt, type SocketLike } from '../src/stt'

class FakeSocket extends EventEmitter implements SocketLike {
  sent: (string | Buffer)[] = []
  closed = false
  send(data: string | Buffer) { this.sent.push(data) }
  close() { if (!this.closed) { this.closed = true; this.emit('close', 1000) } }
  texts() { return this.sent.filter((x): x is string => typeof x === 'string').map((x) => JSON.parse(x)) }
}

function setup() {
  const browser = new FakeSocket()
  const upstream = new FakeSocket()
  bridgeStt(browser, () => upstream, 'secret-key')
  return { browser, upstream }
}

const handshakeOk = (u: FakeSocket) => u.emit('message', Buffer.from(JSON.stringify({ sessionId: 's1' })), false)
const event = (u: FakeSocket, e: object) => u.emit('message', Buffer.from(JSON.stringify(e)), false)

describe('bridgeStt', () => {
  it('first upstream frame is the auth handshake in PUSH_TO_TALK mode', () => {
    const { upstream } = setup()
    upstream.emit('open')
    expect(upstream.texts()[0]).toEqual({
      authorization: { accessToken: 'Bearer secret-key' },
      audioEncoding: 'PCM_24KHZ',
      model: 'muse-voice-transcribe-1.0',
      mode: 'PUSH_TO_TALK',
      languageBias: ['English'],
      keywords: expect.arrayContaining(['SQL', 'NoSQL', 'load balancer', 'read replica']),
    })
  })

  it('never sends the api key to the browser', () => {
    const { browser, upstream } = setup()
    upstream.emit('open')
    handshakeOk(upstream)
    event(upstream, { type: 'transcript', transcript: 'put a cache', final: false })
    expect(JSON.stringify(browser.sent)).not.toContain('secret-key')
  })

  it('audio sent before the handshake is held, then forwarded in order', () => {
    const { browser, upstream } = setup()
    browser.emit('message', Buffer.from([1, 2]), true)
    upstream.emit('open')
    browser.emit('message', Buffer.from([3, 4]), true)
    expect(upstream.sent.filter(Buffer.isBuffer)).toHaveLength(0)
    handshakeOk(upstream)
    expect(upstream.sent.filter(Buffer.isBuffer)).toEqual([Buffer.from([1, 2]), Buffer.from([3, 4])])
  })

  it('relays partial and final transcripts, and endStream on release', () => {
    const { browser, upstream } = setup()
    upstream.emit('open')
    handshakeOk(upstream)
    event(upstream, { type: 'transcript', transcript: 'put a', final: false })
    browser.emit('message', Buffer.from(JSON.stringify({ type: 'end' })), false)
    expect(upstream.texts().at(-1)).toEqual({ type: 'endStream' })
    event(upstream, { type: 'transcript', transcript: 'Put a cache in front.', final: true })
    expect(browser.texts()).toEqual([
      { type: 'partial', text: 'put a' },
      { type: 'final', text: 'Put a cache in front.' },
    ])
  })

  it('an upstream close mid-utterance still gives the browser a final with the partial text', () => {
    const { browser, upstream } = setup()
    upstream.emit('open')
    handshakeOk(upstream)
    event(upstream, { type: 'transcript', transcript: 'cache in front', final: false })
    upstream.close()
    expect(browser.texts().at(-1)).toEqual({ type: 'final', text: 'cache in front' })
    expect(browser.closed).toBe(true)
  })

  it('an upstream error becomes a browser error without details', () => {
    const { browser, upstream } = setup()
    upstream.emit('open')
    event(upstream, { type: 'error', message: 'invalid key secret-key' })
    expect(browser.texts().at(-1)).toEqual({ type: 'error' })
  })

  it('closing the browser closes upstream', () => {
    const { browser, upstream } = setup()
    browser.close()
    expect(upstream.closed).toBe(true)
  })
})
