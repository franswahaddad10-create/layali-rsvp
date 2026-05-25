import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { eventAPI, guestAPI } from '../services/api';
import HallMap from '../components/HallMap';
import { useLanguage } from '../contexts/LanguageContext';
import { subscribeToLiveEventUpdates } from '../utils/liveEventSync';

const mergeSelectionState = (nextItems = [], previousItems = []) => {
  const selectedIds = new Set(previousItems.filter((item) => item.selected).map((item) => item.id));
  return nextItems.map((item) => ({ ...item, selected: selectedIds.has(item.id) }));
};

function LiveEventMapPage({ eventId }) {
  const { t } = useLanguage();
  const highlightTimeoutRef = useRef(null);
  const [eventData, setEventData] = useState(null);
  const [layout, setLayout] = useState([]);
  const [elements, setElements] = useState([]);
  const [customColors, setCustomColors] = useState({});
  const [guests, setGuests] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [occupancyFilter, setOccupancyFilter] = useState('all');
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
      setEventData(nextEvent);
      setLayout((previous) => mergeSelectionState(nextEvent.hallLayout || [], previous));
      setElements((previous) => mergeSelectionState(nextEvent.hallElements || [], previous));
      setCustomColors(nextEvent.customColors || {});
      const nextGuests = guestResponse.data.guests || [];
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
    const intervalId = window.setInterval(() => {
      loadData();
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [loadData]);

  useEffect(() => subscribeToLiveEventUpdates(eventId, (payload) => {
    loadData(payload?.guestId || '');
  }), [eventId, loadData]);

  useEffect(() => {
    const handleFocus = () => {
      loadData();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [loadData]);

  const guestStats = useMemo(() => {
    return layout.reduce((accumulator, table) => {
      const tableGuests = guests.filter((guest) => guest.table === table.label || table.seats.some((seat) => seat.guestId === guest._id || seat.id === guest.seatNumber));
      accumulator[table.label] = {
        assigned: tableGuests.length,
        arrived: tableGuests.filter((guest) => guest.arrivalConfirmed).length,
      };
      return accumulator;
    }, {});
  }, [guests, layout]);

  const groupOptions = useMemo(() => Array.from(new Set(guests.map((guest) => guest.groupName).filter(Boolean))).sort((left, right) => left.localeCompare(right)), [guests]);

  const filteredLayout = useMemo(() => {
    const getGuestStatus = (guest) => {
      if (!guest) {
        return 'empty';
      }

      if (guest.arrivalConfirmed) {
        return 'arrived';
      }

      if (guest.rsvpStatus === 'accepted') {
        return 'confirmed';
      }

      return 'pending';
    };

    return layout.filter((table) => {
      const tableGuests = guests.filter((guest) => guest.table === table.label);
      const assignedCount = tableGuests.length;
      const hasFreeSeat = assignedCount < table.seats.length;

      if (occupancyFilter === 'open' && !hasFreeSeat) {
        return false;
      }

      if (occupancyFilter === 'full' && hasFreeSeat) {
        return false;
      }

      if (statusFilter === 'all' && groupFilter === 'all') {
        return true;
      }

      if (statusFilter === 'free') {
        return hasFreeSeat;
      }

      return tableGuests.some((guest) => {
        if (groupFilter !== 'all' && guest.groupName !== groupFilter) {
          return false;
        }

        if (statusFilter === 'all') {
          return true;
        }

        return getGuestStatus(guest) === statusFilter;
      });
    });
  }, [groupFilter, guests, layout, occupancyFilter, statusFilter]);

  if (loading && !eventData) {
    return (
      <div className="App live-event-map-page">
        <main>
          <div className="live-event-map-shell">
            <p>{t('Loading live event map...')}</p>
          </div>
        </main>
      </div>
    );
  }

  if (error && !eventData) {
    return (
      <div className="App live-event-map-page">
        <main>
          <div className="live-event-map-shell">
            <p className="error">{error}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="App live-event-map-page">
      <header className="App-header live-event-map-header-bar">
        <div>
          <h1>{t('Live Event Map')}</h1>
          <p>{eventData?.name} · {eventData?.location}</p>
        </div>
        <div className="live-event-map-actions">
          <button className="secondary" onClick={loadData}>{t('Refresh Live Data')}</button>
        </div>
      </header>
      <main>
        <div className="live-event-map-shell">
          <div className="live-map-filter-bar">
            <label>
              {t('Status')}
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">{t('All Guests')}</option>
                <option value="pending">{t('Not Confirmed')}</option>
                <option value="confirmed">{t('Confirmed Not Arrived')}</option>
                <option value="arrived">{t('Arrived')}</option>
                <option value="free">{t('Free Seats')}</option>
              </select>
            </label>
            <label>
              {t('Group')}
              <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
                <option value="all">{t('All Groups')}</option>
                {groupOptions.map((groupName) => (
                  <option key={groupName} value={groupName}>{groupName}</option>
                ))}
              </select>
            </label>
            <label>
              {t('Table Occupancy')}
              <select value={occupancyFilter} onChange={(event) => setOccupancyFilter(event.target.value)}>
                <option value="all">{t('All Tables')}</option>
                <option value="open">{t('Tables With Free Seats')}</option>
                <option value="full">{t('Full Tables')}</option>
              </select>
            </label>
          </div>
          <div className="live-seat-legend">
            <span><i className="legend-dot empty" /> {t('Empty Seat')}</span>
            <span><i className="legend-dot pending" /> {t('Not Confirmed')}</span>
            <span><i className="legend-dot confirmed" /> {t('Confirmed Not Arrived')}</span>
            <span><i className="legend-dot arrived" /> {t('Arrived')}</span>
          </div>
          {!filteredLayout.length ? <p className="note">{t('No tables match the current filters.')}</p> : null}
          {error ? <p className="error">{error}</p> : null}
          <HallMap
            layout={filteredLayout}
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
          />
        </div>
      </main>
    </div>
  );
}

export default LiveEventMapPage;
