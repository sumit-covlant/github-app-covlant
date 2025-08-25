async function githubWebhookPlugin(fastify, options) {
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    console.log('GITHUB_WEBHOOK_SECRET not set. Webhook signature validation will be skipped.');
  }

  // GitHub webhook endpoint
  fastify.post('/', async (request, reply) => {
    const { body } = request;
    const eventType = request.headers['x-github-event'];
    
    console.log('GitHub webhook received!');
    console.log('Event type:', eventType);
    // console.log('Body:', JSON.stringify(body, null, 2));
    
    // Handle PR creation event
    if (eventType === 'pull_request' && body.action === 'opened') {
      const pr = body.pull_request;
      const repo = body.repository;
      const sender = body.sender;
      
      return {
        success: true,
        message: 'Pull request details captured',
        action: body.action,
        pr: {
          number: pr.number,
          title: pr.title,
          url: pr.html_url,
          author: sender.login,
          repository: repo.full_name,
          createdAt: pr.created_at,
          baseBranch: pr.base.ref,
          headBranch: pr.head.ref,
          isDraft: pr.draft || false,
          labels: pr.labels?.map(l => l.name) || [],
          assignees: pr.assignees?.map(a => a.login) || []
        }
      };
    }

    // Handle other PR events
    if (eventType === 'pull_request') {
      console.log('📝 Pull Request Event:', {
        action: body.action,
        prNumber: body.pull_request?.number,
        repository: body.repository?.full_name
      });
    }

    return {
      success: true,
      message: 'Webhook processed successfully'
    };
  });
}

export default githubWebhookPlugin;
