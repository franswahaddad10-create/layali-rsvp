const Event = require('../models/Event');

const MAX_ACTIVITY_ENTRIES = 120;

const createActivityId = () => `activity-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const buildActorFromUser = (user) => ({
  id: user?._id ? String(user._id) : '',
  username: user?.username || 'system',
  role: user?.role || '',
});

const appendEventActivity = async (eventId, entry = {}) => {
  if (!eventId || !entry.message) {
    return null;
  }

  const normalizedEntry = {
    id: createActivityId(),
    type: entry.type || 'note',
    message: entry.message,
    actor: entry.actor || { username: 'system', role: '' },
    metadata: entry.metadata || {},
    createdAt: entry.createdAt || new Date(),
  };

  await Event.findByIdAndUpdate(
    eventId,
    {
      $push: {
        activityLog: {
          $each: [normalizedEntry],
          $position: 0,
          $slice: MAX_ACTIVITY_ENTRIES,
        },
      },
    },
    { new: false }
  );

  return normalizedEntry;
};

module.exports = {
  appendEventActivity,
  buildActorFromUser,
};