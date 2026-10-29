import React, { useState, useEffect, useCallback, useRef } from "react";
import { Key, Loader2, RefreshCw, Trash2, AlertTriangle, CheckCircle2, Plus, Plug } from "lucide-react";
import { TopBar, Pill } from "../components/ui";
import { Sheet } from "../components/Sheet";
import { useApp } from "../context/AppContext";
import { credentialsApi, friendlyError } from "../services/api";

function appIcon(app) {
  const configs = {
    gmail: {
      bg: "linear-gradient(135deg, #ffffff 0%, #f5f5f5 100%)",
      svg: (
        <svg viewBox="0 0 48 48" width="26" height="26" xmlns="http://www.w3.org/2000/svg">
          <path fill="#EA4335" d="M6 40h6V22L4 16v20c0 2.2 1.8 4 2 4z"/>
          <path fill="#34A853" d="M36 40h6c.2 0 2-1.8 2-4V16l-8 6z"/>
          <path fill="#4285F4" d="M36 8H12L24 17.6z"/>
          <path fill="#FBBC05" d="M12 22V8L4 16z"/>
          <path fill="#EA4335" d="M44 16L36 8v14z"/>
          <path fill="#C5221F" d="M24 17.6L12 8v14l12 8.4 12-8.4V8z"/>
        </svg>
      ),
    },
    smtp: {
      bg: "linear-gradient(135deg, #4FC3F7 0%, #0288D1 100%)",
      svg: (
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 6.5A2.5 2.5 0 014.5 4h15A2.5 2.5 0 0122 6.5v11A2.5 2.5 0 0119.5 20h-15A2.5 2.5 0 012 17.5v-11z" fill="white" opacity="0.3"/>
          <path d="M2 7l10 7 10-7" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          <rect x="2" y="4" width="20" height="16" rx="2.5" stroke="white" strokeWidth="1.8" fill="none"/>
        </svg>
      ),
    },
    googleSheets: {
      bg: "linear-gradient(135deg, #34A853 0%, #1e7e34 100%)",
      svg: (
        <svg viewBox="0 0 48 48" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
          <path fill="white" d="M37 45H11c-1.7 0-3-1.3-3-3V6c0-1.7 1.3-3 3-3h19l10 10v29c0 1.7-1.3 3-3 3z"/>
          <path fill="#34A853" d="M40 13H30V3z"/>
          <path fill="#2E7D32" d="M30 3l10 10H30z"/>
          <path fill="#34A853" d="M15 23h18v2H15zm0 4h18v2H15zm0 4h12v2H15z"/>
        </svg>
      ),
    },
    googleCalendar: {
      bg: "linear-gradient(135deg, #4285F4 0%, #1a56c4 100%)",
      svg: (
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="5" width="18" height="16" rx="2.5" stroke="white" strokeWidth="1.8" />
          <path d="M3 10h18M8 3v4M16 3v4" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
          <rect x="7" y="13" width="3" height="3" rx="0.6" fill="white" />
        </svg>
      ),
    },
    googleDrive: {
      bg: "linear-gradient(135deg, #FBBC05 0%, #34A853 100%)",
      svg: (
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 3h8l5 9-4 7H7l-4-7z" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M8 3l5 9h8M3 12h10l4 7" stroke="white" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      ),
    },
    googleDocs: {
      bg: "linear-gradient(135deg, #4285F4 0%, #2a6fdb 100%)",
      svg: (
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 3h8l4 4v14H6z" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M14 3v4h4M9 12h6M9 15h6M9 18h4" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ),
    },
    discord: {
      bg: "linear-gradient(135deg, #7289DA 0%, #5865F2 100%)",
      svg: (
        <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
          <path fill="white" d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
        </svg>
      ),
    },
    whatsapp: {
      bg: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)",
      svg: (
        <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
          <path fill="white" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      ),
    },
    slack: {
      bg: "linear-gradient(135deg, #E01E5A 0%, #ECB22E 50%, #2EB67D 100%)",
      svg: (
        <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
          <path fill="white" d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zM17.687 8.834a2.528 2.528 0 01-2.521 2.521 2.527 2.527 0 01-2.521-2.521V2.522A2.527 2.527 0 0115.166 0a2.528 2.528 0 012.521 2.522v6.312zM15.166 18.956a2.528 2.528 0 012.521 2.522A2.528 2.528 0 0115.166 24a2.527 2.527 0 01-2.521-2.522v-2.522h2.521zM15.166 17.687a2.527 2.527 0 01-2.521-2.521 2.527 2.527 0 012.521-2.521h6.312A2.528 2.528 0 0124 15.166a2.528 2.528 0 01-2.522 2.521h-6.312z"/>
        </svg>
      ),
    },
  };

  const config = configs[app];
  if (config) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 42, height: 42, borderRadius: 12,
        background: config.bg,
        flexShrink: 0,
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}>
        {config.svg}
      </span>
    );
  }

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 42, height: 42, borderRadius: 12,
      background: "linear-gradient(135deg, #555 0%, #333 100%)",
      flexShrink: 0, fontSize: 20,
    }}>🔑</span>
  );
}

