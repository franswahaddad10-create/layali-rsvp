import axios from 'axios';

const normalizeBaseUrl = (value) => value.replace(/\/$/, '');

const getDefaultApiBaseUrl = () => {
  if (typeof window === 'undefined') {
    return '/api';
  }

  const { protocol, hostname } = window.location;

  if (protocol === 'file:') {
    return 'http://127.0.0.1:5000/api';
  }

  if (['localhost', '127.0.0.1'].includes(hostname)) {
    return '/api';
  }

  return `${protocol}//${hostname}:5000/api`;
};

const resolveApiBaseUrl = () => {
  const desktopApiBaseUrl = typeof window !== 'undefined' ? window.desktopApp?.apiBaseUrl?.trim() : '';
  const envBaseUrl = process.env.REACT_APP_API_URL?.trim();

  // In production, always prioritize the environment variable
  if (process.env.NODE_ENV === 'production' && envBaseUrl) {
    return normalizeBaseUrl(envBaseUrl);
  }

  if (desktopApiBaseUrl) {
    return normalizeBaseUrl(desktopApiBaseUrl);
  }

  if (!envBaseUrl) {
    return getDefaultApiBaseUrl();
  }

  if (typeof window === 'undefined') {
    return normalizeBaseUrl(envBaseUrl);
  }

  if (envBaseUrl.startsWith('/')) {
    if (!['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      return normalizeBaseUrl(`${window.location.protocol}//${window.location.hostname}:5000${envBaseUrl}`);
    }

    return normalizeBaseUrl(envBaseUrl);
  }

  try {
    const resolvedUrl = new URL(envBaseUrl);
    const isLocalhostTarget = ['localhost', '127.0.0.1'].includes(resolvedUrl.hostname);
    const isRemoteClient = !['localhost', '127.0.0.1'].includes(window.location.hostname);

    if (isLocalhostTarget && isRemoteClient) {
      resolvedUrl.hostname = window.location.hostname;
    }

    return normalizeBaseUrl(resolvedUrl.toString());
  } catch (error) {
    return normalizeBaseUrl(envBaseUrl);
  }
};

const API_BASE_URL = resolveApiBaseUrl();

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('backendToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Authentication API calls
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  getCurrentUser: () => api.get('/auth/me'),
  getUsers: () => api.get('/auth/users'),
  createUser: (data) => api.post('/auth/users', data),
  updateUser: (id, data) => api.put(`/auth/users/${id}`, data),
  deleteUser: (id) => api.delete(`/auth/users/${id}`),
};

// Event API calls
export const eventAPI = {
  getAllEvents: () => api.get('/events'),
  getEventById: (id) => api.get(`/events/${id}`),
  getEventBySerial: (serialNumber) => api.get(`/events/serial/${serialNumber}`),
  getPlanning: (id) => api.get(`/events/${id}/planning`),
  sendPlanningMessage: (id, data) => api.post(`/events/${id}/planning/messages`, data),
  createEvent: (data) => api.post('/events', data),
  updateEvent: (id, data) => api.put(`/events/${id}`, data),
  deleteEvent: (id) => api.delete(`/events/${id}`),
};

// Guest API calls
export const guestAPI = {
  addGuest: (eventId, data) => api.post(`/guests/${eventId}/guests`, data),
  getEventGuests: (eventId) => api.get(`/guests/${eventId}/guests`),
  sendInvitation: (guestId) => api.post(`/guests/${guestId}/send-invitation`),
  sendArrivalConfirmation: (guestId) => api.post(`/guests/${guestId}/send-arrival-confirmation`),
  updateGuest: (guestId, data) => api.put(`/guests/${guestId}`, data),
  deleteGuest: (guestId) => api.delete(`/guests/${guestId}`),
  updateRsvpStatus: (guestId, status) => api.put(`/guests/${guestId}/rsvp`, { status }),
  confirmArrival: (guestId) => api.put(`/guests/${guestId}/confirm-arrival`),
};

export const publicGuestAPI = {
  getInvitation: (token) => api.get(`/guests/rsvp/${token}`),
  submitRsvp: (token, status) => api.post(`/guests/rsvp/${token}`, { status }),
};

export default api;
