# RSVP Event Management App Setup

- [x] Verify copilot-instructions.md created
- [x] Scaffold the Project
- [x] Customize for RSVP features
- [x] Install dependencies
- [x] Create and run tasks
- [x] Configure MongoDB database
- [x] Brand Logo Selection (Layali Art Deco - v5-02)
- [x] Configure WhatsApp integration
- [ ] Compile and test
- [ ] Documentation complete

This is a full-stack RSVP event management application with:
- Backend: Node.js + Express API (PORT 5000)
- Frontend: React web app (PORT 3000)
- Database: MongoDB (needs setup)
- Messaging: WhatsApp Business API integration for guest notifications

## Current Status

🟢 RUNNING:
- ✓ Backend API: http://localhost:5000
- ✓ Frontend: http://localhost:3000
- ✓ All dependencies installed
- ✓ MongoDB: Connected (localhost:27017)
- ✓ Logo: Layali Art Deco (v5-02) Selected
- ✓ WhatsApp: Configured with Twilio (+972557276178)

## Next Steps

### 1. Setup MongoDB
Option A - Local MongoDB:
```bash
# Download from https://www.mongodb.com/try/download/community
# Install and start MongoDB service
# Default: mongodb://localhost:27017
```

Option B - MongoDB Atlas (Cloud):
1. Create account at https://www.mongodb.com/cloud/atlas
2. Create a cluster (free tier available)
3. Get connection string
4. Update MONGODB_URI in `backend/.env`:
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/rsvp_app
```

### 2. Configure Twilio for WhatsApp
1. Create account at https://www.twilio.com
2. Get WhatsApp Sandbox number
3. Add your phone to sandbox
4. Update in `backend/.env`:
```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_WHATSAPP_NUMBER=whatsapp:+1234567890
```

### 3. Run the servers
From the repo root in two terminals:

Terminal 1 (backend):
```powershell
cd d:\tfadl\backend
npm start
```

Terminal 2 (frontend):
```powershell
cd d:\tfadl\frontend
$env:DANGEROUSLY_DISABLE_HOST_CHECK='true'
npm start
```

Optionally, for desktop app:
```powershell
cd d:\tfadl\desktop
npm start
```

The backend will automatically detect when valid credentials are added.

## API Endpoints Available
- POST /api/events - Create event
- GET /api/events - Get all events
- GET /api/events/:id - Get event details
- POST /api/guests/:eventId/guests - Add guest
- GET /api/guests/:eventId/guests - Get guests
- POST /api/guests/:guestId/send-invitation - Send WhatsApp invite
- POST /api/guests/:guestId/send-arrival-confirmation - Send WhatsApp confirmation
