import Fastify from 'fastify'
import { STAGES } from '@uptime/core'
import { runCommand, type ChatClient, type CommandInput } from './command'

export type Deps = { meta: ChatClient; bot: ChatClient }

export function buildApp(deps: Deps) {
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 })

  app.post<{ Body: CommandInput }>('/api/command', async (req, reply) => {
    const body = req.body
    if (!body || !STAGES[body.stageId] || typeof body.transcript !== 'string') {
      return reply.code(400).send({ error: 'bad request' })
    }
    return runCommand(deps.meta, { ...body, transcript: body.transcript.slice(0, 500) })
  })

  app.get('/api/health', async () => ({ ok: true }))
  return app
}
