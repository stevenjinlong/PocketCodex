"use client";

import type {
  ApprovalPolicy,
  CollaborationMode,
  ModelOption,
  ReasoningEffort,
  SandboxMode,
  ServiceTier,
  TimelineItem,
} from "@pocket-codex/protocol";
import type { ChangeEvent, FormEvent, KeyboardEvent, ReactNode, ReactElement, RefObject } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Icons } from "./pocket-codex-icons";
import { ActionButton } from "./pocket-codex-ui";

const EMPTY_STATE_PILLS = [
  "Secure relay",
  "DB-backed control plane",
  "Local runtime",
];

function codeSummary(language: string | null, code: string): string {
  const lines = code ? code.split("\n").length : 0;
  const prefix = language ? `${language} code` : "Code";
  return lines > 0 ? `${prefix} · ${lines} lines` : prefix;
}

function modelLabel(model: string): string {
  switch (model.trim().toLowerCase()) {
    case "gpt-5.4":
      return "GPT-5.4";
    case "gpt-5.3-codex":
      return "GPT-5.3";
    case "gpt-5.2-codex":
      return "GPT-5.2 Codex";
    case "gpt-5.2":
      return "GPT-5.2";
    case "gpt-5.1-codex-max":
      return "GPT-5.1 Max";
    case "gpt-5.1-codex-mini":
      return "GPT-5.1 Mini";
    default:
      return model;
  }
}

function approvalMenuLabel(policy: ApprovalPolicy): string {
  switch (policy) {
    case "on-request":
      return "Ask first";
    case "never":
      return "Auto approve";
    case "untrusted":
      return "Safe only";
    default:
      return policy;
  }
}

function sandboxMenuLabel(mode: SandboxMode): string {
  switch (mode) {
    case "read-only":
      return "Read only";
    case "workspace-write":
      return "Workspace write";
    case "danger-full-access":
      return "Full access";
    default:
      return mode;
  }
}

function closeMenu(trigger: HTMLButtonElement): void {
  const root = trigger.closest("details") as HTMLDetailsElement | null;
  if (root) {
    root.open = false;
  }
}

