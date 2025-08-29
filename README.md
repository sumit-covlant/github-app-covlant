# GitHub App Webhook with Interactive Analysis

A comprehensive GitHub App webhook server that provides interactive code analysis for Pull Requests with GitHub App JWT authentication.

## What It Does

When a PR is created, this webhook will:
- ✅ **Interactive PR Analysis** - Posts comment with checkbox options for developers
- ✅ **GitHub App Authentication** - Uses JWT tokens for secure bot-like interactions  
- ✅ **Repository Status Updates** - Shows real-time processing status on GitHub
- ✅ **Smart Installation Detection** - Auto-detects GitHub App installation across multiple accounts
- ✅ **Dual Analysis Options**:
  - 📝 **Create Analysis PR** - Generate separate PR with analysis files
  - 💬 **Add Comments** - Post analysis results directly as PR comments
- ✅ **Repository-Based Token Caching** - Optimized for multi-repository deployments
- 🛡️ **Loop prevention** - Automatically ignores self-generated PRs

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up GitHub App Authentication

Create your `.env` file:
```bash
cp env.example .env
```

Configure GitHub App authentication in `.env`:
```bash
# GitHub App Authentication (Required)
GITHUB_APP_ID=your_github_app_id_here
GITHUB_APP_PRIVATE_KEY_PATH=./private-key.pem

# Webhook Configuration
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here

# Server Configuration
PORT=3000
API_BASE_URL=http://localhost:3000
```

**GitHub App Setup Required**: You need to create a GitHub App with these permissions:
- ✅ **Contents**: Read & Write (for creating files)
- ✅ **Issues**: Read & Write (for PR comments)
- ✅ **Pull requests**: Read & Write (for PR operations)
- ✅ **Commit statuses**: Read & Write (for status updates)

**Webhook Events Required**:
- ✅ **Pull requests** (for PR creation)
- ✅ **Issue comments** (for checkbox interactions)

### 3. Start the Server
```bash
# Development mode
npm run dev

# Production mode
npm start
```

Server runs on `http://localhost:3000`

## GitHub App Setup

### 1. Create GitHub App
1. Go to **GitHub** → **Settings** → **Developer settings** → **GitHub Apps**
2. Click **"New GitHub App"**
3. Configure:
   - **GitHub App name**: `your-bot-name` (this will be the comment author)
   - **Homepage URL**: `http://localhost:3000` (or your domain)
   - **Webhook URL**: `https://your-domain.com/` (your webhook endpoint)
   - **Webhook secret**: Same value as `GITHUB_WEBHOOK_SECRET`

### 2. Set Permissions & Events
**Repository permissions:**
- Contents: Read & Write
- Issues: Read & Write  
- Pull requests: Read & Write
- Commit statuses: Read & Write

**Subscribe to events:**
- Pull requests
- Issue comments

### 3. Install & Configure
1. **Generate private key** and save as `private-key.pem`
2. **Install the app** on your repositories
3. **Copy App ID** to your `.env` file
4. The app will **auto-detect Installation ID** for each repository

### 4. Test the Setup
Create a Pull Request to see the interactive comment with analysis options.

## API Endpoints

### GitHub Webhook
```
POST /
```
Handles GitHub webhook events:
- **Pull Request Created**: Posts interactive comment with analysis options
- **Issue Comment Edited**: Detects checkbox selections and processes accordingly

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

## 🚀 Interactive PR Analysis Workflow

### **Step 1: PR Created → Interactive Comment**
When a PR is created, the bot automatically:
1. **Sets GitHub Status**: `covlant-app analyzing PR #X`
2. **Fetches file changes** from the PR
3. **Posts interactive comment** with file summary and analysis options:

```markdown
## 🔍 Files Changed in this PR

Hi! I've detected 3 changed files in this PR:
1. **src/main.js** (modified) - +10 -5
2. **tests/test.js** (added) - +25 -0  
3. **README.md** (modified) - +2 -1

### Choose Analysis Option:
- [ ] **Analyze and create new PR** - Create a separate PR with analysis files
- [ ] **Analyze and add to comments** - Add analysis results as comments on this PR

**Instructions:** Check one of the boxes above to proceed with analysis.

---
*🤖 Automated by Covlant App*
```

### **Step 2: Developer Interaction**
Developer selects one option by checking a checkbox. The bot detects the selection and:

