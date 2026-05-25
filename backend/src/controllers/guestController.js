const crypto = require('crypto');
const Guest = require('../models/Guest');
const Event = require('../models/Event');
const whatsappService = require('../services/whatsappService');
const { appendEventActivity, buildActorFromUser } = require('../utils/eventActivity');

const generateResponseToken = () => crypto.randomBytes(24).toString('hex');

const normalizeBaseUrl = (value) => value.replace(/\/$/, '');

const getPublicAppBaseUrl = (req) => {
  const configuredAppUrl = process.env.APP_URL?.trim();
  const origin = req.headers.origin?.trim();

  if (origin) {
    return normalizeBaseUrl(origin);
  }

  if (configuredAppUrl) {
    return normalizeBaseUrl(configuredAppUrl);
  }

  const host = req.headers['x-forwarded-host'] || req.get('host');
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;

  if (host) {
    const frontendHost = host.replace(/:\d+$/, ':7000');
    return `${protocol}://${frontendHost}`;
  }

  return 'http://localhost:7000';
};

const buildGuestRsvpLink = (req, guest) => `${getPublicAppBaseUrl(req)}/?rsvp=${guest.responseToken}`;

const normalizePhone = (value = '') => {
  const digits = String(value).replace(/\D/g, '');

  if (!digits) {
    return '';
  }

  if (digits.startsWith('972')) {
    return `0${digits.slice(3)}`;
  }

  return digits;
};

const getPhoneMatchPattern = (value = '') => {
  const normalized = normalizePhone(value);

  if (!normalized) {
    return null;
  }

  const significantDigits = normalized.slice(-9);
  return new RegExp(`${significantDigits}$`);
};

const parseIncomingRsvpStatus = (message = '') => {
  const normalized = String(message).trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  const acceptedValues = ['yes', 'y', 'arriving', 'coming', 'confirm', 'confirmed', 'accepted', '1', 'מגיע', 'מאשר', 'כן'];
  const declinedValues = ['no', 'n', 'decline', 'declined', 'not coming', 'cannot attend', '0', 'לא מגיע', 'לא', 'לאהגיע'];

  if (acceptedValues.includes(normalized)) {
    return 'accepted';
  }

  if (declinedValues.includes(normalized)) {
    return 'declined';
  }

  return null;
};

const buildTwilioXmlResponse = (message) => `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`;

const buildMetaIncomingResponse = () => 'EVENT_RECEIVED';

const ensureGuestResponseToken = async (guest) => {
  if (guest.responseToken) {
    return guest;
  }

  const responseToken = generateResponseToken();

  await Guest.updateOne(
    { _id: guest._id },
    { $set: { responseToken } },
    { runValidators: true }
  );

  guest.responseToken = responseToken;
  return guest;
};

const findGuestByIncomingPhone = async (incomingPhone) => {
  const phonePattern = getPhoneMatchPattern(incomingPhone);

  if (!phonePattern) {
    return null;
  }

  const guests = await Guest.find({ phone: { $regex: phonePattern } })
    .populate('event', 'name date')
    .sort({ updatedAt: -1 });

  return guests
    .filter((candidate) => candidate.event)
    .sort((left, right) => new Date(left.event.date || 0) - new Date(right.event.date || 0))[0] || null;
};

const applyIncomingRsvpResponse = async (incomingPhone, incomingMessage) => {
  const status = parseIncomingRsvpStatus(incomingMessage);

  if (!status) {
    return {
      success: false,
      type: 'invalid-message',
      message: 'Please reply with YES or NO. You can also reply in Hebrew: מגיע or לא מגיע.',
    };
  }

  const guest = await findGuestByIncomingPhone(incomingPhone);

  if (!guest) {
    return {
      success: false,
      type: 'guest-not-found',
      message: 'We could not match your RSVP to an invitation. Please contact the event organizer.',
    };
  }

  guest.rsvpStatus = status;
  await guest.save();

  return {
    success: true,
    type: 'updated',
    guest,
    status,
    message: status === 'accepted'
      ? `Thank you. Your RSVP for ${guest.event?.name || 'the event'} is marked as attending.`
      : `Thank you. Your RSVP for ${guest.event?.name || 'the event'} is marked as not attending.`,
  };
};

// Add guest to event
exports.addGuest = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { name, surname, email, phone, numberOfGuests, dietaryRestrictions, notes, table, seatNumber, groupId, groupName, walkInPartyRole } = req.body;

    // Verify event exists
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    const guest = new Guest({
      event: eventId,
      name,
      surname,
      email,
      phone,
      responseToken: generateResponseToken(),
      numberOfGuests,
      dietaryRestrictions,
      notes,
      groupId,
      groupName,
      walkInPartyRole,
      table,
      seatNumber,
    });

    await guest.save();

    // Add guest to event's guests array
    event.guests.push(guest._id);
    await event.save();

    res.status(201).json({ success: true, guest });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Get all guests for an event
