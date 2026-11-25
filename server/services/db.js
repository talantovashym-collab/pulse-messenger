const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '../../data/pulse.json');

const INITIAL_DATA = {
  users: [
    {
      id: 'usr_alex',
      username: 'alex',
      displayName: 'Alex Rivera',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      status: 'Building the next-gen messenger 🚀',
      online: false,
      lastSeen: new Date().toISOString()
    },
    {
      id: 'usr_sarah',
      username: 'sarah',
      displayName: 'Sarah Chen',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
      status: 'Design systems & UX enthusiast 🎨',
      online: false,
      lastSeen: new Date().toISOString()
    },
    {
      id: 'usr_marcus',
      username: 'marcus',
      displayName: 'Marcus Vance',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      status: 'Backend & distributed systems ⚡',
      online: false,
      lastSeen: new Date().toISOString()
    },
    {
      id: 'usr_elena',
      username: 'elena',
      displayName: 'Elena Rostova',
      avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
      status: 'Security & cryptography researcher 🔐',
      online: false,
      lastSeen: new Date().toISOString()
    }
  ],
  chats: [
    {
      id: 'chat_global',
      type: 'group',
      name: 'Global Lounge 🌍',
      description: 'Public community channel for all Pulse users',
      avatar: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&auto=format&fit=crop&q=80',
      members: ['usr_alex', 'usr_sarah', 'usr_marcus', 'usr_elena'],
      pinnedMessageId: 'msg_init_2',
      createdAt: new Date(Date.now() - 3600000 * 24).toISOString()
    },
    {
      id: 'chat_arch',
      type: 'group',
      name: 'Core Architecture ⚙️',
      description: 'Distributed systems, protocol design & scalability',
      avatar: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=150&auto=format&fit=crop&q=80',
      members: ['usr_alex', 'usr_marcus', 'usr_elena'],
      pinnedMessageId: null,
      createdAt: new Date(Date.now() - 3600000 * 12).toISOString()
    },
    {
      id: 'chat_dm_alex_sarah',
      type: 'direct',
      name: 'Sarah Chen',
      members: ['usr_alex', 'usr_sarah'],
      pinnedMessageId: null,
      createdAt: new Date(Date.now() - 3600000 * 6).toISOString()
    }
  ],
  messages: [
    {
      id: 'msg_init_1',
      chatId: 'chat_global',
      senderId: 'usr_sarah',
      text: 'Welcome to Pulse Messenger! 🎉 We just launched the core real-time engine.',
      attachments: [],
      reactions: { '🔥': ['usr_alex', 'usr_marcus'], '🚀': ['usr_elena'] },
      replyTo: null,
      status: 'read',
      createdAt: new Date(Date.now() - 3600000 * 3).toISOString()
    },
    {
      id: 'msg_init_2',
      chatId: 'chat_global',
      senderId: 'usr_alex',
      text: '📌 Mission briefing: Our goal is to conquer WhatsApp and Telegram by building faster sync, pristine UX, zero bloat, and enterprise-grade end-to-end security.',
      attachments: [],
      reactions: { '💯': ['usr_sarah', 'usr_marcus', 'usr_elena'] },
      replyTo: null,
      status: 'read',
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString()
    },
    {
      id: 'msg_init_3',
      chatId: 'chat_global',
      senderId: 'usr_marcus',
      text: 'WebSocket low-latency transport is active! Message delivery status tracking is live too.',
      attachments: [],
      reactions: { '⚡': ['usr_alex'] },
      replyTo: 'msg_init_2',
      status: 'read',
      createdAt: new Date(Date.now() - 3600000 * 1).toISOString()
    },
    {
      id: 'msg_init_dm_1',
      chatId: 'chat_dm_alex_sarah',
      senderId: 'usr_sarah',
      text: 'Hey Alex! Have you reviewed the new dark mode color palette?',
      attachments: [],
      reactions: { '👍': ['usr_alex'] },
      replyTo: null,
      status: 'read',
      createdAt: new Date(Date.now() - 1800000).toISOString()
    },
    {
      id: 'msg_init_dm_2',
      chatId: 'chat_dm_alex_sarah',
      senderId: 'usr_alex',
      text: 'Yes! The deep obsidian background and emerald accents look incredible.',
      attachments: [],
      reactions: {},
      replyTo: null,
      status: 'read',
      createdAt: new Date(Date.now() - 900000).toISOString()
    }
  ]
};

