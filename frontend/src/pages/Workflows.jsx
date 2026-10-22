import React from "react";
import { ArrowRight, HelpCircle } from "lucide-react";
import { Card, Section } from "../components/ui";
import { TopBar } from "../components/ui";
import { WORKFLOWS } from "../data/workflows";
import { PURPOSE_PAGE } from "../data/content";

export function WorkflowsList({ go }) {
  return (
    <div className="screen">
      <TopBar title="Workflows" />
      <div className="listPad">
        <p className="muted small">Three complete beginner workflows, explained node by node.</p>
        {WORKFLOWS.map((w) => (
          <Card key={w.id} onClick={() => go("workflowDetail", w.id)}>
            <p className="cardTitle">{w.title}</p>
            <p className="muted small">{w.tagline}</p>
            <div className="flowPreview">
              {w.steps.map((s, i) => (
                <React.Fragment key={i}>
                  <span className="flowChip">{s.name}</span>
                  {i < w.steps.length - 1 && <ArrowRight size={13} className="flowArrow" />}
                </React.Fragment>
              ))}
            </div>
          </Card>
        ))}

        <Section title="Purpose of Nodes" icon={HelpCircle}>
          <div className="subCard"><p className="subCardTitle">Why nodes exist</p><p className="small">{PURPOSE_PAGE.whyNodesExist}</p></div>
          <div className="subCard"><p className="subCardTitle">How data moves</p><p className="small">{PURPOSE_PAGE.howDataMoves}</p></div>
          <div className="subCard"><p className="subCardTitle">How nodes connect</p><p className="small">{PURPOSE_PAGE.howNodesConnect}</p></div>
          <div className="subCard"><p className="subCardTitle">Why workflows fail</p><p className="small">{PURPOSE_PAGE.whyWorkflowsFail}</p></div>
          <div className="subCard"><p className="subCardTitle">How execution works</p><p className="small">{PURPOSE_PAGE.howExecutionWorks}</p></div>
        </Section>
      </div>
    </div>
  );
}

export function WorkflowDetail({ wf, goBack }) {
  return (
    <div className="screen">
      <TopBar title={wf.title} onBack={goBack} />
      <div className="listPad">
        <p className="muted small">{wf.tagline}</p>
        <div className="diagram">
          {wf.steps.map((s, i) => (
            <div key={i} className="diagramRow">
              <div className="diagramNode">
                <span className="diagramIndex">{i + 1}</span>
                <p className="cardTitle">{s.name}</p>
              </div>
              {i < wf.steps.length - 1 && <div className="diagramLine" />}
            </div>
          ))}
        </div>
        {wf.steps.map((s, i) => (
          <div key={i} className="subCard">
            <p className="subCardTitle">{i + 1}. {s.name}</p>
            <p className="small">{s.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

