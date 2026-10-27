// Live check: runs two spoken orders through Muse Spark and simulates the result. Bills real usage.
import OpenAI from 'openai'
import { newCity, STAGES, simulate } from '@uptime/core'
import { runCommand } from '../src/command'
const meta = new OpenAI({ apiKey: process.env.META_API_KEY, baseURL: 'https://api.meta.ai/v1' })
const stage = STAGES.shorty
let city = newCity(stage, 'generalist')
for (const t of ['Round robin balancer, two large servers, SQL with an index and a replica', 'cache']) {
  const s = Date.now()
  const r = await runCommand(meta, { stageId: 'shorty', heroClass: 'generalist', city, transcript: t, phase: 'build' })
  city = r.city
  console.log(`\n> ${t}  (${Date.now() - s} ms)\nhero: ${r.heroLine}\nactions: ${JSON.stringify(r.actions)}\nrejected: ${JSON.stringify(r.rejected)}\naskBack: ${JSON.stringify(r.askBack)}\ncoins: ${city.coins}`)
}
const sim = simulate(city, stage, 'generalist')
console.log('\nserved %', (sim.servedPct * 100).toFixed(1), 'p95', sim.p95Ms, sim.lesson)
