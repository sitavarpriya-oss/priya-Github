/// <reference lib="dom" />

let nextMaskId = 0;

function svg(viewBox, className, size = 16) {
	const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	icon.setAttribute("viewBox", viewBox);
	icon.setAttribute("width", String(size));
	icon.setAttribute("height", String(size));
	icon.setAttribute("fill", "none");
	icon.setAttribute("aria-hidden", "true");
	icon.setAttribute("focusable", "false");
	if (className) icon.classList.add(className);
	return icon;
}

function menuIcon(paths, className = "action-menu-icon") {
	const icon = svg("0 0 24 24", className);
	for (const d of paths) {
		const path = document.createElementNS(icon.namespaceURI, "path");
		path.setAttribute("d", d);
		path.setAttribute("stroke", "currentColor");
		path.setAttribute("stroke-width", "2");
		path.setAttribute("stroke-linecap", "round");
		path.setAttribute("stroke-linejoin", "round");
		icon.append(path);
	}
	return icon;
}

function lucideIcon(className, size = 16) {
	const icon = svg("0 0 24 24", className, size);
	icon.setAttribute("stroke", "currentColor");
	icon.setAttribute("stroke-width", "2");
	icon.setAttribute("stroke-linecap", "round");
	icon.setAttribute("stroke-linejoin", "round");
	return icon;
}

export function createGitHubBranchIcon(className) {
	const icon = lucideIcon(className);
	const path = document.createElementNS(icon.namespaceURI, "path");
	path.setAttribute("d", "M15 6a9 9 0 0 0-9 9V3");
	const head = document.createElementNS(icon.namespaceURI, "circle");
	head.setAttribute("cx", "18");
	head.setAttribute("cy", "6");
	head.setAttribute("r", "3");
	const base = document.createElementNS(icon.namespaceURI, "circle");
	base.setAttribute("cx", "6");
	base.setAttribute("cy", "18");
	base.setAttribute("r", "3");
	icon.append(path, head, base);
	return icon;
}

export function createGitHubPullRequestIcon(className) {
	const icon = lucideIcon(className);
	const head = document.createElementNS(icon.namespaceURI, "circle");
	head.setAttribute("cx", "18");
	head.setAttribute("cy", "18");
	head.setAttribute("r", "3");
	const base = document.createElementNS(icon.namespaceURI, "circle");
	base.setAttribute("cx", "6");
	base.setAttribute("cy", "6");
	base.setAttribute("r", "3");
	const path = document.createElementNS(icon.namespaceURI, "path");
	path.setAttribute("d", "M13 6h3a2 2 0 0 1 2 2v7");
	const line = document.createElementNS(icon.namespaceURI, "line");
	line.setAttribute("x1", "6");
	line.setAttribute("x2", "6");
	line.setAttribute("y1", "9");
	line.setAttribute("y2", "21");
	icon.append(head, base, path, line);
	return icon;
}

export function createGitHubReturnIcon(className) {
	const icon = lucideIcon(className, 14);
	for (const d of ["m15 10 5 5-5 5", "M4 4v7a4 4 0 0 0 4 4h12"]) {
		const path = document.createElementNS(icon.namespaceURI, "path");
		path.setAttribute("d", d);
		icon.append(path);
	}
	return icon;
}

export function createGitHubRepoIcon(className, size = 14) {
	const icon = lucideIcon(className, size);
	for (const d of [
		"M18 19a5 5 0 0 1-5-5v8",
		"M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v5",
	]) {
		const path = document.createElementNS(icon.namespaceURI, "path");
		path.setAttribute("d", d);
		icon.append(path);
	}
	for (const [cx, cy] of [
		[13, 12],
		[20, 19],
	]) {
		const circle = document.createElementNS(icon.namespaceURI, "circle");
		circle.setAttribute("cx", String(cx));
		circle.setAttribute("cy", String(cy));
		circle.setAttribute("r", "2");
		icon.append(circle);
	}
	return icon;
}

function filledCircle(kind, className) {
	const icon = svg("0 0 16 16", className);
	const maskId = `ado-github-status-${++nextMaskId}`;
	const mask = document.createElementNS(icon.namespaceURI, "mask");
	mask.id = maskId;
	mask.setAttribute("x", "0");
	mask.setAttribute("y", "0");
	mask.setAttribute("width", "16");
	mask.setAttribute("height", "16");
	mask.setAttribute("maskUnits", "userSpaceOnUse");
	const background = document.createElementNS(icon.namespaceURI, "rect");
	background.setAttribute("width", "16");
	background.setAttribute("height", "16");
	background.setAttribute("fill", "white");
	mask.append(background);
	for (const d of kind === "success"
		? ["M5.25 8.25 7 10l3.75-3.75"]
		: ["M5.6 5.6 10.4 10.4", "M10.4 5.6 5.6 10.4"]) {
		const mark = document.createElementNS(icon.namespaceURI, "path");
		mark.setAttribute("d", d);
		mark.setAttribute("stroke", "black");
		mark.setAttribute("stroke-width", "1.85");
		mark.setAttribute("stroke-linecap", "round");
		if (kind === "success") mark.setAttribute("stroke-linejoin", "round");
		mask.append(mark);
	}
	const circle = document.createElementNS(icon.namespaceURI, "circle");
	circle.setAttribute("cx", "8");
	circle.setAttribute("cy", "8");
	circle.setAttribute("r", "7");
	circle.setAttribute("fill", "currentColor");
	circle.setAttribute("mask", `url(#${maskId})`);
	icon.append(mask, circle);
	return icon;
}

