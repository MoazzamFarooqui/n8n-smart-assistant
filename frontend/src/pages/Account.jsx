import React, { useState } from "react";
import { User, LogOut, Info, Loader2, RefreshCw, Key } from "lucide-react";
import { TopBar } from "../components/ui";
import { useApp } from "../context/AppContext";
import { healthApi, friendlyError, API_BASE } from "../services/api";

export default function Account({ go }) {
  const { user, logout, toast } = useApp();
  const [checking, setChecking] = useState(false);
  const [health, setHealth] = useState("");

  async function checkServer() {
    if (checking) return;
    setChecking(true);
    try {
      await healthApi.check();
      setHealth("online");
      toast("success", "Backend is reachable.", 2500);
    } catch (err) {
      setHealth("offline");
      toast("error", friendlyError(err));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="screen">
      <TopBar title="Account" />
      <div className="listPad">
        <div className="subCard formStack">
          <div className="rowIcon">
            <div className="iconChip" style={{ background: "#FF7A0022", color: "#FF7A00" }}><User size={18} /></div>
            <div style={{ minWidth: 0 }}>
              <p className="cardTitle" style={{ wordBreak: "break-word" }}>{(user && user.name) || "Signed in"}</p>
              <p className="muted small" style={{ wordBreak: "break-all" }}>{user && user.email}</p>
            </div>
          </div>
        </div>

        <div className="subCard formStack">
          <p className="subCardTitle">Backend</p>
          <p className="muted small" style={{ wordBreak: "break-all" }}>{API_BASE}</p>
          <button className="glassBtn" onClick={checkServer} disabled={checking} style={{ flex: "none" }}>
            {checking ? <Loader2 size={15} className="spinIcon" /> : <RefreshCw size={15} />} Check connection
          </button>
          {health && <p className="hint">{health === "online" ? "Connected." : "Not reachable right now."}</p>}
        </div>

        <div className="subCard formStack">
          <p className="subCardTitle">App connections</p>
          <p className="muted small">Connect Google, Slack and other apps your workflows use.</p>
          <button className="glassBtn" onClick={() => go("credentials")} style={{ flex: "none" }}>
            <Key size={15} /> Manage credentials
          </button>
        </div>

        <button className="glassBtn" onClick={() => go("about")} style={{ flex: "none" }}><Info size={15} /> About this app</button>
        <button className="dangerBtn" onClick={logout} style={{ flex: "none" }}><LogOut size={15} /> Log out</button>
      </div>
    </div>
  );
}
