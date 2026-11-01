export function metaContent(name) {
	const meta = document.querySelector(`meta[name="${name}"]`);
	if (!(meta instanceof HTMLMetaElement))
		throw new Error(`Missing canvas metadata: ${name}`);
	return meta.content;
}
