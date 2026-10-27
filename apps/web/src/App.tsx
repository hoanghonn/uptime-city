import Demo from './Demo'
import Game from './game/Game'

export default function App() {
  if (location.search.includes('demo')) return <Demo />
  if (window.innerWidth < 1024) {
    return (
      <div style={{ color: '#e2e8f0', font: '16px system-ui', padding: 32, textAlign: 'center', marginTop: '30vh' }}>
        <h1 style={{ fontSize: 24 }}>Uptime City</h1>
        <p>Uptime City needs a laptop screen.</p>
      </div>
    )
  }
  return <Game />
}
