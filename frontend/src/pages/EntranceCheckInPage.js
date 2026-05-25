import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { eventAPI, guestAPI } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';
import { emitLiveEventUpdate, subscribeToLiveEventUpdates } from '../utils/liveEventSync';

const getGuestLabel = (guest) => [guest.name, guest.surname].filter(Boolean).join(' ').trim();

const getSeatOrdinal = (value, fallbackIndex = 0) => {
  if (value === undefined || value === null || value === '') {
    return fallbackIndex + 1;
  }

  const normalizedValue = String(value).trim();
  if (/^\d+$/.test(normalizedValue)) {
    return Number(normalizedValue);
  }

  const match = normalizedValue.match(/-seat-(\d+)$/i);
  if (match) {
    return Number(match[1]);
  }

  return fallbackIndex + 1;
};

const buildAvailableSeats = (hallLayout = [], guests = [], selectedGuestId = '') => {
  const occupiedKeys = new Set();

  guests.forEach((guest) => {
    if (!guest.table || guest._id === selectedGuestId) {
      return;
    }

    occupiedKeys.add(`${guest.table}::${guest.seatNumber}`);
    occupiedKeys.add(`${guest.table}::${getSeatOrdinal(guest.seatNumber)}`);
  });

  return hallLayout.flatMap((table) =>
    (table.seats || []).map((seat, index) => {
      const seatOrder = getSeatOrdinal(seat.id, index);
      if (seat.guestId && String(seat.guestId) !== String(selectedGuestId)) {
        return null;
      }

      if (occupiedKeys.has(`${table.label}::${seat.id}`) || occupiedKeys.has(`${table.label}::${seatOrder}`)) {
        return null;
      }

      return {
        tableId: table.id,
        tableLabel: table.label,
        seatId: seat.id,
        seatOrder,
      };
    }).filter(Boolean)
  );
};

