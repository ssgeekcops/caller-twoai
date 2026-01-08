import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";

import {
  handleCallConnection,
  handleFrontendConnection,
} from "./sessionManager";
import functions from "./functionHandlers";

dotenv.config();

/* =======================
   Environment & Validation
   ======================= */

const PORT = Number(process.env.PORT || 8081);
const PUBLIC_URL = process.env.PUBLIC_URL || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

if (!PUBLIC_URL) {
  console.error("PUBLIC_URL environment variable is required");
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY environment variable is required");
  process.exit(1);
}

/* =======================
   App & Server Setup
   ======================= */

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: false }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

/* =======================
   TwiML Generator
   ======================= */

const generateTwiML = (wsUrl: string) => `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Connected</Say>
  <Connect>
    <Stream url="${wsUrl}" />
  </Connect>
  <Say>Disconnected</Say>
</Response>`;

/* =======================
   HTTP Routes
   ======================= */

app.get("/public-url", (_req, res) => {
  res.json({ publicUrl: PUBLIC_URL });
});

app.all("/twiml", (_req, res) => {
  const wsUrl = new URL(PUBLIC_URL);
  wsUrl.protocol = "wss:";
  wsUrl.pathname = "/call";

  res.type("text/xml");
  res.send(generateTwiML(wsUrl.toString()));
});

// List available function schemas for the frontend
app.get("/tools", (_req, res) => {
  res.json(functions.map((f) => f.schema));
});

/* =======================
   WebSocket Handling
   ======================= */

let currentCall: WebSocket | null = null;
let currentLogs: WebSocket | null = null;

wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  try {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts.length === 0) {
      ws.close();
      return;
    }

    const type = parts[0];

    if (type === "call") {
      if (currentCall) currentCall.close();
      currentCall = ws;
      handleCallConnection(currentCall, OPENAI_API_KEY);
      return;
    }

    if (type === "logs") {
      if (currentLogs) currentLogs.close();
      currentLogs = ws;
      handleFrontendConnection(currentLogs);
      return;
    }

    ws.close();
  } catch (err) {
    console.error("WebSocket connection error:", err);
    ws.close();
  }
});

/* =======================
   Start Server
   ======================= */

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
