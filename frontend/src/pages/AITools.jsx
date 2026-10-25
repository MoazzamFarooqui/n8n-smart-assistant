import React, { useState, useRef, useEffect } from "react";
import { BookOpen, ShieldCheck, CheckSquare, Bug, GitMerge, ChevronRight, Loader2, Wand2, AlertTriangle } from "lucide-react";
import { TopBar, Card } from "../components/ui";
import { AIText, CopyButton } from "../components/Sheet";
import { aiApi, friendlyError } from "../services/api";
import { NODES } from "../data/nodes";

const SAMPLE_WORKFLOW = JSON.stringify({
  name: "Webhook to Slack",
  nodes: [
    { name: "Webhook", type: "n8n-nodes-base.webhook", typeVersion: 1, position: [250, 300], parameters: { path: "new-order", httpMethod: "POST" } },
    { name: "Slack", type: "n8n-nodes-base.slack", typeVersion: 2, position: [500, 300], parameters: { channel: "#orders", text: "New order received" } },
  ],
  connections: { Webhook: { main: [[{ node: "Slack", type: "main", index: 0 }]] } },
}, null, 2);

const TOOLS = [
  { key: "explain", title: "Workflow Explainer", desc: "Paste workflow JSON, get a step-by-step explanation.", icon: BookOpen, color: "#7C9CFF" },
  { key: "validate", title: "Workflow Validator", desc: "Check JSON validity, required fields and connections.", icon: CheckSquare, color: "#33D6A6" },
  { key: "audit", title: "Security Auditor", desc: "Find risks in a workflow and get recommendations.", icon: ShieldCheck, color: "#FF7A00" },
  { key: "error", title: "Error Translator", desc: "Paste an n8n error, get plain English and fixes.", icon: Bug, color: "#FF6B6B" },
  { key: "compat", title: "Compatibility Checker", desc: "Can two nodes connect? And how?", icon: GitMerge, color: "#C792FF" },
];

