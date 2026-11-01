import { telemetry } from "./pull-request-telemetry.mjs";

export function createDescriptionView(content, trigger) {
	const frame = content.parentElement;
	let active = false;
	let expanded = false;
	let overflowing = false;

	function update() {
		frame.dataset.collapsed = String(overflowing && !expanded);
		trigger.hidden = !overflowing;
		trigger.setAttribute("aria-expanded", String(expanded));
	}

	const observer = new ResizeObserver(([entry]) => {
		if (entry.contentRect.height <= 0) return;
		const limit =
			Number.parseFloat(getComputedStyle(document.documentElement).fontSize) *
			17.5;
		overflowing = entry.contentRect.height > limit;
		if (!overflowing && document.activeElement === trigger) content.focus();
		update();
	});

	trigger.addEventListener("click", () => {
		const action = telemetry.start(
			expanded ? "collapse" : "expand",
			"description",
		);
		expanded = !expanded;
		update();
		action.finish("success");
	});
	// Keyboard navigation must never land on a control clipped by the preview.
	content.addEventListener("focusin", (event) => {
		if (overflowing && !expanded) {
			expanded = true;
			update();
			event.target.scrollIntoView({ block: "nearest" });
		}
	});
	function onDisclosureToggle(event) {
		if (
			!(event.target instanceof HTMLDetailsElement) ||
			!event.target.open ||
			expanded
		)
			return;
		expanded = true;
		update();
	}
	// Native toggle events do not bubble; capture nested disclosures.
	content.addEventListener("toggle", onDisclosureToggle, true);

	return {
		setActive(next) {
			if (active === next) return;
			active = next;
			if (active) observer.observe(content);
			else observer.disconnect();
		},
		clear() {
			expanded = overflowing = false;
			observer.disconnect();
			if (active) observer.observe(content);
			update();
		},
		dispose() {
			observer.disconnect();
			content.removeEventListener("toggle", onDisclosureToggle, true);
		},
	};
}
