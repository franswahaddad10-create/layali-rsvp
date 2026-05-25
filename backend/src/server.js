const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const connectDB = require('./config/database');
const { buildCorsOptions, isSeedAdminEnabled, validateSecurityConfig } = require('./config/security');

// Import routes
const eventRoutes = require('./routes/events');
const guestRoutes = require('./routes/guests');
const authRoutes = require('./routes/auth');
const { protect } = require('./middleware/authMiddleware');
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

validateSecurityConfig();

// Middleware
app.use(helmet());
app.use(cors(buildCorsOptions()));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const initializeDatabase = async () => {
  await connectDB();

  try {
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      const username = process.env.ADMIN_USERNAME || (process.env.NODE_ENV === 'production' ? '' : 'admin');
      const password = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'admin123');

      if (!username || !password) {
        throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD are required before seeding the initial admin user.');
      }

      const passwordHash = await bcrypt.hash(password, 10);

      await new User({ username, passwordHash, role: 'admin' }).save();
      console.log(`✅ Default admin created: ${username}`);
      console.log('Update backend/.env ADMIN_USERNAME and ADMIN_PASSWORD to change this login.');
    }
  } catch (error) {
    console.error('Failed to seed admin user:', error);
  }
};

initializeDatabase();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/events', protect, eventRoutes);
app.use('/api/guests', guestRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'RSVP Backend is running',
    api: '/api/auth, /api/events, /api/guests',
    health: '/api/health',
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running', timestamp: new Date() });
});

if (isSeedAdminEnabled()) {
  app.post('/api/seed-admin', async (req, res) => {
    try {
      const password = req.body.password || process.env.ADMIN_PASSWORD || 'admin123';
      const username = req.body.username || process.env.ADMIN_USERNAME || 'admin';

      await User.deleteOne({ username });

      const passwordHash = await bcrypt.hash(password, 10);
      const user = new User({ username, passwordHash, role: 'admin' });
      await user.save();

      res.json({ success: true, message: `Admin user "${username}" created successfully.`, user: user.toJSON() });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  if (err?.message === 'CORS origin denied.') {
    return res.status(403).json({ success: false, error: 'CORS origin denied.' });
  }

  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Start server
app.listen(PORT, HOST, () => {
  console.log(`\n🚀 RSVP Backend running on http://${HOST}:${PORT}`);
  console.log(`📝 API Documentation: http://${HOST}:${PORT}/api`);
});
