const crypto = require('crypto');

// Simple test payload
const testPayload = {
  action: 'opened',
  pull_request: {
    number: 123,
    title: 'Test PR',
    body: 'This is a test pull request',
    html_url: 'https://github.com/test/repo/pull/123',
    created_at: new Date().toISOString(),
    base: { ref: 'main' },
    head: { ref: 'feature/test' },
    draft: false,
    labels: [{ name: 'test' }],
    assignees: [{ login: 'testuser', id: 12345 }]
  },
  repository: {
    full_name: 'test/repo',
    name: 'repo'
  },
  sender: {
    login: 'testuser',
    id: 12345
  }
};

// Generate signature (use 'test-secret' if no env var)
const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET || 'test-secret';
const payload = JSON.stringify(testPayload);
const signature = `sha256=${crypto
  .createHmac('sha256', webhookSecret)
  .update(payload)
  .digest('hex')}`;

console.log('Simple Webhook Test');
console.log('===================');
console.log('URL: http://localhost:3000/webhook/github');
console.log('Method: POST');
console.log('Headers:');
console.log(`  Content-Type: application/json`);
console.log(`  X-Hub-Signature-256: ${signature}`);
console.log(`  X-GitHub-Event: pull_request`);
console.log('');
console.log('Test with curl:');
console.log('');
console.log(`curl -X POST http://localhost:3000/webhook/github \\`);
console.log(`  -H "Content-Type: application/json" \\`);
console.log(`  -H "X-Hub-Signature-256: ${signature}" \\`);
console.log(`  -H "X-GitHub-Event: pull_request" \\`);
console.log(`  -d '${payload}'`);
console.log('');
console.log('Or test the simple endpoint:');
console.log('curl -X POST http://localhost:3000/webhook/test');
