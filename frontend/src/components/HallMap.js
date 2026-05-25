import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import usePointerDrag, { getPointerPoint, isPrimaryPointer } from '../hooks/usePointerDrag';

const teamColors = {
  VIP: '#b09175',
  Marketing: '#8b6f9d',
  Sales: '#6c9a79',
  Operations: '#6d7d8b',
  Design: '#c78b6f',
  Unassigned: 'rgba(255,255,255,0.08)',
};

const elementTypes = {
  stage: { icon: '🎭', label: 'Stage', color: '#8b4513' },
  bar: { icon: '🍷', label: 'Bar', color: '#daa520' },
  entrance: { icon: '🚪', label: 'Entrance', color: '#228b22' },
  exit: { icon: '🚪', label: 'Exit', color: '#dc143c' },
  screen: { icon: '📺', label: 'Screen', color: '#4169e1' },
};

function HallMap({
  layout,
  setLayout,
  elements = [],
  setElements = () => {},
  customColors = {},
  setCustomColors = () => {},
  scanReference = null,
  guestStats = {},
  guests = [],
  selectedGuest,
  mapLocked = false,
  canEditHallMap = true,
  canAssignGuests = true,
  mode = 'editor',
  onAssignGuestToTable,
  highlightedTableLabels = [],
  showFloatingStats = true,
  showInspector = true,
  showMapMarkers = true,
}) {
  const { t } = useLanguage();
  const mapSurfaceRef = React.useRef(null);
  const canvasShellRef = React.useRef(null);
  const [rows, setRows] = React.useState(8);
  const [cols, setCols] = React.useState(10);
  const [selectedShape, setSelectedShape] = React.useState('rectangular');
  const [zoom, setZoom] = React.useState(1);
  const [statsPosition, setStatsPosition] = React.useState({ x: 24, y: 24 });
  const [statsDrag, setStatsDrag] = React.useState(null);
  const [tableDrag, setTableDrag] = React.useState(null);
  const [elementDrag, setElementDrag] = React.useState(null);
  const [editorPosition, setEditorPosition] = React.useState({ x: 22, y: 22 });
  const [editorDrag, setEditorDrag] = React.useState(null);

  const tableShapes = [
    { value: 'rectangular', label: 'Rectangular' },
    { value: 'round', label: 'Round' },
  ];

  const mapWidth = Math.max(2200, cols * 260);
  const mapHeight = Math.max(1400, rows * 240);

  const getTableDimensions = React.useCallback((shape) => {
    if (shape === 'round') {
      return { shellWidth: 176, shellHeight: 176, bodyWidth: 104, bodyHeight: 104 };
    }

    return { shellWidth: 220, shellHeight: 164, bodyWidth: 126, bodyHeight: 76 };
  }, []);

  const getRectSeatPosition = React.useCallback((index, total, dimensions) => {
    const inset = 20;
    const left = inset;
    const top = inset;
    const right = dimensions.shellWidth - inset;
    const bottom = dimensions.shellHeight - inset;
    const trackWidth = right - left;
    const trackHeight = bottom - top;
    const perimeter = 2 * (trackWidth + trackHeight);
    const distance = ((index + 0.5) / total) * perimeter;

    let x = left;
    let y = top;
    let rotation = 0;

    if (distance <= trackWidth) {
      x = left + distance;
      y = top;
      rotation = 0;
    } else if (distance <= trackWidth + trackHeight) {
      x = right;
      y = top + (distance - trackWidth);
      rotation = 90;
    } else if (distance <= (trackWidth * 2) + trackHeight) {
      x = right - (distance - trackWidth - trackHeight);
      y = bottom;
      rotation = 180;
    } else {
      x = left;
      y = bottom - (distance - (trackWidth * 2) - trackHeight);
      rotation = 270;
    }

    return { x, y, rotation };    
  }, []);

  const getRoundSeatPosition = React.useCallback((index, total, dimensions) => {
    const angle = (-90 + (360 / total) * index) * (Math.PI / 180);
    const radius = Math.min(dimensions.shellWidth, dimensions.shellHeight) / 2 - 16;
    const x = (dimensions.shellWidth / 2) + Math.cos(angle) * radius;
    const y = (dimensions.shellHeight / 2) + Math.sin(angle) * radius;
    const rotation = (angle * 180) / Math.PI + 90;

    return { x, y, rotation };
  }, []);

  const getSeatPosition = React.useCallback((table, index) => {
    const dimensions = getTableDimensions(table.shape || 'rectangular');
    if (table.shape === 'round') {
      return getRoundSeatPosition(index, table.seats.length, dimensions);
    }

    return getRectSeatPosition(index, table.seats.length, dimensions);
  }, [getRectSeatPosition, getRoundSeatPosition, getTableDimensions]);

  const deriveGridPosition = React.useCallback((x, y) => ({
    col: Math.max(0, Math.round((x - 48) / 240)),
    row: Math.max(0, Math.round((y - 48) / 200)),
  }), []);

  const getTablePosition = React.useCallback((table) => {
    if (typeof table.x === 'number' && typeof table.y === 'number') {
      return { x: table.x, y: table.y };
    }

    return {
      x: 48 + ((table.col || 0) * 240),
      y: 48 + ((table.row || 0) * 200),
    };
  }, []);

  const clampTablePosition = React.useCallback((table, x, y) => {
    const dimensions = getTableDimensions(table.shape || 'rectangular');
    const nextX = Math.max(24, Math.min(mapWidth - dimensions.shellWidth - 24, x));
    const nextY = Math.max(24, Math.min(mapHeight - dimensions.shellHeight - 24, y));
    const gridPosition = deriveGridPosition(nextX, nextY);

    return {
      x: nextX,
      y: nextY,
      row: gridPosition.row,
      col: gridPosition.col,
    };
  }, [deriveGridPosition, getTableDimensions, mapHeight, mapWidth]);

  const getElementPosition = React.useCallback((element) => {
    if (typeof element.x === 'number' && typeof element.y === 'number') {
      return { x: element.x, y: element.y };
    }

    return {
      x: 48 + ((element.col || 0) * 220),
      y: 48 + ((element.row || 0) * 190),
    };
  }, []);

  const clampElementPosition = React.useCallback((element, x, y) => {
    const width = (element.width || 1) * 180;
    const height = (element.height || 1) * 120;

    return {
      x: Math.max(24, Math.min(mapWidth - width - 24, x)),
      y: Math.max(24, Math.min(mapHeight - height - 24, y)),
    };
  }, [mapHeight, mapWidth]);

  const clampFloatingPanelPosition = React.useCallback((x, y, width = 360, height = 260) => {
    const bounds = canvasShellRef.current?.getBoundingClientRect();
    if (!bounds) {
      return { x, y };
    }

    return {
      x: Math.max(8, Math.min(bounds.width - width - 8, x)),
      y: Math.max(8, Math.min(bounds.height - height - 8, y)),
    };
  }, []);

  const selectedTable = layout.find((item) => item.selected);
  const selectedElement = elements.find((item) => item.selected);
  const guestLookup = React.useMemo(() => new Map(guests.map((guest) => [guest._id, guest])), [guests]);
  const guestBySeatId = React.useMemo(() => new Map(guests.filter((guest) => guest.seatNumber).map((guest) => [String(guest.seatNumber), guest])), [guests]);
  const mapReadOnly = mapLocked || !canEditHallMap;
  const isLiveMode = mode === 'live';
  const highlightedTableSet = React.useMemo(() => new Set(highlightedTableLabels), [highlightedTableLabels]);

  const getSeatOrdinal = React.useCallback((value) => {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const normalizedValue = String(value).trim();
    if (!normalizedValue) {
      return null;
    }

    if (/^\d+$/.test(normalizedValue)) {
      return Number(normalizedValue);
    }

    const match = normalizedValue.match(/-seat-(\d+)$/i);
    if (match) {
      return Number(match[1]);
    }

    return null;
  }, []);

  const resolveSeatGuest = React.useCallback((table, seat, seatIndex) => {
    if (seat.guestId && guestLookup.has(seat.guestId)) {
      return guestLookup.get(seat.guestId);
    }

    if (guestBySeatId.has(String(seat.id))) {
      return guestBySeatId.get(String(seat.id));
    }

    const currentSeatOrdinal = getSeatOrdinal(seat.id) || seatIndex + 1;
    const legacySeatMatch = guests.find((guest) => {
      if (guest.table !== table.label) {
        return false;
      }

      const guestSeatOrdinal = getSeatOrdinal(guest.seatNumber);
      if (guestSeatOrdinal !== null) {
        return guestSeatOrdinal === currentSeatOrdinal;
      }

      return String(guest.seatNumber) === String(seatIndex + 1);
    });

    if (legacySeatMatch) {
      return legacySeatMatch;
    }

    return guests.find((guest) => guest.table === table.label && String(guest.seatNumber) === String(seatIndex + 1)) || null;
  }, [getSeatOrdinal, guestBySeatId, guestLookup, guests]);

  const getLiveSeatStatus = React.useCallback((guest) => {
    if (!guest) {
      return { key: 'empty', label: t('Empty Seat') };
    }

    if (guest.arrivalConfirmed) {
      return { key: 'arrived', label: t('Arrived') };
    }

    if (guest.rsvpStatus !== 'accepted') {
      return { key: 'pending', label: t('Not Confirmed') };
    }

    return { key: 'confirmed', label: t('Confirmed Not Arrived') };
  }, [t]);

  const updateSelectedTable = (field, value) => {
    if (!selectedTable) {
      return;
    }

    let nextTable = { ...selectedTable, [field]: value };

    if (field === 'seats') {
      nextTable.seats = Array.from({ length: value }, (_, index) => ({
        id: `${selectedTable.id}-seat-${index + 1}`,
        guestId: selectedTable.seats[index]?.guestId || null,
      }));
    }

    if (field === 'rotation') {
      nextTable.rotation = ((value % 360) + 360) % 360;
    }

    setLayout(layout.map((item) => (item.id === selectedTable.id ? nextTable : item)));
  };

  const moveSelected = (direction) => {
    if (!selectedTable) {
      return;
    }

    const currentPosition = getTablePosition(selectedTable);
    const step = 28;
    const target = {
      up: { x: currentPosition.x, y: currentPosition.y - step },
      down: { x: currentPosition.x, y: currentPosition.y + step },
      left: { x: currentPosition.x - step, y: currentPosition.y },
      right: { x: currentPosition.x + step, y: currentPosition.y },
    }[direction];

    setLayout(layout.map((item) => (
      item.id === selectedTable.id ? { ...item, ...clampTablePosition(item, target.x, target.y) } : item
    )));
  };

  const removeSelected = () => {
    if (selectedTable) {
      setLayout(layout.filter((item) => item.id !== selectedTable.id));
      return;
    }

    if (selectedElement) {
      setElements(elements.filter((item) => item.id !== selectedElement.id));
    }
  };

  const clearLayout = () => {
    if (window.confirm('Clear the entire hall layout?')) {
      setLayout([]);
    }
  };

  const clearAll = () => {
    if (window.confirm(t('This will remove all tables and elements. Continue?'))) {
      setLayout([]);
      setElements([]);
    }
  };

  const addElement = (type) => {
    const centerX = (mapWidth / 2) - 90;
    const centerY = (mapHeight / 2) - 60;
    const next = {
      id: `${type}-${Date.now()}`,
      type,
      label: elementTypes[type].label,
      x: centerX,
      y: centerY,
      width: 1,
      height: 1,
      rotation: 0,
      selected: true,
    };
    setElements([...elements.map((item) => ({ ...item, selected: false })), next]);
    setLayout(layout.map((item) => ({ ...item, selected: false })));
  };

  const updateTeamColor = (team, color) => {
    setCustomColors({ ...customColors, [team]: color });
  };

  const handleSurfacePointerDown = (event) => {
    if (!isPrimaryPointer(event) || event.target !== event.currentTarget) {
      return;
    }

    if (mapReadOnly) {
      return;
    }

    if (event.pointerType === 'touch') {
      event.preventDefault();
    }

    const bounds = mapSurfaceRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    const point = getPointerPoint(event);
    const nextId = `table-${Date.now()}`;
    const nextLabel = `Table ${layout.length + 1}`;
    const dimensions = getTableDimensions(selectedShape);
    const baseX = (point.clientX - bounds.left) / zoom - (dimensions.shellWidth / 2);
    const baseY = (point.clientY - bounds.top) / zoom - (dimensions.shellHeight / 2);
    const nextPosition = clampTablePosition({ shape: selectedShape }, baseX, baseY);

    setElements(elements.map((item) => ({ ...item, selected: false })));
    setLayout([
      ...layout.map((item) => ({ ...item, selected: false })),
      {
        id: nextId,
        label: nextLabel,
        ...nextPosition,
        seats: Array.from({ length: 8 }, (_, index) => ({ id: `${nextId}-seat-${index + 1}`, guestId: null })),
        team: 'Unassigned',
        shape: selectedShape,
        rotation: 0,
        selected: true,
        notes: '',
      },
    ]);
  };

  const onDragOver = (event) => {
    event.preventDefault();
  };

  const onDropOnSeat = (event, tableId, seatId) => {
    event.preventDefault();
    if (mapLocked || !canAssignGuests) {
      return;
    }
    const payload = event.dataTransfer.getData('text/plain');
    if (!payload) {
      return;
    }

    const [type, id] = payload.split(':');
    if (type === 'guest' && onAssignGuestToTable) {
      onAssignGuestToTable(id, tableId, seatId);
    }
  };

  const handleTablePointerDown = (event, table) => {
    if (!isPrimaryPointer(event)) {
      return;
    }

    event.stopPropagation();
    if (event.pointerType === 'touch') {
      event.preventDefault();
    }

    const bounds = mapSurfaceRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    const point = getPointerPoint(event);
    const position = getTablePosition(table);
    setElements(elements.map((item) => ({ ...item, selected: false })));
    setLayout(layout.map((item) => ({ ...item, selected: item.id === table.id })));
    if (mapReadOnly) {
      return;
    }
    setTableDrag({
      tableId: table.id,
      offsetX: (point.clientX - bounds.left) / zoom - position.x,
      offsetY: (point.clientY - bounds.top) / zoom - position.y,
    });
  };

  const handleElementPointerDown = (event, element) => {
    if (!isPrimaryPointer(event)) {
      return;
    }

    event.stopPropagation();
    if (event.pointerType === 'touch') {
      event.preventDefault();
    }

    const bounds = mapSurfaceRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    const point = getPointerPoint(event);
    const position = getElementPosition(element);
    setLayout(layout.map((item) => ({ ...item, selected: false })));
    setElements(elements.map((item) => ({ ...item, selected: item.id === element.id })));
    if (mapReadOnly) {
      return;
    }
    setElementDrag({
      elementId: element.id,
      offsetX: (point.clientX - bounds.left) / zoom - position.x,
      offsetY: (point.clientY - bounds.top) / zoom - position.y,
    });
  };

  usePointerDrag(tableDrag, React.useCallback((event, point) => {
    const bounds = mapSurfaceRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    setLayout((currentLayout) => currentLayout.map((table) => {
      if (table.id !== tableDrag.tableId) {
        return table;
      }

      const nextX = (point.clientX - bounds.left) / zoom - tableDrag.offsetX;
      const nextY = (point.clientY - bounds.top) / zoom - tableDrag.offsetY;
      return { ...table, ...clampTablePosition(table, nextX, nextY) };
    }));
  }, [clampTablePosition, setLayout, tableDrag, zoom]), React.useCallback(() => {
    setTableDrag(null);
  }, []));

  usePointerDrag(statsDrag, React.useCallback((event, point) => {
    const bounds = mapSurfaceRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    const nextX = Math.max(0, Math.min(bounds.width - 230, point.clientX - bounds.left - statsDrag.offsetX));
    const nextY = Math.max(0, Math.min(bounds.height - 150, point.clientY - bounds.top - statsDrag.offsetY));
    setStatsPosition({ x: nextX, y: nextY });
  }, [statsDrag]), React.useCallback(() => {
    setStatsDrag(null);
  }, []));

  usePointerDrag(elementDrag, React.useCallback((event, point) => {
    const bounds = mapSurfaceRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    setElements((currentElements) => currentElements.map((element) => {
      if (element.id !== elementDrag.elementId) {
        return element;
      }

      const nextX = (point.clientX - bounds.left) / zoom - elementDrag.offsetX;
      const nextY = (point.clientY - bounds.top) / zoom - elementDrag.offsetY;
      return { ...element, ...clampElementPosition(element, nextX, nextY) };
    }));
  }, [clampElementPosition, elementDrag, setElements, zoom]), React.useCallback(() => {
    setElementDrag(null);
  }, []));

  usePointerDrag(editorDrag, React.useCallback((event, point) => {
    const bounds = canvasShellRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    const nextX = point.clientX - bounds.left - editorDrag.offsetX;
    const nextY = point.clientY - bounds.top - editorDrag.offsetY;
    setEditorPosition(clampFloatingPanelPosition(nextX, nextY, 360, 340));
  }, [clampFloatingPanelPosition, editorDrag]), React.useCallback(() => {
    setEditorDrag(null);
  }, []));

  const handleStatsPointerDown = (event) => {
    if (!isPrimaryPointer(event)) {
      return;
    }

    if (event.pointerType === 'touch') {
      event.preventDefault();
    }

    const bounds = mapSurfaceRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    const point = getPointerPoint(event);
    setStatsDrag({
      offsetX: point.clientX - bounds.left - statsPosition.x,
      offsetY: point.clientY - bounds.top - statsPosition.y,
    });
  };

  const handleEditorPointerDown = (event) => {
    if (!isPrimaryPointer(event)) {
      return;
    }

    if (event.pointerType === 'touch') {
      event.preventDefault();
    }

    const bounds = canvasShellRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    const point = getPointerPoint(event);
    setEditorDrag({
      offsetX: point.clientX - bounds.left - editorPosition.x,
      offsetY: point.clientY - bounds.top - editorPosition.y,
    });
  };

  const stats = React.useMemo(() => {
    const totalTables = layout.length;
    const totalSeats = layout.reduce((sum, table) => sum + table.seats.length, 0);
    const occupiedSeats = layout.reduce((sum, table) => sum + table.seats.filter((seat) => seat.guestId).length, 0);
    const occupancyRate = totalSeats > 0 ? Math.round((occupiedSeats / totalSeats) * 100) : 0;
    const tablesByTeam = {};

    layout.forEach((table) => {
      tablesByTeam[table.team] = (tablesByTeam[table.team] || 0) + 1;
    });

    return { totalTables, totalSeats, occupiedSeats, occupancyRate, tablesByTeam };
  }, [layout]);

  const guestSummary = React.useMemo(() => {
    const assigned = guests.filter((guest) => guest.table).length;
    const arrived = guests.filter((guest) => guest.arrivalConfirmed).length;

    return {
      assigned,
      unassigned: Math.max(guests.length - assigned, 0),
      arrived,
      notArrived: Math.max(guests.length - arrived, 0),
    };
  }, [guests]);

  const selectedTableGuests = React.useMemo(() => {
    if (!selectedTable) {
      return [];
    }

    const guestsFromSeats = selectedTable.seats
      .map((seat, index) => {
        const guest = resolveSeatGuest(selectedTable, seat, index);
        if (!guest) {
          if (!isLiveMode) {
            return null;
          }

          const seatStatus = getLiveSeatStatus(null);
          return {
            guest: null,
            seat,
            seatLabel: index + 1,
            seatStatus,
          };
        }

        const seatStatus = getLiveSeatStatus(guest);
        return {
          guest,
          seat,
          seatLabel: index + 1,
          seatStatus,
        };
      })
      .filter(Boolean);

    if (guestsFromSeats.length > 0) {
      return guestsFromSeats;
    }

    return guests
      .filter((guest) => guest.table === selectedTable.label)
      .map((guest, index) => ({
        guest,
        seat: null,
        seatLabel: getSeatOrdinal(guest.seatNumber) || guest.seatNumber || index + 1,
        seatStatus: getLiveSeatStatus(guest),
      }));
  }, [getLiveSeatStatus, getSeatOrdinal, guests, isLiveMode, resolveSeatGuest, selectedTable]);

  const selectedTableStats = React.useMemo(() => {
    if (!selectedTable) {
      return null;
    }

    const assignedSeats = selectedTable.seats.filter((seat, index) => Boolean(resolveSeatGuest(selectedTable, seat, index))).length;
    return {
      assignedSeats,
      totalSeats: selectedTable.seats.length,
      freeSeats: Math.max(selectedTable.seats.length - assignedSeats, 0),
    };
  }, [resolveSeatGuest, selectedTable]);

  return (
    <div className="hall-map-card">
      <div className="hall-map-header">
        <h3>{isLiveMode ? t('Live Event Map') : t('Luxury Hall Layout')}</h3>
        <p>{isLiveMode ? t('Seat colors update by RSVP and arrival status while the event is running.') : t('Drag tables into place, assign teams, and optimize your guest flow')}</p>
        {mapLocked ? <p className="map-lock-banner">{t('Map is locked for editing. Table selection and guest viewing remain available.')}</p> : null}
        {selectedGuest ? (
          <p className="selected-guest-banner">
            {t('Selected guest')}: {selectedGuest.name} {selectedGuest.surname} {selectedGuest.table ? `(${t('Assigned to')} ${selectedGuest.table})` : ''}
          </p>
        ) : null}
      </div>

      {!isLiveMode ? <div className="hall-map-settings">
        <label>
          {t('Rows')}
          <input
            type="number"
            min="1"
            max="20"
            value={rows}
            disabled={mapReadOnly}
            onChange={(e) => setRows(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))}
          />
        </label>
        <label>
          {t('Columns')}
          <input
            type="number"
            min="1"
            max="24"
            value={cols}
            disabled={mapReadOnly}
            onChange={(e) => setCols(Math.max(1, Math.min(24, parseInt(e.target.value, 10) || 1)))}
          />
        </label>
      </div> : null}

      {!isLiveMode ? <div className="hall-elements-section">
        <h4>{t('Hall Elements')}</h4>
        <div className="palette-buttons">
          {Object.entries(elementTypes).map(([type, config]) => (
            <button key={type} type="button" className="secondary" disabled={mapReadOnly} onClick={() => addElement(type)}>
              {config.icon} {t(config.label)}
            </button>
          ))}
        </div>
      </div> : null}

      {!isLiveMode ? <div className="custom-colors-section">
        <h4>{t('Custom Colors')}</h4>
        <div className="palette-buttons">
          {Object.keys(teamColors).map((team) => (
            <label key={team}>
              {t(team)}
              <input type="color" disabled={mapReadOnly} value={customColors[team] || teamColors[team]} onChange={(e) => updateTeamColor(team, e.target.value)} />
            </label>
          ))}
        </div>
      </div> : null}

      <div className="hall-palette">
        {!isLiveMode ? (
          <>
        <div className="palette-label">{t('Table shape')}</div>
        <div className="palette-buttons">
          {tableShapes.map((shape) => (
            <button
              key={shape.value}
              type="button"
              className={`palette-button ${selectedShape === shape.value ? 'active' : ''}`}
              disabled={mapReadOnly}
              onClick={() => setSelectedShape(shape.value)}
            >
              {t(shape.label)}
            </button>
          ))}
          <button type="button" className="secondary" disabled={mapReadOnly} onClick={clearLayout}>{t('Clear Map')}</button>
          <button type="button" className="secondary" disabled={mapReadOnly} onClick={clearAll}>{t('Clear All')}</button>
        </div>
        <div className="zoom-controls">
          <button type="button" onClick={() => setZoom(Math.min(2, zoom + 0.2))}>🔍 {t('Zoom In')}</button>
          <button type="button" onClick={() => setZoom(Math.max(0.5, zoom - 0.2))}>🔍 {t('Zoom Out')}</button>
          <button type="button" onClick={() => setZoom(1)}>{t('Reset Zoom')}</button>
          <span>{Math.round(zoom * 100)}%</span>
        </div>
          </>
        ) : (
          <div className="live-map-toolbar-row">
            <div className="zoom-controls">
              <button type="button" onClick={() => setZoom(Math.min(2, zoom + 0.2))}>🔍 {t('Zoom In')}</button>
              <button type="button" onClick={() => setZoom(Math.max(0.5, zoom - 0.2))}>🔍 {t('Zoom Out')}</button>
              <button type="button" onClick={() => setZoom(1)}>{t('Reset Zoom')}</button>
              <span>{Math.round(zoom * 100)}%</span>
            </div>
          </div>
        )}
        <p className="note">{isLiveMode ? t('Click a table to see only the assigned guests and each seat status.') : (mapReadOnly ? (!canEditHallMap ? t('You can view the hall map, but you do not have permission to edit it.') : t('Map changes are locked. You can still select a table to view its guests.')) : `${t('Click anywhere on the map to place a')} ${t(selectedShape)} ${t('table. Drag tables freely and select one to edit its details')}`)}</p>
      </div>

      <div className="hall-canvas-shell" ref={canvasShellRef}>
        <div className="hall-free-map-scroll">
          <div
            ref={mapSurfaceRef}
            className="hall-free-map"
            style={{ width: `${mapWidth}px`, height: `${mapHeight}px`, transform: `scale(${zoom})`, transformOrigin: 'top left' }}
            onPointerDown={handleSurfacePointerDown}
          >
            {scanReference?.imageData ? (
              <div className="hall-scan-overlay" style={{ opacity: scanReference.opacity || 0.42 }} aria-hidden="true">
                <img src={scanReference.imageData} alt="" className="hall-scan-overlay-image" />
              </div>
            ) : null}
            {showFloatingStats ? (
              <div className={`floating-statistics ${statsDrag ? 'dragging' : ''}`} style={{ left: `${statsPosition.x}px`, top: `${statsPosition.y}px` }}>
                <div className="floating-statistics-handle" onPointerDown={handleStatsPointerDown}>{t('Statistics')}</div>
                <div className="floating-statistics-grid">
                  <div className="floating-stat assigned"><strong>{guestSummary.assigned}</strong><span>{t('Assigned')}</span></div>
                  <div className="floating-stat unassigned"><strong>{guestSummary.unassigned}</strong><span>{t('Unassigned')}</span></div>
                  <div className="floating-stat arrived"><strong>{guestSummary.arrived}</strong><span>{t('Arrived')}</span></div>
                  <div className="floating-stat not-arrived"><strong>{guestSummary.notArrived}</strong><span>{t('Not arrived')}</span></div>
                </div>
                <div className="floating-statistics-summary">
                  <span>{t('Total Tables')}: {stats.totalTables}</span>
                  <span>{t('Total Seats')}: {stats.totalSeats}</span>
                </div>
              </div>
            ) : null}

            {elements.map((element) => {
              const position = getElementPosition(element);
              return (
                <div
                  key={element.id}
                  className={`hall-element hall-element-${element.type} ${element.selected ? 'selected' : ''}`}
                  style={{
                    position: 'absolute',
                    left: `${position.x}px`,
                    top: `${position.y}px`,
                    width: `${(element.width || 1) * 180}px`,
                    height: `${(element.height || 1) * 120}px`,
                    backgroundColor: elementTypes[element.type].color,
                    transform: `rotate(${element.rotation || 0}deg)`,
                  }}
                  onPointerDown={(event) => handleElementPointerDown(event, element)}
                >
                  {element.selected ? (
                    <button
                      type="button"
                      className="element-rotate-handle"
                      disabled={mapReadOnly}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (mapReadOnly) {
                          return;
                        }
                        setElements(elements.map((item) => (
                          item.id === element.id
                            ? { ...item, rotation: (((item.rotation || 0) + 15) % 360) }
                            : item
                        )));
                      }}
                      title={t('Rotation')}
                    >
                      ↻
                    </button>
                  ) : null}
                  <div className="element-icon">{elementTypes[element.type].icon}</div>
                  <div className="element-label">{t(element.label)}</div>
                </div>
              );
            })}

            {layout.map((table) => {
              const tableInfo = guestStats[table.label] || { assigned: 0, arrived: 0 };
              const tableStatusClass = tableInfo.assigned >= table.seats.length ? 'table-full' : tableInfo.assigned > 0 ? 'table-assigned' : 'table-empty';
              const tableDimensions = getTableDimensions(table.shape || 'rectangular');
              const tablePosition = getTablePosition(table);
              const tableRotation = table.rotation || 0;

              return (
                <div
                  key={table.id}
                  className={`hall-table-shell ${table.shape || 'rectangular'} ${tableStatusClass} ${table.selected ? 'selected' : ''} ${highlightedTableSet.has(table.label) ? 'live-highlighted' : ''}`}
                  style={{
                    width: `${tableDimensions.shellWidth}px`,
                    height: `${tableDimensions.shellHeight}px`,
                    left: `${tablePosition.x}px`,
                    top: `${tablePosition.y}px`,
                    transform: `rotate(${tableRotation}deg)`,
                  }}
                  onPointerDown={(event) => handleTablePointerDown(event, table)}
                >
                  {table.selected ? (
                    <button
                      type="button"
                      className="table-rotate-handle"
                      disabled={mapReadOnly}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (mapReadOnly) {
                          return;
                        }
                        updateSelectedTable('rotation', (table.rotation || 0) + 15);
                      }}
                      title={t('Table Rotation')}
                    >
                      ↻
                    </button>
                  ) : null}

                  {table.seats.map((seat, seatIndex) => {
                    const seatPosition = getSeatPosition(table, seatIndex);
                    const seatGuest = resolveSeatGuest(table, seat, seatIndex);
                    const liveSeatStatus = getLiveSeatStatus(seatGuest);
                    return (
                      <div
                        key={seat.id}
                        className={`seat chair-seat ${seat.guestId || seatGuest ? 'occupied' : 'empty'} ${selectedGuest && !seat.guestId ? 'assignable' : ''} ${isLiveMode ? `live-seat-${liveSeatStatus.key}` : ''}`}
                        style={{ left: `${seatPosition.x}px`, top: `${seatPosition.y}px`, transform: `translate(-50%, -50%) rotate(${seatPosition.rotation}deg)` }}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!mapLocked && canAssignGuests && selectedGuest && !seat.guestId) {
                            onAssignGuestToTable?.(selectedGuest._id, table.id, seat.id);
                          }
                        }}
                        onDragOver={onDragOver}
                        onDrop={(event) => onDropOnSeat(event, table.id, seat.id)}
                        title={isLiveMode ? `${t('Seat')} ${seatIndex + 1}: ${liveSeatStatus.label}` : undefined}
                      >
                        <span className="chair-seat-inner" />
                      </div>
                    );
                  })}

                  <div
                    className={`hall-table hall-table-${table.shape || 'rectangular'}`}
                    style={{ width: `${tableDimensions.bodyWidth}px`, height: `${tableDimensions.bodyHeight}px`, backgroundColor: customColors[table.team] || teamColors[table.team] }}
                  >
                    <div className="hall-table-center">
                      <div className="hall-table-center-inner" style={{ transform: `rotate(${-tableRotation}deg)` }}>
                        <span className="hall-seat-capacity">{table.seats.length}</span>
                        <strong>{table.label}</strong>
                        <span className="hall-table-status">{tableInfo.assigned} / {table.seats.length}</span>
                      </div>
                      {table.notes ? <span className="table-notes">📝</span> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {showMapMarkers ? (
          <div className="hall-area-markers floating-markers">
            <span className="stage-marker">{t('Stage')}</span>
            <span className="bar-marker">{t('Bar')}</span>
          </div>
        ) : null}

        {selectedTable && showInspector ? (
          <div className={`floating-editor-panel table-editor-panel ${isLiveMode ? 'live-table-inspector' : ''}`} style={{ left: `${editorPosition.x}px`, top: `${editorPosition.y}px`, right: 'auto' }}>
            <div className="hall-editor-header" onPointerDown={handleEditorPointerDown}>
              <h4>{isLiveMode ? `${t('Live Table Details')}: ${selectedTable.label}` : `${t('Edit')} ${selectedTable.label}`}</h4>
              <button type="button" className="close-btn" onClick={() => setLayout(layout.map((item) => ({ ...item, selected: false })))} title={t('Cancel selection')}>✕</button>
            </div>
            {selectedTableStats ? (
              <div className="table-guest-summary">
                <div className="table-guest-summary-grid">
                  <div className="table-guest-stat"><strong>{selectedTableStats.assignedSeats}</strong><span>{t('Assigned')}</span></div>
                  <div className="table-guest-stat"><strong>{selectedTableStats.freeSeats}</strong><span>{t('Free')}</span></div>
                  <div className="table-guest-stat"><strong>{selectedTableStats.totalSeats}</strong><span>{t('Seats')}</span></div>
                </div>
                {!isLiveMode && selectedGuest && canAssignGuests && selectedTableStats.freeSeats > 0 ? (
                  <div className="table-assign-shortcut-row">
                    <button type="button" className="secondary" onClick={() => onAssignGuestToTable?.(selectedGuest._id, selectedTable.id)}>
                      {t('Assign Selected Guest To Table')}
                    </button>
                  </div>
                ) : null}
                <div className="table-assigned-guests-list">
                  <div className="table-assigned-guests-title">{t('Guests at this table')}</div>
                  {selectedTableGuests.length ? selectedTableGuests.map(({ guest, seatLabel, seatStatus }, index) => (
                    <div key={guest?._id || `empty-seat-${seatLabel}-${index}`} className="table-assigned-guest-item">
                      <div>
                        <strong>{guest ? `${guest.name} ${guest.surname || ''}` : t('Empty Seat')}</strong>
                        <span>{guest ? (guest.phone || t('No phone')) : seatStatus.label}</span>
                      </div>
                      <span className="seat-status-inline"><i className={`seat-status-dot ${seatStatus.key}`} /> {t('Seat')} {seatLabel}</span>
                    </div>
                  )) : <p className="info-text table-assigned-empty">{t('No guests assigned to this table yet.')}</p>}
                </div>
              </div>
            ) : null}
            {!isLiveMode ? <div className="compact-editor-grid">
              <label>
                {t('Label')}
                <input type="text" disabled={mapReadOnly} value={selectedTable.label} onChange={(e) => updateSelectedTable('label', e.target.value)} />
              </label>
              <label>
                {t('Seats')}
                <input type="number" disabled={mapReadOnly} min="1" value={selectedTable.seats.length} onChange={(e) => updateSelectedTable('seats', parseInt(e.target.value, 10) || 1)} />
              </label>
              <label>
                {t('Shape')}
                <select disabled={mapReadOnly} value={selectedTable.shape || 'rectangular'} onChange={(e) => updateSelectedTable('shape', e.target.value)}>
                  {tableShapes.map((shape) => (
                    <option key={shape.value} value={shape.value}>{t(shape.label)}</option>
                  ))}
                </select>
              </label>
              <label>
                {t('Team')}
                <input type="text" disabled={mapReadOnly} value={selectedTable.team || ''} onChange={(e) => updateSelectedTable('team', e.target.value)} />
              </label>
              <label className="full-span">
                {t('Table Rotation')}
                <div className="rotation-control-row">
                  <button type="button" className="secondary small" disabled={mapReadOnly} onClick={() => updateSelectedTable('rotation', (selectedTable.rotation || 0) - 15)}>↺</button>
                  <input type="range" disabled={mapReadOnly} min="0" max="359" value={selectedTable.rotation || 0} onChange={(e) => updateSelectedTable('rotation', parseInt(e.target.value, 10) || 0)} />
                  <button type="button" className="secondary small" disabled={mapReadOnly} onClick={() => updateSelectedTable('rotation', (selectedTable.rotation || 0) + 15)}>↻</button>
                  <span>{Math.round(selectedTable.rotation || 0)}°</span>
                </div>
              </label>
              <label className="full-span">
                {t('Table Notes')}
                <textarea disabled={mapReadOnly} value={selectedTable.notes || ''} onChange={(e) => updateSelectedTable('notes', e.target.value)} placeholder={t('Add note to table')} rows="2" />
              </label>
            </div> : null}
            {!isLiveMode ? <div className="floating-editor-actions">
              <button type="button" disabled={mapReadOnly} onClick={() => moveSelected('up')}>{t('Move Up')}</button>
              <button type="button" disabled={mapReadOnly} onClick={() => moveSelected('down')}>{t('Move Down')}</button>
              <button type="button" disabled={mapReadOnly} onClick={() => moveSelected('left')}>{t('Move Left')}</button>
              <button type="button" disabled={mapReadOnly} onClick={() => moveSelected('right')}>{t('Move Right')}</button>
              <button type="button" className="danger" disabled={mapReadOnly} onClick={removeSelected}>{t('Remove Table')}</button>
            </div> : null}
          </div>
        ) : selectedElement ? (
          !isLiveMode ? (
          <div className="floating-editor-panel table-editor-panel" style={{ left: `${editorPosition.x}px`, top: `${editorPosition.y}px`, right: 'auto' }}>
            <div className="hall-editor-header" onPointerDown={handleEditorPointerDown}>
              <h4>{t('Edit')} {selectedElement.label}</h4>
              <button type="button" className="close-btn" onClick={() => setElements(elements.map((item) => ({ ...item, selected: false })))} title={t('Cancel selection')}>✕</button>
            </div>
            <div className="compact-editor-grid">
              <label className="full-span">
                {t('Element Label')}
                <input type="text" disabled={mapReadOnly} value={selectedElement.label} onChange={(e) => setElements(elements.map((item) => item.id === selectedElement.id ? { ...item, label: e.target.value } : item))} />
              </label>
              <label>
                {t('Width')}
                <input type="number" disabled={mapReadOnly} min="1" value={selectedElement.width || 1} onChange={(e) => setElements(elements.map((item) => item.id === selectedElement.id ? { ...item, width: Math.max(1, parseInt(e.target.value, 10) || 1) } : item))} />
              </label>
              <label>
                {t('Height')}
                <input type="number" disabled={mapReadOnly} min="1" value={selectedElement.height || 1} onChange={(e) => setElements(elements.map((item) => item.id === selectedElement.id ? { ...item, height: Math.max(1, parseInt(e.target.value, 10) || 1) } : item))} />
              </label>
              <label className="full-span">
                {t('Rotation')}
                <input type="range" disabled={mapReadOnly} min="0" max="360" value={selectedElement.rotation || 0} onChange={(e) => setElements(elements.map((item) => item.id === selectedElement.id ? { ...item, rotation: parseInt(e.target.value, 10) || 0 } : item))} />
              </label>
            </div>
            <div className="floating-editor-actions">
              <button type="button" className="danger" disabled={mapReadOnly} onClick={removeSelected}>{t('Remove Element')}</button>
            </div>
          </div>
          ) : null
        ) : null}
      </div>
    </div>
  );
}

export default HallMap;
