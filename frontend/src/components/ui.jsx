import React from "react";
import { ChevronLeft } from "lucide-react";

export function TopBar({ title, onBack }) {
  return (
    <div className="topbar">
      {onBack ? (
        <button className="iconBtn" onClick={onBack} aria-label="Go back">
          <ChevronLeft size={22} />
        </button>
      ) : (
        <div className="brandDot" />
      )}
      <h1>{title}</h1>
      <div style={{ width: 36 }} />
    </div>
  );
}

export function Card({ children, onClick, style }) {
  return (
    <div className={"card" + (onClick ? " cardTappable" : "")} onClick={onClick} style={style}>
      {children}
    </div>
  );
}

export function Pill({ children, color }) {
  return (
    <span className="pill" style={{ background: (color || "#FF7A00") + "22", color: color || "#FF7A00", borderColor: (color || "#FF7A00") + "55" }}>
      {children}
    </span>
  );
}

export function Section({ title, icon: Icon, children }) {
  return (
    <div className="section">
      <div className="sectionHead">
        {Icon && <Icon size={16} />}
        <h2>{title}</h2>
      </div>
      {children}
    </div>
  );
}

export function DetailBlock({ title, text, icon: Icon }) {
  return (
    <div className="subCard">
      <div className="sectionHead">{Icon && <Icon size={15} />}<h2>{title}</h2></div>
      <p className="small">{text}</p>
    </div>
  );
}

export function DetailList({ title, items }) {
  return (
    <div className="subCard">
      <p className="subCardTitle">{title}</p>
      <div className="chipWrap">
        {items.map((it, i) => <span key={i} className="tagChip">{it}</span>)}
      </div>
    </div>
  );
}

