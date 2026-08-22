const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const { resolveCase, createFallbackResponse } = require("./resolveEngine");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

if (process.env.MONGO_URI) {
  mongoose
    .connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000
    })
    .then(() => {
      console.log("MongoDB connected successfully");
    })
    .catch((error) => {
      console.warn("MongoDB not connected; continuing in simulation mode.", error.message);
    });
}

app.get("/", (req, res) => {
  res.json({
    name: "Resolve",
    status: "running",
    mode: process.env.GEMINI_API_KEY ? "ai-assisted" : "simulated"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Resolve API",
    mode: process.env.GEMINI_API_KEY ? "ai-assisted" : "simulated"
  });
});

app.post("/api/resolve", async (req, res) => {
  try {
    const message = req.body && req.body.message ? String(req.body.message).trim() : "";

    if (!message) {
      return res.status(400).json({
        error: "Missing customer message.",
        message: "Please provide a message field."
      });
    }

    const result = await resolveCase(message);
    return res.json(result);
  } catch (error) {
    console.error("POST /api/resolve failed:", error);
    return res.status(500).json(
      createFallbackResponse(
        req.body && req.body.message ? String(req.body.message) : "",
        error.message || "Unknown internal error"
      )
    );
  }
});

app.use((error, req, res, next) => {
  console.error("Unhandled app error:", error);
  res.status(500).json({
    error: "Internal server error",
    fallback: createFallbackResponse(
      req.body && req.body.message ? String(req.body.message) : "",
      error.message || "Unhandled error"
    )
  });
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Resolve backend running on port ${PORT}`);
  });
}

module.exports = { app };
