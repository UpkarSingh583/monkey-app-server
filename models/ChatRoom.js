import mongoose from 'mongoose';

const chatRoomSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  endedAt: {
    type: Date
  },
  messages: [{
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    type: {
      type: String,
      enum: ['text', 'system'],
      default: 'text'
    }
  }]
}, {
  timestamps: true
});

export default mongoose.model('ChatRoom', chatRoomSchema);