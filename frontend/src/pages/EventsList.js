import React, { useState, useEffect, useCallback } from 'react';
import { eventAPI } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';

function EventsList({ onSelectEvent, onHallDesign }) {
  const { t } = useLanguage();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    date: '',
    location: '',
    description: '',
    capacity: 100,
    status: 'scheduled',
  });

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const response = await eventAPI.getAllEvents();
      setEvents(response.data.events || []);
      setError('');
    } catch (err) {
      setError(t('Failed to fetch events') + ': ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleChange = (key, value) => {
    setFormData({ ...formData, [key]: value });
  };

  const handleCreateEvent = async (event) => {
    event.preventDefault();
    if (!formData.name || !formData.date || !formData.location) {
      setError(t('Name, date, and location are required.'));
      return;
    }

    try {
      await eventAPI.createEvent({
        ...formData,
        date: new Date(formData.date).toISOString(),
      });
      setFormOpen(false);
      setFormData({ name: '', date: '', location: '', description: '', capacity: 100, status: 'scheduled' });
      setError('');
      fetchEvents();
    } catch (err) {
      setError(t('Failed to create event') + ': ' + err.message);
    }
  };

  return (
    <div className="events-page">
      <div className="page-top">
        <div>
          <h2>{t('Luxury Event Lounge')}</h2>
          <p>{t('Plan premium gatherings, import guest lists from Excel, and design a team-ready hall layout.')}</p>
        </div>
        <button onClick={() => setFormOpen(!formOpen)}>
          {formOpen ? t('Close Event Builder') : '+ ' + t('Create New Event')}
        </button>
      </div>

      {formOpen && (
        <form className="event-form" onSubmit={handleCreateEvent}>
          <div className="form-grid">
            <label>
              {t('Event Name')}
              <input value={formData.name} onChange={(e) => handleChange('name', e.target.value)} placeholder={t('Champagne Gala')} />
            </label>
            <label>
              {t('Date')}
              <input type="datetime-local" value={formData.date} onChange={(e) => handleChange('date', e.target.value)} />
            </label>
            <label>
              {t('Location')}
              <input value={formData.location} onChange={(e) => handleChange('location', e.target.value)} placeholder={t('Grand Ballroom')} />
            </label>
            <label>
              {t('Capacity')}
              <input type="number" min="1" value={formData.capacity} onChange={(e) => handleChange('capacity', e.target.value)} />
            </label>
            <label>
              {t('Status')}
              <select value={formData.status} onChange={(e) => handleChange('status', e.target.value)}>
                <option value="draft">{t('Draft')}</option>
                <option value="scheduled">{t('Scheduled')}</option>
                <option value="ongoing">{t('Ongoing')}</option>
                <option value="completed">{t('Completed')}</option>
                <option value="cancelled">{t('Cancelled')}</option>
              </select>
            </label>
            <label className="full-width">
              {t('Description')}
              <textarea value={formData.description} onChange={(e) => handleChange('description', e.target.value)} placeholder={t('Describe the exclusive guest experience...')} />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit">{t('Create Event')}</button>
          </div>
        </form>
      )}

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p>{t('Loading events...')}</p>
      ) : (
        <div className="event-grid">
          {events.length === 0 ? (
            <p>{t('No events yet. Use the builder above to start a new luxury production.')}</p>
          ) : (
            events.map((eventItem) => (
              <div key={eventItem._id} className="event-card">
                <div className="event-card-header">
                  <div>
                    <h3>{eventItem.name}</h3>
                    <p className="event-meta">{eventItem.location} · {new Date(eventItem.date).toLocaleDateString()}</p>
                    {eventItem.serialNumber && (
                      <p className="event-serial">
                        <strong>{t('Event Code')}:</strong> <code>{eventItem.serialNumber}</code>
                      </p>
                    )}
                  </div>
                  <span className="pill">{t(eventItem.status)}</span>
                </div>
                <p className="event-description">{eventItem.description || t('Premium event layout and guest experience.')}</p>
                <div className="event-footer">
                  <span>{eventItem.guests.length} {t('guests')}</span>
                  <div className="event-actions">
                    <button onClick={() => onSelectEvent(eventItem)}>{t('Manage Event')}</button>
                    <button onClick={() => onHallDesign(eventItem)} className="secondary">{t('Hall Design')}</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default EventsList;
