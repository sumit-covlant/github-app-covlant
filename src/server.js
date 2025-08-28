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

// Dummy API endpoint for file analysis from CNE
server.post("/api/analyze-files", async (request, reply) => {
  const { changedFiles } = request.body;

  console.log("Dummy API called with:", {
    filesCount: changedFiles?.length || 0,
    files: changedFiles?.map(f => f.filename) || []
  });

  await new Promise((resolve) => setTimeout(resolve, 3000));

  const filesToCreate = [
    {
      path: "python_oops/sample_test.py",
      content: `import unittest
import calculator

class TestCalculator(unittest.TestCase):
    def test_add(self):
        self.assertEqual(calculator.add(2, 3), 5)
        self.assertEqual(calculator.add(-1, 1), 0)

    def test_subtract(self):
        self.assertEqual(calculator.subtract(5, 3), 2)
        self.assertEqual(calculator.subtract(0, 3), -3)

if __name__ == "__main__":
    unittest.main()
`,
      type: "sample_test",
      fileExists: true, 
    },
    {
      path: "python_oops/new_test.py", 
      content: `This is a new test file created by CNE`,
      type: "new_test",
      fileExists: false, 
    }
  ];

  console.log(
    "Dummy API returning fixed files:",
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
