import React, { useEffect, useState } from 'react';
import { publicGuestAPI } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';

function GuestRsvpPage({ token }) {
  const { t } = useLanguage();
  const [guest, setGuest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadInvitation = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await publicGuestAPI.getInvitation(token);
        setGuest(response.data.guest);
      } catch (err) {
        setError(err.response?.data?.error || t('Invitation not found.'));
      } finally {
        setLoading(false);
      }
    };

    loadInvitation();
  }, [token, t]);

  const handleRsvp = async (status) => {
    try {
      setSubmitting(true);
      setError('');
      const response = await publicGuestAPI.submitRsvp(token, status);
      setGuest(response.data.guest);
      setMessage(t('Thanks, your response was received.'));
    } catch (err) {
      setError(err.response?.data?.error || t('Failed to update RSVP.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="App guest-rsvp-page">
        <div className="guest-rsvp-card">
          <h1>{t('Confirm Attendance')}</h1>
          <p>{t('Loading invitation...')}</p>
        </div>
      </div>
    );
  }

  if (!guest) {
    return (
      <div className="App guest-rsvp-page">
        <div className="guest-rsvp-card">
          <h1>{t('Confirm Attendance')}</h1>
          <p className="error">{error || t('Invitation not found.')}</p>
        </div>
      </div>
    );
  }

  const eventDate = guest.event?.date ? new Date(guest.event.date) : null;

  return (
    <div className="App guest-rsvp-page">
      <div className="guest-rsvp-card">
        <h1>{t('Confirm Attendance')}</h1>
        <p>{t('Open your invite and answer in one tap.')}</p>

        <div className="rsvp-event-meta">
          <strong>{guest.name} {guest.surname || ''}</strong>
          <span>{guest.event?.name}</span>
          <span>{eventDate ? eventDate.toLocaleDateString() : ''}</span>
          <span>{guest.event?.location || ''}</span>
        </div>

        <h2>{t('Will you attend?')}</h2>
        <div className="rsvp-response-actions">
          <button type="button" onClick={() => handleRsvp('accepted')} disabled={submitting}>
            {t('I Will Attend')}
          </button>
          <button type="button" className="decline-btn" onClick={() => handleRsvp('declined')} disabled={submitting}>
            {t('I Cannot Attend')}
          </button>
        </div>

        <div className="rsvp-response-status">
          <strong>{t('Your current response')}:</strong>
          <span className={`status-pill ${guest.rsvpStatus || 'pending'}`}>{t(guest.rsvpStatus || 'pending')}</span>
          {message ? <p>{message}</p> : <p>{t('You can change your response any time using the same link.')}</p>}
        </div>

        {(guest.table || guest.seatNumber) && (
          <div className="rsvp-seat-summary">
            <div className="rsvp-seat-chip">
              <strong>{t('Table')}</strong>
              <span>{guest.table || t('Not assigned')}</span>
            </div>
            <div className="rsvp-seat-chip">
              <strong>{t('Seat')}</strong>
              <span>{guest.seatNumber || t('Not assigned')}</span>
            </div>
          </div>
        )}

        {error ? <p className="error">{error}</p> : null}
      </div>
    </div>
  );
}

export default GuestRsvpPage;
