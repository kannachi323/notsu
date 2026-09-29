import type { ReactNode } from "react";

const paths = {
  play: <><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4Z" /></>,
  browse: <><path d="m12 3 10 5-10 5L2 8Zm-9 9 9 5 9-5M3 16l9 5 9-5" /></>,
  editor: <><path d="m15 4 5 5M4 15 16 3l5 5L9 20l-6 1Zm0 0 5 5M3 23h19" /></>,
  music: <><path d="M9 17V5l11-2v12M9 9l11-2" /><ellipse cx="6" cy="18" rx="3" ry="2.5" /><ellipse cx="17" cy="16" rx="3" ry="2.5" /></>,
  profile: <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="9" r="3" /><path d="M6 19v-2a6 6 0 0 1 12 0v2" /></>,
  chat: <path d="M5 3h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-8l-6 5v-5H4a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3Z" />,
  friends: <><circle cx="9" cy="7" r="4" /><path d="M2 22v-5a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v5ZM17 4a3 3 0 0 1 0 6m2 4a4 4 0 0 1 3 4v4h-3" /></>,
  previous: <><path d="M5 5v14m14-14L8 12l11 7Z" /></>,
  next: <><path d="M19 5v14M5 5l11 7-11 7Z" /></>,
  back: <path d="m15 4-8 8 8 8" />,
  forward: <path d="m9 4 8 8-8 8" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  volume: <><path d="m11 4-6 5H2v6h3l6 5Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></>,
} satisfies Record<string, ReactNode>;

export function Icon({ name }: { name: keyof typeof paths }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {paths[name]}
  </svg>;
}

export function NotsuMark() {
  return <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
    <path d="M5 43 43 5" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="24" cy="24" r="9" fill="var(--home-accent)" stroke="var(--home-background)" strokeWidth="3" />
  </svg>;
}