function MenuPill<T extends string>({
  icon,
  label,
  options,
  selectedValue,
  title,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  options: Array<{ value: T; label: string }>;
  selectedValue: T;
  title?: string;
  onSelect: (value: T) => void;
}) {
  const selected = options.find((option) => option.value === selectedValue);

  return (
    <details className="pc-menu-pill">
      <summary className="pc-picker-pill pc-menu-pill-summary" title={title}>
        <span className="pc-menu-pill-value">
          {icon}
          {selected?.label || label}
        </span>
        <span className="pc-menu-pill-arrow" aria-hidden>
          <Icons.ChevronDown />
        </span>
      </summary>
      <div className="pc-menu-pill-list">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`pc-menu-pill-option${option.value === selectedValue ? " is-active" : ""}`}
            onClick={(event) => {
              onSelect(option.value);
              closeMenu(event.currentTarget);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </details>
  );
}

function readBlockCode(element: ReactNode): { content: string; language: string | null } {
  const codeElement = element as ReactElement<{ className?: string; children?: ReactNode }> | undefined;
  const className = typeof codeElement?.props?.className === "string" ? codeElement.props.className : "";
  const language = className.replace(/^language-/, "") || null;
  const rawChildren = codeElement?.props?.children;
  const content = Array.isArray(rawChildren)
    ? rawChildren.map((child) => String(child)).join("")
    : String(rawChildren || "");

  return {
    content: content.replace(/\n$/, ""),
    language,
  };
}

function MarkdownBlock({ markdown }: { markdown: string }) {
  return (
    <div className="pc-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre(props) {
            const { children } = props;
            const { content, language } = readBlockCode(children);

            return (
              <details className="pc-artifact-card">
                <summary className="pc-artifact-summary">
                  <div className="pc-artifact-title">
                    <Icons.Code />
                    <span>{codeSummary(language, content)}</span>
                  </div>
                  <span className="pc-collapse-arrow" aria-hidden>
                    <Icons.ChevronDown />
                  </span>
                </summary>
                <div className="pc-terminal-card">
                  <pre>{content || "Empty code block."}</pre>
                </div>
              </details>
            );
          },
          code(props) {
            const { children } = props;
            const content = String(children).replace(/\n$/, "");

            return <code className="pc-inline-code">{content}</code>;
          },
          a(props) {
            return (
              <a {...props} target="_blank" rel="noreferrer" />
            );
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function inferFileStatus(title: string, output: string): "modified" | "created" | "deleted" {
  if (/create|add/i.test(title)) {
    return "created";
  }
  if (/delete|remove/i.test(title)) {
    return "deleted";
  }

  const plus = (output.match(/^\+/gm) || []).length;
  const minus = (output.match(/^\-/gm) || []).length;
  if (plus > 0 && minus === 0) {
    return "created";
  }
  if (minus > 0 && plus === 0) {
    return "deleted";
  }
  return "modified";
}

function summarizeOutput(output: string): string {
  const firstLine = output
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return "No preview available";
  }

  return firstLine.length > 96 ? `${firstLine.slice(0, 95)}…` : firstLine;
}

export function CommandBlock({
  title,
  output,
  label,
}: {
  title: string;
  output: string;
  label: string;
}) {
  return (
    <details className="pc-artifact-card">
      <summary className="pc-artifact-summary">
        <div className="pc-artifact-copy">
          <span>{label}</span>
          {title ? <small>{title}</small> : null}
        </div>
        <span className="pc-collapse-arrow" aria-hidden>
          <Icons.ChevronDown />
        </span>
      </summary>
      <div className="pc-terminal-card">
        <pre>{output || "Waiting for output..."}</pre>
      </div>
    </details>
  );
}

export function FileChangeCard({
  title,
  output,
}: {
  title: string;
  output: string;
}) {
  const status = inferFileStatus(title, output);
  const summary = summarizeOutput(output);

  return (
    <details className="pc-artifact-card">
      <summary className="pc-artifact-summary">
        <div className="pc-artifact-title">
          <div className="pc-artifact-copy">
            <span>{title}</span>
            <small>{status} · {summary}</small>
          </div>
        </div>
        <span className="pc-collapse-arrow" aria-hidden>
          <Icons.ChevronDown />
        </span>
      </summary>
      <div className="pc-diff-card">
        <div className="pc-diff-lines">
          {(output || "No diff preview available.").split("\n").map((line, index) => (
            <div
              key={`${title}_${index}`}
              className={
                line.startsWith("+")
                  ? "pc-diff-line is-added"
                  : line.startsWith("-")
                    ? "pc-diff-line is-removed"
                    : "pc-diff-line"
              }
            >
              <code>{line || " "}</code>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

export function ThinkingBlock({ text }: { text: string }) {
  return (
    <div className="pc-thinking-block">
      <div className="pc-thinking-pill">
        <span className="pc-thinking-dot" />
        <Icons.Brain />
        <span>Thinking</span>
      </div>
      {text ? <p>{text}</p> : null}
    </div>
  );
}

export function MessageBubble({ item }: { item: TimelineItem }) {
  if (item.kind === "user-message") {
    return (
      <div className="pc-message-row is-user">
        <article className="pc-message-bubble is-user">
          <p>{item.text || "Empty message."}</p>
          {item.attachments && item.attachments.length > 0 ? (
            <div className="pc-user-attachments">
              {item.attachments.map((attachment, index) => (
                <span key={`${item.id}_attachment_${index}`} className="pc-user-attachment-chip">
                  {attachment.kind === "image" ? "Image" : "File"} · {attachment.label}
                </span>
              ))}
            </div>
          ) : null}
        </article>
      </div>
    );
  }

  if (item.kind === "assistant-message") {
    return (
      <div className="pc-message-row is-assistant">
        <div className="pc-message-avatar">
          <Icons.Assistant />
        </div>
        <div className="pc-message-stack">
          {item.phase === "final_answer" ? <span className="pc-message-label">Final answer</span> : null}
          {item.text ? <MarkdownBlock markdown={item.text} /> : <p className="pc-message-copy">Waiting for assistant output…</p>}
        </div>
      </div>
    );
  }

  if (item.kind === "reasoning") {
    return (
      <div className="pc-message-row is-assistant">
        <div className="pc-message-avatar is-muted">
          <Icons.Brain />
        </div>
        <div className="pc-message-stack">
          {item.text ? <ThinkingBlock text={item.text} /> : null}
        </div>
      </div>
    );
  }

  if (item.kind === "plan") {
    return (
      <div className="pc-message-row is-assistant">
        <div className="pc-message-avatar is-muted">
          <Icons.Sparkles />
        </div>
        <div className="pc-message-stack">
          <div className="pc-info-panel">
            <span className="pc-message-label">Plan</span>
            {item.text ? <MarkdownBlock markdown={item.text} /> : <p>No plan content yet.</p>}
          </div>
        </div>
      </div>
    );
  }

  if (item.kind === "command" || item.kind === "tool") {
    return (
      <div className="pc-message-row is-artifact">
        <div className="pc-message-spacer" aria-hidden />
        <div className="pc-message-stack">
          <CommandBlock
            title={item.title}
            output={item.output}
            label={item.kind === "command" ? "Command" : "Tool"}
          />
        </div>
      </div>
    );
  }

  if (item.kind === "file-change") {
    return (
      <div className="pc-message-row is-artifact">
        <div className="pc-message-spacer" aria-hidden />
        <div className="pc-message-stack">
          <FileChangeCard title={item.title} output={item.output} />
        </div>
      </div>
    );
  }

  return (
    <div className="pc-message-row is-artifact">
      <div className="pc-message-spacer" aria-hidden />
      <div className="pc-message-stack">
        <div className="pc-info-panel">
          <span className="pc-message-label">{item.label}</span>
          {item.detail ? <MarkdownBlock markdown={item.detail} /> : <p>No detail available.</p>}
        </div>
      </div>
    </div>
  );
}

export function ChatInput({
  activeTurn,
  approvalPolicy,
  attachments,
  attachmentBusy,
  collaborationMode,
  composer,
  composerBusy,
  fileInputRef,
  formRef,
  model,
  models,
  onChangeApprovalPolicy,
  onChangeCollaborationMode,
  onChangeComposer,
  onChangeModel,
  onChangeReasoningEffort,
  onChangeServiceTier,
  onChangeSandboxMode,
  onChooseFiles,
  onInsertSubagentsPrompt,
  onKeyDown,
  onOpenFileDialog,
  onRemoveQueuedDraft,
  onRemoveAttachment,
  onSendSteer,
  onSubmit,
  queuedDrafts,
  reasoningOptions,
  reasoningEffort,
  sandboxMode,
  serviceTier,
}: {
  activeTurn: boolean;
  approvalPolicy: ApprovalPolicy;
  attachments: Array<{ id: string; name: string; kind: "text" | "image" | "binary" }>;
  attachmentBusy: boolean;
  collaborationMode: CollaborationMode | null;
  composer: string;
  composerBusy: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  formRef: RefObject<HTMLFormElement | null>;
  model: string;
  models: ModelOption[];
  onChangeApprovalPolicy: (value: ApprovalPolicy) => void;
  onChangeCollaborationMode: (value: CollaborationMode | null) => void;
  onChangeComposer: (value: string) => void;
  onChangeModel: (value: string) => void;
  onChangeReasoningEffort: (value: ReasoningEffort) => void;
  onChangeServiceTier: (value: ServiceTier | null) => void;
  onChangeSandboxMode: (value: SandboxMode) => void;
  onChooseFiles: (event: ChangeEvent<HTMLInputElement>) => void;
  onInsertSubagentsPrompt: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onOpenFileDialog: () => void;
  onRemoveQueuedDraft: (draftId: string) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onSendSteer: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  queuedDrafts: Array<{ id: string; text: string; collaborationMode: CollaborationMode | null }>;
  reasoningOptions: Array<{ effort: ReasoningEffort; label: string }>;
  reasoningEffort: ReasoningEffort;
  sandboxMode: SandboxMode;
  serviceTier: ServiceTier | null;
}) {
  const modelOptions = models.length > 0
    ? models.map((option) => ({
        value: option.model,
        label: modelLabel(option.model),
      }))
    : [{ value: model, label: modelLabel(model) }];
  const reasoningMenuOptions = reasoningOptions.length > 0
    ? reasoningOptions.map((option) => ({
        value: option.effort,
        label: option.label,
      }))
    : [{ value: reasoningEffort, label: reasoningEffort }];
  const approvalOptions: Array<{ value: ApprovalPolicy; label: string }> = [
    { value: "on-request", label: "Ask first" },
    { value: "never", label: "Auto approve" },
    { value: "untrusted", label: "Safe only" },
  ];
  const sandboxOptions: Array<{ value: SandboxMode; label: string }> = [
    { value: "read-only", label: "Read only" },
    { value: "workspace-write", label: "Workspace write" },
    { value: "danger-full-access", label: "Full access" },
  ];

  return (
    <form ref={formRef} className="pc-input-shell" onSubmit={onSubmit}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={onChooseFiles}
        accept="image/*"
      />

      {queuedDrafts.length > 0 ? (
        <div className="pc-queued-drafts">
          {queuedDrafts.map((draft) => (
            <div key={draft.id} className="pc-queued-draft">
              <span>
                <Icons.Queue />
                {draft.text}
              </span>
              <div className="pc-queued-draft-actions">
                {draft.collaborationMode === "plan" ? <small>Plan</small> : null}
                <button type="button" onClick={() => onRemoveQueuedDraft(draft.id)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {attachments.length > 0 ? (
        <div className="pc-attachment-row">
          {attachments.map((attachment) => (
            <span key={attachment.id} className="pc-attachment-chip">
              <span>{attachment.name}</span>
              <button type="button" onClick={() => onRemoveAttachment(attachment.id)}>
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <textarea
        className="pc-input-field"
        value={composer}
        onChange={(event) => onChangeComposer(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={
          activeTurn
            ? "Steer the running turn. Press Enter to send, Shift+Enter for a new line."
            : "Ask Codex anything. Press Enter to send, Shift+Enter for a new line."
        }
      />

      <div className="pc-input-footer">
        <div className="pc-input-pills">
          <button className="pc-picker-pill" type="button" onClick={onOpenFileDialog}>
            <span>
              <Icons.Plus />
              {attachmentBusy ? "Adding..." : "Attach"}
            </span>
          </button>
          <MenuPill
            icon={<Icons.Code />}
            label={modelLabel(model)}
            options={modelOptions}
            selectedValue={model}
            title="Select model"
            onSelect={onChangeModel}
          />
          <MenuPill
            icon={<Icons.Brain />}
            label={reasoningOptions.find((option) => option.effort === reasoningEffort)?.label || reasoningEffort}
            options={reasoningMenuOptions}
            selectedValue={reasoningEffort}
            title="Select reasoning depth"
            onSelect={onChangeReasoningEffort}
          />
          <button
            className={`pc-picker-pill pc-toggle-pill${serviceTier === "fast" ? " is-active" : ""}`}
            type="button"
            onClick={() => onChangeServiceTier(serviceTier === "fast" ? null : "fast")}
          >
            <span>
              <Icons.Bolt />
              Fast
            </span>
          </button>
          <button
            className={`pc-picker-pill pc-toggle-pill${collaborationMode === "plan" ? " is-active" : ""}`}
            type="button"
            onClick={() => onChangeCollaborationMode(collaborationMode === "plan" ? null : "plan")}
          >
            <span>
              <Icons.Sparkles />
              Plan
            </span>
          </button>
          <button className="pc-picker-pill pc-toggle-pill" type="button" onClick={onInsertSubagentsPrompt}>
            <span>
              <Icons.Assistant />
              /subagents
            </span>
          </button>
          <MenuPill
            icon={<Icons.Hand />}
            label={approvalMenuLabel(approvalPolicy)}
            options={approvalOptions}
            selectedValue={approvalPolicy}
            title="Select approval mode"
            onSelect={onChangeApprovalPolicy}
          />
          <MenuPill
            icon={<Icons.Shield />}
            label={sandboxMenuLabel(sandboxMode)}
            options={sandboxOptions}
            selectedValue={sandboxMode}
            title="Select access mode"
            onSelect={onChangeSandboxMode}
          />
        </div>

        <div className="pc-input-actions">
          {activeTurn ? (
            <ActionButton
              icon={<Icons.Assistant />}
              type="button"
              variant="surface"
              disabled={composerBusy || (!composer.trim() && attachments.length === 0)}
              onClick={onSendSteer}
            >
              Steer
            </ActionButton>
          ) : null}
          <ActionButton
            icon={activeTurn ? <Icons.Queue /> : <Icons.Send />}
            type="submit"
            variant="primary"
            disabled={composerBusy || (!composer.trim() && attachments.length === 0)}
          >
            {activeTurn ? "Queue" : "Send"}
          </ActionButton>
        </div>
      </div>
    </form>
  );
}

export function EmptyConversation({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="pc-empty-conversation">
      <div className="pc-empty-conversation-backdrop" aria-hidden="true">
        <span className="pc-empty-conversation-glow is-primary" />
        <span className="pc-empty-conversation-glow is-secondary" />
        <span className="pc-empty-conversation-grid" />
      </div>
      <div className="pc-empty-conversation-copy">
        <span className="pc-empty-conversation-eyebrow">Pocket Codex</span>
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
      <div className="pc-empty-conversation-pills">
        {EMPTY_STATE_PILLS.map((pill) => (
          <span key={pill}>{pill}</span>
        ))}
      </div>
      {action ? <div className="pc-empty-conversation-action">{action}</div> : null}
    </div>
  );
}
