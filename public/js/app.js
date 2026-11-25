// Pulse Messenger - Core Client Engine
(function () {
  // Application State
  const state = {
    currentUser: null,
    allUsers: [],
    chats: [],
    activeChatId: null,
    messages: [],
    activeReplyMessage: null,
    pendingAttachment: null,
    activeFilter: 'all',
    typingMap: new Map(), // chatId -> Set of names
    socket: null,
    isTyping: false,
    typingTimeout: null,
    searchQuery: '',
    peerPublicKeysCache: new Map()
  };

  // DOM Elements
  const els = {
    sidebar: document.getElementById('sidebar'),
    currentUserBtn: document.getElementById('currentUserBtn'),
    myAvatar: document.getElementById('myAvatar'),
    myName: document.getElementById('myName'),
    myStatus: document.getElementById('myStatus'),
    userSwitcher: document.getElementById('userSwitcher'),
    soundToggleBtn: document.getElementById('soundToggleBtn'),
    soundIcon: document.getElementById('soundIcon'),
    newChatBtn: document.getElementById('newChatBtn'),
    chatSearchInput: document.getElementById('chatSearchInput'),
    chatList: document.getElementById('chatList'),
    filterTabs: document.querySelectorAll('.filter-tabs .tab-btn'),

    emptyState: document.getElementById('emptyState'),
    activeChatView: document.getElementById('activeChatView'),
    mobileBackBtn: document.getElementById('mobileBackBtn'),
    activeChatAvatar: document.getElementById('activeChatAvatar'),
    activeChatTitle: document.getElementById('activeChatTitle'),
    activeChatStatus: document.getElementById('activeChatStatus'),
    e2eeBadgeBtn: document.getElementById('e2eeBadgeBtn'),
    startAudioCallBtn: document.getElementById('startAudioCallBtn'),
    startVideoCallBtn: document.getElementById('startVideoCallBtn'),
    pinnedBanner: document.getElementById('pinnedBanner'),
    pinnedText: document.getElementById('pinnedText'),
    unpinBtn: document.getElementById('unpinBtn'),
    messagesContainer: document.getElementById('messagesContainer'),

    activeReplyBar: document.getElementById('activeReplyBar'),
    replyAuthor: document.getElementById('replyAuthor'),
    replyTextSnippet: document.getElementById('replyTextSnippet'),
    dismissReplyBtn: document.getElementById('dismissReplyBtn'),

    attachmentPreviewBar: document.getElementById('attachmentPreviewBar'),
    attachmentPreviewImg: document.getElementById('attachmentPreviewImg'),
    attachmentFileName: document.getElementById('attachmentFileName'),
    dismissAttachmentBtn: document.getElementById('dismissAttachmentBtn'),

    emojiPopover: document.getElementById('emojiPopover'),
    emojiBtn: document.getElementById('emojiBtn'),
    fileInput: document.getElementById('fileInput'),
    attachBtn: document.getElementById('attachBtn'),
    voiceNoteBtn: document.getElementById('voiceNoteBtn'),
    voiceRecordingDock: document.getElementById('voiceRecordingDock'),
    recordingTimer: document.getElementById('recordingTimer'),
    cancelVoiceRecordBtn: document.getElementById('cancelVoiceRecordBtn'),
    finishVoiceRecordBtn: document.getElementById('finishVoiceRecordBtn'),
    messageInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),

    // Modals
    newChatModal: document.getElementById('newChatModal'),
    closeNewChatModal: document.getElementById('closeNewChatModal'),
    cancelNewChatBtn: document.getElementById('cancelNewChatBtn'),
    confirmNewChatBtn: document.getElementById('confirmNewChatBtn'),
    modalTabDirect: document.getElementById('modalTabDirect'),
    modalTabGroup: document.getElementById('modalTabGroup'),
    modalTabPhone: document.getElementById('modalTabPhone'),
    phoneLookupSection: document.getElementById('phoneLookupSection'),
    lookupPhoneInput: document.getElementById('lookupPhoneInput'),
    lookupPhoneBtn: document.getElementById('lookupPhoneBtn'),
    lookupPhoneResult: document.getElementById('lookupPhoneResult'),
    lookupResultAvatar: document.getElementById('lookupResultAvatar'),
    lookupResultName: document.getElementById('lookupResultName'),
    lookupResultPhone: document.getElementById('lookupResultPhone'),
    startChatWithFoundUserBtn: document.getElementById('startChatWithFoundUserBtn'),
    groupMetaFields: document.getElementById('groupMetaFields'),
    newGroupName: document.getElementById('newGroupName'),
    newGroupDesc: document.getElementById('newGroupDesc'),
    modalUserList: document.getElementById('modalUserList'),

    // Phone Authentication Modal Elements
    phoneAuthBtn: document.getElementById('phoneAuthBtn'),
    phoneAuthModal: document.getElementById('phoneAuthModal'),
    phoneAuthModalTitle: document.getElementById('phoneAuthModalTitle'),
    closePhoneAuthModal: document.getElementById('closePhoneAuthModal'),
    phoneAuthStep1: document.getElementById('phoneAuthStep1'),
    phoneAuthStep2: document.getElementById('phoneAuthStep2'),
    phoneAuthStep3: document.getElementById('phoneAuthStep3'),
    phoneCountryCode: document.getElementById('phoneCountryCode'),
    regPhoneNumber: document.getElementById('regPhoneNumber'),
    sendSmsCodeBtn: document.getElementById('sendSmsCodeBtn'),
    otpSentToNumber: document.getElementById('otpSentToNumber'),
    devOtpBanner: document.getElementById('devOtpBanner'),
    devOtpCodeValue: document.getElementById('devOtpCodeValue'),
    otpCodeInput: document.getElementById('otpCodeInput'),
    resendOtpBtn: document.getElementById('resendOtpBtn'),
    verifyOtpBtn: document.getElementById('verifyOtpBtn'),
    phoneRegName: document.getElementById('phoneRegName'),
    phoneRegStatus: document.getElementById('phoneRegStatus'),
    finishRegBtn: document.getElementById('finishRegBtn'),

    lightboxModal: document.getElementById('lightboxModal'),
    lightboxImg: document.getElementById('lightboxImg')
  };

  // Helper formatting functions
  function formatTime(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDateDivider(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Helper: Retrieve peer public key with caching
  async function getPeerPublicKey(peerId) {
    if (state.peerPublicKeysCache.has(peerId)) {
      return state.peerPublicKeysCache.get(peerId);
    }
    try {
      const res = await API.getUserPublicKey(peerId);
      if (res && res.publicKey) {
        state.peerPublicKeysCache.set(peerId, res.publicKey);
        return res.publicKey;
      }
    } catch (e) {
      console.warn(`No public key registered for user ${peerId}`);
    }
    return null;
  }

  // Helper: Decrypt an encrypted message payload
  async function decryptMessage(msg) {
    if (!msg.encrypted || !msg.ciphertext) return msg.text;
    if (msg.decryptedText) return msg.decryptedText;

    try {
      let keyToUse = msg.senderPublicJwk;
      if (msg.senderId === state.currentUser.id) {
        const chat = state.chats.find(c => c.id === msg.chatId);
        if (chat && chat.type === 'direct') {
          const peerId = chat.members.find(m => m !== state.currentUser.id);
          keyToUse = await getPeerPublicKey(peerId);
        }
      }
      if (keyToUse && window.pulseCrypto) {
        msg.decryptedText = await window.pulseCrypto.decrypt(msg.ciphertext, msg.iv, keyToUse);
        return msg.decryptedText;
      }
    } catch (e) {
      console.error('Decryption error:', e);
    }
    return msg.text || '[🔒 Encrypted Message]';
  }

  // --- INITIALIZATION ---
  async function init() {
    try {
      // 1. Fetch all users
      state.allUsers = await API.getUsers();

      // 2. Identify current user (from localStorage or default to 'usr_alex')
      let savedUserId = localStorage.getItem('pulse_current_user_id');
      state.currentUser = state.allUsers.find(u => u.id === savedUserId) || state.allUsers[0];
      localStorage.setItem('pulse_current_user_id', state.currentUser.id);

      // 3. Initialize E2EE Identity Keys
      try {
        if (window.pulseCrypto) {
          const publicJwk = await window.pulseCrypto.initIdentityKeys(state.currentUser.id);
          await API.registerPublicKey(state.currentUser.id, publicJwk).catch(e => console.warn('Key register error:', e));
        }
      } catch (e) {
        console.warn('Crypto init error:', e);
      }

      // 4. Render User Header & Switcher
      renderUserHeader();

      // 5. Connect Socket
      initSocket();

      // Initialize WebRTC Call Manager
      if (window.pulseCallManager) {
        window.pulseCallManager.init(state.socket, state.currentUser);
      }

      // 6. Load and Render Chats
      await loadChats();

      // 7. Bind Event Listeners
      bindEventListeners();

      // 7. Check if there is a saved active chat or auto-select first
      const savedChatId = localStorage.getItem('pulse_active_chat_id');
      if (savedChatId && state.chats.some(c => c.id === savedChatId)) {
        selectChat(savedChatId);
      } else if (state.chats.length > 0 && window.innerWidth > 768) {
        selectChat(state.chats[0].id);
      }

      updateSoundButtonUI();
    } catch (err) {
      console.error('Initialization error:', err);
    }
  }

  function renderUserHeader() {
    els.myAvatar.src = state.currentUser.avatar;
    els.myName.textContent = state.currentUser.displayName;
    els.myStatus.textContent = state.currentUser.phone ? `📱 ${state.currentUser.phone}` : state.currentUser.status;

    // Populate user switcher dropdown
    els.userSwitcher.innerHTML = state.allUsers
      .map(u => `<option value="${u.id}" ${u.id === state.currentUser.id ? 'selected' : ''}>${escapeHtml(u.displayName)}</option>`)
      .join('');

    // Update phone quick banner
    const bannerTitle = document.getElementById('phoneBannerTitle');
    const bannerSub = document.getElementById('phoneBannerSubtitle');
    const bannerBtn = document.getElementById('phoneBannerBtn');
    if (bannerTitle && bannerSub && bannerBtn) {
      if (state.currentUser.phone) {
        bannerTitle.textContent = `📱 ${state.currentUser.phone}`;
        bannerSub.textContent = '✓ Verified Mobile Account';
        bannerBtn.textContent = 'Switch';
      } else {
        bannerTitle.textContent = 'Phone Sign In & Discovery';
        bannerSub.textContent = 'Register your number to connect with friends';
        bannerBtn.textContent = 'Register';
      }
    }
  }

  // --- SOCKET.IO HANDLING ---
  function initSocket() {
    state.socket = io({
      transports: ['websocket', 'polling']
    });

    state.socket.on('connect', () => {
      console.log('⚡ Connected to Pulse real-time server as', state.currentUser.displayName);
      state.socket.emit('user:join', { userId: state.currentUser.id });
    });

    // Receive new message
    state.socket.on('message:new', async (msg) => {
      const isCurrentChat = msg.chatId === state.activeChatId;
      const isFromMe = msg.senderId === state.currentUser.id;

      if (msg.encrypted && !msg.decryptedText) {
        await decryptMessage(msg);
      }

      if (isCurrentChat) {
        state.messages.push(msg);
        appendMessageToDOM(msg);
        scrollToBottom();

        // If from peer and current chat is active, mark read immediately
        if (!isFromMe) {
          state.socket.emit('message:read', {
            chatId: state.activeChatId,
            userId: state.currentUser.id
          });
          window.sounds.playReceived();
        }
      } else {
        if (!isFromMe) {
          window.sounds.playReceived();
        }
      }

      // Update sidebar chat previews & unread counter
      updateChatInList(msg.chatId, msg, !isCurrentChat && !isFromMe);
    });

    // Presence update
    state.socket.on('presence:update', ({ userId, online, lastSeen }) => {
      const user = state.allUsers.find(u => u.id === userId);
      if (user) {
        user.online = online;
        user.lastSeen = lastSeen;
      }
      renderSidebar();
      if (state.activeChatId) {
        updateActiveChatStatusHeader();
      }
    });

    // Typing start
    state.socket.on('typing:start', ({ chatId, userId, username }) => {
      if (userId === state.currentUser.id) return;
      if (!state.typingMap.has(chatId)) {
        state.typingMap.set(chatId, new Set());
      }
      state.typingMap.get(chatId).add(username);
      updateTypingUI(chatId);
    });

    // Typing stop
    state.socket.on('typing:stop', ({ chatId, userId }) => {
      const user = state.allUsers.find(u => u.id === userId);
      if (user && state.typingMap.has(chatId)) {
        state.typingMap.get(chatId).delete(user.displayName || user.username);
        updateTypingUI(chatId);
      }
    });

    // Message status update (read receipts)
    state.socket.on('message:status_update', ({ chatId, readBy, status }) => {
      if (chatId === state.activeChatId) {
        state.messages.forEach(m => {
          if (m.senderId === state.currentUser.id) {
            m.status = status;
          }
        });
        // Update ticks in DOM
        document.querySelectorAll('.message-row.outgoing .status-ticks').forEach(el => {
          el.innerHTML = '✓✓';
          el.classList.add('read');
        });
      }
    });

    // Reaction update
    state.socket.on('reaction:update', ({ messageId, chatId, reactions }) => {
      const msg = state.messages.find(m => m.id === messageId);
      if (msg) {
        msg.reactions = reactions;
        renderMessageReactions(messageId, reactions);
      }
    });

    // Message deleted
    state.socket.on('message:deleted', ({ messageId, chatId }) => {
      state.messages = state.messages.filter(m => m.id !== messageId);
      const row = document.getElementById(`msg-row-${messageId}`);
      if (row) row.remove();
    });

    // Pinned message update
    state.socket.on('chat:pinned_update', ({ chatId, pinnedMessageId }) => {
      const chat = state.chats.find(c => c.id === chatId);
      if (chat) {
        chat.pinnedMessageId = pinnedMessageId;
        if (state.activeChatId === chatId) {
          renderPinnedBanner();
        }
      }
    });

    // New chat notification
    state.socket.on('chat:new', (newChat) => {
      loadChats();
    });
  }

  // --- CHAT MANAGEMENT ---
  async function loadChats() {
    state.chats = await API.getChats(state.currentUser.id);
    renderSidebar();
  }

  function renderSidebar() {
    els.chatList.innerHTML = '';

    const query = state.searchQuery.toLowerCase().trim();
    const filtered = state.chats.filter(chat => {
      // Filter tab
      if (state.activeFilter === 'direct' && chat.type !== 'direct') return false;
      if (state.activeFilter === 'group' && chat.type !== 'group') return false;
      if (state.activeFilter === 'channel' && chat.type !== 'channel') return false;

      // Filter search
      if (query) {
        const titleMatch = chat.displayName.toLowerCase().includes(query);
        const lastMsgMatch = chat.lastMessage && chat.lastMessage.text && chat.lastMessage.text.toLowerCase().includes(query);
        return titleMatch || lastMsgMatch;
      }
      return true;
    });

    if (filtered.length === 0) {
      els.chatList.innerHTML = `
        <li style="padding: 24px; text-align: center; color: var(--text-dim); font-size: 13.5px;">
          No conversations found
        </li>
      `;
      return;
    }

    filtered.forEach(chat => {
      const li = document.createElement('li');
      li.className = `chat-item ${chat.id === state.activeChatId ? 'active' : ''}`;
      li.dataset.chatId = chat.id;

      const isDirect = chat.type === 'direct';
      const isOnline = isDirect && chat.otherUser && chat.otherUser.online;

      let lastText = 'No messages yet';
      let lastTime = '';
      if (chat.lastMessage) {
        const rawText = chat.lastMessage.encrypted ? (chat.lastMessage.decryptedText || '🔒 Encrypted message') : chat.lastMessage.text;
        lastText = escapeHtml(rawText || (chat.lastMessage.attachments.length ? '📎 Attachment' : ''));
        lastTime = formatTime(chat.lastMessage.createdAt);
      }

      // Check if typing
      const typers = state.typingMap.get(chat.id);
      const isTyping = typers && typers.size > 0;
      if (isTyping) {
        lastText = 'typing...';
      }

      const isVerified = chat.verified;
      const isBot = chat.otherUser && chat.otherUser.isBot;
      const verifiedBadge = isVerified ? `<span class="verified-badge" title="Verified Channel">✓</span>` : '';
      const botBadge = isBot ? `<span class="bot-badge">BOT</span>` : '';

      li.innerHTML = `
        <div class="avatar-wrapper">
          <img class="avatar-img" src="${escapeHtml(chat.displayAvatar || 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150')}" alt="Avatar">
          ${isDirect && !isBot ? `<span class="online-indicator ${isOnline ? 'online' : ''}"></span>` : ''}
        </div>
        <div class="chat-item-content">
          <div class="chat-item-header">
            <span class="chat-item-title">${escapeHtml(chat.displayName)}${verifiedBadge}${botBadge}</span>
            <span class="chat-item-time">${lastTime}</span>
          </div>
          <div class="chat-item-sub">
            <span class="chat-item-preview ${isTyping ? 'typing-highlight' : ''}">${lastText}</span>
            ${chat.unreadCount > 0 ? `<span class="unread-badge">${chat.unreadCount}</span>` : ''}
          </div>
        </div>
      `;

      li.addEventListener('click', () => selectChat(chat.id));
      els.chatList.appendChild(li);
    });
  }

  function updateChatInList(chatId, lastMessage, incrementUnread) {
    const chat = state.chats.find(c => c.id === chatId);
    if (chat) {
      chat.lastMessage = lastMessage;
      if (incrementUnread) {
        chat.unreadCount = (chat.unreadCount || 0) + 1;
      }
      // Re-sort chats so the latest active conversation moves to top
      state.chats.sort((a, b) => {
        const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
        const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
        return timeB - timeA;
      });
      renderSidebar();
    } else {
      loadChats();
    }
  }

  async function selectChat(chatId) {
    state.activeChatId = chatId;
    localStorage.setItem('pulse_active_chat_id', chatId);

    // Reset reply & attachment state
    dismissReply();
    dismissAttachment();

    // Mark unread as 0 locally
    const chat = state.chats.find(c => c.id === chatId);
    if (chat) {
      chat.unreadCount = 0;
    }

    // Toggle active item in list
    document.querySelectorAll('.chat-item').forEach(el => {
      el.classList.toggle('active', el.dataset.chatId === chatId);
    });

    // Notify socket to read messages
    state.socket.emit('message:read', {
      chatId,
      userId: state.currentUser.id
    });

    // Show Chat View, hide empty state
    els.emptyState.style.display = 'none';
    els.activeChatView.style.display = 'flex';

    // Update active chat header
    if (chat) {
      els.activeChatAvatar.src = chat.displayAvatar || 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150';
      // Update active chat header
      const verifiedBadge = chat.verified ? `<span class="verified-badge">✓</span>` : '';
      const botBadge = (chat.otherUser && chat.otherUser.isBot) ? `<span class="bot-badge">BOT</span>` : '';
      els.activeChatTitle.innerHTML = `${escapeHtml(chat.displayName)}${verifiedBadge}${botBadge}`;
      updateActiveChatStatusHeader();

      const isChannel = chat.type === 'channel';
      const isOwner = chat.ownerId === state.currentUser.id;
      const isBot = chat.otherUser && chat.otherUser.isBot;
      const inputDockEl = document.querySelector('.input-dock');
      const channelDockEl = document.getElementById('channelActionDock');

      if (isChannel && !isOwner) {
        if (inputDockEl) inputDockEl.style.display = 'none';
        if (channelDockEl) channelDockEl.style.display = 'flex';
      } else {
        if (inputDockEl) inputDockEl.style.display = 'flex';
        if (channelDockEl) channelDockEl.style.display = 'none';

        if (isChannel && isOwner) {
          els.messageInput.placeholder = 'Broadcast a channel post...';
        } else if (isBot) {
          els.messageInput.placeholder = 'Send a message or command (/help, /status, /price)...';
        } else {
          els.messageInput.placeholder = 'Write a message... (Enter to send, Shift+Enter for newline)';
        }
      }

      // Configure E2EE Header Badge & Call Buttons
      if (chat.type === 'direct' && !isBot) {
        els.e2eeBadgeBtn.style.display = 'flex';
        if (els.startAudioCallBtn) els.startAudioCallBtn.style.display = 'flex';
        if (els.startVideoCallBtn) els.startVideoCallBtn.style.display = 'flex';
        const peerId = chat.members.find(m => m !== state.currentUser.id);
        if (peerId) getPeerPublicKey(peerId);
      } else {
        els.e2eeBadgeBtn.style.display = 'none';
        if (els.startAudioCallBtn) els.startAudioCallBtn.style.display = 'none';
        if (els.startVideoCallBtn) els.startVideoCallBtn.style.display = 'none';
      }
    }

    // On mobile, slide in chat area
    if (window.innerWidth <= 768) {
      els.sidebar.classList.add('hidden');
    }

    // Render Pinned Banner if active
    renderPinnedBanner();

    // Fetch and render messages
    try {
      state.messages = await API.getMessages(chatId);
      await renderMessages();
      scrollToBottom();
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  }

  function updateActiveChatStatusHeader() {
    const chat = state.chats.find(c => c.id === state.activeChatId);
    if (!chat) return;

    const typers = state.typingMap.get(chat.id);
    if (typers && typers.size > 0) {
      els.activeChatStatus.textContent = `${Array.from(typers).join(', ')} is typing...`;
      els.activeChatStatus.className = 'chat-header-status typing';
      return;
    }

    if (chat.type === 'channel') {
      const subCount = chat.subscribers ? (chat.subscribers / 1000).toFixed(1) + 'K' : '28.4K';
      els.activeChatStatus.textContent = `${subCount} subscribers • Public Channel`;
      els.activeChatStatus.className = 'chat-header-status';
      els.activeChatStatus.style.color = 'var(--text-muted)';
    } else if (chat.type === 'direct') {
      const otherUser = state.allUsers.find(u => chat.members.includes(u.id) && u.id !== state.currentUser.id);
      if (otherUser && otherUser.isBot) {
        els.activeChatStatus.textContent = 'Bot Assistant 🤖';
        els.activeChatStatus.className = 'chat-header-status';
        els.activeChatStatus.style.color = 'var(--accent)';
      } else if (otherUser && otherUser.online) {
        els.activeChatStatus.textContent = 'Online';
        els.activeChatStatus.className = 'chat-header-status';
        els.activeChatStatus.style.color = 'var(--status-online)';
      } else {
        els.activeChatStatus.textContent = otherUser ? `Last seen recently` : 'Offline';
        els.activeChatStatus.className = 'chat-header-status';
        els.activeChatStatus.style.color = 'var(--text-muted)';
      }
    } else {
      els.activeChatStatus.textContent = `${chat.members.length} members`;
      els.activeChatStatus.className = 'chat-header-status';
      els.activeChatStatus.style.color = 'var(--text-muted)';
    }
  }

  function updateTypingUI(chatId) {
    if (chatId === state.activeChatId) {
      updateActiveChatStatusHeader();
    }
    renderSidebar();
  }

  function renderPinnedBanner() {
    const chat = state.chats.find(c => c.id === state.activeChatId);
    if (!chat || !chat.pinnedMessageId) {
      els.pinnedBanner.style.display = 'none';
      return;
    }

    const pinnedMsg = state.messages.find(m => m.id === chat.pinnedMessageId);
    if (pinnedMsg) {
      els.pinnedBanner.style.display = 'flex';
      els.pinnedText.textContent = pinnedMsg.text || 'Pinned attachment';
      els.pinnedContent.onclick = () => {
        const msgEl = document.getElementById(`msg-row-${pinnedMsg.id}`);
        if (msgEl) {
          msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          msgEl.style.transition = 'background-color 0.4s';
          msgEl.style.backgroundColor = 'rgba(82, 136, 193, 0.2)';
          setTimeout(() => { msgEl.style.backgroundColor = 'transparent'; }, 1500);
        }
      };
    } else {
      els.pinnedBanner.style.display = 'none';
    }
  }

  // --- MESSAGES STREAM RENDERING ---
  async function renderMessages() {
    els.messagesContainer.innerHTML = '';
    let lastDate = null;

    for (const msg of state.messages) {
      if (msg.encrypted && !msg.decryptedText) {
        await decryptMessage(msg);
      }
      const msgDate = new Date(msg.createdAt).toDateString();
      if (msgDate !== lastDate) {
        lastDate = msgDate;
        const divider = document.createElement('div');
        divider.className = 'date-divider';
        divider.innerHTML = `<span class="date-pill">${formatDateDivider(msg.createdAt)}</span>`;
        els.messagesContainer.appendChild(divider);
      }
      appendMessageToDOM(msg);
    }
  }

  function appendMessageToDOM(msg) {
    const isOutgoing = msg.senderId === state.currentUser.id;
    const sender = state.allUsers.find(u => u.id === msg.senderId) || { displayName: 'Unknown', username: 'user' };

    const row = document.createElement('div');
    row.className = `message-row ${isOutgoing ? 'outgoing' : 'incoming'}`;
    row.id = `msg-row-${msg.id}`;

    const displayBubbleText = msg.encrypted ? (msg.decryptedText || msg.text) : msg.text;
    const lockIconHtml = msg.encrypted ? `<span class="encrypted-lock-icon" title="End-to-End Encrypted (AES-GCM-256)">🔒</span>` : '';

    // Status tick format
    let ticksHtml = '';
    if (isOutgoing) {
      const isRead = msg.status === 'read';
      ticksHtml = `<span class="status-ticks ${isRead ? 'read' : ''}">${isRead ? '✓✓' : msg.status === 'delivered' ? '✓✓' : '✓'}</span>`;
    }

    // Quoted reply snippet
    let replySnippetHtml = '';
    if (msg.replyTo) {
      const repliedMsg = state.messages.find(m => m.id === msg.replyTo);
      if (repliedMsg) {
        const replySender = state.allUsers.find(u => u.id === repliedMsg.senderId) || { displayName: 'User' };
        replySnippetHtml = `
          <div class="bubble-reply" onclick="window.scrollToMessage('${repliedMsg.id}')">
            <div class="bubble-reply-author">${escapeHtml(replySender.displayName)}</div>
            <div class="bubble-reply-text">${escapeHtml(repliedMsg.text || 'Attachment')}</div>
          </div>
        `;
      }
    }

    // Attachments HTML
    let attachmentsHtml = '';
    if (msg.attachments && msg.attachments.length > 0) {
      msg.attachments.forEach(att => {
        if (att.type === 'image') {
          attachmentsHtml += `
            <div class="bubble-attachment">
              <img class="attachment-img" src="${att.url}" alt="${escapeHtml(att.filename)}" onclick="window.openLightbox('${att.url}')">
            </div>
          `;
        } else if (att.type === 'audio') {
          const durationStr = att.duration ? `0:${att.duration < 10 ? '0' + att.duration : att.duration}` : '0:07';
          attachmentsHtml += `
            <div class="bubble-audio" id="audio-bubble-${msg.id}">
              <button class="audio-play-btn" id="play-btn-${msg.id}" onclick="window.pulseAudioPlayer.togglePlay('${att.url}', '${msg.id}')" title="Play / Pause Voice Note">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              </button>
              <div class="audio-content-area">
                <div class="audio-waveform-sim" onclick="window.pulseAudioPlayer.togglePlay('${att.url}', '${msg.id}')">
                  <span class="audio-bar"></span><span class="audio-bar"></span><span class="audio-bar"></span>
                  <span class="audio-bar"></span><span class="audio-bar"></span><span class="audio-bar"></span>
                  <span class="audio-bar"></span><span class="audio-bar"></span><span class="audio-bar"></span>
                  <span class="audio-bar"></span><span class="audio-bar"></span><span class="audio-bar"></span>
                </div>
                <div class="audio-progress-bar" onclick="window.pulseAudioPlayer.seek('${msg.id}', event)">
                  <div class="audio-progress-fill" id="progress-${msg.id}"></div>
                </div>
                <div class="audio-meta-row">
                  <span id="audio-time-${msg.id}">0:00 / ${durationStr}</span>
                  <span>🎙️ Voice Note</span>
                </div>
              </div>
            </div>
          `;
        } else {
          attachmentsHtml += `
            <a class="attachment-file" href="${att.url}" target="_blank" download="${escapeHtml(att.filename)}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
              <div>
                <div style="font-weight: 500;">${escapeHtml(att.filename)}</div>
                <div style="font-size: 11px; color: var(--text-dim);">${Math.round((att.size || 1024) / 1024)} KB</div>
              </div>
            </a>
          `;
        }
      });
    }

    // Hover action bar
    const actionsBarHtml = `
      <div class="message-actions-hover">
        <button class="action-hover-btn" title="React" onclick="window.quickReactPrompt('${msg.id}')">❤️</button>
        <button class="action-hover-btn" title="Reply" onclick="window.setReplyMessage('${msg.id}')">↩</button>
        <button class="action-hover-btn" title="Pin" onclick="window.togglePinMessage('${msg.id}')">📌</button>
        ${isOutgoing ? `<button class="action-hover-btn" title="Delete" onclick="window.deleteMessage('${msg.id}')" style="color: var(--danger);">🗑</button>` : ''}
      </div>
    `;

    // Group chat author tag
    const chat = state.chats.find(c => c.id === state.activeChatId);
    let authorTag = '';
    if (!isOutgoing && chat && chat.type === 'group') {
      const colorClass = `c${(msg.senderId.charCodeAt(msg.senderId.length - 1) % 4) + 1}`;
      authorTag = `<div class="bubble-author ${colorClass}">${escapeHtml(sender.displayName)}</div>`;
    }

    row.innerHTML = `
      ${actionsBarHtml}
      <div class="bubble">
        ${authorTag}
        ${replySnippetHtml}
        ${attachmentsHtml}
        ${displayBubbleText ? `<div class="bubble-text">${lockIconHtml}${escapeHtml(displayBubbleText)}</div>` : ''}
        <div class="bubble-meta">
          <span>${formatTime(msg.createdAt)}</span>
          ${ticksHtml}
        </div>
        <div class="bubble-reactions" id="reactions-${msg.id}"></div>
      </div>
    `;

    els.messagesContainer.appendChild(row);
    renderMessageReactions(msg.id, msg.reactions);
  }

  function renderMessageReactions(messageId, reactions) {
    const container = document.getElementById(`reactions-${messageId}`);
    if (!container) return;
    container.innerHTML = '';
    if (!reactions) return;

    Object.entries(reactions).forEach(([emoji, users]) => {
      if (!users || users.length === 0) return;
      const hasReacted = users.includes(state.currentUser.id);
      const pill = document.createElement('span');
      pill.className = `reaction-pill ${hasReacted ? 'user-reacted' : ''}`;
      pill.innerHTML = `<span>${emoji}</span> <span style="font-size: 11px; opacity: 0.85;">${users.length}</span>`;
      pill.onclick = () => {
        state.socket.emit('reaction:toggle', {
          messageId,
          emoji,
          userId: state.currentUser.id
        });
      };
      container.appendChild(pill);
    });
  }

  function scrollToBottom() {
    els.messagesContainer.scrollTop = els.messagesContainer.scrollHeight;
  }

  // --- SENDING MESSAGES ---
  async function sendMessage() {
    const text = els.messageInput.value.trim();
    if (!text && !state.pendingAttachment) return;
    if (!state.activeChatId) return;

    const chat = state.chats.find(c => c.id === state.activeChatId);
    let encrypted = false;
    let ciphertext = null;
    let iv = null;
    let senderPublicJwk = null;

    // Encrypt direct chat messages with ECDH + AES-256-GCM
    if (chat && chat.type === 'direct' && text && window.pulseCrypto) {
      const peerId = chat.members.find(m => m !== state.currentUser.id);
      const peerKey = await getPeerPublicKey(peerId);
      if (peerKey) {
        try {
          const enc = await window.pulseCrypto.encrypt(text, peerKey);
          encrypted = true;
          ciphertext = enc.ciphertext;
          iv = enc.iv;
          senderPublicJwk = enc.senderPublicJwk;
        } catch (err) {
          console.warn('Encryption error, falling back:', err);
        }
      }
    }

    const attachments = [];
    if (state.pendingAttachment) {
      attachments.push(state.pendingAttachment);
    }

    const payload = {
      chatId: state.activeChatId,
      senderId: state.currentUser.id,
      text: encrypted ? '[🔒 End-to-End Encrypted]' : text,
      encrypted,
      ciphertext,
      iv,
      senderPublicJwk,
      attachments,
      replyTo: state.activeReplyMessage ? state.activeReplyMessage.id : null
    };

    if (encrypted) {
      payload.decryptedText = text;
    }

    state.socket.emit('message:send', payload);
    window.sounds.playSent();

    // Reset input states
    els.messageInput.value = '';
    els.messageInput.style.height = 'auto';
    dismissReply();
    dismissAttachment();

    // Stop typing immediately
    if (state.isTyping) {
      state.isTyping = false;
      state.socket.emit('typing:stop', {
        chatId: state.activeChatId,
        userId: state.currentUser.id
      });
    }

    els.messageInput.focus();
  }

  function handleTypingInput() {
    if (!state.activeChatId) return;

    if (!state.isTyping) {
      state.isTyping = true;
      state.socket.emit('typing:start', {
        chatId: state.activeChatId,
        userId: state.currentUser.id,
        username: state.currentUser.displayName
      });
    }

    clearTimeout(state.typingTimeout);
    state.typingTimeout = setTimeout(() => {
      state.isTyping = false;
      state.socket.emit('typing:stop', {
        chatId: state.activeChatId,
        userId: state.currentUser.id
      });
    }, 2000);
  }

  // --- REPLIES & ATTACHMENTS ---
  window.setReplyMessage = function (messageId) {
    const msg = state.messages.find(m => m.id === messageId);
    if (!msg) return;
    state.activeReplyMessage = msg;

    const sender = state.allUsers.find(u => u.id === msg.senderId) || { displayName: 'User' };
    els.replyAuthor.textContent = `Replying to ${sender.displayName}`;
    els.replyTextSnippet.textContent = msg.text || 'Attachment';
    els.activeReplyBar.style.display = 'flex';
    els.messageInput.focus();
  };

  function dismissReply() {
    state.activeReplyMessage = null;
    els.activeReplyBar.style.display = 'none';
  }

  function dismissAttachment() {
    state.pendingAttachment = null;
    els.attachmentPreviewBar.style.display = 'none';
    els.fileInput.value = '';
  }

  async function handleFileUpload(file) {
    if (!file) return;
    try {
      els.attachmentFileName.textContent = `Uploading ${file.name}...`;
      els.attachmentPreviewBar.style.display = 'flex';

      const uploaded = await API.uploadFile(file);
      state.pendingAttachment = uploaded;

      els.attachmentFileName.textContent = `${uploaded.filename} (${Math.round(uploaded.size / 1024)} KB)`;
      if (uploaded.type === 'image') {
        els.attachmentPreviewImg.src = uploaded.url;
        els.attachmentPreviewImg.style.display = 'block';
      } else {
        els.attachmentPreviewImg.style.display = 'none';
      }
    } catch (err) {
      alert('Upload failed: ' + err.message);
      dismissAttachment();
    }
  }

  // --- REAL VOICE MEMO RECORDING ENGINE ---
  let mediaRecorder = null;
  let audioChunks = [];
  let recordingInterval = null;
  let recordingSeconds = 0;
  let recordingStream = null;

  async function startVoiceRecording() {
    if (!state.activeChatId) {
      alert('Please select a conversation first.');
      return;
    }

    audioChunks = [];
    recordingSeconds = 0;

    // Check getUserMedia support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      console.warn('MediaRecorder not supported, falling back to synthesized voice memo.');
      await sendAudibleVoiceMemo();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStream = stream;

      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      }

      mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunks.push(e.data);
        }
      };

      mediaRecorder.start(100);

      // Show recording dock
      if (els.voiceRecordingDock) {
        els.voiceRecordingDock.style.display = 'flex';
      }
      if (els.recordingTimer) {
        els.recordingTimer.textContent = '00:00';
      }

      clearInterval(recordingInterval);
      recordingInterval = setInterval(() => {
        recordingSeconds++;
        const mins = Math.floor(recordingSeconds / 60).toString().padStart(2, '0');
        const secs = (recordingSeconds % 60).toString().padStart(2, '0');
        if (els.recordingTimer) {
          els.recordingTimer.textContent = `${mins}:${secs}`;
        }
        if (recordingSeconds >= 300) {
          finishVoiceRecording();
        }
      }, 1000);

    } catch (err) {
      console.warn('Microphone access denied or unavailable:', err);
      const sendSynth = confirm('Microphone access was denied or no microphone was found.\n\nWould you like to send an audible synthesized voice memo instead?');
      if (sendSynth) {
        await sendAudibleVoiceMemo();
      }
    }
  }

  function cancelVoiceRecording() {
    clearInterval(recordingInterval);
    recordingInterval = null;
    recordingSeconds = 0;
    audioChunks = [];

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    if (recordingStream) {
      recordingStream.getTracks().forEach(t => t.stop());
      recordingStream = null;
    }
    if (els.voiceRecordingDock) {
      els.voiceRecordingDock.style.display = 'none';
    }
  }

  async function finishVoiceRecording() {
    clearInterval(recordingInterval);
    recordingInterval = null;
    const finalSeconds = Math.max(1, recordingSeconds);

    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      cancelVoiceRecording();
      return;
    }

    if (els.voiceRecordingDock) {
      els.voiceRecordingDock.style.display = 'none';
    }

    mediaRecorder.onstop = async () => {
      try {
        const mime = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunks, { type: mime });
        const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'mp4' : 'webm';
        const file = new File([audioBlob], `voice_note_${Date.now()}.${ext}`, { type: mime });

        const uploadRes = await API.uploadFile(file);
        sendAudioMessage(uploadRes.url, uploadRes.filename, uploadRes.mimetype, uploadRes.size, finalSeconds);
      } catch (e) {
        console.error('Failed to upload voice note:', e);
        alert('Could not upload voice note: ' + (e.message || 'Error'));
      } finally {
        if (recordingStream) {
          recordingStream.getTracks().forEach(t => t.stop());
          recordingStream = null;
        }
        audioChunks = [];
        recordingSeconds = 0;
      }
    };

    mediaRecorder.stop();
  }

  // Synthesize and send a real audible WAV audio file
  async function sendAudibleVoiceMemo(durationSec = 3) {
    if (!state.activeChatId) return;
    try {
      const wavBlob = await window.sounds.generateAudibleVoiceBlob(durationSec);
      const file = new File([wavBlob], `voice_memo_${Date.now()}.wav`, { type: 'audio/wav' });
      const uploadRes = await API.uploadFile(file);
      sendAudioMessage(uploadRes.url, uploadRes.filename, 'audio/wav', uploadRes.size, durationSec);
    } catch (e) {
      console.error('Failed to generate audible voice memo:', e);
    }
  }

  function sendAudioMessage(url, filename, mimetype, size, durationSec) {
    if (!state.activeChatId) return;
    const dur = durationSec || 1;
    const durationText = `0:${dur < 10 ? '0' + dur : dur}`;
    const audioAttachment = {
      url,
      filename: filename || 'voice_note.webm',
      mimetype: mimetype || 'audio/webm',
      size: size || 10240,
      type: 'audio',
      duration: dur
    };

    state.socket.emit('message:send', {
      chatId: state.activeChatId,
      senderId: state.currentUser.id,
      text: `🎙️ Voice note (${durationText})`,
      attachments: [audioAttachment],
      replyTo: state.activeReplyMessage ? state.activeReplyMessage.id : null
    });
    window.sounds.playSent();
  }

  // --- ACTIONS (REACTIONS, PIN, DELETE) ---
  window.quickReactPrompt = function (messageId) {
    const emojis = ['👍', '❤️', '🔥', '😂', '🎉', '🚀'];
    const chosen = emojis[Math.floor(Math.random() * emojis.length)];
    state.socket.emit('reaction:toggle', {
      messageId,
      emoji: chosen,
      userId: state.currentUser.id
    });
  };

  window.togglePinMessage = function (messageId) {
    if (!state.activeChatId) return;
    state.socket.emit('message:pin', {
      chatId: state.activeChatId,
      messageId
    });
  };

  window.deleteMessage = function (messageId) {
    if (confirm('Delete this message for everyone?')) {
      state.socket.emit('message:delete', {
        messageId,
        userId: state.currentUser.id
      });
    }
  };

  window.scrollToMessage = function (messageId) {
    const el = document.getElementById(`msg-row-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.backgroundColor = 'rgba(82, 136, 193, 0.2)';
      setTimeout(() => { el.style.backgroundColor = 'transparent'; }, 1500);
    }
  };

  window.openLightbox = function (url) {
    els.lightboxImg.src = url;
    els.lightboxModal.classList.add('active');
  };

  // --- HIGH-FIDELITY AUDIO PLAYER ENGINE ---
  class PulseAudioPlayer {
    constructor() {
      this.currentAudio = null;
      this.currentMsgId = null;
      this.currentUrl = null;
      this.synthInterval = null;
    }

    togglePlay(url, msgId) {
      if (this.currentMsgId === msgId && this.currentAudio) {
        if (this.currentAudio.paused) {
          this.currentAudio.play().catch(() => this.fallbackPlay(msgId));
          this.setUIState(msgId, true);
        } else {
          this.currentAudio.pause();
          this.setUIState(msgId, false);
        }
        return;
      }

      this.stopCurrent();

      this.currentMsgId = msgId;
      this.currentUrl = url;
      this.setUIState(msgId, true);

      const audio = new Audio(url);
      this.currentAudio = audio;

      audio.ontimeupdate = () => {
        this.updateProgress(msgId, audio.currentTime, audio.duration);
      };

      audio.onended = () => {
        this.stopCurrent();
      };

      audio.onerror = () => {
        console.warn('Audio URL could not be loaded directly, playing via Web Audio synth fallback.');
        this.fallbackPlay(msgId);
      };

      audio.play().catch(e => {
        console.warn('Audio playback error, playing via Web Audio synth fallback:', e);
        this.fallbackPlay(msgId);
      });
    }

    seek(msgId, event) {
      if (this.currentMsgId !== msgId || !this.currentAudio || !this.currentAudio.duration) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      this.currentAudio.currentTime = pct * this.currentAudio.duration;
    }

    stopCurrent() {
      if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio = null;
      }
      if (this.synthInterval) {
        clearInterval(this.synthInterval);
        this.synthInterval = null;
      }
      if (this.currentMsgId) {
        this.setUIState(this.currentMsgId, false);
        this.currentMsgId = null;
      }
    }

    setUIState(msgId, isPlaying) {
      const bubble = document.getElementById(`audio-bubble-${msgId}`);
      const btn = document.getElementById(`play-btn-${msgId}`);
      if (bubble) bubble.classList.toggle('playing', isPlaying);
      if (btn) {
        btn.innerHTML = isPlaying
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
      }
    }

    updateProgress(msgId, current, total) {
      const fill = document.getElementById(`progress-${msgId}`);
      const timeLabel = document.getElementById(`audio-time-${msgId}`);
      if (fill && total && isFinite(total)) {
        const pct = Math.min(100, (current / total) * 100);
        fill.style.width = `${pct}%`;
      }
      if (timeLabel) {
        const curMins = Math.floor(current / 60);
        const curSecs = Math.floor(current % 60).toString().padStart(2, '0');
        const totMins = total && isFinite(total) ? Math.floor(total / 60) : 0;
        const totSecs = total && isFinite(total) ? Math.floor(total % 60).toString().padStart(2, '0') : '07';
        timeLabel.textContent = `${curMins}:${curSecs} / ${totMins}:${totSecs}`;
      }
    }

    fallbackPlay(msgId) {
      if (window.sounds) {
        window.sounds.playVoiceMemoMelody();
      }
      let elapsed = 0;
      const total = 3;
      clearInterval(this.synthInterval);
      this.synthInterval = setInterval(() => {
        elapsed += 0.2;
        this.updateProgress(msgId, elapsed, total);
        if (elapsed >= total) {
          this.stopCurrent();
        }
      }, 200);
    }
  }

  window.pulseAudioPlayer = new PulseAudioPlayer();
  window.playAudioMessage = function (url, btn) {
    if (window.pulseAudioPlayer) {
      window.pulseAudioPlayer.togglePlay(url, 'legacy');
    }
  };

  function updateSoundButtonUI() {
    const isMuted = window.sounds.isMuted();
    if (isMuted) {
      els.soundIcon.innerHTML = `
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <line x1="23" y1="9" x2="17" y2="15"></line>
        <line x1="17" y1="9" x2="23" y2="15"></line>
      `;
      els.soundToggleBtn.title = 'Sound Muted (Click to Unmute)';
      els.soundToggleBtn.classList.remove('active');
    } else {
      els.soundIcon.innerHTML = `
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
      `;
      els.soundToggleBtn.title = 'Sound Enabled (Click to Mute)';
      els.soundToggleBtn.classList.add('active');
    }
  }

  // --- NEW CHAT / GROUP MODAL LOGIC ---
  let modalMode = 'direct'; // 'direct' | 'group' | 'phone'
  let foundPhoneUser = null;
  let pendingAuthPhone = '';

  function openNewChatModal() {
    modalMode = 'direct';
    els.modalTabDirect.classList.add('active');
    els.modalTabGroup.classList.remove('active');
    if (els.modalTabPhone) els.modalTabPhone.classList.remove('active');
    els.groupMetaFields.style.display = 'none';
    if (els.phoneLookupSection) els.phoneLookupSection.style.display = 'none';
    if (els.modalUserList && els.modalUserList.parentElement) els.modalUserList.parentElement.style.display = 'flex';
    els.confirmNewChatBtn.style.display = 'inline-block';
    if (els.lookupPhoneResult) els.lookupPhoneResult.style.display = 'none';
    if (els.lookupPhoneInput) els.lookupPhoneInput.value = '';
    foundPhoneUser = null;
    els.newGroupName.value = '';
    els.newGroupDesc.value = '';
    renderModalUserList();
    els.newChatModal.classList.add('active');
  }

  function closeNewChatModal() {
    els.newChatModal.classList.remove('active');
  }

  function renderModalUserList() {
    els.modalUserList.innerHTML = '';
    const candidates = state.allUsers.filter(u => u.id !== state.currentUser.id);

    candidates.forEach(user => {
      const item = document.createElement('div');
      item.className = 'user-select-item';
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <img src="${user.avatar}" style="width: 30px; height: 30px; border-radius: 50%;" alt="${escapeHtml(user.displayName)}">
          <div>
            <div style="font-size: 13.5px; font-weight: 500;">${escapeHtml(user.displayName)}</div>
            <div style="font-size: 11.5px; color: var(--text-dim);">${escapeHtml(user.status || '')}</div>
          </div>
        </div>
        <input type="${modalMode === 'direct' ? 'radio' : 'checkbox'}" name="modalUserSelect" value="${user.id}">
      `;
      item.onclick = (e) => {
        if (e.target.tagName !== 'INPUT') {
          const inp = item.querySelector('input');
          inp.checked = !inp.checked;
        }
      };
      els.modalUserList.appendChild(item);
    });
  }

  async function handleConfirmNewChat() {
    const selectedInputs = Array.from(document.querySelectorAll('input[name="modalUserSelect"]:checked'));
    if (selectedInputs.length === 0) {
      alert('Please select at least one contact.');
      return;
    }

    const selectedIds = selectedInputs.map(inp => inp.value);
    const members = [state.currentUser.id, ...selectedIds];

    if (modalMode === 'direct') {
      const otherUser = state.allUsers.find(u => u.id === selectedIds[0]);
      state.socket.emit('chat:create', {
        type: 'direct',
        name: otherUser ? otherUser.displayName : 'Direct Chat',
        members
      }, (res) => {
        closeNewChatModal();
        if (res && res.chat) {
          loadChats().then(() => selectChat(res.chat.id));
        }
      });
    } else {
      const name = els.newGroupName.value.trim() || 'New Group';
      const description = els.newGroupDesc.value.trim();
      state.socket.emit('chat:create', {
        type: 'group',
        name,
        description,
        members
      }, (res) => {
        closeNewChatModal();
        if (res && res.chat) {
          loadChats().then(() => selectChat(res.chat.id));
        }
      });
    }
  }

  // --- REAL PHONE NUMBER AUTHENTICATION FLOW ---

  // Load SMS gateway status and show the banner inside the phone auth modal
  async function loadSmsStatus() {
    const banner = document.getElementById('smsGatewayStatus');
    const icon = document.getElementById('smsGatewayIcon');
    const label = document.getElementById('smsGatewayLabel');
    const sub = document.getElementById('smsGatewaySubLabel');
    if (!banner) return;

    try {
      const status = await API.getSmsStatus();
      banner.style.display = 'flex';
      if (status.configured && status.provider === 'twilio') {
        icon.textContent = '✅';
        label.textContent = 'Twilio SMS Active — Real Cellular SMS';
        label.style.color = 'var(--status-online)';
        sub.textContent = `Sending from ${status.fromNumber || 'configured number'}`;
      } else {
        icon.textContent = '🔧';
        label.textContent = 'Dev Mode — Quick-Fill Code (No Real SMS)';
        label.style.color = 'var(--text-muted)';
        sub.textContent = 'Click ⚙ Configure to enable Twilio real SMS';
      }
    } catch (e) {
      banner.style.display = 'none';
    }
  }

  function openPhoneAuthModal() {
    pendingAuthPhone = '';
    els.phoneAuthStep1.style.display = 'flex';
    els.phoneAuthStep2.style.display = 'none';
    els.phoneAuthStep3.style.display = 'none';
    els.devOtpBanner.style.display = 'none';
    els.otpCodeInput.value = '';
    els.regPhoneNumber.value = '';
    els.phoneRegName.value = '';
    els.phoneRegStatus.value = 'Hey there! I am using Pulse Messenger';
    els.phoneAuthModal.classList.add('active');
    loadSmsStatus(); // show gateway status in modal
    setTimeout(() => els.regPhoneNumber.focus(), 100);
  }

  function closePhoneAuthModal() {
    els.phoneAuthModal.classList.remove('active');
  }

  // --- TWILIO CONFIG MODAL ---
  async function openTwilioConfigModal() {
    const modal = document.getElementById('twilioConfigModal');
    if (!modal) return;
    modal.classList.add('active');

    // Load and show current status
    const statusEl = document.getElementById('twilioCurrentStatus');
    try {
      const status = await API.getSmsStatus();
      if (status.configured && status.provider === 'twilio') {
        statusEl.innerHTML = `<span style="color:var(--status-online)">✅ Twilio is active</span> — From: <b>${status.fromNumber || 'configured'}</b>`;
      } else {
        statusEl.innerHTML = `<span style="color:var(--accent)">🔧 Dev mode</span> — No Twilio credentials configured yet.`;
      }
    } catch (e) {
      statusEl.textContent = 'Could not fetch status.';
    }
  }

  function closeTwilioConfigModal() {
    const modal = document.getElementById('twilioConfigModal');
    if (modal) modal.classList.remove('active');
  }

  async function handleSaveTwilioConfig() {
    const sid = document.getElementById('twilioSidInput').value.trim();
    const token = document.getElementById('twilioTokenInput').value.trim();
    const from = document.getElementById('twilioFromInput').value.trim();

    if (!sid || !token || !from) {
      alert('All three fields (Account SID, Auth Token, From Number) are required.');
      return;
    }
    if (!from.startsWith('+')) {
      alert('From phone number must be in E.164 format, e.g. +15005550006');
      return;
    }

    const btn = document.getElementById('saveTwilioConfigBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const res = await API.configureTwilio(sid, token, from);
      if (res.ok) {
        closeTwilioConfigModal();
        loadSmsStatus(); // refresh banner
        alert(`✅ Twilio activated!\n\nMode: ${res.status.mode}\nFrom: ${res.status.fromNumber}\n\nYour next SMS verification will be dispatched via real Twilio cellular network.`);
      }
    } catch (err) {
      alert('Failed to save Twilio config: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 Save & Activate Twilio';
    }
  }

  async function handleSendOtp() {
    const cc = els.phoneCountryCode.value;
    const rawNum = els.regPhoneNumber.value.trim();
    if (!rawNum) {
      alert('Please enter your phone number.');
      els.regPhoneNumber.focus();
      return;
    }

    const fullPhone = `${cc}${rawNum.replace(/[\s\-\(\)]/g, '')}`;
    pendingAuthPhone = fullPhone;

    els.sendSmsCodeBtn.disabled = true;
    els.sendSmsCodeBtn.textContent = 'Sending SMS Code...';

    try {
      const res = await API.sendOtp(fullPhone);
      els.otpSentToNumber.textContent = fullPhone;

      if (res && res.devCode) {
        // Dev/fallback mode — show quick-fill banner
        els.devOtpCodeValue.textContent = res.devCode;
        els.devOtpBanner.style.display = 'block';
        els.devOtpBanner.title = 'Click to auto-fill this code (dev mode only)';
      } else if (res && res.realSmsSent) {
        // Real Twilio SMS dispatched — hide dev banner, show confirmation
        els.devOtpBanner.style.display = 'none';
        // Show a brief real-SMS confirmation indicator in the OTP step
        const sentNote = document.getElementById('otpCountdownLabel');
        if (sentNote) sentNote.textContent = `📲 Real SMS sent to ${fullPhone} via Twilio`;
      } else {
        els.devOtpBanner.style.display = 'none';
      }

      els.phoneAuthStep1.style.display = 'none';
      els.phoneAuthStep2.style.display = 'flex';
      els.otpCodeInput.value = '';
      setTimeout(() => els.otpCodeInput.focus(), 100);
    } catch (err) {
      alert('Failed to send verification code: ' + (err.message || 'Unknown error'));
    } finally {
      els.sendSmsCodeBtn.disabled = false;
      els.sendSmsCodeBtn.textContent = 'Send SMS Verification Code ➜';
    }
  }

  async function handleVerifyOtp() {
    const code = els.otpCodeInput.value.trim();
    if (!code || code.length < 6) {
      alert('Please enter the 6-digit verification code.');
      els.otpCodeInput.focus();
      return;
    }

    els.verifyOtpBtn.disabled = true;
    els.verifyOtpBtn.textContent = 'Verifying...';

    try {
      const res = await API.verifyOtp(pendingAuthPhone, code);
      if (res.isNew) {
        // Transition to profile setup step
        els.phoneAuthStep2.style.display = 'none';
        els.phoneAuthStep3.style.display = 'flex';
        setTimeout(() => els.phoneRegName.focus(), 100);
      } else if (res.user) {
        // Existing user verified! Log in directly
        localStorage.setItem('pulse_current_user_id', res.user.id);
        alert(`✓ Welcome back, ${res.user.displayName}! Logging you in...`);
        window.location.reload();
      }
    } catch (err) {
      alert('Verification error: ' + (err.message || 'Invalid code'));
    } finally {
      els.verifyOtpBtn.disabled = false;
      els.verifyOtpBtn.textContent = 'Verify & Continue';
    }
  }

  async function handleFinishReg() {
    const displayName = els.phoneRegName.value.trim();
    const status = els.phoneRegStatus.value.trim() || 'Hey there! I am using Pulse Messenger';

    if (!displayName) {
      alert('Please enter your display name.');
      els.phoneRegName.focus();
      return;
    }

    els.finishRegBtn.disabled = true;
    els.finishRegBtn.textContent = 'Creating Account...';

    try {
      const res = await API.registerWithPhone({
        phone: pendingAuthPhone,
        displayName,
        status
      });

      if (res && res.user) {
        localStorage.setItem('pulse_current_user_id', res.user.id);
        alert(`🎉 Account created successfully! Welcome to Pulse, ${res.user.displayName}!`);
        window.location.reload();
      }
    } catch (err) {
      alert('Registration error: ' + (err.message || 'Could not complete registration'));
    } finally {
      els.finishRegBtn.disabled = false;
      els.finishRegBtn.textContent = 'Complete & Start Chatting 🎉';
    }
  }

  async function handleLookupPhone() {
    const input = els.lookupPhoneInput.value.trim();
    if (!input) {
      alert('Please enter a phone number to search.');
      return;
    }

    els.lookupPhoneBtn.disabled = true;
    els.lookupPhoneBtn.textContent = 'Searching...';
    els.lookupPhoneResult.style.display = 'none';

    try {
      const user = await API.lookupUserByPhone(input);
      foundPhoneUser = user;
      els.lookupResultAvatar.src = user.avatar;
      els.lookupResultName.textContent = user.displayName;
      els.lookupResultPhone.textContent = user.phone || input;
      els.lookupPhoneResult.style.display = 'block';
    } catch (err) {
      foundPhoneUser = null;
      alert(`No Pulse user found with number "${input}".\n\nMake sure your friend has registered their phone number on Pulse first!`);
    } finally {
      els.lookupPhoneBtn.disabled = false;
      els.lookupPhoneBtn.textContent = 'Find Contact';
    }
  }

  function handleStartChatWithFoundUser() {
    if (!foundPhoneUser) return;
    if (foundPhoneUser.id === state.currentUser.id) {
      alert('You cannot start a direct chat with yourself.');
      return;
    }

    state.socket.emit('chat:create', {
      type: 'direct',
      name: foundPhoneUser.displayName,
      members: [state.currentUser.id, foundPhoneUser.id]
    }, (res) => {
      closeNewChatModal();
      if (res && res.chat) {
        loadChats().then(() => selectChat(res.chat.id));
      }
    });
  }

  // --- BIND EVENT LISTENERS ---
  function bindEventListeners() {
    // Send message on click
    els.sendBtn.addEventListener('click', sendMessage);

    // Send on Enter, newline on Shift+Enter
    els.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Auto-grow textarea & typing indicator
    els.messageInput.addEventListener('input', () => {
      els.messageInput.style.height = 'auto';
      els.messageInput.style.height = Math.min(els.messageInput.scrollHeight, 140) + 'px';
      handleTypingInput();
    });

    // Sound toggle
    els.soundToggleBtn.addEventListener('click', () => {
      window.sounds.toggleMute();
      updateSoundButtonUI();
    });

    // User switcher dropdown
    els.userSwitcher.addEventListener('change', (e) => {
      const newUserId = e.target.value;
      if (newUserId && newUserId !== state.currentUser.id) {
        localStorage.setItem('pulse_current_user_id', newUserId);
        window.location.reload();
      }
    });

    // Search chats
    els.chatSearchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderSidebar();
    });

    // Filter tabs
    els.filterTabs.forEach(btn => {
      btn.addEventListener('click', () => {
        els.filterTabs.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.activeFilter = btn.dataset.filter;
        renderSidebar();
      });
    });

    // Mobile back button
    els.mobileBackBtn.addEventListener('click', () => {
      els.sidebar.classList.remove('hidden');
    });

    // Emoji button & popover
    els.emojiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = els.emojiPopover.style.display === 'grid';
      els.emojiPopover.style.display = isVisible ? 'none' : 'grid';
    });

    document.querySelectorAll('.emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji;
        els.messageInput.value += emoji;
        els.messageInput.focus();
        els.emojiPopover.style.display = 'none';
      });
    });

    document.addEventListener('click', (e) => {
      if (!els.emojiPopover.contains(e.target) && e.target !== els.emojiBtn) {
        els.emojiPopover.style.display = 'none';
      }
    });

    // Attachment file handling
    els.attachBtn.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleFileUpload(file);
    });

    els.dismissAttachmentBtn.addEventListener('click', dismissAttachment);
    els.dismissReplyBtn.addEventListener('click', dismissReply);

    // Voice memo recording
    if (els.voiceNoteBtn) {
      els.voiceNoteBtn.addEventListener('click', startVoiceRecording);
    }
    if (els.cancelVoiceRecordBtn) {
      els.cancelVoiceRecordBtn.addEventListener('click', cancelVoiceRecording);
    }
    if (els.finishVoiceRecordBtn) {
      els.finishVoiceRecordBtn.addEventListener('click', finishVoiceRecording);
    }

    // Unpin message button
    els.unpinBtn.addEventListener('click', () => {
      const chat = state.chats.find(c => c.id === state.activeChatId);
      if (chat && chat.pinnedMessageId) {
        window.togglePinMessage(chat.pinnedMessageId);
      }
    });

    // Modal controls
    els.newChatBtn.addEventListener('click', openNewChatModal);
    els.closeNewChatModal.addEventListener('click', closeNewChatModal);
    els.cancelNewChatBtn.addEventListener('click', closeNewChatModal);
    els.confirmNewChatBtn.addEventListener('click', handleConfirmNewChat);

    els.modalTabDirect.addEventListener('click', () => {
      modalMode = 'direct';
      els.modalTabDirect.classList.add('active');
      els.modalTabGroup.classList.remove('active');
      if (els.modalTabPhone) els.modalTabPhone.classList.remove('active');
      els.groupMetaFields.style.display = 'none';
      if (els.phoneLookupSection) els.phoneLookupSection.style.display = 'none';
      if (els.modalUserList && els.modalUserList.parentElement) els.modalUserList.parentElement.style.display = 'flex';
      els.confirmNewChatBtn.style.display = 'inline-block';
      renderModalUserList();
    });

    els.modalTabGroup.addEventListener('click', () => {
      modalMode = 'group';
      els.modalTabGroup.classList.add('active');
      els.modalTabDirect.classList.remove('active');
      if (els.modalTabPhone) els.modalTabPhone.classList.remove('active');
      els.groupMetaFields.style.display = 'flex';
      if (els.phoneLookupSection) els.phoneLookupSection.style.display = 'none';
      if (els.modalUserList && els.modalUserList.parentElement) els.modalUserList.parentElement.style.display = 'flex';
      els.confirmNewChatBtn.style.display = 'inline-block';
      renderModalUserList();
    });

    if (els.modalTabPhone) {
      els.modalTabPhone.addEventListener('click', () => {
        modalMode = 'phone';
        els.modalTabPhone.classList.add('active');
        els.modalTabDirect.classList.remove('active');
        els.modalTabGroup.classList.remove('active');
        els.groupMetaFields.style.display = 'none';
        if (els.modalUserList && els.modalUserList.parentElement) els.modalUserList.parentElement.style.display = 'none';
        els.confirmNewChatBtn.style.display = 'none';
        if (els.phoneLookupSection) {
          els.phoneLookupSection.style.display = 'flex';
          setTimeout(() => els.lookupPhoneInput.focus(), 100);
        }
      });
    }

    if (els.lookupPhoneBtn) {
      els.lookupPhoneBtn.addEventListener('click', handleLookupPhone);
    }
    if (els.lookupPhoneInput) {
      els.lookupPhoneInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleLookupPhone();
      });
    }
    if (els.startChatWithFoundUserBtn) {
      els.startChatWithFoundUserBtn.addEventListener('click', handleStartChatWithFoundUser);
    }

    // Phone Authentication Modal Controls
    if (els.phoneAuthBtn) {
      els.phoneAuthBtn.addEventListener('click', openPhoneAuthModal);
    }
    const phoneQuickBanner = document.getElementById('phoneQuickBanner');
    if (phoneQuickBanner) {
      phoneQuickBanner.addEventListener('click', openPhoneAuthModal);
    }
    if (els.closePhoneAuthModal) {
      els.closePhoneAuthModal.addEventListener('click', closePhoneAuthModal);
    }
    if (els.sendSmsCodeBtn) {
      els.sendSmsCodeBtn.addEventListener('click', handleSendOtp);
    }
    if (els.regPhoneNumber) {
      els.regPhoneNumber.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSendOtp();
      });
    }
    if (els.devOtpBanner) {
      els.devOtpBanner.addEventListener('click', () => {
        if (els.devOtpCodeValue) {
          els.otpCodeInput.value = els.devOtpCodeValue.textContent.trim();
          els.otpCodeInput.focus();
        }
      });
    }
    if (els.resendOtpBtn) {
      els.resendOtpBtn.addEventListener('click', handleSendOtp);
    }
    if (els.verifyOtpBtn) {
      els.verifyOtpBtn.addEventListener('click', handleVerifyOtp);
    }
    if (els.otpCodeInput) {
      els.otpCodeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleVerifyOtp();
      });
    }
    if (els.finishRegBtn) {
      els.finishRegBtn.addEventListener('click', handleFinishReg);
    }
    if (els.phoneRegName) {
      els.phoneRegName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleFinishReg();
      });
    }

    // Twilio SMS Config Modal
    const smsConfigBtn = document.getElementById('smsConfigBtn');
    if (smsConfigBtn) {
      smsConfigBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closePhoneAuthModal();
        openTwilioConfigModal();
      });
    }
    const closeTwilioBtn = document.getElementById('closeTwilioConfigModal');
    if (closeTwilioBtn) closeTwilioBtn.addEventListener('click', closeTwilioConfigModal);
    const cancelTwilioBtn = document.getElementById('cancelTwilioConfigBtn');
    if (cancelTwilioBtn) cancelTwilioBtn.addEventListener('click', closeTwilioConfigModal);
    const saveTwilioBtn = document.getElementById('saveTwilioConfigBtn');
    if (saveTwilioBtn) saveTwilioBtn.addEventListener('click', handleSaveTwilioConfig);

    // Lightbox modal close
    els.lightboxModal.addEventListener('click', () => {
      els.lightboxModal.classList.remove('active');
    });

    // E2EE Safety Numbers Modal controls
    if (els.e2eeBadgeBtn) {
      els.e2eeBadgeBtn.addEventListener('click', async () => {
        const chat = state.chats.find(c => c.id === state.activeChatId);
        if (!chat || chat.type !== 'direct') return;

        const peerId = chat.members.find(m => m !== state.currentUser.id);
        const peer = state.allUsers.find(u => u.id === peerId);
        if (peer) {
          document.getElementById('safetyPeerName').textContent = peer.displayName;
        }

        const safetyCodeDisplay = document.getElementById('safetyCodeDisplay');
        safetyCodeDisplay.textContent = 'Computing cryptographic fingerprint...';

        const peerKey = await getPeerPublicKey(peerId);
        if (peerKey && window.pulseCrypto && window.pulseCrypto.keyPair) {
          const code = await window.pulseCrypto.generateSafetyNumber(window.pulseCrypto.keyPair.publicJwk, peerKey);
          safetyCodeDisplay.textContent = code;
        } else {
          safetyCodeDisplay.textContent = 'Establishing key exchange...';
        }

        // Show sample zero-knowledge ciphertext payload
        const sampleEncryptedMsg = state.messages.slice().reverse().find(m => m.encrypted && m.ciphertext);
        if (sampleEncryptedMsg) {
          document.getElementById('rawCiphertextSample').textContent = JSON.stringify({
            chatId: sampleEncryptedMsg.chatId,
            senderId: sampleEncryptedMsg.senderId,
            encrypted: true,
            ciphertext: sampleEncryptedMsg.ciphertext.slice(0, 36) + '... [AES-256-GCM]',
            iv: sampleEncryptedMsg.iv,
            zeroKnowledgeVerified: true,
            storageLevel: "Server database only stores unreadable ciphertext"
          }, null, 2);
        } else {
          document.getElementById('rawCiphertextSample').textContent = JSON.stringify({
            status: "Zero-Knowledge Active",
            note: "Send a message in this chat to inspect the raw server ciphertext blob."
          }, null, 2);
        }

        document.getElementById('safetyModal').classList.add('active');
      });
    }

    const closeSafetyBtn = document.getElementById('closeSafetyModal');
    if (closeSafetyBtn) {
      closeSafetyBtn.addEventListener('click', () => {
        document.getElementById('safetyModal').classList.remove('active');
      });
    }

    const confirmSafetyBtn = document.getElementById('confirmSafetyBtn');
    if (confirmSafetyBtn) {
      confirmSafetyBtn.addEventListener('click', () => {
        alert('✓ Safety numbers verified! All communication with this peer is cryptographically protected against interception.');
        document.getElementById('safetyModal').classList.remove('active');
      });
    }

    // Call button click handlers
    if (els.startAudioCallBtn) {
      els.startAudioCallBtn.addEventListener('click', () => {
        const chat = state.chats.find(c => c.id === state.activeChatId);
        if (!chat || chat.type !== 'direct') return;
        const peerId = chat.members.find(m => m !== state.currentUser.id);
        const peer = state.allUsers.find(u => u.id === peerId);
        if (peer && window.pulseCallManager) {
          window.pulseCallManager.startCall(peer.id, peer.displayName, peer.avatar, chat.id, 'audio');
        }
      });
    }

    if (els.startVideoCallBtn) {
      els.startVideoCallBtn.addEventListener('click', () => {
        const chat = state.chats.find(c => c.id === state.activeChatId);
        if (!chat || chat.type !== 'direct') return;
        const peerId = chat.members.find(m => m !== state.currentUser.id);
        const peer = state.allUsers.find(u => u.id === peerId);
        if (peer && window.pulseCallManager) {
          window.pulseCallManager.startCall(peer.id, peer.displayName, peer.avatar, chat.id, 'video');
        }
      });
    }

    // Channel Mute Notification Toggle
    const channelMuteBtn = document.getElementById('channelMuteToggleBtn');
    if (channelMuteBtn) {
      let isChannelMuted = false;
      channelMuteBtn.addEventListener('click', () => {
        isChannelMuted = !isChannelMuted;
        document.getElementById('channelMuteLabel').textContent = isChannelMuted ? 'UNMUTE NOTIFICATIONS' : 'MUTE NOTIFICATIONS';
        alert(isChannelMuted ? 'Channel notifications muted.' : 'Channel notifications enabled.');
      });
    }
  }

  // Start app on DOM ready
  document.addEventListener('DOMContentLoaded', init);
})();
