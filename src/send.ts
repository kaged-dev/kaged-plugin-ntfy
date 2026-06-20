import type { DeliveryOutcome, NotificationEvent } from "@kaged/plugin-types";
import type { ValidatedConfig } from "./config.ts";
import { resolveAuthToken, validateConfig } from "./config.ts";
import { renderBody, renderTags, renderTitle } from "./render.ts";

type Logger = {
	warn(message: string, data?: Record<string, unknown>): void;
	error(message: string, data?: Record<string, unknown>): void;
};

type SendDeps = {
	fetchImpl?: typeof fetch;
	sleep?: (ms: number) => Promise<void>;
	env?: Record<string, string | undefined>;
	logger?: Logger;
};

interface ResolvedSendConfig extends ValidatedConfig {
	title: string;
	body: string;
	tags: string[];
	priority: string;
	authToken?: string;
}

function buildClickUrl(baseUrl: string, deepLink: string): string {
	return new URL(deepLink, baseUrl).toString();
}

function transientReason(message: string): DeliveryOutcome {
	return { status: "failed", reason: `transient: ${message}`, retryable: true };
}

function parseRetryAfter(value: string | null): number | null {
	if (!value) {
		return null;
	}

	const seconds = Number(value);
	if (Number.isFinite(seconds) && seconds >= 0) {
		return Math.trunc(seconds * 1000);
	}

	const dateValue = Date.parse(value);
	if (Number.isNaN(dateValue)) {
		return null;
	}

	return Math.max(0, dateValue - Date.now());
}

function resolveMergedConfig(
	config: ValidatedConfig,
	env: Record<string, string | undefined>,
	event: NotificationEvent,
): ResolvedSendConfig {
	return {
		...config,
		title: renderTitle(event),
		body: renderBody(event),
		tags: renderTags(event),
		priority:
			event.class === "attention.required" ? config.priority_attention : config.priority_completion,
		authToken: resolveAuthToken(config, env),
	};
}

export function validateMergedConfig(
	base: ValidatedConfig,
	override: Record<string, unknown>,
	env: Record<string, string | undefined>,
): ValidatedConfig | null {
	const merged: Record<string, unknown> = { ...base, ...override };

	if (Object.hasOwn(override, "auth_token")) {
		delete merged.auth_token_env;
	}

	if (Object.hasOwn(override, "auth_token_env")) {
		delete merged.auth_token;
	}

	return validateConfig(merged, env);
}

export async function performSend(
	config: ValidatedConfig,
	event: NotificationEvent,
	deps: SendDeps = {},
): Promise<DeliveryOutcome> {
	const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
	const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
	const logger = deps.logger;
	const merged = resolveMergedConfig(config, deps.env ?? process.env, event);

	const url = `${merged.server}/${encodeURIComponent(merged.topic)}`;
	const headers: Record<string, string> = {
		Title: merged.title,
		Tags: merged.tags.join(","),
		Priority: merged.priority,
	};

	if (merged.click_base_url) {
		headers.Click = buildClickUrl(merged.click_base_url, event.deep_link);
	}

	const token = merged.authToken;
	if (token) {
		headers.Authorization = `Bearer ${token}`;
	}

	let lastTransient = "request failed";

	for (let attempt = 0; attempt <= merged.retry_count; attempt += 1) {
		try {
			const response = await fetchImpl(url, {
				method: "POST",
				headers,
				body: merged.body,
				signal: AbortSignal.timeout(merged.timeout_ms),
			});

			if (response.ok) {
				return {
					status: "delivered",
					external_id: response.headers.get("id") ?? undefined,
				};
			}

			if (response.status >= 400 && response.status < 500 && response.status !== 429) {
				logger?.error("ntfy client error", { status: response.status });
				return {
					status: "failed",
					reason: `client_error: ${response.status}`,
					retryable: false,
				};
			}

			lastTransient = `HTTP ${response.status}`;
			logger?.warn("ntfy transient response", {
				status: response.status,
				attempt,
			});

			if (attempt < merged.retry_count) {
				const retryAfter =
					response.status === 429 ? parseRetryAfter(response.headers.get("Retry-After")) : null;
				await sleep(retryAfter ?? merged.retry_delay_ms);
				continue;
			}
		} catch (error) {
			lastTransient = error instanceof Error ? error.message : String(error);
			logger?.warn("ntfy request failed", { attempt, error: lastTransient });

			if (attempt < merged.retry_count) {
				await sleep(merged.retry_delay_ms);
				continue;
			}
		}

		break;
	}

	logger?.error("ntfy delivery failed after retries", { reason: lastTransient });
	return transientReason(lastTransient);
}