export function ToolsHub({ go }) {
  return (
    <div className="screen">
      <TopBar title="AI Tools" />
      <div className="listPad">
        <p className="muted small">Smart helpers powered by Gemini through our backend.</p>
        {TOOLS.map((t) => (
          <Card key={t.key} onClick={() => go("tool", t.key)}>
            <div className="rowBetween">
              <div className="rowIcon">
                <div className="iconChip" style={{ background: t.color + "22", color: t.color }}><t.icon size={18} /></div>
                <div>
                  <p className="cardTitle">{t.title}</p>
                  <p className="muted small">{t.desc}</p>
                </div>
              </div>
              <ChevronRight size={18} className="muted" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ResultCard({ text }) {
  return (
    <div className="subCard">
      <div className="rowBetween" style={{ marginBottom: 8 }}>
        <p className="subCardTitle" style={{ margin: 0 }}>Result</p>
        <CopyButton text={text} />
      </div>
      <AIText text={text} />
    </div>
  );
}

// Shared run logic: busy flag, error, result, unmount-safe
function useToolRun() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function run(fn) {
    if (busy) return;
    setBusy(true);
    setError("");
    setResult("");
    try {
      const text = await fn();
      if (mounted.current) setResult(text);
    } catch (err) {
      if (mounted.current && !(err && err.kind === "aborted")) setError(friendlyError(err));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return { busy, error, result, run };
}

function RunButton({ busy, onClick, label }) {
  return (
    <button className="primaryBtn" type="button" onClick={onClick} disabled={busy} style={{ flex: "none" }}>
      {busy ? <Loader2 size={16} className="spinIcon" /> : <Wand2 size={16} />} {busy ? "Thinking... (up to a minute)" : label}
    </button>
  );
}

function PasteJsonTool({ cfg }) {
  const [text, setText] = useState("");
  const [problem, setProblem] = useState("");
  const { busy, error, result, run } = useToolRun();

  function submit() {
    const value = text.trim();
    if (!value) { setProblem("Please paste your workflow JSON first."); return; }
    if (value.length > 100000) { setProblem("That JSON is too large. Please paste a smaller workflow."); return; }
    try {
      JSON.parse(value);
    } catch {
      setProblem("That does not look like valid JSON. Please paste the full workflow JSON exported from n8n.");
      return;
    }
    setProblem("");
    run(() => cfg.call(value));
  }

  return (
    <div className="listPad">
      <p className="muted small">{cfg.help}</p>
      <div className="subCard formStack">
        <div className="field">
          <label className="fieldLabel" htmlFor="tool-json">Workflow JSON</label>
          <textarea id="tool-json" className="textarea monoText" value={text} onChange={(e) => setText(e.target.value)} placeholder='{"name": "My workflow", "nodes": [...], "connections": {...}}' spellCheck={false} />
        </div>
        <button className="linkBtn" type="button" onClick={() => { setText(SAMPLE_WORKFLOW); setProblem(""); }} style={{ alignSelf: "flex-start" }}>Use a sample workflow</button>
        {problem && <div className="inlineError" role="alert">{problem}</div>}
        <RunButton busy={busy} onClick={submit} label={cfg.button} />
      </div>
      {error && <div className="inlineError" role="alert"><div className="rowIcon" style={{ gap: 8 }}><AlertTriangle size={16} /><span>{error}</span></div></div>}
      {result && <ResultCard text={result} />}
    </div>
  );
}

function ErrorTool() {
  const [errorText, setErrorText] = useState("");
  const [context, setContext] = useState("");
  const [problem, setProblem] = useState("");
  const { busy, error, result, run } = useToolRun();

  function submit() {
    if (!errorText.trim()) { setProblem("Please paste the error message first."); return; }
    setProblem("");
    run(() => aiApi.translateError({ error: errorText.trim(), context: context.trim() }));
  }

  return (
    <div className="listPad">
      <p className="muted small">Paste an error from n8n and get a plain-English explanation with ways to fix it.</p>
      <div className="subCard formStack">
        <div className="field">
          <label className="fieldLabel" htmlFor="err-text">Error message</label>
          <textarea id="err-text" className="textarea monoText" value={errorText} onChange={(e) => setErrorText(e.target.value)} placeholder="e.g. The service refused the connection - perhaps it is offline" spellCheck={false} />
        </div>
        <div className="field">
          <label className="fieldLabel" htmlFor="err-ctx">What were you doing? (optional)</label>
          <input id="err-ctx" className="input" value={context} onChange={(e) => setContext(e.target.value)} placeholder="e.g. Sending a Gmail message from a webhook" maxLength={500} />
        </div>
        {problem && <div className="inlineError" role="alert">{problem}</div>}
        <RunButton busy={busy} onClick={submit} label="Explain this error" />
      </div>
      {error && <div className="inlineError" role="alert"><div className="rowIcon" style={{ gap: 8 }}><AlertTriangle size={16} /><span>{error}</span></div></div>}
      {result && <ResultCard text={result} />}
    </div>
  );
}

function CompatTool() {
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [problem, setProblem] = useState("");
  const { busy, error, result, run } = useToolRun();

  function submit() {
    if (!source.trim() || !target.trim()) { setProblem("Please enter both node names."); return; }
    setProblem("");
    run(() => aiApi.compatibility({ sourceNode: source.trim(), targetNode: target.trim() }));
  }

  return (
    <div className="listPad">
      <p className="muted small">Pick two nodes (or type any n8n node) to see whether they can connect and how.</p>
      <div className="subCard formStack">
        <div className="field">
          <label className="fieldLabel" htmlFor="c-src">Source node</label>
          <input id="c-src" className="input" list="node-names" value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Webhook" maxLength={100} />
        </div>
        <div className="field">
          <label className="fieldLabel" htmlFor="c-tgt">Target node</label>
          <input id="c-tgt" className="input" list="node-names" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. Google Sheets" maxLength={100} />
        </div>
        <datalist id="node-names">
          {NODES.map((n) => <option key={n.id} value={n.name} />)}
        </datalist>
        {problem && <div className="inlineError" role="alert">{problem}</div>}
        <RunButton busy={busy} onClick={submit} label="Check compatibility" />
      </div>
      {error && <div className="inlineError" role="alert"><div className="rowIcon" style={{ gap: 8 }}><AlertTriangle size={16} /><span>{error}</span></div></div>}
      {result && <ResultCard text={result} />}
    </div>
  );
}

const JSON_TOOLS = {
  explain: { help: "Paste an n8n workflow JSON and get a clear, step-by-step breakdown of what it does.", button: "Explain workflow", call: (v) => aiApi.explainWorkflow(v) },
  validate: { help: "Paste an n8n workflow JSON to check its structure, required fields and node connections.", button: "Validate workflow", call: (v) => aiApi.validateWorkflow(v) },
  audit: { help: "Paste an n8n workflow JSON to find security risks and get recommendations.", button: "Run security audit", call: (v) => aiApi.securityAudit(v) },
};

export function ToolPage({ toolKey, goBack }) {
  const tool = TOOLS.find((t) => t.key === toolKey);
  if (!tool) {
    return (
      <div className="screen">
        <TopBar title="AI Tool" onBack={goBack} />
        <div className="emptyState"><AlertTriangle size={26} /><p>That tool does not exist.</p></div>
      </div>
    );
  }
  let body;
  if (JSON_TOOLS[tool.key]) body = <PasteJsonTool key={tool.key} cfg={JSON_TOOLS[tool.key]} />;
  else if (tool.key === "error") body = <ErrorTool />;
  else body = <CompatTool />;
  return (
    <div className="screen">
      <TopBar title={tool.title} onBack={goBack} />
      {body}
    </div>
  );
}