const findContiguousSeatBlocks = (hallLayout = [], guests = [], selectedGuestIds = [], requiredSize = 1) => {
  const excludedGuestIds = new Set(selectedGuestIds.map(String));
  const occupiedKeys = new Set();

  guests.forEach((guest) => {
    if (!guest.table || excludedGuestIds.has(String(guest._id))) {
      return;
    }

    occupiedKeys.add(`${guest.table}::${guest.seatNumber}`);
    occupiedKeys.add(`${guest.table}::${getSeatOrdinal(guest.seatNumber)}`);
  });

  return hallLayout.flatMap((table) => {
    const freeSeats = (table.seats || [])
      .map((seat, index) => {
        const seatOrder = getSeatOrdinal(seat.id, index);
        if ((seat.guestId && !excludedGuestIds.has(String(seat.guestId))) || occupiedKeys.has(`${table.label}::${seat.id}`) || occupiedKeys.has(`${table.label}::${seatOrder}`)) {
          return null;
        }

        return {
          tableId: table.id,
          tableLabel: table.label,
          seatId: seat.id,
          seatOrder,
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.seatOrder - right.seatOrder);

    const blocks = [];
    let run = [];

    freeSeats.forEach((seat, seatIndex) => {
      const previousSeat = freeSeats[seatIndex - 1];
      if (!previousSeat || seat.seatOrder === previousSeat.seatOrder + 1) {
        run.push(seat);
      } else {
        if (run.length >= requiredSize) {
          for (let index = 0; index <= run.length - requiredSize; index += 1) {
            blocks.push({ tableId: table.id, tableLabel: table.label, seats: run.slice(index, index + requiredSize) });
          }
        }
        run = [seat];
      }
    });

    if (run.length >= requiredSize) {
      for (let index = 0; index <= run.length - requiredSize; index += 1) {
        blocks.push({ tableId: table.id, tableLabel: table.label, seats: run.slice(index, index + requiredSize) });
      }
    }

    return blocks;
  });
};

const createWalkInGroupId = () => `walk-in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const isWalkInCompanion = (guest) => guest?.walkInPartyRole === 'companion';

const getWalkInPartyBadge = (guest, t) => {
  if (guest?.walkInPartyRole === 'primary') {
    return t('Walk-In Primary');
  }

  if (guest?.walkInPartyRole === 'companion') {
    return t('Walk-In Companion');
  }

  return '';
};

function EntranceCheckInPage({ eventId, user }) {
  const { t } = useLanguage();
  const searchRef = useRef(null);
  const [eventData, setEventData] = useState(null);
  const [guests, setGuests] = useState([]);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedGuestId, setSelectedGuestId] = useState('');
  const [assignForm, setAssignForm] = useState({ tableId: '', seatId: '', markArrived: true });
  const [groupMoveForm, setGroupMoveForm] = useState({ blockKey: '', markArrived: true });
  const [showWalkInForm, setShowWalkInForm] = useState(false);
  const [walkInForm, setWalkInForm] = useState({ name: '', surname: '', phone: '', numberOfGuests: 1, notes: '', tableId: '', seatId: '', markArrived: true });
  const [listMode, setListMode] = useState('waiting');
  const [showWalkInCompanions, setShowWalkInCompanions] = useState(true);
  const hasPermission = useCallback((permissionKey) => Boolean(user?.role === 'admin' || user?.permissions?.[permissionKey]), [user]);
  const canManageEntrance = hasPermission('manageEntrance') || hasPermission('assignGuests') || hasPermission('escortGuests') || hasPermission('manageGuests');
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

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(loadData, 5000);
    return () => window.clearInterval(intervalId);
  }, [loadData]);

  useEffect(() => subscribeToLiveEventUpdates(eventId, loadData), [eventId, loadData]);

  const visibleGuests = useMemo(() => (showWalkInCompanions ? guests : guests.filter((guest) => !isWalkInCompanion(guest))), [guests, showWalkInCompanions]);
  const waitingGuests = useMemo(() => visibleGuests.filter((guest) => !guest.arrivalConfirmed), [visibleGuests]);
  const acceptedWaitingGuests = useMemo(() => waitingGuests.filter((guest) => guest.rsvpStatus === 'accepted'), [waitingGuests]);
  const unconfirmedWaitingGuests = useMemo(() => waitingGuests.filter((guest) => guest.rsvpStatus !== 'accepted'), [waitingGuests]);
  const recentArrivals = useMemo(() => [...visibleGuests]
    .filter((guest) => guest.arrivalConfirmed)
    .sort((left, right) => new Date(right.arrivalTime || 0) - new Date(left.arrivalTime || 0))
    .slice(0, 10), [visibleGuests]);

  const sourceGuests = useMemo(() => (listMode === 'all' ? guests : waitingGuests), [guests, listMode, waitingGuests]);

  const filteredQueue = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return sourceGuests;
    }

    return sourceGuests.filter((guest) => [guest.name, guest.surname, guest.phone, guest.groupName, guest.table]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalized)));
  }, [query, sourceGuests]);

  const selectedGuest = useMemo(() => guests.find((guest) => guest._id === selectedGuestId) || null, [guests, selectedGuestId]);
  const availableSeats = useMemo(() => buildAvailableSeats(eventData?.hallLayout || [], guests, selectedGuestId), [eventData?.hallLayout, guests, selectedGuestId]);
  const walkInRequiredSeats = useMemo(() => Math.max(Number(walkInForm.numberOfGuests) || 1, 1), [walkInForm.numberOfGuests]);
  const seatOptions = useMemo(() => availableSeats.filter((seat) => !assignForm.tableId || seat.tableId === assignForm.tableId), [assignForm.tableId, availableSeats]);
  const tableOptions = useMemo(() => {
    const tableMap = new Map();
    availableSeats.forEach((seat) => {
      if (!tableMap.has(seat.tableId)) {
        tableMap.set(seat.tableId, { tableId: seat.tableId, tableLabel: seat.tableLabel, freeSeats: 0 });
      }
      tableMap.get(seat.tableId).freeSeats += 1;
    });
    return [...tableMap.values()];
  }, [availableSeats]);
  const walkInSeatBlocks = useMemo(() => findContiguousSeatBlocks(eventData?.hallLayout || [], guests, [], walkInRequiredSeats), [eventData?.hallLayout, guests, walkInRequiredSeats]);
  const walkInSeatOptions = useMemo(() => walkInSeatBlocks.filter((block) => !walkInForm.tableId || block.tableId === walkInForm.tableId), [walkInSeatBlocks, walkInForm.tableId]);
  const walkInTableOptions = useMemo(() => {
    const tableMap = new Map();
    walkInSeatBlocks.forEach((block) => {
      if (!tableMap.has(block.tableId)) {
        tableMap.set(block.tableId, { tableId: block.tableId, tableLabel: block.tableLabel, blockCount: 0 });
      }
      tableMap.get(block.tableId).blockCount += 1;
    });
    return [...tableMap.values()];
  }, [walkInSeatBlocks]);
  const selectedGroupGuests = useMemo(() => {
    if (!selectedGuest?.groupId) {
      return [];
    }

    return guests
      .filter((guest) => guest.groupId === selectedGuest.groupId && (guest.rsvpStatus !== 'declined' || guest.arrivalConfirmed || guest._id === selectedGuest._id))
      .sort((left, right) => getGuestLabel(left).localeCompare(getGuestLabel(right)));
  }, [guests, selectedGuest]);
  const groupSeatBlocks = useMemo(() => {
    if (selectedGroupGuests.length < 2) {
      return [];
    }

    return findContiguousSeatBlocks(eventData?.hallLayout || [], guests, selectedGroupGuests.map((guest) => guest._id), selectedGroupGuests.length);
  }, [eventData?.hallLayout, guests, selectedGroupGuests]);

  const resetAssignForm = () => {
    setSelectedGuestId('');
    setAssignForm({ tableId: '', seatId: '', markArrived: true });
    setGroupMoveForm({ blockKey: '', markArrived: true });
  };

  const refreshWithEvent = async (payload = {}) => {
    emitLiveEventUpdate(eventId, payload.type || 'refresh', payload.details || {});
    await loadData();
  };

  const handleMarkArrived = async (guestId) => {
    try {
      const guest = guests.find((item) => item._id === guestId);
      if (guest && guest.rsvpStatus !== 'accepted') {
        await guestAPI.updateRsvpStatus(guestId, 'accepted');
      }
      const response = await guestAPI.confirmArrival(guestId);
      setMessage('✓ ' + t('Guest marked as arrived.'));
      await refreshWithEvent({ type: 'guest-arrived', details: { guestId: response.data?.guest?._id || guestId } });
    } catch (err) {
      setMessage('✗ ' + t('Failed to mark guest as arrived.') + ': ' + (err.response?.data?.error || err.message));
    }
  };

  const openAssignPanel = (guest) => {
    setSelectedGuestId(guest._id);
    setAssignForm({ tableId: '', seatId: '', markArrived: true });
    setGroupMoveForm({ blockKey: '', markArrived: true });
  };

  const handleAutoAssign = async (guest) => {
    const nextSeat = buildAvailableSeats(eventData?.hallLayout || [], guests, guest._id)[0];

    if (!nextSeat) {
      setMessage('✗ ' + t('No available seats or guests for this action.'));
      return;
    }

    try {
      await guestAPI.updateGuest(guest._id, { table: nextSeat.tableLabel, seatNumber: nextSeat.seatId });
      setMessage(`✓ ${t('Seat assigned on request.')}: ${nextSeat.tableLabel} / ${nextSeat.seatOrder}`);
      await refreshWithEvent({ type: 'seating-updated', details: { guestId: guest._id } });
    } catch (err) {
      setMessage('✗ ' + t('Failed to assign guest') + ': ' + (err.response?.data?.error || err.message));
    }
  };

  const handleSaveAssignment = async (submitEvent) => {
    submitEvent.preventDefault();

    if (!selectedGuest || !assignForm.tableId) {
      setMessage('✗ ' + t('Please choose a table and seat first.'));
      return;
    }

    const selectedSeat = assignForm.seatId
      ? availableSeats.find((seat) => seat.tableId === assignForm.tableId && seat.seatId === assignForm.seatId)
      : availableSeats.find((seat) => seat.tableId === assignForm.tableId);

    if (!selectedSeat) {
      setMessage('✗ ' + t('Selected seat is no longer available.'));
      return;
    }

    try {
      await guestAPI.updateGuest(selectedGuest._id, { table: selectedSeat.tableLabel, seatNumber: selectedSeat.seatId });
      if (assignForm.markArrived) {
        if (selectedGuest.rsvpStatus !== 'accepted') {
          await guestAPI.updateRsvpStatus(selectedGuest._id, 'accepted');
        }
        await guestAPI.confirmArrival(selectedGuest._id);
      }
      setMessage(`✓ ${t('Guest seated successfully.')}: ${selectedSeat.tableLabel} / ${selectedSeat.seatOrder}`);
      resetAssignForm();
      await refreshWithEvent({ type: assignForm.markArrived ? 'guest-arrived' : 'seating-updated', details: { guestId: selectedGuest._id } });
    } catch (err) {
      setMessage('✗ ' + t('Failed to assign guest') + ': ' + (err.response?.data?.error || err.message));
    }
  };

  const handleMoveGroup = async (submitEvent) => {
    submitEvent.preventDefault();

    if (!selectedGroupGuests.length || !groupMoveForm.blockKey) {
      setMessage('✗ ' + t('Please choose a target block first.'));
      return;
    }

    const selectedBlock = groupSeatBlocks.find((block) => `${block.tableId}:${block.seats[0]?.seatId}` === groupMoveForm.blockKey);
    if (!selectedBlock) {
      setMessage('✗ ' + t('Selected block is no longer available.'));
      return;
    }

    try {
      await Promise.all(selectedGroupGuests.map(async (guest, index) => {
        const seat = selectedBlock.seats[index];
        if (!seat) {
          return;
        }
        await guestAPI.updateGuest(guest._id, { table: selectedBlock.tableLabel, seatNumber: seat.seatId });
        if (groupMoveForm.markArrived) {
          if (guest.rsvpStatus !== 'accepted') {
            await guestAPI.updateRsvpStatus(guest._id, 'accepted');
          }
          if (!guest.arrivalConfirmed) {
            await guestAPI.confirmArrival(guest._id);
          }
        }
      }));

      setMessage(`✓ ${t('Group moved successfully.')} ${selectedBlock.tableLabel}`);
      resetAssignForm();
      await refreshWithEvent({ type: 'group-moved', details: { guestId: selectedGuest?._id || '' } });
    } catch (err) {
      setMessage('✗ ' + t('Failed to move group.') + ': ' + (err.response?.data?.error || err.message));
    }
  };

  const handleCreateWalkInGuest = async (submitEvent) => {
    submitEvent.preventDefault();

    if (!walkInForm.name || !walkInForm.phone) {
      setMessage('✗ ' + t('Name and phone are required'));
      return;
    }

    try {
      const selectedBlock = walkInForm.tableId
        ? (walkInForm.seatId
          ? walkInSeatBlocks.find((block) => block.tableId === walkInForm.tableId && block.seats[0]?.seatId === walkInForm.seatId)
          : walkInSeatBlocks.find((block) => block.tableId === walkInForm.tableId))
        : null;

      if (walkInForm.tableId && !selectedBlock) {
        setMessage('✗ ' + t('Selected seat is no longer available.'));
        return;
      }

      if (walkInRequiredSeats > 1 && !walkInSeatBlocks.length) {
        setMessage('✗ ' + t('No contiguous seats available for this group right now.'));
        return;
      }

      const groupId = walkInRequiredSeats > 1 ? createWalkInGroupId() : '';
      const groupName = walkInRequiredSeats > 1 ? `${walkInForm.name} ${walkInForm.surname || ''}`.trim() || t('Walk-In Party') : '';
      const assignedSeats = selectedBlock?.seats || [];

      const response = await guestAPI.addGuest(eventId, {
        name: walkInForm.name,
        surname: walkInForm.surname,
        phone: walkInForm.phone,
        numberOfGuests: Number(walkInForm.numberOfGuests) || 1,
        notes: walkInForm.notes || '',
        groupId,
        groupName,
        walkInPartyRole: selectedBlock ? 'primary' : undefined,
        table: selectedBlock?.tableLabel || '',
        seatNumber: assignedSeats[0]?.seatId || '',
      });

      const createdGuestIds = [response.data?.guest?._id].filter(Boolean);

      if (walkInRequiredSeats > 1 && selectedBlock) {
        const companionSeats = assignedSeats.slice(1);
        for (let index = 0; index < companionSeats.length; index += 1) {
          const seat = companionSeats[index];
          const companionResponse = await guestAPI.addGuest(eventId, {
            name: `${t('Walk-In Companion')} ${index + 1}`,
            surname: walkInForm.surname || '',
            phone: `${walkInForm.phone}-guest-${index + 1}`,
            numberOfGuests: 1,
            notes: walkInForm.notes || t('Auto-created companion for walk-in party.'),
            groupId,
            groupName,
            walkInPartyRole: 'companion',
            table: selectedBlock.tableLabel,
            seatNumber: seat.seatId,
          });
          if (companionResponse.data?.guest?._id) {
            createdGuestIds.push(companionResponse.data.guest._id);
          }
        }
      }

      if (walkInForm.markArrived && createdGuestIds.length) {
        await Promise.all(createdGuestIds.map(async (guestId) => {
          await guestAPI.updateRsvpStatus(guestId, 'accepted');
          await guestAPI.confirmArrival(guestId);
        }));
      }

      setWalkInForm({ name: '', surname: '', phone: '', numberOfGuests: 1, notes: '', tableId: '', seatId: '', markArrived: true });
      setShowWalkInForm(false);
      setMessage(selectedBlock
        ? `✓ ${t('Guest seated successfully.')}: ${selectedBlock.tableLabel} / ${assignedSeats[0]?.seatOrder}${assignedSeats.length > 1 ? ` - ${assignedSeats[assignedSeats.length - 1]?.seatOrder}` : ''}`
        : '✓ ' + t('Walk-in guest added successfully.'));
      await refreshWithEvent({ type: 'walk-in-added', details: { guestId: createdGuestIds[0] || '' } });
    } catch (err) {
      setMessage('✗ ' + t('Failed to save guest') + ': ' + (err.response?.data?.error || err.message));
    }
  };

  if (loading && !eventData) {
    return <div className="App entrance-checkin-page"><main><div className="live-event-map-shell"><p>{t('Loading live event map...')}</p></div></main></div>;
  }

  return (
    <div className="App entrance-checkin-page">
      <header className="App-header live-event-map-header-bar">
        <div>
          <h1>{t('Entrance Check-In')}</h1>
          <p>{eventData?.name} · {eventData?.location}</p>
        </div>
        <div className="live-event-map-actions">
          <button className="secondary" onClick={() => setShowWalkInForm((previous) => !previous)}>{showWalkInForm ? t('Cancel') : t('Add Walk-In Guest')}</button>
          {canViewReports ? <button className="secondary" onClick={() => window.open(`${window.location.origin}/?managerReportEvent=${eventId}`, '_blank', 'noopener,noreferrer')}>{t('Open Manager Report')}</button> : null}
          <button className="secondary" onClick={loadData}>{t('Refresh Live Data')}</button>
        </div>
      </header>
      <main>
        <section className="card luxury-card entrance-checkin-shell">
          <div className="live-stats-grid">
            <div className="live-stat-card info"><strong>{recentArrivals.length}</strong><span>{t('Checked In')}</span></div>
            <div className="live-stat-card"><strong>{acceptedWaitingGuests.length}</strong><span>{t('Still Expected')}</span></div>
            <div className="live-stat-card warning"><strong>{unconfirmedWaitingGuests.length}</strong><span>{t('Not Confirmed Yet')}</span></div>
          </div>

          {showWalkInForm ? (
            <form className="walk-in-form" onSubmit={handleCreateWalkInGuest}>
              <div className="section-header">
                <div>
                  <h3>{t('Add Walk-In Guest')}</h3>
                  <span className="note">{t('Create a guest on the spot and record how many people arrived with them.')}</span>
                </div>
              </div>
              <div className="group-inputs">
                <label>
                  {t('First Name')}
                  <input value={walkInForm.name} onChange={(event) => setWalkInForm((previous) => ({ ...previous, name: event.target.value }))} required />
                </label>
                <label>
                  {t('Surname')}
                  <input value={walkInForm.surname} onChange={(event) => setWalkInForm((previous) => ({ ...previous, surname: event.target.value }))} />
                </label>
                <label>
                  {t('Phone Number')}
                  <input value={walkInForm.phone} onChange={(event) => setWalkInForm((previous) => ({ ...previous, phone: event.target.value }))} required />
                </label>
                <label>
                  {t('Party Size')}
                  <input type="number" min="1" value={walkInForm.numberOfGuests} onChange={(event) => setWalkInForm((previous) => ({ ...previous, numberOfGuests: event.target.value }))} />
                </label>
                <label>
                  {t('Table')}
                  <select value={walkInForm.tableId} onChange={(event) => setWalkInForm((previous) => ({ ...previous, tableId: event.target.value, seatId: '' }))}>
                    <option value="">{t('Select Table')}</option>
                    {walkInTableOptions.map((table) => (
                      <option key={table.tableId} value={table.tableId}>{table.tableLabel} · {table.blockCount} {t('Contiguous Seats')}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('Seat')}
                  <select value={walkInForm.seatId} onChange={(event) => setWalkInForm((previous) => ({ ...previous, seatId: event.target.value }))} disabled={!walkInForm.tableId}>
                    <option value="">{t('Select Seat')}</option>
                    {walkInSeatOptions.map((block) => (
                      <option key={`${block.tableId}:${block.seats[0]?.seatId}`} value={block.seats[0]?.seatId || ''}>{block.tableLabel} / {t('Seat')} {block.seats[0]?.seatOrder}{block.seats.length > 1 ? ` - ${block.seats[block.seats.length - 1]?.seatOrder}` : ''}</option>
                    ))}
                  </select>
                </label>
                <label className="full-width">
                  {t('Guest Notes')}
                  <textarea value={walkInForm.notes} onChange={(event) => setWalkInForm((previous) => ({ ...previous, notes: event.target.value }))} />
                </label>
                <label className="checkbox-row full-width">
                  <input type="checkbox" checked={walkInForm.markArrived} onChange={(event) => setWalkInForm((previous) => ({ ...previous, markArrived: event.target.checked }))} />
                  <span>{t('Mark guest as arrived immediately')}</span>
                </label>
              </div>
              <div className="form-actions">
                <button type="submit">{t('Create Walk-In Guest')}</button>
              </div>
            </form>
          ) : null}

          <div className="entrance-search-row">
            <input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('Search guests...')} />
            <div className="live-map-filter-bar entrance-mode-toggle">
              <label>
                {t('Guest Scope')}
                <select value={listMode} onChange={(event) => setListMode(event.target.value)}>
                  <option value="waiting">{t('Waiting Guests')}</option>
                  <option value="all">{t('All Guests')}</option>
                </select>
              </label>
              <label className="checkbox-row compact-toggle">
                <input type="checkbox" checked={showWalkInCompanions} onChange={(event) => setShowWalkInCompanions(event.target.checked)} />
                <span>{t('Show Walk-In Companions')}</span>
              </label>
            </div>
            {message ? <p className={message.includes('✓') ? 'success' : 'error'}>{message}</p> : null}
            {error ? <p className="error">{error}</p> : null}
          </div>

          <div className="live-panels-grid entrance-checkin-grid">
            <div className="live-panel entrance-queue-panel">
              <h4>{t('Guests Waiting At Entrance')}</h4>
              {filteredQueue.length ? (
                <ul className="live-list">
                  {filteredQueue.slice(0, 30).map((guest) => (
                    <li key={guest._id} className="entrance-guest-row">
                      <div>
                        <strong>{getGuestLabel(guest)}</strong>
                        {getWalkInPartyBadge(guest, t) ? <span className={`walk-in-role-pill ${guest.walkInPartyRole}`}>{getWalkInPartyBadge(guest, t)}</span> : null}
                        <span>{guest.phone} · {guest.table || t('Not assigned')} · {guest.groupName || t('No Group')}</span>
                        <span className={`status-pill ${guest.rsvpStatus || 'pending'}`}>{t(guest.rsvpStatus || 'pending')}</span>
                      </div>
                      <div className="entrance-guest-actions">
                        {!guest.arrivalConfirmed ? <button onClick={() => handleMarkArrived(guest._id)}>{t('Mark Arrived')}</button> : null}
                        {canManageEntrance && !guest.table ? <button className="secondary" onClick={() => handleAutoAssign(guest)}>{t('Assign Seat On Request')}</button> : null}
                        {canManageEntrance ? <button className="secondary" onClick={() => openAssignPanel(guest)}>{guest.table ? t('Transfer Guest') : t('Seat Guest')}</button> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="note">{t('No guests are currently waiting for check-in.')}</p>
              )}
            </div>
            <div className="live-panel entrance-side-panel">
              <h4>{selectedGuest ? t('Manual Seating') : t('Recent Arrivals')}</h4>
              {selectedGuest ? (
                <div className="entrance-transfer-stack">
                  <form className="entrance-seat-form" onSubmit={handleSaveAssignment}>
                    <div className="selected-guest-box">
                      <strong>{selectedGuest.name} {selectedGuest.surname || ''}</strong>
                      <span>{selectedGuest.phone} · {selectedGuest.groupName || t('No Group')}</span>
                    </div>
                    <label>
                      {t('Table')}
                      <select value={assignForm.tableId} onChange={(event) => setAssignForm((previous) => ({ ...previous, tableId: event.target.value, seatId: '' }))}>
                        <option value="">{t('Select Table')}</option>
                        {tableOptions.map((table) => (
                          <option key={table.tableId} value={table.tableId}>{table.tableLabel} · {table.freeSeats} {t('Free Seats')}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t('Seat')}
                      <select value={assignForm.seatId} onChange={(event) => setAssignForm((previous) => ({ ...previous, seatId: event.target.value }))}>
                        <option value="">{t('Select Seat')}</option>
                        {seatOptions.map((seat) => (
                          <option key={seat.seatId} value={seat.seatId}>{seat.tableLabel} / {t('Seat')} {seat.seatOrder}</option>
                        ))}
                      </select>
                    </label>
                    <label className="checkbox-row">
                      <input type="checkbox" checked={assignForm.markArrived} onChange={(event) => setAssignForm((previous) => ({ ...previous, markArrived: event.target.checked }))} />
                      <span>{t('Mark guest as arrived immediately')}</span>
                    </label>
                    <div className="entrance-seat-actions">
                      <button type="submit">{assignForm.markArrived ? t('Seat And Check In') : t('Save Seat Assignment')}</button>
                      <button type="button" className="secondary" onClick={resetAssignForm}>{t('Cancel')}</button>
                    </div>
                  </form>

                  {canManageEntrance && selectedGroupGuests.length > 1 ? (
                    <form className="entrance-seat-form" onSubmit={handleMoveGroup}>
                      <div className="selected-guest-box highlight">
                        <strong>{t('Transfer Group')}</strong>
                        <span>{selectedGuest.groupName || t('No Group')} · {selectedGroupGuests.length} {t('members')}</span>
                      </div>
                      <label>
                        {t('Contiguous Seats')}
                        <select value={groupMoveForm.blockKey} onChange={(event) => setGroupMoveForm((previous) => ({ ...previous, blockKey: event.target.value }))}>
                          <option value="">{t('Select Target Block')}</option>
                          {groupSeatBlocks.map((block) => (
                            <option key={`${block.tableId}:${block.seats[0]?.seatId}`} value={`${block.tableId}:${block.seats[0]?.seatId}`}>
                              {block.tableLabel} · {block.seats.map((seat) => seat.seatOrder).join(', ')}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="checkbox-row">
                        <input type="checkbox" checked={groupMoveForm.markArrived} onChange={(event) => setGroupMoveForm((previous) => ({ ...previous, markArrived: event.target.checked }))} />
                        <span>{t('Mark group as arrived immediately')}</span>
                      </label>
                      {groupSeatBlocks.length === 0 ? <p className="note">{t('No contiguous seats available for this group right now.')}</p> : null}
                      <div className="entrance-seat-actions">
                        <button type="submit">{t('Transfer Group')}</button>
                      </div>
                    </form>
                  ) : null}
                </div>
              ) : recentArrivals.length ? (
                <ul className="live-list compact">
                  {recentArrivals.map((guest) => (
                    <li key={guest._id}>
                      <div>
                        <strong>{getGuestLabel(guest)}</strong>
                        {getWalkInPartyBadge(guest, t) ? <span className={`walk-in-role-pill ${guest.walkInPartyRole}`}>{getWalkInPartyBadge(guest, t)}</span> : null}
                        <span>{guest.table || t('Not assigned')} · {new Date(guest.arrivalTime).toLocaleTimeString()}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="note">{t('No arrivals have been recorded yet.')}</p>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default EntranceCheckInPage;