### **Step 3A: Create Analysis PR Option**
If "Create new PR" is selected:
1. **Updates comment**: Shows processing status
2. **Sets GitHub Status**: `covlant-app processing PR #X`
3. **Calls analysis API** with changed files
4. **Creates remote branch**: `auto-analysis-pr-{PR_NUMBER}-{TIMESTAMP}`
5. **Creates analysis files** in the new branch
6. **Creates draft PR** stacked on the original PR
7. **Updates comment**: Shows completion with PR link
8. **Sets GitHub Status**: `covlant-app processing complete` (with link)

### **Step 3B: Add Comments Option**
If "Add to comments" is selected:
1. **Updates comment**: Shows processing status  
2. **Sets GitHub Status**: `covlant-app processing PR #X`
3. **Calls analysis API** with changed files
4. **Posts analysis results** as individual comments on the PR
5. **Updates comment**: Shows completion summary
6. **Sets GitHub Status**: `covlant-app processing complete`

### **Example Workflows**

#### **Create PR Workflow:**
```
Original PR: feature/user-auth → main
   ↓ (developer selects "Create new PR")
Analysis PR: auto-analysis-pr-123-1234567890 → feature/user-auth
```

#### **Add Comments Workflow:**
```
Original PR: feature/user-auth → main
   ↓ (developer selects "Add to comments")  
PR gets multiple analysis comments with file contents
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

## 🏗️ Architecture & Authentication Flow

### **GitHub App JWT Authentication**
```
1. JWT Generation (App-level)
   ├─ Private Key + App ID → Signed JWT (10 min expiry)
   └─ Used for: Listing installations, getting installation tokens

2. Installation Detection (Repository-specific)  
   ├─ Auto-detect installation for each repository
   ├─ Cache: repo → installation ID mapping
   └─ Support for multiple GitHub accounts/organizations

3. Installation Token (Repository access)
   ├─ JWT + Installation ID → Installation Token (1 hour expiry) 
   ├─ Cache: token/{owner}/{repo} → installation token
   └─ Used for: All repository operations (comments, PRs, status)

4. Repository Operations
   ├─ Authenticated Octokit with installation token
   └─ Bot appears as "your-github-app-name" in comments
```

### **Multi-Account Support**
The system supports GitHub Apps installed across multiple accounts:
```
✅ Personal account: "john-dev/my-project" → Installation #12345
✅ Company account: "acme-corp/backend" → Installation #67890  
✅ Client account: "client-org/frontend" → Installation #54321
```

### **Project Structure**
```
├── src/
│   ├── server.js                 # Fastify server with mock analysis API
│   ├── plugins/
│   │   └── github-webhook.js     # Main webhook handler & interactive logic
│   └── services/
│       ├── github-auth.js        # 🆕 GitHub App JWT authentication
│       ├── git-service.js        # Git operations & GitHub API calls
│       └── github-status.js      # GitHub commit status updates
├── private-key.pem               # GitHub App private key
├── package.json
└── env.example
```

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `GITHUB_APP_ID` | GitHub App ID | ✅ Yes | - |
| `GITHUB_APP_PRIVATE_KEY_PATH` | Path to private key file | ✅ Yes | `./private-key.pem` |
| `GITHUB_APP_PRIVATE_KEY` | Private key content (alternative) | ❌ No | - |
| `GITHUB_APP_INSTALLATION_ID` | Installation ID (auto-detected) | ❌ No | Auto-detect |
| `GITHUB_WEBHOOK_SECRET` | Webhook signature validation | ⚠️ Recommended | - |
| `PORT` | Server port | ❌ No | `3000` |
| `HOST` | Server host | ❌ No | `0.0.0.0` |
| `NODE_ENV` | Environment | ❌ No | `development` |
| `API_BASE_URL` | Analysis API base URL | ❌ No | `http://localhost:3000` |

## 🚀 Ready to Go!

This GitHub App provides a complete interactive analysis workflow with:
- ✅ **Secure GitHub App authentication** (no personal tokens needed)
- ✅ **Multi-account support** (works across organizations)  
- ✅ **Interactive developer experience** (checkbox-driven workflow)
- ✅ **Flexible analysis options** (PR creation or comments)
- ✅ **Real-time status updates** on GitHub
- ✅ **Repository-optimized caching** for performance

Perfect for teams wanting automated code analysis with developer control! 🎯
