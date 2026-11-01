/** HTTP URL policy owned by this portable package, including raw-host checks. */
function rawUrlHost(url) {
	const schemeMatch = /^https?:[\\/]{0,2}/i.exec(url);
	if (!schemeMatch) return "";
	const rest = url.slice(schemeMatch[0].length);
	const authorityEnd = rest.search(/[\\/?#]/);
	const authority = authorityEnd === -1 ? rest : rest.slice(0, authorityEnd);
	const hostWithPort = authority.slice(authority.lastIndexOf("@") + 1);
	if (hostWithPort.startsWith("[")) {
		const bracketEnd = hostWithPort.indexOf("]");
		return bracketEnd === -1
			? hostWithPort
			: hostWithPort.slice(0, bracketEnd + 1);
	}
	const portStart = hostWithPort.indexOf(":");
	return portStart === -1 ? hostWithPort : hostWithPort.slice(0, portStart);
}

export function isHttpUrlWithHost(url) {
	if (!/^https?:\/\//i.test(url)) return false;
	for (const char of url) {
		const code = char.charCodeAt(0);
		if (
			char === '"' ||
			char === "\u0085" ||
			char.trim() === "" ||
			code <= 0x1f ||
			code === 0x7f
		)
			return false;
	}
	try {
		const parsed = new URL(url);
		if (rawUrlHost(url).includes("%")) return false;
		return (
			(parsed.protocol === "http:" || parsed.protocol === "https:") &&
			parsed.username === "" &&
			parsed.password === "" &&
			parsed.hostname.length > 0
		);
	} catch {
		return false;
	}
}
