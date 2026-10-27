import { useState } from 'react'
import { HeroCardView } from './HeroCardView'
import { playerId, SAMPLE_CVS, type SavedHero } from './heroStore'

type Props = { hero: SavedHero | null; onHero(hero: SavedHero | null): void }

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-player-id': playerId() }, body: JSON.stringify(body) })
  if (!res.ok) throw Object.assign(new Error(String(res.status)), { status: res.status, body: await res.json().catch(() => ({})) })
  return res.json() as Promise<T>
}

const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })

/** Turn a CV into a hero. The CV goes to the server once and is thrown away; only the card stays, in this browser. */
export function HeroMaker({ hero, onHero }: Props) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function make(input: { text?: string; pdfBase64?: string }) {
    setBusy(true)
    setError('')
    try {
      const card = await postJson<SavedHero>('/api/hero', input)
      onHero(card)
      setText('')
      postJson<{ url: string }>('/api/portrait', { heroClass: card.heroClass, quirk: card.quirk })
        .then(({ url }) => onHero({ ...card, portrait: url }))
        .catch(() => {})
    } catch (e: any) {
      setError(e?.body?.message ?? (e?.status === 503 ? 'Hero making is resting for today. Nova is ready to play.' : 'That did not work. Try pasting the text instead.'))
    } finally {
      setBusy(false)
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    if (file.size > 3_000_000) return setError('That file is too big. Try a PDF under 3 MB, or paste the text.')
    if (file.type === 'application/pdf') return make({ pdfBase64: await toBase64(file) })
    return make({ text: (await file.text()).slice(0, 20000) })
  }

  return (
    <div className="hero-maker">
      {hero ? <HeroCardView hero={hero} /> : <div className="hero-card stock"><div className="portrait placeholder">Nova</div><div className="hero-info"><span className="num">Stock hero</span><h3>Nova</h3><p className="quirk">Pick a class below, or make a hero from a CV.</p></div></div>}
      <div className="maker">
        <b>Make a hero from a CV</b>
        <p className="hint">Your CV is read once to make the hero, then thrown away. We keep nothing; the hero card stays in this browser. The class decides your play style, never how strong you are.</p>
        <div className="row">
          <label className="ghost file">Upload PDF<input type="file" accept="application/pdf,text/plain,.md" hidden onChange={(e) => void onFile(e.target.files?.[0])} disabled={busy} /></label>
          {SAMPLE_CVS.map((s) => <button key={s.label} className="ghost" disabled={busy} onClick={() => void make({ text: s.text })}>Sample: {s.label}</button>)}
          {hero && <button className="ghost" onClick={() => onHero(null)}>Use Nova</button>}
        </div>
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void make({ text }) }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Or paste CV text here..." disabled={busy} />
          <button className="primary" disabled={busy || !text.trim()}>{busy ? 'Making your hero...' : 'Make hero'}</button>
        </form>
        {error && <p className="warn">{error}</p>}
      </div>
    </div>
  )
}
