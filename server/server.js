const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

const db = require('./services/db');
const { initSocket } = require('./socket/socketHandler');
const clusterBus = require('./cluster/clusterBus');
const botEngine = require('./bots/botEngine');
const smsService = require('./services/smsService');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const UPLOADS_DIR = path.join(__dirname, '../uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = `${Date.now()}_${uuidv4().slice(0, 8)}${ext}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, '../public')));

// === API ROUTES ===

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    appName: 'Pulse Messenger',
    version: '1.4.0',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Public Config (Safe client-facing endpoints: STUN/TURN, public URL)
app.get('/api/config/public', (req, res) => {
  const stunServers = (process.env.STUN_SERVERS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302')
    .split(',')
    .map(url => ({ urls: url.trim() }));

  const iceServers = [...stunServers];

  if (process.env.TURN_SERVER && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({
      urls: process.env.TURN_SERVER,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL
    });
  }

  res.json({
    appName: 'Pulse Messenger',
    version: '1.4.0',
    publicUrl: process.env.PUBLIC_URL || `http://${req.headers.host}`,
    iceServers
  });
});

// Get all users
app.get('/api/users', (req, res) => {
  const users = db.getUsers();
  res.json(users);
});

// Register or update user public key for E2EE
app.post('/api/users/:id/key', (req, res) => {
  const { id } = req.params;
  const { publicKey } = req.body;
  if (!publicKey) return res.status(400).json({ error: 'publicKey required' });
  const user = db.updateUser(id, { publicKey });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ success: true, userId: id });
});

// Retrieve peer public key for E2EE
app.get('/api/users/:id/key', (req, res) => {
  const { id } = req.params;
  const user = db.getUserById(id);
  if (!user || !user.publicKey) {
    return res.status(404).json({ error: 'Public key not registered for user' });
  }
  res.json({ userId: id, publicKey: user.publicKey });
});

// === REAL PHONE NUMBER REGISTRATION & SMS OTP API ===

// SMS Provider Status (shows Twilio/dev mode)
app.get('/api/auth/sms-status', (req, res) => {
  res.json(smsService.getStatus());
});

