import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import EventsList from './pages/EventsList';
import AdminPanel from './pages/AdminPanel';
import GuestLookup from './pages/GuestLookup';
import GuestRsvpPage from './pages/GuestRsvpPage';
import HallDesign from './pages/HallDesign';
import EventDetail from './pages/EventDetail';
import LiveEventMapPage from './pages/LiveEventMapPage';
import EntranceCheckInPage from './pages/EntranceCheckInPage';
import LiveEventTvPage from './pages/LiveEventTvPage';
import ManagerReportPage from './pages/ManagerReportPage';
import ArchitectMotionSite from './pages/ArchitectMotionSite';
import api, { authAPI } from './services/api';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';

const formatDiagnosticTimestamp = (value) => {
  if (!value) {
    return '—';
  }

  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
};

function AppContent() {
  const desktopApp = typeof window !== 'undefined' ? window.desktopApp || {} : {};
  const isDesktopApp = Boolean(desktopApp.isDesktop);
  const desktopMode = desktopApp.mode || 'browser';
  const desktopApiBaseUrl = desktopApp.apiBaseUrl || '';
  const [token, setToken] = useState(localStorage.getItem('backendToken') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('backendUser')) || null);
  const [view, setView] = useState('events');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loginError, setLoginError] = useState('');
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [appMode, setAppMode] = useState('guest'); // 'guest' or 'backend'
  const [desktopConnection, setDesktopConnection] = useState({
    loading: isDesktopApp,
    healthy: !isDesktopApp,
    error: '',
    checkedAt: '',
  });
  const { language, setLanguage, t } = useLanguage();
  const rsvpToken = new URLSearchParams(window.location.search).get('rsvp');
  const customSite = new URLSearchParams(window.location.search).get('site');
  const liveMapEventId = new URLSearchParams(window.location.search).get('liveMapEvent');
  const entranceEventId = new URLSearchParams(window.location.search).get('entranceEvent');
  const tvEventId = new URLSearchParams(window.location.search).get('tvEvent');
  const managerReportEventId = new URLSearchParams(window.location.search).get('managerReportEvent');

  const hasPermission = (permissionKey) => Boolean(user?.role === 'admin' || user?.permissions?.[permissionKey]);

  const desktopTargetHost = useMemo(() => {
    if (!desktopApiBaseUrl) {
      return '';
    }

    try {
      return new URL(desktopApiBaseUrl).hostname;
    } catch {
      return desktopApiBaseUrl;
    }
  }, [desktopApiBaseUrl]);

  const runDesktopConnectionCheck = useCallback(async () => {
    if (!isDesktopApp) {
      return;
    }

    setDesktopConnection((current) => ({
      ...current,
      loading: true,
      error: '',
    }));

    try {
      const response = await api.get('/health');
      setDesktopConnection({
        loading: false,
        healthy: true,
        error: '',
        checkedAt: response.data?.timestamp || new Date().toISOString(),
      });
    } catch (error) {
      setDesktopConnection({
        loading: false,
        healthy: false,
        error: error.response?.data?.error || error.message || 'Unable to connect to the app server.',
        checkedAt: new Date().toISOString(),
      });
    }
  }, [isDesktopApp]);

  useEffect(() => {
    runDesktopConnectionCheck();
  }, [runDesktopConnectionCheck]);

  const handleLogout = () => {
    localStorage.removeItem('backendToken');
    localStorage.removeItem('backendUser');
    setToken('');
    setUser(null);
    setAppMode('guest');
    setView('events');
  };

  useEffect(() => {
    if (!token) {
      return;
    }

    authAPI
      .getCurrentUser()
      .then((response) => {
        const currentUser = response.data.user;
        setUser(currentUser);
        localStorage.setItem('backendUser', JSON.stringify(currentUser));
      })
      .catch(() => {
        handleLogout();
      });
  }, [token]);

  const handleLogin = async (event) => {
    event.preventDefault();
    try {
      const response = await authAPI.login(credentials);
      const authToken = response.data.token;
      const authUser = response.data.user;
      localStorage.setItem('backendToken', authToken);
      localStorage.setItem('backendUser', JSON.stringify(authUser));
      setToken(authToken);
      setUser(authUser);
      setLoginError('');
      setAppMode('backend');
      setView('events');
    } catch (err) {
      setLoginError(err.response?.data?.error || 'Login failed.');
    }
  };

  const handleChange = (key, value) => {
    setCredentials({ ...credentials, [key]: value });
  };

  const switchToGuestLookup = () => {
    setAppMode('guest');
  };

  const switchToBackend = () => {
    if (token) {
      setAppMode('backend');
    } else {
      setAppMode('backend');
    }
  };

  if (customSite === 'arch-motion') {
    return <ArchitectMotionSite />;
  }

  if (isDesktopApp && desktopConnection.loading) {
    return (
      <div className="App login-screen">
        <header className="App-header">
          <h1>{t('Desktop Connection Check')}</h1>
          <p>{t('Checking connection to the app server...')}</p>
        </header>
        <main>
          <div className="login-card desktop-diagnostics-card">
            <p className="hint">{t('Desktop mode')}: {desktopMode === 'remote' ? t('Remote Desktop Client') : t('Embedded Desktop App')}</p>
            <p className="hint">{t('API endpoint')}: {desktopApiBaseUrl || '/api'}</p>
          </div>
        </main>
      </div>
    );
  }

  if (isDesktopApp && !desktopConnection.healthy) {
    return (
      <div className="App login-screen">
        <header className="App-header">
          <h1>{t('Desktop Connection Problem')}</h1>
          <p>{t('The app could not reach its server connection. Review the details below and retry.')}</p>
        </header>
        <main>
          <div className="login-card desktop-diagnostics-card desktop-diagnostics-error">
            <div className="desktop-diagnostics-summary">
              <span className="status-pill declined">{t('Unreachable')}</span>
              <p className="error">{desktopConnection.error}</p>
            </div>
            <div className="desktop-diagnostics-grid">
              <div>
                <strong>{t('Desktop mode')}</strong>
                <span>{desktopMode === 'remote' ? t('Remote Desktop Client') : t('Embedded Desktop App')}</span>
              </div>
              <div>
                <strong>{t('API endpoint')}</strong>
                <span>{desktopApiBaseUrl || '/api'}</span>
              </div>
              <div>
                <strong>{t('Host computer')}</strong>
                <span>{desktopTargetHost || '—'}</span>
              </div>
              <div>
                <strong>{t('Last checked')}</strong>
                <span>{formatDiagnosticTimestamp(desktopConnection.checkedAt)}</span>
              </div>
            </div>
            <div className="desktop-diagnostics-notes">
              {desktopMode === 'remote' ? <p>{t('This app is running in remote mode and expects the host computer to be online in Tailscale.')}</p> : <p>{t('This app is running with an embedded backend on the same computer.')}</p>}
              <p>{t('Make sure the other computer is connected to the same Tailscale network.')}</p>
              <p>{t('Make sure the backend is running on the host computer.')}</p>
              <p>{t('If the problem continues, reinstall the latest remote desktop client build.')}</p>
            </div>
            <div className="form-actions desktop-diagnostics-actions">
              <button type="button" onClick={runDesktopConnectionCheck}>{t('Retry Connection')}</button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (rsvpToken) {
    return <GuestRsvpPage token={rsvpToken} />;
  }

  if (liveMapEventId && token) {
    return <LiveEventMapPage eventId={liveMapEventId} user={user} />;
  }

  if (entranceEventId && token) {
    return <EntranceCheckInPage eventId={entranceEventId} user={user} />;
  }

  if (tvEventId && token) {
    return <LiveEventTvPage eventId={tvEventId} user={user} />;
  }

  if (managerReportEventId && token) {
    return <ManagerReportPage eventId={managerReportEventId} user={user} />;
  }

  // Guest mode
  if (appMode === 'guest' && !liveMapEventId) {
    return <GuestLookup onSwitchToAdmin={switchToBackend} />;
  }

  // Backend mode - Login
  if (!token) {
    return (
      <div className="App login-screen">
        <header className="App-header">
          <h1>🔐 {t('Login')}</h1>
          <p>{t('Sign in to control event management and backend users.')}</p>
        </header>
        <main>
          <div className="login-card">
            <form onSubmit={handleLogin} className="login-form">
              <label>
                {t('Username')}
                <input value={credentials.username} onChange={(e) => handleChange('username', e.target.value)} placeholder="admin" />
              </label>
              <label>
                {t('Password')}
                <div className="password-field">
                  <input type={showLoginPassword ? 'text' : 'password'} value={credentials.password} onChange={(e) => handleChange('password', e.target.value)} placeholder="password" />
                  <button type="button" className="password-toggle" onClick={() => setShowLoginPassword((current) => !current)}>
                    {showLoginPassword ? t('Hide Password') : t('Show Password')}
                  </button>
                </div>
              </label>
              <button type="submit">{t('Sign In')}</button>
              {loginError && <p className="error">{t(loginError)}</p>}
            </form>
            <p className="hint">{t('Default account can be configured in backend/.env using ADMIN_USERNAME and ADMIN_PASSWORD.')}</p>
            <button onClick={switchToGuestLookup} className="guest-mode-btn">
              {t('Back to Guest Lookup')}
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Backend mode - Authenticated
  return (
    <div className="App">
      <header className="App-header app-nav">
        <div>
          <h1>📅 {t('Layali')}</h1>
          <p>{t('Welcome')}, {user?.username}. {t('Choose your workspace')}.</p>
        </div>
        <div className="nav-group">
          <select 
            value={language} 
            onChange={(e) => setLanguage(e.target.value)}
            className="language-selector"
          >
            <option value="en">{t('English')}</option>
            <option value="he">{t('Hebrew')}</option>
          </select>
          <button onClick={() => setView('events')} className={view === 'events' ? 'active' : ''}>
            {t('Events')}
          </button>
          {selectedEvent && (
            <button onClick={() => setView('hall-design')} className={view === 'hall-design' ? 'active' : ''}>
              {t('Hall Design')}
            </button>
          )}
          {hasPermission('manageUsers') ? (
            <button onClick={() => setView('admin')} className={view === 'admin' ? 'active' : ''}>
              {t('Admin Panel')}
            </button>
          ) : null}
          <button onClick={switchToGuestLookup} className="secondary">
            {t('Guest Mode')}
          </button>
          <button onClick={handleLogout} className="danger">
            {t('Logout')}
          </button>
        </div>
      </header>
      <main>
        {selectedEvent ? (
          view === 'hall-design' ? (
            <HallDesign event={selectedEvent} user={user} onBack={() => { setSelectedEvent(null); setView('events'); }} />
          ) : (
            <EventDetail event={selectedEvent} user={user} onBack={() => setSelectedEvent(null)} />
          )
        ) : view === 'admin' ? (
          <AdminPanel onLogout={handleLogout} user={user} />
        ) : view === 'hall-design' ? (
          <div className="events-page">
            <div className="hero-card">
              <h2>{t('Hall Design')}</h2>
              <p>{t('Please select an event first to design its hall layout.')}</p>
              <button onClick={() => setView('events')} className="primary">
                {t('Select Event')}
              </button>
            </div>
          </div>
        ) : (
          <EventsList onSelectEvent={setSelectedEvent} onHallDesign={(event) => { setSelectedEvent(event); setView('hall-design'); }} />
        )}
      </main>
    </div>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
}

export default App;
