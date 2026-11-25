// REST API client for Pulse Messenger
const API = {
  baseUrl: '',

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP error ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      console.error(`API Error on ${endpoint}:`, err);
      throw err;
    }
  },

  async getUsers() {
    return this.request('/api/users');
  },

  async loginUser(username, displayName, avatar, status) {
    return this.request('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, displayName, avatar, status })
    });
  },

  async getChats(userId) {
    return this.request(`/api/chats?userId=${encodeURIComponent(userId)}`);
  },

  async createChat(data) {
    return this.request('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },

  async getMessages(chatId) {
    return this.request(`/api/chats/${encodeURIComponent(chatId)}/messages`);
  },

  async uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    return this.request('/api/upload', {
      method: 'POST',
      body: formData
    });
  },

  async registerPublicKey(userId, publicKey) {
    return this.request(`/api/users/${encodeURIComponent(userId)}/key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicKey })
    });
  },

  async getUserPublicKey(userId) {
    return this.request(`/api/users/${encodeURIComponent(userId)}/key`);
  },

  // Phone Authentication & Contact Discovery
  async sendOtp(phone) {
    return this.request('/api/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
  },

  async verifyOtp(phone, code) {
    return this.request('/api/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code })
    });
  },

  async registerWithPhone(data) {
    return this.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },

  async lookupUserByPhone(phone) {
    return this.request(`/api/users/lookup?phone=${encodeURIComponent(phone)}`);
  },

  // SMS Provider configuration & status
  async getSmsStatus() {
    return this.request('/api/auth/sms-status');
  },

  async configureTwilio(accountSid, authToken, fromNumber) {
    return this.request('/api/auth/sms-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountSid, authToken, fromNumber })
    });
  }
};

window.API = API;
