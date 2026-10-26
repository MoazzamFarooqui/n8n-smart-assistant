import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Search, ChevronRight, ChevronLeft, Loader2, RefreshCw, Play, Power, Trash2, ExternalLink,
  ShieldCheck, BookOpen, Sparkles, AlertTriangle, Brain, CheckCircle2, XCircle,
} from "lucide-react";
import { TopBar, Card, Pill } from "../components/ui";
import { Sheet, AIText, AIActionSheet } from "../components/Sheet";
import { useApp } from "../context/AppContext";
import { workflowApi, aiApi, friendlyError } from "../services/api";
import { fmtDate, statusColor, statusLabel, toPrettyText, safeUrl, definitionToString } from "../utils/format";

/* ======================= LIST ======================= */
export function MyWorkflows({ go }) {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reqId = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    setError("");
    try {
      const data = await workflowApi.list({ page, limit: 8, status: status || undefined, search: debounced || undefined });
      if (id !== reqId.current || !mounted.current) return;
      setItems(Array.isArray(data.data) ? data.data : []);
      setPagination(data.pagination || null);
    } catch (err) {
      if (id !== reqId.current || !mounted.current) return;
      if (err && err.kind === "aborted") return;
      setError(friendlyError(err));
    } finally {
      if (id === reqId.current && mounted.current) setLoading(false);
    }
  }, [page, status, debounced]);

  useEffect(() => { load(); }, [load]);

  function pickStatus(s) {
    setStatus(s);
    setPage(1);
  }

  return (
    <div className="screen">
      <TopBar title="My Workflows" />
      <div className="listPad">
        <div className="searchWrap searchWrapInline">
          <Search size={17} className="searchIcon" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your workflows..." className="searchInput" maxLength={100} />
        </div>

        <div className="rowBetween">
          <div className="filterRow">
            {[["", "All"], ["active", "Active"], ["inactive", "Inactive"]].map(([val, label]) => (
              <button key={label} type="button" className={"filterChip" + (status === val ? " active" : "")} onClick={() => pickStatus(val)}>{label}</button>
            ))}
          </div>
          <button className="iconBtn" onClick={load} aria-label="Refresh" disabled={loading}><RefreshCw size={16} className={loading ? "spinIcon" : ""} /></button>
        </div>

        {error && (
          <div className="inlineError" role="alert">
            <div className="rowIcon" style={{ gap: 8 }}><AlertTriangle size={16} /><span>{error}</span></div>
            <button className="glassBtn smallBtn" style={{ marginTop: 10 }} onClick={load}><RefreshCw size={14} /> Try again</button>
          </div>
        )}

        {loading && items.length === 0 && !error && (
          <div className="loadingBox"><Loader2 size={22} className="spinIcon" /><p className="muted small">Loading your workflows...</p></div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="emptyState">
            <Sparkles size={26} />
            <p>{debounced || status ? "No workflows match your filters." : "You have no workflows yet."}</p>
            {!debounced && !status && (
              <button className="primaryBtn" style={{ maxWidth: 240 }} onClick={() => go("generate")}>Build your first one</button>
            )}
          </div>
        )}

        {items.map((w) => (
          <Card key={w.id} onClick={() => go("myworkflowDetail", w.id)}>
            <div className="rowBetween">
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="cardTitle" style={{ wordBreak: "break-word" }}>{w.name}</p>
                {w.description && <p className="muted small" style={{ wordBreak: "break-word" }}>{String(w.description).slice(0, 90)}{String(w.description).length > 90 ? "..." : ""}</p>}
                <div className="chipWrap" style={{ marginTop: 8 }}>
                  <Pill color={w.is_active ? "#33D6A6" : "#A0A0A0"}>{w.is_active ? "active" : "inactive"}</Pill>
                  <span className="tagChip">{Number(w.execution_count || 0)} run{Number(w.execution_count || 0) === 1 ? "" : "s"}</span>
                  {w.last_execution_status && <Pill color={statusColor(w.last_execution_status)}>last: {statusLabel(w.last_execution_status)}</Pill>}
                </div>
              </div>
              <ChevronRight size={18} className="muted" />
            </div>
          </Card>
        ))}

        {pagination && pagination.totalPages > 1 && (
          <div className="pagerRow">
            <button className="glassBtn smallBtn" disabled={!pagination.hasPrev || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft size={14} /> Prev</button>
            <span className="muted small">Page {pagination.page} of {pagination.totalPages}</span>
            <button className="glassBtn smallBtn" disabled={!pagination.hasNext || loading} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight size={14} /></button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ======================= DETAIL ======================= */
export function MyWorkflowDetail({ id, goBack }) {
  const { toast } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(""); // execute | toggle | delete
  const [execResult, setExecResult] = useState(null);
  const [analysis, setAnalysis] = useState(null); // text shown in sheet
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const mounted = useRef(true);
  const reqId = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const load = useCallback(async (silent) => {
    const rid = ++reqId.current;
    if (!silent) { setLoading(true); setError(""); setNotFound(false); }
    try {
      const res = await workflowApi.get(id);
      if (rid !== reqId.current || !mounted.current) return;
      setData(res);
    } catch (err) {
      if (rid !== reqId.current || !mounted.current) return;
      if (err && err.kind === "aborted") return;
      if (err && err.status === 404) setNotFound(true);
      else if (!silent) setError(friendlyError(err));
      else toast("error", friendlyError(err));
    } finally {
      if (rid === reqId.current && mounted.current && !silent) setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => { load(false); }, [load]);

  const wf = data && data.workflow ? data.workflow : null;
  const stats = data && data.executionStats ? data.executionStats : null;
  const executions = data && Array.isArray(data.executions) ? data.executions : [];
  const n8nInfo = data && data.n8n ? data.n8n : null;
  const defText = wf ? definitionToString(wf.definition) : "";

  async function onExecute() {
    if (busy) return;
    setBusy("execute");
    setExecResult(null);
    try {
      const res = await workflowApi.execute(id);
      if (!mounted.current) return;
      setExecResult(res);
      toast(res && res.status === "success" ? "success" : "error", res && res.status === "success" ? "Workflow ran successfully." : "The run failed. See the AI analysis below.");
      load(true);
    } catch (err) {
      if (mounted.current) toast("error", friendlyError(err));
      if (mounted.current && err && err.status === 404) load(true);
    } finally {
      if (mounted.current) setBusy("");
    }
  }

  async function onToggle() {
    if (busy || !wf) return;
    setBusy("toggle");
    try {
      if (wf.is_active) await workflowApi.deactivate(id);
      else await workflowApi.activate(id);
      if (!mounted.current) return;
      toast("success", wf.is_active ? "Workflow deactivated." : "Workflow activated.");
      await load(true);
    } catch (err) {
      if (mounted.current) toast("error", friendlyError(err));
    } finally {
      if (mounted.current) setBusy("");
    }
  }

  async function onDelete() {
    if (busy) return;
    setBusy("delete");
    try {
      await workflowApi.remove(id);
      toast("success", "Workflow deleted.");
      if (mounted.current) goBack();
    } catch (err) {
      if (mounted.current) {
        toast("error", friendlyError(err));
        setConfirmDelete(false);
      }
    } finally {
      if (mounted.current) setBusy("");
    }
  }

  const n8nUrl = wf ? safeUrl(wf.n8nWorkflowUrl) : null;
  const execOk = execResult && execResult.status === "success";
  const execErr = execResult && execResult.execution ? execResult.execution.error : "";
  const execAnalysis = execResult && execResult.execution && typeof execResult.execution.errorAnalysis === "string" ? execResult.execution.errorAnalysis : "";
  const execOutput = execResult && execResult.execution ? execResult.execution.output : undefined;

  return (
    <div className="screen">
      <TopBar title={wf ? wf.name : "Workflow"} onBack={goBack} />
      <div className="listPad">
        {loading && <div className="loadingBox"><Loader2 size={22} className="spinIcon" /><p className="muted small">Loading workflow...</p></div>}

        {!loading && notFound && (
          <div className="emptyState"><AlertTriangle size={26} /><p>This workflow was not found. It may have been deleted.</p>
            <button className="primaryBtn" style={{ maxWidth: 200 }} onClick={goBack}>Go back</button></div>
        )}

        {!loading && error && !notFound && (
          <div className="inlineError" role="alert">
            <div className="rowIcon" style={{ gap: 8 }}><AlertTriangle size={16} /><span>{error}</span></div>
            <button className="glassBtn smallBtn" style={{ marginTop: 10 }} onClick={() => load(false)}><RefreshCw size={14} /> Try again</button>
          </div>
        )}

        {!loading && wf && (
          <>
            <div className="subCard formStack">
              <div className="rowBetween">
                <Pill color={wf.is_active ? "#33D6A6" : "#A0A0A0"}>{wf.is_active ? "active" : "inactive"}</Pill>
                <span className="muted small">Created {fmtDate(wf.created_at)}</span>
              </div>
              {wf.description && <p className="small" style={{ wordBreak: "break-word" }}>{wf.description}</p>}
              {wf.prompt && <div><p className="subCardTitle">Your prompt</p><p className="muted small" style={{ wordBreak: "break-word" }}>{wf.prompt}</p></div>}
              {stats && (
                <div className="chipWrap">
                  <span className="tagChip">{stats.total} total runs</span>
                  <span className="tagChip" style={{ borderColor: "#33D6A655" }}>{stats.completed} succeeded</span>
                  <span className="tagChip" style={{ borderColor: "#FF6B6B55" }}>{stats.failed} failed</span>
                </div>
              )}
              {n8nInfo && n8nInfo.available === false && (
                <div className="inlineWarn">n8n: {n8nInfo.error || "Workflow is not available in n8n right now."}</div>
              )}
            </div>

            <div className="btnRow">
              <button className="primaryBtn" onClick={onExecute} disabled={!!busy}>
                {busy === "execute" ? <Loader2 size={15} className="spinIcon" /> : <Play size={15} />} {busy === "execute" ? "Running..." : "Run now"}
              </button>
              <button className="glassBtn" onClick={onToggle} disabled={!!busy}>
                {busy === "toggle" ? <Loader2 size={15} className="spinIcon" /> : <Power size={15} />} {wf.is_active ? "Deactivate" : "Activate"}
              </button>
            </div>

            <div className="btnRow">
              <button className="glassBtn" onClick={() => setAuditOpen(true)} disabled={!defText}><ShieldCheck size={15} /> Security audit</button>
              <button className="glassBtn" onClick={() => setExplainOpen(true)} disabled={!defText}><BookOpen size={15} /> Explain</button>
              {n8nUrl && <a className="glassBtn" href={n8nUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> Open in n8n</a>}
            </div>

            {execResult && (
              <div className="subCard formStack">
                <div className="rowBetween">
                  <p className="subCardTitle" style={{ margin: 0 }}>Latest run</p>
                  <Pill color={statusColor(execResult.status)}>{execOk ? "success" : "failed"}</Pill>
                </div>
                {!execOk && execErr && <div className="inlineError">{String(execErr)}</div>}
                {!execOk && execAnalysis && (
                  <button className="primaryBtn" onClick={() => setAnalysis(execAnalysis)} style={{ flex: "none" }}><Brain size={15} /> See AI error analysis</button>
                )}
                {execOk && execOutput !== undefined && (
                  <details className="detailsBox"><summary>Output</summary><pre>{toPrettyText(execOutput)}</pre></details>
                )}
                {execResult.webhookUrl && <p className="hint" style={{ wordBreak: "break-all" }}>Webhook: {String(execResult.webhookUrl)}</p>}
              </div>
            )}

            <div className="subCard">
              <p className="subCardTitle">Execution history</p>
              {executions.length === 0 && <p className="muted small">No runs yet. Tap "Run now" to test it.</p>}
              {executions.map((ex) => (
                <div key={ex.id} className="stageRow">
                  {String(ex.status).toLowerCase() === "completed" ? <CheckCircle2 size={17} color="#33D6A6" /> : String(ex.status).toLowerCase() === "failed" ? <XCircle size={17} color="#FF6B6B" /> : <Loader2 size={17} color="#FFB347" />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="stageName">{statusLabel(ex.status)}</p>
                    <p className="stageMeta">{fmtDate(ex.started_at || ex.created_at)}</p>
                    {ex.error_message && <p className="stageMeta" style={{ color: "#FFA3A3" }}>{String(ex.error_message).slice(0, 160)}</p>}
                    {ex.error_analysis && <button className="linkBtn" onClick={() => setAnalysis(String(ex.error_analysis))}>View AI analysis</button>}
                  </div>
                </div>
              ))}
            </div>

            <button className="dangerBtn" onClick={() => setConfirmDelete(true)} disabled={!!busy} style={{ flex: "none" }}><Trash2 size={15} /> Delete workflow</button>
          </>
        )}
      </div>

      <Sheet open={!!analysis} onClose={() => setAnalysis(null)} title="AI error analysis">
        <AIText text={analysis || ""} />
      </Sheet>

      <Sheet open={confirmDelete} onClose={() => (busy ? null : setConfirmDelete(false))} title="Delete this workflow?">
        <p className="small">This removes it from n8n and from your account. This cannot be undone.</p>
        <div className="btnRow" style={{ marginTop: 14 }}>
          <button className="glassBtn" onClick={() => setConfirmDelete(false)} disabled={busy === "delete"}>Cancel</button>
          <button className="dangerBtn" onClick={onDelete} disabled={busy === "delete"}>
            {busy === "delete" ? <Loader2 size={15} className="spinIcon" /> : <Trash2 size={15} />} Delete
          </button>
        </div>
      </Sheet>

      <AIActionSheet open={auditOpen} onClose={() => setAuditOpen(false)} title="Security audit" cacheKey={"audit-" + id} run={() => aiApi.securityAudit(defText)} />
      <AIActionSheet open={explainOpen} onClose={() => setExplainOpen(false)} title="Workflow explained" cacheKey={"explain-" + id} run={() => aiApi.explainWorkflow(defText)} />
    </div>
  );
}