class Database {
  constructor() {
    this.data = null;
    this.init();
  }

  init() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        this.data = JSON.parse(raw);
      } else {
        this.data = JSON.parse(JSON.stringify(INITIAL_DATA));
        this.save();
      }

      // Ensure Bot user is present
      if (!this.data.users.some(u => u.id === 'usr_pulse_bot')) {
        this.data.users.push({
          id: 'usr_pulse_bot',
          username: 'pulse_bot',
          displayName: 'Pulse Sentinel 🤖',
          avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
          status: 'Official AI Automation & Security Bot',
          isBot: true,
          online: true,
          lastSeen: new Date().toISOString()
        });
        this.save();
      }

      // Ensure Public Channel is present
      if (!this.data.chats.some(c => c.id === 'chat_channel_pulse')) {
        this.data.chats.unshift({
          id: 'chat_channel_pulse',
          type: 'channel',
          name: 'Pulse Official Announcements 📢',
          handle: '@pulse_official',
          description: 'Official product updates, security briefings & architecture releases from the Pulse Core Team.',
          avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
          ownerId: 'usr_alex',
          verified: true,
          subscribers: 28400,
          members: ['usr_alex', 'usr_sarah', 'usr_marcus', 'usr_elena', 'usr_pulse_bot'],
          pinnedMessageId: 'msg_channel_init',
          createdAt: new Date(Date.now() - 3600000 * 48).toISOString()
        });

        this.data.messages.push({
          id: 'msg_channel_init',
          chatId: 'chat_channel_pulse',
          senderId: 'usr_pulse_bot',
          text: '📢 **Pulse v1.3 Major Release Briefing**:\n\n• **Clustering Engine**: Horizontal multi-instance sync with Redis & Pub/Sub cluster bus.\n• **Telegram-Style Channels**: Broadcast channels with verified handles and read-only feeds.\n• **Zero-Knowledge E2EE**: Native Web Crypto ECDH P-256 + AES-GCM-256 with 60-digit safety numbers.\n• **WebRTC Calling**: Real-time peer-to-peer audio & video calls with STUN traversal.\n\nSubscribe and react to stay informed! 🚀',
          attachments: [],
          reactions: { '🔥': ['usr_alex', 'usr_sarah', 'usr_marcus'], '❤️': ['usr_elena'], '🚀': ['usr_alex'] },
          replyTo: null,
          status: 'read',
          createdAt: new Date(Date.now() - 3600000 * 2).toISOString()
        });
        this.save();
      }

      // Ensure Bot DM is present
      if (!this.data.chats.some(c => c.id === 'chat_dm_alex_bot')) {
        this.data.chats.splice(1, 0, {
          id: 'chat_dm_alex_bot',
          type: 'direct',
          name: 'Pulse Sentinel 🤖',
          members: ['usr_alex', 'usr_pulse_bot'],
          pinnedMessageId: null,
          createdAt: new Date().toISOString()
        });

        this.data.messages.push({
          id: 'msg_bot_init',
          chatId: 'chat_dm_alex_bot',
          senderId: 'usr_pulse_bot',
          text: '👋 Hi Alex! I am Pulse Sentinel 🤖. You can test commands like `/status`, `/price btc`, or `/help`. How can I assist you?',
          attachments: [],
          reactions: { '⚡': ['usr_alex'] },
          replyTo: null,
          status: 'read',
          createdAt: new Date().toISOString()
        });
        this.save();
      }
    } catch (err) {
      console.error('Error loading database, initializing defaults:', err);
      this.data = JSON.parse(JSON.stringify(INITIAL_DATA));
      this.save();
    }
  }

  save() {
    try {
      const dir = path.dirname(DB_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err) {
      console.error('Error saving database:', err);
    }
  }

  // User queries
  getUsers() {
    return this.data.users;
  }

  getUserById(id) {
    return this.data.users.find(u => u.id === id);
  }

  getUserByUsername(username) {
    return this.data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  }

  getUserByPhone(phone) {
    if (!phone) return null;
    const clean = phone.replace(/[\s\-\(\)]/g, '');
    return this.data.users.find(u => u.phone && u.phone.replace(/[\s\-\(\)]/g, '') === clean);
  }

  addUser(user) {
    this.data.users.push(user);
    this.save();
    return user;
  }

  updateUser(id, updates) {
    const user = this.getUserById(id);
    if (!user) return null;
    Object.assign(user, updates);
    this.save();
    return user;
  }

  // Chat queries
  getChatsForUser(userId) {
    return this.data.chats.filter(c => c.members.includes(userId));
  }

  getChatById(chatId) {
    return this.data.chats.find(c => c.id === chatId);
  }

  findDirectChat(userId1, userId2) {
    return this.data.chats.find(
      c => c.type === 'direct' &&
      c.members.includes(userId1) &&
      c.members.includes(userId2) &&
      c.members.length === 2
    );
  }

  addChat(chat) {
    this.data.chats.unshift(chat);
    this.save();
    return chat;
  }

  updateChat(id, updates) {
    const chat = this.getChatById(id);
    if (!chat) return null;
    Object.assign(chat, updates);
    this.save();
    return chat;
  }

  // Message queries
  getMessages(chatId, limit = 100) {
    return this.data.messages
      .filter(m => m.chatId === chatId)
      .slice(-limit);
  }

  getMessageById(messageId) {
    return this.data.messages.find(m => m.id === messageId);
  }

  addMessage(msg) {
    this.data.messages.push(msg);
    this.save();
    return msg;
  }

  updateMessage(id, updates) {
    const msg = this.getMessageById(id);
    if (!msg) return null;
    Object.assign(msg, updates);
    this.save();
    return msg;
  }

  deleteMessage(id) {
    const idx = this.data.messages.findIndex(m => m.id === id);
    if (idx !== -1) {
      const deleted = this.data.messages.splice(idx, 1)[0];
      this.save();
      return deleted;
    }
    return null;
  }

  toggleReaction(messageId, emoji, userId) {
    const msg = this.getMessageById(messageId);
    if (!msg) return null;
    if (!msg.reactions) msg.reactions = {};

    if (!msg.reactions[emoji]) {
      msg.reactions[emoji] = [userId];
    } else {
      const idx = msg.reactions[emoji].indexOf(userId);
      if (idx !== -1) {
        msg.reactions[emoji].splice(idx, 1);
        if (msg.reactions[emoji].length === 0) {
          delete msg.reactions[emoji];
        }
      } else {
        msg.reactions[emoji].push(userId);
      }
    }
    this.save();
    return msg;
  }

  getLastMessage(chatId) {
    const chatMessages = this.data.messages.filter(m => m.chatId === chatId);
    return chatMessages.length ? chatMessages[chatMessages.length - 1] : null;
  }

  getUnreadCount(chatId, userId) {
    // Unread if sender is not this user and status != 'read'
    return this.data.messages.filter(
      m => m.chatId === chatId && m.senderId !== userId && m.status !== 'read'
    ).length;
  }

  markMessagesRead(chatId, readerId) {
    let updated = false;
    this.data.messages.forEach(m => {
      if (m.chatId === chatId && m.senderId !== readerId && m.status !== 'read') {
        m.status = 'read';
        updated = true;
      }
    });
    if (updated) {
      this.save();
    }
    return updated;
  }
}

module.exports = new Database();
