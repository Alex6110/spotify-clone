const { Server } = require('socket.io');
const config = require('./config');
const { verifyToken } = require('./auth');

/**
 * Telecomando tra dispositivi dello stesso utente.
 * Il server decide l'utente dal token: il client non può più entrare nella stanza di un altro.
 */
function attachSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: config.corsOrigins.length ? { origin: config.corsOrigins } : undefined,
    maxHttpBufferSize: 256 * 1024,
  });

  io.use((socket, next) => {
    const uid = verifyToken(String(socket.handshake.auth?.token || ''));
    if (!uid) return next(new Error('unauthorized'));
    socket.data.uid = uid;
    next();
  });

  io.on('connection', (socket) => {
    const room = `user_${socket.data.uid}`;
    socket.join(room);

    // I comandi vanno a tutti gli ALTRI dispositivi dello stesso utente.
    socket.on('send_playback_command', (data) => {
      if (!data || typeof data.action !== 'string') return;
      socket.broadcast.to(room).emit('receive_playback_command', { action: data.action, payload: data.payload });
    });
    socket.on('request_playback_state', () => socket.broadcast.to(room).emit('provide_playback_state'));
    socket.on('send_ui_update', (settings) => {
      if (settings && typeof settings === 'object') socket.broadcast.to(room).emit('receive_ui_update', settings);
    });
  });
  return io;
}

module.exports = { attachSocket };
