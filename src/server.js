import fastify from 'fastify';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Create Fastify instance
const server = fastify({
  logger: false // Disable fastify logging
});

// Register plugins
import githubWebhookPlugin from './plugins/github-webhook.js';
server.register(githubWebhookPlugin);

// Health check endpoint
server.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Start server
const start = async () => {
  try {
    const port = process.env.PORT || 3000;
    const host = process.env.HOST || '0.0.0.0';
    
    await server.listen({ port, host });
    console.log(`🚀 Server listening on ${host}:${port}`);
  } catch (err) {
    console.error('Server error:', err);
    process.exit(1);
  }
};

start();
