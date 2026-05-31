/// <reference lib="dom" />

declare module 'react' {
  export type ReactNode = unknown;
  export function useEffect(effect: () => void | (() => void), deps?: unknown[]): void;
  export function useMemo<T>(factory: () => T, deps?: unknown[]): T;
  export function useState<T>(initial: T | (() => T)): [T, (value: T | ((previous: T) => T)) => void];
  const React: { StrictMode: (props: { children?: ReactNode }) => JSX.Element };
  export default React;
}

declare module 'react-dom/client' {
  export function createRoot(container: Element): { render(node: unknown): void };
}

declare module 'vite' {
  export function defineConfig(config: unknown): unknown;
}

declare module '@vitejs/plugin-react' {
  export default function react(): unknown;
}

declare module 'vite-plugin-pwa' {
  export function VitePWA(config: unknown): unknown;
}

declare namespace JSX {
  interface Element {}
  interface IntrinsicElements {
    [elementName: string]: Record<string, unknown>;
  }
}

declare module 'react/jsx-runtime' {
  export const Fragment: unknown;
  export function jsx(type: unknown, props: unknown, key?: unknown): JSX.Element;
  export function jsxs(type: unknown, props: unknown, key?: unknown): JSX.Element;
}

declare module '*.css' {}

declare namespace JSX {
  interface IntrinsicAttributes {
    key?: string | number;
  }
}
