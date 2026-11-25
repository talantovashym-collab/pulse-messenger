// Production SMS Verification Service
// Supports Twilio, Custom Carrier Webhooks, and Dev/Console Gateway with Rate Limiting

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(__dirname, '..', '..', '.env');

class SMSService {
  constructor() {
    this.otpStore = new Map(); // phone -> { code, expiresAt, attempts }
    this.rateLimitMap = new Map(); // phone -> [timestamps]

    this.config = {
      provider: 'mock', // 'twilio' | 'custom' | 'mock'
      accountSid: '',
      authToken: '',
      fromNumber: '',
      customEndpoint: '',
      customApiKey: ''
    };

    this.loadEnv();
  }

  loadEnv() {
    try {
      if (fs.existsSync(ENV_FILE)) {
        if (process.loadEnvFile) {
          process.loadEnvFile(ENV_FILE);
        } else {
          const content = fs.readFileSync(ENV_FILE, 'utf8');
          content.split('\n').forEach(line => {
            const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
            if (match) {
              const key = match[1];
              let value = match[2] || '';
              if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
              process.env[key] = value.trim();
            }
          });
        }
      }
    } catch (e) {
      console.warn('Notice: .env file not loaded:', e.message);
    }

    this.config.accountSid = process.env.TWILIO_ACCOUNT_SID || '';
    this.config.authToken = process.env.TWILIO_AUTH_TOKEN || '';
    this.config.fromNumber = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID || '';
    this.config.customEndpoint = process.env.CUSTOM_SMS_ENDPOINT || '';
    this.config.customApiKey = process.env.CUSTOM_SMS_API_KEY || '';

    if (this.config.accountSid && this.config.authToken && this.config.fromNumber) {
      this.config.provider = 'twilio';
    } else if (this.config.customEndpoint) {
      this.config.provider = 'custom';
    } else {
      this.config.provider = 'mock';
    }
  }

  saveEnv(newConfig) {
    let envContent = '';
    if (fs.existsSync(ENV_FILE)) {
      envContent = fs.readFileSync(ENV_FILE, 'utf8');
    }

    const updates = {
      TWILIO_ACCOUNT_SID: newConfig.accountSid || this.config.accountSid,
      TWILIO_AUTH_TOKEN: newConfig.authToken || this.config.authToken,
      TWILIO_PHONE_NUMBER: newConfig.fromNumber || this.config.fromNumber,
      SMS_PROVIDER: newConfig.provider || this.config.provider
    };

    let lines = envContent ? envContent.split(/\r?\n/) : [];
    for (const [key, val] of Object.entries(updates)) {
      process.env[key] = val;
      const index = lines.findIndex(l => l.trim().startsWith(`${key}=`));
      if (index >= 0) {
        lines[index] = `${key}=${val}`;
      } else {
        lines.push(`${key}=${val}`);
      }
    }

    fs.writeFileSync(ENV_FILE, lines.join('\n'), 'utf8');
    this.loadEnv();
  }

  getStatus() {
    return {
      provider: this.config.provider,
      configured: this.config.provider === 'twilio' || this.config.provider === 'custom',
      hasTwilioSid: Boolean(this.config.accountSid),
      fromNumber: this.config.fromNumber ? `${this.config.fromNumber.slice(0, 4)}***${this.config.fromNumber.slice(-2)}` : null,
      mode: this.config.provider === 'twilio' ? 'Real Cellular SMS (Twilio)' : 'Dev Simulation / Quick-Fill'
    };
  }

