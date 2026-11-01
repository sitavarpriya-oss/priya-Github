import { createCompletedActionTelemetry } from "./action-telemetry.mjs";

// Each guest document has its own module instance. Tokens retain the binding
// they started with even when a newer SSE snapshot replaces the current view.
export let telemetry = createCompletedActionTelemetry();

export function bindActionTelemetry(instanceId, bindingRevision) {
	telemetry = createCompletedActionTelemetry(async (report) => {
		const response = await fetch(`/interaction/${instanceId}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Canvas-Binding": String(bindingRevision),
			},
			body: JSON.stringify(report),
			signal: AbortSignal.timeout(2_000),
		});
		if (!response.ok) throw new Error("Action report was rejected");
	});
}
