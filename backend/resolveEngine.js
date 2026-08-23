const { GoogleGenerativeAI } = require("@google/generative-ai");

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

Supported intent values:
PAYMENT_FAILURE | DUPLICATE_PAYMENT | SUSPICIOUS_TRANSACTION | REFUND_REQUEST | GENERAL_SUPPORT | PAYMENT_PENDING | ORDER_NOT_RECEIVED | ORDER_CANCELLATION | REFUND_STATUS | WRONG_AMOUNT_CHARGED | ACCOUNT_ACCESS | UNKNOWN_ISSUE

Schema:
{
  "intent": "STRING",
  "category": "STRING",
  "sentiment": "STRING",
  "facts": {
    "amount": 0,
    "mentionsFailedOrder": false,
    "mentionsDuplicateCharge": false,
    "mentionsUnknownTransaction": false,
    "paymentPending": false,
    "orderNotReceived": false,
    "cancellationRequested": false,
    "refundStatusRequested": false,
    "wrongAmount": false,
    "accountAccessIssue": false
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
    /(don't recognize|not recognize|unknown transaction|suspicious|fraud|unrecognized|charged my card and i don't recognize it)/i.test(
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
    /(still pending|payment is pending|pending payment|payment pending|not yet cleared)/i.test(
      lower
    )
  ) {
    return {
      intent: "PAYMENT_PENDING",
      category: "PAYMENT_ISSUE",
      sentiment: "CONCERNED"
    };
  }

  if (
    /(never arrived|not received|did not receive|order never arrived|missing order|never got my order)/i.test(
      lower
    )
  ) {
    return {
      intent: "ORDER_NOT_RECEIVED",
      category: "DELIVERY_ISSUE",
      sentiment: "CONCERNED"
    };
  }

  if (
    /(cancel my order|want to cancel|cancel order|i want to cancel|cancel purchase)/i.test(
      lower
    )
  ) {
    return {
      intent: "ORDER_CANCELLATION",
      category: "ORDER_MANAGEMENT",
      sentiment: "REQUESTING"
    };
  }

  if (
    /(refund status|where is my refund|track refund|refund update|check refund)/i.test(
      lower
    )
  ) {
    return {
      intent: "REFUND_STATUS",
      category: "REFUND",
      sentiment: "REQUESTING"
    };
  }

  if (
    /(wrong amount|charged too much|incorrect amount|extra charge|not the right amount|higher than expected)/i.test(
      lower
    )
  ) {
    return {
      intent: "WRONG_AMOUNT_CHARGED",
      category: "PAYMENT_ISSUE",
      sentiment: "CONCERNED"
    };
  }

  if (
    /(can't access account|cannot access account|unable to access|login issue|account access)/i.test(
      lower
    )
  ) {
    return {
      intent: "ACCOUNT_ACCESS",
      category: "ACCOUNT_ISSUE",
      sentiment: "CONCERNED"
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

  if (/(refund|return|replacement)/i.test(lower)) {
    return {
      intent: "REFUND_REQUEST",
      category: "REFUND",
      sentiment: "REQUESTING"
    };
  }

  if (
    /(don't know what happened|unknown issue|i don't know|what happened|no idea)/i.test(
      lower
    )
  ) {
    return {
      intent: "UNKNOWN_ISSUE",
      category: "GENERAL",
      sentiment: "NEUTRAL"
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
    /(don't recognize|not recognize|unknown transaction|suspicious|fraud|unrecognized|charged my card and i don't recognize it)/i.test(
      lower
    );

  const failed =
    /(failed|order failed|payment failed|not delivered)/i.test(lower);

  const pendingPayment =
    /(still pending|payment is pending|pending payment|payment pending|not yet cleared)/i.test(
      lower
    );

  const orderNotReceived =
    /(never arrived|not received|did not receive|order never arrived|missing order|never got my order)/i.test(
      lower
    );

  const cancellationRequested =
    /(cancel my order|want to cancel|cancel order|i want to cancel|cancel purchase)/i.test(
      lower
    );

  const refundStatusRequested =
    /(refund status|where is my refund|track refund|refund update|check refund)/i.test(
      lower
    );

  const wrongAmount =
    /(wrong amount|charged too much|incorrect amount|extra charge|not the right amount|higher than expected)/i.test(
      lower
    );

  const accountAccessIssue =
    /(can't access account|cannot access account|unable to access|login issue|account access)/i.test(
      lower
    );

  const refundRequested = /(refund|return|replacement)/i.test(lower);

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
      refundRequested,
      cancellationRequested,
      pendingPayment,
      orderNotReceived,
      refundStatusRequested,
      wrongAmount,
      accountAccessIssue,
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
      refundRequested,
      cancellationRequested,
      pendingPayment,
      orderNotReceived,
      refundStatusRequested,
      wrongAmount,
      accountAccessIssue,
      evidenceSource: "Simulated transaction evidence"
    };
  }

  if (pendingPayment) {
    return {
      paymentStatus: "PENDING",
      orderStatus: "PENDING",
      duplicateDetected: false,
      chargeCount: 1,
      suspicious: false,
      amount,
      refundRequested,
      cancellationRequested,
      pendingPayment: true,
      orderNotReceived,
      refundStatusRequested,
      wrongAmount,
      accountAccessIssue,
      evidenceSource: "Simulated transaction evidence"
    };
  }

  if (orderNotReceived) {
    return {
      paymentStatus: "CAPTURED",
      orderStatus: "NOT_RECEIVED",
      duplicateDetected: false,
      chargeCount: 1,
      suspicious: false,
      amount,
      refundRequested,
      cancellationRequested,
      pendingPayment,
      orderNotReceived: true,
      refundStatusRequested,
      wrongAmount,
      accountAccessIssue,
      evidenceSource: "Simulated transaction evidence"
    };
  }

  if (cancellationRequested) {
    return {
      paymentStatus: "UNKNOWN",
      orderStatus: "CANCELLED",
      duplicateDetected: false,
      chargeCount: 1,
      suspicious: false,
      amount,
      refundRequested,
      cancellationRequested: true,
      pendingPayment,
      orderNotReceived,
      refundStatusRequested,
      wrongAmount,
      accountAccessIssue,
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
      refundRequested,
      cancellationRequested,
      pendingPayment,
      orderNotReceived,
      refundStatusRequested,
      wrongAmount,
      accountAccessIssue,
      evidenceSource: "Simulated transaction evidence"
    };
  }

  if (wrongAmount) {
    return {
      paymentStatus: "CAPTURED",
      orderStatus: "UNKNOWN",
      duplicateDetected: false,
      chargeCount: 1,
      suspicious: false,
      amount,
      refundRequested,
      cancellationRequested,
      pendingPayment,
      orderNotReceived,
      refundStatusRequested,
      wrongAmount: true,
      accountAccessIssue,
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
    refundRequested: false,
    cancellationRequested: false,
    pendingPayment: false,
    orderNotReceived: false,
    refundStatusRequested: false,
    wrongAmount: false,
    accountAccessIssue: false,
    evidenceSource: "Insufficient simulated transaction evidence"
  };
}

function evaluatePolicy(investigation, intent) {
  const payment = investigation.paymentStatus;
  const order = investigation.orderStatus;
  const duplicate = !!investigation.duplicateDetected;
  const suspicious = !!investigation.suspicious;
  const pendingPayment = !!investigation.pendingPayment;
  const orderNotReceived = !!investigation.orderNotReceived;
  const cancellationRequested = !!investigation.cancellationRequested;
  const wrongAmount = !!investigation.wrongAmount;
  const refundStatusRequested = !!investigation.refundStatusRequested;
  const accountAccessIssue = !!investigation.accountAccessIssue;

  if (suspicious || intent === "SUSPICIOUS_TRANSACTION") {
    return {
      isEligible: false,
      rule: "IF suspicious transaction THEN escalate for human review",
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
      rule: "IF payment = CAPTURED AND order = FAILED THEN refund eligible",
      decision: "REFUND",
      message:
        "Captured payment with failed order qualifies for refund."
    };
  }

  if (pendingPayment || intent === "PAYMENT_PENDING") {
    return {
      isEligible: false,
      rule: "IF payment is PENDING THEN request more information",
      decision: "REQUEST_MORE_INFORMATION",
      message:
        "Payment is still pending. Additional information is required before automated resolution."
    };
  }

  if (
    orderNotReceived &&
    (payment === "CAPTURED" || payment === "UNKNOWN") &&
    order === "NOT_RECEIVED"
  ) {
    return {
      isEligible: false,
      rule:
        "IF order is NOT_RECEIVED AND there is sufficient simulated evidence THEN escalate for order investigation",
      decision: "ESCALATE",
      message:
        "Order delivery appears unresolved. Human investigation is required."
    };
  }

  if (
    cancellationRequested &&
    (!payment || payment === "UNKNOWN" || order === "CANCELLED")
  ) {
    return {
      isEligible: false,
      rule:
        "IF cancellation is requested AND fulfillment/payment state is unclear THEN request more information",
      decision: "REQUEST_MORE_INFORMATION",
      message:
        "Cancellation request needs more evidence before automated review."
    };
  }

  if (
    refundStatusRequested &&
    (!payment || payment === "UNKNOWN")
  ) {
    return {
      isEligible: false,
      rule:
        "IF refund status is requested AND transaction evidence is insufficient THEN request more information",
      decision: "REQUEST_MORE_INFORMATION",
      message:
        "Refund status cannot be confirmed without more transaction evidence."
    };
  }

  if (wrongAmount && payment === "CAPTURED") {
    return {
      isEligible: false,
      rule:
        "IF wrong amount is reported AND discrepancy cannot be verified THEN escalate for review",
      decision: "ESCALATE",
      message:
        "Amount discrepancy requires human review before any automated financial action."
    };
  }

  if (accountAccessIssue || intent === "ACCOUNT_ACCESS") {
    return {
      isEligible: false,
      rule: "IF account access is unclear THEN request more information",
      decision: "REQUEST_MORE_INFORMATION",
      message:
        "Account access issue requires additional verification before resolution."
    };
  }

  if (
    intent === "UNKNOWN_ISSUE" ||
    intent === "GENERAL_SUPPORT" ||
    intent === "REFUND_REQUEST"
  ) {
    return {
      isEligible: false,
      rule: "UNKNOWN_ISSUE THEN request more information",
      decision: "REQUEST_MORE_INFORMATION",
      message:
        "The issue is unclear and requires more evidence before automated resolution."
    };
  }

  if (intent === "PAYMENT_FAILURE") {
    return {
      isEligible: false,
      rule: "IF payment issue is reported WITHOUT verified evidence THEN request more information",
      decision: "REQUEST_MORE_INFORMATION",
      message:
        "Payment issue requires more evidence before automated resolution."
    };
  }

  return {
    isEligible: false,
    rule: "DEFAULT: collect more evidence or escalate",
    decision: "REQUEST_MORE_INFORMATION",
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
      summary: "Escalated to human review due to risk or insufficient evidence."
    };
  }

  if (decision === "REFUND_ONE_CHARGE") {
    return {
      type: "REFUND",
      action: "REFUND_ONE_CHARGE",
      summary: "Simulated refund for the duplicate charge only."
    };
  }

  if (decision === "REFUND" && isEligible) {
    return {
      type: "REFUND",
      action: "REFUND_FULL",
      summary: "Simulated refund request created for the failed order."
    };
  }

  if (decision === "REQUEST_MORE_INFORMATION") {
    return {
      type: "INFORMATION",
      action: "REQUEST_MORE_DETAILS",
      summary: "Additional information required before automated resolution."
    };
  }

  return {
    type: "INFORMATION",
    action: "REQUEST_MORE_DETAILS",
    summary: "Need more evidence before deciding the action."
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
      note: "Human review queue. No external payment system was contacted."
    };
  }

  if (resolution.type === "REFUND") {
    return {
      action: "Simulated refund request created",
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
    note: "Additional information required before automated resolution."
  };
}

function verifyAction(actionRecord, resolution) {
  if (actionRecord.status === "INITIATED") {
    return {
      expectedState: "Simulated refund request verified",
      status: "VERIFIED",
      finalStatus: "RESOLVED"
    };
  }

  if (actionRecord.status === "PENDING_REVIEW") {
    return {
      expectedState: "Human review required and tracked",
      status: "VERIFIED",
      finalStatus: "ESCALATED_TO_HUMAN"
    };
  }

  if (actionRecord.status === "REQUESTED") {
    return {
      expectedState: "Information request created and tracked",
      status: "VERIFIED",
      finalStatus: "IN_PROGRESS"
    };
  }

  return {
    expectedState: "Action queued for follow-up",
    status: "VERIFIED",
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

function buildResult(message, analysis, intent, investigation) {
  const policy = evaluatePolicy(investigation, intent.intent);
  const resolution = determineResolution(policy);
  const action = buildActionRecord(resolution, investigation);
  const verification = verifyAction(action, resolution);
  const caseId = `RF-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;

  const finalStatus = verification.finalStatus || "IN_PROGRESS";

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
          summary: analysis.summary || null
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
  const aiAnalysis = await analyzeWithGemini(message);
  const deterministicIntent = inferIntent(message);

  const intent = {
    intent: aiAnalysis?.intent || deterministicIntent.intent,
    category: aiAnalysis?.category || deterministicIntent.category,
    sentiment: aiAnalysis?.sentiment || deterministicIntent.sentiment
  };

  const investigation = simulateInvestigation(message, aiAnalysis);

  return buildResult(message, aiAnalysis, intent, investigation);
}

function createFallbackResponse(message, reason = "AI processing failed") {
  const intent = inferIntent(message);
  const investigation = simulateInvestigation(message);
  const result = buildResult(message, null, intent, investigation);

  result.warnings = [`Deterministic fallback used because: ${reason}`];
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