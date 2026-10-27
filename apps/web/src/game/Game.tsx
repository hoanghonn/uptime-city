import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { applyAction, autoWire, CATALOG, CLASSES, guideEntry, guideFor, rivalProgress, scriptedRival, STAGES, STAGE_ORDER, type City, type HeroClass } from '@uptime/core'
import { GuideModal } from './Guide'
import { City3D } from '../city/City3D'
import { HeroMaker } from '../hero/HeroMaker'
import { clearHero, loadHero, saveHero, type SavedHero } from '../hero/heroStore'
import { browserPlayer } from '../voice/player'
import { PushToTalk, type PttState } from '../voice/pushToTalk'
import { BusyError, getStatus, LowPowerError, newRun, postCommand, postRival } from './api'
import { localCommand } from './localParser'
import { Palette } from './Palette'
import {
  ASK_BACK_MS, FIREFIGHT_MS, advance, clickBuild, startReplay, answerText, applyCommand, applyFirefight, beginBuild, initialGame, say, setRival, setThinking, startStage,
  startTest, tickClock, toMap, type Game as G,
} from './flow'
import './game.css'

const TICK_MS = 100

function cityAt(g: G): City {
  if (g.firefightAction && g.nova && g.t >= (STAGES[g.stageId].chaos[0]?.at ?? 99)) {
    const r = applyAction(g.city, g.firefightAction, { stage: STAGES[g.stageId], heroClass: g.heroClass })
    if (r.ok) return autoWire(r.city)
  }
  return g.city
}

