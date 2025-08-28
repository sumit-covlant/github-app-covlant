# GitHub App Setup Guide

This guide will help you set up GitHub App authentication so your bot comments appear as "my-github-bot" instead of your personal account.

JWT Token -> Installation ID -> Installation Token(JWT Token + Installation ID) -> Then dhoom barabar dhoom

## 🚀 Quick Setup

### 1. Create GitHub App

1. **Go to GitHub Settings:**
   - Navigate to GitHub → Settings → Developer settings → GitHub Apps
   - Click "New GitHub App"

2. **Fill App Details:**
   ```
   GitHub App name: my-github-bot
   Description: Automated code analysis bot
   Homepage URL: http://localhost:3000 (or your domain)
   Webhook URL: https://your-domain.com/ (your webhook endpoint)
   Webhook secret: (generate a secure secret)
   ```

3. **Set Permissions:**
   ```
   Repository permissions:
   ✅ Contents: Read & Write
   ✅ Issues: Read & Write  
   ✅ Pull requests: Read & Write
   ✅ Commit statuses: Read & Write
   
   Subscribe to events:
   ✅ Pull requests
   ✅ Issue comments
   ```

4. **Generate Private Key:**
   - Scroll down and click "Generate a private key"
   - Download the `.pem` file and save it as `private-key.pem` in your project root

### 2. Install GitHub App

1. **Install on Repository:**
   - Go to your GitHub App settings
   - Click "Install App" → Select your account
   - Choose repositories (or all repositories)

### 3. Configure Environment Variables (Simplified!)

Create/update your `.env` file:

```env
# GitHub App Authentication (JWT Flow - Required)
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY_PATH=./private-key.pem

# Alternative: Private key as environment variable
# GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\\nMIIEpAIBAAK...\\n-----END RSA PRIVATE KEY-----"

# Optional: Installation ID (will be auto-detected if not provided)
# GITHUB_APP_INSTALLATION_ID=12345678

# Webhook Configuration
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here

# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
LOG_LEVEL=info
API_BASE_URL=http://localhost:3000
```

### 4. Find Your App ID

**App ID (Required):**
- Go to your GitHub App settings
- The App ID is shown at the top of the page

**Installation ID (Optional - Auto-detected):**
- The app will automatically detect the Installation ID from your installed repositories
- If you have multiple installations, it will use the first one found
- You can still manually specify `GITHUB_APP_INSTALLATION_ID` if needed

### 5. Test the Setup

```bash
# Start your server
npm start

# Check logs for authentication method
# Should show: "🤖 Using GitHub App authentication (JWT flow)"
# Should show: "Installation ID not provided, auto-detecting..."
# Should show: "Found installation XXXXX for owner/repo"
```

## 🔧 Authentication Flow

The app now uses **GitHub App authentication only** with these features:

1. **JWT Token Generation** - Creates signed JWT for app authentication
2. **Auto Installation Detection** - Finds the correct installation for each repository
3. **Token Caching** - Caches installation tokens for performance
4. **Automatic Token Refresh** - Handles token expiry automatically

## 📁 File Structure

```
fastify-git/
├── src/
│   ├── services/
│   │   ├── github-auth.js     # 🆕 GitHub App JWT authentication
│   │   ├── git-service.js     # Updated to use GitHub App
│   │   ├── github-status.js   # Updated to use GitHub App
│   │   └── ...
│   ├── plugins/
│   │   └── github-webhook.js  # Updated to use GitHub App
│   └── ...
├── private-key.pem           # 🆕 Your GitHub App private key
├── .env                      # Updated environment variables
└── ...
```

## 🎯 Result

After setup, all bot comments will show:

```
my-github-bot commented • now
```

Instead of:

```
your-username commented • now
```

## 🔍 Troubleshooting

### **Private Repository 404 Errors**

If you get `Error fetching PR file changes: GitHub API error: 404 Not Found` for private repositories:

1. **Check GitHub App Installation:**
   - Go to your repository → Settings → Integrations → GitHub Apps
   - Make sure your app is installed and shows "Configure" button
   - If not installed, install it from your GitHub App settings

2. **Verify Repository Access:**
   - In your GitHub App settings, check "Installation" tab
   - Make sure the private repository is listed under "Repository access"
   - If using "Selected repositories", add your private repo to the list

3. **Check App Permissions:**
   ```
   Repository permissions:
   ✅ Contents: Read & Write (Required for private repos)
   ✅ Issues: Read & Write  
   ✅ Pull requests: Read & Write
   ✅ Commit statuses: Read & Write
   ```

4. **Test Installation Access:**
   ```bash
   # Check if your app can access the repository
   node -e "
   import GitHubAuthService from './src/services/github-auth.js';
   const auth = new GitHubAuthService();
   auth.findInstallationForRepo('owner', 'repo-name')
     .then(id => console.log('✅ Installation ID:', id))
     .catch(err => console.error('❌ Error:', err.message));
   "
   ```

### **General Authentication Errors:**
```bash
# Check if your app configuration is valid
node -e "
import GitHubAuthService from './src/services/github-auth.js';
const auth = new GitHubAuthService();
auth.validateConfig().then(() => console.log('✅ Config valid'));
"
```

### **Token Issues:**
- Ensure private key file exists and is readable
- Check Installation ID is correct (or let it auto-detect)
- Verify app permissions are set correctly

### **Webhook Issues:**
- Make sure webhook URL is accessible
- Verify webhook secret matches
- Check that required events are subscribed


┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Private Key   │───▶│   Generate JWT  │───▶│   JWT Token     │
│   + App ID      │    │   (Signed)      │    │   (10 min)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                       │
                                                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Installation    │◀───│  GitHub API     │◀───│   JWT +         │
│ Token           │    │  Exchange       │    │   Installation  │
│ (1 hour)        │    │                 │    │   ID            │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │
         ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Repository    │◀───│   GitHub API    │◀───│   Installation  │
│   Access        │    │   Calls         │    │   Token         │
│   (Comments,    │    │   (Comments,    │    │   (Auth)        │
│    PRs, etc.)   │    │    PRs, etc.)   │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘

## 📚 Additional Resources

- [GitHub Apps Documentation](https://docs.github.com/en/developers/apps)
- [JWT Authentication](https://docs.github.com/en/developers/apps/building-github-apps/authenticating-with-github-apps)
- [Webhook Events](https://docs.github.com/en/developers/webhooks-and-events/webhooks/webhook-events-and-payloads)
