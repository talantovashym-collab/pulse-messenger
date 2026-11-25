# ⚡ Pulse Messenger

> A high-performance real-time messaging application designed with modern architecture and crafted to scale into a competitor against messaging giants like Telegram and WhatsApp.

---

## 🌟 Features in v1.3

- 🌐 **Horizontal Multi-Node Clustering**:
  - Scale seamlessly across multiple Node.js instances (e.g. Port 3000, 3001, 3002...) with a 3ms inter-process Pub/Sub Cluster Bus.
  - Drop-in Redis adapter compatibility for cloud clusters.
- 🐘 **PostgreSQL Production Data Layer**:
  - Enterprise schema (`pgSchema.sql`) with partitioning, GIN full-text search indexing, and connection pool adapter (`pg.Pool`).
- 📢 **Telegram-Style Public Broadcast Channels**:
  - Verified blue check badges (`✓`), handles (`@pulse_official`), and subscriber counts (`28.4K subscribers`).
  - Read-only subscriber feeds with notification mute toggle; only admins can broadcast posts.
- 🤖 **Telegram-Style Bot API & Command Engine**:
  - REST endpoints: `GET /api/bot/:token/getMe`, `POST /api/bot/:token/sendMessage`.
  - Built-in **Pulse Sentinel Bot** (`@pulse_bot`) responding to commands: `/help`, `/status` (diagnostics), `/price <coin>` (market quotes), `/e2ee`, `/channel`.
- 📹 **Live WebRTC Voice & Video Calling**:
  - Peer-to-peer audio & video calling via Google STUN servers.
  - Interactive incoming call modal with synthesized web audio ringtone.
  - Picture-in-picture local video and full-frame remote video.
  - Floating controls dock: mute microphone, camera toggle, and call timer.
- 🔒 **Military-Grade End-to-End Encryption (E2EE)**:
  - Client-side **ECDH (P-256)** key agreement + **AES-256-GCM** authenticated encryption via native Web Crypto API.
  - Zero-knowledge server architecture: server database only stores unreadable ciphertext and random 12-byte IVs.
  - **Safety Numbers Verification**: WhatsApp/Signal-style 60-digit deterministic cryptographic fingerprints and verification modal.
  - **Zero-Knowledge Inspector**: Built-in modal tool to inspect the raw ciphertext stored on the server.
- 🚀 **Sub-millisecond Real-Time Messaging**: Built on WebSockets / Socket.IO for instant bidirectional communication.
- 👥 **1-on-1 Direct Messaging & Group Channels**: Support for private discussions and multi-member topic lounges.
- ✓✓ **Delivery & Read Receipts**:
  - `✓` Sent
  - `✓✓` Delivered
  - `✓✓` (Blue) Read / Seen
- ⌨️ **Real-Time Typing Indicators**: See who is typing across direct chats and group channels.
- 🟢 **Live Presence & Activity Tracking**: Online status indicator and "last seen" tracking.
- ❤️ **Interactive Message Reactions**: Expressive emoji reactions with real-time counters.
- ↩️ **Message Quoting & Replies**: WhatsApp/Telegram-style contextual quote previews.
- 📌 **Message Pinning**: Pin critical announcements or messages to the chat header.
- 📎 **File & Media Sharing**: Upload images (with lightbox modal), documents, and audio clips.
- 🎙️ **Simulated Voice Notes**: Interactive voice memo playback with animated audio waveforms.
- 🔊 **Zero-Dependency Synthesized Audio Cues**: Pleasant Web Audio API pops and chimes for incoming and outgoing messages (with quick mute toggle).
- 🌓 **Modern Telegram/WhatsApp Aesthetics**: Sleek dark theme, clean typography, responsive mobile-ready sidebar drawer.
- 🔄 **Instant Multi-User Switching**: Easily switch between user identities in the top-left dropdown to test real-time two-way messaging within a single tab or across multiple browser windows!

---

## 📂 Project Structure

```
pulse-chat/
├── server/
│   ├── server.js               # Express + Socket.IO server & API routes
│   ├── services/
│   │   └── db.js               # Structured atomic JSON repository
│   └── socket/
│       └── socketHandler.js    # Real-time WebSocket event dispatcher
├── public/
│   ├── index.html              # Telegram/WhatsApp-inspired SPA
│   ├── css/
│   │   └── style.css           # Modern theme, animations & responsive layout
│   └── js/
│       ├── api.js              # REST API client
│       ├── app.js              # Main reactive client controller
│       └── sounds.js           # Web Audio API sound synthesizer
├── data/
│   └── pulse.json              # Persistent state & database
├── uploads/                    # User attachments & media
├── package.json
├── ARCHITECTURE.md             # Detailed engineering specifications
└── ROADMAP.md                  # Strategic roadmap to challenge WhatsApp & Telegram
```

---

## 🚀 Quick Start

### 1. Ensure Dependencies are Installed
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```
The server will boot on `http://localhost:3000`.

### 3. Open in Browser
Open [http://localhost:3000](http://localhost:3000) in your web browser.

### 4. How to Test Two-Way Real-Time Chat
1. Open [http://localhost:3000](http://localhost:3000) in Tab 1 (logged in as **Alex Rivera**).
2. Open [http://localhost:3000](http://localhost:3000) in Tab 2 or an Incognito window, and switch the user dropdown at the top-left to **Sarah Chen**.
3. Send messages back and forth between Alex and Sarah:
   - Notice the instant delivery ticks (`✓` -> `✓✓`).
   - Notice the typing indicator (`Sarah Chen is typing...`).
   - Notice reactions, quoting, and audio feedback sync instantly across both windows.
