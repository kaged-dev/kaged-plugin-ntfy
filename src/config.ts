export interface NtfyConfig {
	server?: string;
	topic?: string;
	auth_token_env?: string;
	auth_token?: string;
	priority_attention?: string;
	priority_completion?: string;
	click_base_url?: string;
	timeout_ms?: number;
	retry_count?: number;
	retry_delay_ms?: number;
}

export interface ValidatedConfig {
	server: string;
	topic: string;
	auth_token_env?: string;
	auth_token?: string;
	priority_attention: "default" | "high" | "urgent";
	priority_completion: "min" | "low" | "default" | "high";
	click_base_url?: string;
	timeout_ms: number;
	retry_count: number;
	retry_delay_ms: number;
}

type ValidationLogger = {
	warn(message: string, data?: Record<string, unknown>): void;
	error(message: string, data?: Record<string, unknown>): void;
};

const ATTENTION_PRIORITIES = new Set(["default", "high", "urgent"] as const);
const COMPLETION_PRIORITIES = new Set(["min", "low", "default", "high"] as const);

function asObject(value: unknown): Record<string, unknown> {
	if (typeof value === "object" && value !== null) {
		return value as Record<string, unknown>;
	}

	return {};
}

function readOptionalString(source: Record<string, unknown>, key: string): string | undefined {
	const value = source[key];
	if (value === undefined) {
		return undefined;
	}

	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeUrl(raw: string, label: string, logger?: ValidationLogger): string | null {
	try {
		const url = new URL(raw);
		if (url.protocol !== "https:") {
			logger?.error(`${label} must use https`, { value: raw });
			return null;
		}

		return url.toString().replace(/\/$/, "");
	} catch {
		logger?.error(`${label} must be a valid URL`, { value: raw });
		return null;
	}
}

function clampNumber(
	value: unknown,
	fallback: number,
	min: number,
	max: number,
	label: string,
	logger?: ValidationLogger,
): number {
	if (value === undefined) {
		return fallback;
	}

	if (typeof value !== "number" || !Number.isFinite(value)) {
		logger?.warn(`${label} must be a finite number; using default`, { value, fallback });
		return fallback;
	}

	const integer = Math.trunc(value);
	if (integer < min || integer > max) {
		const clamped = Math.min(max, Math.max(min, integer));
		logger?.warn(`${label} out of range; clamped`, { value: integer, clamped, min, max });
		return clamped;
	}

	return integer;
}

function readPriority<T extends string>(
	value: unknown,
	fallback: T,
	allowed: Set<T>,
	label: string,
	logger?: ValidationLogger,
): T {
	if (value === undefined) {
		return fallback;
	}

	if (typeof value !== "string") {
		logger?.warn(`${label} must be a string; using default`, { value, fallback });
		return fallback;
	}

	if (allowed.has(value as T)) {
		return value as T;
	}

	logger?.warn(`${label} not in allowed set; using default`, { value, fallback });
	return fallback;
}

export function mergeConfig(
	base: ValidatedConfig,
	override: Record<string, unknown>,
): Record<string, unknown> {
	const merged: Record<string, unknown> = { ...base, ...override };

	if (Object.hasOwn(override, "auth_token")) {
		delete merged.auth_token_env;
	}

	if (Object.hasOwn(override, "auth_token_env")) {
		delete merged.auth_token;
	}

	return merged;
}

export function resolveAuthToken(
	config: Pick<ValidatedConfig, "auth_token" | "auth_token_env">,
	env: Record<string, string | undefined>,
): string | undefined {
	if (config.auth_token) {
		return config.auth_token;
	}

	if (config.auth_token_env) {
		return env[config.auth_token_env];
	}

	return undefined;
}

export function validateConfig(
	config: unknown,
	env: Record<string, string | undefined>,
	logger?: ValidationLogger,
): ValidatedConfig | null {
	void env;

	const source = asObject(config);
	const server = readOptionalString(source, "server");
	if (!server) {
		logger?.error("server is required");
		return null;
	}

	const normalizedServer = normalizeUrl(server, "server", logger);
	if (!normalizedServer) {
		return null;
	}

	const topic = readOptionalString(source, "topic");
	if (!topic) {
		logger?.error("topic is required");
		return null;
	}

	if (/\s|\//.test(topic)) {
		logger?.error("topic must not contain whitespace or '/'", { topic });
		return null;
	}

	const authToken = readOptionalString(source, "auth_token");
	const authTokenEnv = readOptionalString(source, "auth_token_env");
	if (authToken && authTokenEnv) {
		logger?.error("auth_token and auth_token_env are mutually exclusive");
		return null;
	}

	const clickBaseUrlRaw = readOptionalString(source, "click_base_url");
	const clickBaseUrl = clickBaseUrlRaw
		? (normalizeUrl(clickBaseUrlRaw, "click_base_url", logger) ?? undefined)
		: undefined;
	if (clickBaseUrlRaw && !clickBaseUrl) {
		return null;
	}

	return {
		server: normalizedServer,
		topic,
		auth_token: authToken,
		auth_token_env: authTokenEnv,
		priority_attention: readPriority(
			source.priority_attention,
			"urgent",
			ATTENTION_PRIORITIES,
			"priority_attention",
			logger,
		),
		priority_completion: readPriority(
			source.priority_completion,
			"low",
			COMPLETION_PRIORITIES,
			"priority_completion",
			logger,
		),
		click_base_url: clickBaseUrl,
		timeout_ms: clampNumber(source.timeout_ms, 5000, 1000, 30000, "timeout_ms", logger),
		retry_count: clampNumber(source.retry_count, 2, 0, 5, "retry_count", logger),
		retry_delay_ms: clampNumber(source.retry_delay_ms, 1000, 100, 10000, "retry_delay_ms", logger),
	};
}
