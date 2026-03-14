import crypto from 'crypto';

const secret = 'test_secret_for_webhook';
const payload = JSON.stringify({
  action: 'closed',
  pull_request: {
    state: 'closed',
    merged: true
  }
});

const hmac = crypto.createHmac('sha256', secret);
const digest = 'sha256=' + hmac.update(payload).digest('hex');

async function run() {
  console.log('Sending mock GitHub webhook...');
  try {
    const res = await fetch('http://localhost:3000/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-github-event': 'pull_request',
        'x-hub-signature-256': digest
      },
      body: payload
    });
    
    const text = await res.text();
    console.log(`Response Status: ${res.status}`);
    console.log(`Response Body: ${text}`);
  } catch (e) {
    console.error('Error sending webhook:', e.message);
  }
}

run();
