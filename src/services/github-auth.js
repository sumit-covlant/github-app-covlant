import jwt from 'jsonwebtoken';
import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import fs from 'fs';

class GitHubAuthService {
  constructor() {
    this.appId = process.env.GITHUB_APP_ID;
    this.privateKeyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
    this.installationId = process.env.GITHUB_APP_INSTALLATION_ID || null; // Optional - will auto-detect
    
    // Cache for installation tokens and installations
    this.tokenCache = new Map();
    this.installationCache = new Map();
    this.TOKEN_EXPIRY_BUFFER = 5 * 60 * 1000; // 5 minutes buffer before expiry
  }

  /**
   * Get private key from file or environment variable
   */
  getPrivateKey() {
    if (process.env.GITHUB_APP_PRIVATE_KEY) {
      // Private key provided directly as environment variable
      return process.env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n');
    }
    
    if (this.privateKeyPath && fs.existsSync(this.privateKeyPath)) {
      // Private key provided as file path
      return fs.readFileSync(this.privateKeyPath, 'utf8');
    }
    
    throw new Error('GitHub App private key not found. Set GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH');
  }

  /**
   * Generate JWT for GitHub App authentication
   */
  generateJWT() {
    if (!this.appId) {
      throw new Error('GITHUB_APP_ID is required for GitHub App authentication');
    }

    const privateKey = this.getPrivateKey();
    const now = Math.floor(Date.now() / 1000);
    
    const payload = {
      iat: now - 60, // Issued at time, 60 seconds in the past to avoid clock drift
      exp: now + 600, // JWT expires after 10 minutes
      iss: this.appId // GitHub App ID
    };

    return jwt.sign(payload, privateKey, { algorithm: 'RS256' });
  }

  /**
   * Get all installations for this GitHub App
   */
  async getInstallations() {
    const cacheKey = 'app_installations';
    const cached = this.installationCache.get(cacheKey);
    
    if (cached && cached.expiresAt > Date.now()) {
      console.log('Using cached installations list');
      return cached.installations;
    }

    console.log('Fetching app installations...');
    
    const appJWT = this.generateJWT();
    const appOctokit = new Octokit({ auth: appJWT });

    try {
      const response = await appOctokit.apps.listInstallations();
      const installations = response.data;

      // Cache for 10 minutes
      this.installationCache.set(cacheKey, {
        installations,
        expiresAt: Date.now() + (10 * 60 * 1000)
      });

      console.log(`Found ${installations.length} installations`);
      return installations;
    } catch (error) {
      console.error('Failed to get installations:', error.message);
      throw new Error(`Failed to get app installations: ${error.message}`);
    }
  }

  /**
   * Find installation ID for a specific repository
   */
  async findInstallationForRepo(owner, repo) {
    const installations = await this.getInstallations();
    
    for (const installation of installations) {
      try {
        const appJWT = this.generateJWT();
        const appOctokit = new Octokit({ auth: appJWT });
        
        // Get repositories for this installation
        const reposResponse = await appOctokit.apps.listReposAccessibleToInstallation({
          installation_id: installation.id
        });
        
        // Check if our target repo is in this installation
        const targetRepo = reposResponse.data.repositories.find(
          r => r.owner.login.toLowerCase() === owner.toLowerCase() && 
               r.name.toLowerCase() === repo.toLowerCase()
        );
        
        if (targetRepo) {
          console.log(`Found installation ${installation.id} for ${owner}/${repo}`);
          return installation.id;
        }
      } catch (error) {
        console.warn(`Failed to check installation ${installation.id}:`, error.message);
        continue;
      }
    }
    
    throw new Error(`No installation found for repository ${owner}/${repo}`);
  }

