import React from 'react';

export function Card({ children, className = '' }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function CardHeader({ children }) {
  return <div className="card-header">{children}</div>;
}

export function CardTitle({ children }) {
  return <div className="card-title">{children}</div>;
}

export function CardContent({ children, className = '' }) {
  return <div className={`card-content ${className}`}>{children}</div>;
}

export function Button({ children, className = '', variant = 'primary', ...props }) {
  return (
    <button className={`btn btn-${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Input(props) {
  return <input className="input" {...props} />;
}

export function Textarea(props) {
  return <textarea className="textarea" {...props} />;
}

export function Badge({ children }) {
  return <span className="badge">{children}</span>;
}

export function StatCard({ label, value, sub }) {
  return (
    <Card>
      <CardContent>
        <div className="muted small">{label}</div>
        <div className="stat-value">{value}</div>
        {sub ? <div className="muted tiny">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

export function TabButton({ active, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`tab-button ${active ? 'tab-active' : 'tab-inactive'}`}
    >
      {label}
    </button>
  );
}

export function MiniBar({ label, value, max }) {
  const width = `${Math.max(10, (value / max) * 100)}%`;
  return (
    <div className="mini-bar-wrap">
      <div className="mini-bar-label">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="mini-bar-bg">
        <div className="mini-bar-fill" style={{ width }} />
      </div>
    </div>
  );
}
