// Audio Messages & Voice Notes Automated Test Suite
const http = require('http');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const BASE_URL = 'http://localhost:3000';

function postMultipart(endpoint, filePath, fieldName = 'file') {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const fileName = path.basename(filePath);
    const fileData = fs.readFileSync(filePath);

    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n` +
      `Content-Type: audio/wav\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const payload = Buffer.concat([header, fileData, footer]);

    const req = http.request(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function get(endpoint) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE_URL}${endpoint}`, {
      method: 'GET'
    }, (res) => {
      let chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: buffer
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runAudioTests() {
  console.log('\n===============================================');
  console.log('🎙️ RUNNING PULSE AUDIO & VOICE NOTES TEST SUITE');
  console.log('===============================================\n');

  let testCount = 0;
  let passedCount = 0;

  function assert(condition, message) {
    testCount++;
    if (condition) {
      console.log(`  ✓ Test ${testCount}: ${message}`);
      passedCount++;
    } else {
      console.error(`  ✗ Test ${testCount} FAILED: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  try {
    // Test 1: Sample voice note static asset accessibility
    console.log('▶ Test 1: Testing static audio asset serving...');
    const staticAudioRes = await get('/sounds/sample_voice_note.wav');
    assert(staticAudioRes.status === 200, 'Static sample voice note returns HTTP 200');
    assert(staticAudioRes.data.length > 1000, 'Static audio file payload is valid WAV binary');
    assert(staticAudioRes.data.slice(0, 4).toString() === 'RIFF', 'Valid RIFF/WAVE container header');

    // Test 2: Audio File Upload via /api/upload
    console.log('\n▶ Test 2: Uploading recorded voice note via /api/upload...');
    const sampleFilePath = path.join(__dirname, '../public/sounds/sample_voice_note.wav');
    const uploadRes = await postMultipart('/api/upload', sampleFilePath);
    assert(uploadRes.status === 200, 'Audio upload endpoint returns HTTP 200 OK');
    assert(uploadRes.body.type === 'audio', 'Upload response categorizes mimetype as type "audio"');
    assert(uploadRes.body.url && uploadRes.body.url.startsWith('/uploads/'), 'Upload response returns permanent /uploads/ URL');

    const uploadedAudioUrl = uploadRes.body.url;

    // Test 3: Fetch uploaded audio from /uploads/
    console.log('\n▶ Test 3: Verifying uploaded audio file stream delivery...');
    const fetchUploadedRes = await get(uploadedAudioUrl);
    assert(fetchUploadedRes.status === 200, 'Uploaded audio file stream returns HTTP 200');
    assert(fetchUploadedRes.data.length === staticAudioRes.data.length, 'Uploaded audio stream length matches recorded binary size');

    // Test 4: Real-time Voice Message WebSocket Transmission
    console.log('\n▶ Test 4: Testing real-time voice message dispatch via WebSockets...');
    await new Promise((resolve, reject) => {
      const alexSocket = io(BASE_URL, { transports: ['websocket'] });
      const sarahSocket = io(BASE_URL, { transports: ['websocket'] });

      let joined = 0;
      function onJoin() {
        joined++;
        if (joined === 2) {
          // Listen for new voice note
          sarahSocket.on('message:new', (msg) => {
            if (msg.chatId === 'chat_dm_alex_sarah' && msg.attachments && msg.attachments[0].type === 'audio') {
              assert(msg.attachments[0].url === uploadedAudioUrl, 'Audio message attachment URL delivered correctly');
              assert(msg.attachments[0].duration === 4, 'Audio message duration metadata (4s) preserved');
              assert(msg.text.includes('Voice note'), 'Voice note label formatted properly');
              alexSocket.disconnect();
              sarahSocket.disconnect();
              resolve();
            }
          });

          // Alex dispatches voice note
          setTimeout(() => {
            alexSocket.emit('message:send', {
              chatId: 'chat_dm_alex_sarah',
              senderId: 'usr_alex',
              text: '🎙️ Voice note (0:04)',
              attachments: [{
                url: uploadedAudioUrl,
                filename: 'voice_note_test.wav',
                mimetype: 'audio/wav',
                size: uploadRes.body.size,
                type: 'audio',
                duration: 4
              }]
            });
          }, 150);
        }
      }

      alexSocket.on('connect', () => {
        alexSocket.emit('user:join', { userId: 'usr_alex' });
        onJoin();
      });

      sarahSocket.on('connect', () => {
        sarahSocket.emit('user:join', { userId: 'usr_sarah' });
        onJoin();
      });

      setTimeout(() => reject(new Error('Voice note delivery timeout')), 6000);
    });

    // Test 5: Verify Database Persistence of Voice Note
    console.log('\n▶ Test 5: Verifying voice note persistence in database...');
    const messagesRes = await get('/api/chats/chat_dm_alex_sarah/messages');
    assert(messagesRes.status === 200, 'Fetch messages returns HTTP 200');
    const msgs = JSON.parse(messagesRes.data.toString());
    const savedAudioMsg = msgs.slice().reverse().find(m => m.attachments && m.attachments.some(a => a.type === 'audio'));
    assert(Boolean(savedAudioMsg), 'Voice note saved and retrieved from chat messages');
    assert(savedAudioMsg.attachments[0].url === uploadedAudioUrl, 'Persisted audio attachment URL verified');

    console.log(`\n===============================================`);
    console.log(`🎉 ALL ${passedCount}/${testCount} AUDIO & VOICE NOTE TESTS PASSED!`);
    console.log(`===============================================\n`);
    process.exit(0);

  } catch (err) {
    console.error('\n❌ Audio Test Suite Error:', err);
    process.exit(1);
  }
}

runAudioTests();
