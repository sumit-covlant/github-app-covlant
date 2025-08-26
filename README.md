# Simple Fastify GitHub Webhook

A minimal Fastify webhook server that captures all details when a Pull Request is created on GitHub.

## What It Does

When a PR is created, this webhook will:
- ✅ Capture all PR details (title, description, author, labels, etc.)
- ✅ Log everything to the console
- ✅ Return a success response to GitHub
- ✅ Validate webhook signatures for security
- 🆕 **Automatically create a remote branch with analysis files**
- 🆕 **Generate summary and metadata files at the same directory level**
- 🆕 **Create a draft PR stacked on top of the original PR**
- 🆕 **No local cloning required - all operations via GitHub API**
- 🛡️ **Loop prevention - automatically ignores self-generated PRs**

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Environment Variables
```bash
cp env.example .env
```

Edit `.env` and add your configuration:
```bash
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
GITHUB_TOKEN=your_github_personal_access_token_here
```

**Important**: You need a GitHub Personal Access Token with the following permissions:
- `repo` (Full control of private repositories)
- `workflow` (Update GitHub Action workflows)

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

### Analysis API (Internal)
```
POST /api/analyze-files
```
Internal API that processes file changes and returns file paths/content for PR analysis.

**Request Body:**
```json
{
  "changedFiles": [
    {
      "filename": "src/file.js",
      "status": "modified",
      "additions": 10,
      "deletions": 5
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "analysisId": "analysis-1234567890",
  "filesToCreate": [
    {
      "path": "python_oops/default.md",
      "content": "This is default1 content",
      "type": "default1"
    },
    {
      "path": "python_oops/default2.md",
      "content": "This is default2 content", 
      "type": "default2"
    }
  ]
}
```

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

## 🚀 Automated PR Analysis Feature

When a PR is created, the system will **automatically**:

### 1. **Analyze File Changes**
- Detect all directories where files were changed
- Extract file metadata (additions, deletions, status)

### 2. **Call Analysis API & Create Files**
- Calls internal dummy API (`/api/analyze-files`) with only changed files data
- API returns fixed file paths: `python_oops/default.md` and `python_oops/default2.md`
- Content is hardcoded: "This is default1 content" and "This is default2 content"
- No directory logic - files are created at specified paths

### 3. **Create Remote Branch & Draft PR**
- Creates a remote branch: `auto-analysis-pr-{PR_NUMBER}-{TIMESTAMP}`
- Based on the original PR's head branch (stacked on top)
- Uses GitHub API - no local cloning required
- Creates files directly via GitHub API
- Automatically creates a **draft PR** with the analysis files
- Links back to the original PR for context

### Example Workflow
```
Original PR: feature/user-auth → main
   ↓ (webhook triggers)
Auto PR: auto-analysis-pr-123-1234567890 → feature/user-auth
```

The analysis PR will always contain these two files:
```
python_oops/
├── default.md       # "This is default1 content"
└── default2.md      # "This is default2 content"
```

## 🛡️ Loop Prevention

The webhook automatically detects and ignores auto-generated PRs to prevent infinite loops:

### Detection Methods
- **Branch naming**: Skips branches starting with `auto-analysis-pr-`
- **Title pattern**: Ignores PRs with "Auto-generated analysis for PR" in title
- **Body markers**: Detects `🤖 Automated PR Analysis` and footer signatures
- **Safety checks**: Multiple layers of protection at webhook and service levels

### What You'll See
```
⚠️  Skipping auto-generated PR to prevent infinite loop:
  - PR Number: 124
  - Branch: auto-analysis-pr-123-1234567890
  - Detection: Branch pattern matched
```

## Project Structure
```
├── src/
│   ├── server.js              # Main server
│   ├── plugins/
│   │   └── github-webhook.js  # Webhook handler
│   └── services/
│       └── git-service.js     # Git operations & GitHub API

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
| `GITHUB_TOKEN` | GitHub Personal Access Token | Required for PR creation |
| `API_BASE_URL` | Base URL for analysis API calls | `http://localhost:3000` |

That's it! Simple and focused on just capturing PR details.