function CredentialForm({ spec, existing, onClose, onSaved }) {
  const { toast } = useApp();
  const [name, setName] = useState(existing ? existing.credentialName : "");
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await credentialsApi.create({ app: spec.app, name: name.trim() || undefined, data: values });
      toast("success", spec.label + " credential saved.");
      onSaved();
      onClose();
    } catch (err) {
      toast("error", friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={existing ? "Update " + spec.label : "Add " + spec.label}>
      <div className="formStack">
        <div className="field">
          <label className="fieldLabel" htmlFor="cred-name">Name (optional)</label>
          <input id="cred-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={"e.g. My " + spec.label} maxLength={255} />
        </div>
        {spec.fields.map((f) => (
          <div className="field" key={f.key}>
            <label className="fieldLabel" htmlFor={"cred-" + f.key}>{f.label}{f.required ? " *" : ""}</label>
            {f.type === "boolean" ? (
              <label className="rowIcon" style={{ gap: 8 }}>
                <input
                  id={"cred-" + f.key}
                  type="checkbox"
                  checked={Boolean(values[f.key])}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked }))}
                />
                <span className="small">Yes</span>
              </label>
            ) : (
              <input
                id={"cred-" + f.key}
                className="input"
                type={f.type === "password" ? "password" : f.type === "number" ? "number" : "text"}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={f.placeholder || ""}
                autoComplete="off"
              />
            )}
          </div>
        ))}
        <button className="primaryBtn" onClick={save} disabled={saving} style={{ flex: "none" }}>
          {saving ? <Loader2 size={15} className="spinIcon" /> : <CheckCircle2 size={15} />} Save credential
        </button>
        <p className="hint">Stored safely in n8n — the secret is never shown again after saving.</p>
      </div>
    </Sheet>
  );
}