function comment(className) {
	const icon = svg("0 0 24 24", className);
	const path = document.createElementNS(icon.namespaceURI, "path");
	path.setAttribute(
		"d",
		"M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719",
	);
	path.setAttribute("stroke", "currentColor");
	path.setAttribute("stroke-width", "2");
	path.setAttribute("stroke-linecap", "round");
	path.setAttribute("stroke-linejoin", "round");
	icon.append(path);
	return icon;
}

function clock(className) {
	const icon = svg("0 0 24 24", className);
	const circle = document.createElementNS(icon.namespaceURI, "circle");
	circle.setAttribute("cx", "12");
	circle.setAttribute("cy", "12");
	circle.setAttribute("r", "10");
	circle.setAttribute("stroke", "currentColor");
	circle.setAttribute("stroke-width", "2");
	const hands = document.createElementNS(icon.namespaceURI, "path");
	hands.setAttribute("d", "M12 6v6l4 2");
	hands.setAttribute("stroke", "currentColor");
	hands.setAttribute("stroke-width", "2");
	hands.setAttribute("stroke-linecap", "round");
	hands.setAttribute("stroke-linejoin", "round");
	icon.append(circle, hands);
	return icon;
}

function dot(className) {
	const icon = svg("0 0 16 16", className);
	const circle = document.createElementNS(icon.namespaceURI, "circle");
	circle.setAttribute("cx", "8");
	circle.setAttribute("cy", "8");
	circle.setAttribute("r", "3.5");
	circle.setAttribute("fill", "currentColor");
	icon.append(circle);
	return icon;
}

export function createGitHubStatusIcon(state, className) {
	if (state === "success" || state === "danger")
		return filledCircle(state, className);
	if (state === "comment") return comment(className);
	if (state === "pending") return clock(className);
	return dot(className);
}

export function createGitHubEllipsisIcon(className) {
	const icon = svg("0 0 24 24", className);
	for (const cx of ["5", "12", "19"]) {
		const circle = document.createElementNS(icon.namespaceURI, "circle");
		circle.setAttribute("cx", cx);
		circle.setAttribute("cy", "12");
		circle.setAttribute("r", "1");
		circle.setAttribute("fill", "currentColor");
		icon.append(circle);
	}
	return icon;
}

export function createGitHubLinkIcon() {
	return menuIcon([
		"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",
		"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
	]);
}

export function createGitHubExternalLinkIcon() {
	return menuIcon(
		[
			"M15 3h6v6",
			"M10 14 21 3",
			"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
		],
		"check-details-icon",
	);
}

export function createCopilotIcon() {
	const icon = svg("0 0 16 16", "copilot-fix-icon");
	for (const d of [
		"M7.998 15.035c-4.562 0-7.873-2.914-7.998-3.749V9.338c.085-.628.677-1.686 1.588-2.065.013-.07.024-.143.036-.218.029-.183.06-.384.126-.612-.201-.508-.254-1.084-.254-1.656 0-.87.128-1.769.693-2.484.579-.733 1.494-1.124 2.724-1.261 1.206-.134 2.262.034 2.944.765.05.053.096.108.139.165.044-.057.094-.112.143-.165.682-.731 1.738-.899 2.944-.765 1.23.137 2.145.528 2.724 1.261.566.715.693 1.614.693 2.484 0 .572-.053 1.148-.254 1.656.066.228.098.429.126.612.012.076.024.148.037.218.924.385 1.522 1.471 1.591 2.095v1.872c0 .766-3.351 3.795-8.002 3.795Zm0-1.485c2.28 0 4.584-1.11 5.002-1.433V7.862l-.023-.116c-.49.21-1.075.291-1.727.291-1.146 0-2.059-.327-2.71-.991A3.222 3.222 0 0 1 8 6.303a3.24 3.24 0 0 1-.544.743c-.65.664-1.563.991-2.71.991-.652 0-1.236-.081-1.727-.291l-.023.116v4.255c.419.323 2.722 1.433 5.002 1.433ZM6.762 2.83c-.193-.206-.637-.413-1.682-.297-1.019.113-1.479.404-1.713.7-.247.312-.369.789-.369 1.554 0 .793.129 1.171.308 1.371.162.181.519.379 1.442.379.853 0 1.339-.235 1.638-.54.315-.322.527-.827.617-1.553.117-.935-.037-1.395-.241-1.614Zm4.155-.297c-1.044-.116-1.488.091-1.681.297-.204.219-.359.679-.242 1.614.091.726.303 1.231.618 1.553.299.305.784.54 1.638.54.922 0 1.28-.198 1.442-.379.179-.2.308-.578.308-1.371 0-.765-.123-1.242-.37-1.554-.233-.296-.693-.587-1.713-.7Z",
		"M6.25 9.037a.75.75 0 0 1 .75.75v1.501a.75.75 0 0 1-1.5 0V9.787a.75.75 0 0 1 .75-.75Zm4.25.75v1.501a.75.75 0 0 1-1.5 0V9.787a.75.75 0 0 1 1.5 0Z",
	]) {
		const path = document.createElementNS(icon.namespaceURI, "path");
		path.setAttribute("d", d);
		path.setAttribute("fill", "currentColor");
		icon.append(path);
	}
	return icon;
}

export function createGitHubPencilIcon() {
	return menuIcon([
		"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
		"m15 5 4 4",
	]);
}

export function createGitHubCodeIcon() {
	return menuIcon(["m16 18 6-6-6-6", "m8 6-6 6 6 6"]);
}

export function createGitHubTrashIcon() {
	return menuIcon([
		"M10 11v6",
		"M14 11v6",
		"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",
		"M3 6h18",
		"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
	]);
}
