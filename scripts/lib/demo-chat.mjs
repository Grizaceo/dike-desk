import { redactText } from "./demo-output.mjs";

function toDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Messages of a thread detail body; empty when the payload is unusable. */
export function threadMessages(detail) {
  const data = detail?.threadData;
  if (!data) return [];
  let parsed;
  try {
    parsed = typeof data === "string" ? JSON.parse(data) : data;
  } catch {
    return [];
  }
  return Array.isArray(parsed?.messages) ? parsed.messages : [];
}

/** Ids of threads created at or after the run started, from list metadata only. */
export function freshThreadIds(threads, runStartedAt) {
  if (!Array.isArray(threads) || !(runStartedAt instanceof Date)) return [];
  return threads
    .filter((thread) => {
      const created = toDate(thread?.createdAt);
      return (
        typeof thread?.id === "string" &&
        created !== null &&
        created >= runStartedAt
      );
    })
    .map((thread) => thread.id);
}

function inRun(message, since) {
  const created = toDate(message?.message?.createdAt);
  return created !== null && created >= since;
}

/** A user message at or after `since` that carries `marker`. */
export function threadHasMarker(detail, marker, since) {
  if (!(since instanceof Date)) return false;
  return threadMessages(detail).some(
    (entry) =>
      entry?.message?.role === "user" &&
      inRun(entry, since) &&
      JSON.stringify(entry.message.content ?? "").includes(marker),
  );
}

export function isConfirmedTurn(turn) {
  return (
    typeof turn?.threadId === "string" &&
    turn.threadId.length > 0 &&
    turn.markerConfirmed === true
  );
}

/** Redacted text of this run's messages: tool names only, no args or results. */
export function formatTranscript(detail, { threadId, label, startedAt }) {
  const lines = [`# Thread ${threadId}`, `# label: ${label}`, ""];
  for (const entry of threadMessages(detail)) {
    if (!inRun(entry, startedAt)) continue;
    const message = entry.message;
    if (message.role !== "user" && message.role !== "assistant") continue;
    lines.push(`===== ${message.role ?? "?"} ${message.createdAt ?? ""}`);
    const parts = Array.isArray(message.content) ? message.content : [];
    for (const part of parts) {
      if (part.type === "text") lines.push(redactText(part.text ?? ""));
      else if (part.type === "tool-call" && message.role === "assistant")
        lines.push(`>> tool-call ${redactText(String(part.toolName ?? "?"))}`);
      else lines.push(`[part ${part.type}]`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