exports.getEventGuests = async (req, res) => {
  try {
    const guests = await Guest.find({ event: req.params.eventId });

    const guestsMissingToken = guests.filter((guest) => !guest.responseToken);

    if (guestsMissingToken.length > 0) {
      await Promise.all(guestsMissingToken.map((guest) => ensureGuestResponseToken(guest)));
    }

    res.json({ success: true, guests });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getPublicRsvpInvitation = async (req, res) => {
  try {
    const guest = await Guest.findOne({ responseToken: req.params.token }).populate('event', 'name date location');

    if (!guest) {
      return res.status(404).json({ success: false, error: 'Invitation not found.' });
    }

    res.json({
      success: true,
      guest: {
        id: guest._id,
        name: guest.name,
        surname: guest.surname,
        rsvpStatus: guest.rsvpStatus,
        table: guest.table,
        seatNumber: guest.seatNumber,
        event: guest.event,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.submitPublicRsvp = async (req, res) => {
  try {
    const { status } = req.body;

    if (!['accepted', 'declined'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid RSVP status.' });
    }

    const guest = await Guest.findOne({ responseToken: req.params.token }).populate('event', 'name date location');

    if (!guest) {
      return res.status(404).json({ success: false, error: 'Invitation not found.' });
    }

    guest.rsvpStatus = status;
    await guest.save();

    res.json({
      success: true,
      guest: {
        id: guest._id,
        name: guest.name,
        surname: guest.surname,
        rsvpStatus: guest.rsvpStatus,
        table: guest.table,
        seatNumber: guest.seatNumber,
        event: guest.event,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Send invitation via WhatsApp
exports.sendInvitation = async (req, res) => {
  try {
    const { guestId } = req.params;
    const guest = await Guest.findById(guestId).populate('event');

    if (!guest) {
      return res.status(404).json({ success: false, error: 'Guest not found' });
    }

    await ensureGuestResponseToken(guest);

    const rsvpLink = buildGuestRsvpLink(req, guest);
    const replyMode = process.env.TWILIO_RSVP_MODE === 'reply';

    const result = await whatsappService.sendInvitation(guest, guest.event, {
      rsvpLink: replyMode ? null : rsvpLink,
      replyMode,
    });

    if (!result.success) {
      return res.status(502).json({ success: false, error: result.error || 'Failed to send WhatsApp invitation.' });
    }

    guest.messagesSent.push({ type: 'invitation', status: 'sent' });
    await guest.save();

    res.json({ success: result.success, result, rsvpLink });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.handleIncomingWhatsapp = async (req, res) => {
  try {
    const incomingPhone = req.body?.From || '';
    const incomingMessage = req.body?.Body || '';
    const result = await applyIncomingRsvpResponse(incomingPhone, incomingMessage);
    return res.status(200).type('text/xml').send(buildTwilioXmlResponse(result.message));
  } catch (error) {
    return res
      .status(200)
      .type('text/xml')
      .send(buildTwilioXmlResponse('We could not process your RSVP right now. Please try again later.'));
  }
};

exports.verifyMetaWebhook = async (req, res) => {
  const mode = req.query['hub.mode'];
  const verifyToken = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && verifyToken === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
};

exports.handleIncomingMetaWhatsapp = async (req, res) => {
  try {
    const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];

      for (const change of changes) {
        const messages = Array.isArray(change?.value?.messages) ? change.value.messages : [];

        for (const message of messages) {
          const incomingPhone = message?.from || '';
          const incomingText = message?.text?.body || '';

          if (incomingPhone && incomingText) {
            await applyIncomingRsvpResponse(incomingPhone, incomingText);
          }
        }
      }
    }

    return res.status(200).send(buildMetaIncomingResponse());
  } catch (error) {
    return res.status(200).send(buildMetaIncomingResponse());
  }
};

// Send arrival confirmation message
exports.sendArrivalConfirmation = async (req, res) => {
  try {
    const { guestId } = req.params;
    const guest = await Guest.findById(guestId).populate('event');

    if (!guest) {
      return res.status(404).json({ success: false, error: 'Guest not found' });
    }

    const result = await whatsappService.sendArrivalConfirmation(guest, guest.event);

    if (!result.success) {
      return res.status(502).json({ success: false, error: result.error || 'Failed to send WhatsApp confirmation.' });
    }

    guest.messagesSent.push({ type: 'confirmation', status: 'sent' });
    await guest.save();

    res.json({ success: result.success, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update RSVP status
exports.updateRsvpStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const guest = await Guest.findByIdAndUpdate(
      req.params.guestId,
      { rsvpStatus: status },
      { new: true }
    );

    res.json({ success: true, guest });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Update guest assignment fields
exports.updateGuest = async (req, res) => {
  try {
    const payload = req.body;
    const payloadKeys = Object.keys(payload || {});
    const assignmentOnlyFields = ['table', 'seatNumber'];
    const isAssignmentOnly = payloadKeys.length > 0 && payloadKeys.every((key) => assignmentOnlyFields.includes(key));

    if (isAssignmentOnly && !req.user?.hasPermission('assignGuests') && !req.user?.hasPermission('manageGuests') && !req.user?.hasPermission('escortGuests')) {
      return res.status(403).json({ success: false, error: 'You do not have permission to assign guests.' });
    }

    const entranceSafeFields = ['rsvpStatus', 'notes', 'table', 'seatNumber', 'groupId', 'groupName'];
    const isEntranceSafeUpdate = payloadKeys.length > 0 && payloadKeys.every((key) => entranceSafeFields.includes(key));

    if (!isAssignmentOnly && !isEntranceSafeUpdate && !req.user?.hasPermission('manageGuests')) {
      return res.status(403).json({ success: false, error: 'You do not have permission to edit guest details.' });
    }

    if (isEntranceSafeUpdate && !req.user?.hasPermission('manageGuests') && !req.user?.hasPermission('manageEntrance') && !req.user?.hasPermission('escortGuests')) {
      return res.status(403).json({ success: false, error: 'You do not have permission to update guest status from entrance operations.' });
    }

    const currentGuest = await Guest.findById(req.params.guestId);
    if (!currentGuest) {
      return res.status(404).json({ success: false, error: 'Guest not found' });
    }

    const guest = await Guest.findByIdAndUpdate(req.params.guestId, payload, { new: true, runValidators: true });

    const actor = buildActorFromUser(req.user);
    const activityEntries = [];

    const tableChanged = Object.prototype.hasOwnProperty.call(payload, 'table') || Object.prototype.hasOwnProperty.call(payload, 'seatNumber');
    if (tableChanged && (payload.table !== currentGuest.table || payload.seatNumber !== currentGuest.seatNumber)) {
      const seatLabel = payload.seatNumber || 'unassigned';
      const tableLabel = payload.table || 'unassigned';
      activityEntries.push({
        type: 'guest-seated',
        message: `${guest.name} ${guest.surname || ''} was assigned to ${tableLabel} / ${seatLabel}.`.trim(),
        actor,
        metadata: { guestId: String(guest._id), table: payload.table || '', seatNumber: payload.seatNumber || '' },
      });
    }

    if ((Object.prototype.hasOwnProperty.call(payload, 'groupId') || Object.prototype.hasOwnProperty.call(payload, 'groupName')) && (payload.groupId !== currentGuest.groupId || payload.groupName !== currentGuest.groupName)) {
      activityEntries.push({
        type: 'guest-group',
        message: payload.groupName ? `${guest.name} ${guest.surname || ''} joined group ${payload.groupName}.`.trim() : `${guest.name} ${guest.surname || ''} was removed from a group.`.trim(),
        actor,
        metadata: { guestId: String(guest._id), groupId: payload.groupId || '', groupName: payload.groupName || '' },
      });
    }

    if (activityEntries.length > 0) {
      await Promise.all(activityEntries.map((entry) => appendEventActivity(guest.event, entry)));
    }

    res.json({ success: true, guest });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Confirm arrival
exports.confirmArrival = async (req, res) => {
  try {
    const currentGuest = await Guest.findById(req.params.guestId);
    if (!currentGuest) {
      return res.status(404).json({ success: false, error: 'Guest not found' });
    }

    const guest = await Guest.findByIdAndUpdate(
      req.params.guestId,
      { arrivalConfirmed: true, arrivalTime: new Date() },
      { new: true }
    );

    if (!currentGuest.arrivalConfirmed) {
      await appendEventActivity(guest.event, {
        type: 'guest-arrived',
        message: `${guest.name} ${guest.surname || ''} checked in at the event.`.trim(),
        actor: buildActorFromUser(req.user),
        metadata: {
          guestId: String(guest._id),
          table: guest.table || '',
          seatNumber: guest.seatNumber || '',
        },
      });
    }

    res.json({ success: true, guest });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Delete guest
exports.deleteGuest = async (req, res) => {
  try {
    const guest = await Guest.findById(req.params.guestId);
    if (!guest) {
      return res.status(404).json({ success: false, error: 'Guest not found' });
    }

    // Remove from event's guests array
    await Event.findByIdAndUpdate(guest.event, { $pull: { guests: req.params.guestId } });

    // Delete the guest
    await Guest.findByIdAndDelete(req.params.guestId);

    res.json({ success: true, message: 'Guest deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
