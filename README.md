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
  "filesToCreate": filesToCreate = [
    {
      "path": "python_oops/default.md",
      "content": "This is default content",
      "type": "default",
      "fileExists": false,
    },
    {
      "path": "python_oops/README.md", 
      "content": "This is new readme content",
      "type": "README",
      "fileExists": true, 
    }
  ];
}
```

**New Field: `fileExists`**
- `false`: File will be created (new file)
- `true`: File will be updated (existing file)

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
- Extract file metadata (additions, deletions, status) from the PR
- Pass changed files data to analysis API

### 2. **Call Analysis API First**
- Calls internal API (`/api/analyze-files`) with changed files data
- API returns file paths, content, and `fileExists` flags
- **Early exit**: If no files returned, skips branch/PR creation entirely

### 3. **Create Remote Branch & Files (Only if files exist)**
- Creates a remote branch: `auto-analysis-pr-{PR_NUMBER}-{TIMESTAMP}`
- Based on the original PR's head branch (stacked on top)
- **Smart file handling**: Creates new files or updates existing ones based on `fileExists` flag
- Uses GitHub API - no local cloning required

### 4. **Create Draft PR**
- Automatically creates a **draft PR** with the analysis files
- Links back to the original PR for context
- Only created if files were successfully created

### Example Workflow
```
Original PR: feature/user-auth → main
   ↓ (webhook triggers)
Auto PR: auto-analysis-pr-123-1234567890 → feature/user-auth
```

### Workflow Execution Order:
```
1. PR Created → Webhook Triggered
2. Set GitHub Status: "covlant-app processing PR #X"
3. Call Analysis API with changed files
4. Check API Response:
   ├─ No files? → Set Status: "covlant-app skipped: No files to analyze"
   └─ Has files? → Continue to step 5
5. Create remote branch
6. Create/update files based on fileExists flags
7. Create draft PR
8. Set GitHub Status: "covlant-app processing complete for PR #X" (with link)
```

The analysis PR will contain these files (if API returns them):
```
python_oops/
├── default.md       # "This is default content"
└── README.md        # "This is new readme content"
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
│       ├── git-service.js     # Git operations & GitHub API
│       └── github-status.js   # Simple GitHub status updates

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
