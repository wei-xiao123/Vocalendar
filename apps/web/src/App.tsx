import './App.css'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

function App() {
  return (
    <main className="app-shell">
      <section className="intro-panel" aria-labelledby="app-title">
        <p className="eyebrow">Vocalendar</p>
        <h1 id="app-title">Voice-first calendar assistant</h1>
        <p className="summary">
          Project foundation is ready for the voice calendar workflow: React,
          Tailwind CSS, FastAPI, PostgreSQL, and Render deployment.
        </p>
        <dl className="meta-grid" aria-label="Development configuration">
          <div>
            <dt>Frontend</dt>
            <dd>React + Vite + Tailwind CSS</dd>
          </div>
          <div>
            <dt>Backend</dt>
            <dd>FastAPI + SQLAlchemy + Alembic</dd>
          </div>
          <div>
            <dt>API URL</dt>
            <dd>{apiUrl}</dd>
          </div>
        </dl>
      </section>
    </main>
  )
}

export default App
