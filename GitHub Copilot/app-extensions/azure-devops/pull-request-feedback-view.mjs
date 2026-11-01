/// <reference lib="dom" />

// Adopt the app's copy/tooltip and error-toast presentation without its React,
// app stores, notification manager, or privileged clipboard bridge.
export function createFeedbackView({
	copyButton,
	tooltip,
	toast,
	toastTitle,
	toastMessage,
	toastClose,
	notice,
	fallbackFocus,
	onChange,
}) {
	const lifetime = new AbortController();
	const { signal } = lifetime;
	let tooltipLifetime;
	let tooltipTimer;
	let copiedTimer;
	let noticeTimer;
	let copied = false;
	let recoveryMessage = "";
	let toastRecovery = false;
	let toastKind = "";
	let returnFocus;

	function hideTooltip() {
		clearTimeout(tooltipTimer);
		tooltipLifetime?.abort();
		tooltipLifetime = null;
		tooltip.hidden = true;
		copyButton.removeAttribute("aria-describedby");
	}

	function showTooltip() {
		if (copyButton.getAttribute("aria-disabled") === "true") return;
		hideTooltip();
		tooltip.textContent = copied ? "Copied" : "Copy PR URL";
		tooltip.hidden = false;
		const anchor = copyButton.getBoundingClientRect();
		const bounds = tooltip.getBoundingClientRect();
		const left = anchor.left + (anchor.width - bounds.width) / 2;
		const top =
			anchor.top - bounds.height - 4 >= 8
				? anchor.top - bounds.height - 4
				: anchor.bottom + 4;
		tooltip.style.left = `${Math.max(8, Math.min(left, innerWidth - bounds.width - 8))}px`;
		tooltip.style.top = `${Math.max(8, Math.min(top, innerHeight - bounds.height - 8))}px`;
		copyButton.setAttribute("aria-describedby", tooltip.id);
		tooltipLifetime = new AbortController();
		const options = { signal: tooltipLifetime.signal, capture: true };
		document.addEventListener("scroll", hideTooltip, options);
		window.addEventListener("resize", hideTooltip, options);
		document.addEventListener(
			"pointerdown",
			(event) => {
				if (
					!copyButton.contains(event.target) &&
					!tooltip.contains(event.target)
				)
					hideTooltip();
			},
			options,
		);
		document.addEventListener(
			"keydown",
			(event) => {
				if (event.key !== "Escape") return;
				if (
					!event.defaultPrevented &&
					(copyButton.contains(document.activeElement) ||
						tooltip.contains(document.activeElement))
				) {
					event.preventDefault();
					event.stopPropagation();
				}
				hideTooltip();
			},
			options,
		);
	}

	function scheduleTooltipClose() {
		clearTimeout(tooltipTimer);
		tooltipTimer = setTimeout(hideTooltip, 100);
	}

	copyButton.addEventListener(
		"pointerenter",
		() => {
			clearTimeout(tooltipTimer);
			tooltipTimer = setTimeout(showTooltip, 100);
		},
		{ signal },
	);
	copyButton.addEventListener("pointerleave", scheduleTooltipClose, { signal });
	copyButton.addEventListener("focus", showTooltip, { signal });
	copyButton.addEventListener("blur", hideTooltip, { signal });
	tooltip.addEventListener("pointerenter", () => clearTimeout(tooltipTimer), {
		signal,
	});
	tooltip.addEventListener("pointerleave", scheduleTooltipClose, { signal });

	function dismissToast(restoreFocus = true) {
		clearTimeout(noticeTimer);
		const focused = toast.contains(document.activeElement);
		toast.hidden = true;
		toastRecovery = false;
		toastKind = "";
		if (restoreFocus && focused) {
			const target =
				returnFocus?.isConnected && !returnFocus.closest("[hidden]")
					? returnFocus
					: fallbackFocus();
			target?.focus({ preventScroll: true });
		}
		returnFocus = null;
	}

	function scheduleNoticeClose() {
		clearTimeout(noticeTimer);
		if (
			!toast.hidden &&
			toast.dataset.variant === "notice" &&
			!toast.matches(":hover") &&
			!toast.contains(document.activeElement)
		)
			noticeTimer = setTimeout(dismissToast, 5_000);
	}

	toast.addEventListener("pointerenter", () => clearTimeout(noticeTimer), {
		signal,
	});
	toast.addEventListener("pointerleave", scheduleNoticeClose, { signal });
	toast.addEventListener("focusin", () => clearTimeout(noticeTimer), {
		signal,
	});
	toast.addEventListener(
		"focusout",
		() => queueMicrotask(scheduleNoticeClose),
		{ signal },
	);
	toastClose.addEventListener("click", () => dismissToast(), { signal });
	toast.addEventListener(
		"keydown",
		(event) => {
			if (event.key !== "Escape" || event.defaultPrevented) return;
			event.preventDefault();
			event.stopPropagation();
			dismissToast();
		},
		{ signal },
	);

	function clearCopy() {
		clearTimeout(copiedTimer);
		copied = false;
		delete copyButton.dataset.copied;
		hideTooltip();
	}

	function showToast(title, message, recovery, kind, variant) {
		clearTimeout(noticeTimer);
		if (!toast.contains(document.activeElement))
			returnFocus =
				document.activeElement instanceof HTMLElement &&
				document.activeElement !== document.body
					? document.activeElement
					: null;
		toastTitle.textContent = title;
		toastMessage.textContent = message;
		toastRecovery = recovery;
		toastKind = kind;
		toast.dataset.variant = variant;
		toastClose.setAttribute("aria-label", `Close notification: ${title}`);
		toast.hidden = false;
		notice.textContent = message;
		onChange();
	}

	return {
		recoveryMessage: () => recoveryMessage,
		setRecovery(message) {
			recoveryMessage = message;
			onChange();
		},
		clearRecovery() {
			if (toastRecovery) dismissToast();
			recoveryMessage = "";
			onChange();
		},
		clearRead(kind) {
			if (!toastRecovery && toastKind === `read:${kind}`) dismissToast();
		},
		error(
			title,
			message,
			{ recovery = true, replaceRecovery = false, kind = "" } = {},
		) {
			if (recovery && (replaceRecovery || !recoveryMessage))
				recoveryMessage = message;
			showToast(title, message, recovery, kind, "error");
		},
		message(title, message) {
			showToast(title, message, false, "notice", "notice");
			scheduleNoticeClose();
		},
		copied() {
			clearCopy();
			copied = true;
			copyButton.dataset.copied = "true";
			showTooltip();
			notice.textContent = "PR URL copied.";
			copiedTimer = setTimeout(clearCopy, 1500);
		},
		clearCopy,
		reset() {
			clearCopy();
			dismissToast(false);
			recoveryMessage = "";
		},
		dispose() {
			clearCopy();
			dismissToast(false);
			lifetime.abort();
		},
	};
}
