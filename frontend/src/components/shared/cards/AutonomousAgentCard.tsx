import { useState } from "react";
import { Brain, Play, Loader, CheckCircle2, XCircle, Clock, Zap, ChevronDown, ChevronUp } from "lucide-react";

interface AutonomousAgentCardProps {
  onRunAgentCycle?: () => Promise<void>;
}

export function AutonomousAgentCard({ onRunAgentCycle }: AutonomousAgentCardProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRunCycle = async () => {
    if (!onRunAgentCycle) {
      setError("Agent service not available");
      return;
    }
    
    setIsRunning(true);
    setError(null);
    
    try {
      const result = await onRunAgentCycle();
      setLastResult(result);
    } catch (e: any) {
      setError(e.message || "Agent cycle failed");
    } finally {
      setIsRunning(false);
    }
  };

  // Parse NEXT_RUN_DECISION from response (top-level fields or summary text)
  const getDecision = () => {
    // First try top-level fields from API response
    if (lastResult?.schedulingReason) {
      return {
        reason: lastResult.schedulingReason,
        delay_ms: lastResult.nextRunDelay || 3600000,
        confidence: lastResult.schedulingConfidence || 0.5,
      };
    }
    // Fallback: try parsing from summary text
    if (!lastResult?.summary) return null;
    const match = lastResult.summary.match(/NEXT_RUN_DECISION:\s*\{[^}]+\}/s);
    if (!match) return null;
    try {
      const jsonStr = match[0].replace("NEXT_RUN_DECISION:", "").trim();
      return JSON.parse(jsonStr);
    } catch {
      return null;
    }
  };

  const decision = getDecision();

  return (
    <div className="card" style={{ border: "1px solid var(--accent)", background: "linear-gradient(135deg, rgba(59,130,246,0.05) 0%, rgba(139,92,246,0.05) 100%)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Brain size={18} style={{ color: "var(--accent)" }} />
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>Autonomous AI Agent</p>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {isRunning ? "🤖 Running decision cycle..." : lastResult ? "✅ Last cycle complete" : "Ready to run"}
            </span>
          </div>
        </div>
        
        <button
          onClick={handleRunCycle}
          disabled={isRunning}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 16px",
            background: isRunning ? "var(--accent)" : "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
            border: "none",
            borderRadius: 6,
            color: "white",
            fontSize: 12,
            fontWeight: 600,
            cursor: isRunning ? "not-allowed" : "pointer",
            opacity: isRunning ? 0.8 : 1,
          }}
        >
          {isRunning ? (
            <><Loader size={14} className="execSpinIcon" /> Running...</>
          ) : (
            <><Play size={14} /> Run Agent Cycle</>
          )}
        </button>
      </div>

      {/* Status indicators */}
      <div style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {isRunning ? (
            <Loader size={14} className="execSpinIcon" style={{ color: "var(--accent)" }} />
          ) : lastResult ? (
            <CheckCircle2 size={14} style={{ color: "var(--success)" }} />
          ) : (
            <Clock size={14} style={{ color: "var(--text-muted)" }} />
          )}
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Status: {isRunning ? "Running" : lastResult ? "Idle" : "Ready"}
          </span>
        </div>
        
        {decision && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Zap size={14} style={{ color: "#fbbf24" }} />
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Next run: {decision.reason}
            </span>
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div style={{ 
          padding: "8px 12px", 
          background: "rgba(239,68,68,0.1)", 
          border: "1px solid rgba(239,68,68,0.3)", 
          borderRadius: 6,
          marginBottom: 12,
          fontSize: 12,
          color: "var(--danger)"
        }}>
          <XCircle size={12} style={{ display: "inline", marginRight: 6 }} />
          {error}
        </div>
      )}

      {/* Agent Decision Summary */}
      {lastResult?.summary && (
        <div>
          <button
            onClick={() => setShowDetails(!showDetails)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "transparent",
              border: "none",
              color: "var(--accent)",
              fontSize: 12,
              cursor: "pointer",
              padding: "4px 0",
              marginBottom: showDetails ? 8 : 0,
            }}
          >
            {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showDetails ? "Hide" : "Show"} Agent Decision Process
          </button>
          
          {showDetails && (
            <div style={{
              background: "rgba(0,0,0,0.3)",
              borderRadius: 6,
              padding: 12,
              fontSize: 11,
              maxHeight: 300,
              overflow: "auto",
              whiteSpace: "pre-wrap",
              fontFamily: "monospace",
              color: "var(--text)",
              lineHeight: 1.5,
            }}>
              {lastResult.summary}
              
              {/* Highlight NEXT_RUN_DECISION */}
              {decision && (
                <div style={{
                  marginTop: 12,
                  padding: "8px 12px",
                  background: "rgba(251,191,36,0.1)",
                  border: "1px solid rgba(251,191,36,0.3)",
                  borderRadius: 4,
                }}>
                  <strong style={{ color: "#fbbf24" }}>🤖 Agent's Next Decision:</strong>
                  <div style={{ marginTop: 4, color: "var(--text-muted)" }}>
                    • Reason: {decision.reason}
                  </div>
                  <div style={{ color: "var(--text-muted)" }}>
                    • Delay: {Math.round(decision.delay_ms / 60000)} minutes
                  </div>
                  <div style={{ color: "var(--text-muted)" }}>
                    • Confidence: {Math.round((decision.confidence || 0.5) * 100)}%
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* What this demonstrates */}
      <div style={{ 
        marginTop: 12, 
        padding: "8px 12px", 
        background: "rgba(59,130,246,0.1)", 
        borderRadius: 4,
        fontSize: 10,
        color: "var(--text-muted)"
      }}>
        <strong style={{ color: "var(--accent)" }}>🎯 What this demonstrates:</strong>
        <ul style={{ margin: "4px 0 0 0", paddingLeft: 16 }}>
          <li>Agent autonomously analyzes risk and market conditions</li>
          <li>Makes decisions on yield optimization (not just "how" but "when and why")</li>
          <li>Determines when to run next cycle based on confidence</li>
        </ul>
      </div>
    </div>
  );
}