// Configure SMS provider credentials (admin only in dev; in production lock with secret)
app.post('/api/auth/sms-config', (req, res) => {
  const { accountSid, authToken, fromNumber } = req.body;
  if (!accountSid || !authToken || !fromNumber) {
    return res.status(400).json({ ok: false, error: 'accountSid, authToken and fromNumber are all required.' });
  }
  try {
    smsService.saveEnv({ accountSid, authToken, fromNumber, provider: 'twilio' });
    res.json({ ok: true, status: smsService.getStatus() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 1. Send SMS Verification Code (real Twilio if configured, dev quick-fill fallback)
app.post('/api/auth/send-code', async (req, res) => {
  const { phone } = req.body;
  if (!phone || phone.trim().length < 6) {
    return res.status(400).json({ ok: false, error: 'A valid phone number with country code is required.' });
  }
  try {
    const result = await smsService.sendVerificationCode(phone);
    res.json({
      ok: true,
      phone: result.phone,
      realSmsSent: result.realSmsSent,
      // devCode is omitted in response when a real SMS was dispatched
      devCode: result.devCode,
      message: result.message
    });
  } catch (err) {
    res.status(429).json({ ok: false, error: err.message });
  }
});

// 2. Verify OTP Code (brute-force protected, 5 attempts max)
app.post('/api/auth/verify-code', (req, res) => {
  const { phone, code } = req.body;
  if (!phone || !code) {
    return res.status(400).json({ ok: false, error: 'Phone and verification code are required.' });
  }
  try {
    smsService.verifyCode(phone, code);

    const cleanPhone = smsService.normalizePhone(phone);
    const existingUser = db.getUserByPhone(cleanPhone);
    if (existingUser) {
      db.updateUser(existingUser.id, { online: true, lastSeen: new Date().toISOString() });
      return res.json({ ok: true, isNew: false, user: existingUser });
    }
    return res.json({ ok: true, isNew: true, phone: cleanPhone });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// 3. Complete Profile Registration
app.post('/api/auth/register', (req, res) => {
  const { phone, displayName, avatar, status } = req.body;
  if (!phone || !displayName) {
    return res.status(400).json({ ok: false, error: 'Phone and Name are required.' });
  }

  const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
  let user = db.getUserByPhone(cleanPhone);

  if (!user) {
    const userId = `usr_p_${Date.now()}_${uuidv4().slice(0, 4)}`;
    user = {
      id: userId,
      username: `u_${cleanPhone.replace(/[^0-9]/g, '')}`,
      phone: cleanPhone,
      displayName: displayName.trim(),
      avatar: avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanPhone}`,
      status: status || 'Hey there! I am using Pulse Messenger',
      online: true,
      lastSeen: new Date().toISOString()
    };
    db.addUser(user);

    // Auto-join community channels
    const globalChat = db.getChatById('chat_global');
    if (globalChat && !globalChat.members.includes(userId)) {
      globalChat.members.push(userId);
    }
    const channel = db.getChatById('chat_channel_pulse');
    if (channel && !channel.members.includes(userId)) {
      channel.members.push(userId);
    }
    db.save();
  } else {
    user = db.updateUser(user.id, {
      displayName: displayName.trim(),
      avatar: avatar || user.avatar,
      status: status || user.status
    });
  }

  res.json({ ok: true, user });
});

// 4. Contact Discovery by Phone Number
app.get('/api/users/lookup', (req, res) => {
  const phone = req.query.phone;
  if (!phone) {
    return res.status(400).json({ error: 'phone query parameter required' });
  }

  const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
  const user = db.getUserByPhone(cleanPhone);

  if (!user) {
    return res.status(404).json({ error: 'No user registered with this phone number' });
  }

  res.json(user);
});

// Get or create user
app.post('/api/users', (req, res) => {
  const { username, displayName, avatar, status } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  let user = db.getUserByUsername(username);
  if (!user) {
    user = {
      id: `usr_${uuidv4().slice(0, 8)}`,
      username: username.toLowerCase().trim(),
      displayName: displayName || username,
      avatar: avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`,
      status: status || 'Hey there! I am using Pulse Messenger',
      online: true,
      lastSeen: new Date().toISOString()
    };
    db.addUser(user);
  }
  res.json(user);
});

// Get chats for a user
app.get('/api/chats', (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: 'userId query parameter required' });
  }

  const rawChats = db.getChatsForUser(userId);
  const usersMap = new Map(db.getUsers().map(u => [u.id, u]));

  const enrichedChats = rawChats.map(chat => {
    const lastMsg = db.getLastMessage(chat.id);
    const unreadCount = db.getUnreadCount(chat.id, userId);

    let chatName = chat.name;
    let chatAvatar = chat.avatar;
    let otherUser = null;

    if (chat.type === 'direct') {
      const otherId = chat.members.find(id => id !== userId) || userId;
      otherUser = usersMap.get(otherId) || null;
      if (otherUser) {
        chatName = otherUser.displayName;
        chatAvatar = otherUser.avatar;
      }
    }

    return {
      ...chat,
      displayName: chatName,
      displayAvatar: chatAvatar,
      otherUser,
      lastMessage: lastMsg,
      unreadCount
    };
  });

  // Sort by last message timestamp (or creation date) descending
  enrichedChats.sort((a, b) => {
    const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.createdAt).getTime();
    const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.createdAt).getTime();
    return timeB - timeA;
  });

  res.json(enrichedChats);
});

// Create new chat
app.post('/api/chats', (req, res) => {
  const { type, name, description, avatar, members } = req.body;
  if (!members || members.length < 2) {
    return res.status(400).json({ error: 'At least two members required' });
  }

  if (type === 'direct') {
    const existing = db.findDirectChat(members[0], members[1]);
    if (existing) {
      return res.json(existing);
    }
  }

  const newChat = {
    id: `chat_${Date.now()}_${uuidv4().slice(0, 6)}`,
    type: type || 'direct',
    name: name || 'New Chat',
    description: description || '',
    avatar: avatar || null,
    members,
    pinnedMessageId: null,
    createdAt: new Date().toISOString()
  };

  db.addChat(newChat);
  res.status(201).json(newChat);
});

// Get messages for a chat
app.get('/api/chats/:chatId/messages', (req, res) => {
  const { chatId } = req.params;
  const messages = db.getMessages(chatId, 150);
  res.json(messages);
});

// File upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const fileUrl = `/uploads/${req.file.filename}`;
  const fileType = req.file.mimetype.startsWith('image/')
    ? 'image'
    : req.file.mimetype.startsWith('audio/')
    ? 'audio'
    : req.file.mimetype.startsWith('video/')
    ? 'video'
    : 'document';

  res.json({
    url: fileUrl,
    filename: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    type: fileType
  });
});

