import React from "react";
import { Search, ChevronRight, ShieldAlert, XCircle, Lightbulb, Key } from "lucide-react";
import { TopBar, Card, Pill, DetailBlock, DetailList } from "../components/ui";
import { CATEGORY_COLOR } from "../data/nodes";

export function NodesList({ go, query, setQuery, filteredNodes }) {
  return (
    <div className="screen">
      <TopBar title="Nodes" />
      <div className="listPad">
        <div className="searchWrap searchWrapInline">
          <Search size={17} className="searchIcon" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all nodes..." className="searchInput" />
        </div>
        <p className="muted small">{filteredNodes.length} node{filteredNodes.length === 1 ? "" : "s"}</p>
        {filteredNodes.map((n) => (
          <Card key={n.id} onClick={() => go("nodeDetail", n.id)}>
            <div className="rowBetween">
              <div className="rowIcon">
                <div className="iconChip" style={{ background: CATEGORY_COLOR[n.category] + "22", color: CATEGORY_COLOR[n.category] }}>
                  <n.icon size={18} />
                </div>
                <div>
                  <p className="cardTitle">{n.name}</p>
                  <p className="muted small">{n.purpose.slice(0, 58)}...</p>
                </div>
              </div>
              <ChevronRight size={18} className="muted" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function NodeDetail({ node, goBack }) {
  return (
    <div className="screen">
      <TopBar title={node.name} onBack={goBack} />
      <div className="listPad">
        <div className="detailHero" style={{ background: CATEGORY_COLOR[node.category] + "1a" }}>
          <div className="iconChip large" style={{ background: CATEGORY_COLOR[node.category] + "33", color: CATEGORY_COLOR[node.category] }}>
            <node.icon size={28} />
          </div>
          <Pill color={CATEGORY_COLOR[node.category]}>{node.category}</Pill>
        </div>

        <DetailBlock title="Purpose" text={node.purpose} />
        <DetailBlock title="Why do we use this node?" text={node.why} />
        <DetailBlock title="When should we use it?" text={node.when} />

        <DetailList title="Common Uses" items={node.uses} />

        <DetailBlock title="Required Credentials" text={node.credentials} icon={Key} />

        <div className="subCard">
          <p className="subCardTitle">Operations</p>
          {node.operations.map((op, i) => (
            <div key={i} className="opRow">
              <div className="opDot" />
              <div>
                <p className="opName">{op.name}</p>
                <p className="muted small">{op.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="ioRow">
          <div className="ioCard">
            <p className="subCardTitle">Input</p>
            <p className="muted small">{node.input}</p>
          </div>
          <div className="ioCard">
            <p className="subCardTitle">Output</p>
            <p className="muted small">{node.output}</p>
          </div>
        </div>

        <div className="warnCard">
          <div className="sectionHead"><ShieldAlert size={16} color="#FF7A00" /><h2>Things To Avoid</h2></div>
          {node.avoid.map((a, i) => (
            <div key={i} className="warnRow"><XCircle size={14} color="#FF7A00" /><p className="small">{a}</p></div>
          ))}
        </div>

        <div className="tipCard">
          <Lightbulb size={16} />
          <p className="small">{node.tip}</p>
        </div>
      </div>
    </div>
  );
}

