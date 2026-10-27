import { CLASSES, type HeroClass } from '@uptime/core'
import type { ChatClient } from './command'

// The CV is read once, in memory, to make a hero card, then dropped. Nothing here logs or stores it.

export type HeroCard = { nickname: string; heroClass: HeroClass; quirk: string; catchphrase: string }
export type HeroInput = { text?: string; pdfBase64?: string }
export type ImageClient = { generate: (req: any, opts?: any) => Promise<any> }

export const MAX_CV_TEXT = 20_000
export const MAX_PDF_BASE64 = 4_000_000
const STOCK: HeroCard = { nickname: 'Nova', heroClass: 'generalist', quirk: 'Builds first, asks questions later', catchphrase: 'Let us build something that holds!' }

const SYSTEM = `You turn a CV into a playful hero for Uptime City, a game about building backend systems.
Pick the class whose shape fits the CV's interests. Every class has the same total power; the class is a play style, never a level.
${(Object.keys(CLASSES) as HeroClass[]).map((c) => `- ${c}: ${CLASSES[c].name}. ${CLASSES[c].perk}`).join('\n')}
Students, career changers and mixed CVs are generalist.
Rules: never judge, rate or rank the person. No seniority, no scores, no strengths or weaknesses of the person, no real names, no employer names.
Reply with ONLY JSON: {"nickname": "<2-3 word hero name, not the person's name>", "heroClass": "<one of the classes>", "quirk": "<one fun line about how this hero builds, at most 15 words>", "catchphrase": "<at most 10 words>"}`

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '')

export async function makeHero(client: ChatClient, input: HeroInput): Promise<HeroCard> {
  const content: any[] = [{ type: 'text', text: 'Make the hero for this CV.' }]
  if (input.pdfBase64) content.push({ type: 'file', file: { filename: 'cv.pdf', file_data: `data:application/pdf;base64,${input.pdfBase64}` } })
  else content.push({ type: 'text', text: input.text ?? '' })
  let raw = ''
  try {
    const res = await client.chat.completions.create(
      { model: 'muse-spark-1.3', reasoning_effort: 'minimal', messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content }] },
      { timeout: 25_000 },
    )
    raw = String(res?.choices?.[0]?.message?.content ?? '')
  } catch {
    return { ...STOCK }
  }
  let parsed: any
  try {
    parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
  } catch {
    return { ...STOCK }
  }
  const heroClass: HeroClass = parsed.heroClass in CLASSES ? parsed.heroClass : 'generalist'
  return {
    nickname: clip(parsed.nickname, 24) || STOCK.nickname,
    heroClass,
    quirk: clip(parsed.quirk, 120) || STOCK.quirk,
    catchphrase: clip(parsed.catchphrase, 80) || STOCK.catchphrase,
  }
}

/** A portrait from the class and quirk only: no name, no likeness of the person. */
export async function makePortrait(images: ImageClient, card: Pick<HeroCard, 'heroClass' | 'quirk'>): Promise<string | null> {
  const prompt = `Square game character portrait of a friendly low-poly 3D city-builder hero, the ${CLASSES[card.heroClass].name} class. ${card.quirk}. Glowing teal and violet accents, dark navy background, clean stylised look. No text, no letters, no logos.`
  try {
    const res = await images.generate({ model: 'muse-image-1.0', prompt, n: 1, reasoning_strength: 'low' }, { timeout: 40_000 })
    const b64 = res?.data?.[0]?.b64_json
    return b64 ? `data:image/webp;base64,${b64}` : null
  } catch {
    return null
  }
}

/** At most `perDay` heroes per player per day. */
export class HeroLimits {
  private day = ''
  private counts = new Map<string, number>()
  constructor(private opts: { perDay: number; now?: () => number }) {}
  take(player: string): boolean {
    const day = new Date((this.opts.now ?? Date.now)()).toISOString().slice(0, 10)
    if (day !== this.day) { this.day = day; this.counts.clear() }
    const n = this.counts.get(player) ?? 0
    if (n >= this.opts.perDay) return false
    this.counts.set(player, n + 1)
    return true
  }
}
