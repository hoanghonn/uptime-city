import OpenAI from 'openai'
import { buildApp } from './app'
import { RunLimits } from './caps'
import { openUpstream } from './stt'
import { Budget, metered, PRICES } from './usage'

const meta = new OpenAI({ apiKey: process.env.META_API_KEY, baseURL: 'https://api.meta.ai/v1' })
const bot = new OpenAI({
  apiKey: process.env.BASETEN_API_KEY,
  baseURL: 'https://inference.baseten.co/v1',
  defaultHeaders: { Authorization: `Api-Key ${process.env.BASETEN_API_KEY}` },
})

const budget = new Budget({ dailyUsd: Number(process.env.DAILY_BUDGET_USD ?? 6) })
const app = buildApp({ meta: metered(meta, budget, PRICES.museSpark), bot: metered(bot, budget, PRICES.museSpark), budget, limits: new RunLimits({}), botModel: process.env.BOT_MODEL, tts: { apiKey: process.env.ELEVENLABS_API_KEY ?? '' }, stt: { connect: openUpstream, apiKey: process.env.META_API_KEY ?? '' } })
const port = Number(process.env.PORT ?? 8787)
app.listen({ port, host: '0.0.0.0' }).then(() => console.log(`Uptime City server on :${port}`))
