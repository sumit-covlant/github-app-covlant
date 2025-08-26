import fastify from "fastify";
import dotenv from "dotenv";

import githubWebhookPlugin from "./plugins/github-webhook.js";

// Load environment variables
dotenv.config();

// Create Fastify instance
const server = fastify({
  logger: false, // Disable fastify logging
});

// Register plugins
server.register(githubWebhookPlugin);

// Health check endpoint
server.get("/health", async (request, reply) => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

// Dummy API endpoint for file analysis
server.post("/api/analyze-files", async (request, reply) => {
  const { changedFiles } = request.body;

  console.log("🔍 Dummy API called with:", {
    filesCount: changedFiles?.length || 0,
    files: changedFiles?.map(f => f.filename) || []
  });

  // Simulate API processing time
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Example: You can return empty array to test the "no files" scenario
  // const filesToCreate = []; // Uncomment this line to test no files scenario
  
  // Fixed file paths and content as requested
  const filesToCreate = [
    {
      path: "python_oops/default.md",
      content: "This is default content",
      type: "default",
      fileExists: false, 
    },
    {
      path: "python_oops/README.md", 
      content: "This is new readme content",
      type: "README",
      fileExists: true, 
    }
  ];

  console.log(
    "📁 Dummy API returning fixed files:",
    filesToCreate.map((f) => f.path)
  );

  return {
    success: true,
    message: "File analysis completed",
    analysisId: `analysis-${Date.now()}`,
    filesToCreate: filesToCreate,
    timestamp: new Date().toISOString(),
  };
});

// Start server
const start = async () => {
  try {
    const port = process.env.PORT || 3000;
    const host = process.env.HOST || "0.0.0.0";

    await server.listen({ port, host });
    console.log(`🚀 Server listening on ${host}:${port}`);
  } catch (err) {
    console.error("Server error:", err);
    process.exit(1);
  }
};

start();
