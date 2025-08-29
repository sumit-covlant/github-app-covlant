import GitService from "../services/git-service.js";
import GitHubStatusService from "../services/github-status.js";
import GitHubAuthService from "../services/github-auth.js";

async function githubWebhookPlugin(fastify, options) {
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
  
  // Create shared GitHub Auth service instance
  const githubAuth = new GitHubAuthService();
  
  // Pass shared auth service to other services
  const gitService = new GitService(githubAuth);
  const statusService = new GitHubStatusService(githubAuth);
  
  // Validate GitHub App configuration (but don't generate tokens yet)
  try {
    if (!process.env.GITHUB_APP_ID) {
      throw new Error('GITHUB_APP_ID is required. Please configure GitHub App authentication.');
    }
    
    console.log('🤖 GitHub App authentication configured (JWT flow)');
    githubAuth.validateConfig();
    console.log('✅ GitHub App configuration validated - tokens will be generated on-demand');
  } catch (error) {
    console.error('❌GitHub App configuration failed:', error.message);
    throw new Error(`GitHub App configuration required: ${error.message}`);
  }

  if (!webhookSecret) {
    console.log(
      "GITHUB_WEBHOOK_SECRET not set. Webhook signature validation will be skipped."
    );
  }

  if (!process.env.GITHUB_APP_ID) {
    console.log("GITHUB_APP_ID not configured. PR creation workflow will be disabled.");
  }

  // ==================== UTILITY FUNCTIONS ====================
  
  const parseGitHubUrl = (url) => {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) throw new Error("Invalid GitHub URL");
    return { owner: match[1], repo: match[2] };
  };

  const createPRComment = async (prUrl, prNumber, commentBody) => {
    try {
      const { owner, repo } = parseGitHubUrl(prUrl);
      const octokit = await githubAuth.getOctokit(null, prUrl);
      const response = await octokit.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: commentBody
      });
      console.log(`Comment created on PR #${prNumber}`);
      return response.data;
    } catch (error) {
      console.error(`❌Failed to create comment: ${error.message}`);
      throw error;
    }
  };

  const updateComment = async (prUrl, commentId, commentBody) => {
    try {
      const { owner, repo } = parseGitHubUrl(prUrl);
      const octokit = await githubAuth.getOctokit(null, prUrl);
      await octokit.issues.updateComment({
        owner,
        repo,
        comment_id: commentId,
        body: commentBody
      });
      console.log(`Comment ${commentId} updated`);
    } catch (error) {
      console.error(`❌Failed to update comment: ${error.message}`);
      throw error;
    }
  };

  // ==================== COMMENT TEMPLATES ====================
  
  const createInitialComment = (fileChanges) => {
    const filesList = fileChanges.map((file, index) => 
      `${index + 1}. **${file.filename}** (${file.status}) - +${file.additions} -${file.deletions}`
    ).join('\n');

    return `## 🔍 Files Changed in this PR

Hi! I've detected **${fileChanges.length} changed files** in this PR:

${filesList}

### Choose Analysis Option:

- [ ] **Analyze and create new PR** - Create a separate PR with analysis files
- [ ] **Analyze and add to comments** - Add analysis results as comments on this PR

**Instructions:** Check one of the boxes above to proceed with analysis.

---
*🤖 Automated by Covlant App*`;
  };

  const createProcessingComment = (choice) => {
    return `## 🔍 Files Changed in this PR

**Status:** 🔄 **UT is being generated...** 

Please wait while I ${choice === 'create_pr' ? 'create analysis PR' : 'add analysis comments'}.

---
*🤖 Automated by Covlant App*`;
  };

  const createCompletedComment = (fileChanges, choice, result = null) => {
    const filesList = fileChanges.map((file, index) => 
      `${index + 1}. **${file.filename}** (${file.status}) - +${file.additions} -${file.deletions}`
    ).join('\n');

    const selectedAction = choice === 'create_pr' 
      ? '**Analyze and create new PR**'
      : '**Analyze and add to comments**';

    const completionMessage = choice === 'create_pr' 
      ? `Analysis PR created successfully! [View Analysis PR](${result})`
      : 'Analysis results added as comments above successfully!';

    return `## ✅ Processing Complete

**Your Selection:** ${selectedAction}

**Files Analyzed:** ${fileChanges.length} changed files in this PR:

${filesList}

**Result:** ${completionMessage}

---
*🤖 Automated by Covlant App*`;
  };

  const createErrorComment = (fileChanges, errorMessage) => {
    const filesList = fileChanges.map((file, index) => 
      `${index + 1}. **${file.filename}** (${file.status}) - +${file.additions} -${file.deletions}`
    ).join('\n');

    return `## ❌ Processing Failed

**Files Analyzed:** ${fileChanges.length} changed files in this PR:

${filesList}

**Error:** ${errorMessage}

---
*🤖 Automated by Covlant App*`;
  };

  // ==================== PROCESSING FUNCTIONS ====================
  
  const detectCheckboxChoice = (commentBody) => {
    const createPRSelected = commentBody.includes('- [x] **Analyze and create new PR**');
    const addCommentsSelected = commentBody.includes('- [x] **Analyze and add to comments**');
    
    // If both are selected, return null (no processing)
    if (createPRSelected && addCommentsSelected) {
      return null;
    }
    
    // Return the selected option, or null if none selected
    if (createPRSelected) {
      return 'create_pr';
    } else if (addCommentsSelected) {
      return 'add_comments';
    }
    
    return null;
  }; 

  const getPRDetails = async (prUrl, prNumber) => {
    const { owner, repo } = parseGitHubUrl(prUrl);
    const octokit = await githubAuth.getOctokit(null, prUrl);
    const prDetails = await octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber
    });
    return {
      owner,
      repo,
      commitSha: prDetails.data.head.sha,
      baseBranch: prDetails.data.base.ref,
      headBranch: prDetails.data.head.ref
    };
  };

  const processCreatePR = async (prUrl, prNumber, fileChanges, prDetails, issueData) => {
    console.log("Creating analysis PR...");
    
    const prData = {
      number: prNumber,
      title: issueData.title,
      url: prUrl,
      author: issueData.user.login,
      repository: issueData.repository.full_name,
      createdAt: issueData.created_at,
      baseBranch: prDetails.baseBranch,
      headBranch: prDetails.headBranch,
    };
    
    const analysisResult = await gitService.processPRAndCreateAnalysis(prData, fileChanges);
    await statusService.setComplete(prUrl, prDetails.commitSha, prNumber, analysisResult.newPR?.url);
    
    return analysisResult.newPR?.url;
  };

  const processAddComments = async (prUrl, prNumber, fileChanges, commitSha) => {
    console.log("Adding analysis as comments (NO PR creation)...");
    
    // Extract owner and repo from PR URL
    const { owner, repo } = parseGitHubUrl(prUrl);
    
    const apiResponse = await gitService.callAnalysisAPI(fileChanges, owner, repo);
    
    if (apiResponse?.filesToCreate && apiResponse.filesToCreate.length > 0) {
      for (const file of apiResponse.filesToCreate) {
        const fileCommentBody = `## 📁 Analysis Result: \`${file.path}\`

**File Type:** ${file.type}
**Status:** ${file.fileExists ? 'Update existing file' : 'Create new file'}

### Content:
\`\`\`${file.path.split('.').pop()}
${file.content}
\`\`\`

---
*Generated by Covlant Analysis*`;

        await createPRComment(prUrl, prNumber, fileCommentBody);
        console.log(`Added analysis comment for ${file.path}`);
      }
      
      // Add summary comment
      const summaryBody = `## ✅ Analysis Complete

Added **${apiResponse.filesToCreate.length} analysis files** as comments above.

**Files generated:**
${apiResponse.filesToCreate.map(f => `- \`${f.path}\` (${f.type})`).join('\n')}

