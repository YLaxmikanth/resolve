const { GoogleGenerativeAI } = require("@google/generative-ai");
const { v4: uuidv4 } = require("uuid");

function extractJson(text) {
  if (!text || typeof text !== "string") return null;

  const cleaned = text.trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start !== -1 && end !== -1 && end > start) {
    const jsonText = cleaned.slice(start, end + 1);
    try {
      return JSON.parse(jsonText);
    } catch (error) {
      return null;
    }
  }

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    return null;
  }
}

function normalizeCurrency(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.-]/g, "");
    if (!cleaned) return 0;
    return Number(cleaned);
  }
  return 0;
}

function inferIntent(message) {
  const lower = message.toLowerCase();

  if (/(charged twice|duplicate payment|double charge|charged 2 times|same order)/i.test(lower)) {
    return { intent: "DUPLICATE_PAYMENT", category: "PAYMENT_ISSUE", sentiment: "FRUSTRATED" };
  }

  if (/(don't recognize|not recognize|unknown transaction|suspicious|fraud|unrecognized)/i.test(lower)) {
    return { intent: "SUSPICIOUS_TRANSACTION", category: "FRAUD_REVIEW", sentiment: "ALERT" };
  }

  if (/(failed|order failed|deducted|payment failed|not delivered)/i.test(lower)) {
    return { intent: "PAYMENT_FAILURE", category: "PAYMENT_ISSUE", sentiment: "CONCERNED" };
  }

  if (/(refund|return|cancel|replacement)/i.test(lower)) {
    return { intent: "REFUND_REQUEST", category: "REFUND", sentiment: "REQUESTING" };
  }

  return { intent: "GENERAL_SUPPORT", category: "UNKNOWN", sentiment: "NEUTRAL" };
}

function simulateInvestigation(message) {
  const amountMatch = message.match(/₹?\s?(\d+(?:,\d{3})*(?:\.\d{2})?)/i);
  const amount = amountMatch ? normalizeCurrency(amountMatch[1]) : 0;
  const lower = message.toLowerCase();

  if (/(duplicate payment|charged twice|double charge|same order|2 times)/i.test(lower)) {
    return {
      paymentStatus: "CAPTURED",
      orderStatus: "FAILED",
      duplicateDetected: true,
      chargeCount: 2,
      amount
    };
  }

  if (/(don't recognize|not recognize|unknown transaction|suspicious|fraud|unrecognized)/i.test(lower)) {
    return {
      paymentStatus: "CAPTURED",
      orderStatus: "UNKNOWN",
      duplicateDetected: false,
      suspicious: true,
      chargeCount: 1,
      amount
    };
  }

  return {
    paymentStatus: "CAPTURED",
    orderStatus: "FAILED",
    duplicateDetected: false,
    suspicious: false,
    chargeCount: 1,
    amount
  };
}

function evaluatePolicy(investigation, intent) {
  const payment = investigation.paymentStatus;
  const order = investigation.orderStatus;
  const duplicate = !!investigation.duplicateDetected;
  const suspicious = !!investigation.suspicious;

  if (suspicious) {
    return {
      isEligible: false,
      rule: "IF suspicious transaction THEN escalate for human review",
      decision: "ESCALATE",
      message: "High-risk transaction requires manual verification before any refund or replacement."
    };
  }

  if (duplicate) {
    return {
      isEligible: true,
      rule: "IF duplicate charge AND same order THEN refund one charge",
      decision: "REFUND_ONE_CHARGE",
      message: "Duplicate payment identified; refund one duplicate charge after validation."
    };
  }

  if (payment === "CAPTURED" && order === "FAILED") {
    return {
      isEligible: true,
      rule: "IF payment = CAPTURED AND order = FAILED THEN refund eligible",
      decision: "REFUND",
      message: "Captured payment with failed order qualifies for refund."
    };
  }

  return {
    isEligible: false,
    rule: "DEFAULT: collect more evidence or escalate",
    decision: "INFORMATION",
    message: "Insufficient evidence to approve an automated action."
  };
}

function determineResolution(policy, investigation) {
  const { decision, isEligible } = policy;

  if (decision === "ESCALATE") {
    return {
      type: "ESCALATE",
      action: "HUMAN_ESCALATION",
      summary: "Escalated to human review due to suspicious transaction risk."
    };
  }

  if (decision === "REFUND_ONE_CHARGE") {
    return {
      type: "REFUND",
      action: "REFUND_ONE_CHARGE",
      summary: "Initiated refund for the duplicate charge only."
    };
  }

  if (decision === "REFUND" && isEligible) {
    return {
      type: "REFUND",
      action: "REFUND_FULL",
      summary: "Initiated refund for the failed order payment."
    };
  }

  if (decision === "INFORMATION") {
    return {
      type: "INFORMATION",
      action: "REQUEST_MORE_DETAILS",
      summary: "Need more evidence before deciding the action."
    };
  }

  return {
    type: "RETRY",
    action: "RETRY_ORDER",
    summary: "System is retrying the order workflow."
  };
}

function buildActionRecord(resolution, investigation) {
  const refundAmount = resolution.type === "REFUND" ? investigation.amount || 0 : 0;

  if (resolution.type === "ESCALATE") {
    return {
      action: "Escalation request opened",
      reference: `ESC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      amount: 0,
      status: "PENDING_REVIEW",
      note: "High-risk transaction paused for manual investigation."
    };
  }

  if (resolution.type === "REFUND") {
    return {
      action: "Refund request created",
      reference: `RF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      amount: refundAmount,
      status: "INITIATED",
      note: `Refund amount: ₹${refundAmount}`
    };
  }

  return {
    action: "Information request sent",
    reference: `INFO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    amount: 0,
    status: "REQUESTED",
    note: "Customer asked to provide more clarifying information."
  };
}

function verifyAction(actionRecord, resolution) {
  if (actionRecord.status === "INITIATED" || actionRecord.status === "PENDING_REVIEW") {
    return {
      expectedState: "Action initiated and tracked",
      status: "VERIFIED",
      finalStatus: resolution.type === "ESCALATE" ? "ESCALATED_TO_HUMAN" : "RESOLVED"
    };
  }

  return {
    expectedState: "Action queued for follow-up",
    status: "PENDING",
    finalStatus: "IN_PROGRESS"
  };
}

function buildAuditTrail(caseId, intent, investigation, policy, resolution, action, verification, finalStatus) {
  return {
    caseId,
    intent,
    evidence: investigation,
    policy: {
      rule: policy.rule,
      decision: policy.decision,
      note: policy.message
    },
    decision: resolution.summary,
    action: action,
    verification,
    finalStatus
  };
}

async function callGemini(message) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `
      You are Resolve AI orchestrator. Output valid JSON only with keys:
      intent, category, sentiment, investigation, policy, resolution, action, verification, finalStatus.
      User message: "${message}"
      Use this JSON schema exactly:
      {
        "intent": "STRING",
        "category": "STRING",
        "sentiment": "STRING",
        "investigation": {
          "paymentStatus": "CAPTURED|PENDING|FAILED|DECLINED",
          "orderStatus": "FAILED|SUCCESS|PENDING|UNKNOWN",
          "amount": 0,
          "duplicateDetected": false,
          "suspicious": false,
          "chargeCount": 1
        },
        "policy": {
          "decision": "REFUND|REFUND_ONE_CHARGE|ESCALATE|INFORMATION",
          "rule": "STRING",
          "message": "STRING"
        },
        "resolution": { "type": "REFUND|ESCALATE|INFORMATION|RETRY", "action": "STRING", "summary": "STRING" },
        "action": { "action": "STRING", "reference": "STRING", "amount": 0, "status": "INITIATED|PENDING_REVIEW|REQUESTED", "note": "STRING" },
        "verification": { "expectedState": "STRING", "status": "VERIFIED|PENDING", "finalStatus": "RESOLVED|ESCALATED_TO_HUMAN|IN_PROGRESS" },
        "finalStatus": "RESOLVED|ESCALATED_TO_HUMAN|IN_PROGRESS"
      }
      If you cannot determine a value, use a safe simulated fallback.
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return extractJson(text);
  } catch (error) {
    console.warn("Gemini call failed, using simulated fallback.", error.message);
    return null;
  }
}

function createFallbackResponse(message, reason = "AI processing failed") {
  const intent = inferIntent(message);
  const investigation = simulateInvestigation(message);
  const policy = evaluatePolicy(investigation, intent);
  const resolution = determineResolution(policy, investigation);
  const action = buildActionRecord(resolution, investigation);
  const verification = verifyAction(action, resolution);
  const finalStatus = verification.finalStatus || "IN_PROGRESS";
  const caseId = `RF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  return {
    caseId,
    intent: intent.intent,
    category: intent.category,
    sentiment: intent.sentiment,
    investigation,
    policy: {
      rule: policy.rule,
      decision: policy.decision,
      message: policy.message
    },
    resolution,
    action,
    verification,
    finalStatus,
    auditTrail: buildAuditTrail(caseId, intent.intent, investigation, policy, resolution, action, verification, finalStatus),
    warnings: [`Simulated fallback used because: ${reason}`]
  };
}

async function resolveCase(message) {
  const caseId = `RF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const aiPayload = await callGemini(message);

  if (aiPayload) {
    const result = {
      caseId,
      intent: aiPayload.intent || inferIntent(message).intent,
      category: aiPayload.category || inferIntent(message).category,
      sentiment: aiPayload.sentiment || inferIntent(message).sentiment,
      investigation: aiPayload.investigation || simulateInvestigation(message),
      policy: aiPayload.policy || evaluatePolicy(simulateInvestigation(message), inferIntent(message)),
      resolution: aiPayload.resolution || determineResolution(
        aiPayload.policy || evaluatePolicy(simulateInvestigation(message), inferIntent(message)),
        aiPayload.investigation || simulateInvestigation(message)
      ),
      action: aiPayload.action || buildActionRecord(
        aiPayload.resolution || determineResolution(
          aiPayload.policy || evaluatePolicy(simulateInvestigation(message), inferIntent(message)),
          aiPayload.investigation || simulateInvestigation(message)
        ),
        aiPayload.investigation || simulateInvestigation(message)
      ),
      verification: aiPayload.verification || verifyAction(
        aiPayload.action || buildActionRecord(
          aiPayload.resolution || determineResolution(
            aiPayload.policy || evaluatePolicy(simulateInvestigation(message), inferIntent(message)),
            aiPayload.investigation || simulateInvestigation(message)
          ),
          aiPayload.investigation || simulateInvestigation(message)
        ),
        aiPayload.resolution || determineResolution(
          aiPayload.policy || evaluatePolicy(simulateInvestigation(message), inferIntent(message)),
          aiPayload.investigation || simulateInvestigation(message)
        )
      ),
      finalStatus: aiPayload.finalStatus || "IN_PROGRESS",
      auditTrail: aiPayload.auditTrail || buildAuditTrail(
        caseId,
        aiPayload.intent || inferIntent(message).intent,
        aiPayload.investigation || simulateInvestigation(message),
        aiPayload.policy || evaluatePolicy(simulateInvestigation(message), inferIntent(message)),
        aiPayload.resolution || determineResolution(
          aiPayload.policy || evaluatePolicy(simulateInvestigation(message), inferIntent(message)),
          aiPayload.investigation || simulateInvestigation(message)
        ),
        aiPayload.action || buildActionRecord(
          aiPayload.resolution || determineResolution(
            aiPayload.policy || evaluatePolicy(simulateInvestigation(message), inferIntent(message)),
            aiPayload.investigation || simulateInvestigation(message)
          ),
          aiPayload.investigation || simulateInvestigation(message)
        ),
        aiPayload.verification || verifyAction(
          aiPayload.action || buildActionRecord(
            aiPayload.resolution || determineResolution(
              aiPayload.policy || evaluatePolicy(simulateInvestigation(message), inferIntent(message)),
              aiPayload.investigation || simulateInvestigation(message)
            ),
            aiPayload.investigation || simulateInvestigation(message)
          ),
          aiPayload.resolution || determineResolution(
            aiPayload.policy || evaluatePolicy(simulateInvestigation(message), inferIntent(message)),
            aiPayload.investigation || simulateInvestigation(message)
          )
        ),
        aiPayload.finalStatus || "IN_PROGRESS"
      )
    };

    return result;
  }

  return createFallbackResponse(message);
}

module.exports = {
  resolveCase,
  createFallbackResponse,
  inferIntent,
  simulateInvestigation,
  evaluatePolicy,
  determineResolution,
  buildActionRecord,
  verifyAction,
  extractJson
};
