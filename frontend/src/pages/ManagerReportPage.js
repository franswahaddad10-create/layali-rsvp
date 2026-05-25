import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { eventAPI, guestAPI } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';

const formatDateTime = (value) => {
  if (!value) {
    return '—';
  }

  try {
    return new Date(value).toLocaleString();
  } catch {
    return '—';
  }
};

function ManagerReportPage({ eventId, user }) {
  const { t } = useLanguage();
  const [eventData, setEventData] = useState(null);
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const hasPermission = useCallback((permissionKey) => Boolean(user?.role === 'admin' || user?.permissions?.[permissionKey]), [user]);
  const canViewReports = hasPermission('viewReports') || hasPermission('manageEvents');

  const loadData = useCallback(async () => {
    try {
      setError('');
      const [eventResponse, guestResponse] = await Promise.all([
        eventAPI.getEventById(eventId),
        guestAPI.getEventGuests(eventId),
      ]);

      setEventData(eventResponse.data.event);
      setGuests(guestResponse.data.guests || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || t('Failed to fetch events'));
    } finally {
      setLoading(false);
    }
  }, [eventId, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totals = useMemo(() => {
    const totalSeats = (eventData?.hallLayout || []).reduce((sum, table) => sum + (table.seats?.length || 0), 0);
    const accepted = guests.filter((guest) => guest.rsvpStatus === 'accepted').length;
    const arrived = guests.filter((guest) => guest.arrivalConfirmed).length;
    const declined = guests.filter((guest) => guest.rsvpStatus === 'declined').length;
    const unassigned = guests.filter((guest) => !guest.table).length;

    return {
      totalGuests: guests.length,
      totalSeats,
      accepted,
      arrived,
      declined,
      unassigned,
      occupancyRate: totalSeats ? Math.round(((guests.length - unassigned) / totalSeats) * 100) : 0,
      arrivalRate: accepted ? Math.round((arrived / accepted) * 100) : 0,
    };
  }, [eventData?.hallLayout, guests]);

  const tableRows = useMemo(() => (eventData?.hallLayout || []).map((table) => {
    const tableGuests = guests.filter((guest) => guest.table === table.label);
    return {
      label: table.label,
      seats: table.seats?.length || 0,
      assigned: tableGuests.length,
      arrived: tableGuests.filter((guest) => guest.arrivalConfirmed).length,
      free: Math.max((table.seats?.length || 0) - tableGuests.length, 0),
    };
  }), [eventData?.hallLayout, guests]);

  const groupRows = useMemo(() => {
    const groups = eventData?.groups || [];
    return groups.map((group) => {
      const groupGuests = guests.filter((guest) => guest.groupId === group.id);
      return {
        name: group.name,
        type: group.type,
        guests: groupGuests.length,
        confirmed: groupGuests.filter((guest) => guest.rsvpStatus === 'accepted').length,
        arrived: groupGuests.filter((guest) => guest.arrivalConfirmed).length,
      };
    });
  }, [eventData?.groups, guests]);

  const hourlyArrivalRows = useMemo(() => {
    const buckets = new Map();
    guests.filter((guest) => guest.arrivalTime).forEach((guest) => {
      const hour = new Date(guest.arrivalTime).getHours();
      const key = `${String(hour).padStart(2, '0')}:00`;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    });

    return [...buckets.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([hour, count]) => ({ hour, count }));
  }, [guests]);

  const exportReport = () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
      { Metric: t('Total Guests'), Value: totals.totalGuests },
      { Metric: t('Total Seats'), Value: totals.totalSeats },
      { Metric: t('Confirmed Attending'), Value: totals.accepted },
      { Metric: t('Checked In'), Value: totals.arrived },
      { Metric: t('Occupancy Rate'), Value: `${totals.occupancyRate}%` },
      { Metric: t('Arrival Rate'), Value: `${totals.arrivalRate}%` },
    ]), 'Summary');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(tableRows), 'Tables');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(groupRows), 'Groups');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(hourlyArrivalRows.length ? hourlyArrivalRows : [{ hour: '—', count: 0 }]), 'Arrivals By Hour');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet((eventData?.activityLog || []).map((entry) => ({
      Type: entry.type,
      Message: entry.message,
      Actor: entry.actor?.username || 'system',
      Time: formatDateTime(entry.createdAt),
    }))), 'Activity');
    XLSX.writeFile(workbook, `${eventData?.name || 'event'}-manager-report.xlsx`);
  };

  if (!canViewReports) {
    return (
      <div className="App manager-report-page">
        <main>
          <div className="card luxury-card manager-report-shell">
            <p className="error">{t('You do not have permission to view reports.')}</p>
          </div>
        </main>
      </div>
    );
  }

  if (loading && !eventData) {
    return <div className="App manager-report-page"><main><div className="card luxury-card manager-report-shell"><p>{t('Loading manager report...')}</p></div></main></div>;
  }

  return (
    <div className="App manager-report-page">
      <header className="App-header live-event-map-header-bar">
        <div>
          <h1>{t('Manager Report')}</h1>
          <p>{eventData?.name} · {eventData?.location}</p>
        </div>
        <div className="live-event-map-actions">
          <button className="secondary" onClick={exportReport}>{t('Export Event Report')}</button>
          <button className="secondary" onClick={loadData}>{t('Refresh Live Data')}</button>
        </div>
      </header>
      <main>
        <section className="card luxury-card manager-report-shell">
          {error ? <p className="error">{error}</p> : null}
          <div className="live-stats-grid manager-report-kpis">
            <div className="live-stat-card"><strong>{totals.totalGuests}</strong><span>{t('Total Guests')}</span></div>
            <div className="live-stat-card success"><strong>{totals.accepted}</strong><span>{t('Confirmed Attending')}</span></div>
            <div className="live-stat-card info"><strong>{totals.arrived}</strong><span>{t('Checked In')}</span></div>
            <div className="live-stat-card warning"><strong>{totals.arrivalRate}%</strong><span>{t('Arrival Rate')}</span></div>
            <div className="live-stat-card"><strong>{totals.occupancyRate}%</strong><span>{t('Occupancy Rate')}</span></div>
            <div className="live-stat-card danger"><strong>{totals.unassigned}</strong><span>{t('Unassigned Seats')}</span></div>
          </div>

          <div className="live-panels-grid manager-report-grid">
            <div className="live-panel">
              <h4>{t('Arrival By Hour')}</h4>
              <div className="arrival-hour-grid">
                {hourlyArrivalRows.length ? hourlyArrivalRows.map((row) => (
                  <div key={row.hour} className="arrival-hour-row">
                    <span>{row.hour}</span>
                    <div className="arrival-hour-bar"><i style={{ width: `${Math.max((row.count / Math.max(...hourlyArrivalRows.map((item) => item.count), 1)) * 100, 8)}%` }} /></div>
                    <strong>{row.count}</strong>
                  </div>
                )) : <p className="note">{t('No arrivals have been recorded yet.')}</p>}
              </div>
            </div>

            <div className="live-panel">
              <h4>{t('Tables Overview')}</h4>
              <div className="report-table-list">
                {tableRows.map((row) => (
                  <div key={row.label} className="report-row-card">
                    <strong>{row.label}</strong>
                    <span>{row.assigned} / {row.seats} · {t('Arrived')}: {row.arrived} · {t('Free')}: {row.free}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="live-panel">
              <h4>{t('Groups Overview')}</h4>
              <div className="report-table-list">
                {groupRows.length ? groupRows.map((row) => (
                  <div key={row.name} className="report-row-card">
                    <strong>{row.name}</strong>
                    <span>{t('Confirmed Attending')}: {row.confirmed} · {t('Checked In')}: {row.arrived}</span>
                  </div>
                )) : <p className="note">{t('No groups configured yet.')}</p>}
              </div>
            </div>

            <div className="live-panel">
              <h4>{t('Activity Log')}</h4>
              {(eventData?.activityLog || []).length ? (
                <ul className="activity-log-list">
                  {eventData.activityLog.slice(0, 20).map((entry) => (
                    <li key={entry.id || `${entry.type}-${entry.createdAt}`}>
                      <div>
                        <strong>{entry.message}</strong>
                        <span>{entry.actor?.username || 'system'} · {formatDateTime(entry.createdAt)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="note">{t('No activity recorded yet.')}</p>}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default ManagerReportPage;