import React, { useState, useRef, useEffect } from "react";
import { Sparkles, Loader2, CheckCircle2, XCircle, ExternalLink, Workflow, RotateCcw, Brain, StopCircle, ArrowRight } from "lucide-react";
import { TopBar, Pill } from "../components/ui";
import { Sheet, AIText } from "../components/Sheet";
import { useApp } from "../context/AppContext";
import { workflowApi, friendlyError } from "../services/api";
import { fmtMs, statusColor, toPrettyText, safeUrl } from "../utils/format";

const EXAMPLES = [
  "Send a Telegram message when a Google Form is submitted",
  "Every morning at 9am, email me a summary of my Google Sheet",
  "When a webhook receives an order, save it to Google Sheets and notify me on Slack",
];

const STAGE_LABEL = { generate: "Generate", validate: "Validate", audit: "Security audit", deploy: "Deploy to n8n", execute: "Execute" };

function StageList({ stages }) {
  if (!Array.isArray(stages) || stages.length === 0) return null;
  return (
    <div>
      {stages.map((s, i) => (
        <div key={i} className="stageRow">
          {s && s.ok ? <CheckCircle2 size={17} color="#33D6A6" /> : <XCircle size={17} color="#FF6B6B" />}
          <div>
            <p className="stageName">{STAGE_LABEL[s && s.stage] || (s && s.stage) || "Step"}</p>
            <p className="stageMeta">{fmtMs(s && s.ms)}{s && s.error ? " - " + s.error : ""}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function Details({ title, value }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <details className="detailsBox">
      <summary>{title}</summary>
      <pre>{toPrettyText(value)}</pre>
    </details>
  );
}

export default function Generator({ go }) {
  const { toast } = useApp();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);
  const [failure, setFailure] = useState(null); // { message, stage, stages }
  const [validationMsg, setValidationMsg] = useState("");
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const controllerRef = useRef(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (controllerRef.current) controllerRef.current.abort();
    };
  }, []);

  useEffect(() => {
    if (!loading) return undefined;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [loading]);

  async function onGenerate() {
    if (loading) return;
    const text = prompt.trim();
    if (text.length < 10) { setValidationMsg("Please describe the automation in at least 10 characters."); return; }
    if (text.length > 2000) { setValidationMsg("That is too long. Please keep it under 2000 characters."); return; }
    setValidationMsg("");
    setResult(null);
    setFailure(null);
    setLoading(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const data = await workflowApi.generateAndDeploy(text, controller.signal);
      if (!mounted.current) return;
      setResult(data);
      if (data && data.status === "success") toast("success", "Workflow deployed and executed successfully.");
      else toast("error", "The workflow was created but its first run failed. See the AI analysis.");
    } catch (err) {
      if (!mounted.current) return;
      if (err && err.kind === "aborted") {
        toast("info", "Generation cancelled.");
      } else {
        const d = err && err.data ? err.data : {};
        setFailure({ message: friendlyError(err), stage: d.stage || "", stages: Array.isArray(d.stages) ? d.stages : [] });
        toast("error", friendlyError(err));
      }
    } finally {
      controllerRef.current = null;
      if (mounted.current) setLoading(false);
    }
  }

  function cancel() {
    if (controllerRef.current) controllerRef.current.abort();
  }

  function reset() {
    setResult(null);
    setFailure(null);
    setPrompt("");
  }

  const n8nUrl = result ? safeUrl(result.n8nWorkflowUrl) : null;
  const ok = result && result.status === "success";
  const analysis = result && typeof result.errorAnalysis === "string" ? result.errorAnalysis : "";
  const execError = result && result.execution && result.execution.error ? String(result.execution.error) : "";

  return (
    <div className="screen">
      <TopBar title="Build with AI" />
      <div className="listPad">
        <p className="muted small">Describe what you want to automate. The AI generates the workflow, we validate and security-check it, deploy it to n8n and run it.</p>

        {!result && (
          <div className="subCard formStack">
            <div className="field">
              <label className="fieldLabel" htmlFor="gen-prompt">Your automation</label>
              <textarea
                id="gen-prompt"
                className="textarea"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. When a new row is added to my Google Sheet, send me an email"
                maxLength={2000}
                disabled={loading}
              />
              <p className="counter">{prompt.trim().length}/2000</p>
            </div>

            {!loading && (
              <div className="exampleChips">
                {EXAMPLES.map((ex) => (
                  <button key={ex} type="button" className="quickPromptChip" onClick={() => setPrompt(ex)}>{ex}</button>
                ))}
              </div>
            )}

            {validationMsg && <div className="inlineError" role="alert">{validationMsg}</div>}

            {loading ? (
              <div className="loadingBox" style={{ padding: "10px 0 0" }}>
                <Loader2 size={24} className="spinIcon" />
                <p className="small">Working on it... {elapsed}s</p>
                <div className="flowLine">
                  {["Generate", "Validate", "Audit", "Deploy", "Run"].map((s, i, arr) => (
                    <React.Fragment key={s}>
                      <span className="flowChip">{s}</span>
                      {i < arr.length - 1 && <ArrowRight size={13} className="flowArrow" />}
                    </React.Fragment>
                  ))}
                </div>
                <p className="hint">This can take up to a couple of minutes when the AI is busy.</p>
                <button type="button" className="glassBtn smallBtn" onClick={cancel}><StopCircle size={14} /> Cancel</button>
              </div>
            ) : (
              <button className="primaryBtn" type="button" onClick={onGenerate} style={{ flex: "none" }}>
                <Sparkles size={16} /> Generate &amp; Deploy
              </button>
            )}
          </div>
        )}

        {failure && !loading && (
          <div className="subCard formStack">
            <div className="rowBetween">
              <p className="subCardTitle" style={{ margin: 0 }}>Something went wrong</p>
              <Pill color="#FF6B6B">{failure.stage ? "failed at " + failure.stage : "failed"}</Pill>
            </div>
            <div className="inlineError" role="alert">{failure.message}</div>
            <StageList stages={failure.stages} />
            <p className="hint">Nothing was lost. Edit your description and try again.</p>
          </div>
        )}

        {result && (
          <>
            <div className="subCard formStack">
              <div className="rowBetween">
                <p className="cardTitle" style={{ margin: 0 }}>{result.name || "Your workflow"}</p>
                <Pill color={statusColor(result.status)}>{ok ? "success" : "failed"}</Pill>
              </div>
              {result.prompt && <p className="muted small">{result.prompt}</p>}
              <p className="hint">Total time: {fmtMs(result.totalMs)}</p>
              <StageList stages={result.stages} />
            </div>

            {!ok && (execError || analysis) && (
              <div className="warnCard">
                {execError && <div className="warnRow"><XCircle size={14} color="#FF7A00" /><p className="small">{execError}</p></div>}
                {analysis && (
                  <button className="primaryBtn" type="button" onClick={() => setAnalysisOpen(true)} style={{ flex: "none" }}>
                    <Brain size={16} /> See AI error analysis
                  </button>
                )}
              </div>
            )}

            <Details title="Security audit details" value={result.audit} />
            <Details title="Validation details" value={result.validation} />
            <Details title="Execution output" value={result.execution && result.execution.data} />

            <div className="btnRow">
              {n8nUrl && (
                <a className="glassBtn" href={n8nUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> Open in n8n</a>
              )}
              <button className="glassBtn" type="button" onClick={() => go("myworkflows")}><Workflow size={15} /> My workflows</button>
              <button className="primaryBtn" type="button" onClick={reset}><RotateCcw size={15} /> Build another</button>
            </div>
          </>
        )}
      </div>

      <Sheet open={analysisOpen} onClose={() => setAnalysisOpen(false)} title="AI error analysis">
        <AIText text={analysis} />
      </Sheet>
    </div>
  );
}
