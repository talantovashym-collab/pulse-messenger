const db = require('../services/db');
const crypto = require('crypto');
const botEngine = require('../bots/botEngine');
const uuidv4 = () => crypto.randomUUID();

// Track active sockets: userId -> Set of socketIds
const userSockets = new Map();

function initSocket(io, clusterBus = null) {
  // Subscribe to cross-instance cluster bus events
  if (clusterBus) {
    clusterBus.subscribe('cluster:message', (msg) => {
      io.to(msg.chatId).emit('message:new', msg);
    });

    clusterBus.subscribe('cluster:typing:start', (data) => {
      io.to(data.chatId).emit('typing:start', data);
    });

    clusterBus.subscribe('cluster:typing:stop', (data) => {
      io.to(data.chatId).emit('typing:stop', data);
    });

    clusterBus.subscribe('cluster:presence', (data) => {
      io.emit('presence:update', data);
    });
  }

  io.on('connection', (socket) => {
    let currentUserId = null;

    // User authentication / connection
    socket.on('user:join', ({ userId }) => {
      if (!userId) return;
      currentUserId = userId;

      if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
      }
      userSockets.get(userId).add(socket.id);

      // Update user presence
      db.updateUser(userId, { online: true, lastSeen: new Date().toISOString() });

      // Join all chat rooms this user is part of
      const userChats = db.getChatsForUser(userId);
      userChats.forEach(chat => {
        socket.join(chat.id);
      });

      // Broadcast presence update to everyone
      io.emit('presence:update', {
        userId,
        online: true,
        lastSeen: new Date().toISOString()
      });
    });

    // Join specific chat room (e.g., when a new chat is created)
    socket.on('chat:join', ({ chatId }) => {
      if (chatId) {
        socket.join(chatId);
      }
    });

    // Typing indicators
    socket.on('typing:start', ({ chatId, userId, username }) => {
      socket.to(chatId).emit('typing:start', { chatId, userId, username });
      if (clusterBus) clusterBus.publish('cluster:typing:start', { chatId, userId, username });
    });

    socket.on('typing:stop', ({ chatId, userId }) => {
      socket.to(chatId).emit('typing:stop', { chatId, userId });
      if (clusterBus) clusterBus.publish('cluster:typing:stop', { chatId, userId });
    });

    // Send message
    socket.on('message:send', ({ chatId, senderId, text, attachments = [], replyTo = null, encrypted = false, ciphertext = null, iv = null, senderPublicJwk = null }) => {
      if (!chatId || !senderId || (!text && !ciphertext && attachments.length === 0)) return;

      const chat = db.getChatById(chatId);
      if (!chat) return;

      // In public broadcast channels, only owner/admin or bots can post
      if (chat.type === 'channel' && chat.ownerId !== senderId && senderId !== 'usr_pulse_bot') {
        socket.emit('error:permission', { message: 'Only channel administrators can post in this channel.' });
        return;
      }

      // Determine initial status
      // If direct chat and the other member is online, mark as 'delivered'
      let initialStatus = 'sent';
      if (chat.type === 'direct') {
        const otherMemberId = chat.members.find(m => m !== senderId);
        if (otherMemberId && userSockets.has(otherMemberId) && userSockets.get(otherMemberId).size > 0) {
          initialStatus = 'delivered';
        }
      }

      const newMessage = {
        id: `msg_${Date.now()}_${uuidv4().slice(0, 8)}`,
        chatId,
        senderId,
        text: encrypted ? '[🔒 End-to-End Encrypted]' : (text || '').trim(),
        encrypted: !!encrypted,
        ciphertext: ciphertext || null,
        iv: iv || null,
        senderPublicJwk: senderPublicJwk || null,
        attachments: attachments || [],
        reactions: {},
        replyTo: replyTo || null,
        status: initialStatus,
        createdAt: new Date().toISOString()
      };

      db.addMessage(newMessage);

      // Send to everyone connected locally to this instance
      io.to(chatId).emit('message:new', newMessage);

      // Fan out across multi-instance cluster bus
      if (clusterBus) {
        clusterBus.publish('cluster:message', newMessage);
      }

      // Trigger Telegram-style bot processing if applicable
      botEngine.handleIncomingMessage(newMessage);

      // Also ensure members not currently subscribed to the room receive chat list update
      chat.members.forEach(memberId => {
        const sockets = userSockets.get(memberId);
        if (sockets) {
          sockets.forEach(sId => {
            io.to(sId).emit('chat:activity', {
              chatId,
              lastMessage: newMessage,
              unread: memberId !== senderId
            });
          });
        }
      });
    });

    // Mark messages as read
    socket.on('message:read', ({ chatId, userId }) => {
      if (!chatId || !userId) return;
      const updated = db.markMessagesRead(chatId, userId);
      if (updated) {
        io.to(chatId).emit('message:status_update', {
          chatId,
          readBy: userId,
          status: 'read'
        });
      }
    });

    // Toggle reaction
    socket.on('reaction:toggle', ({ messageId, emoji, userId }) => {
      if (!messageId || !emoji || !userId) return;
      const updated = db.toggleReaction(messageId, emoji, userId);
      if (updated) {
        io.to(updated.chatId).emit('reaction:update', {
          messageId: updated.id,
          chatId: updated.chatId,
          reactions: updated.reactions
        });
      }
    });

    // Delete message
    socket.on('message:delete', ({ messageId, userId }) => {
      const msg = db.getMessageById(messageId);
      if (!msg) return;
      if (msg.senderId !== userId) return; // Only author can delete

      const deleted = db.deleteMessage(messageId);
      if (deleted) {
        io.to(deleted.chatId).emit('message:deleted', {
          messageId: deleted.id,
          chatId: deleted.chatId
        });
      }
    });

    // Pin message
    socket.on('message:pin', ({ chatId, messageId }) => {
      const chat = db.getChatById(chatId);
      if (!chat) return;

      // Toggle pin
      const newPin = chat.pinnedMessageId === messageId ? null : messageId;
      db.updateChat(chatId, { pinnedMessageId: newPin });

      io.to(chatId).emit('chat:pinned_update', {
        chatId,
        pinnedMessageId: newPin
      });
    });

    // Create new chat (group or direct)
    socket.on('chat:create', ({ type, name, members, avatar, description }, callback) => {
      if (!members || members.length < 2) {
        if (typeof callback === 'function') callback({ error: 'Chat must have at least 2 members' });
        return;
      }

      // If direct, check existing
      if (type === 'direct') {
        const existing = db.findDirectChat(members[0], members[1]);
        if (existing) {
          if (typeof callback === 'function') callback({ success: true, chat: existing });
          return;
        }
      }

      const newChat = {
        id: `chat_${Date.now()}_${uuidv4().slice(0, 6)}`,
        type: type || 'direct',
        name: name || 'New Chat',
        description: description || '',
        avatar: avatar || (type === 'group' 
          ? 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&auto=format&fit=crop&q=80'
          : null),
        members,
        pinnedMessageId: null,
        createdAt: new Date().toISOString()
      };

      db.addChat(newChat);

      // Join current socket
      socket.join(newChat.id);

      // Notify all members
      members.forEach(mId => {
        const sockets = userSockets.get(mId);
        if (sockets) {
          sockets.forEach(sId => {
            const clientSocket = io.sockets.sockets.get(sId);
            if (clientSocket) {
              clientSocket.join(newChat.id);
            }
            io.to(sId).emit('chat:new', newChat);
          });
        }
      });

      if (typeof callback === 'function') {
        callback({ success: true, chat: newChat });
      }
    });

    // === WebRTC VOICE & VIDEO CALL SIGNALING ===

    // Initiate call
    socket.on('call:initiate', ({ callerId, recipientId, chatId, callType = 'audio' }) => {
      const caller = db.getUserById(callerId);
      const recipientSockets = userSockets.get(recipientId);

      if (!recipientSockets || recipientSockets.size === 0) {
        socket.emit('call:unavailable', { reason: 'User is offline' });
        return;
      }

      recipientSockets.forEach(sId => {
        io.to(sId).emit('call:incoming', {
          callerId,
          callerName: caller ? caller.displayName : 'Unknown',
          callerAvatar: caller ? caller.avatar : '',
          chatId,
          callType
        });
      });
    });

    // Accept call
    socket.on('call:accept', ({ callerId, recipientId }) => {
      const callerSockets = userSockets.get(callerId);
      if (callerSockets) {
        callerSockets.forEach(sId => {
          io.to(sId).emit('call:accepted', { recipientId });
        });
      }
    });

    // Reject / Cancel call
    socket.on('call:reject', ({ callerId, recipientId, reason = 'declined' }) => {
      const callerSockets = userSockets.get(callerId);
      if (callerSockets) {
        callerSockets.forEach(sId => {
          io.to(sId).emit('call:rejected', { recipientId, reason });
        });
      }
      const recipientSockets = userSockets.get(recipientId);
      if (recipientSockets) {
        recipientSockets.forEach(sId => {
          io.to(sId).emit('call:cancelled', { callerId });
        });
      }
    });

    // WebRTC Peer Signal relay (SDP Offer / Answer / ICE Candidates)
    socket.on('call:signal', ({ to, from, signal }) => {
      const targetSockets = userSockets.get(to);
      if (targetSockets) {
        targetSockets.forEach(sId => {
          io.to(sId).emit('call:signal', { from, signal });
        });
      }
    });

    // End active call
    socket.on('call:end', ({ peerId, from }) => {
      const peerSockets = userSockets.get(peerId);
      if (peerSockets) {
        peerSockets.forEach(sId => {
          io.to(sId).emit('call:ended', { from });
        });
      }
    });

    // Disconnection
    socket.on('disconnect', () => {
      if (currentUserId && userSockets.has(currentUserId)) {
        const userSet = userSockets.get(currentUserId);
        userSet.delete(socket.id);
        if (userSet.size === 0) {
          userSockets.delete(currentUserId);
          const lastSeen = new Date().toISOString();
          db.updateUser(currentUserId, { online: false, lastSeen });
          io.emit('presence:update', {
            userId: currentUserId,
            online: false,
            lastSeen
          });
        }
      }
    });
  });
}

module.exports = { initSocket };
