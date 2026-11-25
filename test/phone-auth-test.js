// Phone Registration & Contact Discovery Automated Integration Test
const http = require('http');
const { io } = require('socket.io-client');

const BASE_URL = 'http://localhost:3000';

function post(endpoint, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, body: parsed });
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
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runPhoneAuthTests() {
  console.log('🚀 Starting Phone Authentication & Contact Discovery Tests...\n');
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

  const testPhone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`;
  let capturedDevCode = null;
  let createdUserId = null;

  try {
    // 1. Request SMS verification code
    const sendRes = await post('/api/auth/send-code', { phone: testPhone });
    assert(sendRes.status === 200 && sendRes.body.ok === true, 'Request SMS code returns 200 OK');
    assert(sendRes.body.devCode && sendRes.body.devCode.length === 6, 'SMS code is a 6-digit cryptographic OTP');
    capturedDevCode = sendRes.body.devCode;

    // 2. Reject incorrect code
    const invalidRes = await post('/api/auth/verify-code', { phone: testPhone, code: '000000' });
    assert(invalidRes.status === 400 && invalidRes.body.ok === false, 'Invalid verification code is rejected with 400');

    // 3. Verify valid code
    const verifyRes = await post('/api/auth/verify-code', { phone: testPhone, code: capturedDevCode });
    assert(verifyRes.status === 200 && verifyRes.body.ok === true && verifyRes.body.isNew === true, 'Valid OTP verifies brand new phone registration');

    // 4. Complete profile registration
    const regRes = await post('/api/auth/register', {
      phone: testPhone,
      displayName: 'David TestFriend',
      status: 'Ready to conquer WhatsApp!'
    });
    assert(regRes.status === 200 && regRes.body.user && regRes.body.user.phone === testPhone, 'Profile created with registered phone number');
    assert(regRes.body.user.displayName === 'David TestFriend', 'Display name saved correctly');
    createdUserId = regRes.body.user.id;

    // 5. Contact discovery by phone lookup
    const lookupRes = await get(`/api/users/lookup?phone=${encodeURIComponent(testPhone)}`);
    assert(lookupRes.status === 200 && lookupRes.body.id === createdUserId, 'Friend found instantly via phone lookup endpoint');
    assert(lookupRes.body.displayName === 'David TestFriend', 'Lookup returns full profile information');

    // 6. Unknown number lookup returns 404
    const unknownRes = await get('/api/users/lookup?phone=%2B19999999999');
    assert(unknownRes.status === 404, 'Non-registered phone lookup returns 404 Not Found');

    // 7. Subsequent login for existing phone user
    const resendRes = await post('/api/auth/send-code', { phone: testPhone });
    const verifyExistingRes = await post('/api/auth/verify-code', { phone: testPhone, code: resendRes.body.devCode });
    assert(verifyExistingRes.status === 200 && verifyExistingRes.body.isNew === false && verifyExistingRes.body.user.id === createdUserId, 'Subsequent login recognizes existing phone account');

    // 8. WebSocket live messaging between existing user and new phone friend
    await new Promise((resolve, reject) => {
      const alexSocket = io(BASE_URL, { transports: ['websocket'] });
      const friendSocket = io(BASE_URL, { transports: ['websocket'] });

      let joinedCount = 0;
      function checkJoined() {
        joinedCount++;
        if (joinedCount === 2) {
          // Alex creates chat with new friend
          alexSocket.emit('chat:create', {
            type: 'direct',
            name: 'David TestFriend',
            members: ['usr_alex', createdUserId]
          }, (chatRes) => {
            const chatId = chatRes.chat.id;

            friendSocket.on('message:new', (msg) => {
              if (msg.chatId === chatId && msg.text === 'Hey David! Testing Pulse with real number.') {
                assert(true, 'Live WebSocket message delivered between registered phone user and peer');
                alexSocket.disconnect();
                friendSocket.disconnect();
                resolve();
              }
            });

            // Send message from Alex
            setTimeout(() => {
              alexSocket.emit('message:send', {
                chatId,
                senderId: 'usr_alex',
                text: 'Hey David! Testing Pulse with real number.'
              });
            }, 100);
          });
        }
      }

      alexSocket.on('connect', () => {
        alexSocket.emit('user:join', { userId: 'usr_alex' });
        checkJoined();
      });

      friendSocket.on('connect', () => {
        friendSocket.emit('user:join', { userId: createdUserId });
        checkJoined();
      });

      setTimeout(() => reject(new Error('WebSocket message delivery timeout')), 5000);
    });

    console.log(`\n===============================================`);
    console.log(`✅ All ${passedCount}/${testCount} Phone Authentication Tests Passed!`);
    console.log(`===============================================\n`);
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Phone Auth Test Failed:', err);
    process.exit(1);
  }
}

runPhoneAuthTests();
