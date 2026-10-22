import React from "react";
import {
  Search, ChevronRight, HelpCircle, Boxes, Plug, Workflow, GraduationCap,
  Compass, TrendingUp, Rocket, Briefcase, Sparkles, Sparkle, Map,
  MessagesSquare, Zap, Phone,
} from "lucide-react";
import { Card, Section } from "../components/ui";
import { CATEGORY_COLOR, NODES } from "../data/nodes";
import { INTEGRATIONS } from "../data/integrations";
import { WORKFLOWS } from "../data/workflows";
import { LESSONS } from "../data/lessons";

export default function Dashboard({ go, query, setQuery, filteredNodes, filteredAll, openAI }) {
  const searching = query.trim().length > 0;
  return (
    <div className="screen">
      <div className="hero">
        <div className="heroTop">
          <div>
            <p className="heroEyebrow">Your AI-powered n8n mentor</p>
            <h1 className="heroTitle">Learn n8n.<br />Build with AI.</h1>
            <p className="heroDesc">A friendly companion for learning n8n from zero — nodes, integrations, real workflows, and an AI mentor to answer anything you're stuck on.</p>
          </div>
          <div className="heroMark">n8n</div>
        </div>
        <div className="heroBtnRow">
          <button className="primaryBtn" onClick={() => go("nodes")}>
            <Rocket size={16} /> Start Learning
          </button>
          <button className="glassBtn" onClick={openAI}>
            <Sparkle size={16} /> Ask AI Mentor
          </button>
        </div>
        <div className="searchWrap">
          <Search size={18} className="searchIcon" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search nodes, integrations, workflows, lessons..."
            className="searchInput"
          />
        </div>
      </div>

      {searching ? (
        <div className="listPad">
          <p className="muted small">{filteredAll.length} result{filteredAll.length === 1 ? "" : "s"}</p>
          {filteredAll.map((r) => (
            <Card key={r.type + r.id} onClick={() => go(r.page, r.id)}>
              <div className="rowBetween">
                <div className="rowIcon">
                  <div className="iconChip" style={{ background: r.color + "22", color: r.color }}>
                    <r.icon size={18} />
                  </div>
                  <div>
                    <p className="cardTitle">{r.title}</p>
                    <p className="muted small">{r.subtitle}</p>
                  </div>
                </div>
                <ChevronRight size={18} className="muted" />
              </div>
            </Card>
          ))}
          {filteredAll.length === 0 && (
            <div className="emptyState">
              <HelpCircle size={26} />
              <p>Nothing matches that search yet. Try a shorter word, like "mail" or "sheet".</p>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="statRow statRowScroll">
            <div className="statCard">
              <p className="statNum">{NODES.length}</p>
              <p className="muted small">Nodes</p>
            </div>
            <div className="statCard">
              <p className="statNum">{INTEGRATIONS.length}</p>
              <p className="muted small">Integrations</p>
            </div>
            <div className="statCard">
              <p className="statNum">{WORKFLOWS.length}</p>
              <p className="muted small">Workflow Guides</p>
            </div>
            <div className="statCard">
              <p className="statNum">{LESSONS.length}</p>
              <p className="muted small">Articles</p>
            </div>
            <div className="statCard statCardAccent" onClick={openAI}>
              <Sparkle size={18} />
              <p className="muted small">Ask AI</p>
            </div>
          </div>

          <Section title="Explore" icon={Compass}>
            <div className="grid2">
              <div className="exploreTile" onClick={() => go("nodes")}>
                <div className="iconChip" style={{ background: CATEGORY_COLOR.Core + "22", color: CATEGORY_COLOR.Core }}><Boxes size={20} /></div>
                <p className="cardTitle">Nodes</p>
                <p className="muted small">{NODES.length} building blocks, explained simply</p>
              </div>
              <div className="exploreTile" onClick={() => go("integrations")}>
                <div className="iconChip" style={{ background: "#FF7A0022", color: "#FF7A00" }}><Plug size={20} /></div>
                <p className="cardTitle">Integrations</p>
                <p className="muted small">Step-by-step app connections</p>
              </div>
              <div className="exploreTile" onClick={() => go("workflows")}>
                <div className="iconChip" style={{ background: CATEGORY_COLOR.Trigger + "22", color: CATEGORY_COLOR.Trigger }}><Workflow size={20} /></div>
                <p className="cardTitle">Workflows</p>
                <p className="muted small">{WORKFLOWS.length} real project templates</p>
              </div>
              <div className="exploreTile" onClick={() => go("learn")}>
                <div className="iconChip" style={{ background: CATEGORY_COLOR.AI + "22", color: CATEGORY_COLOR.AI }}><GraduationCap size={20} /></div>
                <p className="cardTitle">Learn</p>
                <p className="muted small">Bite-sized n8n concepts</p>
              </div>
            </div>
          </Section>

          <Section title="Grow with n8n" icon={TrendingUp}>
            <div className="hScroll">
              <div className="miniCard" onClick={() => go("roadmap")}>
                <div className="iconChip" style={{ background: "#7C9CFF22", color: "#7C9CFF" }}><Map size={18} /></div>
                <p className="miniCardTitle">Roadmap</p>
              </div>
              <div className="miniCard" onClick={() => go("businessIdeas")}>
                <div className="iconChip" style={{ background: "#33D6A622", color: "#33D6A6" }}><Rocket size={18} /></div>
                <p className="miniCardTitle">Business Ideas</p>
              </div>
              <div className="miniCard" onClick={() => go("career")}>
                <div className="iconChip" style={{ background: "#FFD16622", color: "#FFD166" }}><Briefcase size={18} /></div>
                <p className="miniCardTitle">Career Guide</p>
              </div>
              <div className="miniCard" onClick={() => go("latestFeatures")}>
                <div className="iconChip" style={{ background: "#C792FF22", color: "#C792FF" }}><Sparkles size={18} /></div>
                <p className="miniCardTitle">Latest Features</p>
              </div>
              <div className="miniCard" onClick={openAI}>
                <div className="iconChip" style={{ background: "#FF7A0022", color: "#FF7A00" }}><MessagesSquare size={18} /></div>
                <p className="miniCardTitle">AI Mentor</p>
              </div>
            </div>
          </Section>

          <Section title="Today's Pick" icon={Zap}>
            <Card onClick={() => go("integrationDetail", "whatsapp")}>
              <div className="rowBetween">
                <div className="rowIcon">
                  <div className="iconChip" style={{ background: "#25D36622", color: "#25D366" }}><Phone size={20} /></div>
                  <div>
                    <p className="cardTitle">Connect WhatsApp</p>
                    <p className="muted small">Wire up your first chatbot in 8 easy steps</p>
                  </div>
                </div>
                <ChevronRight size={18} className="muted" />
              </div>
            </Card>
          </Section>
        </>
      )}
    </div>
  );
}

