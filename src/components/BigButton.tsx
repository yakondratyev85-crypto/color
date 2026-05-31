import type { ReactNode } from 'react';

export function BigButton({ children, onClick, variant = 'primary', disabled = false }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; disabled?: boolean }) {
  return <button className={`big-button big-button--${variant}`} onClick={onClick} disabled={disabled}>{children}</button>;
}
