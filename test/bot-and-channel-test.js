const { io } = require('socket.io-client');
const assert = require('assert');

const SERVER_URL = 'http://localhost:3000';
const BOT_TOKEN = 'bot_token_pulse_sentinel_xyz123';

async function runBotAndChannelTests() {
  console.log('\n======================================================');
  console.log('🤖 RUNNING PULSE BOT API & PUBLIC CHANNELS TEST');
  console.log('======================================================\n');

  let passed = 0;

  // 1. Telegram-Style Bot API: getMe
  console.log('▶ Test 1: Testing Telegram-style Bot API getMe endpoint...');
  const botInfo = await fetch(`${SERVER_URL}/api/bot/${BOT_TOKEN}/getMe`).then(r => r.json());
  assert.strictEqual(botInfo.ok, true);
  assert.strictEqual(botInfo.result.username, 'pulse_bot');
  console.log(`  ✓ Bot verified via API: @${botInfo.result.username} (${botInfo.result.displayName})`);
  passed++;

  // 2. Telegram-Style Bot API: sendMessage
  console.log('\n▶ Test 2: Testing Telegram-style Bot API sendMessage endpoint...');
  const sendRes = await fetch(`${SERVER_URL}/api/bot/${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: 'chat_global',
      text: '🤖 Automated system health check from Telegram Bot API.'
    })
  }).then(r => r.json());

  assert.strictEqual(sendRes.ok, true);
  assert.strictEqual(sendRes.result.senderId, 'usr_pulse_bot');
  console.log('  ✓ Bot message dispatched successfully via REST API.');
  passed++;

  // 3. Interactive Bot Commands via WebSocket
  console.log('\n▶ Test 3: Testing interactive Bot Command execution (/price btc)...');
  const userSocket = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise(r => userSocket.on('connect', r));
  userSocket.emit('user:join', { userId: 'usr_alex' });
  await new Promise(r => setTimeout(r, 200));

  const botReplyPromise = new Promise(resolve => {
    userSocket.on('message:new', (msg) => {
      if (msg.senderId === 'usr_pulse_bot' && msg.text.includes('Market Ticker [BTC]')) {
        resolve(msg);
      }
    });
  });

  userSocket.emit('message:send', {
    chatId: 'chat_dm_alex_bot',
    senderId: 'usr_alex',
    text: '/price btc'
  });

  const botReply = await botReplyPromise;
  assert(botReply.text.includes('Price'), 'Bot reply must include price ticker');
  console.log(`  ✓ Bot successfully executed /price command:\n    ${botReply.text.split('\n')[0]}`);
  passed++;

  // 4. Bot Status Command (/status)
  console.log('\n▶ Test 4: Testing cluster /status diagnostics command...');
  const statusReplyPromise = new Promise(resolve => {
    userSocket.on('message:new', (msg) => {
      if (msg.senderId === 'usr_pulse_bot' && msg.text.includes('Pulse Cluster Node Status')) {
        resolve(msg);
      }
    });
  });

  userSocket.emit('message:send', {
    chatId: 'chat_dm_alex_bot',
    senderId: 'usr_alex',
    text: '/status'
  });

  const statusReply = await statusReplyPromise;
  assert(statusReply.text.includes('Memory (RSS)'));
  assert(statusReply.text.includes('Cluster Pub/Sub'));
  console.log('  ✓ Bot reported live node metrics and cluster bus health.');
  passed++;

  // 5. Public Channel Non-Admin Permission Restriction
  console.log('\n▶ Test 5: Testing Public Channel permission boundaries...');
  const unauthorizedBroadcast = await fetch(`${SERVER_URL}/api/channels/chat_channel_pulse/broadcast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      senderId: 'usr_sarah', // Non-owner
      text: 'Unauthorized broadcast attempt'
    })
  });
  assert.strictEqual(unauthorizedBroadcast.status, 403, 'Non-admin broadcast must be forbidden (403)');
  console.log('  ✓ Non-admin broadcast correctly blocked with HTTP 403 Forbidden.');
  passed++;

  // 6. Public Channel Authorized Admin Broadcast
  console.log('\n▶ Test 6: Testing Authorized Administrator broadcast...');
  const authorizedBroadcast = await fetch(`${SERVER_URL}/api/channels/chat_channel_pulse/broadcast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      senderId: 'usr_alex', // Admin / Owner
      text: '🚀 Breaking Update: Pulse reaches 28.4K subscribers on @pulse_official!'
    })
  }).then(r => r.json());

  assert.strictEqual(authorizedBroadcast.success, true);
  assert.strictEqual(authorizedBroadcast.post.senderId, 'usr_alex');
  console.log('  ✓ Channel broadcast post published and broadcasted across subscribers.');
  passed++;

  userSocket.disconnect();

  console.log('\n======================================================');
  console.log(`🎉 ALL ${passed} BOT & PUBLIC CHANNELS TESTS PASSED!`);
  console.log('======================================================\n');
}

runBotAndChannelTests().catch(err => {
  console.error('❌ Bot and Channels test failed:', err);
  process.exit(1);
});
