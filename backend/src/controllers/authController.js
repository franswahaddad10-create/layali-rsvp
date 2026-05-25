const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getJwtSecret, validatePasswordStrength } = require('../config/security');

const signToken = (user) => {
  return jwt.sign(
    { id: user._id, username: user.username, role: user.role },
    getJwtSecret(),
    { expiresIn: '8h' }
  );
};

exports.loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required.' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    if (user.isLoginLocked()) {
      return res.status(423).json({ success: false, error: 'Account temporarily locked due to repeated failed login attempts.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await user.registerFailedLogin();

      if (user.isLoginLocked()) {
        return res.status(423).json({ success: false, error: 'Account temporarily locked due to repeated failed login attempts.' });
      }

      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    if (user.loginAttempts || user.lockUntil) {
      await user.clearLoginLock();
    }

    const token = signToken(user);
    res.json({ success: true, token, user: user.toJSON() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getCurrentUser = async (req, res) => {
  res.json({ success: true, user: req.user.toJSON() });
};

exports.getUsers = async (req, res) => {
  try {
    const users = await User.find().select('-passwordHash -__v');
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { username, password, role, permissions } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required.' });
    }

    const passwordValidation = validatePasswordStrength(password, username);
    if (!passwordValidation.valid) {
      return res.status(400).json({ success: false, error: passwordValidation.error });
    }

    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Username already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({ username, passwordHash, role: role || 'manager', permissions: permissions || {} });
    await user.save();

    res.status(201).json({ success: true, user: user.toJSON() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { username, password, role, permissions } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const nextUsername = username || user.username;

    if (password) {
      const passwordValidation = validatePasswordStrength(password, nextUsername);
      if (!passwordValidation.valid) {
        return res.status(400).json({ success: false, error: passwordValidation.error });
      }
    }

    if (username) user.username = username;
    if (role) user.role = role;
    if (permissions && typeof permissions === 'object') {
      user.permissions = { ...user.permissions?.toObject?.(), ...user.permissions, ...permissions };
    }
    if (password) {
      user.passwordHash = await bcrypt.hash(password, 10);
    }

    await user.save();
    res.json({ success: true, user: user.toJSON() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    await user.remove();
    res.json({ success: true, message: 'User deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
