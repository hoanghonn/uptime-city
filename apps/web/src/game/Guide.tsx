import { GUIDE, guideEntry } from '@uptime/core'

type Props = { id: string; onOpen(id: string): void; onClose(): void }

/** The field guide: one entry at a time, with every other topic one click away. */
export function GuideModal({ id, onOpen, onClose }: Props) {
  const entry = guideEntry(id)
  if (!entry) return null
  return (
    <div className="overlay guide-overlay" onClick={onClose}>
      <div className="card guide" onClick={(e) => e.stopPropagation()}>
        <span className="num">Field guide</span>
        <h2>{entry.title}</h2>
        <p>{entry.body}</p>
        <div className="topics">
          {GUIDE.filter((g) => g.id !== id).map((g) => (
            <button key={g.id} className="topic" onClick={() => onOpen(g.id)}>{g.title}</button>
          ))}
        </div>
        <div className="row"><button className="primary" onClick={onClose}>Back to the city</button></div>
      </div>
    </div>
  )
}
