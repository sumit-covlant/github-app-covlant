# Simple Fastify GitHub Webhook

A minimal Fastify webhook server that captures all details when a Pull Request is created on GitHub.

## What It Does

When a PR is created, this webhook will:
- ✅ Capture all PR details (title, description, author, labels, etc.)
- ✅ Log everything to the console
- ✅ Return a success response to GitHub
- ✅ Validate webhook signatures for security

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Environment Variables
```bash
cp env.example .env
```

Edit `.env` and add your GitHub webhook secret:
```bash
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
```

### 3. Start the Server
```bash
# Development mode
npm run dev

# Production mode
npm start
```

Server runs on `http://localhost:3000`

## GitHub Setup

### 1. Create Webhook in Your Repository
1. Go to **Settings** → **Webhooks**
2. Click **"Add webhook"**
3. Configure:
   - **Payload URL**: `https://your-domain.com/webhook/github`
   - **Content type**: `application/json`
   - **Secret**: Same value as `GITHUB_WEBHOOK_SECRET`
   - **Events**: Select **"Just the pull_request event"**

### 2. Test the Webhook
Create a Pull Request in your repository to trigger the webhook.

## API Endpoints

### GitHub Webhook
```
POST /webhook/github
```
Handles GitHub webhook events. Logs all PR creation details.

### Test Endpoint (Development)
```
POST /webhook/test
```
Simulates a webhook for testing.

### Health Check
```
GET /health
```
Server status check.

## Testing

Run the test script to see how to test the webhook:
```bash
node test-simple.js
```

This will show you the exact curl command to test the webhook.

## What Gets Logged

When a PR is created, you'll see:
- PR number, title, description
- Repository name
- Author details
- Branch information
- Labels and assignees
- Creation timestamp
- And more...

## Project Structure
```
├── src/
│   ├── server.js              # Main server
│   └── plugins/
│       └── github-webhook.js  # Webhook handler
├── package.json
├── env.example
└── test-simple.js             # Test script
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `HOST` | Server host | `0.0.0.0` |
| `NODE_ENV` | Environment | `development` |
| `GITHUB_WEBHOOK_SECRET` | GitHub webhook secret | Required |

That's it! Simple and focused on just capturing PR details.
