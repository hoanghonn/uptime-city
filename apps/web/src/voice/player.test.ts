import { describe, expect, it } from 'vitest'
import { createPlayer } from './player'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}

describe('voice player', () => {
  it('queues lines and never overlaps them', async () => {
    const log: string[] = []
    const ends: Record<string, ReturnType<typeof deferred>> = {}
    const player = createPlayer({
      playUrl: (src) => { log.push(`start ${src}`); ends[src] = deferred(); return ends[src].promise.then(() => { log.push(`end ${src}`) }) },
      fetchTts: async () => null,
      speak: async () => {},
    })
    const a = player.say({ line: 'test.start', voice: 'commentator' })
    const b = player.say({ line: 'chaos.celebrity', voice: 'commentator' })
    await Promise.resolve()
    expect(log).toEqual(['start /lines/test.start.mp3'])
    ends['/lines/test.start.mp3'].resolve()
    await a
    await new Promise((r) => setTimeout(r, 0))
    expect(log).toEqual(['start /lines/test.start.mp3', 'end /lines/test.start.mp3', 'start /lines/chaos.celebrity.mp3'])
    ends['/lines/chaos.celebrity.mp3'].resolve()
    await b
  })

  it('live text goes through the tts route', async () => {
    const played: string[] = []
    const player = createPlayer({
      playUrl: async (src) => { played.push(src) },
      fetchTts: async (voice, text) => `blob:${voice}:${text}`,
      speak: async () => { throw new Error('should not speak') },
    })
    await player.say({ text: 'On it!', voice: 'hero' })
    expect(played).toEqual(['blob:hero:On it!'])
  })

  it('falls back to the browser voice when the tts route is unavailable', async () => {
    const spoken: string[] = []
    const player = createPlayer({
      playUrl: async () => {},
      fetchTts: async () => null,
      speak: async (text) => { spoken.push(text) },
    })
    await player.say({ text: 'Comms are down', voice: 'hero' })
    expect(spoken).toEqual(['Comms are down'])
  })

  it('a clip that fails to play does not block the queue', async () => {
    const played: string[] = []
    const player = createPlayer({
      playUrl: async (src) => { if (src.includes('bad')) throw new Error('decode'); played.push(src) },
      fetchTts: async () => null,
      speak: async () => {},
    })
    player.say({ line: 'bad', voice: 'hero' })
    await player.say({ line: 'good', voice: 'hero' })
    expect(played).toEqual(['/lines/good.mp3'])
  })
})

describe('browser player', () => {
  it('sends the run id with live voice requests', async () => {
    const { runHeaders } = await import('../game/api')
    expect(runHeaders()['x-run-id']).toMatch(/[0-9a-f-]{36}/)
  })
})
