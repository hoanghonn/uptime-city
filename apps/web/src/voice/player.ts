import { runHeaders } from '../game/api'
export type VoiceName = 'hero' | 'rival' | 'commentator'
export type SayItem = { voice: VoiceName; line?: string; text?: string }

export type PlayerDeps = {
  /** Plays an audio URL; resolves when it has finished. */
  playUrl(src: string): Promise<void>
  /** Returns a playable URL for live text, or null when the voice service is unavailable. */
  fetchTts(voice: VoiceName, text: string): Promise<string | null>
  /** The browser's own voice, used when the voice service is unavailable. */
  speak(text: string, voice: VoiceName): Promise<void>
}

/** One queue for every voice, so the hero, the rival and the commentator never talk over each other. */
export function createPlayer(deps: PlayerDeps) {
  let tail: Promise<void> = Promise.resolve()

  async function playOne(item: SayItem) {
    try {
      if (item.line) return await deps.playUrl(`/lines/${item.line}.mp3`)
      if (!item.text) return
      const url = await deps.fetchTts(item.voice, item.text)
      if (url) await deps.playUrl(url)
      else await deps.speak(item.text, item.voice)
    } catch {
      // a clip that fails to play is skipped
    }
  }

  return {
    say(item: SayItem): Promise<void> {
      tail = tail.then(() => playOne(item))
      return tail
    },
  }
}

const PITCH: Record<VoiceName, number> = { hero: 1.2, rival: 0.7, commentator: 1 }

/** The real browser implementation. */
export const browserPlayer = createPlayer({
  playUrl: (src) =>
    new Promise<void>((resolve, reject) => {
      const audio = new Audio(src)
      audio.onended = () => resolve()
      audio.onerror = () => reject(new Error('audio failed'))
      audio.play().catch(reject)
    }),
  fetchTts: async (voice, text) => {
    const res = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json', ...runHeaders() }, body: JSON.stringify({ voice, text }), signal: AbortSignal.timeout(8000) }).catch(() => null)
    if (!res) return null
    if (!res.ok) return null
    return URL.createObjectURL(await res.blob())
  },
  speak: (text, voice) =>
    new Promise<void>((resolve) => {
      if (!('speechSynthesis' in window)) return resolve()
      const u = new SpeechSynthesisUtterance(text)
      u.pitch = PITCH[voice]
      u.onend = () => resolve()
      u.onerror = () => resolve()
      speechSynthesis.speak(u)
    }),
})
