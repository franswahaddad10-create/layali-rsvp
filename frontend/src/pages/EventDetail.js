import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { guestAPI, eventAPI } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';
import { emitLiveEventUpdate } from '../utils/liveEventSync';

const normalizeGroups = (inputGroups = []) =>
  inputGroups.map((group, index) => ({
    id: group.id || `group-${Date.now()}-${index}`,
    name: group.name || '',
    type: group.type || 'family',
    numberOfGuests: Number(group.numberOfGuests) || 1,
    leaderName: group.leader?.name || group.leaderName || '',
    leaderPhone: group.leader?.phone || group.leaderPhone || '',
    notes: group.notes || '',
    members: (group.members || []).map((member, memberIndex) => ({
      id: member.id || `member-${Date.now()}-${index}-${memberIndex}`,
      guestId: member.guestId || '',
      name: member.name || '',
      surname: member.surname || '',
      phone: member.phone || '',
      email: member.email || '',
      notes: member.notes || '',
      table: member.table || '',
      seatNumber: member.seatNumber || '',
    })),
  }));

const buildGroupsPayload = (groups) =>
  groups.map((group) => ({
    id: group.id,
    name: group.name,
    type: group.type,
    numberOfGuests: Number(group.numberOfGuests) || 1,
    leader: {
      name: group.leaderName || '',
      phone: group.leaderPhone || '',
    },
    notes: group.notes || '',
    members: (group.members || []).map((member) => ({
      id: member.id,
      guestId: member.guestId || '',
      name: member.name || '',
      surname: member.surname || '',
      phone: member.phone || '',
      email: member.email || '',
      notes: member.notes || '',
      table: member.table || '',
      seatNumber: member.seatNumber || '',
    })),
  }));

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

const getGuestFullName = (guest) => [guest.name, guest.surname].filter(Boolean).join(' ').trim();

const getSpeechRecognitionLanguage = (language) => {
  if (language === 'ar') {
    return 'ar-SA';
  }

  if (language === 'en') {
    return 'en-US';
  }

  return 'he-IL';
};

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

const cloneHallLayout = (hallLayout = []) => hallLayout.map((table) => ({
  ...table,
  seats: (table.seats || []).map((seat) => ({ ...seat })),
}));

