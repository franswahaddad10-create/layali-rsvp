const mongoose = require('mongoose');

const activityLogEntrySchema = new mongoose.Schema(
  {
    id: String,
    type: String,
    message: String,
    actor: {
      id: String,
      username: String,
      role: String,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const planningConversationEntrySchema = new mongoose.Schema(
  {
    id: String,
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      default: 'user',
    },
    language: {
      type: String,
      enum: ['he', 'en', 'ar'],
      default: 'he',
    },
    text: String,
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const eventSchema = new mongoose.Schema(
  {
    serialNumber: {
      type: String,
      unique: true,
      index: true,
      sparse: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: String,
    date: {
      type: Date,
      required: true,
    },
    location: String,
    organizer: {
      name: String,
      email: String,
      phone: String,
    },
    guests: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Guest',
    }],
    groups: [
      {
        id: String,
        name: String,
        type: {
          type: String,
          enum: ['family', 'friends', 'work mates', 'other'],
          default: 'family',
        },
        numberOfGuests: {
          type: Number,
          default: 1,
        },
        leader: {
          name: String,
          phone: String,
          email: String,
        },
        notes: String,
        members: [
          {
            id: String,
            guestId: String,
            name: String,
            surname: String,
            phone: String,
            email: String,
            notes: String,
            table: String,
            seatNumber: String,
          },
        ],
      },
    ],
    hallLayout: [
      {
        id: String,
        label: String,
        row: Number,
        col: Number,
        x: Number,
        y: Number,
        rotation: {
          type: Number,
          default: 0,
        },
        shape: String,
        notes: String,
        seats: [
          {
            id: String,
            guestId: mongoose.Schema.Types.Mixed,
          },
        ],
        team: String,
      },
    ],
    hallElements: [
      {
        id: String,
        type: String,
        label: String,
        row: Number,
        col: Number,
        x: Number,
        y: Number,
        width: Number,
        height: Number,
        rotation: {
          type: Number,
          default: 0,
        },
      },
    ],
    customColors: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    hallScanReference: {
      imageData: String,
      fileName: String,
      opacity: {
        type: Number,
        default: 0.42,
      },
      updatedAt: Date,
    },
    mapLocked: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'ongoing', 'completed', 'cancelled'],
      default: 'draft',
    },
    activityLog: [activityLogEntrySchema],
    planningConversation: [planningConversationEntrySchema],
    planningMetadata: {
      preferredLanguage: {
        type: String,
        enum: ['he', 'en', 'ar'],
        default: 'he',
      },
      lastAssistantReplyAt: Date,
      lastDetectedSignals: {
        type: [String],
        default: [],
      },
      lastMatchedGuests: {
        type: [mongoose.Schema.Types.Mixed],
        default: [],
      },
    },
    startedAt: Date,
    completedAt: Date,
    capacity: Number,
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Event', eventSchema);
