import React from 'react';
function HallMapUltraWide({ layout = [], setLayout, elements = [], setElements, customColors = {}, guests = [], selectedGuest, mapLocked = false, gridSnap = true, gridSize = 20 }) {
  const snapToGrid = (value) => gridSnap ? Math.round(value / gridSize) * gridSize : value;
  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (e) => {
    e.preventDefault();
    if (mapLocked) return;
    const data = e.dataTransfer.getData('toolbox-item');
    if (!data) return;
    const item = JSON.parse(data);
    const rect = e.currentTarget.getBoundingClientRect();
    const x = snapToGrid(e.clientX - rect.left);
    const y = snapToGrid(e.clientY - rect.top);
    if (item.type === 'table') {
      setLayout([...layout, { id: `table-${Date.now()}`, label: item.label, x, y, shape: item.shape, seats: Array(item.seats).fill(null), color: customColors[item.label] || '#ffd700' }]);
    } else if (item.type === 'element') {
      setElements([...elements, { id: `element-${Date.now()}`, label: item.label, type: item.elementType, x, y, width: 100, height: 100 }]);
    }
  };
  return (
    <div className="hall-map-ultra-wide-container" onDragOver={handleDragOver} onDrop={handleDrop}>
      {layout.map((table) => (
        <div key={table.id} className={`table-item ${table.shape} ${selectedGuest?.table === table.label ? 'highlighted' : ''}`} style={{ left: `${table.x}px`, top: `${table.y}px`, backgroundColor: table.color, opacity: mapLocked ? 0.8 : 1 }}>
          <div className="table-label">{table.label}</div>
          <div className="table-seats-count">{table.seats?.length || 0}</div>
        </div>
      ))}
      {elements.map((element) => (
        <div key={element.id} className={`element-item element-${element.type}`} style={{ left: `${element.x}px`, top: `${element.y}px`, width: `${element.width}px`, height: `${element.height}px` }}>
          <span className="element-label">{element.label}</span>
        </div>
      ))}
    </div>
  );
}
export default HallMapUltraWide;
