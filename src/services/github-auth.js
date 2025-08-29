import jwt from 'jsonwebtoken';
import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import fs from 'fs';

class GitHubAuthService {
  constructor() {
    this.appId = process.env.GITHUB_APP_ID;
    this.privateKeyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
    this.installationId = process.env.GITHUB_APP_INSTALLATION_ID || null; // Optional - will auto-detect
    
    // Cache for installation tokens, installations, and repo-to-installation mapping
    this.tokenCache = new Map(); // Cache token by owner/repo
    this.repoInstallationCache = new Map(); // Cache repo -> installation ID mapping
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
    
    console.log('Fetching app installations...');
    
    const appJWT = this.generateJWT();
    const appOctokit = new Octokit({ auth: appJWT });

    try {
      const response = await appOctokit.apps.listInstallations();
      const installations = response.data;

      console.log(`Found ${installations.length} installations`);
      return installations;
    } catch (error) {
      console.error('❌ Failed to get installations:', error.message);
      throw new Error(`Failed to get app installations: ${error.message}`);
    }
  }

  /**
   * Find installation ID for a specific repository
   */
  async findInstallationForRepo(owner, repo) {
    const installations = await this.getInstallations();
    console.log(`Searching for repository ${owner}/${repo} across ${installations.length} installations...`);
    
    for (const installation of installations) {
      try {
        console.log(`Checking installation ${installation.id} (account: ${installation.account.login}, type: ${installation.account.type})`);
        
        // First check if the installation account matches the repository owner
        if (installation.account.login.toLowerCase() === owner.toLowerCase()) {
          console.log(`Found matching account installation ${installation.id} for ${owner}/${repo}`);
          
          // Verify by trying to get an installation token and checking repository access
          const appJWT = this.generateJWT();
          const appOctokit = new Octokit({ auth: appJWT });
          
          const tokenResponse = await appOctokit.apps.createInstallationAccessToken({
            installation_id: installation.id
          });
          
          // Use the installation token to verify repository access
          const installationOctokit = new Octokit({ auth: tokenResponse.data.token });
          
          // Try to access the specific repository to confirm permissions
          try {
            await installationOctokit.repos.get({
              owner: owner,
              repo: repo
            });
            
            console.log(`✅ Confirmed access to ${owner}/${repo} via installation ${installation.id}`);
            
            // Cache the repo -> installation mapping for faster future lookups
            const repoKey = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
            this.repoInstallationCache.set(repoKey, installation.id);
            console.log(`📦 Cached installation mapping: ${repoKey} → ${installation.id}`);
            
            return installation.id;
          } catch (repoError) {
            console.warn(`Installation ${installation.id} matches account but cannot access repository:`, repoError.message);
            continue;
          }
        }
      } catch (error) {
        console.warn(`Failed to check installation ${installation.id}:`, error.message);
        continue;
      }
    }
    
    throw new Error(`No installation found for repository ${owner}/${repo}. Make sure the GitHub App is installed on this repository.`);
  }

  /**
   * Auto-detect installation ID from GitHub URL or repository info
   */
  async autoDetectInstallationId(owner = null, repo = null) {
    if (owner && repo) {
      const repoKey = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
      
      // Check if we have a cached installation ID for this specific repository
      const cachedInstallationId = this.repoInstallationCache.get(repoKey);
      if (cachedInstallationId) {
        console.log(`✅ Using cached installation ID for ${owner}/${repo}: ${cachedInstallationId}`);
        return cachedInstallationId;
      }
      
      console.log(`🔍 Auto-detecting installation for ${owner}/${repo}...`);
      
      try {
        const installationId = await this.findInstallationForRepo(owner, repo);
        // Note: findInstallationForRepo already caches the mapping
        console.log(`✅ Auto-detected installation ID: ${installationId}`);
        return installationId;
      } catch (error) {
        console.error(`❌ Failed to find installation for ${owner}/${repo}:`, error.message);
        throw error;
      }
    }

    // Fallback: Check if we have a global cached installation ID
    if (this.installationId) {
      console.log(`Using global cached installation ID: ${this.installationId}`);
      return this.installationId;
    }

    // If no specific repo, try to get the first available installation
    console.log('🔍 No specific repository provided, using first available installation...');
    const installations = await this.getInstallations();
    if (installations.length > 0) {
      const installationId = installations[0].id;
      console.log(`✅ Using first available installation: ${installationId} (${installations[0].account.login})`);
      this.installationId = installationId; // Cache for future use
      return installationId;
    }

    throw new Error('❌ No GitHub App installations found. Please install the app on at least one repository.');
  }

  /**
   * Get installation access token (cached)
   */
  async getInstallationToken(installationId = null, githubUrl = null) {
    let targetInstallationId = installationId || this.installationId;
    let owner = null;
    let repo = null;

    // Extract owner and repo from githubUrl if provided
    if (githubUrl) {
      const match = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (match) {
        [, owner, repo] = match;
        owner = owner.toLowerCase();
        repo = repo.toLowerCase();
      }
    }

    // Check if we have a valid cached token using repository-based key
    let cacheKey = null;
    if (owner && repo) {
      cacheKey = `token/${owner}/${repo}`;
      
      const cachedToken = this.tokenCache.get(cacheKey);
      
      if (cachedToken && cachedToken.expiresAt > Date.now() + this.TOKEN_EXPIRY_BUFFER) {
        const expiresIn = Math.round((cachedToken.expiresAt - Date.now()) / 1000 / 60);
        console.log(`✅ Using cached installation token for ${owner}/${repo} (expires in ${expiresIn} minutes)`);
        return cachedToken.token;
      }
    }

    // Auto-detect installation ID if not provided
    if (!targetInstallationId) {
      console.log('🔍 Installation ID not provided, auto-detecting...');
      targetInstallationId = await this.autoDetectInstallationId(owner, repo);
    }

    console.log(`🔄 Generating new installation token for installation ${targetInstallationId}...`);
    
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

      // Cache the token if we have a valid cache key
      if (cacheKey) {
        this.tokenCache.set(cacheKey, {
          token,
          expiresAt
        });
        
        const expiresIn = Math.round((expiresAt - Date.now()) / 1000 / 60);
        console.log(`✅ New installation token generated and cached with key: ${cacheKey} (expires in ${expiresIn} minutes)`);
      } else {
        const expiresIn = Math.round((expiresAt - Date.now()) / 1000 / 60);
        console.log(`✅ New installation token generated (expires in ${expiresIn} minutes)`);
      }
      
      return token;
    } catch (error) {
      console.error('❌ Failed to get installation token:', error.message);
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
      console.error('❌ Failed to get app info:', error.message);
      throw error;
    }
  }
}

export default GitHubAuthService;
