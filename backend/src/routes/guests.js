const express = require('express');
const router = express.Router();
const guestController = require('../controllers/guestController');
const { protect, authorizePermissions } = require('../middleware/authMiddleware');
const { publicRsvpLimiter, webhookLimiter } = require('../config/security');

router.get('/rsvp/:token', publicRsvpLimiter, guestController.getPublicRsvpInvitation);
router.post('/rsvp/:token', publicRsvpLimiter, guestController.submitPublicRsvp);
router.post('/whatsapp/incoming', webhookLimiter, guestController.handleIncomingWhatsapp);
router.get('/whatsapp/meta/webhook', guestController.verifyMetaWebhook);
router.post('/whatsapp/meta/webhook', webhookLimiter, guestController.handleIncomingMetaWhatsapp);

// Guest routes
router.post('/:eventId/guests', protect, authorizePermissions('manageGuests', 'manageEntrance'), guestController.addGuest);
router.get('/:eventId/guests', protect, authorizePermissions('manageGuests', 'assignGuests', 'manageEntrance', 'escortGuests', 'viewReports'), guestController.getEventGuests);
router.post('/:guestId/send-invitation', protect, authorizePermissions('manageGuests'), guestController.sendInvitation);
router.post('/:guestId/send-arrival-confirmation', protect, authorizePermissions('manageGuests'), guestController.sendArrivalConfirmation);
router.put('/:guestId', protect, authorizePermissions('manageGuests', 'assignGuests', 'escortGuests'), guestController.updateGuest);
router.put('/:guestId/rsvp', protect, authorizePermissions('manageGuests', 'manageEntrance', 'escortGuests'), guestController.updateRsvpStatus);
router.put('/:guestId/confirm-arrival', protect, authorizePermissions('manageGuests', 'assignGuests', 'manageEntrance', 'escortGuests'), guestController.confirmArrival);
router.delete('/:guestId', protect, authorizePermissions('manageGuests'), guestController.deleteGuest);

module.exports = router;