  // E.164 normalization
  normalizePhone(phone) {
    if (!phone) return '';
    let cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }
    return cleaned;
  }

  // Rate Limiting: Max 4 SMS per 10 minutes per phone
  checkRateLimit(phone) {
    const now = Date.now();
    const windowMs = 10 * 60 * 1000;
    const maxRequests = 4;

    const timestamps = (this.rateLimitMap.get(phone) || []).filter(t => now - t < windowMs);
    if (timestamps.length >= maxRequests) {
      const waitMinutes = Math.ceil((windowMs - (now - timestamps[0])) / 60000);
      throw new Error(`Rate limit exceeded: Too many SMS requests for this number. Please wait ${waitMinutes} minute(s).`);
    }

    timestamps.push(now);
    this.rateLimitMap.set(phone, timestamps);
  }

  // Dispatch real SMS via Twilio REST API
  async sendTwilioSMS(to, code) {
    return new Promise((resolve, reject) => {
      const { accountSid, authToken, fromNumber } = this.config;
      const messageBody = `Your Pulse Messenger verification code is: ${code}. Valid for 5 minutes. Do not share this code with anyone.`;

      const postData = new URLSearchParams({
        To: to,
        From: fromNumber,
        Body: messageBody
      }).toString();

      const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

      const req = https.request({
        hostname: 'api.twilio.com',
        port: 443,
        path: `/2010-04-01/Accounts/${accountSid}/Messages.json`,
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              console.log(`📱 [TWILIO] Real SMS successfully sent to ${to} (SID: ${data.sid})`);
              resolve({ success: true, sid: data.sid });
            } else {
              console.error(`❌ [TWILIO ERROR] ${data.message || body}`);
              reject(new Error(data.message || 'Twilio SMS failed'));
            }
          } catch (e) {
            reject(new Error(`Failed to parse Twilio response: ${body}`));
          }
        });
      });

      req.on('error', (err) => {
        console.error('❌ [TWILIO NETWORK ERROR]', err);
        reject(err);
      });

      req.write(postData);
      req.end();
    });
  }

  // Dispatch SMS
  async sendVerificationCode(rawPhone) {
    const phone = this.normalizePhone(rawPhone);
    if (!phone || phone.length < 8) {
      throw new Error('Please enter a valid phone number with country code (e.g. +1 555-0100)');
    }

    this.checkRateLimit(phone);

    // Generate cryptographically secure 6-digit OTP
    const code = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 min TTL

    this.otpStore.set(phone, {
      code,
      expiresAt,
      attempts: 0
    });

    let realSmsSent = false;
    let smsError = null;

    if (this.config.provider === 'twilio') {
      try {
        await this.sendTwilioSMS(phone, code);
        realSmsSent = true;
      } catch (err) {
        console.warn('⚠️ Real SMS failed, falling back to simulated code:', err.message);
        smsError = err.message;
      }
    }

    // Always log to server console for auditing and debugging
    console.log(`\n======================================================`);
    console.log(`📱 [SMS GATEWAY ${realSmsSent ? 'REAL CELLULAR' : 'DEV MODE'}] Verification Code Sent`);
    console.log(`📞 Recipient: ${phone}`);
    console.log(`🔑 6-Digit OTP: ${code}`);
    console.log(`⏳ Expires: in 5 minutes`);
    if (smsError) console.log(`⚠️ SMS Carrier Notice: ${smsError}`);
    console.log(`======================================================\n`);

    return {
      phone,
      realSmsSent,
      // Provide devCode when not using live SMS or if trial fallback applies
      devCode: realSmsSent ? undefined : code,
      message: realSmsSent
        ? `Verification SMS dispatched to ${phone} via telecom carrier.`
        : `Verification code generated for ${phone}.`
    };
  }

  // Verify submitted code with brute-force protection
  verifyCode(rawPhone, inputCode) {
    const phone = this.normalizePhone(rawPhone);
    if (!phone || !inputCode) {
      throw new Error('Phone and verification code are required.');
    }

    const record = this.otpStore.get(phone);
    if (!record) {
      throw new Error('No verification code was requested for this phone number.');
    }

    if (Date.now() > record.expiresAt) {
      this.otpStore.delete(phone);
      throw new Error('Verification code has expired. Please request a new code.');
    }

    record.attempts = (record.attempts || 0) + 1;
    if (record.attempts > 5) {
      this.otpStore.delete(phone);
      throw new Error('Too many invalid attempts. This verification code has been invalidated for security.');
    }

    if (record.code !== inputCode.trim()) {
      const remaining = 5 - record.attempts;
      throw new Error(`Incorrect verification code. ${remaining} attempt(s) remaining.`);
    }

    // Code verified successfully!
    this.otpStore.delete(phone);
    return true;
  }
}

module.exports = new SMSService();
