const commonKeys = ["actionId", "phase", "action", "stage", "entryPoint"];
const detailKeys = [
	"errorCode",
	"errorStage",
	"httpStatus",
	"responseBytes",
	"choiceCount",
	"pageCount",
];
const finishedKeys = [...commonKeys, "result", "durationMs", ...detailKeys];

function isLabel(value) {
	return typeof value === "string" && /^[a-z][a-z0-9_]*$/.test(value);
}

export function safeActionError(error) {
	let errorCode = "unknown";
	if (error?.name === "AbortError") errorCode = "aborted";
	else if (error?.name === "TimeoutError") errorCode = "timeout";
	else if (error?.code === "invalid-response") errorCode = "invalid_response";
	else if (error?.code === "invalid-selection") errorCode = "invalid_selection";
	else if (["stale-thread-code", "stale-changes"].includes(error?.code))
		errorCode = "stale";
	else if (error?.code === "request-failed") errorCode = "request_failed";
	else if (error?.code === "too-large") errorCode = "response_too_large";
	else if (
		["missing-project-context", "no-iterations", "unsupported-diff"].includes(
			error?.code,
		)
	)
		errorCode = "invalid_response";
	else if (isLabel(error?.code)) errorCode = error.code;
	else if (Number.isInteger(error?.status)) errorCode = "http";
	return {
		errorCode,
		...(typeof error?.status === "number" ? { httpStatus: error.status } : {}),
	};
}

export function isActionReport(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	if (
		typeof value.actionId !== "string" ||
		!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value.actionId) ||
		![value.action, value.stage, value.entryPoint].every(isLabel)
	)
		return false;
	switch (value.phase) {
		case "started":
			return Object.keys(value).every((key) => commonKeys.includes(key));
		case "finished":
			return (
				Object.keys(value).every((key) => finishedKeys.includes(key)) &&
				isLabel(value.result) &&
				typeof value.durationMs === "number"
			);
		default:
			return false;
	}
}

export function createCanvasActionTelemetry(
	reportCanvasAction,
	canvasId,
	instanceId,
) {
	return createActionTelemetry(
		reportCanvasAction
			? (report) => reportCanvasAction({ ...report, canvasId, instanceId })
			: undefined,
	);
}

/** UI-only actions need one completion report, not two loopback requests. */
export function createCompletedActionTelemetry(report) {
	return createActionTelemetry(
		report
			? (value) => {
					if (value.phase === "finished") return report(value);
				}
			: undefined,
	);
}

export function createActionTelemetry(report) {
	function send(value) {
		if (!report) return;
		try {
			if (!isActionReport(value)) throw new Error("Invalid action report");
			const pending = report(value);
			if (pending?.catch)
				pending.catch(() =>
					console.error("Canvas action telemetry was not delivered"),
				);
		} catch {
			console.error("Canvas action telemetry was not delivered");
		}
	}
	return {
		report: send,
		start(action, stage, entryPoint = "guest") {
			const context = {
				actionId: crypto.randomUUID(),
				action,
				stage,
				entryPoint,
			};
			const started = performance.now();
			let finished = false;
			send({ ...context, phase: "started" });
			return {
				finish(result, details = {}) {
					if (finished) return;
					finished = true;
					send({
						...context,
						phase: "finished",
						result,
						durationMs: Math.round(performance.now() - started),
						...Object.fromEntries(
							detailKeys
								.filter((key) => details[key] !== undefined)
								.map((key) => [key, details[key]]),
						),
					});
				},
			};
		},
	};
}
