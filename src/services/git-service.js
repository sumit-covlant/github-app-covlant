import { Octokit } from "@octokit/rest";
import GitHubAuthService from "./github-auth.js";

class GitService {
  constructor(githubAuth = null) {
    this.githubAuth = githubAuth || new GitHubAuthService();
    this.apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
  }

  /**
   * Get authenticated Octokit instance (always use repository context)
   */
  async getOctokit(githubUrl = null) {
    try {
      if (!process.env.GITHUB_APP_ID) {
        throw new Error('GITHUB_APP_ID is required. Please configure GitHub App authentication.');
      }
      
      console.log('GitService: Using GitHub App authentication');
      // Always get fresh Octokit with repository context (no caching at this level)
      return await this.githubAuth.getOctokit(null, githubUrl);
    } catch (error) {
      console.error('❌GitService authentication failed:', error.message);
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
   * Get unique directories from changed files
   */
  /**
   * Call external API to get file analysis and paths
   */
  async callAnalysisAPI(changedFiles) {
    try {
      console.log('Calling analysis API...');
      
      const response = await fetch(`${this.apiBaseUrl}/api/analyze-files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          changedFiles: changedFiles
        })
      });

      if (!response.ok) {
        throw new Error(`Analysis API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Analysis API response received:', {
        filesCount: result.filesToCreate?.length || 0,
        analysisId: result.analysisId,
        filePaths: result.filesToCreate?.map(f => f.path) || []
      });

      return result;
    } catch (error) {
      console.error('❌Error calling analysis API:', error.message);
      throw error;
    }
  }



  /**
   * Create new branch remotely via GitHub API
   */
  async createRemoteBranch(repoUrl, baseBranch, newBranchName) {
    const { owner, repo } = this.parseGitHubUrl(repoUrl);
    console.log(`Owner: ${owner}, Repo: ${repo}`);

    console.log(
      `Creating remote branch: ${newBranchName} based on ${baseBranch}`
    );

    try {
      const octokit = await this.getOctokit(repoUrl);

      // Get the SHA of the base branch
      const baseBranchRef = await octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${baseBranch}`,
      });

      const baseSha = baseBranchRef.data.object.sha;
      console.log(`Base branch ${baseBranch} SHA: ${baseSha}`);

      // Create new branch
      await octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${newBranchName}`,
        sha: baseSha,
      });

      console.log(`Successfully created remote branch: ${newBranchName}`);
      return { owner, repo, baseSha };
    } catch (error) {
      console.error("❌Error creating remote branch:", error.message);
      throw error;
    }
  }

  /**
   * Get file SHA if it exists (for updates)
   */
  async getFileSHA(owner, repo, path, branch) {
    try {
      const repoUrl = `https://github.com/${owner}/${repo}`;
      const octokit = await this.getOctokit(repoUrl);
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path,
        ref: branch
      });
      return response.data.sha;
    } catch (error) {
      if (error.status === 404) {
        return null; 
      }
      throw error;
    }
  }

  /**
   * Create files remotely via GitHub API using API response
   */
  async createFilesFromAPIResponse(
    owner,
    repo,
    branchName,
    apiResponse,
    prData
  ) {
    const createdFiles = [];

    console.log(`Processing ${apiResponse.filesToCreate.length} files from API response...`);

    for (const fileData of apiResponse.filesToCreate) {
      try {
        const requestData = {
          owner,
          repo,
          path: fileData.path,
          content: Buffer.from(fileData.content).toString("base64"),
          branch: branchName,
        };

        // Handle file existence based on API response
        if (fileData.fileExists) {
          // File exists - need SHA for update
          const sha = await this.getFileSHA(owner, repo, fileData.path, branchName);
          if (sha) {
            requestData.sha = sha;
            requestData.message = `Update ${fileData.type} file for PR #${prData.number} analysis`;
            console.log(`File ${fileData.path} exists - updating...`);
          } else {
            // API says file exists but we couldn't get SHA - treat as create
            requestData.message = `Add ${fileData.type} file for PR #${prData.number} analysis`;
            console.log(`File ${fileData.path} marked as existing but not found - creating...`);
          }
        } else {
          // File doesn't exist - create new
          requestData.message = `Add ${fileData.type} file for PR #${prData.number} analysis`;
          console.log(`File ${fileData.path} doesn't exist - creating...`);
        }

        // Create or update file using GitHub API
        const repoUrl = `https://github.com/${owner}/${repo}`;
        const octokit = await this.getOctokit(repoUrl);
        await octokit.repos.createOrUpdateFileContents(requestData);

        createdFiles.push(fileData.path);

        const action = fileData.fileExists ? 'Updated' : 'Created';
        console.log(`${action} file: ${fileData.path}`);
      } catch (error) {
        console.error(`❌Error processing file ${fileData.path}:`, error.message);
        throw error;
      }
    }

    console.log(`🎉 Successfully processed ${createdFiles.length} files remotely`);
    return createdFiles;
  }

  /**
   * Create pull request (as draft initially)
   */
  async createPullRequest(
    owner,
    repo,
    newBranchName,
    baseBranch,
    prData,
    isDraft = true
  ) {
    const title = `Auto-generated Covlant-app analysis for PR #${prData.number}: ${prData.title}`;
    const body = `## Automated PR Analysis ${isDraft ? "(Draft)" : ""}

This PR was automatically generated in response to PR #${prData.number}.

### Original PR Details
- **Base Branch**: ${baseBranch}
- **Head Branch**: ${newBranchName}

---
*Auto-generated by fastify-github-webhook at ${new Date().toISOString()}*`;

    try {
      const repoUrl = `https://github.com/${owner}/${repo}`;
      const octokit = await this.getOctokit(repoUrl);
      const response = await octokit.pulls.create({
        owner,
        repo,
        title,
        head: newBranchName,
        base: baseBranch, // This creates PR on top of the original PR's branch
        body,
        draft: isDraft, // Create as draft initially
      });

      const status = isDraft ? "draft PR" : "PR";
      console.log(
        `Created ${status} #${response.data.number}: ${response.data.html_url}`
      );
      return response.data;
    } catch (error) {
      console.error("❌Error creating PR:", error.message);
      throw error;
    }
  }

  /**
   * Main workflow: Process PR and create analysis PR remotely
   */
  async processPRAndCreateAnalysis(prData, fileChanges) {
    try {
      console.log("=== Starting Remote PR Analysis Workflow ===");

      // Safety check: Ensure we don't process our own PRs
      if (prData.headBranch.startsWith("auto-analysis-pr-")) {
        throw new Error(
          "Attempted to process auto-generated PR - this should have been caught earlier!"
        );
      }

      // Step 1: Call analysis API first to get file paths and content
      console.log("Step 1: Calling analysis API...");
      const apiResponse = await this.callAnalysisAPI(fileChanges);

      // Step 2: Check if API returned any files to create
      if (!apiResponse.filesToCreate || apiResponse.filesToCreate.length === 0) {
        console.log("No files to create from API response - skipping branch/PR creation");
        return {
          success: true,
          skipped: true,
          reason: "No files to create",
          analysisId: apiResponse.analysisId,
          apiResponse: {
            timestamp: apiResponse.timestamp,
            filesCount: 0
          }
        };
      }

      console.log(`API returned ${apiResponse.filesToCreate.length} files to create`);

      // Step 3: Generate unique branch name with clear auto-generated marker
      const timestamp = Date.now();
      const newBranchName = `auto-analysis-pr-${prData.number}-${timestamp}`;

      // Step 4: Create remote branch (based on the PR's head branch)
      console.log("Step 2: Creating remote branch...");
      const { owner, repo } = await this.createRemoteBranch(
        prData.url,
        prData.headBranch, // Use the PR's head branch as base
        newBranchName
      );

      // Step 5: Create files remotely using API response
      console.log("Step 3: Creating files...");
      const createdFiles = await this.createFilesFromAPIResponse(
        owner,
        repo,
        newBranchName,
        apiResponse,
        prData
      );

      // Step 6: Create draft PR (on top of the original PR)
      console.log("Step 4: Creating draft PR...");
      const newPR = await this.createPullRequest(
        owner,
        repo,
        newBranchName,
        prData.headBranch, // Base it on the original PR's head branch
        prData,
        true // Create as draft
      );

      console.log("=== Remote PR Analysis Workflow Completed ===");
      return {
        success: true,
        newPR: {
          number: newPR.number,
          url: newPR.html_url,
          branch: newBranchName,
          isDraft: newPR.draft,
        },
        createdFiles,
        analysisId: apiResponse.analysisId,
        apiResponse: {
          timestamp: apiResponse.timestamp,
          filesCount: apiResponse.filesToCreate.length,
          filePaths: apiResponse.filesToCreate.map(f => f.path)
        }
      };
    } catch (error) {
      console.error("❌Error in remote PR analysis workflow:", error.message);
      throw error;
    }
  }
}

export default GitService;
