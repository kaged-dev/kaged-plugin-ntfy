import type { NotificationEvent } from "@kaged/plugin-types";

function requireString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`notification event field ${field} must be a non-empty string`);
	}

	return value;
}

export function renderTitle(event: NotificationEvent): string {
	const projectId = requireString(event.project_id, "project_id");
	const summary = requireString(event.summary, "summary");

	if (event.class === "attention.required") {
		return `kaged ⚑ ${projectId}: ${summary}`;
	}

	return `kaged ✓ ${projectId}: ${summary}`;
}

export function renderBody(event: NotificationEvent): string {
	const sessionId = requireString(event.session_id, "session_id");

	if (event.class === "attention.required") {
		const attentionKind = requireString(event.attention_kind, "attention_kind");
		return `Session "${sessionId}" needs you: ${attentionKind}`;
	}

	const runOutcome = requireString(event.run_outcome, "run_outcome");
	return `Session "${sessionId}" completed (outcome: ${runOutcome})`;
}

export function renderTags(event: NotificationEvent): string[] {
	const projectId = requireString(event.project_id, "project_id");
	return ["kaged", event.class === "attention.required" ? "attention" : "completed", projectId];
}
