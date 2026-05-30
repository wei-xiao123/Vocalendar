import { useEffect, useState } from 'react'

import './App.css'
import {
  type AuthToken,
  createGuestSession,
  getGitHubOAuthStartUrl,
} from './lib/api'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const AUTH_STORAGE_KEY = 'vocalendar.auth'

function App() {
  const [authToken, setAuthToken] = useState<AuthToken | null>(() => {
    const storedValue = window.localStorage.getItem(AUTH_STORAGE_KEY)
    if (!storedValue) {
      return null
    }

    try {
      return JSON.parse(storedValue) as AuthToken
    } catch {
      window.localStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }
  })
  const [isCreatingGuest, setIsCreatingGuest] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (authToken) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authToken))
      return
    }

    window.localStorage.removeItem(AUTH_STORAGE_KEY)
  }, [authToken])

  async function handleGuestSession() {
    setIsCreatingGuest(true)
    setErrorMessage(null)

    try {
      setAuthToken(await createGuestSession())
    } catch {
      setErrorMessage('游客模式暂时不可用，请稍后重试。')
    } finally {
      setIsCreatingGuest(false)
    }
  }

  function handleGitHubLogin() {
    window.location.assign(getGitHubOAuthStartUrl())
  }

  function handleSignOut() {
    setAuthToken(null)
    setErrorMessage(null)
  }

  const displayName =
    authToken?.user.display_name ?? authToken?.user.username ?? 'Guest User'

  return (
    <main className="app-shell">
      <section className="workspace-panel" aria-labelledby="app-title">
        <div className="app-header">
          <div>
            <p className="eyebrow">Vocalendar</p>
            <h1 id="app-title">日程工作台</h1>
          </div>
          <div className="api-pill" title={apiUrl}>
            API
          </div>
        </div>

        {authToken ? (
          <section className="session-panel" aria-label="当前会话">
            <div>
              <p className="section-label">当前身份</p>
              <p className="session-name">{displayName}</p>
              <p className="session-meta">
                {authToken.user.is_guest ? '游客会话' : 'GitHub 账号'}
              </p>
            </div>
            <button className="secondary-button" type="button" onClick={handleSignOut}>
              退出
            </button>
          </section>
        ) : (
          <section className="auth-panel" aria-label="登录入口">
            <div>
              <p className="section-label">开始使用</p>
              <p className="auth-copy">
                选择 GitHub 登录或游客模式，进入后即可使用你的日程数据。
              </p>
            </div>
            <div className="auth-actions">
              <button
                className="primary-button"
                type="button"
                onClick={handleGitHubLogin}
              >
                GitHub 登录
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={handleGuestSession}
                disabled={isCreatingGuest}
              >
                {isCreatingGuest ? '正在进入...' : '游客模式'}
              </button>
            </div>
            {errorMessage ? (
              <p className="error-message" role="alert">
                {errorMessage}
              </p>
            ) : null}
          </section>
        )}
      </section>
    </main>
  )
}

export default App
