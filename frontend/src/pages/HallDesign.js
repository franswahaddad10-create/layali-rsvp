import React, { useState, useEffect, useCallback, useRef } from 'react';
import { eventAPI, guestAPI } from '../services/api';
import HallMap from '../components/HallMap';
import { useLanguage } from '../contexts/LanguageContext';
import usePointerDrag, { getPointerPoint, isPrimaryPointer } from '../hooks/usePointerDrag';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf';

const DEFAULT_SCAN_REFERENCE = {
  imageData: '',
  fileName: '',
  opacity: 0.42,
  updatedAt: '',
};

const clampScanOpacity = (value) => {
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    return DEFAULT_SCAN_REFERENCE.opacity;
  }

  return Math.max(0.08, Math.min(0.9, numericValue));
};

const resizeImageFile = (file, maxWidth = 1800, maxHeight = 1200, quality = 0.82) => new Promise((resolve, reject) => {
  const reader = new FileReader();

  reader.onload = () => {
    const image = new Image();

    image.onload = () => {
      let { width, height } = image;
      const scale = Math.min(maxWidth / width, maxHeight / height, 1);
      width = Math.round(width * scale);
      height = Math.round(height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');

      if (!context) {
        reject(new Error('Canvas is not available.'));
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };

    image.onerror = () => reject(new Error('Failed to read image.'));
    image.src = reader.result;
  };

  reader.onerror = () => reject(new Error('Failed to read file.'));
  reader.readAsDataURL(file);
});

const renderPdfFileToImage = async (file, maxWidth = 1800, maxHeight = 1200, quality = 0.9) => {
  const pdfBytes = await file.arrayBuffer();
  const pdfDocument = await getDocument({ data: pdfBytes, disableWorker: true }).promise;
  const page = await pdfDocument.getPage(1);
  const initialViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(maxWidth / initialViewport.width, maxHeight / initialViewport.height, 2.4);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas is not available.');
  }

  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL('image/jpeg', quality);
};

function HallDesign({ event, onBack, user }) {
  const { t } = useLanguage();
  const layoutAreaRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const initializedRef = useRef(false);
  const lastSavedSnapshotRef = useRef('');
  const [hallLayout, setHallLayout] = useState(event.hallLayout || []);
  const [hallElements, setHallElements] = useState(event.hallElements || []);
  const [customColors, setCustomColors] = useState(event.customColors || {});
  const [hallScanReference, setHallScanReference] = useState(event.hallScanReference || DEFAULT_SCAN_REFERENCE);
  const [guests, setGuests] = useState([]);
  const [guestSearch, setGuestSearch] = useState('');
  const [isGuestListVisible, setIsGuestListVisible] = useState(true);
  const [guestPanelPosition, setGuestPanelPosition] = useState({ x: 18, y: 18 });
  const [guestPanelDrag, setGuestPanelDrag] = useState(null);
  const [selectedGuestToAssign, setSelectedGuestToAssign] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [mapLocked, setMapLocked] = useState(false);

  const buildLayoutPayload = useCallback(() => ({
    hallLayout: hallLayout.map(({ selected, ...rest }) => rest),
    hallElements: hallElements.map(({ selected, ...rest }) => rest),
    customColors,
    hallScanReference,
    mapLocked,
  }), [customColors, hallElements, hallLayout, hallScanReference, mapLocked]);

  const canManageMapLock = Boolean(user?.role === 'admin' || user?.permissions?.manageMapLock);
  const canEditHallMap = Boolean(user?.role === 'admin' || user?.permissions?.editHallMap);
  const canAssignGuests = Boolean(user?.role === 'admin' || user?.permissions?.assignGuests);

  const fetchGuests = useCallback(async () => {
    try {
      const response = await guestAPI.getEventGuests(event._id);
      setGuests(response.data.guests || []);
    } catch (err) {
      setMessage('✗ ' + (err.response?.data?.error || err.message));
    }
  }, [event._id]);

  useEffect(() => {
    setHallLayout(event.hallLayout || []);
    setHallElements(event.hallElements || []);
    setCustomColors(event.customColors || {});
    setHallScanReference(event.hallScanReference || DEFAULT_SCAN_REFERENCE);
    setMapLocked(Boolean(event.mapLocked));
    lastSavedSnapshotRef.current = JSON.stringify({
      hallLayout: (event.hallLayout || []).map(({ selected, ...rest }) => rest),
      hallElements: (event.hallElements || []).map(({ selected, ...rest }) => rest),
      customColors: event.customColors || {},
      hallScanReference: event.hallScanReference || DEFAULT_SCAN_REFERENCE,
      mapLocked: Boolean(event.mapLocked),
    });
    initializedRef.current = false;
    fetchGuests();
  }, [event._id, event.hallLayout, event.hallElements, event.customColors, event.hallScanReference, event.mapLocked, fetchGuests]);

  const handleSelectGuestToAssign = (guest) => {
    setSelectedGuestToAssign(guest);
    setMessage('');
  };

  const handleAssignGuestToTable = async (guestId, tableId, seatId) => {
    try {
      const table = hallLayout.find((item) => item.id === tableId);
      if (!table) {
        setMessage('✗ Table not found.');
        return;
      }

      const chosenSeatId = seatId || table.seats.find((seat, seatIndex) => {
        const seatOccupiedInLayout = Boolean(seat.guestId);
        const seatOccupiedByGuest = guests.some((guest) => guest._id !== guestId && guest.table === table.label && String(guest.seatNumber) === String(seat.id));
        const seatOccupiedByOrdinal = guests.some((guest) => guest._id !== guestId && guest.table === table.label && String(guest.seatNumber) === String(seatIndex + 1));
        return !seatOccupiedInLayout && !seatOccupiedByGuest && !seatOccupiedByOrdinal;
      })?.id;

      if (!chosenSeatId) {
        setMessage('✗ ' + t('No free seat is available at this table.'));
        return;
      }

      await guestAPI.updateGuest(guestId, { table: table.label, seatNumber: chosenSeatId });

      const newLayout = hallLayout.map((item) => ({
        ...item,
        seats: item.seats.map((seat) => (
          seat.guestId === guestId ? { ...seat, guestId: null } : seat
        )),
      }));

      setHallLayout(newLayout.map((item) => (
        item.id === tableId
          ? {
              ...item,
              seats: item.seats.map((seat) => (
                seat.id === chosenSeatId ? { ...seat, guestId } : seat
              )),
            }
          : item
      )));

      setSelectedGuestToAssign(null);
      setMessage(`✓ ${t('Guest assigned successfully.')} ${table.label}`);
      fetchGuests();
    } catch (err) {
      setMessage('✗ Failed to assign guest: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleSaveLayout = useCallback(async ({ silent = false } = {}) => {
    try {
      setLoading(true);
      const payload = buildLayoutPayload();
      await eventAPI.updateEvent(event._id, payload);
      lastSavedSnapshotRef.current = JSON.stringify(payload);
      setMessage(`✓ ${silent ? t('Hall layout auto-saved.') : t('Hall layout saved successfully')}`);
      setTimeout(() => setMessage(''), silent ? 1800 : 3000);
    } catch (err) {
      setMessage(`✗ ${t('Failed to save layout')}: ` + err.message);
    } finally {
      setLoading(false);
    }
  }, [buildLayoutPayload, event._id, t]);

  useEffect(() => {
    const snapshot = JSON.stringify(buildLayoutPayload());

    if (!initializedRef.current) {
      initializedRef.current = true;
      lastSavedSnapshotRef.current = snapshot;
      return undefined;
    }

    if (snapshot === lastSavedSnapshotRef.current) {
      return undefined;
    }

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      handleSaveLayout({ silent: true });
    }, 900);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [buildLayoutPayload, handleSaveLayout]);

  usePointerDrag(guestPanelDrag, useCallback((event, point) => {
    const bounds = layoutAreaRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    const nextX = Math.max(8, Math.min(bounds.width - 340, point.clientX - bounds.left - guestPanelDrag.offsetX));
    const nextY = Math.max(8, Math.min(bounds.height - 220, point.clientY - bounds.top - guestPanelDrag.offsetY));
    setGuestPanelPosition({ x: nextX, y: nextY });
  }, [guestPanelDrag]), useCallback(() => {
    setGuestPanelDrag(null);
  }, []));

  const handleGuestPanelDragStart = (event) => {
    if (!isPrimaryPointer(event)) {
      return;
    }

    if (event.pointerType === 'touch') {
      event.preventDefault();
    }

    const bounds = layoutAreaRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    const point = getPointerPoint(event);
    setGuestPanelDrag({
      offsetX: point.clientX - bounds.left - guestPanelPosition.x,
      offsetY: point.clientY - bounds.top - guestPanelPosition.y,
    });
  };

  const handlePrintPlan = () => {
    window.print();
  };

  const handleExportPlan = () => {
    const payload = {
      event: {
        id: event._id,
        name: event.name,
        date: event.date,
        location: event.location,
      },
      layout: hallLayout.map(({ selected, ...rest }) => rest),
      elements: hallElements.map(({ selected, ...rest }) => rest),
      customColors,
      hallScanReference,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.setAttribute('download', `${event.name.replace(/\s+/g, '_')}_hallplan.json`);
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const filteredGuests = guests.filter((guest) => {
    const query = guestSearch.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return [guest.name, guest.surname, guest.phone, guest.group, guest.table, guest.seatNumber]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(query));
  });

  const handleUploadScanReference = async (eventChange) => {
    const file = eventChange.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const imageData = isPdf
        ? await renderPdfFileToImage(file)
        : await resizeImageFile(file);
      setHallScanReference({
        imageData,
        fileName: file.name,
        opacity: hallScanReference.opacity || DEFAULT_SCAN_REFERENCE.opacity,
        updatedAt: new Date().toISOString(),
      });
      setMessage(`✓ ${t(isPdf ? 'PDF scan reference added.' : 'Hall scan reference added.')}`);
    } catch (error) {
      setMessage(`✗ ${t('Failed to load hall scan reference.')}: ${error.message}`);
    } finally {
      eventChange.target.value = '';
    }
  };

  const handleClearScanReference = () => {
    setHallScanReference(DEFAULT_SCAN_REFERENCE);
    setMessage(`✓ ${t('Hall scan reference cleared.')}`);
  };

  return (
    <div className="event-detail hall-design-page">
      <button className="back-button" onClick={onBack}>← {t('Back to Events')}</button>

      <div className="hero-card">
        <div>
          <h2>{t('Luxury Hall Layout')}</h2>
          <p className="subtext">{event.name} · {event.location}</p>
          <p className="luxury-description">{t('Drag tables into place, assign teams, and optimize your guest flow')}</p>
        </div>
        <div className="hero-actions">
          <button type="button" disabled={!canManageMapLock} className={mapLocked ? 'secondary active-lock' : 'secondary'} onClick={() => setMapLocked((current) => !current)} title={!canManageMapLock ? t('Only admins can lock or unlock the hall map.') : ''}>
            {mapLocked ? t('Unlock Map Changes') : t('Lock Map Changes')}
          </button>
          <button onClick={handleSaveLayout} disabled={loading || !canEditHallMap || (mapLocked && !canManageMapLock)} title={!canEditHallMap ? t('You do not have permission to edit the hall map.') : mapLocked && !canManageMapLock ? t('Hall map is locked. Only admins can save map changes.') : ''}>
            {loading ? t('Saving...') : t('Save Hall Layout')}
          </button>
        </div>
      </div>

      {message && <p className={message.includes('✓') ? 'success' : 'error'}>{message}</p>}

      <section className="card luxury-card hall-scan-card">
        <div className="section-header">
          <div>
            <h3>{t('Hall Scan Reference')}</h3>
            <span className="note">{t('Use a camera photo, floor-plan image, or scanner export as a transparent guide under the hall map. LiDAR auto-detection is not available in this web version, but this gives you a fast alignment workflow.')}</span>
          </div>
        </div>
        <div className="hall-scan-controls">
          <label className="file-upload hall-scan-upload">
            {t('Upload Scan Or Photo')}
            <input type="file" accept="image/*,application/pdf,.pdf" capture="environment" onChange={handleUploadScanReference} disabled={!canEditHallMap || (mapLocked && !canManageMapLock)} />
          </label>
          <label>
            {t('Overlay Opacity')}
            <input
              type="range"
              min="0.08"
              max="0.9"
              step="0.02"
              value={hallScanReference.opacity || DEFAULT_SCAN_REFERENCE.opacity}
              disabled={!hallScanReference.imageData || !canEditHallMap || (mapLocked && !canManageMapLock)}
              onChange={(changeEvent) => setHallScanReference((current) => ({
                ...current,
                opacity: clampScanOpacity(changeEvent.target.value),
                updatedAt: new Date().toISOString(),
              }))}
            />
          </label>
          <button type="button" className="secondary" onClick={handleClearScanReference} disabled={!hallScanReference.imageData || !canEditHallMap || (mapLocked && !canManageMapLock)}>{t('Clear Scan Reference')}</button>
        </div>
        {hallScanReference.fileName ? <p className="note">{t('Current scan reference')}: {hallScanReference.fileName}</p> : null}
      </section>

      <div className={`hall-design-content hall-design-grid${isGuestListVisible ? '' : ' guest-panel-hidden'}`}>
        <div className="hall-layout-area floating-layout-area" ref={layoutAreaRef}>
          {!isGuestListVisible ? (
            <div
              className="hall-layout-toolbar floating-guest-reopen"
              style={{ left: `${guestPanelPosition.x}px`, top: `${guestPanelPosition.y}px` }}
            >
              <button
                type="button"
                className="secondary hall-toggle-icon"
                onClick={() => setIsGuestListVisible(true)}
                title={t('Toggle Guest List')}
              >
                +
              </button>
            </div>
          ) : null}

          <HallMap
            layout={hallLayout}
            setLayout={setHallLayout}
            elements={hallElements}
            setElements={setHallElements}
            customColors={customColors}
            setCustomColors={setCustomColors}
            scanReference={hallScanReference}
            guests={guests}
            selectedGuest={selectedGuestToAssign}
            mapLocked={mapLocked}
            canEditHallMap={canEditHallMap}
            canAssignGuests={canAssignGuests}
            onAssignGuestToTable={handleAssignGuestToTable}
          />

          <div className="layout-actions">
            <button className="secondary" onClick={handlePrintPlan}>{t('Print Seating Plan')}</button>
            <button className="secondary" onClick={handleExportPlan}>{t('Export Plan JSON')}</button>
          </div>

          {isGuestListVisible ? (
            <aside
              className="guest-roster-panel floating-guest-panel"
              style={{ left: `${guestPanelPosition.x}px`, top: `${guestPanelPosition.y}px` }}
            >
              <div className="guest-roster-header guest-roster-drag-header" onPointerDown={handleGuestPanelDragStart}>
                <div className="guest-roster-title-row">
                  <button
                    type="button"
                    className="secondary hall-toggle-icon"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      setIsGuestListVisible(false);
                    }}
                    title={t('Toggle Guest List')}
                  >
                    -
                  </button>
                  <h3>{t('Guest Roster')}</h3>
                </div>
                <p>{t('Select a guest and then click a seat to assign them to the table.')}</p>
              </div>

              <div className="guest-search">
                <input
                  type="search"
                  value={guestSearch}
                  onChange={(e) => setGuestSearch(e.target.value)}
                  placeholder={t('Search guests...')}
                />
              </div>

              <div className="guest-actions">
                {selectedGuestToAssign ? (
                  <button type="button" className="secondary" onClick={() => setSelectedGuestToAssign(null)}>
                    {t('Clear selection')}
                  </button>
                ) : null}
              </div>

              {selectedGuestToAssign ? (
                <div className="selected-guest-box">
                  <strong>{t('Selected guest')}:</strong> {selectedGuestToAssign.name} {selectedGuestToAssign.surname}
                </div>
              ) : null}

              <div className="guest-list docked-guest-list">
                {filteredGuests.map((guest) => (
                  <div
                    key={guest._id}
                    className={`guest-item ${selectedGuestToAssign?._id === guest._id ? 'selected' : ''}`}
                    onClick={() => handleSelectGuestToAssign(guest)}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', `guest:${guest._id}`)}
                  >
                    <div className="guest-item-header">
                      <span className="guest-name">{guest.name} {guest.surname}</span>
                      <span className="guest-status">{guest.table ? `${t('Table')}: ${guest.table}` : t('Unassigned')}</span>
                    </div>
                    <div className="guest-details">
                      <span>{guest.phone}</span>
                      {guest.seatNumber ? <span>{t('Seat')}: {guest.seatNumber}</span> : null}
                      {guest.group ? <span className="guest-group">{guest.group}</span> : null}
                    </div>
                    <button type="button" className="secondary small" onClick={(e) => { e.stopPropagation(); handleSelectGuestToAssign(guest); }}>
                      {t('Select guest to assign')}
                    </button>
                  </div>
                ))}
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default HallDesign;
