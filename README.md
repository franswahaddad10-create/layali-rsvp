# RSVP Event Management App

A full-stack application for managing events and guest RSVPs with WhatsApp notifications.

## Features

✅ **Event Management** - Create and manage events  
✅ **Guest Management** - Add guests and track RSVPs  
✅ **WhatsApp Integration** - Send invitations and arrival confirmations via WhatsApp  
✅ **Excel/CSV Guest Import** - Upload guest lists for rapid invite management  
✅ **Hall Layout Designer** - Build movable team tables and optimize floor flow  
✅ **Luxury Event Builder** - Create premium event setups with guest capacity and rich details  
✅ **Arrival Tracking** - Track guest arrivals in real-time  
✅ **Guest History** - View message history for each guest  

## Tech Stack

- **Backend:** Node.js, Express, MongoDB
- **Frontend:** React
- **Messaging:** WhatsApp Business API (Twilio)
- **Database:** MongoDB

## Project Structure

```
├── backend/
│   ├── src/
│   │   ├── config/        # Database configuration
│   │   ├── controllers/   # Route controllers
│   │   ├── models/        # MongoDB schemas
│   │   ├── routes/        # API routes
│   │   ├── services/      # Business logic (WhatsApp service)
│   │   └── server.js      # Express server
│   ├── .env.example       # Environment variables template
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # React pages
│   │   ├── services/      # API service calls
│   │   ├── App.js         # Main app component
│   │   └── App.css        # Styles
│   ├── public/
│   ├── .env.example
│   └── package.json
└── README.md
```

## Setup Instructions

### Prerequisites
- Node.js (v14+)
- MongoDB (local or cloud)
- Twilio account for WhatsApp API (free tier available)

### Backend Setup

1. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your:
   - MongoDB URI
   - Twilio Account SID & Auth Token
   - Twilio WhatsApp Number

3. **Start the backend:**
   ```bash
   npm run dev
   ```
   Backend runs on `http://localhost:5000`

### Frontend Setup

1. **Install dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```

3. **Start the frontend:**
   ```bash
   npm start
   ```
   Frontend runs on `http://localhost:7000`

## API Endpoints

### Events
- `POST /api/events` - Create event
- `GET /api/events` - Get all events
- `GET /api/events/:id` - Get event details
- `PUT /api/events/:id` - Update event
- `DELETE /api/events/:id` - Delete event

### Guests
- `POST /api/guests/:eventId/guests` - Add guest
- `GET /api/guests/:eventId/guests` - Get event guests
- `POST /api/guests/:guestId/send-invitation` - Send invitation
- `POST /api/guests/:guestId/send-arrival-confirmation` - Send confirmation
- `PUT /api/guests/:guestId/rsvp` - Update RSVP status
- `PUT /api/guests/:guestId/confirm-arrival` - Confirm arrival

## WhatsApp Integration

The app uses **Twilio** to send WhatsApp messages:

1. **Create a Twilio account** (free tier available)
2. **Get WhatsApp Sandbox Number** from Twilio Console
3. **Add your number** to the WhatsApp sandbox
4. **Configure credentials** in `.env`

Messages sent:
- 📧 **Invitation** - Guest invitation with event details
- 🎉 **Arrival Confirmation** - Confirmation request for event arrival
- 📄 **Excel Guest Import** - Upload guest lists from Excel/CSV
- 🗺️ **Hall Layout Designer** - Visual table placement and team-friendly setup

## Development

### Running in Development Mode
- Backend: `npm run dev` (with auto-reload)
- Frontend: `npm start` (with hot reload)

### Building for Production
```bash
# Backend - runs via `npm start`

# Frontend
cd frontend
npm run build
```

## Desktop App

The project can also run as a Windows desktop app using Electron.

### Desktop Setup
```bash
cd desktop
npm install
```

### Run Desktop App
```bash
cd desktop
npm start
```

This desktop mode:
- builds the frontend automatically
- starts the backend inside the desktop app
- opens the system in a native desktop window

### Build Windows Installer
```bash
cd desktop
npm run dist
```

This creates a Windows installer under [desktop/dist](desktop/dist).

## Remote Access Note

The desktop app runs on the local computer. By itself, this does not make the system reachable from anywhere in Israel or from outside the local network.

For real remote access, you still need one of these:
- deploy the backend and frontend to a cloud server
- connect through a VPN such as Tailscale or ZeroTier
- expose the machine securely through a reverse proxy and domain, with proper firewall and TLS setup

The desktop app solves local installation and native app usage. Remote connectivity is a separate infrastructure step.

## Troubleshooting

### MongoDB Connection Error
- Ensure MongoDB is running locally or update `MONGODB_URI` in `.env`

### WhatsApp Messages Not Sending
- Verify Twilio credentials in `.env`
- Check phone numbers are in international format: `+1234567890`
- Ensure sender and recipient are added to WhatsApp Sandbox

### CORS Issues
- Backend CORS is configured for `http://localhost:7000`
- For production, update CORS origins in `backend/src/server.js`

## Future Enhancements

- 📧 Email notifications
- 🔔 Push notifications
- 📊 Event analytics & reports
- 🎟️ Ticket generation
- 💳 Payment integration
- 🌐 Multi-language support

## License

MIT License

---

**Questions?** Check the code comments or refer to the API documentation.
