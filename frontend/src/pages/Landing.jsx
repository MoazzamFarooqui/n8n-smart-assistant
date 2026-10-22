import React, { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, Loader2, Sparkles, ShieldCheck, Workflow, GraduationCap, LogIn, UserPlus } from "lucide-react";
import { useApp } from "../context/AppContext";
import { healthApi, friendlyError, API_BASE } from "../services/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Landing() {
  const { login, register, toast } = useApp();
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [server, setServer] = useState("unknown"); // unknown | online | offline
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    healthApi.check()
      .then(() => { if (mounted.current) setServer("online"); })
      .catch(() => { if (mounted.current) setServer("offline"); });
    return () => { mounted.current = false; };
  }, []);

  function validate() {
    const e = email.trim();
    if (!EMAIL_RE.test(e)) return "Please enter a valid email address.";
    if (!password) return "Please enter your password.";
    if (mode === "signup" && password.length < 6) return "Password must be at least 6 characters.";
    return "";
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    if (busy) return;
    const problem = validate();
    if (problem) { setError(problem); return; }
    setError("");
    setBusy(true);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(email.trim(), password, name);
      toast("success", mode === "login" ? "Welcome back!" : "Account created. Welcome!");
    } catch (err) {
      if (mounted.current) setError(friendlyError(err));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  function switchMode(m) {
    setMode(m);
    setError("");
  }

  return (
    <div className="screen" style={{ paddingBottom: 30 }}>
      <div className="hero landingHero">
        <div className="heroTop">
          <div>
            <p className="heroEyebrow">n8n Smart Assistant</p>
            <h1 className="heroTitle">Describe it.<br />AI builds it.<br />n8n runs it.</h1>
            <p className="heroDesc">Type the automation you want in plain language. We generate, check, deploy and run the n8n workflow for you, and explain it if anything fails.</p>
          </div>
          <div className="heroMark">n8n</div>
        </div>
      </div>

      <div className="landingFeatures">
        <span className="tagChip"><Sparkles size={12} style={{ verticalAlign: -2 }} /> AI workflow generator</span>
        <span className="tagChip"><ShieldCheck size={12} style={{ verticalAlign: -2 }} /> Security audit</span>
        <span className="tagChip"><Workflow size={12} style={{ verticalAlign: -2 }} /> One-tap deploy</span>
        <span className="tagChip"><GraduationCap size={12} style={{ verticalAlign: -2 }} /> Learn n8n</span>
      </div>

      <div className="subCard authCard">
        <div className="segment" style={{ marginBottom: 14 }}>
          <button type="button" className={"segBtn" + (mode === "login" ? " active" : "")} onClick={() => switchMode("login")}>Log in</button>
          <button type="button" className={"segBtn" + (mode === "signup" ? " active" : "")} onClick={() => switchMode("signup")}>Sign up</button>
        </div>

        <form className="formStack" onSubmit={onSubmit} noValidate>
          {mode === "signup" && (
            <div className="field">
              <label className="fieldLabel" htmlFor="auth-name">Name (optional)</label>
              <input id="auth-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" maxLength={100} />
            </div>
          )}
          <div className="field">
            <label className="fieldLabel" htmlFor="auth-email">Email</label>
            <input id="auth-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" maxLength={255} />
          </div>
          <div className="field">
            <label className="fieldLabel" htmlFor="auth-pw">Password</label>
            <div className="inputRow">
              <input id="auth-pw" className="input" type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "signup" ? "At least 6 characters" : "Your password"} autoComplete={mode === "login" ? "current-password" : "new-password"} />
              <button type="button" className="eyeBtn" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "Hide password" : "Show password"}>
                {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          {error && <div className="inlineError" role="alert">{error}</div>}

          <button className="primaryBtn" type="submit" disabled={busy} style={{ flex: "none" }}>
            {busy ? <Loader2 size={16} className="spinIcon" /> : mode === "login" ? <LogIn size={16} /> : <UserPlus size={16} />}
            {busy ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        <div className="statusLine">
          <span className={"statusDot " + (server === "online" ? "statusOnline" : server === "offline" ? "statusOffline" : "statusUnknown")} />
          {server === "online" ? "Backend connected" : server === "offline" ? "Backend not reachable at " + API_BASE : "Checking backend..."}
        </div>
      </div>
    </div>
  );
}
