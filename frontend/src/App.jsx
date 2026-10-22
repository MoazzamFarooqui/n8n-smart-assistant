import React, { useState, useMemo } from "react";
import { Home, Boxes, Workflow, Sparkles, Wrench, User, BookOpen, Loader2, WifiOff } from "lucide-react";

import Dashboard from "./pages/Dashboard";
import { NodesList, NodeDetail } from "./pages/Nodes";
import { IntegrationsList, IntegrationDetail } from "./pages/Integrations";
import { WorkflowsList, WorkflowDetail } from "./pages/Workflows";
import { Learn, LessonDetail } from "./pages/Learn";
import { RoadmapPage, BusinessIdeasPage, CareerPage, LatestFeaturesPage } from "./pages/Extras";
import About from "./pages/About";
import { AIFab, AIAssistant } from "./components/AIAssistant";
import Landing from "./pages/Landing";
import Generator from "./pages/Generator";
import { MyWorkflows, MyWorkflowDetail } from "./pages/MyWorkflows";
import { ToolsHub, ToolPage } from "./pages/AITools";
import Account from "./pages/Account";
import { TopBar } from "./components/ui";
import { useApp, ToastHost } from "./context/AppContext";

import { CATEGORY_COLOR, NODES } from "./data/nodes";
import { INTEGRATIONS } from "./data/integrations";
import { WORKFLOWS } from "./data/workflows";
import { LESSONS } from "./data/lessons";

const NAV_ITEMS = [
  { key: "dashboard", label: "Home", icon: Home },
  { key: "nodes", label: "Nodes", icon: Boxes },
  { key: "generate", label: "Build", icon: Sparkles },
  { key: "myworkflows", label: "My Flows", icon: Workflow },
  { key: "tools", label: "AI Tools", icon: Wrench },
  { key: "account", label: "Account", icon: User },
];

// Which bottom-nav tab should be highlighted for each page
const TAB_OF = {
  dashboard: "dashboard",
  nodes: "nodes", nodeDetail: "nodes",
  generate: "generate",
  myworkflows: "myworkflows", myworkflowDetail: "myworkflows",
  tools: "tools", tool: "tools",
  account: "account", about: "account",
};

function NotFound({ goBack }) {
  return (
    <div className="screen">
      <TopBar title="Not found" onBack={goBack} />
      <div className="emptyState"><BookOpen size={26} /><p>We could not find that page.</p></div>
    </div>
  );
}

