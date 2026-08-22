import { useState } from "react";

const QUICK_CASES = [
  "₹4,999 was deducted but my order failed.",
  "I was charged twice for the same order.",
  "I don't recognize this transaction.",
];

const WORKFLOW = ["UNDERSTAND", "INVESTIGATE", "REASON", "ACT", "VERIFY"];

function App() {
  const [message, setMessage] = useState(QUICK_CASES[0]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showEvidence, setShowEvidence] = useState(true);

  const resolveCase = async () => {
    if (!message.trim()) return;

    setLoading(true);

    try {
      const response = await fetch("http://localhost:5000/api/resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to resolve case");
      }

      setResult(data);
    } catch (error) {
      setResult({
        finalStatus: "ERROR",
        error: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const isEscalated = result?.finalStatus === "ESCALATED_TO_HUMAN";

  return (
    <div className="app">
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

        {/* LEFT */}
        <section className="panel input-panel">
          <div className="section-label">CUSTOMER ISSUE</div>

          <h2>What needs to be resolved?</h2>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe the customer's problem..."
          />

          <div className="quick-label">QUICK SCENARIOS</div>

          <div className="quick-list">
            {QUICK_CASES.map((item) => (
              <button
                key={item}
                onClick={() => setMessage(item)}
                className="quick-case"
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
            {loading ? "Resolving..." : "Resolve Case →"}
          </button>
        </section>

        {/* CENTER */}
        <section className="panel workflow-panel">
          <div className="section-label">AI ORCHESTRATION</div>

          <h2>Resolution workflow</h2>

          <div className="workflow">
            {WORKFLOW.map((step, index) => (
              <div className="workflow-item" key={step}>
                <div
                  className={`workflow-node ${
                    result ? "active" : ""
                  }`}
                >
                  {index + 1}
                </div>

                <div className="workflow-text">
                  <strong>{step}</strong>
                  <span>
                    {index === 0 && "Understand customer intent"}
                    {index === 1 && "Gather evidence"}
                    {index === 2 && "Apply knowledge & policy"}
                    {index === 3 && "Execute permitted action"}
                    {index === 4 && "Confirm outcome"}
                  </span>
                </div>

                {index < WORKFLOW.length - 1 && (
                  <div className="workflow-line"></div>
                )}
              </div>
            ))}
          </div>

          <div className="agent-box">
            <div className="agent-header">
              <div>
                <strong>AI Orchestrator</strong>
                <span>Specialized agents coordinated</span>
              </div>

              <div className="active-badge">
                ACTIVE
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

          {result && (
            <div className="evidence">
              <button
                onClick={() => setShowEvidence(!showEvidence)}
                className="evidence-header"
              >
                <strong>Why this decision?</strong>
                <span>{showEvidence ? "−" : "+"}</span>
              </button>

              {showEvidence && (
                <div className="evidence-body">

                  <div>
                    <span>Intent</span>
                    <strong>{result.intent || "—"}</strong>
                  </div>

                  <div>
                    <span>Payment</span>
                    <strong>
                      {result.investigation?.paymentStatus || "—"}
                    </strong>
                  </div>

                  <div>
                    <span>Order</span>
                    <strong>
                      {result.investigation?.orderStatus || "—"}
                    </strong>
                  </div>

                  <div>
                    <span>Policy</span>
                    <strong>
                      {result.policy?.decision || "—"}
                    </strong>
                  </div>

                </div>
              )}
            </div>
          )}
        </section>

        {/* RIGHT */}
        <section className="panel result-panel">

          <div className="section-label">RESOLUTION STATUS</div>

          {!result && (
            <div className="empty-state">
              <div className="empty-icon">◎</div>

              <h2>Ready to resolve</h2>

              <p>
                Submit a customer issue and watch Resolve
                investigate, reason, act and verify.
              </p>
            </div>
          )}

          {result && (
            <>
              <div className="case-id">
                {result.caseId || "CASE"}
              </div>

              <div
                className={`status ${
                  isEscalated ? "warning" : "success"
                }`}
              >
                <div className="status-icon">
                  {isEscalated ? "!" : "✓"}
                </div>

                <div>
                  <span>FINAL STATUS</span>

                  <strong>
                    {isEscalated
                      ? "ESCALATED"
                      : result.finalStatus}
                  </strong>
                </div>
              </div>

              <div className="result-details">

                <div className="detail">
                  <span>Decision</span>
                  <strong>
                    {result.policy?.decision || "—"}
                  </strong>
                </div>

                <div className="detail">
                  <span>Action</span>
                  <strong>
                    {result.action?.action ||
                      result.resolution?.action ||
                      "—"}
                  </strong>
                </div>

                <div className="detail">
                  <span>Verification</span>
                  <strong>
                    {result.verification?.status || "—"}
                  </strong>
                </div>

              </div>

              <div className="final-message">
                <span>OUTCOME</span>

                <strong>
                  {isEscalated
                    ? "Human review required"
                    : "Case successfully resolved"}
                </strong>
              </div>
            </>
          )}

        </section>
      </main>
    </div>
  );
}

export default App;