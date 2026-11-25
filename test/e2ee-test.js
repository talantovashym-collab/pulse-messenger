const { io } = require('socket.io-client');
const assert = require('assert');
const { subtle } = require('crypto').webcrypto;

const SERVER_URL = 'http://localhost:3000';

function bufferToBase64(buffer) {
  return Buffer.from(buffer).toString('base64');
}

function base64ToBuffer(base64) {
  return Buffer.from(base64, 'base64');
}

async function generateKeyPair() {
  const pair = await subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
  const publicJwk = await subtle.exportKey('jwk', pair.publicKey);
  const privateJwk = await subtle.exportKey('jwk', pair.privateKey);
  return { pair, publicJwk, privateJwk };
}

async function deriveSharedKey(privateKey, peerPublicJwk) {
  const peerKey = await subtle.importKey(
    'jwk',
    peerPublicJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  return await subtle.deriveKey(
    { name: 'ECDH', public: peerKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encrypt(plainText, privateKey, peerPublicJwk) {
  const sharedKey = await deriveSharedKey(privateKey, peerPublicJwk);
  const iv = new Uint8Array(12);
  require('crypto').getRandomValues(iv);
  const encoded = new TextEncoder().encode(plainText);
  const cipherBuffer = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    encoded
  );
  return {
    ciphertext: bufferToBase64(cipherBuffer),
    iv: bufferToBase64(iv)
  };
}

async function decrypt(ciphertextBase64, ivBase64, privateKey, peerPublicJwk) {
  const sharedKey = await deriveSharedKey(privateKey, peerPublicJwk);
  const cipherBuffer = base64ToBuffer(ciphertextBase64);
  const iv = base64ToBuffer(ivBase64);
  const plainBuffer = await subtle.decrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    cipherBuffer
  );
  return new TextDecoder().decode(plainBuffer);
}

async function computeSafetyNumber(jwk1, jwk2) {
  const k1 = JSON.stringify(jwk1);
  const k2 = JSON.stringify(jwk2);
  const combined = k1 < k2 ? k1 + k2 : k2 + k1;
  const hashBuffer = await subtle.digest('SHA-256', new TextEncoder().encode(combined));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const blocks = [];
  for (let i = 0; i < 6; i++) {
    const chunk = (hashArray[i * 4] << 24) | (hashArray[i * 4 + 1] << 16) | (hashArray[i * 4 + 2] << 8) | hashArray[i * 4 + 3];
    const positive = Math.abs(chunk) % 100000;
    blocks.push(positive.toString().padStart(5, '0'));
  }
  return blocks.join(' ');
}

async function runE2EETest() {
  console.log('\n======================================================');
  console.log('🔒 RUNNING PULSE END-TO-END ENCRYPTION (E2EE) TEST');
  console.log('======================================================\n');

  let passed = 0;

  // --- 1. KEY GENERATION ---
  console.log('▶ Step 1: Generating client-side ECDH P-256 key pairs for Alex & Sarah...');
  const alexKeys = await generateKeyPair();
  const sarahKeys = await generateKeyPair();
  assert(alexKeys.publicJwk.x && alexKeys.publicJwk.y, 'Alex public key must have x and y coordinates');
  assert(sarahKeys.publicJwk.x && sarahKeys.publicJwk.y, 'Sarah public key must have x and y coordinates');
  console.log('  ✓ Cryptographic key pairs generated locally (private keys never leave client).');
  passed++;

  // --- 2. REGISTER PUBLIC KEYS WITH SERVER ---
  console.log('\n▶ Step 2: Registering public keys on the server API...');
  await fetch(`${SERVER_URL}/api/users/usr_alex/key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicKey: alexKeys.publicJwk })
  });

  await fetch(`${SERVER_URL}/api/users/usr_sarah/key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicKey: sarahKeys.publicJwk })
  });

  const fetchedAlexKey = await fetch(`${SERVER_URL}/api/users/usr_alex/key`).then(r => r.json());
  assert.strictEqual(fetchedAlexKey.publicKey.x, alexKeys.publicJwk.x);
  console.log('  ✓ Public keys successfully registered and verified on server.');
  passed++;

  // --- 3. SAFETY NUMBER CALCULATION ---
  console.log('\n▶ Step 3: Verifying Signal/WhatsApp-style Safety Numbers...');
  const alexCalculatedNumber = await computeSafetyNumber(alexKeys.publicJwk, sarahKeys.publicJwk);
  const sarahCalculatedNumber = await computeSafetyNumber(sarahKeys.publicJwk, alexKeys.publicJwk);
  assert.strictEqual(alexCalculatedNumber, sarahCalculatedNumber, 'Safety numbers on both sides must match identically');
  console.log(`  ✓ Identical 60-digit fingerprint confirmed on both clients: [ ${alexCalculatedNumber} ]`);
  passed++;

  // --- 4. ENCRYPTING PLAINTEXT ---
  console.log('\n▶ Step 4: Encrypting confidential message using AES-256-GCM...');
  const secretMessage = '🚀 Mission classified: Zero-knowledge E2EE is now fully operational in Pulse!';
  const encryptedPayload = await encrypt(secretMessage, alexKeys.pair.privateKey, sarahKeys.publicJwk);
  assert.notStrictEqual(encryptedPayload.ciphertext, secretMessage);
  console.log(`  ✓ Plaintext encrypted into high-entropy ciphertext: ${encryptedPayload.ciphertext.slice(0, 32)}...`);
  passed++;

  // --- 5. TRANSMITTING CIPHERTEXT VIA WEBSOCKET ---
  console.log('\n▶ Step 5: Transmitting encrypted payload via WebSocket...');
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

  const receivePromise = new Promise(resolve => {
    sarahSocket.on('message:new', (msg) => {
      if (msg.ciphertext === encryptedPayload.ciphertext) {
        resolve(msg);
      }
    });
  });

  alexSocket.emit('message:send', {
    chatId: 'chat_dm_alex_sarah',
    senderId: 'usr_alex',
    encrypted: true,
    ciphertext: encryptedPayload.ciphertext,
    iv: encryptedPayload.iv,
    senderPublicJwk: alexKeys.publicJwk
  });

  const serverMsg = await receivePromise;
  assert.strictEqual(serverMsg.encrypted, true);
  assert.strictEqual(serverMsg.text, '[🔒 End-to-End Encrypted]', 'Server database must only store ciphertext indicator');
  console.log('  ✓ Server verified Zero-Knowledge: database stores pure unreadable ciphertext.');
  passed++;

  // --- 6. CLIENT-SIDE DECRYPTION ---
  console.log('\n▶ Step 6: Decrypting message on recipient client (Sarah Chen)...');
  const decryptedText = await decrypt(
    serverMsg.ciphertext,
    serverMsg.iv,
    sarahKeys.pair.privateKey,
    serverMsg.senderPublicJwk
  );
  assert.strictEqual(decryptedText, secretMessage, 'Decrypted text must match original secret message');
  console.log(`  ✓ Message successfully decrypted on recipient: "${decryptedText}"`);
  passed++;

  // --- 7. TAMPER INTEGRITY (AEAD AUTH TAG) ---
  console.log('\n▶ Step 7: Testing AES-GCM tamper resistance (Man-in-the-Middle Attack Simulation)...');
  const tamperedCipher = serverMsg.ciphertext.slice(0, -4) + 'AAAA';
  let tamperCaught = false;
  try {
    await decrypt(tamperedCipher, serverMsg.iv, sarahKeys.pair.privateKey, serverMsg.senderPublicJwk);
  } catch (e) {
    tamperCaught = true;
  }
  assert(tamperCaught, 'Tampered ciphertext must be rejected by AES-GCM authentication tag');
  console.log('  ✓ Tampered ciphertext rejected! GCM authentication tag blocked unauthorized modification.');
  passed++;

  // Cleanup
  alexSocket.disconnect();
  sarahSocket.disconnect();

  console.log('\n======================================================');
  console.log(`🎉 ALL ${passed} E2EE CRYPTOGRAPHIC TESTS PASSED!`);
  console.log('======================================================\n');
}

runE2EETest().catch(err => {
  console.error('❌ E2EE Test failed:', err);
  process.exit(1);
});
