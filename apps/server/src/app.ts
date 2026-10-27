import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import websocket from '@fastify/websocket'
import { CLASSES, STAGES } from '@uptime/core'
import type { Kind, RunLimits } from './caps'
import { runCommand, type ChatClient, type CommandInput } from './command'
import { HeroLimits, makeHero, makePortrait, MAX_CV_TEXT, MAX_PDF_BASE64, type HeroCard, type ImageClient } from './hero'
import { buildRival, scriptedRival } from './rival'
import { bridgeStt, type SocketLike } from './stt'
import { MAX_TTS_CHARS, synthesize, type TtsDeps } from './tts'
import { PRICES, type Budget } from './usage'
import { VOICES, type VoiceName } from './voices'

export type Deps = {
  meta: ChatClient
  bot: ChatClient
  botModel?: string
  stt?: { connect: () => SocketLike; apiKey: string }
  tts?: TtsDeps
  /** public-demo caps; omitted in tests and local play */
  limits?: RunLimits
  budget?: Budget
  images?: ImageClient
  heroLimits?: HeroLimits
}

export function buildApp(deps: Deps) {
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 })
  app.register(websocket, { options: { maxPayload: 64 * 1024 } })
  const lowPower = () => deps.budget?.exhausted() ?? false

  /** Applies the per-run caps; returns false (and replies) when the request is refused. */
  function admit(req: FastifyRequest, reply: FastifyReply, kind: Kind): boolean {
    if (!deps.limits) return true
    const runId = req.headers['x-run-id']
    if (typeof runId !== 'string' || !runId || runId.length > 64) {
      reply.code(400).send({ error: 'bad request' })
      return false
    }
    const verdict = deps.limits.take(runId, kind)
    if (verdict === 'city_full') reply.code(429).send({ error: 'city_full', message: 'The city is full, try again in a minute.' })
    if (verdict === 'run_limit') reply.code(429).send({ error: 'run_limit', message: 'That is enough orders for one run. Start the stage again.' })
    return verdict === 'ok'
  }

  app.get('/api/status', async () => (lowPower() ? { mode: 'low-power', reason: 'budget' } : { mode: 'full' }))

  app.post<{ Body: CommandInput }>('/api/command', async (req, reply) => {
    const body = req.body
    if (!body || !STAGES[body.stageId] || typeof body.transcript !== 'string') {
      return reply.code(400).send({ error: 'bad request' })
    }
    if (lowPower()) return reply.code(503).send({ error: 'low_power' })
    if (!admit(req, reply, 'command')) return reply
    return runCommand(deps.meta, { ...body, transcript: body.transcript.slice(0, 500) })
  })

  app.post<{ Body: { stageId: string } }>('/api/rival', async (req, reply) => {
    const stage = STAGES[req.body?.stageId]
    if (!stage) return reply.code(400).send({ error: 'bad request' })
    if (lowPower()) return scriptedRival(stage)
    if (!admit(req, reply, 'rival')) return reply
    return buildRival(deps.bot, stage, { model: deps.botModel ?? 'meta-models/muse-spark-open' })
  })

  app.post<{ Body: { voice: VoiceName; text: string } }>('/api/tts', async (req, reply) => {
    const { voice, text } = req.body ?? ({} as any)
    if (!VOICES[voice] || typeof text !== 'string' || !text.trim() || text.length > MAX_TTS_CHARS) {
      return reply.code(400).send({ error: 'bad request' })
    }
    if (lowPower()) return reply.code(503).send({ error: 'low_power' })
    if (!admit(req, reply, 'tts')) return reply
    const audio = deps.tts ? await synthesize(deps.tts, voice, text).catch(() => null) : null
    if (!audio) return reply.code(503).send({ error: 'voice unavailable' })
    deps.budget?.add(text.length * PRICES.ttsPerChar)
    return reply.type('audio/mpeg').send(Buffer.from(audio))
  })

  app.register(async (scoped) => {
    scoped.get('/ws/stt', { websocket: true }, (socket) => {
      if (!deps.stt || lowPower()) return socket.close()
      // 24 kHz 16-bit mono = 48,000 bytes per second of speech
      socket.on('message', (data: Buffer, isBinary: boolean) => {
        if (isBinary) deps.budget?.add((data.length / 48000) * PRICES.sttPerSecond)
      })
      bridgeStt(socket as unknown as SocketLike, deps.stt.connect, deps.stt.apiKey)
    })
  })

  app.post<{ Body: { text?: string; pdfBase64?: string } }>('/api/hero', { bodyLimit: 6 * 1024 * 1024 }, async (req, reply) => {
    const { text, pdfBase64 } = req.body ?? {}
    const hasText = typeof text === 'string' && text.trim().length > 0 && text.length <= MAX_CV_TEXT
    const hasPdf = typeof pdfBase64 === 'string' && pdfBase64.length > 0 && pdfBase64.length <= MAX_PDF_BASE64
    if (!hasText && !hasPdf) return reply.code(400).send({ error: 'bad request' })
    if (lowPower()) return reply.code(503).send({ error: 'low_power' })
    const player = String(req.headers['x-player-id'] ?? req.ip).slice(0, 64)
    if (deps.heroLimits && !deps.heroLimits.take(player)) {
      return reply.code(429).send({ error: 'hero_limit', message: 'That is five heroes today. Come back tomorrow for more.' })
    }
    return makeHero(deps.meta, hasPdf ? { pdfBase64 } : { text })
  })

  app.post<{ Body: Pick<HeroCard, 'heroClass' | 'quirk'> }>('/api/portrait', async (req, reply) => {
    const { heroClass, quirk } = req.body ?? ({} as any)
    if (typeof quirk !== 'string' || quirk.length > 120 || !(heroClass in CLASSES)) return reply.code(400).send({ error: 'bad request' })
    if (!deps.images || lowPower()) return reply.code(503).send({ error: 'unavailable' })
    const url = await makePortrait(deps.images, { heroClass: heroClass as HeroCard['heroClass'], quirk })
    if (!url) return reply.code(503).send({ error: 'unavailable' })
    deps.budget?.add(0.01)
    return { url }
  })

  app.get('/api/health', async () => ({ ok: true }))
  return app
}
