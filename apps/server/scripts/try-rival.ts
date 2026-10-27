// Live check: the rival builds stage 1 on Muse Spark Open (Baseten). Bills real usage.
import OpenAI from 'openai'
import { simulate, STAGES } from '@uptime/core'
import { buildRival } from '../src/rival'
const bot = new OpenAI({ apiKey: process.env.BASETEN_API_KEY, baseURL: 'https://inference.baseten.co/v1', defaultHeaders: { Authorization: `Api-Key ${process.env.BASETEN_API_KEY}` } })
const stage = STAGES.shorty
for (let i = 0; i < 3; i++) {
  const s = Date.now()
  const r = await buildRival(bot, stage, { model: process.env.BOT_MODEL ?? 'meta-models/muse-spark-open', timeoutMs: 20000 })
  const sim = simulate(r.city, stage, stage.rivalClass)
  console.log(`${Date.now() - s} ms  source=${r.source}  served=${(sim.servedPct * 100).toFixed(0)}%  lines=${JSON.stringify(r.lines)}\n  ${r.city.buildings.map((b) => `${b.id}:${b.option}${b.addons.length ? '+' + b.addons.join('+') : ''}`).join(' ')}`)
}
