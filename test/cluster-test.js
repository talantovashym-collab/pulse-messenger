const { fork } = require('child_process');
const { io } = require('socket.io-client');
const path = require('path');
const assert = require('assert');

const NODE_A_URL = 'http://localhost:3000';
const NODE_B_PORT = 3001;
const NODE_B_URL = `http://localhost:${NODE_B_PORT}`;

async function runClusterTest() {
  console.log('\n======================================================');
  console.log('🌐 RUNNING HORIZONTAL MULTI-NODE CLUSTER SYNC TEST');
  console.log('======================================================\n');

  let passed = 0;

  // 1. Spawn Node Instance B on PORT 3001
  console.log(`▶ Step 1: Spawning Node Instance B on PORT ${NODE_B_PORT}...`);
  const serverPath = path.join(__dirname, '../server/server.js');
  const nodeBProcess = fork(serverPath, [], {
    env: { ...process.env, PORT: NODE_B_PORT, CLUSTER_PORT: 6380 },
    silent: true
  });

  // Wait for Node B to become ready
  await new Promise((resolve, reject) => {
    let retries = 0;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${NODE_B_URL}/api/health`);
        if (res.ok) {
          clearInterval(interval);
          resolve();
        }
      } catch (e) {
        if (++retries > 20) {
          clearInterval(interval);
          nodeBProcess.kill();
          reject(new Error('Node B failed to boot'));
        }
      }
    }, 200);
  });
  console.log('  ✓ Node Instance B is live on port 3001 and connected to cluster bus.');
  passed++;

  // 2. Connect Client A to Node A (Port 3000) and Client B to Node B (Port 3001)
  console.log('\n▶ Step 2: Connecting Client A to Node A (3000) and Client B to Node B (3001)...');
  const clientA = io(NODE_A_URL, { transports: ['websocket'] });
  const clientB = io(NODE_B_URL, { transports: ['websocket'] });

  await new Promise(r => {
    let count = 0;
    const ok = () => { if (++count === 2) r(); };
    clientA.on('connect', ok);
    clientB.on('connect', ok);
  });

  clientA.emit('user:join', { userId: 'usr_alex' });
  clientB.emit('user:join', { userId: 'usr_sarah' });
  await new Promise(r => setTimeout(r, 250));
  console.log('  ✓ Client A connected to Node A; Client B connected to Node B.');
  passed++;

  // 3. Client A on Node A sends a message to Client B on Node B
  console.log('\n▶ Step 3: Transmitting message from Node A -> Cluster Bus -> Node B...');
  const crossNodeMessageText = `Cross-Node Cluster Sync: ${Date.now()}`;

  const receivePromise = new Promise((resolve) => {
    clientB.on('message:new', (msg) => {
      if (msg.text === crossNodeMessageText) {
        resolve(msg);
      }
    });
  });

  const sendTimestamp = Date.now();
  clientA.emit('message:send', {
    chatId: 'chat_dm_alex_sarah',
    senderId: 'usr_alex',
    text: crossNodeMessageText
  });

  const receivedMsg = await receivePromise;
  const transitLatency = Date.now() - sendTimestamp;
  assert.strictEqual(receivedMsg.text, crossNodeMessageText);
  assert.strictEqual(receivedMsg.senderId, 'usr_alex');
  console.log(`  ✓ Message hopped across server instances in ${transitLatency}ms!`);
  passed++;

  // 4. Cross-Node Typing Indicators
  console.log('\n▶ Step 4: Testing real-time typing propagation across nodes...');
  const typingPromise = new Promise((resolve) => {
    clientB.on('typing:start', (data) => {
      if (data.userId === 'usr_alex') {
        resolve(data);
      }
    });
  });

  clientA.emit('typing:start', {
    chatId: 'chat_dm_alex_sarah',
    userId: 'usr_alex',
    username: 'Alex Rivera'
  });

  const typingData = await typingPromise;
  assert.strictEqual(typingData.username, 'Alex Rivera');
  console.log('  ✓ Typing indicator propagated across Node A -> Cluster Bus -> Node B.');
  passed++;

  // Cleanup
  clientA.disconnect();
  clientB.disconnect();
  nodeBProcess.kill();

  console.log('\n======================================================');
  console.log(`🎉 ALL ${passed} MULTI-NODE CLUSTERING TESTS PASSED!`);
  console.log('======================================================\n');
}

runClusterTest().catch(err => {
  console.error('❌ Cluster test failed:', err);
  process.exit(1);
});
