import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { eventAPI, guestAPI } from '../services/api';
import HallMap from '../components/HallMap';
import { useLanguage } from '../contexts/LanguageContext';
import { subscribeToLiveEventUpdates } from '../utils/liveEventSync';

const mergeSelectionState = (nextItems = [], previousItems = []) => {
  const selectedIds = new Set(previousItems.filter((item) => item.selected).map((item) => item.id));
  return nextItems.map((item) => ({ ...item, selected: selectedIds.has(item.id) }));
};

function LiveEventTvPage({ eventId }) {
  const { t } = useLanguage();
  const highlightTimeoutRef = useRef(null);
  const [eventData, setEventData] = useState(null);
  const [layout, setLayout] = useState([]);
  const [elements, setElements] = useState([]);
  const [customColors, setCustomColors] = useState({});
  const [guests, setGuests] = useState([]);
  const [highlightedTableLabels, setHighlightedTableLabels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async (highlightGuestId = '') => {
    try {
      setError('');
      const [eventResponse, guestResponse] = await Promise.all([
        eventAPI.getEventById(eventId),
        guestAPI.getEventGuests(eventId),
      ]);

      const nextEvent = eventResponse.data.event;
      const nextGuests = guestResponse.data.guests || [];
      setEventData(nextEvent);
      setLayout((previous) => mergeSelectionState(nextEvent.hallLayout || [], previous));
      setElements((previous) => mergeSelectionState(nextEvent.hallElements || [], previous));
      setCustomColors(nextEvent.customColors || {});
      setGuests(nextGuests);

      if (highlightGuestId) {
        const matchedGuest = nextGuests.find((guest) => guest._id === highlightGuestId);
        if (matchedGuest?.table) {
          setHighlightedTableLabels([matchedGuest.table]);
          window.clearTimeout(highlightTimeoutRef.current);
          highlightTimeoutRef.current = window.setTimeout(() => setHighlightedTableLabels([]), 3200);
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || t('Failed to fetch events'));
    } finally {
      setLoading(false);
    }
  }, [eventId, t]);

  useEffect(() => {
    loadData();
    return () => window.clearTimeout(highlightTimeoutRef.current);
  }, [loadData]);

  useEffect(() => {
    const intervalId = window.setInterval(() => loadData(), 5000);
    return () => window.clearInterval(intervalId);
  }, [loadData]);

  useEffect(() => subscribeToLiveEventUpdates(eventId, (payload) => {
    loadData(payload?.guestId || '');
  }), [eventId, loadData]);

  const guestStats = useMemo(() => layout.reduce((accumulator, table) => {
    const tableGuests = guests.filter((guest) => guest.table === table.label || table.seats.some((seat) => seat.guestId === guest._id || seat.id === guest.seatNumber));
    accumulator[table.label] = {
      assigned: tableGuests.length,
      arrived: tableGuests.filter((guest) => guest.arrivalConfirmed).length,
    };
    return accumulator;
  }, {}), [guests, layout]);

  const stats = useMemo(() => ({
    total: guests.length,
    accepted: guests.filter((guest) => guest.rsvpStatus === 'accepted').length,
    arrived: guests.filter((guest) => guest.arrivalConfirmed).length,
    pending: guests.filter((guest) => guest.rsvpStatus !== 'accepted').length,
    expected: guests.filter((guest) => guest.rsvpStatus === 'accepted' && !guest.arrivalConfirmed).length,
  }), [guests]);

  const recentArrivals = useMemo(() => [...guests]
    .filter((guest) => guest.arrivalConfirmed)
    .sort((left, right) => new Date(right.arrivalTime || 0) - new Date(left.arrivalTime || 0))
    .slice(0, 10), [guests]);

  if (loading && !eventData) {
    return <div className="App live-tv-page"><main><div className="live-event-map-shell"><p>{t('Loading live event map...')}</p></div></main></div>;
  }

  return (
    <div className="App live-tv-page">
      <header className="App-header live-tv-header">
        <div>
          <h1>{eventData?.name}</h1>
          <p>{eventData?.location} · {eventData?.date ? new Date(eventData.date).toLocaleString() : ''}</p>
        </div>
      </header>
      <main className="live-tv-main">
        <section className="live-tv-kpi-grid">
          <article className="live-tv-kpi"><strong>{stats.total}</strong><span>{t('Total Guests')}</span></article>
          <article className="live-tv-kpi success"><strong>{stats.accepted}</strong><span>{t('Confirmed Attending')}</span></article>
          <article className="live-tv-kpi info"><strong>{stats.arrived}</strong><span>{t('Checked In')}</span></article>
          <article className="live-tv-kpi warning"><strong>{stats.expected}</strong><span>{t('Still Expected')}</span></article>
        </section>
        <section className="live-tv-layout">
          <div className="live-tv-map-card card luxury-card">
            {error ? <p className="error">{error}</p> : null}
            <HallMap
              layout={layout}
              setLayout={setLayout}
              elements={elements}
              setElements={setElements}
              customColors={customColors}
              setCustomColors={setCustomColors}
              guestStats={guestStats}
              guests={guests}
              mapLocked={true}
              canEditHallMap={false}
              canAssignGuests={false}
              mode="live"
              highlightedTableLabels={highlightedTableLabels}
              showFloatingStats={false}
              showInspector={false}
              showMapMarkers={false}
            />
          </div>
          <aside className="card luxury-card live-tv-feed">
            <h3>{t('Recent Arrivals')}</h3>
            <ul className="live-list compact">
              {recentArrivals.length ? recentArrivals.map((guest) => (
                <li key={guest._id}>
                  <div>
                    <strong>{[guest.name, guest.surname].filter(Boolean).join(' ')}</strong>
                    <span>{guest.table || t('Not assigned')} · {guest.arrivalTime ? new Date(guest.arrivalTime).toLocaleTimeString() : '—'}</span>
                  </div>
                </li>
              )) : <li><div><strong>{t('No arrivals have been recorded yet.')}</strong></div></li>}
            </ul>
          </aside>
        </section>
      </main>
    </div>
  );
}

export default LiveEventTvPage;