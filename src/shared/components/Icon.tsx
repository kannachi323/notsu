import type { ReactNode } from "react";

const paths = {
  settings: <><path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 1 3h4l1-3 3-1 2-3-2-2 1-3-3-2-1-3Z" /><circle cx="12" cy="12" r="3" /></>,
  play: <><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4Z" /></>,
  browse: <path d="m12 3 10 5-10 5L2 8Zm-9 9 9 5 9-5M3 16l9 5 9-5" />,
  editor: <path d="m15 4 5 5M4 15 16 3l5 5L9 20l-6 1Zm0 0 5 5M3 23h19" />,
  music: <><path d="M9 17V5l11-2v12M9 9l11-2" /><ellipse cx="6" cy="18" rx="3" ry="2.5" /><ellipse cx="17" cy="16" rx="3" ry="2.5" /></>,
  profile: <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="9" r="3" /><path d="M6 19v-2a6 6 0 0 1 12 0v2" /></>,
  chat: <path d="M5 3h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-8l-6 5v-5H4a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3Z" />,
  friends: <><circle cx="9" cy="7" r="4" /><path d="M2 22v-5a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v5ZM17 4a3 3 0 0 1 0 6m2 4a4 4 0 0 1 3 4v4h-3" /></>,
  previous: <path d="M5 5v14m14-14L8 12l11 7Z" />,
  next: <path d="M19 5v14M5 5l11 7-11 7Z" />,
  back: <path d="m15 4-8 8 8 8" />,
  forward: <path d="m9 4 8 8-8 8" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  volume: <path d="m11 4-6 5H2v6h3l6 5Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" />,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9Z" />,
  shuffle: <path d="M3 7h3a6 6 0 0 1 5 2.7l2 2.6a6 6 0 0 0 5 2.7h3M3 17h3a6 6 0 0 0 4-1.5M14 8.5A6 6 0 0 1 18 7h3m-3-3 3 3-3 3m0 4 3 3-3 3" />,
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />,
  download: <path d="M12 4v12m-5-5 5 5 5-5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />,
  external: <path d="M14 4h6v6m0-6-9 9m7 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-9.5v.5" /></>,
  alert: <><path d="M12 3 2 20h20Z" /><path d="M12 10v4m0 3v.5" /></>,
  check: <path d="m5 12 5 5 9-10" />,
  mods: <><path d="M4 7h10m4 0h2M4 17h4m4 0h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  pause: <path d="M8 5v14m8-14v14" />,
  start: <path d="M8 5.5v13l11-6.5Z" />,
  home: <path d="m3 11 9-8 9 8M5 9v11h5v-6h4v6h5V9" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  flag: <path d="M5 21V4h12l-2 4 2 4H5" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {paths[name]}
  </svg>;
}

export function NotsuMark() {
  return <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
    <path d="M5 43 43 5" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="24" cy="24" r="9" fill="var(--ui-accent)" stroke="var(--ui-canvas)" strokeWidth="3" />
  </svg>;
}
