export type VoiceName = 'hero' | 'rival' | 'commentator'

/** ElevenLabs premade voices. */
export const VOICES: Record<VoiceName, { id: string; label: string }> = {
  hero: { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Nova, the hero' },
  rival: { id: 'pNInz6obpgDQGcFmaJgB', label: 'Rusty, the rival' },
  commentator: { id: 'JBFqnCBsd6RMkjVDRZzb', label: 'The commentator' },
}

/** Fixed lines, generated once into apps/web/public/lines/<key>.mp3 by scripts/pregen-lines.ts. */
export const LINES: Record<string, { voice: VoiceName; text: string }> = {
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
