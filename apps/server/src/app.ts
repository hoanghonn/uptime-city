import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import { STAGES } from '@uptime/core'
import { runCommand, type ChatClient, type CommandInput } from './command'
import { bridgeStt, type SocketLike } from './stt'

export type Deps = {
  meta: ChatClient
  bot: ChatClient
  stt?: { connect: () => SocketLike; apiKey: string }
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

  app.register(async (scoped) => {
    scoped.get('/ws/stt', { websocket: true }, (socket) => {
      if (!deps.stt) return socket.close()
      bridgeStt(socket as unknown as SocketLike, deps.stt.connect, deps.stt.apiKey)
    })
  })

  app.get('/api/health', async () => ({ ok: true }))
  return app
}
