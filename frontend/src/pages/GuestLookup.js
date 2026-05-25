import React, { useState } from 'react';
import { eventAPI } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';

function GuestLookup({ onSwitchToAdmin }) {
  const { t } = useLanguage();
  const [serialNumber, setSerialNumber] = useState('');
  const [guestName, setGuestName] = useState('');
  const [foundGuest, setFoundGuest] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setFoundGuest(null);
    setSearched(true);

    try {
      const eventRes = await eventAPI.getEventBySerial(serialNumber);
      const event = eventRes.data.event;

      if (!event.guests || event.guests.length === 0) {
        setError(t('No guests found for this event.'));
        setLoading(false);
        return;
      }

      const guest = event.guests.find(
        (g) => g.name.toLowerCase() === guestName.toLowerCase()
      );

      if (guest) {
        setFoundGuest({
          name: guest.name,
          table: guest.table || 'Not assigned',
          seatNumber: guest.seatNumber || 'Not assigned',
          eventName: event.name,
          eventDate: new Date(event.date).toLocaleDateString(),
          eventLocation: event.location,
        });
      } else {
        setError(t('Guest') + ` "${guestName}" ` + t('not found in this event.'));
      }
    } catch (err) {
      setError(
        err.response?.data?.error ||
          t('Event not found. Please check the event code.')
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSerialNumber('');
    setGuestName('');
    setFoundGuest(null);
    setError('');
    setSearched(false);
  };

  return (
    <div className="guest-lookup-page modern-landing">
      <div className="ambient-orb orb-one" aria-hidden="true" />
      <div className="ambient-orb orb-two" aria-hidden="true" />

      <div className="guest-lookup-header modern-hero">
        <div className="guest-hero-copy">
          <div className="brand-kicker">
            <span className="brand-mark">L</span>
            <span>LAYALI RSVP</span>
          </div>
          <h1>{t('Find Your Seat')}</h1>
          <p>{t('Enter your event code and name to view your seating assignment.')}</p>
          <div className="hero-feature-row" aria-label="Event platform highlights">
            <span>Fast guest lookup</span>
            <span>Elegant seating</span>
            <span>Mobile ready</span>
          </div>
        </div>
        <button className="secondary admin-entry" onClick={onSwitchToAdmin}>
          {t('Backend Login')}
        </button>
      </div>

      <div className="guest-lookup-container modern-lookup-grid">
        <section className="lookup-showcase-card" aria-label="Layali experience">
          <div className="showcase-glass-card">
            <span className="showcase-badge">Premium Events</span>
            <h2>Layali</h2>
            <p>Smart guest experience for weddings, private events, halls and luxury celebrations.</p>
            <div className="showcase-stats">
              <div>
                <strong>01</strong>
                <span>Enter code</span>
              </div>
              <div>
                <strong>02</strong>
                <span>Find name</span>
              </div>
              <div>
                <strong>03</strong>
                <span>Get seat</span>
              </div>
            </div>
          </div>
        </section>

        <section className="lookup-action-card">
          {!foundGuest ? (
            <form onSubmit={handleSearch} className="guest-search-form modern-search-form">
              <div className="form-heading">
                <span className="form-eyebrow">Guest access</span>
                <h2>{t('Find Your Seat')}</h2>
              </div>
              <label>
                {t('Event Code')}
                <input
                  type="text"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value.toUpperCase())}
                  placeholder={t('e.g., ABC123XYZ')}
                  required
                />
              </label>
              <label>
                {t('Your Name')}
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder={t('John Doe')}
                  required
                />
              </label>
              <button type="submit" disabled={loading} className="primary-search-button">
                {loading ? t('Searching...') : t('Search')}
              </button>
              {error && <p className="error">{error}</p>}
            </form>
          ) : (
            <div className="guest-info-card modern-result-card">
              <div className="guest-info-header">
                <span className="success-badge">Confirmed</span>
                <h2>✓ {t('Welcome')}, {foundGuest.name}!</h2>
                <p className="event-details">
                  {foundGuest.eventName} · {foundGuest.eventDate} · {foundGuest.eventLocation}
                </p>
              </div>

              <div className="seating-details">
                <div className="seat-card">
                  <div className="seat-label">{t('Table')}</div>
                  <div className="seat-value">{foundGuest.table}</div>
                </div>
                <div className="seat-card">
                  <div className="seat-label">{t('Seat')}</div>
                  <div className="seat-value">{foundGuest.seatNumber}</div>
                </div>
              </div>

              <button onClick={handleReset} className="secondary">
                {t('Search Another Guest')}
              </button>
            </div>
          )}

          {searched && error && !foundGuest && (
            <div className="error-container modern-error-card">
              <p className="error-icon">!</p>
              <p>{error}</p>
              <button onClick={handleReset} className="secondary">
                {t('Try Again')}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default GuestLookup;
