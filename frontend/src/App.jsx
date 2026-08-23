import { useEffect, useState } from "react";

const QUICK_CASES = [
  "₹4,999 was deducted but my order failed.",
  "I was charged twice for the same order.",
  "I don't recognize this transaction.",
];

const WORKFLOW = [
  {
    name: "UNDERSTAND",
    description: "Understand customer intent",
  },
  {
    name: "INVESTIGATE",
    description: "Gather evidence",
  },
  {
    name: "REASON",
    description: "Apply business policy",
  },
  {
    name: "ACT",
    description: "Execute permitted action",
  },
  {
    name: "VERIFY",
    description: "Confirm outcome",
  },
];

function App() {
  const [message, setMessage] = useState(QUICK_CASES[0]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(-1);
  const [showTrace, setShowTrace] = useState(true);
  const [caseHistory, setCaseHistory] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("resolve-case-history");

      if (saved) {
        const parsed = JSON.parse(saved);

        if (Array.isArray(parsed)) {
          setCaseHistory(parsed);
        }
      }
    } catch (error) {
      console.warn("Failed to load session history.", error);
    }
  }, []);

  useEffect(() => {
    if (!caseHistory.length) {
      sessionStorage.removeItem("resolve-case-history");
      return;
    }

    sessionStorage.setItem(
      "resolve-case-history",
      JSON.stringify(caseHistory)
    );
  }, [caseHistory]);

  useEffect(() => {
    if (!loading) return;

    setActiveStep(0);

    const interval = setInterval(() => {
      setActiveStep((current) => {
        if (current >= WORKFLOW.length - 1) {
          return current;
        }

        return current + 1;
      });
    }, 650);

    return () => clearInterval(interval);
  }, [loading]);

  const resolveCase = async () => {
    if (!message.trim() || loading) return;

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(
        "http://localhost:5000/api/resolve",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to resolve case"
        );
      }

      setActiveStep(WORKFLOW.length);
      setResult(data);

      const normalizedCase = {
        ...data,
        customerMessage: message,
      };

      setCaseHistory((current) => {
        const alreadyExists = current.some(
          (entry) => entry.caseId === normalizedCase.caseId
        );

        if (alreadyExists) {
          return current;
        }

        return [normalizedCase, ...current];
      });

      if (data?.caseId) {
        setSelectedCaseId(data.caseId);
      }
    } catch (error) {
      setActiveStep(-1);

      setResult({
        finalStatus: "ERROR",
        error: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const isEscalated =
    result?.finalStatus === "ESCALATED_TO_HUMAN";

  const isAiPowered =
    result?.aiAnalysis?.provider === "Google Gemini";

  const selectedCase =
    caseHistory.find((entry) => entry.caseId === selectedCaseId) ||
    caseHistory[0] || null;

  const resolvedCount = caseHistory.filter(
    (entry) => entry.finalStatus === "RESOLVED"
  ).length;

  const escalatedCount = caseHistory.filter(
    (entry) => entry.finalStatus === "ESCALATED_TO_HUMAN"
  ).length;

  const getHistoryBadgeClass = (status) => {
    if (status === "RESOLVED") return "status-badge resolved";
    if (status === "ESCALATED_TO_HUMAN") return "status-badge escalated";
    return "status-badge in-progress";
  };

  const getStepClass = (index) => {
    if (loading && index === activeStep) {
      return "active";
    }

    if (result && index < WORKFLOW.length) {
      return "complete";
    }

    return "";
  };

  return (
    <div className="app">

      {/* HEADER */}
      <header className="topbar">
        <div>
          <div className="brand">Resolve</div>

          <div className="tagline">
            Autonomous customer resolution
          </div>
        </div>

        <div className="live-pill">
          <span></span>
          LIVE SYSTEM
        </div>
      </header>

      <main className="dashboard">

        {/* CUSTOMER ISSUE */}
        <section className="panel input-panel">

          <div className="section-label">
            CUSTOMER ISSUE
          </div>

          <h2>What needs to be resolved?</h2>

          <textarea
            value={message}
            onChange={(e) =>
              setMessage(e.target.value)
            }
            placeholder="Describe the customer's problem..."
            disabled={loading}
          />

          <div className="quick-label">
            QUICK SCENARIOS
          </div>

          <div className="quick-list">
            {QUICK_CASES.map((item) => (
              <button
                key={item}
                onClick={() => setMessage(item)}
                className="quick-case"
                disabled={loading}
              >
                {item}
              </button>
            ))}
          </div>

          <button
            className="resolve-button"
            onClick={resolveCase}
            disabled={loading}
          >
            {loading
              ? "Resolve is working..."
              : "Resolve Case →"}
          </button>

        </section>

        {/* AI ORCHESTRATION */}
        <section className="panel workflow-panel">

          <div className="section-label">
            AI ORCHESTRATION
          </div>

          <h2>Resolution workflow</h2>

          <div className="workflow">

            {WORKFLOW.map((step, index) => (
              <div
                className="workflow-item"
                key={step.name}
              >

                <div
                  className={`workflow-node ${getStepClass(
                    index
                  )}`}
                >
                  {result && index < activeStep
                    ? "✓"
                    : index + 1}
                </div>

                <div className="workflow-text">
                  <strong>{step.name}</strong>
                  <span>
                    {step.description}
                  </span>
                </div>

                {index < WORKFLOW.length - 1 && (
                  <div
                    className={`workflow-line ${
                      result || activeStep > index
                        ? "complete"
                        : ""
                    }`}
                  />
                )}

              </div>
            ))}

          </div>

          {/* ORCHESTRATOR */}
          <div className="agent-box">

            <div className="agent-header">

              <div>
                <strong>
                  AI Orchestrator
                </strong>

                <span>
                  Specialized agents coordinated
                </span>
              </div>

              <div className="active-badge">
                {loading
                  ? "PROCESSING"
                  : "READY"}
              </div>

            </div>

            <div className="agent-grid">
              <span>Intent Agent</span>
              <span>Investigation</span>
              <span>Policy Engine</span>
              <span>Resolution Agent</span>
              <span>Action Engine</span>
              <span>Verification</span>
            </div>

          </div>

          {/* AI UNDERSTANDING */}
          {result &&
            result.finalStatus !== "ERROR" && (
              <div className="ai-insight">

                <div className="ai-insight-header">

                  <div>
                    <strong>
                      AI understanding
                    </strong>

                    <span>
                      Customer message analysis
                    </span>
                  </div>

                  <div
                    className={`ai-badge ${
                      isAiPowered
                        ? "ai"
                        : "fallback"
                    }`}
                  >
                    {isAiPowered
                      ? "GEMINI"
                      : "FALLBACK"}
                  </div>

                </div>

                <p>
                  {result.summary ||
                    result.aiAnalysis?.summary ||
                    "Customer issue analyzed."}
                </p>

                <div className="ai-facts">

                  <div>
                    <span>Intent</span>
                    <strong>
                      {result.intent || "—"}
                    </strong>
                  </div>

                  <div>
                    <span>Category</span>
                    <strong>
                      {result.category || "—"}
                    </strong>
                  </div>

                  <div>
                    <span>Sentiment</span>
                    <strong>
                      {result.sentiment || "—"}
                    </strong>
                  </div>

                </div>

              </div>
            )}

          {/* DECISION TRACE */}
          {result &&
            result.finalStatus !== "ERROR" && (
              <div className="decision-trace">

                <button
                  className="trace-toggle"
                  onClick={() =>
                    setShowTrace(
                      (value) => !value
                    )
                  }
                >
                  <div>
                    <strong>
                      Decision trace
                    </strong>

                    <span>
                      Why Resolve made this decision
                    </span>
                  </div>

                  <span>
                    {showTrace ? "−" : "+"}
                  </span>
                </button>

                {showTrace && (
                  <div className="trace-list">

                    <div className="trace-item">
                      <div className="trace-icon">
                        1
                      </div>

                      <div>
                        <strong>
                          Intent identified
                        </strong>

                        <span>
                          {result.intent ||
                            "Issue classified"}
                        </span>
                      </div>
                    </div>

                    <div className="trace-item">
                      <div className="trace-icon">
                        2
                      </div>

                      <div>
                        <strong>
                          Evidence gathered
                        </strong>

                        <span>
                          Payment:{" "}
                          {result.investigation
                            ?.paymentStatus ||
                            "UNKNOWN"}
                          {" · "}
                          Order:{" "}
                          {result.investigation
                            ?.orderStatus ||
                            "UNKNOWN"}
                        </span>
                      </div>
                    </div>

                    <div className="trace-item">
                      <div className="trace-icon">
                        3
                      </div>

                      <div>
                        <strong>
                          Policy evaluated
                        </strong>

                        <span>
                          {result.policy
                            ?.decision ||
                            "INFORMATION"}
                        </span>
                      </div>
                    </div>

                    <div className="trace-item">
                      <div className="trace-icon">
                        4
                      </div>

                      <div>
                        <strong>
                          Action executed
                        </strong>

                        <span>
                          {result.action
                            ?.action ||
                            result.resolution
                              ?.action ||
                            "No automated action"}
                        </span>
                      </div>
                    </div>

                    <div className="trace-item">
                      <div className="trace-icon">
                        5
                      </div>

                      <div>
                        <strong>
                          Outcome verified
                        </strong>

                        <span>
                          {result.verification
                            ?.status ||
                            "PENDING"}
                        </span>
                      </div>
                    </div>

                    <div className="trace-rule">

                      <span>
                        POLICY RULE
                      </span>

                      <strong>
                        {result.policy?.rule ||
                          "Default evidence policy"}
                      </strong>

                    </div>

                  </div>
                )}

              </div>
            )}

        </section>

        {/* RESULT */}
        <section className="panel result-panel">

          <div className="section-label">
            RESOLUTION STATUS
          </div>

          {!result && !loading && (
            <div className="empty-state">

              <div className="empty-icon">
                ◎
              </div>

              <h2>
                Ready to resolve
              </h2>

              <p>
                Submit a customer issue and watch
                Resolve investigate, reason, act
                and verify.
              </p>

            </div>
          )}

          {loading && (
            <div className="empty-state processing-state">

              <div className="processing-ring"></div>

              <h2>
                Resolve is working
              </h2>

              <p>
                Understanding the issue,
                investigating evidence and
                applying permitted policies...
              </p>

            </div>
          )}

          {result &&
            result.finalStatus !== "ERROR" && (
              <>

                <div className="case-id">
                  {result.caseId || "CASE"}
                </div>

                <div
                  className={`status ${
                    isEscalated
                      ? "warning"
                      : "success"
                  }`}
                >

                  <div className="status-icon">
                    {isEscalated
                      ? "!"
                      : "✓"}
                  </div>

                  <div>
                    <span>
                      FINAL STATUS
                    </span>

                    <strong>
                      {isEscalated
                        ? "ESCALATED"
                        : result.finalStatus}
                    </strong>
                  </div>

                </div>

                <div className="result-details">

                  <div className="detail">
                    <span>
                      Decision
                    </span>

                    <strong>
                      {result.policy
                        ?.decision ||
                        "—"}
                    </strong>
                  </div>

                  <div className="detail">
                    <span>
                      Action
                    </span>

                    <strong>
                      {result.action
                        ?.action ||
                        result.resolution
                          ?.action ||
                        "—"}
                    </strong>
                  </div>

                  <div className="detail">
                    <span>
                      Verification
                    </span>

                    <strong>
                      {result.verification
                        ?.status ||
                        "—"}
                    </strong>
                  </div>

                </div>

                {/* ACTION DETAILS */}
                <div className="action-card">

                  <div>
                    <span>
                      ACTION REFERENCE
                    </span>

                    <strong>
                      {result.action
                        ?.reference ||
                        "—"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      ACTION STATUS
                    </span>

                    <strong>
                      {result.action
                        ?.status ||
                        "—"}
                    </strong>
                  </div>

                  {result.action
                    ?.amount > 0 && (
                    <div>
                      <span>
                        SIMULATED AMOUNT
                      </span>

                      <strong>
                        ₹
                        {result.action.amount}
                      </strong>
                    </div>
                  )}

                </div>

                <div className="final-message">

                  <span>
                    OUTCOME
                  </span>

                  <strong>
                    {isEscalated
                      ? "Human review required"
                      : "Case successfully resolved"}
                  </strong>

                </div>

              </>
            )}

          {result?.finalStatus ===
            "ERROR" && (
            <div className="error-state">

              <strong>
                Unable to resolve
              </strong>

              <span>
                {result.error}
              </span>

            </div>
          )}

        </section>

      </main>

      <section className="case-history-panel">
        <div className="case-history-header">
          <div>
            <div className="section-label">CASE HISTORY</div>
            <h2>Case History</h2>
            <p>Recent autonomous resolution activity</p>
          </div>

          <div className="case-history-actions">
            <button
              className="clear-history-button"
              onClick={() => {
                setCaseHistory([]);
                setSelectedCaseId(null);
              }}
            >
              Clear history
            </button>
          </div>
        </div>

        <div className="case-history-stats">
          <div className="stat-card">
            <span>Total cases</span>
            <strong>{caseHistory.length}</strong>
          </div>

          <div className="stat-card">
            <span>Resolved</span>
            <strong>{resolvedCount}</strong>
          </div>

          <div className="stat-card">
            <span>Escalated</span>
            <strong>{escalatedCount}</strong>
          </div>
        </div>

        <div className="history-list">
          {caseHistory.length === 0 ? (
            <div className="history-empty-state">
              No recent cases yet. Resolve a customer issue to begin the session history.
            </div>
          ) : (
            caseHistory.map((entry) => (
              <article key={entry.caseId} className="history-card">
                <div className="history-card-header">
                  <div>
                    <div className="history-case-id">{entry.caseId || "CASE"}</div>
                    <div className="history-message">
                      {entry.customerMessage || "Customer issue"}
                    </div>
                  </div>

                  <span
                    className={getHistoryBadgeClass(entry.finalStatus)}
                  >
                    {entry.finalStatus || "IN_PROGRESS"}
                  </span>
                </div>

                <div className="history-meta-grid">
                  <div>
                    <span>Intent</span>
                    <strong>{entry.intent || "—"}</strong>
                  </div>

                  <div>
                    <span>Decision</span>
                    <strong>{entry.policy?.decision || "—"}</strong>
                  </div>

                  <div>
                    <span>Final status</span>
                    <strong>{entry.finalStatus || "—"}</strong>
                  </div>

                  <div>
                    <span>Action ref</span>
                    <strong>{entry.action?.reference || "—"}</strong>
                  </div>

                  <div>
                    <span>Verification</span>
                    <strong>{entry.verification?.status || "—"}</strong>
                  </div>
                </div>

                <button
                  className="history-view-button"
                  onClick={() => setSelectedCaseId(entry.caseId)}
                >
                  View trace
                </button>
              </article>
            ))
          )}
        </div>

        {selectedCase && (
          <div className="history-trace-panel">
            <div className="history-trace-header">
              <div>
                <span>Selected case</span>
                <strong>{selectedCase.caseId || "CASE"}</strong>
              </div>
            </div>

            <div className="history-trace-list">
              <div className="history-trace-row">
                <span>Intent identified</span>
                <strong>{selectedCase.intent || "—"}</strong>
              </div>

              <div className="history-trace-row">
                <span>Evidence gathered</span>
                <strong>
                  Payment: {selectedCase.investigation?.paymentStatus || "—"} · Order: {selectedCase.investigation?.orderStatus || "—"}
                </strong>
              </div>

              <div className="history-trace-row">
                <span>Policy evaluated</span>
                <strong>{selectedCase.policy?.decision || "—"}</strong>
              </div>

              <div className="history-trace-row">
                <span>Policy rule</span>
                <strong>{selectedCase.policy?.rule || "—"}</strong>
              </div>

              <div className="history-trace-row">
                <span>Action executed</span>
                <strong>{selectedCase.action?.action || selectedCase.resolution?.action || "—"}</strong>
              </div>

              <div className="history-trace-row">
                <span>Action reference</span>
                <strong>{selectedCase.action?.reference || "—"}</strong>
              </div>

              <div className="history-trace-row">
                <span>Outcome verified</span>
                <strong>{selectedCase.verification?.status || "—"}</strong>
              </div>

              <div className="history-trace-row">
                <span>Final status</span>
                <strong>{selectedCase.finalStatus || "—"}</strong>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default App;