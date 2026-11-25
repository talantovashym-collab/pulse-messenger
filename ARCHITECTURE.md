# 📐 Pulse Messenger — Architecture Specification

## 1. System Overview

Pulse Messenger is engineered with a modular, layered architecture designed to guarantee sub-millisecond local handling and straightforward horizontal scalability.

```
                    +-----------------------------+
                    |   Pulse Client SPA (Web)    |
                    |   (Socket.IO + Web Audio)   |
                    +--------------+--------------+
                                   |
                   +---------------+---------------+
                   |                               |
       REST API (HTTP/JSON)              WebSocket (Bidirectional)
                   |                               |
                   v                               v
    +-------------------------------------------------------------+
    |                   Express & Socket.IO Engine                |
    |  +--------------------+  +-------------------------------+  |
    |  | API Router         |  | Real-Time Event Dispatcher    |  |
    |  | - /api/users       |  | - user:join / presence        |  |
    |  | - /api/chats       |  | - message:send / read         |  |
    |  | - /api/upload      |  | - typing / reactions / pin    |  |
    |  +---------+----------+  +---------------+---------------+  |
    +------------|-----------------------------|------------------+
                 |                             |
                 +--------------+--------------+
                                |
                                v
               +----------------------------------+
               |      Service & Persistence       |
               | - db.js (Atomic Repository)      |
               | - Multer File Storage (/uploads) |
               +----------------------------------+
```

---

## 2. Real-Time Message State Machine

Every message progresses through a rigorous state lifecycle:

```mermaid
stateDiagram-v2
    [*] --> Sent: Client emits message:send
    Sent --> Delivered: Recipient connected to socket
    Delivered --> Read: Recipient opens chat window (message:read)
    Read --> [*]
```

1. **Sent (`status: 'sent'`)**: Message is validated, assigned a UUID, and committed to storage.
2. **Delivered (`status: 'delivered'`)**: Dispatcher confirms recipient has an active WebSocket connection.
3. **Read (`status: 'read'`)**: Recipient's client triggers `message:read` event upon viewing the chat view, notifying all participants with double blue ticks (`✓✓`).

---

## 3. Core Data Schemas

### User
```typescript
interface User {
  id: string;               // e.g. "usr_alex"
  username: string;         // e.g. "alex"
  displayName: string;      // e.g. "Alex Rivera"
  avatar: string;           // URL
  status: string;           // User bio / status message
  online: boolean;          // Real-time presence flag
  lastSeen: string;         // ISO timestamp
}
```

### Chat
```typescript
interface Chat {
  id: string;               // e.g. "chat_global" or "chat_dm_123"
  type: 'direct' | 'group';
  name: string;
  description?: string;
  avatar?: string;
  members: string[];        // Array of user IDs
  pinnedMessageId: string | null;
  createdAt: string;        // ISO timestamp
}
```

### Message
```typescript
interface Message {
  id: string;               // e.g. "msg_17300000_abcd1234"
  chatId: string;
  senderId: string;
  text: string;
  attachments: Attachment[];
  reactions: Record<string, string[]>; // emoji -> array of user IDs
  replyTo: string | null;   // ID of quoted message
  status: 'sent' | 'delivered' | 'read';
  createdAt: string;        // ISO timestamp
}
```

### Attachment
```typescript
interface Attachment {
  url: string;              // e.g. "/uploads/17300000_photo.jpg"
  filename: string;
  mimetype: string;
  size: number;             // bytes
  type: 'image' | 'audio' | 'video' | 'document';
}
```

---

## 4. Scalability Target Specifications

| Metric | v1.0 (Current) | Target Scale (v2.0+) |
| :--- | :--- | :--- |
| **Max Concurrent Sockets / Node** | ~10,000 | 250,000+ (via epoll / uWebSockets.js) |
| **End-to-End Latency** | < 25 ms | < 10 ms globally via Geo-Distributed Edge Nodes |
| **Message Throughput** | 2,000 msgs/sec | 100,000+ msgs/sec with Kafka / Redis Cluster |
| **File Transfer Size Limit** | 25 MB | Up to 4 GB (chunked resumable upload via TUS protocol) |
