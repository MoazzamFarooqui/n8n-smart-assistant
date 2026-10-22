import React, { useState, useRef, useEffect } from "react";
import { Bot, X, SendHorizontal, Loader2, MessagesSquare } from "lucide-react";
import { AI_MENTOR_SYSTEM_PROMPT } from "../data/systemPrompt";

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_MODEL = "llama-3.3-70b-versatile";

const QUICK_PROMPTS = [
  "What is n8n?",
  "Explain Webhooks.",
  "Design a workflow for restaurants.",
  "Explain AI Agents.",
  "Teach me n8n from scratch.",
];

const NO_KEY_MESSAGE =
  "I'm not connected to an AI provider yet. Add your Groq API key to a .env file as VITE_GROQ_API_KEY=your_key_here, restart the dev server, and I'll be ready to chat. See the README for the two-minute setup.";

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
    if (!text.trim() || loading) return;
    const next = [...messages, { role: "user", content: text.trim() }];
    setMessages(next);
    setInput("");

    if (!GROQ_API_KEY) {
      setMessages((m) => [...m, { role: "assistant", content: NO_KEY_MESSAGE }]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: AI_MENTOR_SYSTEM_PROMPT },
            ...next.map((m) => ({ role: m.role, content: m.content })),
          ],
          max_tokens: 1000,
        }),
      });
      if (!response.ok) throw new Error(`Groq API error: ${response.status}`);
      const data = await response.json();
      const textOut =
        data?.choices?.[0]?.message?.content?.trim() ||
        "Sorry, I couldn't put together an answer just then — mind trying again?";
      setMessages((m) => [...m, { role: "assistant", content: textOut }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "I hit a connection hiccup talking to the AI provider. Please try again in a moment." },
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
              <div className={"bubble " + (m.role === "user" ? "bubbleUser" : "bubbleAI")}>{m.content}</div>
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
