"use client";

import type { ReactNode } from "react";

import { Icons } from "./pocket-codex-icons";
import { ActionButton } from "./pocket-codex-ui";

type SidebarThreadGroup = {
  cwd: string;
  archived?: boolean;
  threads: Array<{
    id: string;
    label: string;
    preview: string;
    meta?: string | null;
    active: boolean;
  }>;
};

export function AppShell({
  sidebar,
  topBar,
  children,
  modal,
}: {
  sidebar: ReactNode;
  topBar: ReactNode;
  children: ReactNode;
  modal?: ReactNode;
}) {
  return (
    <div className="pc-shell">
      {sidebar}
      <main className="pc-main">
        {topBar}
        {children}
      </main>
      {modal}
    </div>
  );
}

export function Sidebar({
  hostLabel,
  userLabel,
  searchValue,
  groups,
  onNewChat,
  onChangeSearch,
  onSelectThread,
  onSetup,
  onControls,
  onLogout,
}: {
  hostLabel: string;
  userLabel: string;
  searchValue: string;
  groups: SidebarThreadGroup[];
  onNewChat: () => void;
  onChangeSearch: (value: string) => void;
  onSelectThread: (threadId: string) => void;
  onSetup: () => void;
  onControls: () => void;
  onLogout: () => void;
}) {
  return (
    <aside className="pc-sidebar">
      <div className="pc-sidebar-brand">
        <img className="pc-brand-image" src="/pocketcodex-mark.svg" alt="Pocket Codex" />
        <div className="pc-brand-copy">
          <strong>Pocket Codex</strong>
          <span>{userLabel}</span>
        </div>
      </div>

      <ActionButton icon={<Icons.Plus />} variant="primary" onClick={onNewChat}>
        New Chat
      </ActionButton>

      <label className="pc-sidebar-search">
        <span className="pc-sidebar-search-icon">
          <Icons.Search />
        </span>
        <input
          value={searchValue}
          onChange={(event) => onChangeSearch(event.target.value)}
          placeholder="Search chats, models, branches"
        />
      </label>

      <div className="pc-sidebar-section">
        <div className="pc-sidebar-heading">
          <span>{hostLabel}</span>
        </div>
        <div className="pc-thread-list">
          {groups.length === 0 ? (
            <div className="pc-thread-empty">No chats yet</div>
          ) : (
            groups.map((group) => (
              <div key={group.cwd} className="pc-thread-group">
                <div className="pc-thread-group-title">{group.archived ? "Archived" : group.cwd}</div>
                {group.threads.map((thread) => (
                  <button
                    key={thread.id}
                    className={`pc-thread-item${thread.active ? " is-active" : ""}`}
                    type="button"
                    onClick={() => onSelectThread(thread.id)}
                  >
                    <strong>{thread.label}</strong>
                    <span>{thread.preview}</span>
                    {thread.meta ? <small>{thread.meta}</small> : null}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="pc-sidebar-footer">
        <ActionButton icon={<Icons.Settings />} variant="surface" onClick={onSetup}>
          Setup
        </ActionButton>
        <ActionButton icon={<Icons.Sparkles />} variant="surface" onClick={onControls}>
          Controls
        </ActionButton>
        <ActionButton icon={<Icons.Logout />} variant="ghost" onClick={onLogout}>
          Log Out
        </ActionButton>
      </div>
    </aside>
  );
}

export function TopBar({
  pathLabel,
  title,
  subtitle,
  actions,
}: {
  pathLabel?: string | null;
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <header className="pc-topbar">
      <div className="pc-topbar-copy">
        <h1>{title}</h1>
        <p>{subtitle}</p>
        {pathLabel ? <span className="pc-topbar-path">{pathLabel}</span> : null}
      </div>

      <div className="pc-topbar-actions">
        {actions}
      </div>
    </header>
  );
}

export function ChatLayout({
  alerts,
  statusRail,
  timeline,
  composer,
}: {
  alerts?: ReactNode;
  statusRail?: ReactNode;
  timeline: ReactNode;
  composer: ReactNode;
}) {
  return (
    <section className="pc-chat-layout">
      {alerts ? <div className="pc-alert-stack">{alerts}</div> : null}
      <div className="pc-chat-timeline">
        {statusRail ? <div className="pc-chat-status-rail">{statusRail}</div> : null}
        {timeline}
      </div>
      <div className="pc-chat-composer">{composer}</div>
    </section>
  );
}

export function PanelModal({
  title,
  eyebrow,
  onClose,
  children,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="pc-modal-overlay" onClick={onClose}>
      <section className="pc-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="pc-modal-header">
          <div>
            <span className="pc-modal-eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          <ActionButton icon={<Icons.Close />} variant="ghost" size="sm" onClick={onClose}>
            Close
          </ActionButton>
        </div>
        <div className="pc-modal-body">{children}</div>
      </section>
    </div>
  );
}
