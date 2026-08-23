const { GoogleGenerativeAI } = require("@google/generative-ai");
const { v4: uuidv4 } = require("uuid");

function extractJson(text) {
  if (!text || typeof text !== "string") return null;

  const cleaned = text.trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function normalizeCurrency(value) {
  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.-]/g, "");
    return cleaned ? Number(cleaned) : 0;
  }

  return 0;
}

/*
 * AI is responsible for UNDERSTANDING the customer.
 * It is NOT trusted with the final business decision.
 */
async function analyzeWithGemini(message) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return null;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash"
    });

    const prompt = `
You are the understanding layer of an autonomous customer-resolution system.

Analyze the customer message and return ONLY valid JSON.

Do not decide refunds.
Do not decide escalation.
Do not invent real transactions.
Do not claim access to real banking or payment systems.

Your job is only to identify customer intent, category, sentiment, and extract factual clues from the message.

Schema:

{
  "intent": "PAYMENT_FAILURE | DUPLICATE_PAYMENT | SUSPICIOUS_TRANSACTION | REFUND_REQUEST | GENERAL_SUPPORT",
  "category": "PAYMENT_ISSUE | FRAUD_REVIEW | REFUND | GENERAL",
  "sentiment": "FRUSTRATED | ALERT | CONCERNED | REQUESTING | NEUTRAL",
  "facts": {
    "amount": 0,
    "mentionsFailedOrder": false,
    "mentionsDuplicateCharge": false,
    "mentionsUnknownTransaction": false
  },
  "summary": "short factual summary"
}

Customer message:
${JSON.stringify(message)}
`;

    const result = await model.generateContent(prompt);
    return extractJson(result.response.text());
  } catch (error) {
    console.warn(
      "Gemini analysis failed; using deterministic understanding.",
      error.message
    );
    return null;
  }
}

function inferIntent(message) {
  const lower = message.toLowerCase();

  if (
    /(charged twice|duplicate payment|double charge|charged 2 times|same order)/i.test(
      lower
    )
  ) {
    return {
      intent: "DUPLICATE_PAYMENT",
      category: "PAYMENT_ISSUE",
      sentiment: "FRUSTRATED"
    };
  }

  if (
    /(don't recognize|not recognize|unknown transaction|suspicious|fraud|unrecognized)/i.test(
      lower
    )
  ) {
    return {
      intent: "SUSPICIOUS_TRANSACTION",
      category: "FRAUD_REVIEW",
      sentiment: "ALERT"
    };
  }

  if (
    /(failed|order failed|deducted|payment failed|not delivered)/i.test(
      lower
    )
  ) {
    return {
      intent: "PAYMENT_FAILURE",
      category: "PAYMENT_ISSUE",
      sentiment: "CONCERNED"
    };
  }

  if (/(refund|return|cancel|replacement)/i.test(lower)) {
    return {
      intent: "REFUND_REQUEST",
      category: "REFUND",
      sentiment: "REQUESTING"
    };
  }

  return {
    intent: "GENERAL_SUPPORT",
    category: "GENERAL",
    sentiment: "NEUTRAL"
  };
}

function simulateInvestigation(message, aiAnalysis = null) {
  const amountMatch = message.match(
    /₹?\s?(\d+(?:,\d{3})*(?:\.\d{2})?)/i
  );

  const amountFromMessage = amountMatch
    ? normalizeCurrency(amountMatch[1])
    : 0;

  const lower = message.toLowerCase();

  const duplicate =
    /(duplicate payment|charged twice|double charge|same order|2 times)/i.test(
      lower
    );

  const suspicious =
    /(don't recognize|not recognize|unknown transaction|suspicious|fraud|unrecognized)/i.test(
      lower
    );

  const failed =
    /(failed|order failed|payment failed|not delivered)/i.test(lower);

  const amount =
    amountFromMessage ||
    normalizeCurrency(aiAnalysis?.facts?.amount || 0);

  if (duplicate) {
    return {
      paymentStatus: "CAPTURED",
      orderStatus: "FAILED",
      duplicateDetected: true,
      chargeCount: 2,
      suspicious: false,
      amount,
      evidenceSource: "Simulated transaction evidence"
    };
  }

  if (suspicious) {
    return {
      paymentStatus: "CAPTURED",
      orderStatus: "UNKNOWN",
      duplicateDetected: false,
      chargeCount: 1,
      suspicious: true,
      amount,
      evidenceSource: "Simulated transaction evidence"
    };
  }

  if (failed) {
    return {
      paymentStatus: "CAPTURED",
      orderStatus: "FAILED",
      duplicateDetected: false,
      chargeCount: 1,
      suspicious: false,
      amount,
      evidenceSource: "Simulated transaction evidence"
    };
  }

  return {
    paymentStatus: "UNKNOWN",
    orderStatus: "UNKNOWN",
    duplicateDetected: false,
    chargeCount: 0,
    suspicious: false,
    amount,
    evidenceSource: "Insufficient simulated transaction evidence"
  };
}

/*
 * IMPORTANT:
 * This is the trusted business-policy layer.
 * Gemini cannot override these rules.
 */
