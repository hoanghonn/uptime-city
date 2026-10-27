import Demo from './Demo'

export default function App() {
  if (location.search.includes('demo')) return <Demo />
  return <div style={{ color: '#e2e8f0', padding: 24 }}>Uptime City - game flow coming in Task 10. Try /?demo</div>
}
