"use client";
import { X } from "lucide-react";

export function Modal({ title, subtitle, children, onClose, wide = false }: { title: string; subtitle?: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal-card ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}><header className="modal-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X/></button></header><div className="modal-body">{children}</div></section></div>;
}

export function EmptyState({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) { return <div className="empty-state"><span>{icon}</span><h3>{title}</h3><p>{text}</p>{action}</div>; }

export function LoadingState() { return <div className="loading-state"><i/><i/><i/></div>; }