export default function Credentials({ go }) {
  const { toast } = useApp();
  const [specs, setSpecs] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyApp, setBusyApp] = useState("");
  const [formFor, setFormFor] = useState(null);
  const [removeApp, setRemoveApp] = useState(null);
  const [removing, setRemoving] = useState(false);
  const mounted = useRef(true);
  const reqId = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    setError("");
    try {
      const [t, l] = await Promise.all([credentialsApi.types(), credentialsApi.list()]);
      if (id !== reqId.current || !mounted.current) return;
      setSpecs(Array.isArray(t.data) ? t.data : []);
      setItems(Array.isArray(l.data) ? l.data : []);
    } catch (err) {
      if (id !== reqId.current || !mounted.current) return;
      if (err && err.kind === "aborted") return;
      setError(friendlyError(err));
    } finally {
      if (id === reqId.current && mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const byApp = {};
  items.forEach((c) => { byApp[c.app] = c; });

  async function connectGoogle(spec) {
    if (busyApp) return;
    setBusyApp(spec.app);
    let popup;
    try {
      const res = await credentialsApi.oauthStart(spec.app);
      popup = window.open(res.url, "google-connect", "width=560,height=680");
      if (!popup) {
        toast("error", "The popup was blocked. Allow popups for this site and try again.");
        setBusyApp("");
        return;
      }
    } catch (err) {
      toast("error", friendlyError(err));
      setBusyApp("");
      return;
    }

    const timer = setInterval(async () => {
      if (popup.closed) {
        clearInterval(timer);
        if (mounted.current) { setBusyApp(""); load(); }
        return;
      }
      try {
        const st = await credentialsApi.oauthStatus(spec.app);
        if (st.connected) {
          clearInterval(timer);
          popup.close();
          if (mounted.current) {
            setBusyApp("");
            toast("success", spec.label + " connected.");
            load();
          }
        }
      } catch { /* keep polling until popup closes */ }
    }, 2000);
  }

  async function remove() {
    if (removing || !removeApp) return;
    setRemoving(true);
    try {
      await credentialsApi.remove(removeApp);
      toast("success", "Credential removed.");
      setRemoveApp(null);
      load();
    } catch (err) {
      toast("error", friendlyError(err));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="screen">
      <TopBar title="Credentials" onBack={() => go("account")} />
      <div className="listPad">
        <p className="muted small">Connect the apps you automate with. One-click for Google — your workflows use these automatically.</p>

        {error && (
          <div className="inlineError" role="alert">
            <div className="rowIcon" style={{ gap: 8 }}><AlertTriangle size={16} /><span>{error}</span></div>
            <button className="glassBtn smallBtn" style={{ marginTop: 10 }} onClick={load}><RefreshCw size={14} /> Try again</button>
          </div>
        )}

        {loading && specs.length === 0 && !error && (
          <div className="loadingBox"><Loader2 size={22} className="spinIcon" /><p className="muted small">Loading your connections...</p></div>
        )}

        {specs.map((spec) => {
          const linked = byApp[spec.app];
          return (
            <div className="subCard formStack" key={spec.app}>
              <div className="rowBetween">
                <div className="rowIcon" style={{ gap: 10, minWidth: 0 }}>
                  {appIcon(spec.app)}
                  <div style={{ minWidth: 0 }}>
                    <p className="cardTitle" style={{ margin: 0 }}>{spec.label}</p>
                    {linked && <p className="muted small" style={{ wordBreak: "break-word", margin: 0 }}>{linked.credentialName}</p>}
                  </div>
                </div>
                <Pill color={linked ? "#33D6A6" : "#A0A0A0"}>{linked ? "connected" : "not connected"}</Pill>
              </div>

              {!linked && spec.googleOAuth && (
                <button className="primaryBtn" onClick={() => connectGoogle(spec)} disabled={!!busyApp} style={{ flex: "none" }}>
                  {busyApp === spec.app ? <Loader2 size={15} className="spinIcon" /> : <Plug size={15} />} Connect Google
                </button>
              )}

              {!linked && spec.creatable && (
                <button className="primaryBtn" onClick={() => setFormFor(spec)} style={{ flex: "none" }}>
                  <Plus size={15} /> Add credential
                </button>
              )}

              {!linked && !spec.creatable && !spec.googleOAuth && spec.hint && (
                <p className="hint">{spec.hint}</p>
              )}

              {linked && (
                <div className="btnRow" style={{ marginTop: 0 }}>
                  {spec.creatable && (
                    <button className="glassBtn" onClick={() => setFormFor(spec)} style={{ flex: "none" }}>
                      <Key size={15} /> Update
                    </button>
                  )}
                  {spec.googleOAuth && (
                    <button className="glassBtn" onClick={() => connectGoogle(spec)} disabled={!!busyApp} style={{ flex: "none" }}>
                      {busyApp === spec.app ? <Loader2 size={15} className="spinIcon" /> : <Plug size={15} />} Reconnect
                    </button>
                  )}
                  <button className="glassBtn" onClick={() => setRemoveApp(spec.app)} style={{ flex: "none" }}>
                    <Trash2 size={15} /> Remove
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {formFor && (
          <CredentialForm
            spec={formFor}
            existing={byApp[formFor.app]}
            onClose={() => setFormFor(null)}
            onSaved={() => load()}
          />
        )}

        <Sheet open={!!removeApp} onClose={() => (removing ? null : setRemoveApp(null))} title="Remove this connection?">
          <p className="small">Workflows using this app will stop working until you connect it again.</p>
          <div className="btnRow" style={{ marginTop: 14 }}>
            <button className="glassBtn" onClick={() => setRemoveApp(null)} disabled={removing}>Cancel</button>
            <button className="dangerBtn" onClick={remove} disabled={removing}>
              {removing ? <Loader2 size={15} className="spinIcon" /> : <Trash2 size={15} />} Remove
            </button>
          </div>
        </Sheet>
      </div>
    </div>
  );
}
