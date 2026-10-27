import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import fastifyStatic from '@fastify/static'
import OpenAI from 'openai'
import { buildApp } from './app'
import { RunLimits } from './caps'
import { HeroLimits } from './hero'
import { openUpstream } from './stt'
import { Budget, metered, PRICES } from './usage'

const meta = new OpenAI({ apiKey: process.env.META_API_KEY, baseURL: 'https://api.meta.ai/v1' })
const bot = new OpenAI({
  apiKey: process.env.BASETEN_API_KEY,
  baseURL: 'https://inference.baseten.co/v1',
  defaultHeaders: { Authorization: `Api-Key ${process.env.BASETEN_API_KEY}` },
})

const budget = new Budget({ dailyUsd: Number(process.env.DAILY_BUDGET_USD ?? 6) })
const app = buildApp({ meta: metered(meta, budget, PRICES.museSpark), bot: metered(bot, budget, PRICES.museSpark), budget, limits: new RunLimits({}), images: meta.images, heroLimits: new HeroLimits({ perDay: 5 }), botModel: process.env.BOT_MODEL, tts: { apiKey: process.env.ELEVENLABS_API_KEY ?? '' }, stt: { connect: openUpstream, apiKey: process.env.META_API_KEY ?? '' } })
// In production the same server hands out the built web app.
const web = fileURLToPath(new URL('../../web/dist/', import.meta.url))
if (existsSync(web)) {
  app.register(fastifyStatic, { root: web, wildcard: false })
  app.setNotFoundHandler((req, reply) =>
    req.method === 'GET' && !req.url.startsWith('/api/') ? reply.sendFile('index.html') : reply.code(404).send({ error: 'not found' }),
  )
}

const port = Number(process.env.PORT ?? 8787)
app.listen({ port, host: '0.0.0.0' }).then(() => console.log(`Uptime City server on :${port}`))
