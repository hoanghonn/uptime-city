import { STAGES } from '@uptime/core'
import type { Game } from './flow'

export const STEPS = ['Build', 'Stress test', 'Result'] as const

/** One plain sentence: what the player should do right now. */
export function nextStep(g: Game, ctx: { rivalReady: boolean; voice: boolean }): { step: number; text: string } {
  const how = ctx.voice ? 'click it on the right, or hold Space and say it' : 'click it on the right, or type it below'
  const types = new Set(g.city.buildings.map((b) => b.type))
  const stage = STAGES[g.stageId]
  switch (g.phase) {
    case 'briefing':
    case 'map':
      return { step: 0, text: 'Read the briefing, then start building.' }
    case 'build': {
      if (types.size === 0) return { step: 0, text: `Your city is empty. Start with a load balancer: ${how}.` }
      if (!types.has('lb')) return { step: 0, text: `Add a load balancer, so traffic has a way in: ${how}.` }
      if (!types.has('api')) return { step: 0, text: `Add an API server to do the work: ${how}.` }
      if (!types.has('sql') && !types.has('nosql')) return { step: 0, text: `Add a database, so the servers have data to answer with: ${how}.` }
      const extra = stage.experiment ? 'Finish the checklist, then press Submit.' : 'Add anything else you think it needs, then press Submit to start the stress test.'
      return { step: 0, text: `Your city can serve traffic. ${extra}` }
    }
    case 'firefight':
      return { step: 1, text: `Chaos card! You get one fix: ${ctx.voice ? 'hold Space and shout it, or click it on the right' : 'click it on the right, or type it below'}.` }
    case 'test':
    case 'replay':
      return { step: 1, text: 'Watch the traffic. Red buildings are overloaded; red dots are requests being dropped.' }
    case 'result':
      return { step: 2, text: 'See what broke and why, then play again or try the next stage.' }
  }
}