export default function Game() {
  const [g, setG] = useState<G>(initialGame)
  const gRef = useRef(g)
  gRef.current = g
  const [ptt, setPtt] = useState<PttState>('idle')
  const [partial, setPartial] = useState('')
  const [typed, setTyped] = useState('')
  const holdingRef = useRef(false)
  holdingRef.current = ptt === 'listening' || typed.trim() !== ''
  const [hero, setHero] = useState<SavedHero | null>(loadHero)
  const [stockClass, setHeroClass] = useState<HeroClass>('generalist')
  const heroClass: HeroClass = hero?.heroClass ?? stockClass
  const HERO_NAME = hero?.nickname ?? 'Nova'
  const chooseHero = (h: SavedHero | null) => { setHero(h); if (h) saveHero(h); else clearHero() }
  const [lowPower, setLowPower] = useState(false)
  const [guide, setGuide] = useState<string | null>(null)
  // the rival builds at a human pace during the build phase
  const buildStart = useRef(0)
  const [buildSeconds, setBuildSeconds] = useState(0)
  useEffect(() => {
    if (g.phase !== 'build') return
    const id = setInterval(() => setBuildSeconds((performance.now() - buildStart.current) / 1000), 500)
    return () => clearInterval(id)
  }, [g.phase])
  const guideModal = guide ? <GuideModal id={guide} onOpen={setGuide} onClose={() => setGuide(null)} /> : null
  const lowPowerRef = useRef(false)
  lowPowerRef.current = lowPower
  useEffect(() => { void getStatus().then((m) => setLowPower(m === 'low-power')) }, [])
  const stage = STAGES[g.stageId]

  const send = useCallback(async (transcript: string) => {
    const cur = gRef.current
    if (!transcript.trim()) return
    const phase = cur.phase === 'firefight' ? 'firefight' : cur.phase === 'build' ? 'build' : null
    if (!phase) return
    setG((x) => setThinking(say(x, { who: 'you', text: transcript }), true))
    try {
      const ask = async () => {
        if (lowPowerRef.current) return localCommand(transcript, cur.stageId, cur.heroClass, cur.city, phase)
        try {
          return await postCommand({ stageId: cur.stageId, heroClass: cur.heroClass, city: cur.city, transcript, phase })
        } catch (e) {
          // a full city or a spent budget still lets you play: typed orders are understood locally
          if (!(e instanceof LowPowerError) && !(e instanceof BusyError)) throw e
          setLowPower(true)
          return localCommand(transcript, cur.stageId, cur.heroClass, cur.city, phase)
        }
      }
      const res = await ask()
      if (phase === 'firefight') {
        setG((x) => say(applyFirefight(x, res.actions[0] ?? null), { who: 'hero', text: res.heroLine }))
        void browserPlayer.say({ text: res.heroLine, voice: 'hero' })
        return
      }
      const { game, startTest: go } = applyCommand(gRef.current, res, transcript)
      setG(go ? startTest(game) : game)
      void browserPlayer.say({ text: res.askBack?.question ?? res.heroLine, voice: 'hero' })
      if (go) void browserPlayer.say({ line: 'test.start', voice: 'commentator' })
    } catch (e) {
      const text = e instanceof BusyError ? e.message : 'Comms are down, type your orders.'
      setG((x) => setThinking(say(x, { who: e instanceof BusyError ? 'system' : 'hero', text }), false))
      if (!(e instanceof BusyError)) void browserPlayer.say({ line: 'hero.comms_down', voice: 'hero' })
    }
  }, [])

  // Push-to-talk: hold Space (or the button).
  const pttRef = useRef<PushToTalk | null>(null)
  useEffect(() => {
    const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/stt`
    pttRef.current = new PushToTalk({ wsUrl, onState: setPtt, onPartial: setPartial, onFinal: (t) => { setPartial(''); void send(t) } })
    const typing = (e: KeyboardEvent) => (e.target as HTMLElement)?.tagName === 'INPUT'
    const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !e.repeat && !typing(e) && !lowPowerRef.current) { e.preventDefault(); void pttRef.current?.start() } }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space' && !typing(e)) { e.preventDefault(); pttRef.current?.stop() } }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [send])

  // Game clock: the stress test and the ask-back / firefight countdowns.
  useEffect(() => {
    const id = setInterval(() => {
      const cur = gRef.current
      let next = cur.phase === 'test' || cur.phase === 'replay' ? advance(cur, TICK_MS / 1000) : cur
      const step = tickClock(next, TICK_MS, { holding: holdingRef.current })
      next = step.game
      if (cur.phase === 'test' && next.phase === 'firefight') {
        const card = STAGES[cur.stageId].chaos[0]
        void browserPlayer.say({ line: `chaos.${card.id}`, voice: 'commentator' })
        void browserPlayer.say({ line: 'firefight.prompt', voice: 'commentator' })
      }
      // later chaos cards are announced as they hit; the firefight is only for the first
      for (const card of STAGES[cur.stageId].chaos.slice(1)) {
        if (cur.phase === 'test' && cur.t < card.at && next.t >= card.at) void browserPlayer.say({ line: `chaos.${card.id}`, voice: 'commentator' })
      }
      if (cur.phase !== 'result' && next.phase === 'result') {
        void browserPlayer.say({ line: `result.${next.outcome}`, voice: 'commentator' })
      }
      if (next !== cur) setG(next)
      if (step.effect?.type === 'answer') {
        void browserPlayer.say({ line: 'hero.textbook', voice: 'hero' })
        void send(step.effect.text)
      }
    }, TICK_MS)
    return () => clearInterval(id)
  }, [send])

  const begin = (stageId: string) => {
    newRun()
    setG((x) => startStage(x, stageId, heroClass))
    void browserPlayer.say({ line: `stage.${stageId}.brief`, voice: 'commentator' })
  }
  const build = async () => {
    buildStart.current = performance.now()
    setBuildSeconds(0)
    setG((x) => beginBuild(x))
    void browserPlayer.say(hero ? { text: hero.catchphrase, voice: 'hero' } : { line: 'hero.ready', voice: 'hero' })
    try {
      const rival = await postRival(gRef.current.stageId)
      setG((x) => setRival(x, rival))
      void browserPlayer.say(rival.source === 'live' ? { text: rival.lines[0], voice: 'rival' } : { line: `rival.${gRef.current.stageId}.taunt`, voice: 'rival' })
    } catch {
      // whatever went wrong, the stage stays playable against the hand-written rival
      const rival = scriptedRival(STAGES[gRef.current.stageId])
      setG((x) => setRival(x, rival))
      void browserPlayer.say({ line: `rival.${gRef.current.stageId}.taunt`, voice: 'rival' })
    }
  }

  const tick = g.nova ? g.nova.ticks[Math.min(g.nova.ticks.length - 1, Math.round(g.t * 10))] : null
  const rtick = g.rivalSim ? g.rivalSim.ticks[Math.min(g.rivalSim.ticks.length - 1, Math.round(g.t * 10))] : null
  const pct = (x: typeof tick) => (x && x.offered > 0 ? Math.round((x.served / x.offered) * 100) : null)
  const liveCards = g.phase === 'test' || g.phase === 'firefight' || g.phase === 'replay' ? stage.chaos.filter((c) => g.t >= c.at) : []
  const chaosLive = liveCards.length > 0
  const shownCity = useMemo(() => cityAt(g), [g])
  const rivalName = stage.rivalName
  const rivalPace = g.rival && g.phase === 'build' ? rivalProgress(g.rival.actions, stage, buildSeconds) : null
  const rivalCity = rivalPace && !rivalPace.done ? rivalPace.city : g.rival?.city

  if (g.phase === 'map') {
    return (
      <div className="screen map">
        <h1>Uptime City</h1>
        <p className="sub">Talk to your hero to build a backend as a city. Then survive the traffic.</p>
        <h3 className="section">Your hero</h3>
        <HeroMaker hero={hero} onHero={chooseHero} />
        <h3 className="section">{hero ? `${HERO_NAME}'s class comes from the CV. Every class has the same total power.` : "Pick Nova's class. Every class has the same total power."}</h3>
        <div className="classes">
          {(Object.keys(CLASSES) as HeroClass[]).map((c) => (
            <button key={c} className={c === heroClass ? 'class on' : 'class'} disabled={!!hero && c !== heroClass} onClick={() => setHeroClass(c)}>
              <b>{CLASSES[c].name}</b>
              <span>{CLASSES[c].perk}</span>
              <span className="weak">{CLASSES[c].weakness}</span>
            </button>
          ))}
        </div>
        {(['campaign', 'classic'] as const).map((track) => (
          <div key={track}>
            <h3 className="section">{track === 'campaign' ? 'Campaign' : 'Classic system design interview problems'}</h3>
            <div className="stages">
              {STAGE_ORDER.filter((id) => STAGES[id].track === track).map((id, n) => (
                <button key={id} className="stage" onClick={() => begin(id)}>
                  <span className="num">{track === 'campaign' ? `Stage ${n + 1}` : `Problem ${n + 1}`}</span>
                  <b>{STAGES[id].title}</b>
                  <span>{STAGES[id].brief}</span>
                  {g.cleared[id] && <span className="cleared">Cleared</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
        <h3 className="section">Field guide</h3>
        <div className="topics">
          <button className="topic" onClick={() => setGuide('approach')}>How to approach a design</button>
          <button className="topic" onClick={() => setGuide('qualities')}>What makes a system good</button>
          <button className="topic" onClick={() => setGuide('load-balancing')}>All topics</button>
        </div>
        {guideModal}
      </div>
    )
  }

  return (
    <div className="game">
      <header className="hud">
        <b>{stage.title}</b>
        <span className="coins">{shownCity.coins} coins</span>
        <span className="phase">{g.phase === 'build' ? 'Build' : g.phase === 'briefing' ? 'Briefing' : g.phase === 'result' ? 'Result' : g.phase === 'replay' ? `Replay ${g.t.toFixed(1)} s` : `Stress test ${g.t.toFixed(1)} s`}</span>
        {chaosLive && <span className="chaos">Chaos card: {liveCards[liveCards.length - 1].title}</span>}
        {shownCity.wildcardUsed || g.firefightAction || !stage.wildcard ? null : <span className="wild">Wildcard: free {CATALOG[stage.wildcard].name.toLowerCase()}</span>}
        {lowPower && <span className="lowpower" title={`Today's AI budget is used up, so ${HERO_NAME} understands simple typed orders only.`}>Low-power mode: type simple orders</span>}
        <span className="spacer" />
        {g.phase === 'build' && (
          <button className="primary" disabled={!g.rival || g.thinking} onClick={() => setG((x) => { const n = startTest(x); if (n !== x) void browserPlayer.say({ line: 'test.start', voice: 'commentator' }); return n })}>
            {g.rival ? 'Submit (or say "submit")' : `${rivalName} is building...`}
          </button>
        )}
        <button className="ghost" onClick={() => setG((x) => toMap(x))}>Stage map</button>
      </header>

      <main className="arena">
        <City3D city={shownCity} tick={tick} chaos={g.phase === 'firefight'} label={`${HERO_NAME} (you)${pct(tick) !== null ? ` · ${pct(tick)}%` : ''}`} accent="#5eead4" />
        {g.rival ? (
          <City3D city={rivalCity!} tick={rtick} chaos={g.phase === 'firefight'} label={`${rivalName}${pct(rtick) !== null ? ` · ${pct(rtick)}%` : rivalPace && !rivalPace.done ? ` · building ${rivalPace.built} of ${rivalPace.total}` : ''}`} accent="#f87171" />
        ) : (
          <div className="waiting">{g.phase === 'briefing' ? '' : `${rivalName} is building...`}</div>
        )}

        <Palette stageId={g.stageId} city={shownCity} heroClass={g.heroClass} phase={g.phase} onBuild={(a) => setG((x) => (x.thinking ? x : clickBuild(x, a)))} onLearn={(type) => { const e = guideFor(type)[0]; if (e) setGuide(e.id) }} />
        {guideModal}

        {g.phase === 'briefing' && (
          <div className="overlay">
            <div className="card">
              <span className="num">Briefing</span>
              <h2>{stage.title}</h2>
              <p>{stage.brief}</p>
              <p>Budget: <b>{g.city.coins} coins</b>. One chaos card will hit during the test. You get one shouted command to fix it.</p>
              <p className="rival-line">{rivalName}: "{stage.rivalTaunt}"</p>
              {stage.guide && (
                <p className="learn">Learn first: {stage.guide.map((id) => (
                  <button key={id} className="topic" onClick={() => setGuide(id)}>{guideEntry(id)?.title}</button>
                ))}</p>
              )}
              <p className="hint">Hold <kbd>Space</kbd> and talk to {HERO_NAME}. For example: "Round robin balancer, two large servers, SQL with an index."</p>
              <button className="primary" onClick={build}>Start building</button>
            </div>
          </div>
        )}

        {g.askBack && (
          <div className="overlay soft">
            <div className="card ask">
              <span className="num">{HERO_NAME} asks</span>
              <h2>{g.askBack.question}</h2>
              <div className="choices">
                {g.askBack.choices.map((c) => (
                  <button key={c} onClick={() => { const a = g.askBack!; setG((x) => ({ ...x, askBack: null })); void send(answerText(a.original, c)) }}>{c}</button>
                ))}
              </div>
              <div className="clock"><div style={{ width: `${(g.askBack.remainingMs / ASK_BACK_MS) * 100}%` }} /></div>
              <p className="hint">Say your answer, or click. No answer: "{g.askBack.default}".</p>
            </div>
          </div>
        )}

        {g.phase === 'firefight' && g.firefight && (
          <div className="overlay soft">
            <div className="card fire">
              <span className="num">Chaos card</span>
              <h2>{stage.chaos[0].title}!</h2>
              <p>One shouted command. Hold <kbd>Space</kbd> and fix it.</p>
              <div className="clock"><div style={{ width: `${(g.firefight.remainingMs / FIREFIGHT_MS) * 100}%` }} /></div>
            </div>
          </div>
        )}

        {g.phase === 'result' && g.nova && g.rivalSim && (
          <div className="overlay">
            <div className={`card result ${g.outcome}`}>
              <span className="num">{g.outcome === 'win' ? 'Stage clear' : g.outcome === 'lose' ? `${rivalName} wins` : 'Dead heat'}</span>
              <h2>{g.outcome === 'win' ? 'Your city held.' : g.outcome === 'lose' ? 'Your city broke first.' : 'Nobody wins this one.'}</h2>
              <table>
                <thead><tr><th /><th>{HERO_NAME} (you)</th><th>{rivalName}</th></tr></thead>
                <tbody>
                  <tr><td>Requests served</td><td>{Math.round(g.nova.servedPct * 100)}%</td><td>{Math.round(g.rivalSim.servedPct * 100)}%</td></tr>
                  <tr><td>Slowest 5% took</td><td>{g.nova.p95Ms} ms</td><td>{g.rivalSim.p95Ms} ms</td></tr>
                  <tr><td>Coins left</td><td>{g.nova.coinsLeft}</td><td>{g.rivalSim.coinsLeft}</td></tr>
                </tbody>
              </table>
              <p className="lesson">{g.nova.lesson}{g.nova.lessonGuide && guideEntry(g.nova.lessonGuide) && (
                <> <button className="topic" onClick={() => setGuide(g.nova!.lessonGuide!)}>Read: {guideEntry(g.nova.lessonGuide)!.title}</button></>
              )}</p>
              <div className="row">
                <button className="primary" onClick={() => begin(g.stageId)}>Play again</button>
                {g.nova.worstMoment.second > 0 && <button className="ghost" onClick={() => setG((x) => startReplay(x))}>Watch where it broke</button>}
                <button className="ghost" onClick={() => setG((x) => toMap(x))}>Stage map</button>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="talk">
        <button
          className={`mic ${ptt}`}
          onMouseDown={() => void pttRef.current?.start()}
          onMouseUp={() => pttRef.current?.stop()}
          onMouseLeave={() => pttRef.current?.stop()}
          disabled={lowPower || !(g.phase === 'build' || g.phase === 'firefight')}
        >
          {ptt === 'listening' ? 'Listening...' : ptt === 'thinking' || g.thinking ? `${HERO_NAME} is thinking...` : ptt === 'no-mic' ? 'Microphone blocked' : 'Hold Space to talk'}
        </button>
        <div className="transcript">
          {ptt === 'no-mic' && <div className="warn">Allow the microphone in the address bar and reload, or type below.</div>}
          {partial && <div className="partial">{partial}</div>}
          <div className="log">
            {g.log.slice(-3).map((l, i) => (
              <div key={i} className={`line ${l.who}`}><b>{l.who === 'you' ? 'You' : l.who === 'hero' ? HERO_NAME : l.who === 'rival' ? rivalName : ''}</b> {l.text}</div>
            ))}
          </div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void send(typed); setTyped('') }}>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type an order..." disabled={!(g.phase === 'build' || g.phase === 'firefight')} />
        </form>
      </footer>
    </div>
  )
}

