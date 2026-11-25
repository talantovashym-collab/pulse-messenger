const db = require('../services/db');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

class BotEngine {
  constructor() {
    this.io = null;
    this.bots = new Map(); // token -> botUser
    this.commands = new Map();
    this.initDefaultBots();
  }

  setIO(io) {
    this.io = io;
  }

  initDefaultBots() {
    const sentinelBot = {
      id: 'usr_pulse_bot',
      username: 'pulse_bot',
      displayName: 'Pulse Sentinel 🤖',
      avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
      status: 'Official AI Automation & Security Bot',
      isBot: true,
      token: 'bot_token_pulse_sentinel_xyz123',
      online: true,
      lastSeen: new Date().toISOString()
    };

    this.bots.set(sentinelBot.token, sentinelBot);

    // Register Sentinel commands
    this.registerCommand('/start', (msg, bot) => {
      return `👋 **Welcome to Pulse Messenger!**\n\nI am **Pulse Sentinel** 🤖, your automated assistant.\n\nAvailable commands:\n• \`/help\` - Command overview\n• \`/status\` - Live cluster & server health\n• \`/price <symbol>\` - Real-time market ticker (e.g. \`/price btc\`, \`/price ton\`)\n• \`/channel\` - Latest broadcast from @pulse_official\n• \`/e2ee\` - Learn about zero-knowledge encryption\n\nYou can also just send me any question!`;
    });

    this.registerCommand('/help', (msg, bot) => {
      return `🛠️ **Pulse Bot Commands**:\n\n• \`/status\` — View active cluster nodes & memory metrics\n• \`/price <btc|eth|sol|ton>\` — Live financial ticker\n• \`/channel\` — Official announcements channel info\n• \`/echo <text>\` — Test echo response\n• \`/e2ee\` — Inspect cryptographic protocols`;
    });

    this.registerCommand('/status', (msg, bot) => {
      const mem = process.memoryUsage();
      const rssMb = (mem.rss / 1024 / 1024).toFixed(1);
      const heapMb = (mem.heapUsed / 1024 / 1024).toFixed(1);
      const uptimeSec = Math.floor(process.uptime());
      return `📊 **Pulse Cluster Node Status**:\n\n• **Node PID**: \`${process.pid}\`\n• **Uptime**: \`${uptimeSec} seconds\`\n• **Memory (RSS)**: \`${rssMb} MB\` (Heap: \`${heapMb} MB\`)\n• **Transport**: \`WebSocket + Cluster Pub/Sub\`\n• **Database**: \`ACID Active / PostgreSQL Adapter Ready\`\n• **Encryption**: \`ECDH P-256 + AES-GCM-256 Active\``;
    });

    this.registerCommand('/price', (msg, bot) => {
      const parts = msg.text.split(' ');
      const coin = (parts[1] || 'BTC').toUpperCase();
      const mockPrices = {
        BTC: { price: '$94,320.50', change: '+3.4%' },
        ETH: { price: '$3,410.80', change: '+1.8%' },
        SOL: { price: '$198.40', change: '+5.2%' },
        TON: { price: '$6.85', change: '+4.1%' }
      };

      const info = mockPrices[coin] || { price: `$${(Math.random() * 50 + 5).toFixed(2)}`, change: '+2.5%' };
      return `📈 **Market Ticker [${coin}]**:\n• **Price**: \`${info.price}\`\n• **24h Change**: \`${info.change}\` 🟢\n• **Volume**: \`$1.42B\``;
    });

    this.registerCommand('/channel', (msg, bot) => {
      return `📢 **Official Pulse Public Channel**:\nJoin **@pulse_official** for real-time roadmap updates, release notes, and architecture briefings! Only verified admins can publish posts.`;
    });

    this.registerCommand('/e2ee', (msg, bot) => {
      return `🔐 **Zero-Knowledge Architecture**:\nPulse uses client-side Web Crypto **ECDH P-256** for key exchange and **AES-256-GCM** for message payloads. The server only sees unreadable ciphertext blobs!`;
    });
  }

  registerCommand(cmd, handler) {
    this.commands.set(cmd.toLowerCase(), handler);
  }

  // Handle incoming message to a bot
  async handleIncomingMessage(msg) {
    const chat = db.getChatById(msg.chatId);
    if (!chat) return;

    // Is there a bot in this chat?
    const botUser = Array.from(this.bots.values()).find(b => chat.members.includes(b.id));
    if (!botUser) return;
    if (msg.senderId === botUser.id) return; // Don't reply to own messages

    const text = (msg.text || '').trim();
    if (!text) return;

    let replyText = '';

    // Check command
    const firstWord = text.split(' ')[0].toLowerCase();
    if (this.commands.has(firstWord)) {
      const handler = this.commands.get(firstWord);
      replyText = handler(msg, botUser);
    } else if (text.startsWith('/')) {
      replyText = `❓ Unknown command \`${firstWord}\`. Type \`/help\` to see all available commands.`;
    } else {
      // Conversational reply
      replyText = `🤖 **Pulse AI**: I received your message: _"${text}"_. How can I assist you with Pulse Messenger today? Try typing \`/help\` or \`/price btc\`!`;
    }

    // Simulate typing delay (300ms) for realistic UX
    setTimeout(() => {
      const botMsg = {
        id: `msg_bot_${Date.now()}_${uuidv4().slice(0, 6)}`,
        chatId: msg.chatId,
        senderId: botUser.id,
        text: replyText,
        attachments: [],
        reactions: { '⚡': [msg.senderId] },
        replyTo: msg.id,
        status: 'read',
        createdAt: new Date().toISOString()
      };

      db.addMessage(botMsg);

      if (this.io) {
        this.io.to(msg.chatId).emit('message:new', botMsg);
      }
    }, 400);
  }

  // Telegram-style Send Message API
  sendMessageViaBot(token, { chatId, text, attachments = [] }) {
    const bot = this.bots.get(token);
    if (!bot) {
      throw new Error('Unauthorized: Invalid bot token');
    }

    const chat = db.getChatById(chatId);
    if (!chat) {
      throw new Error('Chat not found');
    }

    const botMsg = {
      id: `msg_bot_${Date.now()}_${uuidv4().slice(0, 6)}`,
      chatId,
      senderId: bot.id,
      text: text.trim(),
      attachments: attachments || [],
      reactions: {},
      replyTo: null,
      status: 'delivered',
      createdAt: new Date().toISOString()
    };

    db.addMessage(botMsg);

    if (this.io) {
      this.io.to(chatId).emit('message:new', botMsg);
    }

    return botMsg;
  }
}

module.exports = new BotEngine();
