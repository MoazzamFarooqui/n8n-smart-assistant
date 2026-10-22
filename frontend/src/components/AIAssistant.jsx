import React, { useState, useRef, useEffect } from "react";
import { Bot, X, SendHorizontal, Loader2, MessagesSquare } from "lucide-react";
import { aiApi, friendlyError } from "../services/api";
import { AIText } from "./Sheet";

const QUICK_PROMPTS = [
  "What is n8n?",
  "Explain Webhooks.",
  "Design a workflow for restaurants.",
  "Explain AI Agents.",
  "Teach me n8n from scratch.",
];

export function AIAssistant({ open, onClose }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hey! I'm your n8n Mentor \uD83D\uDC4B Ask me anything about nodes, workflows, AI agents, integrations, or how to start freelancing with n8n.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading, open]);

  async function send(text) {
    const clean = text.trim();
    if (!clean || loading) return;
    // Previous turns (skip the greeting at index 0) so the mentor keeps context
    const history = messages
      .slice(1)
      .filter((m) => !m.isError)
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages([...messages, { role: "user", content: clean }]);
    setInput("");
    setLoading(true);
    try {
      const answer = await aiApi.chat({ message: clean, history });
      setMessages((m) => [...m, { role: "assistant", content: answer }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", isError: true, content: friendlyError(err) },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={"chatOverlay" + (open ? " chatOpen" : "")}>
      <div className="chatPanel">
        <div className="chatHeader">
          <div className="rowIcon">
            <div className="iconChip" style={{ background: "#FF7A0022", color: "#FF7A00" }}>
              <Bot size={18} />
            </div>
            <div>
              <p className="cardTitle" style={{ margin: 0 }}>n8n Mentor</p>
              <p className="muted small" style={{ margin: 0 }}>Your AI learning guide</p>
            </div>
          </div>
          <button className="iconBtn" onClick={onClose} aria-label="Close chat">
            <X size={18} />
          </button>
        </div>

        <div className="chatBody" ref={scrollRef}>
          {messages.map((m, i) => (
            <div key={i} className={"bubbleRow" + (m.role === "user" ? " bubbleRowUser" : "")}>
              <div className={"bubble " + (m.role === "user" ? "bubbleUser" : "bubbleAI")}>{m.role === "user" || m.isError ? m.content : <AIText text={m.content} />}</div>
            </div>
          ))}
          {loading && (
            <div className="bubbleRow">
              <div className="bubble bubbleAI typingBubble">
                <span></span><span></span><span></span>
              </div>
            </div>
          )}
          {messages.length === 1 && (
            <div className="quickPromptWrap">
              {QUICK_PROMPTS.map((q, i) => (
                <button key={i} className="quickPromptChip" onClick={() => send(q)}>{q}</button>
              ))}
            </div>
          )}
        </div>

        <form className="chatInputRow" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <input
            className="chatInput"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about nodes, workflows, AI agents..."
            maxLength={4000}
          />
          <button className="chatSendBtn" type="submit" disabled={loading || !input.trim()} aria-label="Send">
            {loading ? <Loader2 size={18} className="spinIcon" /> : <SendHorizontal size={18} />}
          </button>
        </form>
      </div>
    </div>
  );
}

export function AIFab({ onClick, hidden }) {
  if (hidden) return null;
  return (
    <button className="aiFab" onClick={onClick} aria-label="Open AI Mentor">
      <MessagesSquare size={22} />
    </button>
  );
}
