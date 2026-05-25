const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { getLoginLockDurationMs, getLoginMaxFailedAttempts } = require('../config/security');

const permissionKeys = ['manageUsers', 'manageEvents', 'manageGuests', 'assignGuests', 'editHallMap', 'manageMapLock', 'manageEntrance', 'escortGuests', 'viewReports'];

const buildDefaultPermissions = (role = 'manager') => {
  if (role === 'admin') {
    return permissionKeys.reduce((permissions, key) => ({ ...permissions, [key]: true }), {});
  }

  if (role === 'escort') {
    return {
      manageUsers: false,
      manageEvents: false,
      manageGuests: false,
      assignGuests: true,
      editHallMap: false,
      manageMapLock: false,
      manageEntrance: true,
      escortGuests: true,
      viewReports: false,
    };
  }

  return {
    manageUsers: false,
    manageEvents: true,
    manageGuests: true,
    assignGuests: true,
    editHallMap: true,
    manageMapLock: false,
    manageEntrance: true,
    escortGuests: true,
    viewReports: true,
  };
};

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    role: {
      type: String,
      enum: ['admin', 'manager', 'escort'],
      default: 'manager',
    },
    permissions: {
      manageUsers: {
        type: Boolean,
        default: undefined,
      },
      manageEvents: {
        type: Boolean,
        default: undefined,
      },
      manageGuests: {
        type: Boolean,
        default: undefined,
      },
      assignGuests: {
        type: Boolean,
        default: undefined,
      },
      editHallMap: {
        type: Boolean,
        default: undefined,
      },
      manageMapLock: {
        type: Boolean,
        default: undefined,
      },
      manageEntrance: {
        type: Boolean,
        default: undefined,
      },
      escortGuests: {
        type: Boolean,
        default: undefined,
      },
      viewReports: {
        type: Boolean,
        default: undefined,
      },
    },
  },
  {
    timestamps: true,
  }
);

userSchema.methods.getResolvedPermissions = function () {
  const defaults = buildDefaultPermissions(this.role);
  return permissionKeys.reduce((permissions, key) => {
    const override = this.permissions?.[key];
    permissions[key] = typeof override === 'boolean' ? override : defaults[key];
    return permissions;
  }, {});
};

userSchema.methods.hasPermission = function (permission) {
  return Boolean(this.getResolvedPermissions()[permission]);
};

userSchema.pre('save', function (next) {
  if (!this.permissions) {
    this.permissions = {};
  }

  next();
});

userSchema.methods.comparePassword = function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.methods.isLoginLocked = function () {
  return Boolean(this.lockUntil && this.lockUntil.getTime() > Date.now());
};

userSchema.methods.clearLoginLock = async function () {
  this.loginAttempts = 0;
  this.lockUntil = null;
  await this.save();
};

userSchema.methods.registerFailedLogin = async function () {
  if (this.lockUntil && this.lockUntil.getTime() <= Date.now()) {
    this.loginAttempts = 0;
    this.lockUntil = null;
  }

  this.loginAttempts = (this.loginAttempts || 0) + 1;

  if (this.loginAttempts >= getLoginMaxFailedAttempts()) {
    this.loginAttempts = 0;
    this.lockUntil = new Date(Date.now() + getLoginLockDurationMs());
  }

  await this.save();
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.loginAttempts;
  delete obj.lockUntil;
  delete obj.__v;
  obj.permissions = this.getResolvedPermissions();
  return obj;
};

userSchema.statics.buildDefaultPermissions = buildDefaultPermissions;

module.exports = mongoose.model('User', userSchema);
