const CHANNEL_NAME = 'rsvp-live-event-sync';
const STORAGE_KEY = 'rsvp-live-event-sync';

let channel = null;

const getChannel = () => {
  if (typeof window === 'undefined' || typeof window.BroadcastChannel === 'undefined') {
    return null;
  }

  if (!channel) {
    channel = new window.BroadcastChannel(CHANNEL_NAME);
  }

  return channel;
};

export const emitLiveEventUpdate = (eventId, type = 'refresh', details = {}) => {
  if (!eventId || typeof window === 'undefined') {
    return;
  }

  const payload = {
    eventId,
    type,
    timestamp: Date.now(),
    ...details,
  };

  const nextValue = JSON.stringify(payload);
  window.localStorage.setItem(STORAGE_KEY, nextValue);

  const activeChannel = getChannel();
  if (activeChannel) {
    activeChannel.postMessage(payload);
  }
};

export const subscribeToLiveEventUpdates = (eventId, onUpdate) => {
  if (!eventId || typeof window === 'undefined') {
    return () => {};
  }

  const handlePayload = (payload) => {
    if (!payload || payload.eventId !== eventId) {
      return;
    }

    onUpdate(payload);
  };

  const handleStorage = (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) {
      return;
    }

    try {
      handlePayload(JSON.parse(event.newValue));
    } catch {
      // Ignore malformed sync events.
    }
  };

  window.addEventListener('storage', handleStorage);

  const activeChannel = getChannel();
  let handleChannel = null;

  if (activeChannel) {
    handleChannel = (event) => handlePayload(event.data);
    activeChannel.addEventListener('message', handleChannel);
  }

  return () => {
    window.removeEventListener('storage', handleStorage);
    if (activeChannel && handleChannel) {
      activeChannel.removeEventListener('message', handleChannel);
    }
  };
};
