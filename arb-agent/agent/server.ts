import "dotenv/config";
import { createServer } from "http";
import { runAgent } from "./agent";

const PORT = 3001;

const server = createServer(async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/chat") {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        const { message } = JSON.parse(body);

        if (!message) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Message is required" }));
          return;
        }

        console.log(`\n📩 Received: ${message}`);
        const response = await runAgent(message);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ response }));
      } catch (error) {
        console.error("Error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ error: "Agent error", response: String(error) }),
        );
      }
    });
  } else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

server.listen(PORT, () => {
  console.log("═══════════════════════════════════════════════════");
  console.log("   🤖 DeFi Arbitrage Agent Server");
  console.log(`   Running on http://localhost:${PORT}`);
  console.log("═══════════════════════════════════════════════════");
});
