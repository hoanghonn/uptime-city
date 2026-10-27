// Live check: a sample CV becomes a hero card and a portrait. Bills real usage.
import { readFileSync, writeFileSync } from 'node:fs'
import OpenAI from 'openai'
import { makeHero, makePortrait } from '../src/hero'
const meta = new OpenAI({ apiKey: process.env.META_API_KEY, baseURL: 'https://api.meta.ai/v1' })
const file = process.argv[2] ?? '../../samples/cv/backend-mai.md'
let s = Date.now()
const card = await makeHero(meta, { text: readFileSync(file, 'utf8') })
console.log(`${Date.now() - s} ms`, card)
s = Date.now()
const url = await makePortrait(meta.images, card)
console.log(`${Date.now() - s} ms portrait`, url ? `${Math.round(url.length / 1024)} KB` : 'none')
if (url && process.argv[3]) writeFileSync(process.argv[3], Buffer.from(url.split(',')[1], 'base64'))
