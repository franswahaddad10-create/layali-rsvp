const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const { protect, authorizePermissions } = require('../middleware/authMiddleware');

// Event routes
router.post('/', protect, authorizePermissions('manageEvents'), eventController.createEvent);
router.get('/', eventController.getAllEvents);
router.get('/serial/:serialNumber', eventController.getEventBySerial);
router.get('/:id/planning', protect, authorizePermissions('manageEvents', 'manageGuests'), eventController.getPlanningState);
router.post('/:id/planning/messages', protect, authorizePermissions('manageEvents', 'manageGuests'), eventController.sendPlanningMessage);
router.get('/:id', eventController.getEventById);
router.put('/:id', protect, authorizePermissions('manageEvents', 'editHallMap', 'manageMapLock'), eventController.updateEvent);
router.delete('/:id', protect, authorizePermissions('manageEvents'), eventController.deleteEvent);

module.exports = router;