  /**
   * Auto-detect installation ID from GitHub URL or repository info
   */
  async autoDetectInstallationId(githubUrl = null) {
    if (this.installationId) {
      return this.installationId;
    }

    if (githubUrl) {
      // Extract owner/repo from URL
      const match = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (match) {
        const [, owner, repo] = match;
        console.log(`Auto-detecting installation for ${owner}/${repo}...`);
        const installationId = await this.findInstallationForRepo(owner, repo);
        this.installationId = installationId; // Cache for future use
        return installationId;
      }
    }

    // If no specific repo, try to get the first available installation
    const installations = await this.getInstallations();
    if (installations.length > 0) {
      const installationId = installations[0].id;
      console.log(`Using first available installation: ${installationId}`);
      this.installationId = installationId; // Cache for future use
      return installationId;
    }

    throw new Error('No GitHub App installations found. Please install the app on at least one repository.');
  }

  /**
   * Get installation access token (cached)
   */
  async getInstallationToken(installationId = null, githubUrl = null) {
    let targetInstallationId = installationId || this.installationId;
    
    // Auto-detect installation ID if not provided
    if (!targetInstallationId) {
      console.log('Installation ID not provided, auto-detecting...');
      targetInstallationId = await this.autoDetectInstallationId(githubUrl);
    }

    // Check if we have a valid cached token
    const cacheKey = `installation_${targetInstallationId}`;
    const cachedToken = this.tokenCache.get(cacheKey);
    
    if (cachedToken && cachedToken.expiresAt > Date.now() + this.TOKEN_EXPIRY_BUFFER) {
      console.log('Using cached installation token');
      return cachedToken.token;
    }

    console.log('Fetching new installation token...');
    
    // Create Octokit instance with JWT for app authentication
    const appJWT = this.generateJWT();
    const appOctokit = new Octokit({
      auth: appJWT
    });

    try {
      // Get installation access token
      const response = await appOctokit.apps.createInstallationAccessToken({
        installation_id: targetInstallationId
      });

      const token = response.data.token;
      const expiresAt = new Date(response.data.expires_at).getTime();

      // Cache the token
      this.tokenCache.set(cacheKey, {
        token,
        expiresAt
      });

      console.log('New installation token obtained, expires at:', new Date(expiresAt).toISOString());
      return token;
    } catch (error) {
      console.error('Failed to get installation token:', error.message);
      throw new Error(`Failed to authenticate GitHub App: ${error.message}`);
    }
  }

  /**
   * Get authenticated Octokit instance for installation
   */
  async getOctokit(installationId = null, githubUrl = null) {
    const token = await this.getInstallationToken(installationId, githubUrl);
    
    return new Octokit({
      auth: token
    });
  }

  /**
   * Get authenticated Octokit instance using @octokit/auth-app (alternative method)
   */
  async getOctokitWithAuthApp(installationId = null) {
    const targetInstallationId = installationId || this.installationId;
    
    if (!targetInstallationId) {
      throw new Error('Installation ID is required');
    }

    const privateKey = this.getPrivateKey();

    const auth = createAppAuth({
      appId: this.appId,
      privateKey: privateKey,
      installationId: targetInstallationId,
    });

    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: this.appId,
        privateKey: privateKey,
        installationId: targetInstallationId,
      }
    });
  }

  /**
   * Validate GitHub App configuration
   */
  validateConfig() {
    const errors = [];
    
    if (!this.appId) {
      errors.push('GITHUB_APP_ID is required');
    }
    
    if (!process.env.GITHUB_APP_PRIVATE_KEY && !this.privateKeyPath) {
      errors.push('GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH is required');
    }
    
    // Installation ID is now optional - will be auto-detected
    if (!this.installationId) {
      console.log('ℹ️  GITHUB_APP_INSTALLATION_ID not provided - will auto-detect from installed repositories');
    }

    if (errors.length > 0) {
      throw new Error(`GitHub App configuration errors:\n${errors.join('\n')}`);
    }

    console.log('✅ GitHub App configuration validated');
    return true;
  }

  /**
   * Get app information (for debugging)
   */
  async getAppInfo() {
    try {
      const appJWT = this.generateJWT();
      const appOctokit = new Octokit({ auth: appJWT });
      
      const response = await appOctokit.apps.getAuthenticated();
      return response.data;
    } catch (error) {
      console.error('Failed to get app info:', error.message);
      throw error;
    }
  }
}

export default GitHubAuthService;
