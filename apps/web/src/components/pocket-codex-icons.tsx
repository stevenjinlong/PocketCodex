"use client";

import type { ReactNode, SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  const { children, ...rest } = props;
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const Icons = {
  Plus: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </Icon>
  ),
  Send: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </Icon>
  ),
  Assistant: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </Icon>
  ),
  Brain: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.97-3.06 3 3 0 0 1 .33-5.76 2.5 2.5 0 0 1 3.1-3.12A2.5 2.5 0 0 1 9.5 2z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.97-3.06 3 3 0 0 0-.33-5.76 2.5 2.5 0 0 0-3.1-3.12A2.5 2.5 0 0 0 14.5 2z" />
    </Icon>
  ),
  Terminal: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </Icon>
  ),
  Code: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </Icon>
  ),
  File: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14.5 2 14.5 7.5 20 7.5" />
    </Icon>
  ),
  Settings: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33 1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82 1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Icon>
  ),
  Logout: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </Icon>
  ),
  Close: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </Icon>
  ),
  Sparkles: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
    </Icon>
  ),
  Search: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </Icon>
  ),
  Archive: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M3 7h18" />
      <path d="M5 7v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7" />
      <path d="M9 11h6" />
      <path d="M4 4h16v3H4z" />
    </Icon>
  ),
  Pencil: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
    </Icon>
  ),
  Branch: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M6 3v12" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="6" r="3" />
      <path d="M6 6a12 12 0 0 0 12 0" />
    </Icon>
  ),
  Bell: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M15 17H5l1.4-1.4A2 2 0 0 0 7 14.2V11a5 5 0 1 1 10 0v3.2a2 2 0 0 0 .6 1.4L19 17h-4" />
      <path d="M10 17a2 2 0 0 0 4 0" />
    </Icon>
  ),
  BellOff: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M4 4l16 16" />
      <path d="M8.4 8.4A5 5 0 0 1 17 11v3.2a2 2 0 0 0 .6 1.4L19 17H7.8" />
      <path d="M6 17H5l1.4-1.4A2 2 0 0 0 7 14.2V11c0-.8.2-1.6.5-2.3" />
      <path d="M10 17a2 2 0 0 0 4 0" />
    </Icon>
  ),
  Bolt: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M13 2L4 14h6l-1 8 9-12h-6z" />
    </Icon>
  ),
  Queue: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <rect x="4" y="5" width="11" height="5" rx="1" />
      <rect x="4" y="14" width="11" height="5" rx="1" />
      <path d="M19 8h1" />
      <path d="M19 16h1" />
    </Icon>
  ),
  Hand: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M8 11V5a1 1 0 1 1 2 0v5" />
      <path d="M12 11V4a1 1 0 1 1 2 0v7" />
      <path d="M16 11V6a1 1 0 1 1 2 0v8" />
      <path d="M6 12V8a1 1 0 1 1 2 0v6" />
      <path d="M6 14c0 4 2 6 6 6s6-2 6-6v-3a1 1 0 1 0-2 0" />
    </Icon>
  ),
  Shield: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3z" />
    </Icon>
  ),
  Sun: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.9 4.9 1.4 1.4" />
      <path d="m17.7 17.7 1.4 1.4" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m4.9 19.1 1.4-1.4" />
      <path d="m17.7 6.3 1.4-1.4" />
    </Icon>
  ),
  Moon: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z" />
    </Icon>
  ),
  RefreshCw: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </Icon>
  ),
  ArrowDown: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M12 5v14" />
      <path d="M19 12l-7 7-7-7" />
    </Icon>
  ),
  ArrowUp: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </Icon>
  ),
  Check: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M20 6L9 17l-5-5" />
    </Icon>
  ),
  ChevronDown: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <polyline points="6 9 12 15 18 9" />
    </Icon>
  ),
};
