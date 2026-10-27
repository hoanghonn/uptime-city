import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import { STAGES } from '@uptime/core'
import { runCommand, type ChatClient, type CommandInput } from './command'
import { buildRival } from './rival'
import { bridgeStt, type SocketLike } from './stt'
import { MAX_TTS_CHARS, synthesize, type TtsDeps } from './tts'
import { VOICES, type VoiceName } from './voices'

export type Deps = {
  meta: ChatClient
  bot: ChatClient
  botModel?: string
  stt?: { connect: () => SocketLike; apiKey: string }
  tts?: TtsDeps
}

export function buildApp(deps: Deps) {
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 })
  app.register(websocket, { options: { maxPayload: 64 * 1024 } })

  app.post<{ Body: CommandInput }>('/api/command', async (req, reply) => {
    const body = req.body
    if (!body || !STAGES[body.stageId] || typeof body.transcript !== 'string') {
      return reply.code(400).send({ error: 'bad request' })
    }
    return runCommand(deps.meta, { ...body, transcript: body.transcript.slice(0, 500) })
  })

  app.post<{ Body: { stageId: string } }>('/api/rival', async (req, reply) => {
    const stage = STAGES[req.body?.stageId]
    if (!stage) return reply.code(400).send({ error: 'bad request' })
    return buildRival(deps.bot, stage, { model: deps.botModel ?? 'meta-models/muse-spark-open' })
  })

  app.post<{ Body: { voice: VoiceName; text: string } }>('/api/tts', async (req, reply) => {
    const { voice, text } = req.body ?? ({} as any)
    if (!VOICES[voice] || typeof text !== 'string' || !text.trim() || text.length > MAX_TTS_CHARS) {
      return reply.code(400).send({ error: 'bad request' })
    }
    const audio = deps.tts ? await synthesize(deps.tts, voice, text).catch(() => null) : null
    if (!audio) return reply.code(503).send({ error: 'voice unavailable' })
    return reply.type('audio/mpeg').send(Buffer.from(audio))
  })

  app.register(async (scoped) => {
    scoped.get('/ws/stt', { websocket: true }, (socket) => {
      if (!deps.stt) return socket.close()
      bridgeStt(socket as unknown as SocketLike, deps.stt.connect, deps.stt.apiKey)
    })
  })

  app.get('/api/health', async () => ({ ok: true }))
  return app
}
