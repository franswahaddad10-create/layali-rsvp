import React, { useState, useEffect, useRef } from 'react';
import { eventAPI, guestAPI } from '../services/api';
import HallMapUltraWide from '../components/HallMapUltraWide';
import { useLanguage } from '../contexts/LanguageContext';

function HallDesignUltraWide({ event, onBack }) {
  const { t } = useLanguage();
  const [hallLayout, setHallLayout] = useState([]);
  const [hallElements, setHallElements] = useState([]);
  const [guests, setGuests] = useState([]);
  const [customColors, setCustomColors] = useState({});
  const [mapLocked, setMapLocked] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('tables');
  const [guestSearch, setGuestSearch] = useState('');
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [gridSnap, setGridSnap] = useState(true);
  const [gridSize, setGridSize] = useState(20);
  const mapContainerRef = useRef(null);

  useEffect(() => {
    const loadEventData = async () => {
      try {
        const eventRes = await eventAPI.getEventById(event._id);
        const eventData = eventRes.data;
        setHallLayout(eventData.hallLayout || []);
        setHallElements(eventData.hallElements || []);
        setCustomColors(eventData.customColors || {});
        const guestRes = await guestAPI.getGuestsByEvent(event._id);
        setGuests(guestRes.data.guests || []);
      } catch (error) {
        console.error('Error loading event data:', error);
      } finally {
        setLoading(false);
      }
    };
    if (event?._id) loadEventData();
  }, [event]);

  const handleZoomIn = () => setZoom(Math.min(zoom + 0.2, 5));
  const handleZoomOut = () => setZoom(Math.max(zoom - 0.2, 0.3));
  const handleResetZoom = () => { setZoom(1); setPanX(0); setPanY(0); };

  const handleWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(Math.max(0.3, Math.min(5, zoom + delta)));
    } else if (e.shiftKey) {
      e.preventDefault();
      setPanX(panX + e.deltaX);
      setPanY(panY + e.deltaY);
    }
  };

  const toolboxItems = [
    { category: 'Tables', items: [
      { type: 'table', label: 'Round Table (8)', icon: '🔵', shape: 'round', seats: 8 },
      { type: 'table', label: 'Round Table (10)', icon: '🔵', shape: 'round', seats: 10 },
      { type: 'table', label: 'Rectangular (8)', icon: '▭', shape: 'rectangular', seats: 8 },
      { type: 'table', label: 'Rectangular (10)', icon: '▭', shape: 'rectangular', seats: 10 },
      { type: 'table', label: 'High Top', icon: '🍷', shape: 'round', seats: 4 },
    ]},
    { category: 'Elements', items: [
      { type: 'element', label: 'Stage', icon: '🎭', elementType: 'stage' },
      { type: 'element', label: 'DJ Booth', icon: '🎧', elementType: 'dj' },
      { type: 'element', label: 'Dance Floor', icon: '💃', elementType: 'dancefloor' },
      { type: 'element', label: 'Bar', icon: '🍷', elementType: 'bar' },
      { type: 'element', label: 'Entrance', icon: '🚪', elementType: 'entrance' },
      { type: 'element', label: 'Screen', icon: '📺', elementType: 'screen' },
      { type: 'element', label: 'Cake Table', icon: '🎂', elementType: 'cake' },
      { type: 'element', label: 'Gift Table', icon: '🎁', elementType: 'gifts' },
    ]},
    { category: 'Decor', items: [
      { type: 'element', label: 'Plant', icon: '🌿', elementType: 'plant' },
      { type: 'element', label: 'Pillar', icon: '🏛️', elementType: 'pillar' },
      { type: 'element', label: 'Arch', icon: '🏹', elementType: 'arch' },
      { type: 'element', label: 'Lighting', icon: '💡', elementType: 'lighting' },
    ]},
  ];

  const filteredGuests = guests.filter(g => g.name.toLowerCase().includes(guestSearch.toLowerCase()));
  const stats = {
    totalGuests: guests.length,
    confirmed: guests.filter(g => g.rsvpStatus === 'accepted').length,
    declined: guests.filter(g => g.rsvpStatus === 'declined').length,
    pending: guests.filter(g => !g.rsvpStatus || g.rsvpStatus === 'pending').length,
    totalTables: hallLayout.length,
    totalCapacity: hallLayout.reduce((sum, t) => sum + (t.seats?.length || 0), 0),
  };

  if (loading) return <div className="loading-spinner">{t('Loading event...')}</div>;

  return (
    <div className="hall-design-ultra-wide">
      <aside className={`hall-sidebar-ultra ${sidebarOpen ? 'open' : 'collapsed'}`}>
        <div className="sidebar-toggle-btn">
          <button className="toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>
        {sidebarOpen && (
          <>
            <div className="sidebar-header">
              <h2>🎪 {t('Hall Design')}</h2>
              <button className="close-btn" onClick={onBack}>×</button>
            </div>
            <div className="sidebar-tabs">
              <button className={`tab ${activeTab === 'tables' ? 'active' : ''}`} onClick={() => setActiveTab('tables')}>{t('Tools')}</button>
              <button className={`tab ${activeTab === 'guests' ? 'active' : ''}`} onClick={() => setActiveTab('guests')}>{t('Guests')}</button>
              <button className={`tab ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => setActiveTab('stats')}>{t('Stats')}</button>
            </div>
            <div className="sidebar-content">
              {activeTab === 'tables' && (
                <div className="tab-pane">
                  <div className="grid-settings">
                    <label><input type="checkbox" checked={gridSnap} onChange={(e) => setGridSnap(e.target.checked)}/> {t('Snap to Grid')}</label>
                    <label>{t('Grid Size')}: <input type="range" min="10" max="50" value={gridSize} onChange={(e) => setGridSize(Number(e.target.value))}/> <span>{gridSize}px</span></label>
                  </div>
                  {toolboxItems.map((category, idx) => (
                    <div key={idx} className="toolbox-category">
                      <h4>{category.category}</h4>
                      <div className="toolbox-grid">
                        {category.items.map((item, itemIdx) => (
                          <div key={itemIdx} className="toolbox-item" draggable onDragStart={(e) => { e.dataTransfer.setData('toolbox-item', JSON.stringify(item)); }}>
                            <span className="toolbox-icon">{item.icon}</span>
                            <span className="toolbox-label">{item.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {activeTab === 'guests' && (
                <div className="tab-pane">
                  <input type="search" className="guest-search-input" placeholder={t('Search guests...')} value={guestSearch} onChange={(e) => setGuestSearch(e.target.value)}/>
                  <div className="guests-list-sidebar">
                    {filteredGuests.map((guest) => (
                      <div key={guest._id} className={`guest-item-sidebar ${selectedGuest?._id === guest._id ? 'selected' : ''}`} onClick={() => setSelectedGuest(guest)}>
                        <div className="guest-name">{guest.name}</div>
                        <div className="guest-meta">{guest.table && <span className="badge">{t('Table')}: {guest.table}</span>}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {activeTab === 'stats' && (
                <div className="tab-pane">
                  <div className="stats-grid">
                    <div className="stat-card"><span className="stat-label">{t('Total Guests')}</span><span className="stat-value">{stats.totalGuests}</span></div>
                    <div className="stat-card confirmed"><span className="stat-label">{t('Confirmed')}</span><span className="stat-value">✓ {stats.confirmed}</span></div>
                    <div className="stat-card declined"><span className="stat-label">{t('Declined')}</span><span className="stat-value">✗ {stats.declined}</span></div>
                  </div>
                </div>
              )}
            </div>
            <div className="sidebar-footer">
              <button className="btn-primary" onClick={() => setMapLocked(!mapLocked)}>{mapLocked ? '🔒 Unlock' : '🔓 Lock'}</button>
            </div>
          </>
        )}
      </aside>
      <main className="hall-map-area-ultra">
        <div className="map-controls-ultra">
          <div className="zoom-controls">
            <button onClick={handleZoomOut}>−</button>
            <span className="zoom-level">{Math.round(zoom * 100)}%</span>
            <button onClick={handleZoomIn}>+</button>
            <button onClick={handleResetZoom}>⊙</button>
          </div>
          <div className="map-info"><span>{event.name}</span><span className="hint">Ctrl+Scroll to zoom | Shift+Scroll to pan</span></div>
        </div>
        <div className="map-container-ultra" ref={mapContainerRef} onWheel={handleWheel} style={{ transform: `scale(${zoom}) translate(${panX}px, ${panY}px)`, transformOrigin: '0 0', backgroundImage: gridSnap ? `linear-gradient(0deg, transparent 24%, rgba(255, 215, 0, 0.05) 25%, rgba(255, 215, 0, 0.05) 26%, transparent 27%, transparent 74%, rgba(255, 215, 0, 0.05) 75%, rgba(255, 215, 0, 0.05) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(255, 215, 0, 0.05) 25%, rgba(255, 215, 0, 0.05) 26%, transparent 27%, transparent 74%, rgba(255, 215, 0, 0.05) 75%, rgba(255, 215, 0, 0.05) 76%, transparent 77%, transparent)` : 'none', backgroundSize: gridSnap ? `${gridSize}px ${gridSize}px` : 'auto' }}>
          <HallMapUltraWide layout={hallLayout} setLayout={setHallLayout} elements={hallElements} setElements={setHallElements} customColors={customColors} setCustomColors={setCustomColors} guests={guests} selectedGuest={selectedGuest} mapLocked={mapLocked} canEditHallMap={!mapLocked} gridSnap={gridSnap} gridSize={gridSize} />
        </div>
      </main>
    </div>
  );
}
export default HallDesignUltraWide;
