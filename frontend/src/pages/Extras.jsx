import React from "react";
import { TrendingUp, Briefcase, Compass, Star } from "lucide-react";
import { TopBar, Card, DetailBlock } from "../components/ui";
import { ROADMAP, BUSINESS_IDEAS, CAREER_GUIDE, LATEST_FEATURES } from "../data/content";

export function RoadmapPage({ goBack }) {
  return (
    <div className="screen">
      <TopBar title="Learning Roadmap" onBack={goBack} />
      <div className="listPad">
        <p className="muted small">A suggested order to go from zero to confidently freelancing with n8n.</p>
        <div className="subCard">
          <div className="stepList">
            {ROADMAP.map((r, i) => (
              <div key={i} className="stepRow">
                <div className="stepMarkerWrap">
                  <div className="stepMarker">{i + 1}</div>
                  {i < ROADMAP.length - 1 && <div className="stepConnector" />}
                </div>
                <div className="stepBody">
                  <p className="stepTitle">{r.title}</p>
                  <p className="stepDesc">{r.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function BusinessIdeasPage({ goBack }) {
  return (
    <div className="screen">
      <TopBar title="AI Business Ideas" onBack={goBack} />
      <div className="listPad">
        <p className="muted small">Real ways people turn n8n skills into income.</p>
        {BUSINESS_IDEAS.map((b, i) => (
          <Card key={i}>
            <div className="rowIcon">
              <div className="iconChip" style={{ background: "#FF7A0022", color: "#FF7A00" }}><b.icon size={18} /></div>
              <p className="cardTitle">{b.title}</p>
            </div>
            <p className="small" style={{ marginTop: 8 }}>{b.desc}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function CareerPage({ goBack }) {
  return (
    <div className="screen">
      <TopBar title="Career Guide" onBack={goBack} />
      <div className="listPad">
        <DetailBlock title="Market demand" text={CAREER_GUIDE.demand} icon={TrendingUp} />
        <DetailBlock title="Freelancing with n8n" text={CAREER_GUIDE.freelancing} icon={Briefcase} />
        <DetailBlock title="Career paths" text={CAREER_GUIDE.paths} icon={Compass} />
        <DetailBlock title="Best practices" text={CAREER_GUIDE.bestPractices} icon={Star} />
      </div>
    </div>
  );
}

export function LatestFeaturesPage({ goBack }) {
  return (
    <div className="screen">
      <TopBar title="Latest Features" onBack={goBack} />
      <div className="listPad">
        <p className="muted small">Good things to know as n8n keeps evolving.</p>
        {LATEST_FEATURES.map((f, i) => (
          <div key={i} className="subCard">
            <p className="subCardTitle">{f.title}</p>
            <p className="small">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

