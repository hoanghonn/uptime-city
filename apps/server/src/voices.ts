import { STAGES } from '@uptime/core'
export type VoiceName = 'hero' | 'rival' | 'commentator'

/** ElevenLabs premade voices. */
export const VOICES: Record<VoiceName, { id: string; label: string }> = {
  hero: { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Nova, the hero' },
  rival: { id: 'pNInz6obpgDQGcFmaJgB', label: 'Rusty, the rival' },
  commentator: { id: 'JBFqnCBsd6RMkjVDRZzb', label: 'The commentator' },
}

/** Fixed lines, generated once into apps/web/public/lines/<key>.mp3 by scripts/pregen-lines.ts. */
const HAND_WRITTEN: Record<string, { voice: VoiceName; text: string }> = {
  'hero.ready': { voice: 'hero', text: "Nova here. Tell me what to build, and I'll build it." },
  'hero.comms_down': { voice: 'hero', text: 'Comms are down, type your orders.' },
  'hero.textbook': { voice: 'hero', text: "No answer, so I'm going with the textbook!" },
  'stage.shorty.brief': {
    voice: 'commentator',
    text: 'Stage one, Shorty. A URL shortener: a thousand requests a second, almost all of them reads. Build it, then survive thirty seconds.',
  },
  'rival.shorty.taunt': { voice: 'rival', text: 'Databases are all you need, kid.' },
  'stage.chatter.brief': {
    voice: 'commentator',
    text: 'Stage two, Chatter. A chat app: twelve hundred requests a second, and half of them are messages that must never be lost.',
  },
  'rival.chatter.taunt': { voice: 'rival', text: 'Queues are for people who cannot write fast enough.' },
  'chaos.api_dies': { voice: 'commentator', text: 'Chaos card! One of your API servers just died. Whatever was going there is hitting a wall!' },
  'stage.feed.brief': {
    voice: 'commentator',
    text: 'Stage three, Feed. A photo feed: eight hundred requests a second, and most of them are photos. Big files, big trouble.',
  },
  'rival.feed.taunt': { voice: 'rival', text: 'More servers. The answer is always more servers.' },
  'chaos.continent': { voice: 'commentator', text: 'Chaos card! A whole continent just woke up. Six times the traffic!' },
  'stage.ticket_rush.brief': {
    voice: 'commentator',
    text: 'The boss stage. A million fans, one concert, tickets on sale now. Two chaos cards. Good luck.',
  },
  'rival.ticket_rush.taunt': { voice: 'rival', text: 'Bots are just customers you have not met yet.' },
  'chaos.bots': { voice: 'commentator', text: 'Chaos card! A bot army is scalping tickets. Six thousand fake requests a second!' },
  'chaos.payments': { voice: 'commentator', text: 'Second chaos card! The payment provider is down. Every order needs somewhere safe to wait!' },
  'test.start': { voice: 'commentator', text: "Traffic incoming! Let's see if these cities hold." },
  'chaos.celebrity': {
    voice: 'commentator',
    text: 'Chaos card! A celebrity just tweeted one of your links. Five times the traffic, all on a single link!',
  },
  'firefight.prompt': { voice: 'commentator', text: 'One shouted command. Make it count!' },
  'result.win': { voice: 'commentator', text: "Stage clear! Your city held, and the rival's didn't." },
  'result.lose': { voice: 'commentator', text: 'The rival takes this one. Watch where it broke, and try again.' },
  'result.draw': { voice: 'commentator', text: "Dead heat! Nobody wins this one. Run it back!" },
}

/** Every stage gets a briefing, a rival taunt and a call for each chaos card; hand-written lines win. */
function stageLines(): Record<string, { voice: VoiceName; text: string }> {
  const out: Record<string, { voice: VoiceName; text: string }> = {}
  for (const st of Object.values(STAGES)) {
    out[`stage.${st.id}.brief`] = { voice: 'commentator', text: `${st.title}. ${st.brief}`.slice(0, 200) }
    out[`rival.${st.id}.taunt`] = { voice: 'rival', text: st.rivalTaunt }
    for (const c of st.chaos) out[`chaos.${c.id}`] = { voice: 'commentator', text: `Chaos card! ${c.title}!` }
  }
  return out
}

export const LINES: Record<string, { voice: VoiceName; text: string }> = { ...stageLines(), ...HAND_WRITTEN }