const buildAvailableSeats = (hallLayout = [], guests = []) => {
  const occupiedSeatKeys = new Set();

  guests.forEach((guest) => {
    if (!guest.table) {
      return;
    }

    occupiedSeatKeys.add(`${guest.table}::${getSeatOrdinal(guest.seatNumber)}`);
    if (guest.seatNumber) {
      occupiedSeatKeys.add(`${guest.table}::${guest.seatNumber}`);
    }
  });

  return hallLayout.flatMap((table) =>
    (table.seats || []).map((seat, seatIndex) => {
      const seatOrder = getSeatOrdinal(seat.id, seatIndex);
      const keyByOrder = `${table.label}::${seatOrder}`;
      const keyById = `${table.label}::${seat.id}`;

      if (seat.guestId || occupiedSeatKeys.has(keyByOrder) || occupiedSeatKeys.has(keyById)) {
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
  const occupiedSeatKeys = new Set();

  guests.forEach((guest) => {
    if (!guest.table || excludedGuestIds.has(String(guest._id))) {
      return;
    }

    occupiedSeatKeys.add(`${guest.table}::${getSeatOrdinal(guest.seatNumber)}`);
    if (guest.seatNumber) {
      occupiedSeatKeys.add(`${guest.table}::${guest.seatNumber}`);
    }
  });

  return hallLayout.flatMap((table) => {
    const freeSeats = (table.seats || [])
      .map((seat, seatIndex) => {
        const seatOrder = getSeatOrdinal(seat.id, seatIndex);
        const keyByOrder = `${table.label}::${seatOrder}`;
        const keyById = `${table.label}::${seat.id}`;

        if ((seat.guestId && !excludedGuestIds.has(String(seat.guestId))) || occupiedSeatKeys.has(keyByOrder) || occupiedSeatKeys.has(keyById)) {
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
    let currentRun = [];

    freeSeats.forEach((seat, seatIndex) => {
      const previousSeat = freeSeats[seatIndex - 1];
      if (!previousSeat || seat.seatOrder === previousSeat.seatOrder + 1) {
        currentRun.push(seat);
      } else {
        if (currentRun.length >= requiredSize) {
          for (let index = 0; index <= currentRun.length - requiredSize; index += 1) {
            blocks.push({ tableId: table.id, tableLabel: table.label, seats: currentRun.slice(index, index + requiredSize) });
          }
        }
        currentRun = [seat];
      }
    });

    if (currentRun.length >= requiredSize) {
      for (let index = 0; index <= currentRun.length - requiredSize; index += 1) {
        blocks.push({ tableId: table.id, tableLabel: table.label, seats: currentRun.slice(index, index + requiredSize) });
      }
    }

    return blocks;
  });
};

const applyAssignmentsToLayout = (hallLayout = [], assignments = []) => {
  const assignmentLookup = new Map(assignments.map((assignment) => [`${assignment.tableId}::${assignment.seatId}`, assignment.guestId]));

  return hallLayout.map((table) => ({
    ...table,
    seats: (table.seats || []).map((seat) => {
      const lookupKey = `${table.id}::${seat.id}`;
      return assignmentLookup.has(lookupKey)
        ? { ...seat, guestId: assignmentLookup.get(lookupKey) }
        : seat;
    }),
  }));
};

function EventDetail({ event, user, onBack }) {
  const { t } = useLanguage();
  const [currentEvent, setCurrentEvent] = useState(event);
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [importedGuests, setImportedGuests] = useState([]);
  const [importMessage, setImportMessage] = useState('');
  const [groups, setGroups] = useState(normalizeGroups(event.groups || []));
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [showWalkInCompanions, setShowWalkInCompanions] = useState(true);
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
  const [planningConversation, setPlanningConversation] = useState([]);
  const [planningInput, setPlanningInput] = useState('');
  const [planningLanguage, setPlanningLanguage] = useState('he');
  const [planningLoading, setPlanningLoading] = useState(false);
  const [planningInsights, setPlanningInsights] = useState({ signals: [], guests: [] });
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [editingEvent, setEditingEvent] = useState(false);
  const recognitionRef = useRef(null);
  const pendingSpeechTextRef = useRef('');
  const speechAutoSendTimerRef = useRef(null);
  const [eventForm, setEventForm] = useState({
    name: event.name || '',
    date: event.date ? new Date(event.date).toISOString().slice(0, 16) : '',
    location: event.location || '',
    description: event.description || '',
    capacity: event.capacity || 100,
    status: event.status || 'scheduled',
  });
  const hasPermission = useCallback((permissionKey) => Boolean(user?.role === 'admin' || user?.permissions?.[permissionKey]), [user]);
  const canManageEvents = hasPermission('manageEvents');
  const canManageGuests = hasPermission('manageGuests');
  const canViewReports = hasPermission('viewReports') || canManageEvents;

  const syncEventState = useCallback((nextEvent) => {
    setCurrentEvent(nextEvent);
    setGroups(normalizeGroups(nextEvent.groups || []));
    setEventForm({
      name: nextEvent.name || '',
      date: nextEvent.date ? new Date(nextEvent.date).toISOString().slice(0, 16) : '',
      location: nextEvent.location || '',
      description: nextEvent.description || '',
      capacity: nextEvent.capacity || 100,
      status: nextEvent.status || 'scheduled',
    });
  }, []);

  const fetchGuests = useCallback(async () => {
    try {
      setLoading(true);
      const response = await guestAPI.getEventGuests(event._id);
      setGuests(response.data.guests || []);
    } catch (err) {
      setMessage('Failed to fetch guests: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [event._id]);

  const fetchEventDetails = useCallback(async () => {
    try {
      const response = await eventAPI.getEventById(event._id);
      syncEventState(response.data.event);
    } catch (err) {
      setMessage('✗ ' + t('Failed to fetch events') + ': ' + err.message);
    }
  }, [event._id, syncEventState, t]);

  const fetchPlanning = useCallback(async () => {
    try {
      const response = await eventAPI.getPlanning(event._id);
      const planning = response.data.planning || {};
      setPlanningConversation(planning.conversation || []);
      setPlanningLanguage(planning.metadata?.preferredLanguage || 'he');
      setPlanningInsights({
        signals: planning.metadata?.lastDetectedSignals || [],
        guests: planning.metadata?.lastMatchedGuests || [],
      });
    } catch (err) {
      setMessage('✗ ' + t('Failed to load planning assistant.') + ': ' + err.message);
    }
  }, [event._id, t]);

  useEffect(() => {
    syncEventState(event);
  }, [event, syncEventState]);

  useEffect(() => {
    fetchGuests();
    fetchEventDetails();
    if (canManageEvents || canManageGuests) {
      fetchPlanning();
    }
  }, [canManageEvents, canManageGuests, fetchGuests, fetchEventDetails, fetchPlanning]);

  useEffect(() => {
    if (currentEvent.status !== 'ongoing') {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      fetchGuests();
      fetchEventDetails();
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [currentEvent.status, fetchGuests, fetchEventDetails]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSpeechSupported(Boolean(SpeechRecognition));

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }

      if (speechAutoSendTimerRef.current) {
        window.clearTimeout(speechAutoSendTimerRef.current);
        speechAutoSendTimerRef.current = null;
      }
    };
  }, []);

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
        await guestAPI.addGuest(currentEvent._id, payload);
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
      setMessage('✓ Guest removed successfully!');
      fetchGuests();
    } catch (err) {
      setMessage('✗ Failed to delete guest: ' + err.message);
    }
  };

  const handleEventFieldChange = (key, value) => {
    setEventForm((previous) => ({ ...previous, [key]: value }));
  };

  const handleSaveEvent = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: eventForm.name,
        date: new Date(eventForm.date).toISOString(),
        location: eventForm.location,
        description: eventForm.description,
        capacity: parseInt(eventForm.capacity, 10) || 0,
        status: eventForm.status,
      };
      const response = await eventAPI.updateEvent(currentEvent._id, payload);
      syncEventState(response.data.event);
      setMessage('✓ ' + t('Event updated successfully'));
      setEditingEvent(false);
    } catch (err) {
      setMessage('✗ ' + t('Failed to update event') + ': ' + err.message);
    }
  };

  const handleDeleteEvent = async () => {
    if (!window.confirm(t('Are you sure you want to delete this event?'))) return;
    if (!window.confirm(t('This action is irreversible. Delete event?'))) return;

    try {
      await eventAPI.deleteEvent(currentEvent._id);
      setMessage('✓ ' + t('Event deleted successfully'));
      onBack();
    } catch (err) {
      setMessage('✗ ' + t('Failed to delete event') + ': ' + err.message);
    }
  };

  const handleStartEvent = async () => {
    try {
      const response = await eventAPI.updateEvent(currentEvent._id, { status: 'ongoing' });
      syncEventState(response.data.event);
      emitLiveEventUpdate(currentEvent._id, 'event-started');
      setMessage('✓ ' + t('Event live mode activated.'));
    } catch (err) {
      setMessage('✗ ' + t('Failed to start live event mode.') + ': ' + err.message);
    }
  };

  const handleCompleteEvent = async () => {
    try {
      const response = await eventAPI.updateEvent(currentEvent._id, { status: 'completed' });
      syncEventState(response.data.event);
      emitLiveEventUpdate(currentEvent._id, 'event-completed');
      setMessage('✓ ' + t('Event marked as completed.'));
    } catch (err) {
      setMessage('✗ ' + t('Failed to complete the event.') + ': ' + err.message);
    }
  };

  const handleOpenLiveMapWindow = () => {
    const liveMapUrl = `${window.location.origin}/?liveMapEvent=${currentEvent._id}`;
    window.open(liveMapUrl, '_blank', 'noopener,noreferrer');
  };

  const handleOpenEntranceWindow = () => {
    const entranceUrl = `${window.location.origin}/?entranceEvent=${currentEvent._id}`;
    window.open(entranceUrl, '_blank', 'noopener,noreferrer');
  };

  const handleOpenTvModeWindow = () => {
    const tvUrl = `${window.location.origin}/?tvEvent=${currentEvent._id}`;
    window.open(tvUrl, '_blank', 'noopener,noreferrer');
  };

  const handleOpenManagerReportWindow = () => {
    const reportUrl = `${window.location.origin}/?managerReportEvent=${currentEvent._id}`;
    window.open(reportUrl, '_blank', 'noopener,noreferrer');
  };

  const submitPlanningMessage = useCallback(async (text, source = 'text') => {
    if (!text || !String(text).trim()) {
      return;
    }

    try {
      setPlanningLoading(true);
      const response = await eventAPI.sendPlanningMessage(currentEvent._id, {
        text: String(text).trim(),
        language: planningLanguage,
        source,
      });
      const planning = response.data.planning || {};
      setPlanningConversation(planning.conversation || []);
      setPlanningLanguage(planning.metadata?.preferredLanguage || planningLanguage);
      setPlanningInsights({
        signals: planning.metadata?.lastDetectedSignals || [],
        guests: planning.metadata?.lastMatchedGuests || [],
      });
    } catch (err) {
      setMessage('✗ ' + t('Failed to send planning message.') + ': ' + err.message);
    } finally {
      setPlanningLoading(false);
    }
  }, [currentEvent._id, planningLanguage, t]);

  const handleSendPlanningMessage = async (submitEvent) => {
    submitEvent.preventDefault();
    const nextMessage = planningInput.trim();
    if (!nextMessage) {
      return;
    }

    await submitPlanningMessage(nextMessage, 'text');
    setPlanningInput('');
  };

  const flushPendingSpeechText = useCallback(async () => {
    const textToSend = pendingSpeechTextRef.current.trim();
    if (!textToSend) {
      return;
    }

    pendingSpeechTextRef.current = '';
    setPlanningInput('');
    await submitPlanningMessage(textToSend, 'speech');
  }, [submitPlanningMessage]);

  const handleStartListening = () => {
    if (typeof window === 'undefined') {
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMessage('✗ ' + t('Speech recognition is not supported in this browser.'));
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = getSpeechRecognitionLanguage(planningLanguage);
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (speechEvent) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let index = speechEvent.resultIndex; index < speechEvent.results.length; index += 1) {
        const transcriptChunk = speechEvent.results[index][0]?.transcript || '';
        if (speechEvent.results[index].isFinal) {
          finalTranscript += `${transcriptChunk} `;
        } else {
          interimTranscript += transcriptChunk;
        }
      }

      if (finalTranscript.trim()) {
        pendingSpeechTextRef.current = `${pendingSpeechTextRef.current}${pendingSpeechTextRef.current.trim() ? ' ' : ''}${finalTranscript.trim()}`.trim();
        setPlanningInput(pendingSpeechTextRef.current);

        if (speechAutoSendTimerRef.current) {
          window.clearTimeout(speechAutoSendTimerRef.current);
        }

        speechAutoSendTimerRef.current = window.setTimeout(() => {
          flushPendingSpeechText();
        }, 1500);
      }

      setLiveTranscript(interimTranscript.trim());
    };

    recognition.onerror = (speechError) => {
      setIsListening(false);
      setLiveTranscript('');
      if (speechError.error !== 'no-speech' && speechError.error !== 'aborted') {
        setMessage('✗ ' + t('Microphone access failed or speech recognition stopped unexpectedly.'));
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      setLiveTranscript('');
      recognitionRef.current = null;
      if (speechAutoSendTimerRef.current) {
        window.clearTimeout(speechAutoSendTimerRef.current);
        speechAutoSendTimerRef.current = null;
      }
      flushPendingSpeechText();
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
    setLiveTranscript('');
  };

  const handleStopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setLiveTranscript('');
    if (speechAutoSendTimerRef.current) {
      window.clearTimeout(speechAutoSendTimerRef.current);
      speechAutoSendTimerRef.current = null;
    }
    flushPendingSpeechText();
  };

  const handleMarkArrived = async (guestId) => {
    try {
      const response = await guestAPI.confirmArrival(guestId);
      emitLiveEventUpdate(currentEvent._id, 'guest-arrived', { guestId: response.data?.guest?._id || guestId });
      setMessage('✓ ' + t('Guest marked as arrived.'));
      fetchGuests();
      fetchEventDetails();
    } catch (err) {
      setMessage('✗ ' + t('Failed to mark guest as arrived.') + ': ' + err.message);
    }
  };

  const persistSmartAssignments = async (assignments, nextLayout, activityEntry) => {
    if (!assignments.length) {
      setMessage('✗ ' + t('No available seats or guests for this action.'));
      return;
    }

    try {
      await Promise.all(assignments.map((assignment) => guestAPI.updateGuest(assignment.guestId, {
        table: assignment.tableLabel,
        seatNumber: assignment.seatId,
      })));

      const response = await eventAPI.updateEvent(currentEvent._id, {
        hallLayout: nextLayout,
        activityEntry,
      });

      syncEventState(response.data.event);
      emitLiveEventUpdate(currentEvent._id, 'seating-updated');
      setMessage(`✓ ${activityEntry.message}`);
      fetchGuests();
    } catch (err) {
      setMessage('✗ ' + t('Failed to save groups') + ': ' + err.message);
    }
  };

  const handleSmartSeatByGroups = async () => {
    const nextLayout = cloneHallLayout(currentEvent.hallLayout || []);
    const candidateGuests = guests
      .filter((guest) => !guest.table && guest.rsvpStatus !== 'declined')
      .sort((left, right) => {
        const leftPriority = left.rsvpStatus === 'accepted' ? 0 : 1;
        const rightPriority = right.rsvpStatus === 'accepted' ? 0 : 1;
        return leftPriority - rightPriority;
      });

    if (!buildAvailableSeats(nextLayout, guests).length || !candidateGuests.length) {
      setMessage('✗ ' + t('No available seats or guests for this action.'));
      return;
    }

    const groupedGuests = candidateGuests.reduce((accumulator, guest) => {
      const groupKey = guest.groupId || `solo-${guest._id}`;
      if (!accumulator.has(groupKey)) {
        accumulator.set(groupKey, []);
      }
      accumulator.get(groupKey).push(guest);
      return accumulator;
    }, new Map());

    const guestBuckets = [...groupedGuests.values()].sort((left, right) => right.length - left.length);
    const assignments = [];
    let workingLayout = nextLayout;
    let workingGuests = [...guests];

    guestBuckets.forEach((bucket) => {
      const candidateBlocks = findContiguousSeatBlocks(workingLayout, workingGuests, [], bucket.length)
        .sort((left, right) => left.seats.length - right.seats.length || left.tableLabel.localeCompare(right.tableLabel));

      const targetBlock = candidateBlocks[0];
      if (!targetBlock) {
        return;
      }

      const blockAssignments = [];
      bucket.forEach((guest, index) => {
        const seat = targetBlock.seats[index];
        if (!seat) {
          return;
        }
        blockAssignments.push({
          guestId: guest._id,
          tableId: targetBlock.tableId,
          tableLabel: seat.tableLabel,
          seatId: seat.seatId,
        });
      });

      assignments.push(...blockAssignments);
      workingLayout = applyAssignmentsToLayout(workingLayout, blockAssignments);
      workingGuests = workingGuests.map((guest) => {
        const match = blockAssignments.find((assignment) => assignment.guestId === guest._id);
        return match ? { ...guest, table: match.tableLabel, seatNumber: match.seatId } : guest;
      });
    });

    const nextAssignedLayout = applyAssignmentsToLayout(nextLayout, assignments);

    await persistSmartAssignments(assignments, nextAssignedLayout, {
      type: 'smart-seating-groups',
      message: `Smart seating by groups assigned ${assignments.length} guests.`,
      metadata: { strategy: 'groups', assignedGuests: assignments.length },
    });
  };

  const handleFillEmptySeats = async () => {
    const nextLayout = cloneHallLayout(currentEvent.hallLayout || []);
    const availableSeats = buildAvailableSeats(nextLayout, guests);
    const candidateGuests = guests
      .filter((guest) => !guest.table && guest.rsvpStatus !== 'declined')
      .sort((left, right) => {
        const leftPriority = left.rsvpStatus === 'accepted' ? 0 : 1;
        const rightPriority = right.rsvpStatus === 'accepted' ? 0 : 1;
        return leftPriority - rightPriority;
      });

    const assignments = candidateGuests.slice(0, availableSeats.length).map((guest, index) => ({
      guestId: guest._id,
      tableId: availableSeats[index].tableId,
      tableLabel: availableSeats[index].tableLabel,
      seatId: availableSeats[index].seatId,
    }));

    const nextAssignedLayout = applyAssignmentsToLayout(nextLayout, assignments);

    await persistSmartAssignments(assignments, nextAssignedLayout, {
      type: 'smart-seating-fill',
      message: `Sequential seating filled ${assignments.length} open seats.`,
      metadata: { strategy: 'fill', assignedGuests: assignments.length },
    });
  };

  const handleExportEventReport = () => {
    const totalSeats = (currentEvent.hallLayout || []).reduce((sum, table) => sum + (table.seats?.length || 0), 0);
    const workbook = XLSX.utils.book_new();
    const summaryRows = [
      { Metric: t('Total Guests'), Value: guestCounts.total },
      { Metric: t('Confirmed Attending'), Value: guestCounts.accepted },
      { Metric: t('Checked In'), Value: guestCounts.arrived },
      { Metric: t('Pending RSVP'), Value: guestCounts.pending },
      { Metric: t('Declined Guests'), Value: guestCounts.declined },
      { Metric: t('Total Seats'), Value: totalSeats },
      { Metric: t('Occupancy Rate'), Value: totalSeats ? `${Math.round((guestCounts.assigned / totalSeats) * 100)}%` : '0%' },
    ];
    const tableRows = (currentEvent.hallLayout || []).map((table) => {
      const tableGuests = guests.filter((guest) => guest.table === table.label);
      return {
        Table: table.label,
        Seats: table.seats?.length || 0,
        Assigned: tableGuests.length,
        Free: Math.max((table.seats?.length || 0) - tableGuests.length, 0),
        Arrived: tableGuests.filter((guest) => guest.arrivalConfirmed).length,
        Confirmed: tableGuests.filter((guest) => guest.rsvpStatus === 'accepted').length,
      };
    });
    const groupRows = groups.map((group) => {
      const groupGuests = guests.filter((guest) => guest.groupId === group.id);
      return {
        Group: group.name,
        Type: group.type,
        Guests: groupGuests.length,
        Arrived: groupGuests.filter((guest) => guest.arrivalConfirmed).length,
        Confirmed: groupGuests.filter((guest) => guest.rsvpStatus === 'accepted').length,
      };
    });
    const arrivalRows = [...guests]
      .filter((guest) => guest.arrivalConfirmed)
      .sort((left, right) => new Date(right.arrivalTime || 0) - new Date(left.arrivalTime || 0))
      .map((guest) => ({
        Name: getGuestFullName(guest),
        Phone: guest.phone,
        Group: guest.groupName || '',
        Table: guest.table || '',
        Seat: guest.seatNumber || '',
        ArrivedAt: formatDateTime(guest.arrivalTime),
      }));

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Summary');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(tableRows), 'Tables');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(groupRows), 'Groups');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(arrivalRows.length ? arrivalRows : [{ Name: '—' }]), 'Arrivals');
    XLSX.writeFile(workbook, `${currentEvent.name || 'event'}-report.xlsx`);
    setMessage('✓ ' + t('Event report exported successfully.'));
  };

  const handleFileUpload = (uploadEvent) => {
    const file = uploadEvent.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const data = new Uint8Array(loadEvent.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        const mappedGuests = jsonData.map((row, index) => ({
          name: row['Name'] || row.name || `Guest ${index + 1}`,
          surname: row['Surname'] || row.surname || '',
          phone: row['Phone Number'] || row.Phone || row.phone || '',
          email: row.Email || row.email || '',
          numberOfGuests: parseInt(row['Number of Guests'] || row.numberOfGuests || '1', 10) || 1,
          dietaryRestrictions: row['Dietary Restrictions'] || row.dietaryRestrictions || '',
          notes: row.Notes || row.notes || '',
        }));

        setImportedGuests(mappedGuests);
        setImportMessage(`${mappedGuests.length} guests ready to import`);
      } catch (error) {
        setImportMessage('Failed to process Excel file: ' + error.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImportGuests = async () => {
    if (!importedGuests.length) return;

    try {
      setLoading(true);
      let successCount = 0;
      const errors = [];

      for (const guest of importedGuests) {
        try {
          await guestAPI.addGuest(currentEvent._id, {
            name: guest.name,
            surname: guest.surname,
            phone: guest.phone,
            email: guest.email,
            numberOfGuests: guest.numberOfGuests,
            dietaryRestrictions: guest.dietaryRestrictions,
            notes: guest.notes,
          });
          successCount += 1;
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

  const handleExportNotConfirmed = () => {
    const rows = guests
      .filter((guest) => guest.rsvpStatus !== 'accepted')
      .map((guest) => ({
        Name: guest.name,
        Surname: guest.surname || '',
        Phone: guest.phone,
        RSVP: guest.rsvpStatus || 'pending',
        Group: guest.groupName || '',
        Table: guest.table || '',
        Seat: guest.seatNumber || '',
        Arrived: guest.arrivalConfirmed ? 'Yes' : 'No',
        Notes: guest.notes || '',
      }));

    if (!rows.length) {
      setMessage('✗ ' + t('There are no guests to export in this list.'));
      return;
    }

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Not Confirmed');
    XLSX.writeFile(workbook, `${currentEvent.name || 'event'}-not-confirmed.xlsx`);
    setMessage('✓ ' + t('Not confirmed guests exported to Excel.'));
  };

  const handleSendInvitation = async (guestId) => {
    try {
      const response = await guestAPI.sendInvitation(guestId);

      if (!response.data?.success) {
        throw new Error(response.data?.error || response.data?.result?.error || 'Failed to send WhatsApp invitation.');
      }

      setMessage(`✓ WhatsApp invitation sent!${response.data?.rsvpLink ? ' RSVP link is ready.' : ''}`);
    } catch (err) {
      setMessage('✗ Failed to send invitation: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleCopyRsvpLink = async (guest) => {
    try {
      if (!guest.responseToken) {
        throw new Error(t('RSVP link is not ready yet. Send the invitation once to generate it.'));
      }

      const link = `${window.location.origin}/?rsvp=${guest.responseToken}`;
      await navigator.clipboard.writeText(link);
      setMessage('✓ ' + t('RSVP link copied.'));
    } catch (err) {
      setMessage('✗ ' + (err.message || t('Failed to copy RSVP link.')));
    }
  };

  const handleGuestFieldChange = (guestId, field, value) => {
    setGuests((previous) =>
      previous.map((guest) =>
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
        groupId: guest.groupId || '',
        groupName: guest.groupName || '',
      });
      setMessage(`✓ Updated ${guest.name}`);
      fetchGuests();
    } catch (err) {
      setMessage('✗ Failed to save guest: ' + err.message);
    }
  };

  const handleAssignGuestToGroup = async (guestId, groupId) => {
    const group = groups.find((item) => item.id === groupId);

    try {
      await guestAPI.updateGuest(guestId, {
        groupId: group?.id || '',
        groupName: group?.name || '',
      });

      setGuests((previous) =>
        previous.map((guest) =>
          guest._id === guestId
            ? { ...guest, groupId: group?.id || '', groupName: group?.name || '' }
            : guest
        )
      );

      emitLiveEventUpdate(currentEvent._id, 'guest-group-updated');

      setMessage(group ? `✓ ${t('Guest assigned to group.')} ${group.name}` : '✓ ' + t('Guest removed from group.'));
    } catch (err) {
      setMessage('✗ ' + t('Failed to assign guest to group.') + ': ' + err.message);
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!groupForm.name) return;

    const newGroup = {
      id: `group-${Date.now()}`,
      name: groupForm.name,
      type: groupForm.type,
      numberOfGuests: Number(groupForm.numberOfGuests) || 1,
      leaderName: groupForm.leaderName,
      leaderPhone: groupForm.leaderPhone,
      notes: groupForm.notes,
      members: [],
    };

    setGroups((previous) => [...previous, newGroup]);
    setGroupForm({
      name: '',
      type: 'family',
      numberOfGuests: 1,
      leaderName: '',
      leaderPhone: '',
      notes: '',
    });
    setMessage('✓ Group created. Save to apply changes.');
  };

  const handleAddMemberToGroup = async (e) => {
    e.preventDefault();
    if (!selectedGroupForMember || !memberForm.name || !memberForm.phone) return;

    const newMember = {
      id: `member-${Date.now()}`,
      guestId: '',
      name: memberForm.name,
      surname: memberForm.surname,
      phone: memberForm.phone,
      notes: memberForm.notes,
      email: '',
      table: '',
      seatNumber: '',
    };

    setGroups((previous) =>
      previous.map((group) => {
        if (group.id !== selectedGroupForMember) return group;
        return { ...group, members: [...group.members, newMember] };
      })
    );

    setMemberForm({ name: '', surname: '', phone: '', notes: '' });
    setMessage('✓ Member added to group. Save to apply changes.');
  };

  const handleRemoveMemberFromGroup = (groupId, memberIndex) => {
    setGroups((previous) =>
      previous.map((group) => {
        if (group.id !== groupId) return group;
        const updatedMembers = group.members.filter((_, idx) => idx !== memberIndex);
        return { ...group, members: updatedMembers };
      })
    );
  };

  const handleRemoveGroup = (groupId) => {
    if (!window.confirm('Delete this group and all its members?')) return;
    setGroups((previous) => previous.filter((group) => group.id !== groupId));
    setMessage('✓ Group removed. Save to apply changes.');
  };

  const handleSaveGroups = async () => {
    try {
      const payload = {
        groups: buildGroupsPayload(groups),
      };
      const response = await eventAPI.updateEvent(currentEvent._id, payload);
      syncEventState(response.data.event);

      const validGroups = buildGroupsPayload(groups);
      const validGroupIds = new Map(validGroups.map((group) => [group.id, group.name]));
      const guestsNeedingSync = guests.filter((guest) => guest.groupId && !validGroupIds.has(guest.groupId));
      const renamedGuests = guests.filter((guest) => guest.groupId && validGroupIds.has(guest.groupId) && guest.groupName !== validGroupIds.get(guest.groupId));
      const guestSyncOperations = [];

      guestsNeedingSync.forEach((guest) => {
        guestSyncOperations.push(guestAPI.updateGuest(guest._id, { groupId: '', groupName: '' }));
      });

      renamedGuests.forEach((guest) => {
        guestSyncOperations.push(
          guestAPI.updateGuest(guest._id, {
            groupId: guest.groupId,
            groupName: validGroupIds.get(guest.groupId),
          })
        );
      });

      if (guestSyncOperations.length > 0) {
        await Promise.all(guestSyncOperations);
        await fetchGuests();
      }

      emitLiveEventUpdate(currentEvent._id, 'groups-saved');

      setMessage('✓ Group data saved successfully.');
    } catch (err) {
      setMessage('✗ Failed to save groups: ' + err.message);
    }
  };

  const visibleGuests = showWalkInCompanions ? guests : guests.filter((guest) => !isWalkInCompanion(guest));

  const filteredGuests = visibleGuests.filter((guest) => {
    const query = guestSearch.trim().toLowerCase();
    if (!query) return true;
    return [guest.name, guest.surname, guest.phone, guest.table, guest.notes, guest.groupName]
      .filter(Boolean)
      .some((field) => field.toLowerCase().includes(query));
  });

  const guestCounts = guests.reduce(
    (counts, guest) => {
      const isAssigned = Boolean(guest.table);
      const arrived = Boolean(guest.arrivalConfirmed);
      const rsvpStatus = guest.rsvpStatus || 'pending';
      counts.total += 1;
      counts.assigned += isAssigned ? 1 : 0;
      counts.unassigned += isAssigned ? 0 : 1;
      counts.arrived += arrived ? 1 : 0;
      counts.notArrived += arrived ? 0 : 1;
      counts.accepted += rsvpStatus === 'accepted' ? 1 : 0;
      counts.pending += rsvpStatus === 'pending' ? 1 : 0;
      counts.declined += rsvpStatus === 'declined' ? 1 : 0;
      counts.maybe += rsvpStatus === 'maybe' ? 1 : 0;
      return counts;
    },
    { total: 0, assigned: 0, unassigned: 0, arrived: 0, notArrived: 0, accepted: 0, pending: 0, declined: 0, maybe: 0 }
  );

  const notConfirmedGuests = visibleGuests.filter((guest) => guest.rsvpStatus !== 'accepted');
  const arrivalQueue = visibleGuests.filter((guest) => guest.rsvpStatus === 'accepted' && !guest.arrivalConfirmed);
  const recentArrivals = [...visibleGuests]
    .filter((guest) => guest.arrivalConfirmed)
    .sort((left, right) => new Date(right.arrivalTime || 0) - new Date(left.arrivalTime || 0))
    .slice(0, 8);
  const unassignedGuests = visibleGuests.filter((guest) => !guest.table);
  const assignedGuestsByGroup = groups.reduce((accumulator, group) => {
    accumulator[group.id] = guests.filter((guest) => guest.groupId === group.id);
    return accumulator;
  }, {});
  const liveMode = currentEvent.status === 'ongoing';
  const totalSeats = (currentEvent.hallLayout || []).reduce((sum, table) => sum + (table.seats?.length || 0), 0);
  const occupancyRate = totalSeats ? Math.round((guestCounts.assigned / totalSeats) * 100) : 0;
  const arrivalRate = guestCounts.accepted ? Math.round((guestCounts.arrived / guestCounts.accepted) * 100) : 0;
  const activityLog = (currentEvent.activityLog || []).slice(0, 14);

  return (
    <div className="event-detail">
      <button className="back-button" onClick={onBack}>← {t('Back to Events')}</button>

      <div className="hero-card event-hero-card">
        <div>
          <h2>{currentEvent.name}</h2>
          <p className="subtext">{currentEvent.location} · {new Date(currentEvent.date).toLocaleDateString()}</p>
          <p className={`status-pill ${currentEvent.status}`}>{t(currentEvent.status)}</p>
          {currentEvent.description ? <p className="luxury-description">{currentEvent.description}</p> : null}
          {currentEvent.capacity ? <p className="event-meta">{t('Capacity')}: {currentEvent.capacity}</p> : null}
          {currentEvent.startedAt ? <p className="event-meta">{t('Live since')}: {formatDateTime(currentEvent.startedAt)}</p> : null}
        </div>
        <div className="hero-actions event-hero-actions">
          {canManageEvents && !liveMode && currentEvent.status !== 'completed' ? (
            <button className="primary" onClick={handleStartEvent}>{t('Start Event')}</button>
          ) : null}
          {canManageEvents && liveMode ? (
            <button className="secondary" onClick={handleCompleteEvent}>{t('Complete Event')}</button>
          ) : null}
          {canViewReports ? <button className="secondary" onClick={handleExportNotConfirmed}>{t('Export Non Confirmed')}</button> : null}
          {canManageEvents ? <button className="secondary" onClick={() => setEditingEvent(!editingEvent)}>
            {editingEvent ? t('Cancel') : t('Edit Event')}
          </button> : null}
          {canManageEvents ? <button className="danger" onClick={handleDeleteEvent}>{t('Delete Event')}</button> : null}
          {canManageGuests ? <button onClick={() => { setShowGuestForm(!showGuestForm); setEditingGuest(null); setFormData({ name: '', surname: '', phone: '' }); }}>
            {showGuestForm ? t('Cancel') : '+ ' + t('Add Guest')}
          </button> : null}
        </div>
      </div>

      {liveMode ? (
        <section className="card luxury-card live-ops-card">
          <div className="section-header">
            <div>
              <h3>{t('Live Event Dashboard')}</h3>
              <span className="note">{t('Real-time operations, arrivals, confirmations, and action lists while the event is running.')}</span>
            </div>
            <div className="event-actions">
              <button className="secondary" onClick={handleOpenLiveMapWindow}>{t('Open Live Map Window')}</button>
              <button className="secondary" onClick={handleOpenEntranceWindow}>{t('Open Entrance Screen')}</button>
              <button className="secondary" onClick={handleOpenTvModeWindow}>{t('Open TV Mode')}</button>
              <button className="secondary" onClick={() => { fetchGuests(); fetchEventDetails(); }}>{t('Refresh Live Data')}</button>
            </div>
          </div>

          <div className="live-stats-grid">
            <div className="live-stat-card"><strong>{guestCounts.total}</strong><span>{t('Total Guests')}</span></div>
            <div className="live-stat-card success"><strong>{guestCounts.accepted}</strong><span>{t('Confirmed Attending')}</span></div>
            <div className="live-stat-card warning"><strong>{guestCounts.pending}</strong><span>{t('Pending RSVP')}</span></div>
            <div className="live-stat-card danger"><strong>{guestCounts.declined}</strong><span>{t('Declined Guests')}</span></div>
            <div className="live-stat-card info"><strong>{guestCounts.arrived}</strong><span>{t('Checked In')}</span></div>
            <div className="live-stat-card"><strong>{arrivalQueue.length}</strong><span>{t('Still Expected')}</span></div>
          </div>

          <div className="live-panels-grid">
            <div className="live-panel">
              <h4>{t('Arrival Queue')}</h4>
              {arrivalQueue.length ? (
                <ul className="live-list">
                  {arrivalQueue.slice(0, 12).map((guest) => (
                    <li key={guest._id}>
                      <div>
                        <strong>{guest.name} {guest.surname || ''}</strong>
                        <span>{guest.phone} · {guest.groupName || t('No Group')}</span>
                      </div>
                      <button onClick={() => handleMarkArrived(guest._id)}>{t('Mark Arrived')}</button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="note">{t('No guests are currently waiting for check-in.')}</p>
              )}
            </div>

            <div className="live-panel">
              <h4>{t('Recent Arrivals')}</h4>
              {recentArrivals.length ? (
                <ul className="live-list compact">
                  {recentArrivals.map((guest) => (
                    <li key={guest._id}>
                      <div>
                        <strong>{guest.name} {guest.surname || ''}</strong>
                        <span>{formatDateTime(guest.arrivalTime)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="note">{t('No arrivals have been recorded yet.')}</p>
              )}
            </div>

            <div className="live-panel">
              <h4>{t('Not Confirmed Yet')}</h4>
              {notConfirmedGuests.length ? (
                <ul className="live-list compact">
                  {notConfirmedGuests.slice(0, 12).map((guest) => (
                    <li key={guest._id}>
                      <div>
                        <strong>{guest.name} {guest.surname || ''}</strong>
                        <span>{guest.phone} · {t(guest.rsvpStatus || 'pending')}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="note">{t('All guests have confirmed attendance.')}</p>
              )}
            </div>

            <div className="live-panel">
              <h4>{t('Unassigned Seats')}</h4>
              {unassignedGuests.length ? (
                <ul className="live-list compact">
                  {unassignedGuests.slice(0, 12).map((guest) => (
                    <li key={guest._id}>
                      <div>
                        <strong>{guest.name} {guest.surname || ''}</strong>
                        <span>{guest.groupName || t('No Group')}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="note">{t('All guests have table assignments.')}</p>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <section className="card luxury-card operations-command-card">
        <div className="section-header">
          <div>
            <h3>{t('Operational Tools')}</h3>
            <span className="note">{t('Use quick seating, reports, and the activity timeline to manage the event day.')}</span>
          </div>
          <div className="event-actions">
            {canManageGuests ? <button className="secondary" onClick={handleSmartSeatByGroups}>{t('Smart Seat By Groups')}</button> : null}
            {canManageGuests ? <button className="secondary" onClick={handleFillEmptySeats}>{t('Fill Empty Seats')}</button> : null}
            {canViewReports ? <button className="secondary" onClick={handleOpenManagerReportWindow}>{t('Open Manager Report')}</button> : null}
            {canViewReports ? <button className="secondary" onClick={handleExportEventReport}>{t('Export Event Report')}</button> : null}
          </div>
        </div>

        <div className="live-panels-grid operations-grid">
          <div className="live-panel">
            <h4>{t('Reports Snapshot')}</h4>
            <div className="report-snapshot-grid">
              <div className="report-snapshot-card"><strong>{totalSeats}</strong><span>{t('Total Seats')}</span></div>
              <div className="report-snapshot-card"><strong>{occupancyRate}%</strong><span>{t('Occupancy Rate')}</span></div>
              <div className="report-snapshot-card"><strong>{arrivalRate}%</strong><span>{t('Arrival Rate')}</span></div>
              <div className="report-snapshot-card"><strong>{groups.length}</strong><span>{t('Guest Groups')}</span></div>
            </div>
          </div>

          <div className="live-panel">
            <h4>{t('Activity Log')}</h4>
            {activityLog.length ? (
              <ul className="activity-log-list">
                {activityLog.map((entry) => (
                  <li key={entry.id || `${entry.type}-${entry.createdAt}`}>
                    <div>
                      <strong>{entry.message}</strong>
                      <span>{entry.actor?.username || 'system'} · {formatDateTime(entry.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="note">{t('No activity recorded yet.')}</p>
            )}
          </div>
        </div>
      </section>

      {(canManageEvents || canManageGuests) ? (
        <section className="card luxury-card planning-assistant-card">
          <div className="section-header">
            <div>
              <h3>{t('AI Planning Assistant')}</h3>
              <span className="note">{t('Talk with the planning assistant to capture seating wishes, VIP needs, group requests, and special seating constraints.')}</span>
            </div>
            <div className="planning-toolbar">
              <label>
                <span>{t('Planning Language')}</span>
                <select value={planningLanguage} onChange={(changeEvent) => setPlanningLanguage(changeEvent.target.value)}>
                  <option value="he">{t('Hebrew')}</option>
                  <option value="en">{t('English')}</option>
                  <option value="ar">{t('Arabic')}</option>
                </select>
              </label>
              <button className="secondary" onClick={fetchPlanning}>{t('Refresh Planning Chat')}</button>
            </div>
          </div>

          <div className="planning-chat-log">
            {planningConversation.length ? [...planningConversation].reverse().map((entry) => (
              <article key={entry.id} className={`planning-message ${entry.role}`} dir={entry.language === 'ar' || entry.language === 'he' ? 'rtl' : 'ltr'}>
                <div className="planning-message-meta">
                  <strong>{entry.role === 'assistant' ? t('Planning Assistant') : t('You')}</strong>
                  <span>{(entry.language || planningLanguage).toUpperCase()}</span>
                </div>
                <p>{entry.text}</p>
                {entry.metadata?.signals?.length ? (
                  <div className="planning-signal-list">
                    {entry.metadata.signals.map((signal) => (
                      <span key={`${entry.id}-${signal}`} className="planning-signal-pill">{signal}</span>
                    ))}
                  </div>
                ) : null}
              </article>
            )) : (
              <div className="planning-empty-state">
                <p>{t('Start a planning conversation now. You can write in Hebrew, English, or Arabic, and the assistant will respond in the same language.')}</p>
                <p>{t('Try asking who should sit together, who should stay apart, who needs VIP seating, or who should sit near the entrance.')}</p>
              </div>
            )}
          </div>

          {(planningInsights.signals.length || planningInsights.guests.length) ? (
            <div className="planning-insights-panel">
              {planningInsights.signals.length ? (
                <div className="planning-insights-block">
                  <strong>{t('Detected Planning Signals')}</strong>
                  <div className="planning-signal-list">
                    {planningInsights.signals.map((signal) => (
                      <span key={`insight-${signal}`} className="planning-signal-pill">{signal}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {planningInsights.guests.length ? (
                <div className="planning-insights-block">
                  <strong>{t('Matched Guests')}</strong>
                  <div className="planning-match-list">
                    {planningInsights.guests.map((guest) => (
                      <span key={`guest-match-${guest.guestId}`} className="planning-match-pill">{guest.name}</span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <form className="planning-chat-form" onSubmit={handleSendPlanningMessage}>
            <textarea
              rows={4}
              value={planningInput}
              onChange={(changeEvent) => setPlanningInput(changeEvent.target.value)}
              placeholder={t('Ask the planning assistant about groups, priorities, VIP seating, accessibility, or table preferences...')}
              dir={planningLanguage === 'ar' || planningLanguage === 'he' ? 'rtl' : 'ltr'}
            />
            {isListening ? <div className="planning-listening-indicator">{t('Listening now...')} {liveTranscript || t('Speak freely and your words will be added to the message box.')} {pendingSpeechTextRef.current ? ` ${t('Transcript will be sent automatically after a short pause.')}` : ''}</div> : null}
            {!speechSupported ? <div className="planning-listening-indicator muted">{t('Microphone speech-to-text is available only in supported browsers such as Chrome or Edge.')}</div> : null}
            <div className="planning-chat-actions">
              {speechSupported ? (
                isListening ? (
                  <button type="button" className="secondary" onClick={handleStopListening}>{t('Stop Listening')}</button>
                ) : (
                  <button type="button" className="secondary" onClick={handleStartListening}>{t('Start Listening')}</button>
                )
              ) : null}
              <button type="submit" disabled={planningLoading}>{planningLoading ? t('Sending...') : t('Send To Assistant')}</button>
            </div>
          </form>
        </section>
      ) : null}

      {canManageEvents && editingEvent ? (
        <div className="card luxury-card event-edit-card">
          <h3>{t('Edit Event')}</h3>
          <form onSubmit={handleSaveEvent} className="event-form">
            <div className="form-grid">
              <label>
                {t('Event Name')} *
                <input value={eventForm.name} onChange={(e) => handleEventFieldChange('name', e.target.value)} required />
              </label>
              <label>
                {t('Date')}
                <input type="datetime-local" value={eventForm.date} onChange={(e) => handleEventFieldChange('date', e.target.value)} />
              </label>
              <label>
                {t('Location')}
                <input value={eventForm.location} onChange={(e) => handleEventFieldChange('location', e.target.value)} />
              </label>
              <label>
                {t('Capacity')}
                <input type="number" min="1" value={eventForm.capacity} onChange={(e) => handleEventFieldChange('capacity', e.target.value)} />
              </label>
              <label>
                {t('Status')}
                <select value={eventForm.status} onChange={(e) => handleEventFieldChange('status', e.target.value)}>
                  <option value="draft">{t('Draft')}</option>
                  <option value="scheduled">{t('Scheduled')}</option>
                  <option value="ongoing">{t('Ongoing')}</option>
                  <option value="completed">{t('Completed')}</option>
                  <option value="cancelled">{t('Cancelled')}</option>
                </select>
              </label>
              <label className="full-width">
                {t('Description')}
                <textarea value={eventForm.description} onChange={(e) => handleEventFieldChange('description', e.target.value)} />
              </label>
            </div>
            <div className="form-actions">
              <button type="submit">{t('Save Event')}</button>
            </div>
          </form>
        </div>
      ) : null}

      {message ? <p className={message.includes('✓') ? 'success' : 'error'}>{message}</p> : null}
      {loading ? <p className="info-text">{t('Loading guests...')}</p> : null}

      {canManageGuests && showGuestForm ? (
        <div className="card luxury-card guest-form-card">
          <h3>{editingGuest ? t('Edit Guest') : t('Add New Guest')}</h3>
          <form onSubmit={handleAddGuest} className="guest-form">
            <label>
              {t('First Name')} *
              <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="John" required />
            </label>
            <label>
              {t('Surname')}
              <input type="text" value={formData.surname} onChange={(e) => setFormData({ ...formData, surname: e.target.value })} placeholder="Doe" />
            </label>
            <label>
              {t('Phone Number')} *
              <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+1 234 567 8900" required />
            </label>
            <button type="submit">{editingGuest ? t('Update Guest') : t('Add Guest')}</button>
          </form>
        </div>
      ) : null}

      {canManageGuests ? <div className="split-grid event-tools-grid">
        <section className="card luxury-card">
          <div className="section-header">
            <h3>{t('Import Guests')}</h3>
            <button className="secondary" onClick={handleDownloadTemplate}>{t('Download Template')}</button>
          </div>
          <label className="file-upload">
            {t('Upload Guest List')}
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
          </label>
          {importMessage ? <p className="info-text">{importMessage}</p> : null}
          {importedGuests.length > 0 ? (
            <div className="import-preview">
              <p>{importedGuests.length} {t('guests ready to import')}</p>
              <button className="secondary" onClick={handleImportGuests}>{t('Import Guests')}</button>
            </div>
          ) : null}
        </section>

        <section className="card luxury-card guest-management-card">
          <div className="section-header">
            <div>
              <h3>{t('Guest Management')}</h3>
              <span className="note">{t('Manage guest information and seating assignments')}</span>
            </div>
          </div>

          <div className="guest-stats-row expanded">
            <div className="guest-stat assigned">{t('Assigned')}<br />{guestCounts.assigned}</div>
            <div className="guest-stat unassigned">{t('Unassigned')}<br />{guestCounts.unassigned}</div>
            <div className="guest-stat arrived">{t('Arrived')}<br />{guestCounts.arrived}</div>
            <div className="guest-stat not-arrived">{t('Not arrived')}<br />{guestCounts.notArrived}</div>
            <div className="guest-stat accepted">{t('Confirmed Attending')}<br />{guestCounts.accepted}</div>
            <div className="guest-stat pending">{t('Pending RSVP')}<br />{guestCounts.pending}</div>
          </div>

          <div className="guest-search">
            <input type="search" placeholder={t('Search guests...')} value={guestSearch} onChange={(e) => setGuestSearch(e.target.value)} />
            <label className="checkbox-row compact-toggle">
              <input type="checkbox" checked={showWalkInCompanions} onChange={(event) => setShowWalkInCompanions(event.target.checked)} />
              <span>{t('Show Walk-In Companions')}</span>
            </label>
          </div>

          <div className="guests-table-container">
            <table className="guests-table enhanced">
              <thead>
                <tr>
                  <th>{t('Name')}</th>
                  <th>{t('Phone')}</th>
                  <th>{t('Group')}</th>
                  <th>{t('Table')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredGuests.map((guest) => (
                  <tr key={guest._id}>
                    <td>
                      <input type="text" value={guest.name} onChange={(e) => handleGuestFieldChange(guest._id, 'name', e.target.value)} onBlur={() => handleSaveGuest(guest)} />
                      {guest.surname ? <small> {guest.surname}</small> : null}
                      {getWalkInPartyBadge(guest, t) ? <span className={`walk-in-role-pill ${guest.walkInPartyRole}`}>{getWalkInPartyBadge(guest, t)}</span> : null}
                    </td>
                    <td>
                      <input type="tel" value={guest.phone} onChange={(e) => handleGuestFieldChange(guest._id, 'phone', e.target.value)} onBlur={() => handleSaveGuest(guest)} />
                    </td>
                    <td>
                      <select value={guest.groupId || ''} onChange={(e) => handleAssignGuestToGroup(guest._id, e.target.value)}>
                        <option value="">{t('No Group')}</option>
                        {groups.map((group) => (
                          <option key={group.id} value={group.id}>{group.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input type="text" value={guest.table || ''} onChange={(e) => handleGuestFieldChange(guest._id, 'table', e.target.value)} onBlur={() => handleSaveGuest(guest)} placeholder={t('Not assigned')} />
                    </td>
                    <td>
                      <div className="guest-status-stack">
                        <span className={`status-pill ${guest.rsvpStatus || 'pending'}`}>{t(guest.rsvpStatus || 'pending')}</span>
                        <span className={`mini-pill ${guest.arrivalConfirmed ? 'arrived' : 'waiting'}`}>{guest.arrivalConfirmed ? t('Arrived') : t('Waiting Check-In')}</span>
                      </div>
                    </td>
                    <td className="actions-cell">
                      <button className="action-btn edit-btn" onClick={() => handleEditGuest(guest)} title={t('Edit guest')}>✏️</button>
                      <button className="action-btn secondary-btn" onClick={() => handleCopyRsvpLink(guest)} title={t('Copy RSVP Link')}>🔗</button>
                      <button className="action-btn whatsapp-btn" onClick={() => handleSendInvitation(guest._id)} title={t('Send invitation')}>📱</button>
                      {!guest.arrivalConfirmed ? <button className="action-btn confirm-btn" onClick={() => handleMarkArrived(guest._id)} title={t('Mark Arrived')}>✓</button> : null}
                      <button className="action-btn delete-btn" onClick={() => handleDeleteGuest(guest._id)} title={t('Delete guest')}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div> : null}

      {canManageGuests ? <section className="card luxury-card group-management-card">
        <div className="section-header">
          <div>
            <h3>{t('Guest Groups')}</h3>
            <span className="note">{t('Create groups and attach already-registered guests to them for live operations and reporting.')}</span>
          </div>
          <button type="button" onClick={handleSaveGroups} className="secondary">{t('Save Groups')}</button>
        </div>

        <form className="group-form" onSubmit={handleCreateGroup}>
          <div className="group-inputs">
            <label>
              {t('Group Name')}
              <input type="text" value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} placeholder="Family Smith" required />
            </label>
            <label>
              {t('Group Type')}
              <select value={groupForm.type} onChange={(e) => setGroupForm({ ...groupForm, type: e.target.value })}>
                <option value="family">{t('Family')}</option>
                <option value="friends">{t('Friends')}</option>
                <option value="work mates">{t('Work Mates')}</option>
                <option value="other">{t('Other')}</option>
              </select>
            </label>
            <label>
              {t('Number of Guests')}
              <input type="number" min="1" value={groupForm.numberOfGuests} onChange={(e) => setGroupForm({ ...groupForm, numberOfGuests: e.target.value })} />
            </label>
            <label>
              {t('Group Leader Name')}
              <input type="text" value={groupForm.leaderName} onChange={(e) => setGroupForm({ ...groupForm, leaderName: e.target.value })} placeholder="Jane Smith" />
            </label>
            <label>
              {t('Group Leader Phone')}
              <input type="tel" value={groupForm.leaderPhone} onChange={(e) => setGroupForm({ ...groupForm, leaderPhone: e.target.value })} />
            </label>
            <label className="full-width">
              {t('Notes')}
              <textarea value={groupForm.notes} onChange={(e) => setGroupForm({ ...groupForm, notes: e.target.value })} placeholder="Special requirements or notes..." />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit">{t('Create Group')}</button>
          </div>
        </form>

        <div className="group-list">
          {groups.map((group) => {
            const assignedGuests = assignedGuestsByGroup[group.id] || [];

            return (
              <div key={group.id} className="group-card">
                <div className="group-header">
                  <div>
                    <h4>{group.name}</h4>
                    <p className="group-meta">{t(group.type)} · {group.members.length + assignedGuests.length} {t('members')}</p>
                  </div>
                  <button className="delete-btn" onClick={() => handleRemoveGroup(group.id)} title={t('Delete group')}>🗑️</button>
                </div>

                {group.leaderName ? (
                  <div className="group-leader">
                    <strong>{t('Leader')}:</strong> {group.leaderName}
                    {group.leaderPhone ? <span> ({group.leaderPhone})</span> : null}
                  </div>
                ) : null}

                {assignedGuests.length ? (
                  <div className="assigned-group-guests">
                    <h5>{t('Registered Guests in Group')}</h5>
                    <div className="assigned-group-chips">
                      {assignedGuests.map((guest) => (
                        <span key={guest._id} className="assigned-group-chip">{guest.name} {guest.surname || ''}</span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {group.members.length > 0 ? (
                  <div className="group-members">
                    <h5>{t('Manual Members')}</h5>
                    <div className="group-members-table">
                      <table>
                        <thead>
                          <tr>
                            <th>{t('Name')}</th>
                            <th>{t('Phone')}</th>
                            <th>{t('Notes')}</th>
                            <th>{t('Actions')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.members.map((member, index) => (
                            <tr key={member.id || index}>
                              <td>{member.name} {member.surname}</td>
                              <td>{member.phone}</td>
                              <td>{member.notes}</td>
                              <td>
                                <button className="delete-btn" onClick={() => handleRemoveMemberFromGroup(group.id, index)} title={t('Remove member')}>✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                <form className="group-member-form" onSubmit={handleAddMemberToGroup}>
                  <div className="group-inputs">
                    <label>
                      {t('Member Name')}
                      <input type="text" value={selectedGroupForMember === group.id ? memberForm.name : ''} onFocus={() => setSelectedGroupForMember(group.id)} onChange={(e) => { setSelectedGroupForMember(group.id); setMemberForm({ ...memberForm, name: e.target.value }); }} placeholder="John Doe" required={selectedGroupForMember === group.id} />
                    </label>
                    <label>
                      {t('Phone')}
                      <input type="tel" value={selectedGroupForMember === group.id ? memberForm.phone : ''} onFocus={() => setSelectedGroupForMember(group.id)} onChange={(e) => { setSelectedGroupForMember(group.id); setMemberForm({ ...memberForm, phone: e.target.value }); }} required={selectedGroupForMember === group.id} />
                    </label>
                    <label>
                      {t('Notes')}
                      <input type="text" value={selectedGroupForMember === group.id ? memberForm.notes : ''} onFocus={() => setSelectedGroupForMember(group.id)} onChange={(e) => { setSelectedGroupForMember(group.id); setMemberForm({ ...memberForm, notes: e.target.value }); }} placeholder="Dietary restrictions, etc." />
                    </label>
                  </div>
                  <button type="submit" onClick={() => setSelectedGroupForMember(group.id)} className="secondary">{t('Add Member')}</button>
                </form>
              </div>
            );
          })}
        </div>
      </section> : null}
    </div>
  );
}

export default EventDetail;
