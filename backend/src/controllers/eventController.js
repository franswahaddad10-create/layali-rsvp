const Event = require('../models/Event');
const Guest = require('../models/Guest');
const { appendEventActivity, buildActorFromUser } = require('../utils/eventActivity');
const { buildPlanningAssistantReply, createPlanningMessageId, detectLanguage } = require('../services/aiPlanningService');

// Generate unique serial number
const generateSerialNumber = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${timestamp}${random}`;
};

// Create event
exports.createEvent = async (req, res) => {
  try {
    const { name, description, date, location, organizer, capacity } = req.body;

    const event = new Event({
      name,
      description,
      date,
      location,
      organizer,
      capacity,
      serialNumber: generateSerialNumber(),
    });

    await event.save();
    res.status(201).json({ success: true, event });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Get all events
exports.getAllEvents = async (req, res) => {
  try {
    const events = await Event.find().populate('guests');
    res.json({ success: true, events });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get event by ID
exports.getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).populate('guests');
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }
    res.json({ success: true, event });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get event by serial number
exports.getEventBySerial = async (req, res) => {
  try {
    const { serialNumber } = req.params;
    const event = await Event.findOne({ serialNumber }).populate('guests');
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }
    res.json({ success: true, event });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update event
exports.updateEvent = async (req, res) => {
  try {
    const currentEvent = await Event.findById(req.params.id);
    if (!currentEvent) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    const hallFields = ['hallLayout', 'hallElements', 'customColors', 'hallScanReference', 'mapLocked'];
    const isHallUpdate = hallFields.some((field) => Object.prototype.hasOwnProperty.call(req.body, field));

    if (isHallUpdate && !req.user?.hasPermission('editHallMap') && !req.user?.hasPermission('manageMapLock')) {
      return res.status(403).json({ success: false, error: 'You do not have permission to edit the hall map.' });
    }

    if (currentEvent.mapLocked && isHallUpdate && !req.user?.hasPermission('manageMapLock')) {
      return res.status(403).json({ success: false, error: 'Hall map is locked. Only authorized users can change it.' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'mapLocked') && !req.user?.hasPermission('manageMapLock')) {
      return res.status(403).json({ success: false, error: 'Only authorized users can lock or unlock the hall map.' });
    }

    const updatePayload = { ...req.body };
    const customActivityEntry = updatePayload.activityEntry;
    delete updatePayload.activityEntry;

    if (updatePayload.status === 'ongoing' && !currentEvent.startedAt && !updatePayload.startedAt) {
      updatePayload.startedAt = new Date();
    }

    if (updatePayload.status === 'completed' && !currentEvent.completedAt && !updatePayload.completedAt) {
      updatePayload.completedAt = new Date();
    }

    const event = await Event.findByIdAndUpdate(req.params.id, updatePayload, {
      new: true,
      runValidators: true,
    }).populate('guests');

    const actor = buildActorFromUser(req.user);
    const activityEntries = [];

    if (Object.prototype.hasOwnProperty.call(updatePayload, 'status') && updatePayload.status !== currentEvent.status) {
      if (updatePayload.status === 'ongoing') {
        activityEntries.push({ type: 'event-started', message: `Event moved to live mode.`, actor });
      } else if (updatePayload.status === 'completed') {
        activityEntries.push({ type: 'event-completed', message: `Event marked as completed.`, actor });
      } else {
        activityEntries.push({ type: 'event-status', message: `Event status changed to ${updatePayload.status}.`, actor });
      }
    }

    if (Object.prototype.hasOwnProperty.call(updatePayload, 'groups')) {
      activityEntries.push({ type: 'groups-updated', message: 'Guest groups were updated.', actor });
    }

    if (hallFields.some((field) => Object.prototype.hasOwnProperty.call(updatePayload, field) && field !== 'mapLocked')) {
      activityEntries.push({ type: 'hall-updated', message: 'Hall layout was updated.', actor });
    }

    if (Object.prototype.hasOwnProperty.call(updatePayload, 'mapLocked') && updatePayload.mapLocked !== currentEvent.mapLocked) {
      activityEntries.push({
        type: updatePayload.mapLocked ? 'map-locked' : 'map-unlocked',
        message: updatePayload.mapLocked ? 'Hall map was locked.' : 'Hall map was unlocked.',
        actor,
      });
    }

    if (customActivityEntry?.message) {
      activityEntries.push({
        ...customActivityEntry,
        actor,
      });
    }

    if (activityEntries.length > 0) {
      await Promise.all(activityEntries.map((entry) => appendEventActivity(req.params.id, entry)));
      const refreshedEvent = await Event.findById(req.params.id).populate('guests');
      return res.json({ success: true, event: refreshedEvent });
    }

    res.json({ success: true, event });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Delete event
exports.deleteEvent = async (req, res) => {
  try {
    await Event.findByIdAndDelete(req.params.id);
    await Guest.deleteMany({ event: req.params.id });
    res.json({ success: true, message: 'Event deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getPlanningState = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).select('name groups hallLayout planningConversation planningMetadata');
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    const guestCount = await Guest.countDocuments({ event: req.params.id });

    res.json({
      success: true,
      planning: {
        conversation: event.planningConversation || [],
        metadata: event.planningMetadata || { preferredLanguage: 'he' },
        stats: {
          guests: guestCount,
          groups: (event.groups || []).length,
          tables: (event.hallLayout || []).length,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.sendPlanningMessage = async (req, res) => {
  try {
    const { text, language, source } = req.body;
    if (!text || !String(text).trim()) {
      return res.status(400).json({ success: false, error: 'Planning message text is required.' });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    const guests = await Guest.find({ event: req.params.id }).select('name surname phone groupId groupName table seatNumber');
    const preferredLanguage = language || event.planningMetadata?.preferredLanguage || 'he';
    const normalizedLanguage = detectLanguage(text, preferredLanguage);

    const userMessage = {
      id: createPlanningMessageId('user'),
      role: 'user',
      language: normalizedLanguage,
      text: String(text).trim(),
      metadata: {
        source: source || 'text',
      },
      createdAt: new Date(),
    };

    const assistantReply = buildPlanningAssistantReply({
      text: userMessage.text,
      preferredLanguage: normalizedLanguage,
      event,
      guests,
    });

    const assistantMessage = {
      id: createPlanningMessageId('assistant'),
      role: 'assistant',
      language: assistantReply.language,
      text: assistantReply.text,
      metadata: assistantReply.metadata || {},
      createdAt: new Date(),
    };

    event.planningConversation = [assistantMessage, userMessage, ...(event.planningConversation || [])].slice(0, 80);
    event.planningMetadata = {
      ...(event.planningMetadata || {}),
      preferredLanguage: assistantReply.language,
      lastAssistantReplyAt: new Date(),
      lastDetectedSignals: assistantReply.metadata?.signals || [],
      lastMatchedGuests: assistantReply.metadata?.guestMatches || [],
    };

    await event.save();

    await appendEventActivity(req.params.id, {
      type: 'planning-message',
      message: 'AI planning assistant conversation updated.',
      actor: buildActorFromUser(req.user),
      metadata: {
        language: assistantReply.language,
        signals: assistantReply.metadata?.signals || [],
        source: source || 'text',
      },
    });

    res.json({
      success: true,
      planning: {
        conversation: event.planningConversation,
        metadata: event.planningMetadata,
      },
      reply: assistantMessage,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
