import React from "react";
import { ChevronRight, BookOpen, FileJson, Lightbulb, ShieldAlert, XCircle } from "lucide-react";
import { TopBar, Card, Section } from "../components/ui";
import { LESSONS } from "../data/lessons";
import { JSON_GUIDE, TIPS, MISTAKES } from "../data/content";

export function Learn({ go }) {
  return (
    <div className="screen">
      <TopBar title="Learn" />
      <div className="listPad">
        <p className="muted small">Short, simple lessons covering every n8n concept.</p>
        {LESSONS.map((l) => (
          <Card key={l.id} onClick={() => go("lessonDetail", l.id)}>
            <div className="rowBetween">
              <div className="rowIcon">
                <div className="iconChip" style={{ background: "#FF7A0022", color: "#FF7A00" }}><BookOpen size={16} /></div>
                <p className="cardTitle">{l.title}</p>
              </div>
              <ChevronRight size={18} className="muted" />
            </div>
          </Card>
        ))}

        <Section title="JSON Guide" icon={FileJson}>
          <div className="subCard"><p className="subCardTitle">What is JSON?</p><p className="small">{JSON_GUIDE.what}</p></div>
          <div className="subCard"><p className="subCardTitle">Why does n8n use JSON?</p><p className="small">{JSON_GUIDE.why}</p></div>
          <div className="subCard"><p className="subCardTitle">What is workflow.json?</p><p className="small">{JSON_GUIDE.workflowJson}</p></div>
          <div className="subCard"><p className="subCardTitle">Why export it?</p><p className="small">{JSON_GUIDE.export}</p></div>
          <div className="subCard"><p className="subCardTitle">How to import it</p><p className="small">{JSON_GUIDE.importInfo}</p></div>
          <div className="codeBlock"><pre>{JSON_GUIDE.example}</pre></div>
          {JSON_GUIDE.exampleLines.map((l, i) => (
            <div key={i} className="opRow">
              <div className="opDot" />
              <div><p className="opName mono">{l.line}</p><p className="muted small">{l.meaning}</p></div>
            </div>
          ))}
        </Section>

        <Section title="Learning Tips" icon={Lightbulb}>
          {TIPS.map((t, i) => (
            <div key={i} className="tipCard"><Lightbulb size={15} /><p className="small">{t}</p></div>
          ))}
        </Section>

        <Section title="Common Mistakes" icon={ShieldAlert}>
          {MISTAKES.map((m, i) => (
            <div key={i} className="warnCard">
              <div className="warnRow"><XCircle size={14} color="#FF7A00" /><p className="small"><b>{m.title}.</b> {m.desc}</p></div>
            </div>
          ))}
        </Section>
      </div>
    </div>
  );
}

export function LessonDetail({ lesson, goBack }) {
  return (
    <div className="screen">
      <TopBar title="Lesson" onBack={goBack} />
      <div className="listPad">
        <div className="detailHero">
          <div className="iconChip large" style={{ background: "#FF7A0033", color: "#FF7A00" }}><BookOpen size={26} /></div>
        </div>
        <h2 className="lessonTitle">{lesson.title}</h2>
        <p className="small lessonBody">{lesson.body}</p>
      </div>
    </div>
  );
}

