const mongoose = require('mongoose');

const guestSchema = new mongoose.Schema(
  {
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    surname: {
      type: String,
      trim: true,
    },
    email: String,
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    groupId: {
      type: String,
      trim: true,
    },
    groupName: {
      type: String,
      trim: true,
    },
    responseToken: {
      type: String,
      unique: true,
      index: true,
    },
    rsvpStatus: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'maybe'],
      default: 'pending',
    },
    numberOfGuests: {
      type: Number,
      default: 1,
    },
    dietaryRestrictions: String,
    notes: String,
    walkInPartyRole: {
      type: String,
      enum: ['primary', 'companion'],
      trim: true,
    },
    table: String,
    seatNumber: String,
    arrivalConfirmed: {
      type: Boolean,
      default: false,
    },
    arrivalTime: Date,
    messagesSent: [{
      type: {
        type: String,
        enum: ['invitation', 'reminder', 'confirmation'],
      },
      sentAt: {
        type: Date,
        default: Date.now,
      },
      status: String,
    }],
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Guest', guestSchema);