*Note: Analysis results added as comments only - no additional PR was created.*`;

      await createPRComment(prUrl, prNumber, summaryBody);
    } else {
      await createPRComment(prUrl, prNumber, `## 📝 Analysis Results\n\nNo analysis files were generated for this PR.`);
    }
    
    await statusService.setComplete(prUrl, commitSha, prNumber, null);
  };

  // ==================== EVENT HANDLERS ====================
  
  const handlePRCreated = async (pr, repo, sender) => {
    console.log("Processing legitimate PR (not auto-generated):");
    console.log("=== PULL REQUEST CREATED ===");
    console.log("PR Number:", pr.number);
    console.log("PR Title:", pr.title);
    console.log("Branch:", pr.head.ref, "→", pr.base.ref);

    // Fetch file changes
    console.log("Fetching file changes...");
    const fileChanges = await fetchPRFileChanges(pr.html_url);

    console.log("=== FILE CHANGES ===");
    fileChanges.forEach((file, index) => {
      console.log(`${index + 1}. ${file.filename}`);
      console.log(`   Status: ${file.status}`);
      console.log(`   Changes: +${file.additions} -${file.deletions}`);
      console.log(`   Raw URL: ${file.raw_url}`);
      console.log("---");
    });
    console.log("=== END FILE CHANGES ===");

    // Create comment with file changes and options (NO processing yet)
    if (process.env.GITHUB_APP_ID && fileChanges.length > 0) {
      try {
        console.log("Creating comment with file changes and analysis options...");
        const commentBody = createInitialComment(fileChanges);
        await createPRComment(pr.html_url, pr.number, commentBody);
        console.log("Comment created with analysis options, waiting for user choice...");
      } catch (error) {
        console.error("❌Failed to create analysis comment:", error.message);
      }
    }

    return {
      success: true,
      message: "Pull request details captured with file changes",
      pr: {
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        author: sender.login,
        repository: repo.full_name,
        createdAt: pr.created_at,
        baseBranch: pr.base.ref,
        headBranch: pr.head.ref,
        fileChanges: fileChanges,
      }
    };
  };

  const handleCommentEdited = async (comment, issue, repo) => {
    console.log("PR Comment edited:", {
      prNumber: issue.number,
      commentId: comment.id,
      repository: repo.full_name,
    });
    
    const choice = detectCheckboxChoice(comment.body);
    console.log("Detected choice:", choice);
    
    if (!choice) {
      return {
        success: true,
        message: "No valid choice detected",
        choice: 'none'
      };
    }

    try {
      console.log(`Processing choice: ${choice}`);
      
      const prUrl = issue.html_url.replace('/issues/', '/pull/');
      
      // Update comment to show processing
      const processingComment = createProcessingComment(choice);
      await updateComment(prUrl, comment.id, processingComment);
      
      // Get PR details and file changes
      const prDetails = await getPRDetails(prUrl, issue.number);
      await statusService.setProcessing(prUrl, prDetails.commitSha, issue.number);
      
      const fileChanges = await fetchPRFileChanges(prUrl);
      
      let result = null;
      
      // Process based on choice
      if (choice === 'create_pr') {
        result = await processCreatePR(prUrl, issue.number, fileChanges, prDetails, {
          title: issue.title,
          user: issue.user,
          repository: repo,
          created_at: issue.created_at
        });
      } else if (choice === 'add_comments') {
        await processAddComments(prUrl, issue.number, fileChanges, prDetails.commitSha);
      }
      
      // Update comment with completion message
      const completedComment = createCompletedComment(fileChanges, choice, result);
      await updateComment(prUrl, comment.id, completedComment);
      
    } catch (error) {
      console.error("❌Error processing choice:", error.message);
      
      // Handle error and restore comment
      try {
        const prUrl = issue.html_url.replace('/issues/', '/pull/');
        const prDetails = await getPRDetails(prUrl, issue.number);
        await statusService.setError(prUrl, prDetails.commitSha, issue.number, error.message);
        
        const fileChanges = await fetchPRFileChanges(prUrl);
        const errorComment = createErrorComment(fileChanges, error.message);
        await updateComment(prUrl, comment.id, errorComment);
      } catch (restoreError) {
        console.error("❌Failed to restore comment after error:", restoreError.message);
      }
    }

    return {
      success: true,
      message: "Comment processed",
      choice: choice || 'none',
    };
  };

  // Function to fetch PR file changes from GitHub API
  const fetchPRFileChanges = async (prUrl) => {
    try {
      console.log("Fetching file changes for:", prUrl);
      
      // Parse GitHub URL to get owner, repo, and PR number
      const { owner, repo } = parseGitHubUrl(prUrl);
      const prNumber = parseInt(prUrl.split('/pull/')[1]);
      
      if (!prNumber) {
        throw new Error('Invalid PR URL - could not extract PR number');
      }

      console.log(`Fetching files for PR #${prNumber} in ${owner}/${repo}`);

      // Use authenticated Octokit instance
      const authenticatedOctokit = await githubAuth.getOctokit(null, prUrl);
      
      const response = await authenticatedOctokit.pulls.listFiles({
        owner,
        repo,
        pull_number: prNumber
      });

      const files = response.data;
      console.log(`Found ${files.length} changed files`);

      return files.map((file) => ({
        filename: file.filename,
        status: file.status, // added, modified, deleted, renamed
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: file.patch, // The actual diff
        blob_url: file.blob_url,
        raw_url: file.raw_url,
      }));
    } catch (error) {
      console.error("❌Error fetching PR file changes:", error.message);
      if (error.status === 404) {
        console.error("❌404 Error - This might be due to:");
        console.error("❌1. Repository is private and GitHub App doesn't have access");
        console.error("❌2. GitHub App is not installed on this repository");
        console.error("❌3. GitHub App permissions are insufficient");
      }
      return [];
    }
  };

  // ==================== MAIN WEBHOOK ENDPOINT ====================
  
  fastify.post("/", async (request, reply) => {
    const { body } = request;
    const eventType = request.headers["x-github-event"];

    console.log("GitHub webhook received!");
    console.log("Event type:", eventType);

    // Handle PR creation event
    if (eventType === "pull_request" && body.action === "opened") {
      const pr = body.pull_request;
      const repo = body.repository;
      const sender = body.sender;

      // Prevent infinite loops: Skip if this is an auto-generated PR
      const isAutoGeneratedPR = pr.head.ref.startsWith("auto-analysis-pr-");

      if (isAutoGeneratedPR) {
        console.log("Skipping auto-generated PR to prevent infinite loop:", {
          prNumber: pr.number,
          title: pr.title,
          branch: pr.head.ref,
          isDraft: pr.draft,
          author: sender.login,
          detectionReasons: {
            branchPattern: pr.head.ref.startsWith("auto-analysis-pr-")
          },
        });
        return {
          success: true,
          message: "Auto-generated PR skipped to prevent loop",
          skipped: true,
          pr: {
            number: pr.number,
            title: pr.title,
            branch: pr.head.ref,
          },
        };
      }

      return await handlePRCreated(pr, repo, sender);
    }

    // Handle comment events (checkbox clicks)
    if (eventType === "issue_comment" && body.action === "edited") {
      const comment = body.comment;
      const issue = body.issue;
      const repo = body.repository;
      
      // Check if this is a PR comment
      if (issue.pull_request) {
        return await handleCommentEdited(comment, issue, repo);
      }
    }

    // Handle other PR events
    if (eventType === "pull_request") {
      console.log("Pull Request Event:", {
        action: body.action,
        prNumber: body.pull_request?.number,
        repository: body.repository?.full_name,
      });
    }

    return {
      success: true,
      message: "Webhook processed successfully",
    };
  });
}

export default githubWebhookPlugin;
