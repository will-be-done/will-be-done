import { useState, useEffect } from 'react'

const logoPath =
  'M40.4835 111.929C39.5895 111.929 38.7321 111.575 38.0999 110.945C37.4678 110.316 37.1126 109.462 37.1126 108.571V41.4286C37.1126 40.5382 37.4678 39.6843 38.0999 39.0547C38.7321 38.4251 39.5895 38.0714 40.4835 38.0714H102.845C104.186 38.0714 105.472 37.5409 106.42 36.5965C107.368 35.6521 107.901 34.3713 107.901 33.0357C107.901 31.7002 107.368 30.4193 106.42 29.4749C105.472 28.5305 104.186 28 102.845 28H40.4835C36.9074 28 33.4779 29.4148 30.9492 31.9331C28.4206 34.4515 27 37.8671 27 41.4286V108.571C27 112.133 28.4206 115.549 30.9492 118.067C33.4779 120.585 36.9074 122 40.4835 122H107.901C111.477 122 114.907 120.585 117.435 118.067C119.964 115.549 121.384 112.133 121.384 108.571V86.75C121.384 85.4144 120.852 84.1336 119.903 83.1892C118.955 82.2448 117.669 81.7143 116.328 81.7143C114.987 81.7143 113.701 82.2448 112.753 83.1892C111.804 84.1336 111.272 85.4144 111.272 86.75V108.571C111.272 109.462 110.917 110.316 110.284 110.945C109.652 111.575 108.795 111.929 107.901 111.929H40.4835ZM126.643 52.7086C127.536 51.754 128.022 50.4914 127.999 49.1868C127.976 47.8822 127.445 46.6375 126.519 45.7148C125.593 44.7922 124.343 44.2637 123.033 44.2407C121.723 44.2177 120.455 44.7019 119.497 45.5914L82.0261 82.9027L69.3988 69.9039C68.9381 69.4244 68.3868 69.0404 67.7766 68.7739C67.1664 68.5074 66.5093 68.3636 65.843 68.3508C65.1768 68.3381 64.5147 68.4566 63.8946 68.6995C63.2746 68.9425 62.7088 69.3051 62.23 69.7666C61.7511 70.228 61.3685 70.7791 61.1042 71.3883C60.84 71.9975 60.6992 72.6527 60.69 73.3163C60.6808 73.9798 60.8034 74.6386 61.0508 75.2548C61.2981 75.871 61.6653 76.4325 62.1312 76.9069L78.3316 93.5851C78.7978 94.0666 79.3555 94.4508 79.9724 94.7152C80.5892 94.9797 81.2528 95.1191 81.9243 95.1254C82.5959 95.1316 83.2619 95.0046 83.8836 94.7517C84.5053 94.4987 85.0702 94.125 85.5453 93.6523L126.643 52.7086Z'

function Logo({ size = 48 }: { size?: number }): React.JSX.Element {
  return (
    <div className="logo-container" style={{ width: size, height: size }}>
      <div className="logo-glow" />
      <svg
        width={size}
        height={size}
        viewBox="0 0 150 150"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: 'relative' }}
      >
        <rect width="150" height="150" rx="19" fill="url(#logo_bg)" />
        <path fillRule="evenodd" clipRule="evenodd" d={logoPath} fill="url(#logo_check)" />
        <defs>
          <linearGradient
            id="logo_bg"
            x1="9"
            y1="5.5"
            x2="150"
            y2="150"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#3b82f6" />
            <stop offset="1" stopColor="#1e40af" />
          </linearGradient>
          <linearGradient
            id="logo_check"
            x1="27"
            y1="28"
            x2="118.5"
            y2="120.5"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#93c5fd" />
            <stop offset="1" stopColor="#60a5fa" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function App(): React.JSX.Element {
  const [url, setUrl] = useState('https://app.will-be-done.app')
  const [error, setError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setLoaded(true)
  }, [])

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError('')

    const trimmed = url.trim()
    if (!isValidUrl(trimmed)) {
      setError('Please enter a valid URL (https:// or http://)')
      return
    }

    setConnecting(true)
    try {
      await window.api.setServerUrl(trimmed)
    } catch {
      setError('Failed to connect. Please check the URL and try again.')
      setConnecting(false)
    }
  }

  return (
    <div className={`scene ${loaded ? 'scene--loaded' : ''}`}>
      {/* Atmospheric background */}
      <div className="atmosphere">
        <div className="orb orb--primary" />
        <div className="orb orb--secondary" />
        <div className="orb orb--tertiary" />
      </div>
      <div className="noise" />

      {/* Drag region for macOS traffic lights */}
      <div className="drag-region" />

      <main className="content">
        <div className="card-wrapper">
          {/* Logo + branding */}
          <header className="brand">
            <Logo size={52} />
            <h1 className="brand__title">Will Be Done</h1>
            <p className="brand__subtitle">Connect to your server to get started</p>
          </header>

          {/* Form card */}
          <div className="card">
            <form onSubmit={handleSubmit} className="form">
              <div className="field">
                <label htmlFor="server-url" className="field__label">
                  Server URL
                </label>
                <div className="field__input-wrap">
                  <svg
                    className="field__icon"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5a17.92 17.92 0 01-8.716-2.247m0 0A8.966 8.966 0 013 12c0-1.257.26-2.453.727-3.418"
                    />
                  </svg>
                  <input
                    id="server-url"
                    type="url"
                    value={url}
                    onChange={(e): void => {
                      setUrl(e.target.value)
                      setError('')
                    }}
                    placeholder="https://app.will-be-done.app"
                    className="field__input"
                    autoFocus
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="error-msg">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {error}
                </div>
              )}

              <button type="submit" disabled={connecting} className="btn-connect">
                {connecting ? (
                  <span className="btn-connect__inner">
                    <svg className="spinner" viewBox="0 0 24 24" fill="none">
                      <circle
                        className="spinner__track"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="spinner__fill"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Connecting...
                  </span>
                ) : (
                  <span className="btn-connect__inner">
                    Connect
                    <svg
                      className="btn-connect__arrow"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </span>
                )}
              </button>
            </form>
          </div>

          <p className="hint">
            Use <kbd>Cmd+Shift+S</kbd> to change server later
          </p>
        </div>
      </main>
    </div>
  )
}

export default App
