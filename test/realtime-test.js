const { io } = require('socket.io-client');
const assert = require('assert');

const SERVER_URL = 'http://localhost:3000';

async function runTestSuite() {
  console.log('\n===============================================');
  console.log('🧪 RUNNING PULSE MESSENGER REAL-TIME TEST SUITE');
  console.log('===============================================\n');

  let passedTests = 0;

  // --- TEST 1: REST API HEALTH & USERS ---
  console.log('▶ Test 1: Testing REST API health & seed data...');
  const healthRes = await fetch(`${SERVER_URL}/api/health`).then(r => r.json());
  assert.strictEqual(healthRes.status, 'online', 'Health check must return status online');

  const users = await fetch(`${SERVER_URL}/api/users`).then(r => r.json());
  assert(users.length >= 4, 'Must have at least 4 users seeded');
  console.log(`  ✓ REST API healthy, ${users.length} users verified.`);
  passedTests++;

  // --- TEST 2: DUAL SOCKET CONNECTIONS ---
  console.log('\n▶ Test 2: Connecting two concurrent users via WebSockets...');
  const alexSocket = io(SERVER_URL, { transports: ['websocket'] });
  const sarahSocket = io(SERVER_URL, { transports: ['websocket'] });

  await new Promise((resolve) => {
    let connected = 0;
    const check = () => { if (++connected === 2) resolve(); };
    alexSocket.on('connect', check);
    sarahSocket.on('connect', check);
  });

  alexSocket.emit('user:join', { userId: 'usr_alex' });
  sarahSocket.emit('user:join', { userId: 'usr_sarah' });
  console.log('  ✓ Alex & Sarah sockets connected and joined rooms.');
  passedTests++;

  // --- TEST 3: REAL-TIME TYPING INDICATORS ---
  console.log('\n▶ Test 3: Testing real-time typing indicators...');
  const typingPromise = new Promise((resolve) => {
    alexSocket.on('typing:start', (data) => {
      if (data.chatId === 'chat_dm_alex_sarah' && data.userId === 'usr_sarah') {
        resolve(data);
      }
    });
  });

  sarahSocket.emit('typing:start', {
    chatId: 'chat_dm_alex_sarah',
    userId: 'usr_sarah',
    username: 'Sarah Chen'
  });

  const typingData = await typingPromise;
  assert.strictEqual(typingData.username, 'Sarah Chen');
  console.log(`  ✓ Alex received typing event: "${typingData.username} is typing..."`);
  passedTests++;

  // --- TEST 4: MESSAGE TRANSMISSION & DELIVERED STATUS ---
  console.log('\n▶ Test 4: Testing instant message dispatch & delivery status...');
  const testMessageText = `Automated Test Message: ${Date.now()}`;
  let sentMessageId = null;

  const messagePromise = new Promise((resolve) => {
    alexSocket.on('message:new', (msg) => {
      if (msg.text === testMessageText) {
        resolve(msg);
      }
    });
  });

  sarahSocket.emit('message:send', {
    chatId: 'chat_dm_alex_sarah',
    senderId: 'usr_sarah',
    text: testMessageText
  });

  const receivedMsg = await messagePromise;
  sentMessageId = receivedMsg.id;
  assert.strictEqual(receivedMsg.text, testMessageText);
  assert.strictEqual(receivedMsg.senderId, 'usr_sarah');
  assert.strictEqual(receivedMsg.status, 'delivered', 'Message to online user must be marked delivered');
  console.log(`  ✓ Message received by Alex with status "${receivedMsg.status}" (✓✓).`);
  passedTests++;

  // --- TEST 5: READ RECEIPT SYNC (BLUE TICKS) ---
  console.log('\n▶ Test 5: Testing read receipts (✓✓ blue ticks)...');
  const readReceiptPromise = new Promise((resolve) => {
    sarahSocket.on('message:status_update', (update) => {
      if (update.chatId === 'chat_dm_alex_sarah' && update.status === 'read') {
        resolve(update);
      }
    });
  });

  // Alex opens the chat
  alexSocket.emit('message:read', {
    chatId: 'chat_dm_alex_sarah',
    userId: 'usr_alex'
  });

  const readUpdate = await readReceiptPromise;
  assert.strictEqual(readUpdate.status, 'read');
  console.log('  ✓ Sarah received read receipt: status upgraded to "read".');
  passedTests++;

  // --- TEST 6: EMOJI REACTION TOGGLE ---
  console.log('\n▶ Test 6: Testing emoji reaction toggle...');
  const reactionPromise = new Promise((resolve) => {
    sarahSocket.on('reaction:update', (data) => {
      if (data.messageId === sentMessageId && data.reactions['🚀']) {
        resolve(data);
      }
    });
  });

  alexSocket.emit('reaction:toggle', {
    messageId: sentMessageId,
    emoji: '🚀',
    userId: 'usr_alex'
  });

  const reactionData = await reactionPromise;
  assert(reactionData.reactions['🚀'].includes('usr_alex'));
  console.log('  ✓ Real-time reaction synced: 🚀 count updated across clients.');
  passedTests++;

  // --- TEST 7: PINNING MESSAGES ---
  console.log('\n▶ Test 7: Testing chat message pinning...');
  const pinPromise = new Promise((resolve) => {
    alexSocket.on('chat:pinned_update', (data) => {
      if (data.chatId === 'chat_dm_alex_sarah' && data.pinnedMessageId === sentMessageId) {
        resolve(data);
      }
    });
  });

  sarahSocket.emit('message:pin', {
    chatId: 'chat_dm_alex_sarah',
    messageId: sentMessageId
  });

  const pinData = await pinPromise;
  assert.strictEqual(pinData.pinnedMessageId, sentMessageId);
  console.log('  ✓ Pinned message banner updated in real-time on peer client.');
  passedTests++;

  // --- CLEANUP ---
  alexSocket.disconnect();
  sarahSocket.disconnect();

  console.log('\n===============================================');
  console.log(`🎉 ALL ${passedTests} TESTS PASSED SUCCESSFULLY!`);
  console.log('===============================================\n');
}

runTestSuite().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
