/** @typedef {"outside-pointer" | "escape" | "focus-loss" | "programmatic" | "scroll" | "resize"} CloseReason */
let activePopup = null;

export function closePopupWithin(host) {
	if (activePopup && host.contains(activePopup.trigger))
		activePopup.close("programmatic", false);
}

export function popupTriggerWithin(host) {
	return activePopup && host.contains(activePopup.trigger)
		? activePopup.trigger
		: null;
}

// The guest has no app React context. Keep popup listeners limited to the open
// surface; measure on opening, never on refresh, scroll, or a hidden tab.
/**
 * @param {HTMLElement} trigger
 * @param {HTMLElement} content
 * @param {(reason: CloseReason) => void} onClose
 * @param {"start" | "end"} [align]
 */
export function openPopup(trigger, content, onClose, align = "start") {
	activePopup?.close("programmatic", false);
	const controller = new AbortController();
	const { signal } = controller;
	let closed = false;
	/** @param {CloseReason} [reason] */
	function close(reason = "programmatic", restoreFocus = true) {
		if (closed) return;
		closed = true;
		controller.abort();
		activePopup = null;
		trigger.setAttribute("aria-expanded", "false");
		onClose(reason);
		if (restoreFocus && trigger.isConnected)
			trigger.focus({ preventScroll: true });
	}
	activePopup = { trigger, close };
	content.hidden = false;
	content.style.height = "";
	trigger.setAttribute("aria-expanded", "true");
	const anchor = trigger.getBoundingClientRect();
	const bounds = content.getBoundingClientRect();
	const height = Math.min(bounds.height, window.innerHeight - 16);
	const left = align === "end" ? anchor.right - bounds.width : anchor.left;
	const top =
		anchor.bottom + 4 + height <= window.innerHeight - 8
			? anchor.bottom + 4
			: anchor.top - height - 4;
	content.style.left = `${Math.max(8, Math.min(left, window.innerWidth - bounds.width - 8))}px`;
	content.style.top = `${Math.max(8, Math.min(top, window.innerHeight - height - 8))}px`;
	content.style.height = `${height}px`;
	const scrollPositions = new Map();
	for (
		let parent = trigger.parentElement;
		parent;
		parent = parent.parentElement
	)
		scrollPositions.set(parent, [parent.scrollLeft, parent.scrollTop]);
	const outside = (event, reason) => {
		if (!content.contains(event.target) && !trigger.contains(event.target)) {
			close(reason, false);
		}
	};
	document.addEventListener(
		"pointerdown",
		(event) => outside(event, "outside-pointer"),
		{ capture: true, signal },
	);
	document.addEventListener(
		"focusin",
		(event) => outside(event, "focus-loss"),
		{ signal },
	);
	document.addEventListener(
		"scroll",
		(event) => {
			const target =
				event.target === document ? document.scrollingElement : event.target;
			if (!(target instanceof Element)) return;
			const initial = scrollPositions.get(target);
			// Focus/click scrolling can deliver its event after this popup opens.
			// Dismiss only if an ancestor actually moved since positioning.
			if (
				initial &&
				(target.scrollLeft !== initial[0] || target.scrollTop !== initial[1])
			)
				close("scroll");
		},
		{ capture: true, signal },
	);
	window.addEventListener("resize", () => close("resize"), { signal });
	document.addEventListener(
		"keydown",
		(event) => {
			if (event.key === "Escape" && !event.defaultPrevented) {
				event.preventDefault();
				event.stopPropagation();
				close("escape", content.contains(document.activeElement));
			}
		},
		{ capture: true, signal },
	);
	return close;
}
