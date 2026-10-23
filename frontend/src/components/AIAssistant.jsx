
import React, { useState, useRef, useEffect } from "react";
import {
  Bot, X, SendHorizontal, Loader2, MessagesSquare,
  Plus, History, Trash2
} from "lucide-react";
import { aiApi, chatApi, friendlyError } from "../services/api";
import { AIText } from "./Sheet";

const GREETING =
  "Hey! I am your n8n Mentor. Ask me about nodes, workflows, AI agents, and integrations.";

const makeChat = () => ({
  id: "draft-" + Date.now() + Math.random().toString(16).slice(2),
  sessionId: null,
  title: "New chat",
  updatedAt: Date.now(),
  loaded: true,
  messages: [{ role: "assistant", content: GREETING, isGreeting: true }],
});

const QUICK_PROMPTS = [
  "What is n8n?",
  "Explain Webhooks.",
  "Design a workflow for restaurants.",
  "Explain AI Agents.",
  "Teach me n8n from scratch.",
];

export function AIAssistant({ open, onClose }) {
  const [conversations, setConversations] = useState(() => [makeChat()]);
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  const active = conversations.find((c) => c.id === activeId)
    || conversations[0];

  const messages = active?.messages || [];

  // Load saved sessions from the backend whenever the assistant opens.
  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function loadHistory() {
      try {
        const result = await chatApi.list();
        if (cancelled) return;

        const savedChats = (result.sessions || []).map((session) => ({
          id: String(session.id),
          sessionId: session.id,
          title: session.title || "New chat",
          updatedAt: session.updated_at
            ? new Date(session.updated_at).getTime()
            : Date.now(),
          loaded: false,
          messages: [
            { role: "assistant", content: GREETING, isGreeting: true },
          ],
        }));

        setConversations((previous) => {
          const drafts = previous.filter((c) => !c.sessionId);
          const all = [...drafts, ...savedChats];
          return all.length ? all : [makeChat()];
        });

        setActiveId((previousId) => {
          const existing = [...savedChats];
          if (previousId && existing.some((c) => c.id === previousId)) {
            return previousId;
          }

          const currentDraft = conversations.find(
            (c) => !c.sessionId && c.id === previousId
          );

          return currentDraft?.id || savedChats[0]?.id || previousId
            || "new-chat";
        });
      } catch (error) {
        console.error("Could not load chat history:", error);
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [open]);

  // Ensure an active draft exists when there are no saved chats.
  useEffect(() => {
    if (activeId === "new-chat") {
      const draft = makeChat();
      setConversations((items) => [draft, ...items]);
      setActiveId(draft.id);
    } else if (!activeId && conversations.length) {
      setActiveId(conversations[0].id);
    }
  }, [activeId, conversations]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, open, activeId]);

  function startNewChat() {
    if (loading) return;
    const chat = makeChat();
    setConversations((items) => [chat, ...items]);
    setActiveId(chat.id);
    setInput("");
  }

  async function selectChat(chat) {
    if (loading) return;
    setActiveId(chat.id);
    setInput("");

    if (!chat.sessionId || chat.loaded) return;

    setLoading(true);
    try {
      const result = await chatApi.messages(chat.sessionId);

      setConversations((items) =>
        items.map((item) =>
          item.id === chat.id
            ? {
                ...item,
                loaded: true,
                messages: result.messages?.length
                  ? result.messages.map((m) => ({
                      role: m.role,
                      content: m.content,
                    }))
                  : [
                      {
                        role: "assistant",
                        content: GREETING,
                        isGreeting: true,
                      },
                    ],
              }
            : item
        )
      );
    } catch (error) {
      setConversations((items) =>
        items.map((item) =>
          item.id === chat.id
            ? {
                ...item,
                loaded: true,
                messages: [
                  {
                    role: "assistant",
                    content: friendlyError(error),
                    isError: true,
                  },
                ],
              }
            : item
        )
      );
    } finally {
      setLoading(false);
    }
  }

  async function deleteChat(chat, event) {
    event.stopPropagation();
    if (loading) return;

    try {
      if (chat.sessionId) {
        await chatApi.remove(chat.sessionId);
      }

      const remaining = conversations.filter((c) => c.id !== chat.id);

      if (remaining.length) {
        setConversations(remaining);
        if (activeId === chat.id) setActiveId(remaining[0].id);
      } else {
        const fresh = makeChat();
        setConversations([fresh]);
        setActiveId(fresh.id);
      }
    } catch (error) {
      window.alert(friendlyError(error));
    }
  }

  async function send(text) {
    const clean = text.trim();
    if (!clean || loading || !active) return;

    const chat = active;
    const id = chat.id;

    const history = messages
      .filter((m) => !m.isGreeting && !m.isError)
      .slice(-12)
      .map(({ role, content }) => ({ role, content }));

    const nextMessages = [
      ...messages,
      { role: "user", content: clean },
    ];

    const title = chat.title === "New chat"
      ? clean.slice(0, 34)
      : chat.title;

    setConversations((items) =>
      items.map((c) =>
        c.id === id
          ? { ...c, messages: nextMessages, title, updatedAt: Date.now() }
          : c
      )
    );

    setInput("");
    setLoading(true);

    try {
      const result = await aiApi.chat({
        message: clean,
        history,
        sessionId: chat.sessionId || undefined,
      });

      const savedId = result.sessionId
        ? String(result.sessionId)
        : id;

      setConversations((items) =>
        items
          .map((c) =>
            c.id === id
              ? {
                  ...c,
                  id: savedId,
                  sessionId: result.sessionId ?? c.sessionId,
                  loaded: true,
                  title,
                  updatedAt: Date.now(),
                  messages: [
                    ...nextMessages,
                    { role: "assistant", content: result.response },
                  ],
                }
              : c
          )
          .sort((a, b) => b.updatedAt - a.updatedAt)
      );

      setActiveId(savedId);
    } catch (error) {
      setConversations((items) =>
        items.map((c) =>
          c.id === id
            ? {
                ...c,
                messages: [
                  ...nextMessages,
                  {
                    role: "assistant",
                    isError: true,
                    content: friendlyError(error),
                  },
                ],
              }
            : c
        )
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={"chatOverlay" + (open ? " chatOpen" : "")}
      aria-hidden={!open}
    >
      <div
        className="chatPanel"
        role="dialog"
        aria-modal="true"
        aria-label="n8n AI Mentor"
      >
        <div className="chatHeader">
          <div className="rowIcon">
            <div
              className="iconChip"
              style={{ background: "#FF7A0022", color: "#FF7A00" }}
            >
              <Bot size={18} />
            </div>
            <div>
              <p className="cardTitle" style={{ margin: 0 }}>n8n Mentor</p>
              <p className="muted small" style={{ margin: 0 }}>
                Your AI learning guide
              </p>
            </div>
          </div>

          <div className="chatHeaderActions">
            <button
              className="chatToolBtn"
              onClick={startNewChat}
              disabled={loading}
              type="button"
            >
              <Plus size={15} /> New chat
            </button>
            <button
              className="iconBtn"
              onClick={onClose}
              aria-label="Close chat"
              type="button"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="chatWorkspace">
          <aside className="chatHistory">
            <div className="chatHistoryTitle">
              <History size={14} /> Chat history
            </div>

            {conversations.map((chat) => (
              <div
                key={chat.id}
                className={
                  "chatHistoryItem" +
                  (chat.id === active?.id ? " active" : "")
                }
              >
                <button
                  type="button"
                  className="chatHistorySelect"
                  onClick={() => selectChat(chat)}
                  disabled={loading}
                >
                  {chat.title || "New chat"}
                </button>
                <button
                  type="button"
                  className="chatHistoryDelete"
                  onClick={(event) => deleteChat(chat, event)}
                  aria-label="Delete chat"
                  disabled={loading}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </aside>

          <div className="chatConversation">
            <div className="chatBody" ref={scrollRef}>
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={
                    "bubbleRow" +
                    (message.role === "user" ? " bubbleRowUser" : "")
                  }
                >
                  <div
                    className={
                      "bubble " +
                      (message.role === "user" ? "bubbleUser" : "bubbleAI")
                    }
                  >
                    {message.role === "user" || message.isError
                      ? message.content
                      : <AIText text={message.content} />}
                  </div>
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
                  {QUICK_PROMPTS.map((prompt, index) => (
                    <button
                      key={index}
                      className="quickPromptChip"
                      onClick={() => send(prompt)}
                      type="button"
                      disabled={loading}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <form
              className="chatInputRow"
              onSubmit={(event) => {
                event.preventDefault();
                send(input);
              }}
            >
              <input
                className="chatInput"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask about nodes, workflows, AI agents..."
                maxLength={4000}
              />
              <button
                className="chatSendBtn"
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="Send"
              >
                {loading
                  ? <Loader2 size={18} className="spinIcon" />
                  : <SendHorizontal size={18} />}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AIFab({ onClick, hidden }) {
  if (hidden) return null;

  return (
    <button
      className="aiFab"
      onClick={onClick}
      aria-label="Open AI Mentor"
    >
      <MessagesSquare size={22} />
    </button>
  );
}