function evaluatePolicy(investigation, intent) {
  const payment = investigation.paymentStatus;
  const order = investigation.orderStatus;
  const duplicate = !!investigation.duplicateDetected;
  const suspicious = !!investigation.suspicious;

  if (suspicious || intent === "SUSPICIOUS_TRANSACTION") {
    return {
      isEligible: false,
      rule:
        "IF suspicious transaction THEN escalate for human review",
      decision: "ESCALATE",
      message:
        "High-risk transaction requires manual verification before any automated financial action."
    };
  }

  if (duplicate && payment === "CAPTURED") {
    return {
      isEligible: true,
      rule:
        "IF duplicate charge AND payment = CAPTURED THEN refund one duplicate charge",
      decision: "REFUND_ONE_CHARGE",
      message:
        "Duplicate payment identified; refund one duplicate charge after validation."
    };
  }

  if (payment === "CAPTURED" && order === "FAILED") {
    return {
      isEligible: true,
      rule:
        "IF payment = CAPTURED AND order = FAILED THEN refund eligible",
      decision: "REFUND",
      message:
        "Captured payment with failed order qualifies for refund."
    };
  }

  return {
    isEligible: false,
    rule:
      "DEFAULT: collect more evidence or escalate",
    decision: "INFORMATION",
    message:
      "Insufficient evidence to approve an automated financial action."
  };
}

function determineResolution(policy) {
  const { decision, isEligible } = policy;

  if (decision === "ESCALATE") {
    return {
      type: "ESCALATE",
      action: "HUMAN_ESCALATION",
      summary:
        "Escalated to human review due to suspicious transaction risk."
    };
  }

  if (decision === "REFUND_ONE_CHARGE") {
    return {
      type: "REFUND",
      action: "REFUND_ONE_CHARGE",
      summary:
        "Initiated refund for the duplicate charge only."
    };
  }

  if (decision === "REFUND" && isEligible) {
    return {
      type: "REFUND",
      action: "REFUND_FULL",
      summary:
        "Initiated refund for the failed order payment."
    };
  }

  return {
    type: "INFORMATION",
    action: "REQUEST_MORE_DETAILS",
    summary:
      "Need more evidence before deciding the action."
  };
}

function buildActionRecord(resolution, investigation) {
  const refundAmount =
    resolution.type === "REFUND"
      ? investigation.amount || 0
      : 0;

  if (resolution.type === "ESCALATE") {
    return {
      action: "Escalation request opened",
      reference: `ESC-${Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase()}`,
      amount: 0,
      status: "PENDING_REVIEW",
      note:
        "High-risk transaction paused for manual investigation."
    };
  }

  if (resolution.type === "REFUND") {
    return {
      action: "Refund request created",
      reference: `RF-${Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase()}`,
      amount: refundAmount,
      status: "INITIATED",
      note: `Simulated refund amount: ₹${refundAmount}`
    };
  }

  return {
    action: "Information request sent",
    reference: `INFO-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`,
    amount: 0,
    status: "REQUESTED",
    note:
      "Customer asked to provide more clarifying information."
  };
}

function verifyAction(actionRecord, resolution) {
  if (
    actionRecord.status === "INITIATED" ||
    actionRecord.status === "PENDING_REVIEW"
  ) {
    return {
      expectedState:
        "Action initiated and tracked",
      status: "VERIFIED",
      finalStatus:
        resolution.type === "ESCALATE"
          ? "ESCALATED_TO_HUMAN"
          : "RESOLVED"
    };
  }

  return {
    expectedState:
      "Action queued for follow-up",
    status: "PENDING",
    finalStatus: "IN_PROGRESS"
  };
}

function buildAuditTrail(
  caseId,
  intent,
  investigation,
  policy,
  resolution,
  action,
  verification,
  finalStatus
) {
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
    action,
    verification,
    finalStatus
  };
}

function buildResult(
  message,
  analysis,
  intent,
  investigation
) {
  const policy = evaluatePolicy(
    investigation,
    intent.intent
  );

  const resolution =
    determineResolution(policy);

  const action =
    buildActionRecord(
      resolution,
      investigation
    );

  const verification =
    verifyAction(
      action,
      resolution
    );

  const caseId = `RF-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;

  const finalStatus =
    verification.finalStatus || "IN_PROGRESS";

  return {
    caseId,

    intent: intent.intent,

    category: intent.category,

    sentiment: intent.sentiment,

    summary:
      analysis?.summary ||
      `${intent.intent} identified from customer message.`,

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

    aiAnalysis: analysis
      ? {
          provider: "Google Gemini",
          role: "Customer understanding",
          summary:
            analysis.summary || null
        }
      : {
          provider: "Deterministic fallback",
          role: "Customer understanding"
        },

    auditTrail: buildAuditTrail(
      caseId,
      intent.intent,
      investigation,
      policy,
      resolution,
      action,
      verification,
      finalStatus
    )
  };
}

async function resolveCase(message) {
  const aiAnalysis =
    await analyzeWithGemini(message);

  const deterministicIntent =
    inferIntent(message);

  /*
   * Gemini enriches understanding,
   * but deterministic signals remain
   * the safety fallback.
   */
  const intent = {
    intent:
      aiAnalysis?.intent ||
      deterministicIntent.intent,

    category:
      aiAnalysis?.category ||
      deterministicIntent.category,

    sentiment:
      aiAnalysis?.sentiment ||
      deterministicIntent.sentiment
  };

  const investigation =
    simulateInvestigation(
      message,
      aiAnalysis
    );

  /*
   * FINAL POLICY IS ALWAYS DETERMINISTIC.
   */
  return buildResult(
    message,
    aiAnalysis,
    intent,
    investigation
  );
}

function createFallbackResponse(
  message,
  reason = "AI processing failed"
) {
  const intent =
    inferIntent(message);

  const investigation =
    simulateInvestigation(message);

  const result =
    buildResult(
      message,
      null,
      intent,
      investigation
    );

  result.warnings = [
    `Deterministic fallback used because: ${reason}`
  ];

  return result;
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