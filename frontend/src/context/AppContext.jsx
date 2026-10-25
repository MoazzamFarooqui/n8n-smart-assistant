import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { authApi, getToken, setToken, clearToken, setUnauthorizedHandler, ApiError } from "../services/api";

const AppContext = createContext(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

export function AppProvider({ children }) {
  // status: checking | guest | authed | offline
  const [status, setStatus] = useState(getToken() ? "checking" : "guest");
  const [user, setUser] = useState(null);
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);

  const dismissToast = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((type, message, ms = 4500) => {
    if (!message) return;
    const id = ++toastId.current;
    setToasts((list) => {
      if (list.some((t) => t.message === message)) return list; // no duplicates
      return [...list.slice(-2), { id, type, message }];
    });
    setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, ms);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setStatus("guest");
  }, []);

  // Global handler: token expired/invalid -> back to login with a message
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearToken();
      setUser(null);
      setStatus("guest");
      toast("error", "Your session has expired. Please log in again.");
    });
    return () => setUnauthorizedHandler(null);
  }, [toast]);

  const bootCheck = useCallback(async () => {
    if (!getToken()) {
      setStatus("guest");
      return;
    }
    setStatus("checking");
    try {
      const data = await authApi.me();
      if (!data || !data.user) throw new ApiError("Invalid session", { status: 401 });
      setUser(data.user);
      setStatus("authed");
    } catch (err) {
      if (err instanceof ApiError && (err.kind === "network" || err.kind === "timeout")) {
        setStatus("offline"); // keep the token, the server is just unreachable
      } else {
        clearToken();
        setUser(null);
        setStatus("guest");
      }
    }
  }, []);

  useEffect(() => {
    bootCheck();
  }, [bootCheck]);

  const finishAuth = useCallback((data) => {
    if (!data || typeof data.token !== "string" || !data.user) {
      throw new ApiError("Unexpected response from the server. Please try again.");
    }
    setToken(data.token);
    setUser(data.user);
    setStatus("authed");
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await authApi.login({ email, password });
    finishAuth(data);
  }, [finishAuth]);

  const register = useCallback(async (email, password, name) => {
    const body = { email, password };
    if (name && name.trim()) body.name = name.trim();
    const data = await authApi.register(body);
    finishAuth(data);
  }, [finishAuth]);

  const value = useMemo(
    () => ({ status, user, toasts, toast, dismissToast, login, register, logout, retryBoot: bootCheck }),
    [status, user, toasts, toast, dismissToast, login, register, logout, bootCheck]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function ToastHost() {
  const { toasts, dismissToast } = useApp();
  if (!toasts.length) return null;
  return (
    <div className="toastHost" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={"toast toast-" + t.type} role="status">
          {t.type === "success" ? <CheckCircle2 size={16} /> : t.type === "error" ? <XCircle size={16} /> : <Info size={16} />}
          <span className="toastMsg">{t.message}</span>
          <button className="toastClose" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
