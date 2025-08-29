import { Octokit } from "@octokit/rest";
import GitHubAuthService from "./github-auth.js";

class GitHubStatusService {
  constructor(githubAuth = null) {
    this.githubAuth = githubAuth || new GitHubAuthService();
    this.appName = "covlant-app";
  }

  /**
   * Get authenticated Octokit instance (always use repository context)
   */
  async getOctokit(githubUrl = null) {
    try {
      if (!process.env.GITHUB_APP_ID) {
        throw new Error('GITHUB_APP_ID is required. Please configure GitHub App authentication.');
      }
      
      console.log('GitHubStatusService: Using GitHub App authentication');
      // Always get fresh Octokit with repository context (no caching at this level)
      return await this.githubAuth.getOctokit(null, githubUrl);
    } catch (error) {
      console.error('❌GitHubStatusService authentication failed:', error.message);
      throw new Error(`GitHub App authentication required: ${error.message}`);
    }
  }

  parseGitHubUrl(url) {
    // From: https://github.com/owner/repo/pull/123
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) throw new Error("Invalid GitHub URL");
    return { owner: match[1], repo: match[2] };
  }

  /**
   * Set a status check on a specific commit
   * @param {string} repoUrl - GitHub repository URL
   * @param {string} sha - Commit SHA
   * @param {string} state - Status state: 'pending', 'success', 'error', 'failure'
   * @param {string} description - Status description
   * @param {string} context - Status context (unique identifier)
   * @param {string} targetUrl - Optional URL to link to
   */
  async setStatus(repoUrl, sha, state, description, context = 'covlant-app/analysis', targetUrl = null) {
    try {
      const { owner, repo } = this.parseGitHubUrl(repoUrl);
      
      // Validate inputs
      if (!sha || sha.length < 7) {
        throw new Error('Invalid commit SHA');
      }
      
      if (!['pending', 'success', 'error', 'failure'].includes(state)) {
        throw new Error(`Invalid state: ${state}`);
      }
      
      const maxDescLength = 140;
      const truncatedDescription = description.length > maxDescLength 
        ? description.substring(0, maxDescLength - 3) + '...' 
        : description;
      
      console.log(`Setting GitHub status: ${state} - ${truncatedDescription}`);
      console.log(`Repository: ${owner}/${repo}, SHA: ${sha.substring(0, 7)}`);
      
      const statusData = {
        owner,
        repo,
        sha,
        state,
        description: truncatedDescription,
        context,
      };

      if (targetUrl) {
        statusData.target_url = targetUrl;
      }

      const octokit = await this.getOctokit(repoUrl);
      const response = await octokit.repos.createCommitStatus(statusData);
      
      console.log(`✅ Status set successfully: ${context} - ${state}`);
      return response.data;
    } catch (error) {
      console.error(`❌Failed to set GitHub status: ${error.message}`);
      if (error.response?.data) {
        console.error('❌GitHub API error details:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  async setProcessing(repoUrl, sha, prNumber) {
    return this.setStatus(
      repoUrl,
      sha,
      'pending',
      `covlant-app analyzing PR #${prNumber}`,
      'covlant-sentinel-app'
    );
  }

  async setComplete(repoUrl, sha, prNumber, analysisPRUrl) {
    return this.setStatus(
      repoUrl,
      sha,
      'success',
      `covlant-app analysis complete for PR #${prNumber}`,
      'covlant-sentinel-app',
      analysisPRUrl
    );
  }

  //Set status to success (no processing needed)- when no files are created by CNE
  async setSkipped(repoUrl, sha, prNumber, reason) {
    return this.setStatus(
      repoUrl,
      sha,
      'success',
      `covlant-app skipped: ${reason}`,
      'covlant-sentinel-app'
    );
  }

  async setError(repoUrl, sha, prNumber, error) {
    const maxLength = 80; // Leave room for prefix
    const truncatedError = error.length > maxLength ? error.substring(0, maxLength) + '...' : error;
    return this.setStatus(
      repoUrl,
      sha,
      'error',
      `covlant-app failed: ${truncatedError}`,
      'covlant-sentinel-app'
    );
  }


}

export default GitHubStatusService;
