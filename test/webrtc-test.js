const { io } = require('socket.io-client');
const assert = require('assert');

const SERVER_URL = 'http://localhost:3000';

async function runWebRTCTest() {
  console.log('\n======================================================');
  console.log('📞 RUNNING PULSE WEBRTC VOICE & VIDEO SIGNALING TEST');
  console.log('======================================================\n');

  let passed = 0;

  console.log('▶ Step 1: Connecting two client sockets (Alex & Sarah)...');
  const alexSocket = io(SERVER_URL, { transports: ['websocket'] });
  const sarahSocket = io(SERVER_URL, { transports: ['websocket'] });

  await new Promise(r => {
    let c = 0;
    const ok = () => { if (++c === 2) r(); };
    alexSocket.on('connect', ok);
    sarahSocket.on('connect', ok);
  });

  alexSocket.emit('user:join', { userId: 'usr_alex' });
  sarahSocket.emit('user:join', { userId: 'usr_sarah' });
  await new Promise(r => setTimeout(r, 200));
  console.log('  ✓ Alex and Sarah connected to signaling server.');
  passed++;

  // Step 2: Alex initiates Video Call to Sarah
  console.log('\n▶ Step 2: Alex initiates Video Call to Sarah...');
  const incomingPromise = new Promise(resolve => {
    sarahSocket.on('call:incoming', (data) => {
      resolve(data);
    });
  });

  alexSocket.emit('call:initiate', {
    callerId: 'usr_alex',
    recipientId: 'usr_sarah',
    chatId: 'chat_dm_alex_sarah',
    callType: 'video'
  });

  const incomingData = await incomingPromise;
  assert.strictEqual(incomingData.callerId, 'usr_alex');
  assert.strictEqual(incomingData.callType, 'video');
  assert.strictEqual(incomingData.callerName, 'Alex Rivera');
  console.log(`  ✓ Sarah received incoming call alert: [${incomingData.callType.toUpperCase()}] from ${incomingData.callerName}`);
  passed++;

  // Step 3: Sarah accepts call
  console.log('\n▶ Step 3: Sarah accepts call...');
  const acceptedPromise = new Promise(resolve => {
    alexSocket.on('call:accepted', (data) => {
      resolve(data);
    });
  });

  sarahSocket.emit('call:accept', {
    callerId: 'usr_alex',
    recipientId: 'usr_sarah'
  });

  const acceptData = await acceptedPromise;
  assert.strictEqual(acceptData.recipientId, 'usr_sarah');
  console.log('  ✓ Alex received call:accepted signal from Sarah.');
  passed++;

  // Step 4: WebRTC SDP Offer Exchange
  console.log('\n▶ Step 4: Testing WebRTC SDP Offer transmission...');
  const mockOffer = { type: 'offer', sdp: 'v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=PulseWebRTC\r\nt=0 0\r\n' };
  const offerPromise = new Promise(resolve => {
    sarahSocket.on('call:signal', (data) => {
      if (data.signal.type === 'offer') {
        resolve(data);
      }
    });
  });

  alexSocket.emit('call:signal', {
    to: 'usr_sarah',
    from: 'usr_alex',
    signal: mockOffer
  });

  const receivedOffer = await offerPromise;
  assert.strictEqual(receivedOffer.signal.sdp, mockOffer.sdp);
  console.log('  ✓ Sarah received SDP Offer from Alex.');
  passed++;

  // Step 5: WebRTC SDP Answer Exchange
  console.log('\n▶ Step 5: Testing WebRTC SDP Answer transmission...');
  const mockAnswer = { type: 'answer', sdp: 'v=0\r\no=- 67890 2 IN IP4 127.0.0.1\r\ns=PulseWebRTC\r\nt=0 0\r\n' };
  const answerPromise = new Promise(resolve => {
    alexSocket.on('call:signal', (data) => {
      if (data.signal.type === 'answer') {
        resolve(data);
      }
    });
  });

  sarahSocket.emit('call:signal', {
    to: 'usr_alex',
    from: 'usr_sarah',
    signal: mockAnswer
  });

  const receivedAnswer = await answerPromise;
  assert.strictEqual(receivedAnswer.signal.sdp, mockAnswer.sdp);
  console.log('  ✓ Alex received SDP Answer from Sarah.');
  passed++;

  // Step 6: ICE Candidate Relay
  console.log('\n▶ Step 6: Testing interactive ICE Candidate relaying...');
  const mockCandidate = { candidate: 'candidate:1 1 UDP 2130706431 192.168.1.100 50000 typ host', sdpMid: '0', sdpMLineIndex: 0 };
  const icePromise = new Promise(resolve => {
    sarahSocket.on('call:signal', (data) => {
      if (data.signal.type === 'candidate') {
        resolve(data);
      }
    });
  });

  alexSocket.emit('call:signal', {
    to: 'usr_sarah',
    from: 'usr_alex',
    signal: { type: 'candidate', candidate: mockCandidate }
  });

  const receivedIce = await icePromise;
  assert.strictEqual(receivedIce.signal.candidate.candidate, mockCandidate.candidate);
  console.log('  ✓ Sarah received ICE candidate for NAT traversal.');
  passed++;

  // Step 7: Call Termination
  console.log('\n▶ Step 7: Testing call termination & session teardown...');
  const endedPromise = new Promise(resolve => {
    sarahSocket.on('call:ended', (data) => {
      resolve(data);
    });
  });

  alexSocket.emit('call:end', {
    peerId: 'usr_sarah',
    from: 'usr_alex'
  });

  const endData = await endedPromise;
  assert.strictEqual(endData.from, 'usr_alex');
  console.log('  ✓ Sarah received call:ended event, media session terminated cleanly.');
  passed++;

  // Cleanup
  alexSocket.disconnect();
  sarahSocket.disconnect();

  console.log('\n======================================================');
  console.log(`🎉 ALL ${passed} WEBRTC CALLING TESTS PASSED!`);
  console.log('======================================================\n');
}

runWebRTCTest().catch(err => {
  console.error('❌ WebRTC Test failed:', err);
  process.exit(1);
});
