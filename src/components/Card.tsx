import type { ReactNode } from 'react';

export function Card({ children, className = '', onClick, locked = false }: { children: ReactNode; className?: string; onClick?: () => void; locked?: boolean }) {
  return <button className={`card ${locked ? 'card--locked' : ''} ${className}`} onClick={onClick} disabled={locked && !onClick}>{children}</button>;
}
