import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { guestAPI, eventAPI } from '../services/api';
import HallMap from './HallMap';
import { useLanguage } from '../contexts/LanguageContext';

function EventDetail({ event, onBack }) {
  const { t } = useLanguage();
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [importedGuests, setImportedGuests] = useState([]);
  const [importMessage, setImportMessage] = useState('');
  const [hallLayout, setHallLayout] = useState(event.hallLayout || []);
  const [groups, setGroups] = useState((event.groups || []).map((group, index) => ({
    ...group,
    id: group.id || `group-${Date.now()}-${index}`,
  })));
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', surname: '', phone: '' });
  const [groupForm, setGroupForm] = useState({
    name: '',
    type: 'family',
    numberOfGuests: 1,
    leaderName: '',
    leaderPhone: '',
    notes: '',
  });
  const [memberForm, setMemberForm] = useState({ name: '', surname: '', phone: '', notes: '' });
  const [selectedGroupForMember, setSelectedGroupForMember] = useState(null);
  const [editingGuest, setEditingGuest] = useState(null);
  const [guestSearch, setGuestSearch] = useState('');
  const [selectedGuestToAssign, setSelectedGuestToAssign] = useState(null);

  useEffect(() => {
    fetchGuests();
    setHallLayout(event.hallLayout || []);
    setGroups((event.groups || []).map((group, index) => ({
      ...group,
      id: group.id || `group-${Date.now()}-${index}`,
    })));
  }, [event._id, event.hallLayout, event.groups]);

  const fetchGuests = async () => {
    try {
      setLoading(true);
      const response = await guestAPI.getEventGuests(event._id);
      setGuests(response.data.guests || []);
    } catch (err) {
      setMessage('Failed to fetch guests: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddGuest = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      setMessage('✗ Name and phone are required.');
      return;
    }

    try {
      const payload = {
        name: formData.name,
        surname: formData.surname || '',
        phone: formData.phone,
      };

      if (editingGuest) {
        await guestAPI.updateGuest(editingGuest._id, payload);
        setMessage('✓ Guest updated successfully!');
        setEditingGuest(null);
      } else {
        await guestAPI.addGuest(event._id, payload);
        setMessage('✓ Guest added successfully!');
      }

      setFormData({ name: '', surname: '', phone: '' });
      setShowGuestForm(false);
      fetchGuests();
    } catch (err) {
      setMessage('✗ Failed to save guest: ' + err.message);
    }
  };

  const handleEditGuest = (guest) => {
    setFormData({
      name: guest.name,
      surname: guest.surname || '',
      phone: guest.phone,
    });
    setEditingGuest(guest);
    setShowGuestForm(true);
  };

  const handleDeleteGuest = async (guestId) => {
    if (!window.confirm('Are you sure you want to delete this guest?')) return;
    try {
      await guestAPI.deleteGuest(guestId);
      setMessage('✓ Guest removed successfully.');
      fetchGuests();
    } catch (err) {
      setMessage('✗ Failed to delete guest: ' + err.message);
    }
  };

  const handleCreateGroup = (e) => {
    e.preventDefault();
    const newGroup = {
      id: `group-${Date.now()}`,
      name: groupForm.name,
      type: groupForm.type,
      numberOfGuests: Number(groupForm.numberOfGuests) || 1,
      leader: {
        name: groupForm.leaderName,
        phone: groupForm.leaderPhone,
      },
      notes: groupForm.notes,
      members: [],
    };

    setGroups([...groups, newGroup]);
    setGroupForm({
      name: '',
      type: 'family',
      numberOfGuests: 1,
      leaderName: '',
      leaderPhone: '',
      notes: '',
    });
    setMessage('✓ Group added. Add members and save group details.');
  };

  const handleAddGroupMember = (groupId) => {
    if (!memberForm.name || !memberForm.phone) {
      setMessage('✗ Group member name and phone are required.');
      return;
    }

    setGroups(
      groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              members: [
                ...group.members,
                {
                  ...memberForm,
                },
              ],
            }
          : group
      )
    );

    setMemberForm({ name: '', surname: '', phone: '', notes: '' });
    setSelectedGroupForMember(groupId);
    setMessage('✓ Member added to group.');
  };

  const handleGroupFieldChange = (groupId, field, value) => {
    setGroups(
      groups.map((group) =>
        group.id === groupId
          ? { ...group, [field]: value }
          : group
      )
    );
  };

  const handleGroupLeaderChange = (groupId, field, value) => {
    setGroups(
      groups.map((group) =>
        group.id === groupId
          ? { ...group, leader: { ...group.leader, [field]: value } }
          : group
      )
    );
  };

  const handleUpdateGroupMember = (groupId, memberIndex, field, value) => {
    setGroups(
      groups.map((group) => {
        if (group.id !== groupId) return group;
        const updatedMembers = [...group.members];
        updatedMembers[memberIndex] = {
          ...updatedMembers[memberIndex],
          [field]: value,
        };
        return {
          ...group,
          members: updatedMembers,
        };
      })
    );
  };

  const handleRemoveGroupMember = (groupId, memberIndex) => {
    setGroups(
      groups.map((group) => {
        if (group.id !== groupId) return group;
        const updatedMembers = group.members.filter((_, idx) => idx !== memberIndex);
        return { ...group, members: updatedMembers };
      })
    );
  };

  const handleRemoveGroup = (groupId) => {
    if (!window.confirm('Delete this group and all its members?')) return;
    setGroups(groups.filter((group) => group.id !== groupId));
    setMessage('✓ Group removed. Save to apply changes.');
  };

  const handleAssignGuestToTable = async (guestId, tableId, seatId) => {
    try {
      const table = hallLayout.find(t => t.id === tableId);
      if (!table) {
        setMessage('✗ Table not found.');
        return;
      }
      await guestAPI.updateGuest(guestId, { table: table.label, seatNumber: seatId });
      // Update layout to assign seat
      setHallLayout(hallLayout.map(t =>
        t.id === tableId
          ? { ...t, seats: t.seats.map(s => s.id === seatId ? { ...s, guestId } : s) }
          : t
      ));
      setMessage(`✓ Guest assigned to ${table.label} seat ${seatId}.`);
      setSelectedGuestToAssign(null);
      fetchGuests();
    } catch (err) {
      setMessage('✗ Failed to assign guest: ' + err.message);
    }
  };

  const handleClearGuestSelection = () => {
    setSelectedGuestToAssign(null);
  };

  const handleSaveGroups = async () => {
    try {
      const payload = {
        groups: groups.map(({ id, ...rest }) => rest),
      };
      await eventAPI.updateEvent(event._id, payload);
      setMessage('✓ Group data saved successfully.');
    } catch (err) {
      setMessage('✗ Failed to save groups: ' + err.message);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (!rows || rows.length === 0) {
        setImportMessage('No guest rows found in the file.');
        setImportedGuests([]);
        return;
      }

      const parsed = rows
        .map((row) => ({
          name: row.Name || row.name || row['Guest Name'] || '',
          surname: row.Surname || row.surname || row['Last Name'] || '',
          phone: row.Phone || row.phone || row['Phone Number'] || '',
          email: row.Email || row.email || '',
          numberOfGuests: parseInt(row.Guests || row['Number of Guests'] || row.numberOfGuests || 1, 10) || 1,
          dietaryRestrictions: row['Dietary Restrictions'] || row.dietaryRestrictions || '',
          notes: row.Notes || row.notes || '',
        }))
        .filter((guest) => guest.name.trim() || guest.phone.trim()); // Filter out completely empty rows

      const validGuests = parsed.filter((guest) => guest.name.trim() && guest.phone.trim());
      const invalidGuests = parsed.filter((guest) => !guest.name.trim() || !guest.phone.trim());

      setImportedGuests(validGuests);

      let message = `Preview loaded: ${validGuests.length} valid guests ready to import.`;
      if (invalidGuests.length > 0) {
        message += ` ${invalidGuests.length} rows skipped due to missing name or phone.`;
      }
      setImportMessage(message);
    } catch (err) {
      setImportMessage('Failed to read file: ' + err.message);
      setImportedGuests([]);
    }
  };

  const handleImportGuests = async () => {
    if (importedGuests.length === 0) {
      setImportMessage('Please upload a valid Excel/CSV guest file first.');
      return;
    }

    try {
      setLoading(true);
      let successCount = 0;
      let errors = [];

      for (const guest of importedGuests) {
        try {
          await guestAPI.addGuest(event._id, {
            name: guest.name,
            surname: guest.surname,
            phone: guest.phone,
            email: guest.email,
            numberOfGuests: guest.numberOfGuests,
            dietaryRestrictions: guest.dietaryRestrictions,
            notes: guest.notes,
          });
          successCount++;
        } catch (err) {
          errors.push(`${guest.name || 'Unknown'}: ${err.response?.data?.error || err.message}`);
        }
      }

      if (successCount > 0) {
        setMessage(`✓ Imported ${successCount} guests successfully.`);
        fetchGuests();
      }

      if (errors.length > 0) {
        setImportMessage(`Failed to import ${errors.length} guests:\n${errors.join('\n')}`);
      } else {
        setImportMessage('');
      }

      setImportedGuests([]);
    } catch (err) {
      setMessage('✗ Failed to import guests: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const header = 'Name,Surname,Phone Number,Email,Number of Guests,Dietary Restrictions,Notes\n';
    const blob = new Blob([header], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.setAttribute('download', 'guest-template.csv');
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const handleSendInvitation = async (guestId) => {
    try {
      await guestAPI.sendInvitation(guestId);
      setMessage('✓ WhatsApp invitation sent!');
    } catch (err) {
      setMessage('✗ Failed to send invitation: ' + err.message);
    }
  };

  const handleSendArrivalConfirmation = async (guestId) => {
    try {
      await guestAPI.sendArrivalConfirmation(guestId);
      setMessage('✓ Arrival confirmation message sent!');
    } catch (err) {
      setMessage('✗ Failed to send message: ' + err.message);
    }
  };

  const handleGuestFieldChange = (guestId, field, value) => {
    setGuests(
      guests.map((guest) =>
        guest._id === guestId ? { ...guest, [field]: value } : guest
      )
    );
  };

  const handleSaveGuest = async (guest) => {
    try {
      await guestAPI.updateGuest(guest._id, {
        name: guest.name,
        surname: guest.surname,
        phone: guest.phone,
        table: guest.table || '',
        seatNumber: guest.seatNumber || '',
        notes: guest.notes || '',
      });
      setMessage(`✓ Updated ${guest.name}`);
      fetchGuests();
    } catch (err) {
      setMessage('✗ Failed to save guest: ' + err.message);
    }
  };

  const handleSaveLayout = async () => {
    try {
      const payload = {
        hallLayout: hallLayout.map(({ selected, ...rest }) => rest),
      };
      await eventAPI.updateEvent(event._id, payload);
      setMessage('✓ Hall layout saved successfully.');
    } catch (err) {
      setMessage('✗ Failed to save layout: ' + err.message);
    }
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
      guests,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.setAttribute('download', `${event.name.replace(/\s+/g, '_')}_seatplan.json`);
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  // Group guests by table and calculate table stats from layout
  const guestsByTable = {};
  const tableStats = {};

  hallLayout.forEach((table) => {
    const assigned = table.seats.filter(seat => seat.guestId).length;
    const arrived = table.seats.filter(seat => {
      const guest = guests.find(g => g._id === seat.guestId);
      return guest && guest.arrivalConfirmed;
    }).length;
    tableStats[table.label] = { assigned, arrived };
  });

  guests.forEach((guest) => {
    const table = guest.table || 'Unassigned';
    if (!guestsByTable[table]) {
      guestsByTable[table] = [];
    }
    guestsByTable[table].push(guest);
  });

  const sortedTables = Object.keys(guestsByTable).sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });

  const filteredGuests = guests.filter((guest) => {
    const query = guestSearch.trim().toLowerCase();
    if (!query) return true;
    return [guest.name, guest.surname, guest.phone, guest.table, guest.notes]
      .filter(Boolean)
      .some((field) => field.toLowerCase().includes(query));
  });

  const guestCounts = guests.reduce(
    (counts, guest) => {
      const isAssigned = Boolean(guest.table);
      const arrived = Boolean(guest.arrivalConfirmed);
      counts.assigned += isAssigned ? 1 : 0;
      counts.unassigned += isAssigned ? 0 : 1;
      counts.arrived += arrived ? 1 : 0;
      counts.notArrived += arrived ? 0 : 1;
      return counts;
    },
    { assigned: 0, unassigned: 0, arrived: 0, notArrived: 0 }
  );

  const selectedGuest = guests.find((guest) => guest._id === selectedGuestToAssign);

  return (
    <div className="event-detail">
      <button className="back-button" onClick={onBack}>← {t('Back to Events')}</button>

      <div className="hero-card">
        <div>
          <h2>{event.name}</h2>
          <p className="subtext">{event.location} · {new Date(event.date).toLocaleDateString()}</p>
          <p className="status-pill">{t(event.status)}</p>
          {event.description && <p className="luxury-description">{event.description}</p>}
          {event.capacity && <p className="event-meta">{t('Capacity')}: {event.capacity}</p>}
        </div>
        <div className="hero-actions">
          <button onClick={() => { setShowGuestForm(!showGuestForm); setEditingGuest(null); setFormData({ name: '', surname: '', phone: '' }); }}>
            {showGuestForm ? t('Cancel') : '+ ' + t('Add Guest')}
          </button>
        </div>
      </div>

      {message && <p className={message.includes('✓') ? 'success' : 'error'}>{message}</p>}

      {showGuestForm && (
        <div className="card luxury-card guest-form-card">
          <h3>{editingGuest ? t('Edit Guest') : t('Add New Guest')}</h3>
          <form onSubmit={handleAddGuest} className="guest-form">
            <label>
              {t('First Name')} *
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="John"
                required
              />
            </label>
            <label>
              {t('Surname')}
              <input
                type="text"
                value={formData.surname}
                onChange={(e) => setFormData({ ...formData, surname: e.target.value })}
                placeholder="Doe"
              />
            </label>
            <label>
              {t('Phone Number')} *
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+1 234 567 8900"
                required
              />
            </label>
            <button type="submit">{editingGuest ? t('Update Guest') : t('Add Guest')}</button>
          </form>
        </div>
      )}

      <div className="split-grid">
        <section className="card luxury-card">
          <div className="section-header">
            <h3>{t('Import Guests')}</h3>
            <button className="secondary" onClick={handleDownloadTemplate}>{t('Download Template')}</button>
          </div>
          <label className="file-upload">
            {t('Upload Guest List')}
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
          </label>
          {importMessage && <p className="info-text">{importMessage}</p>}
          {importedGuests.length > 0 && (
            <div className="import-preview">
              <p>{importedGuests.length} {t('guests ready to import')}</p>
              <button className="secondary" onClick={handleImportGuests}>{t('Import Guests')}</button>
            </div>
          )}
        </section>

        <section className="card luxury-card hall-plan-card">
          <div className="section-header">
            <h3>{t('Hall Design')}</h3>
            <span className="note">{t('Assign tables to teams and organize guests visually.')}</span>
          </div>
          <div className="hall-plan-layout">
            <div className="hall-plan-map">
              <HallMap
                layout={hallLayout}
                setLayout={setHallLayout}
                guestStats={tableStats}
                selectedGuest={selectedGuest}
                onAssignGuestToTable={handleAssignGuestToTable}
              />
              <div className="layout-save">
                <button onClick={handleSaveLayout}>{t('Save Hall Layout')}</button>
              </div>
            </div>

            <aside className="seatplan-sidebar">
              <div className="seatplan-header">
                <h4>{t('Guest Planner')}</h4>
                <p className="note">{t('Drag a guest onto a table or select a guest and assign to the highlighted table.')}</p>
              </div>
              <div className="seatplan-status-row">
                <div className="seatplan-status-pill assigned">{t('Assigned')}<br />{guestCounts.assigned}</div>
                <div className="seatplan-status-pill unassigned">{t('Unassigned')}<br />{guestCounts.unassigned}</div>
                <div className="seatplan-status-pill arrived">{t('Arrived')}<br />{guestCounts.arrived}</div>
                <div className="seatplan-status-pill not-arrived">{t('Not arrived')}<br />{guestCounts.notArrived}</div>
              </div>
              <div className="seatplan-search">
                <input
                  type="search"
                  placeholder={t('Search guests...')}
                  value={guestSearch}
                  onChange={(e) => setGuestSearch(e.target.value)}
                />
              </div>
              <div className="guest-list-panel">
                {filteredGuests.length === 0 ? (
                  <p className="info-text">{t('No guests match the search.')}</p>
                ) : (
                  filteredGuests.map((guest) => (
                    <div
                      key={guest._id}
                      className={`guest-card ${guest.table ? 'assigned' : 'unassigned'} ${selectedGuestToAssign === guest._id ? 'selected' : ''}`}
                      draggable
                      onDragStart={(event) => event.dataTransfer.setData('text/plain', `guest:${guest._id}`)}
                    >
                      <div className="guest-card-main">
                        <div className="guest-title">{guest.name} {guest.surname}</div>
                        <div className="guest-phone">{guest.phone}</div>
                      </div>
                      <div className="guest-card-meta">
                        <span>{guest.table ? `${guest.table}${guest.seatNumber ? ` - ${guest.seatNumber}` : ''}` : t('Not assigned')}</span>
                        <button
                          type="button"
                          className={`select-guest-btn ${selectedGuestToAssign === guest._id ? 'active' : ''}`}
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            if (selectedGuestToAssign === guest._id) {
                              setSelectedGuestToAssign(null);
                            } else {
                              setSelectedGuestToAssign(guest._id);
                            }
                          }}
                          title={selectedGuestToAssign === guest._id ? t('Click to deselect') : t('Click to select')}
                        >
                          {selectedGuestToAssign === guest._id ? '✓ ' + t('Selected') : t('Select')}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {selectedGuest ? (
                <div className="selected-guest-box highlight">
                  <div className="selected-guest-header">
                    <h5>✓ {t('Selected guest')}:</h5>
                    <button 
                      type="button" 
                      className="close-btn" 
                      onClick={handleClearGuestSelection}
                      title={t('Cancel selection')}
                    >
                      ✕
                    </button>
                  </div>
                  <p className="guest-name"><strong>{selectedGuest.name} {selectedGuest.surname}</strong></p>
                  <p className="guest-phone">{selectedGuest.phone}</p>
                  <p className="instruction">{t('Drag to a table or use the assign button on the table panel.')}</p>
                  <button 
                    type="button" 
                    className="cancel-selection-btn" 
                    onClick={handleClearGuestSelection}
                  >
                    {t('Clear selection')}
                  </button>
                </div>
              ) : (
                <div className="selected-guest-box empty">
                  <p className="info-text">{t('Select a guest to assign to a table')}</p>
                </div>
              )}
            </aside>
          </div>
          <div className="layout-actions">
            <button className="secondary" onClick={handlePrintPlan}>{t('Print Seating Plan')}</button>
            <button className="secondary" onClick={handleExportPlan}>{t('Export Plan JSON')}</button>
          </div>
        </section>
      </div>

      <section className="card luxury-card group-management-card">
        <div className="section-header">
          <h3>Guest Groups</h3>
          <span className="note">Create family, friends, or work teams with leader and member details.</span>
        </div>

        <form className="group-form" onSubmit={handleCreateGroup}>
          <div className="group-inputs">
            <label>
              Group Name
              <input
                type="text"
                value={groupForm.name}
                onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                placeholder="Family Smith"
                required
              />
            </label>
            <label>
              Group Type
              <select
                value={groupForm.type}
                onChange={(e) => setGroupForm({ ...groupForm, type: e.target.value })}
              >
                <option value="family">Family</option>
                <option value="friends">Friends</option>
                <option value="work mates">Work Mates</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Number of Guests
              <input
                type="number"
                min="1"
                value={groupForm.numberOfGuests}
                onChange={(e) => setGroupForm({ ...groupForm, numberOfGuests: e.target.value })}
              />
            </label>
            <label>
              Group Leader Name
              <input
                type="text"
                value={groupForm.leaderName}
                onChange={(e) => setGroupForm({ ...groupForm, leaderName: e.target.value })}
                placeholder="Jane Smith"
              />
            </label>
            <label>
              Group Leader Phone
              <input
                type="tel"
                value={groupForm.leaderPhone}
                onChange={(e) => setGroupForm({ ...groupForm, leaderPhone: e.target.value })}
                placeholder="+1 234 567 8900"
              />
            </label>
            <label className="full-width">
              Notes
              <input
                type="text"
                value={groupForm.notes}
                onChange={(e) => setGroupForm({ ...groupForm, notes: e.target.value })}
                placeholder="VIP seating, dietary requests, special notes"
              />
            </label>
          </div>
          <button type="submit">Add Group</button>
        </form>

        {groups.length > 0 ? (
          <div className="group-list">
            {groups.map((group) => (
              <div key={group.id} className="group-card">
                <div className="group-header">
                  <div>
                    <h4>{group.name || 'Unnamed Group'}</h4>
                    <p className="group-meta">{group.type} · {group.numberOfGuests} guests</p>
                    <p className="group-leader">Leader: {group.leader?.name || '—'} · {group.leader?.phone || '—'}</p>
                  </div>
                  <button className="delete-btn" onClick={() => handleRemoveGroup(group.id)}>Delete Group</button>
                </div>

                <div className="group-member-form">
                  <label>
                    Member Name
                    <input
                      type="text"
                      value={selectedGroupForMember === group.id ? memberForm.name : memberForm.name}
                      onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
                      placeholder="Member Name"
                    />
                  </label>
                  <label>
                    Surname
                    <input
                      type="text"
                      value={memberForm.surname}
                      onChange={(e) => setMemberForm({ ...memberForm, surname: e.target.value })}
                      placeholder="Surname"
                    />
                  </label>
                  <label>
                    Phone
                    <input
                      type="tel"
                      value={memberForm.phone}
                      onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })}
                      placeholder="+1 234 567 8900"
                    />
                  </label>
                  <label className="full-width">
                    Notes
                    <input
                      type="text"
                      value={memberForm.notes}
                      onChange={(e) => setMemberForm({ ...memberForm, notes: e.target.value })}
                      placeholder="Allergies, preferences, special requests"
                    />
                  </label>
                  <button type="button" className="secondary" onClick={() => handleAddGroupMember(group.id)}>
                    Add Member
                  </button>
                </div>

                {group.members && group.members.length > 0 && (
                  <div className="group-members-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Surname</th>
                          <th>Phone</th>
                          <th>Notes</th>
                          <th>Seat</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.members.map((member, index) => (
                          <tr key={`${group.id}-${index}`}>
                            <td><input value={member.name || ''} onChange={(e) => handleUpdateGroupMember(group.id, index, 'name', e.target.value)} /></td>
                            <td><input value={member.surname || ''} onChange={(e) => handleUpdateGroupMember(group.id, index, 'surname', e.target.value)} /></td>
                            <td><input value={member.phone || ''} onChange={(e) => handleUpdateGroupMember(group.id, index, 'phone', e.target.value)} /></td>
                            <td><input value={member.notes || ''} onChange={(e) => handleUpdateGroupMember(group.id, index, 'notes', e.target.value)} /></td>
                            <td><input value={member.table || ''} placeholder="A1" onChange={(e) => handleUpdateGroupMember(group.id, index, 'table', e.target.value)} /></td>
                            <td><button className="delete-btn" type="button" onClick={() => handleRemoveGroupMember(group.id, index)}>Remove</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="info-text">No groups yet. Create a group to organize guests by Family, Friends or Work Mates.</p>
        )}

        <div className="layout-save">
          <button onClick={handleSaveGroups}>Save Group Configuration</button>
        </div>
      </section>

      <section className="card luxury-card">
        <h3>Guest List by Table</h3>
        {loading ? (
          <p>Loading guests...</p>
        ) : guests.length === 0 ? (
          <p>No guests added yet. Use Excel import or add manually.</p>
        ) : (
          <div className="guests-by-table">
            {sortedTables.map((table) => (
              <div key={table} className="table-section">
                <h4 className="table-header">{table === 'Unassigned' ? '❌ ' : '🍽️ '}{table}</h4>
                <div className="guests-table-wrapper">
                  <table className="guests-table">
                    <thead>
                      <tr>
                        <th>First Name</th>
                        <th>Surname</th>
                        <th>Phone</th>
                        <th>Seat</th>
                        <th>Notes</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {guestsByTable[table].map((guest) => (
                        <tr key={guest._id}>
                          <td>
                            <input
                              type="text"
                              value={guest.name}
                              onChange={(e) => handleGuestFieldChange(guest._id, 'name', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              value={guest.surname || ''}
                              onChange={(e) => handleGuestFieldChange(guest._id, 'surname', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="tel"
                              value={guest.phone}
                              onChange={(e) => handleGuestFieldChange(guest._id, 'phone', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              value={guest.seatNumber || ''}
                              placeholder="A1"
                              onChange={(e) => handleGuestFieldChange(guest._id, 'seatNumber', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              value={guest.notes || ''}
                              placeholder="Add notes..."
                              onChange={(e) => handleGuestFieldChange(guest._id, 'notes', e.target.value)}
                            />
                          </td>
                          <td className="actions-cell">
                            <button className="save-btn" onClick={() => handleSaveGuest(guest)}>Save</button>
                            <button className="delete-btn" onClick={() => handleDeleteGuest(guest._id)}>×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default EventDetail;
