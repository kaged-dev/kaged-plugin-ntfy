import { describe, expect, test } from "bun:test";
import { renderBody, renderTitle } from "../src/render.ts";

const attentionKinds = ["checkpoint", "ask", "approval_gate"] as const;
const outcomes = ["success", "failed", "cancelled"] as const;

describe("renderTitle", () => {
	for (const attentionKind of attentionKinds) {
		test(`renders attention title for ${attentionKind}`, () => {
			expect(
				renderTitle({
					id: "evt_1",
					class: "attention.required",
					session_id: "session/1",
					project_id: "proj:weird/[x]",
					run_id: "run_1",
					summary: `Need operator for ${attentionKind}`,
					deep_link: "/projects/p/sessions/s",
					emitted_at: 1,
					attention_kind: attentionKind,
				}),
			).toBe(`kaged ⚑ proj:weird/[x]: Need operator for ${attentionKind}`);
		});
	}

	for (const outcome of outcomes) {
		test(`renders completion title for ${outcome}`, () => {
			expect(
				renderTitle({
					id: "evt_2",
					class: "run.completed",
					session_id: "session/1",
					project_id: "proj:weird/[x]",
					run_id: "run_1",
					summary: `Run ended as ${outcome}`,
					deep_link: "/projects/p/sessions/s",
					emitted_at: 1,
					run_outcome: outcome,
				}),
			).toBe(`kaged ✓ proj:weird/[x]: Run ended as ${outcome}`);
		});
	}
});

describe("renderBody", () => {
	for (const attentionKind of attentionKinds) {
		test(`renders attention body for ${attentionKind}`, () => {
			expect(
				renderBody({
					id: "evt_1",
					class: "attention.required",
					session_id: "session special/1",
					project_id: "project-1",
					run_id: "run_1",
					summary: "Need operator",
					deep_link: "/projects/p/sessions/s",
					emitted_at: 1,
					attention_kind: attentionKind,
				}),
			).toBe(`Session "session special/1" needs you: ${attentionKind}`);
		});
	}

	for (const outcome of outcomes) {
		test(`renders completion body for ${outcome}`, () => {
			expect(
				renderBody({
					id: "evt_2",
					class: "run.completed",
					session_id: "session special/1",
					project_id: "project-1",
					run_id: "run_1",
					summary: "Completed",
					deep_link: "/projects/p/sessions/s",
					emitted_at: 1,
					run_outcome: outcome,
				}),
			).toBe(`Session "session special/1" completed (outcome: ${outcome})`);
		});
	}
});