function MainApp() {
  const [page, setPage] = useState("dashboard");
  const [param, setParam] = useState(null);
  const [history, setHistory] = useState([]);
  const [query, setQuery] = useState("");
  const [aiOpen, setAiOpen] = useState(false);

  const filteredNodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return NODES;
    return NODES.filter((n) => n.name.toLowerCase().includes(q) || n.category.toLowerCase().includes(q));
  }, [query]);

  const filteredAll = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results = [];
    NODES.forEach((n) => {
      if (n.name.toLowerCase().includes(q) || n.category.toLowerCase().includes(q)) {
        results.push({ type: "node", id: n.id, page: "nodeDetail", title: n.name, subtitle: "Node · " + n.category, icon: n.icon, color: CATEGORY_COLOR[n.category] });
      }
    });
    INTEGRATIONS.forEach((it) => {
      if (it.name.toLowerCase().includes(q)) {
        results.push({ type: "integration", id: it.id, page: "integrationDetail", title: it.name, subtitle: "Integration guide", icon: it.icon, color: it.color });
      }
    });
    WORKFLOWS.forEach((w) => {
      if (w.title.toLowerCase().includes(q) || w.tagline.toLowerCase().includes(q)) {
        results.push({ type: "workflow", id: w.id, page: "workflowDetail", title: w.title, subtitle: "Workflow template", icon: Workflow, color: "#33D6A6" });
      }
    });
    LESSONS.forEach((l) => {
      if (l.title.toLowerCase().includes(q)) {
        results.push({ type: "lesson", id: l.id, page: "lessonDetail", title: l.title, subtitle: "Lesson", icon: BookOpen, color: "#FF7A00" });
      }
    });
    return results;
  }, [query]);

  function go(target, p = null) {
    setHistory((h) => [...h, { page, param }]);
    setPage(target);
    setParam(p);
  }

  function goBack() {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setPage(prev.page);
      setParam(prev.param);
      return h.slice(0, -1);
    });
  }

  function goTab(tabKey) {
    setHistory([]);
    setPage(tabKey);
    setParam(null);
    if (tabKey !== "dashboard" && tabKey !== "nodes") setQuery("");
  }

  const activeTab = TAB_OF[page] || null;

  let content;
  if (page === "dashboard") content = <Dashboard go={go} query={query} setQuery={setQuery} filteredNodes={filteredNodes} filteredAll={filteredAll} openAI={() => setAiOpen(true)} />;
  else if (page === "nodes") content = <NodesList go={go} query={query} setQuery={setQuery} filteredNodes={filteredNodes} />;
  else if (page === "nodeDetail") content = NODES.find((n) => n.id === param) ? <NodeDetail node={NODES.find((n) => n.id === param)} goBack={goBack} /> : <NotFound goBack={goBack} />;
  else if (page === "integrations") content = <IntegrationsList go={go} />;
  else if (page === "integrationDetail") content = INTEGRATIONS.find((i) => i.id === param) ? <IntegrationDetail integ={INTEGRATIONS.find((i) => i.id === param)} goBack={goBack} /> : <NotFound goBack={goBack} />;
  else if (page === "workflows") content = <WorkflowsList go={go} />;
  else if (page === "workflowDetail") content = WORKFLOWS.find((w) => w.id === param) ? <WorkflowDetail wf={WORKFLOWS.find((w) => w.id === param)} goBack={goBack} /> : <NotFound goBack={goBack} />;
  else if (page === "learn") content = <Learn go={go} />;
  else if (page === "lessonDetail") content = LESSONS.find((l) => l.id === param) ? <LessonDetail lesson={LESSONS.find((l) => l.id === param)} goBack={goBack} /> : <NotFound goBack={goBack} />;
  else if (page === "roadmap") content = <RoadmapPage goBack={goBack} />;
  else if (page === "businessIdeas") content = <BusinessIdeasPage goBack={goBack} />;
  else if (page === "career") content = <CareerPage goBack={goBack} />;
  else if (page === "latestFeatures") content = <LatestFeaturesPage goBack={goBack} />;
  else if (page === "about") content = <About />;
  else if (page === "generate") content = <Generator go={go} />;
  else if (page === "myworkflows") content = <MyWorkflows go={go} />;
  else if (page === "myworkflowDetail") content = <MyWorkflowDetail id={param} goBack={goBack} go={go} />;
  else if (page === "tools") content = <ToolsHub go={go} />;
  else if (page === "tool") content = <ToolPage toolKey={param} goBack={goBack} />;
  else if (page === "account") content = <Account go={go} />;
  else content = <NotFound goBack={goBack} />;

  return (
    <>
      <React.Fragment key={page + ":" + String(param)}>{content}</React.Fragment>

      <div className="bottomNav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={"navItem" + (activeTab === item.key ? " active" : "")}
            onClick={() => goTab(item.key)}
          >
            <item.icon size={20} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <AIFab onClick={() => setAiOpen(true)} hidden={aiOpen} />
      <AIAssistant open={aiOpen} onClose={() => setAiOpen(false)} />
    </>
  );
}

function Splash() {
  return (
    <div className="splash">
      <div className="heroMark">n8n</div>
      <Loader2 size={22} className="spinIcon" style={{ color: "var(--accent)" }} />
      <p className="muted small">Checking your session...</p>
    </div>
  );
}

function OfflineScreen() {
  const { retryBoot, logout } = useApp();
  return (
    <div className="splash">
      <WifiOff size={30} style={{ color: "var(--accent)" }} />
      <p className="cardTitle">Cannot reach the server</p>
      <p className="muted small">Make sure the backend is running (npm run dev) and MySQL is started, then try again.</p>
      <div className="btnRow" style={{ width: "100%", maxWidth: 280 }}>
        <button className="primaryBtn" onClick={retryBoot}>Try again</button>
        <button className="glassBtn" onClick={logout}>Log out</button>
      </div>
    </div>
  );
}

export default function App() {
  const { status } = useApp();
  return (
    <div className="app">
      {status === "checking" && <Splash />}
      {status === "offline" && <OfflineScreen />}
      {status === "guest" && <Landing />}
      {status === "authed" && <MainApp />}
      <ToastHost />
    </div>
  );
}
