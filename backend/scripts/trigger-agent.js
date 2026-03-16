
const crypto = require('crypto');

const secret = 'test_secret_for_webhook';
const payload = JSON.stringify({});

const hmac = crypto.createHmac('sha256', secret);
const signature = 'sha256=' + hmac.update(payload).digest('hex');

async function trigger() {
  try {
    const res = await fetch('http://localhost:3001/api/agent/webhook', {
      method: 'POST',
      headers: {
        'x-hub-signature-256': signature,
        'x-github-event': 'push',
        'Content-Type': 'application/json'
      },
      body: payload
    });

    const data = await res.json();
    console.log('Response status:', res.status);
    console.log('Response body:', data);
  } catch (e) {
    console.error('Error:', e.message);
  }
}

trigger();
