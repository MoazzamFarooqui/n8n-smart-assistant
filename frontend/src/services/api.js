// Central API layer: every call to our Express backend goes through here.
// Handles: base URL, JWT header, timeouts, cancellation, and friendly errors.

const RAW_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
export const API_BASE = String(RAW_BASE).replace(/\/+$/, "");

const TOKEN_KEY = "n8nsa_token";

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* storage unavailable */ }
}
export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
}

// Called when a request that needed a token comes back 401 (expired/invalid token).
let unauthorizedHandler = null;
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = typeof fn === "function" ? fn : null;
}

export class ApiError extends Error {
  constructor(message, { status = 0, kind = "http", data = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.kind = kind; // "http" | "network" | "timeout" | "aborted"
    this.data = data;
  }
}

function formatValidation(errors) {
  try {
    const parts = [];
    if (Array.isArray(errors?.formErrors)) parts.push(...errors.formErrors);
    const fields = errors?.fieldErrors || {};
    Object.keys(fields).forEach((field) => {
      const msgs = fields[field];
      if (Array.isArray(msgs) && msgs.length) parts.push(field + ": " + msgs.join(", "));
    });
    return parts.join(" | ");
  } catch {
    return "";
  }
}

function buildMessage(status, data) {
  const serverMsg = data && typeof data.error === "string" ? data.error : "";
  const details = data && typeof data.details === "string" ? data.details : "";
  const validation = data && data.errors ? formatValidation(data.errors) : "";

  if (status === 400) return validation || serverMsg || "Invalid request. Please check your input.";
  if (status === 401) return serverMsg || "Your session has expired. Please log in again.";
  if (status === 403) return serverMsg || "You are not allowed to do that.";
  if (status === 404) return serverMsg || "We could not find what you asked for.";
  if (status === 409) return serverMsg || "That action conflicts with the current state.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status === 502 || status === 503 || status === 504) {
    return serverMsg || "A service we depend on (AI or n8n) is busy or unavailable. Please try again shortly.";
  }
  if (status >= 500) {
    return (serverMsg ? serverMsg + (details ? " (" + details + ")" : "") : "Server error. Please try again.");
  }
  return serverMsg || "Something went wrong (" + status + ").";
}

function buildUrl(path, query) {
  let url = API_BASE + path;
  if (query) {
    const usp = new URLSearchParams();
    Object.keys(query).forEach((k) => {
      const v = query[k];
      if (v !== undefined && v !== null && v !== "") usp.append(k, String(v));
    });
    const qs = usp.toString();
    if (qs) url += "?" + qs;
  }
  return url;
}

async function request(path, opts = {}) {
  const {
    method = "GET",
    body,
    query,
    auth = true,
    handle401 = true,
    timeoutMs = 60000,
    signal,
  } = opts;

  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (auth && token) headers.Authorization = "Bearer " + token;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    const res = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    let data = null;
    const text = await res.text();
    if (text) {
      try { data = JSON.parse(text); } catch { data = null; }
    }

    if (!res.ok) {
      if (res.status === 401 && auth && token && handle401 && unauthorizedHandler) {
        unauthorizedHandler();
      }
      throw new ApiError(buildMessage(res.status, data), { status: res.status, kind: "http", data });
    }
    return data === null ? {} : data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (timedOut) {
      throw new ApiError("The request took too long. The server may be busy, please try again.", { kind: "timeout" });
    }
    if (err && err.name === "AbortError") {
      throw new ApiError("Request cancelled.", { kind: "aborted" });
    }
    throw new ApiError("Cannot reach the server at " + API_BASE + ". Make sure the backend is running.", { kind: "network" });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

export function friendlyError(err) {
  if (err instanceof ApiError) return err.message;
  return "Something went wrong. Please try again.";
}

const AI_TIMEOUT = 120000; // Gemini can fall back across models and take a while

async function aiText(path, body) {
  const data = await request(path, { method: "POST", body, timeoutMs: AI_TIMEOUT });
  if (!data || typeof data.response !== "string" || !data.response.trim()) {
    throw new ApiError("The AI returned an empty answer. Please try again.", { kind: "http" });
  }
  return data.response;
}

export const healthApi = {
  check: () => request("/health", { auth: false, timeoutMs: 6000 }),
};

export const authApi = {
  register: (body) => request("/auth/register", { method: "POST", body, auth: false, timeoutMs: 20000 }),
  login: (body) => request("/auth/login", { method: "POST", body, auth: false, timeoutMs: 20000 }),
  me: () => request("/auth/me", { handle401: false, timeoutMs: 15000 }),
};

export const aiApi = {
  chat: ({ message, history }) => aiText("/ai/chat", { message, history }),
  explainNode: ({ nodeType, nodeName }) => aiText("/ai/explain-node", { nodeType, nodeName }),
  explainWorkflow: (workflowJson) => aiText("/ai/explain-workflow", { workflowJson }),
  validateWorkflow: (workflowJson) => aiText("/ai/validate-workflow", { workflowJson }),
  translateError: ({ error, context }) => aiText("/ai/translate-error", context ? { error, context } : { error }),
  compatibility: ({ sourceNode, targetNode }) => aiText("/ai/compatibility", { sourceNode, targetNode }),
  securityAudit: (workflowJson) => aiText("/ai/security-audit", { workflowJson }),
};

export const workflowApi = {
  generateAndDeploy: (prompt, signal) =>
    request("/workflows/generate-and-deploy", { method: "POST", body: { prompt }, timeoutMs: 240000, signal }),
  list: (params) => request("/workflows", { query: params, timeoutMs: 30000 }),
  get: (id) => request("/workflows/" + encodeURIComponent(id), { timeoutMs: 30000 }),
  execute: (id, payload) =>
    request("/workflows/" + encodeURIComponent(id) + "/execute", { method: "POST", body: payload ? { payload } : {}, timeoutMs: 120000 }),
  activate: (id) => request("/workflows/" + encodeURIComponent(id) + "/activate", { method: "PATCH", timeoutMs: 30000 }),
  deactivate: (id) => request("/workflows/" + encodeURIComponent(id) + "/deactivate", { method: "PATCH", timeoutMs: 30000 }),
  remove: (id) => request("/workflows/" + encodeURIComponent(id), { method: "DELETE", timeoutMs: 30000 }),
};
