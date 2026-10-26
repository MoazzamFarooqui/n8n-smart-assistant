import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Copy, RefreshCw, AlertTriangle } from "lucide-react";
import { useApp } from "../context/AppContext";
import { friendlyError } from "../services/api";

// Bottom sheet / drawer that sits inside the phone-shaped .app container
export function Sheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && onClose) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const node = (
    <div className="sheetOverlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheetHeader">
          <p className="cardTitle" style={{ margin: 0 }}>{title}</p>
          <button className="iconBtn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="sheetBody">{children}</div>
      </div>
    </div>
  );
  // Render inside the phone-shaped .app container so it overlays the whole screen,
  // regardless of the scroll position of the page underneath.
  const host = typeof document !== "undefined" ? document.querySelector(".app") : null;
  return host ? createPortal(node, host) : node;
}

function renderInline(text, keyPrefix) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    const key = keyPrefix + "-" + i;
    if (p.length > 4 && p.startsWith("**") && p.endsWith("**")) return <strong key={key}>{p.slice(2, -2)}</strong>;
    if (p.length > 2 && p.startsWith("`") && p.endsWith("`")) return <code key={key}>{p.slice(1, -1)}</code>;
    return <React.Fragment key={key}>{p}</React.Fragment>;
  });
}

// Tiny, safe markdown renderer (headings, bullets, bold, code). No raw HTML is ever injected.
export function AIText({ text }) {
  const lines = String(text == null ? "" : text).replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let code = null;
  let list = null;

  const flushList = () => {
    if (list) {
      const items = list;
      blocks.push(
        <ul key={"ul" + blocks.length}>
          {items.map((li, i) => <li key={i}>{renderInline(li, "li" + i)}</li>)}
        </ul>
      );
      list = null;
    }
  };

  lines.forEach((line) => {
    if (line.trim().startsWith("```")) {
      if (code === null) {
        flushList();
        code = [];
      } else {
        blocks.push(<pre key={"pre" + blocks.length}><code>{code.join("\n")}</code></pre>);
        code = null;
      }
      return;
    }
    if (code !== null) {
      code.push(line);
      return;
    }
    const bullet = line.match(/^\s*(?:[-*\u2022]|\d+\.)\s+(.*)$/);
    if (bullet) {
      if (!list) list = [];
      list.push(bullet[1]);
      return;
    }
    flushList();
    if (!line.trim()) return;
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      blocks.push(<h4 key={"h" + blocks.length}>{renderInline(heading[1], "h" + blocks.length)}</h4>);
      return;
    }
    blocks.push(<p key={"p" + blocks.length}>{renderInline(line, "p" + blocks.length)}</p>);
  });
  flushList();
  if (code !== null) blocks.push(<pre key={"pre-end"}><code>{code.join("\n")}</code></pre>);

  return <div className="aiText">{blocks}</div>;
}

export function CopyButton({ text, label = "Copy" }) {
  const { toast } = useApp();
  async function copy() {
    try {
      await navigator.clipboard.writeText(String(text || ""));
      toast("success", "Copied to clipboard", 2000);
    } catch {
      toast("error", "Could not copy. Please select the text and copy manually.");
    }
  }
  return (
    <button className="glassBtn smallBtn" onClick={copy} type="button">
      <Copy size={14} /> {label}
    </button>
  );
}

// Bottom sheet that runs an AI call when opened, with loading / error / retry / cache.
export function AIActionSheet({ open, onClose, title, run, cacheKey }) {
  const [state, setState] = useState({ status: "idle", text: "", error: "" });
  const cache = useRef({});
  const inflight = useRef(null);
  const runRef = useRef(run);
  runRef.current = run;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const exec = useCallback(async (force) => {
    if (!force && cache.current[cacheKey]) {
      setState({ status: "done", text: cache.current[cacheKey], error: "" });
      return;
    }
    if (inflight.current === cacheKey) {
      setState({ status: "loading", text: "", error: "" });
      return;
    }
    inflight.current = cacheKey;
    setState({ status: "loading", text: "", error: "" });
    try {
      const text = await runRef.current();
      cache.current[cacheKey] = text;
      if (mounted.current) setState({ status: "done", text, error: "" });
    } catch (err) {
      if (mounted.current && !(err && err.kind === "aborted")) {
        setState({ status: "error", text: "", error: friendlyError(err) });
      }
    } finally {
      if (inflight.current === cacheKey) inflight.current = null;
    }
  }, [cacheKey]);

  useEffect(() => {
    if (open) exec(false);
  }, [open, exec]);

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {state.status === "loading" && (
        <div className="loadingBox">
          <Loader2 size={22} className="spinIcon" />
          <p className="muted small">Asking the AI... this can take up to a minute.</p>
        </div>
      )}
      {state.status === "error" && (
        <div className="inlineError">
          <div className="rowIcon" style={{ gap: 8 }}><AlertTriangle size={16} /><span>{state.error}</span></div>
          <button className="glassBtn smallBtn" style={{ marginTop: 10 }} onClick={() => exec(true)} type="button">
            <RefreshCw size={14} /> Try again
          </button>
        </div>
      )}
      {state.status === "done" && (
        <>
          <AIText text={state.text} />
          <div className="btnRow" style={{ marginTop: 12 }}>
            <CopyButton text={state.text} />
            <button className="glassBtn smallBtn" onClick={() => exec(true)} type="button">
              <RefreshCw size={14} /> Regenerate
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
