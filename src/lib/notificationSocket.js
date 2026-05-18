const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { env } = require('../config/env');

let io;

function authSocketMiddleware(socket, next) {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    socket.user = payload;
    return next();
  } catch (err) {
    return next(new Error('Invalid or expired token'));
  }
}

function initNotificationSocket(server) {
  io = new Server(server, {
    cors: {
      origin: env.FRONTEND_URL,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.use(authSocketMiddleware);

  io.on('connection', (socket) => {
    const userId = socket.user?.userId;
    if (userId) {
      socket.join(`user_${userId}`);
    }

    socket.on('disconnect', () => {
      // no-op
    });
  });

  return io;
}

function emitNotificationToUser(userId, eventName, payload) {
  if (!io || !userId) return;
  io.to(`user_${userId}`).emit(eventName, payload);
}

function getIo() {
  return io;
}

module.exports = {
  initNotificationSocket,
  emitNotificationToUser,
  getIo,
};