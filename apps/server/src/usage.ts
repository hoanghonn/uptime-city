import type { ChatClient } from './command'

/** USD per token. From docs/FACTS.md: Muse Spark and Muse Spark Open both cost $1.25 / $4.25 per million tokens. */
export const PRICES = {
  museSpark: { input: 1.25 / 1e6, output: 4.25 / 1e6 },
  /** ElevenLabs flash, roughly $0.08 per 1,000 characters */
  ttsPerChar: 0.08 / 1000,
  /** Muse Voice Transcribe, $0.18 per hour of audio */
  sttPerSecond: 0.18 / 3600,
}

type Opts = { dailyUsd: number; now?: () => number }

/** A daily spend estimate; when it passes the cap the game drops to low-power mode until midnight UTC. */
export class Budget {
  private day = ''
  private spent = 0
  constructor(private opts: Opts) {}

  private roll() {
    const day = new Date((this.opts.now ?? Date.now)()).toISOString().slice(0, 10)
    if (day !== this.day) { this.day = day; this.spent = 0 }
  }
  add(usd: number) { this.roll(); this.spent += usd }
  spentUsd() { this.roll(); return this.spent }
  exhausted() { this.roll(); return this.spent >= this.opts.dailyUsd }
}

/** Wraps a chat client so every response's token usage is added to the budget. */
export function metered(client: ChatClient, budget: Budget, price: { input: number; output: number }): ChatClient {
  return {
    chat: {
      completions: {
        create: async (req: any, opts?: any) => {
          const res = await client.chat.completions.create(req, opts)
          const u = res?.usage
          if (u) budget.add((u.prompt_tokens ?? 0) * price.input + (u.completion_tokens ?? 0) * price.output)
          return res
        },
      },
    },
  }
}
