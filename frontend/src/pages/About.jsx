import React from "react";
import { TopBar, DetailBlock } from "../components/ui";
import { ABOUT } from "../data/content";

export default function About() {
  return (
    <div className="screen">
      <TopBar title="About n8n" />
      <div className="listPad">
        <DetailBlock title="History" text={ABOUT.history} />
        <DetailBlock title="Purpose" text={ABOUT.purpose} />
        <DetailBlock title="Benefits" text={ABOUT.benefits} />
        <DetailBlock title="Why companies use n8n" text={ABOUT.companies} />
        <DetailBlock title="Advantages over manual work" text={ABOUT.advantages} />
        <div className="footerNote">
          <p className="muted small">n8n Mini is an independent educational companion app and is not affiliated with n8n GmbH.</p>
        </div>
      </div>
    </div>
  );
}