// === TELEGRAM-STYLE BOT API ===

// Get Bot info
app.get('/api/bot/:token/getMe', (req, res) => {
  const { token } = req.params;
  const bot = botEngine.bots.get(token);
  if (!bot) {
    return res.status(401).json({ ok: false, error_code: 401, description: 'Unauthorized' });
  }
  res.json({ ok: true, result: bot });
});

// Bot sendMessage endpoint (Telegram-style API)
app.post('/api/bot/:token/sendMessage', (req, res) => {
  const { token } = req.params;
  const { chat_id, text, attachments } = req.body;
  if (!chat_id || !text) {
    return res.status(400).json({ ok: false, error_code: 400, description: 'chat_id and text required' });
  }

  try {
    const msg = botEngine.sendMessageViaBot(token, { chatId: chat_id, text, attachments });
    res.json({ ok: true, result: msg });
  } catch (err) {
    res.status(400).json({ ok: false, description: err.message });
  }
});

// Channel broadcast endpoint (Only Admins / Channel Owner)
app.post('/api/channels/:id/broadcast', (req, res) => {
  const { id } = req.params;
  const { senderId, text, attachments } = req.body;
  const chat = db.getChatById(id);

  if (!chat || chat.type !== 'channel') {
    return res.status(404).json({ error: 'Public channel not found' });
  }

  if (chat.ownerId !== senderId && senderId !== 'usr_pulse_bot') {
    return res.status(403).json({ error: 'Only channel administrators can publish broadcasts' });
  }

  const post = {
    id: `msg_post_${Date.now()}_${uuidv4().slice(0, 6)}`,
    chatId: id,
    senderId,
    text: (text || '').trim(),
    attachments: attachments || [],
    reactions: {},
    replyTo: null,
    status: 'read',
    createdAt: new Date().toISOString()
  };

  db.addMessage(post);
  clusterBus.publish('cluster:message', post);
  io.to(id).emit('message:new', post);

  res.status(201).json({ success: true, post });
});

// Initialize Socket.io events with Cluster Bus
initSocket(io, clusterBus);
botEngine.setIO(io);

// Start server and initialize cluster bus
server.listen(PORT, HOST, async () => {
  await clusterBus.init();
  console.log(`===============================================`);
  console.log(`🚀 Pulse Messenger server is live on http://${HOST}:${PORT}`);
  console.log(`📱 Mode: Multi-Node Cluster Ready + Telegram Channels & Bot API`);
  console.log(`===============================================`);
});

// Graceful shutdown handler (for Docker, Kubernetes & PM2)
function gracefulShutdown(signal) {
  console.log(`\n🛑 Received ${signal}. Gracefully stopping Pulse Messenger...`);
  server.close(() => {
    console.log('HTTP and WebSocket server closed.');
    try {
      db.save();
      console.log('Database state persisted.');
    } catch (e) {
      console.error('Error saving DB during shutdown:', e);
    }
    process.exit(0);
  });

  // Force exit after 10s if connections fail to close
  setTimeout(() => {
    console.error('Forced exit timeout exceeded.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
