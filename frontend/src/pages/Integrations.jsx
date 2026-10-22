import React from "react";
import { Key, Zap, Sparkles } from "lucide-react";
import { TopBar, DetailBlock } from "../components/ui";
import { INTEGRATIONS } from "../data/integrations";

export function IntegrationsList({ go }) {
  return (
    <div className="screen">
      <TopBar title="Integrations" />
      <div className="listPad">
        <p className="muted small">Dedicated guides for the apps n8n connects to most.</p>
        <div className="grid2">
          {INTEGRATIONS.map((it) => (
            <div key={it.id} className="integTile" onClick={() => go("integrationDetail", it.id)}>
              <div className="iconChip" style={{ background: it.color + "22", color: it.color }}>
                <it.icon size={20} />
              </div>
              <p className="cardTitle">{it.name}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function IntegrationDetail({ integ, goBack }) {
  return (
    <div className="screen">
      <TopBar title={integ.name} onBack={goBack} />
      <div className="listPad">
        <div className="detailHero" style={{ background: integ.color + "1a" }}>
          <div className="iconChip large" style={{ background: integ.color + "33", color: integ.color }}>
            <integ.icon size={28} />
          </div>
        </div>
        <DetailBlock title="What is it?" text={integ.what} />
        <DetailBlock title="Why should we use it?" text={integ.why} />
        <DetailBlock title="How does n8n connect to it?" text={integ.connect} />
        <DetailBlock title="Required Credentials" text={integ.credentials} icon={Key} />

        {integ.steps && (
          <div className="subCard">
            <div className="sectionHead"><Zap size={15} color={integ.color} /><h2>Connect it, step by step</h2></div>
            <div className="stepList">
              {integ.steps.map((s, i) => (
                <div key={i} className="stepRow">
                  <div className="stepMarkerWrap">
                    <div className="stepMarker" style={{ background: integ.color }}>{i + 1}</div>
                    {i < integ.steps.length - 1 && <div className="stepConnector" style={{ background: `linear-gradient(${integ.color}, var(--border))` }} />}
                  </div>
                  <div className="stepBody">
                    <p className="stepTitle">{s.title}</p>
                    <p className="stepDesc">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="subCard">
          <p className="subCardTitle">Parameters explained</p>
          {integ.params.map((p, i) => (
            <div key={i} className="opRow">
              <div className="opDot" style={{ background: integ.color }} />
              <div>
                <p className="opName">{p.name}</p>
                <p className="muted small">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {integ.steps && (
          <div className="tipCard">
            <Sparkles size={16} />
            <p className="small">Once your first test message lands, duplicate the workflow and swap in real customer data — that's your integration officially live.</p>
          </div>
        )}
      </div>
    </div>
  );
}

