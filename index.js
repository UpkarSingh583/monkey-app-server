import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import connectDB from './config/database.js';
import authRoutes from './routes/auth.js';
import matchingRoutes from './routes/matching.js';
import User from './models/User.js';

// Load environment variables
dotenv.config();

// Connect to database
connectDB();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? ['https://your-domain.com'] 
      : ['http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-domain.com'] 
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/matching', matchingRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'MonkeyChat API is running!',
    timestamp: new Date().toISOString()
  });
});

// Socket.IO connection handling
const activeUsers = new Map();
const activeRooms = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // User joins with authentication
  socket.on('user:join', async (data) => {
    try {
      const { userId, username } = data;
      
      // Update user online status
      await User.findByIdAndUpdate(userId, { 
        isOnline: true,
        lastSeen: new Date()
      });

      // Store user info
      activeUsers.set(socket.id, { userId, username });
      socket.userId = userId;
      socket.username = username;

      socket.emit('user:joined', { success: true });
      
      // Broadcast user count update
      io.emit('users:count', { count: activeUsers.size });
      
    } catch (error) {
      console.error('User join error:', error);
      socket.emit('user:joined', { success: false, error: 'Failed to join' });
    }
  });

  // Handle matching requests
  socket.on('match:request', (data) => {
    socket.join('matching-queue');
    socket.emit('match:searching');
    
    // Simple matching logic - pair with another user in queue
    const matchingUsers = Array.from(io.sockets.adapter.rooms.get('matching-queue') || []);
    
    if (matchingUsers.length >= 2) {
      const user1 = matchingUsers[0];
      const user2 = matchingUsers[1];
      
      if (user1 !== socket.id) {
        const roomId = `room_${user1}_${user2}`;
        
        // Remove users from matching queue
        io.sockets.sockets.get(user1)?.leave('matching-queue');
        io.sockets.sockets.get(user2)?.leave('matching-queue');
        
        // Join them to a private room
        io.sockets.sockets.get(user1)?.join(roomId);
        io.sockets.sockets.get(user2)?.join(roomId);
        
        // Store room info
        activeRooms.set(roomId, { user1, user2, startTime: new Date() });
        
        // Notify both users of the match
        io.to(user1).emit('match:found', { 
          roomId, 
          partnerId: user2,
          partnerName: activeUsers.get(user2)?.username 
        });
        io.to(user2).emit('match:found', { 
          roomId, 
          partnerId: user1,
          partnerName: activeUsers.get(user1)?.username 
        });
      }
    }
  });

  // Handle chat messages
  socket.on('message:send', (data) => {
    const { roomId, message, type = 'text' } = data;
    const user = activeUsers.get(socket.id);
    
    if (user && roomId) {
      const messageData = {
        id: Date.now().toString(),
        userId: user.userId,
        username: user.username,
        message,
        type,
        timestamp: new Date()
      };
      
      // Send to all users in the room
      io.to(roomId).emit('message:received', messageData);
    }
  });

  // Handle WebRTC signaling
  socket.on('webrtc:offer', (data) => {
    socket.to(data.roomId).emit('webrtc:offer', {
      offer: data.offer,
      from: socket.id
    });
  });

  socket.on('webrtc:answer', (data) => {
    socket.to(data.roomId).emit('webrtc:answer', {
      answer: data.answer,
      from: socket.id
    });
  });

  socket.on('webrtc:ice-candidate', (data) => {
    socket.to(data.roomId).emit('webrtc:ice-candidate', {
      candidate: data.candidate,
      from: socket.id
    });
  });

  // Handle user skip/disconnect from room
  socket.on('room:leave', (data) => {
    const { roomId } = data;
    if (roomId) {
      socket.to(roomId).emit('partner:disconnected');
      socket.leave(roomId);
      
      // Clean up room if empty
      const room = io.sockets.adapter.rooms.get(roomId);
      if (!room || room.size === 0) {
        activeRooms.delete(roomId);
      }
    }
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);
    
    try {
      const user = activeUsers.get(socket.id);
      if (user) {
        // Update user offline status
        await User.findByIdAndUpdate(user.userId, { 
          isOnline: false,
          lastSeen: new Date()
        });
        
        activeUsers.delete(socket.id);
      }
      
      // Notify partner if in a room
      socket.rooms.forEach(roomId => {
        if (roomId !== socket.id) {
          socket.to(roomId).emit('partner:disconnected');
          
          // Clean up room
          const room = io.sockets.adapter.rooms.get(roomId);
          if (!room || room.size <= 1) {
            activeRooms.delete(roomId);
          }
        }
      });
      
      // Broadcast updated user count
      io.emit('users:count', { count: activeUsers.size });
      
    } catch (error) {
      console.error('Disconnect cleanup error:', error);
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 MonkeyChat API ready!`);
});