import { createRequire as __officeCreateRequire } from "node:module";
import { dirname as __officeDirname } from "node:path";
import { fileURLToPath as __officeFileURLToPath } from "node:url";
const require = __officeCreateRequire(import.meta.url);
const __filename = __officeFileURLToPath(import.meta.url);
const __dirname = __officeDirname(__filename);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf, __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require < "u" ? require : typeof Proxy < "u" ? new Proxy(x, {
  get: (a, b) => (typeof require < "u" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require < "u") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: !0 });
}, __copyProps = (to, from, except, desc) => {
  if (from && typeof from == "object" || typeof from == "function")
    for (let key of __getOwnPropNames(from))
      !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: !0 }) : target,
  mod
));

// ../shared/runtime/state-directory.ts
import { homedir } from "node:os";
import { join } from "node:path";
function userStateDirectory(fallbackDirectory, {
  platform = process.platform,
  home = homedir(),
  localAppData = process.env.LOCALAPPDATA
} = {}) {
  return platform === "darwin" ? join(home, "Library", "Application Support") : localAppData ?? fallbackDirectory;
}
var init_state_directory = __esm({
  "../shared/runtime/state-directory.ts"() {
  }
});

// src/runtime/runtime-identity.ts
import { randomBytes } from "node:crypto";
import { homedir as homedir2 } from "node:os";
import { join as join2 } from "node:path";
function pluginStateRoot() {
  let base = userStateDirectory(join2(homedir2(), ".copilot"), {
    localAppData: process.env.LOCALAPPDATA || void 0
  });
  return join2(base, "GitHubCopilot", "powerpoint-copilot-plugin");
}
function runtimeStateDirectory(profile = "production") {
  return join2(pluginStateRoot(), "in-process", profile);
}
function legacyRuntimeStateDirectory(profile = "production") {
  return join2(pluginStateRoot(), profile);
}
function runtimeUploadDirectory(profile = "production") {
  return join2(runtimeStateDirectory(profile), "upload-staging");
}
function createRuntimeCapability() {
  return randomBytes(32).toString("base64url");
}
var RUNTIME_CAPABILITY_HEADER, RUNTIME_PROTOCOL_VERSION, init_runtime_identity = __esm({
  "src/runtime/runtime-identity.ts"() {
    init_state_directory();
    RUNTIME_CAPABILITY_HEADER = "x-powerpoint-runtime-capability", RUNTIME_PROTOCOL_VERSION = 1;
  }
});

// ../shared/runtime/local-http.ts
import { randomBytes as randomBytes2, timingSafeEqual } from "node:crypto";
function hasLocalCapability(request, capability, header = LOCAL_CAPABILITY_HEADER) {
  let supplied = request.headers[header];
  if (!capability || typeof supplied != "string") return !1;
  let expected = Buffer.from(capability), actual = Buffer.from(supplied);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function assertLoopbackBind(host) {
  if (host !== "127.0.0.1") throw new TypeError("Local Office servers must bind to 127.0.0.1.");
}
function requireJsonRequest(request, response) {
  let mediaType = request.headers["content-type"];
  return typeof mediaType == "string" && mediaType.split(";")[0].trim().toLowerCase() === "application/json" ? !0 : (denyLocalRequest(response, 415, "Content-Type must be application/json."), !1);
}
function isJsonRpcPayload(value) {
  return Array.isArray(value) ? value.length > 0 && value.every(isJsonRpcMessage) : isJsonRpcMessage(value);
}
function isJsonRpcMessage(value) {
  if (!value || typeof value != "object" || Array.isArray(value)) return !1;
  let message = value;
  return message.jsonrpc !== "2.0" || message.id !== void 0 && message.id !== null && typeof message.id != "string" && typeof message.id != "number" ? !1 : typeof message.method == "string" ? message.result === void 0 && message.error === void 0 && (message.params === void 0 || message.params !== null && typeof message.params == "object") : message.method === void 0 && message.id !== void 0 && Object.hasOwn(message, "result") !== Object.hasOwn(message, "error");
}
function validateLoopbackRequestHeaders(headers, expectedOrigin) {
  let expected = new URL(expectedOrigin);
  return typeof headers.host != "string" || headers.host.toLowerCase() !== expected.host ? { valid: !1, statusCode: 421, message: "Unexpected loopback Host header." } : headers.origin !== void 0 && headers.origin !== expected.origin || headers["sec-fetch-site"] === "cross-site" ? { valid: !1, statusCode: 403, message: "Cross-origin loopback requests are not allowed." } : { valid: !0, statusCode: 200, message: "" };
}
function localRequestUrl(request, response) {
  response.setHeader("cache-control", "no-store"), response.setHeader("referrer-policy", "no-referrer"), response.setHeader("x-content-type-options", "nosniff");
  let origin = `http://127.0.0.1:${request.socket.localPort}`;
  if (request.rawHeaders.filter((_, index) => index % 2 === 0).filter((name) => name.toLowerCase() === "host").length !== 1) {
    denyLocalRequest(response, 421, "Unexpected loopback Host header.");
    return;
  }
  let validation = validateLoopbackRequestHeaders(request.headers, origin);
  if (!validation.valid) {
    denyLocalRequest(response, validation.statusCode, validation.message);
    return;
  }
  try {
    let url = new URL(request.url ?? "/", origin);
    if (url.origin !== origin || url.username || url.password) throw new TypeError();
    return url;
  } catch {
    denyLocalRequest(response, 400, "Invalid local request target.");
    return;
  }
}
function denyLocalRequest(response, status = 403, message = "Local capability required.") {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }), response.end(JSON.stringify({ error: message }));
}
var LOCAL_CAPABILITY_HEADER, init_local_http = __esm({
  "../shared/runtime/local-http.ts"() {
    LOCAL_CAPABILITY_HEADER = "x-wxp-local-capability";
  }
});

// ../shared/runtime/token-provider.ts
function createTokenProvider({
  scope,
  acquireToken,
  refreshBufferMs = 300 * 1e3
}) {
  let cached, pending;
  return async ({ forceRefresh = !1 } = {}) => {
    if (!forceRefresh && cached && cached.expiresAt > Date.now() + refreshBufferMs)
      return cached.token;
    if (!pending || forceRefresh && !pending.forceRefresh) {
      let acquire = () => acquireToken(scope, { forceRefresh }), promise = pending ? pending.promise.then(acquire, acquire) : acquire(), acquisition = {
        forceRefresh,
        promise: promise.then((result) => {
          if (!result.token || !Number.isFinite(result.expiresAt))
            throw new Error("The token provider returned invalid credentials.");
          return cached = result, result;
        }).finally(() => {
          pending === acquisition && (pending = void 0);
        })
      };
      pending = acquisition;
    }
    return (await pending.promise).token;
  };
}
var init_token_provider = __esm({
  "../shared/runtime/token-provider.ts"() {
  }
});

// src/runtime/token-provider.ts
var init_token_provider2 = __esm({
  "src/runtime/token-provider.ts"() {
    init_token_provider();
  }
});

// ../shared/auth/auth-contract.ts
function validateAccount(value) {
  if (!value || typeof value != "object" || !("homeAccountId" in value) || typeof value.homeAccountId != "string" || !value.homeAccountId || !("tenantId" in value) || typeof value.tenantId != "string" || !GUID.test(value.tenantId) || !("username" in value) || typeof value.username != "string")
    throw new AuthError("account_mismatch", "The authentication provider returned no valid account identity.");
  return { homeAccountId: value.homeAccountId, tenantId: value.tenantId, username: value.username };
}
function sameAccount(left, right) {
  return left.homeAccountId.toLowerCase() === right.homeAccountId.toLowerCase() && left.tenantId.toLowerCase() === right.tenantId.toLowerCase();
}
function normalizeAccountUsername(value) {
  if (value === void 0) return;
  if (typeof value != "string") throw new AuthError("invalid_request", "The account username must be a string.");
  let username = value.trim();
  if (!username || [...username].length > 320 || /[\u0000-\u001f\u007f-\u009f\uD800-\uDFFF]/u.test(username))
    throw new AuthError("invalid_request", "Enter a valid work or school username of at most 320 characters.");
  return username;
}
function mergeClaims(target, input, depth = 0) {
  if (depth > 32) throw new AuthError("invalid_claims", "Authentication claims are too deeply nested.");
  for (let [key, value] of Object.entries(input)) {
    if (["__proto__", "constructor", "prototype"].includes(key))
      throw new AuthError("invalid_claims", "The authentication claims request is invalid.");
    if (!(key in target) && value && typeof value == "object" && !Array.isArray(value)) {
      let nested = /* @__PURE__ */ Object.create(null);
      mergeClaims(nested, value, depth + 1), target[key] = nested;
    } else if (!(key in target)) target[key] = value;
    else {
      if (JSON.stringify(target[key]) === JSON.stringify(value)) continue;
      if (value && typeof value == "object" && !Array.isArray(value) && target[key] && typeof target[key] == "object" && !Array.isArray(target[key]))
        mergeClaims(target[key], value, depth + 1);
      else throw new AuthError("invalid_claims", "Conflicting authentication claims cannot be combined safely.");
    }
  }
}
function normalizeClaims(input) {
  if (input == null || input === "") return;
  let claims = /* @__PURE__ */ Object.create(null);
  for (let item of Array.isArray(input) ? input : [input]) {
    let value = item;
    if (typeof item == "string") {
      if (item.length > 16384) throw new AuthError("invalid_claims", "Authentication claims exceed the allowed size.");
      try {
        value = JSON.parse(item);
      } catch {
        throw new AuthError("invalid_claims", "Authentication claims must be valid JSON.");
      }
    }
    if (!value || typeof value != "object" || Array.isArray(value))
      throw new AuthError("invalid_claims", "Authentication claims must be a JSON object.");
    mergeClaims(claims, value);
  }
  let result = JSON.stringify(claims);
  if (result.length > 16384) throw new AuthError("invalid_claims", "Authentication claims exceed the allowed size.");
  return result === "{}" ? void 0 : result;
}
function authErrorBody(error) {
  return { error: error.message, code: error.code, ...error.resource ? { resource: error.resource } : {} };
}
function authHttpStatus(error) {
  return error.code === "access_denied" || error.code === "account_mismatch" ? 403 : error.code === "auth_busy" ? 409 : error.code === "timeout" ? 504 : ["invalid_request", "invalid_claims", "username_required"].includes(error.code) ? 400 : 401;
}
var OFFICE_SCOPE, GRAPH_SCOPE, WAC_RESOURCE, WAC_SCOPE, OFFICE_WAM_CLIENT_ID, MSAL_ORGANIZATIONS_AUTHORITY, AUTH_CONTROL_PREFIX, AUTH_GENERATION_HEADER, AUTH_GENERATION_GUARD_HEADER, AUTH_HELPER_TIMEOUT_MS, GUID, AuthError, init_auth_contract = __esm({
  "../shared/auth/auth-contract.ts"() {
    OFFICE_SCOPE = "https://augloop.office.com/v2/.default", GRAPH_SCOPE = "https://graph.microsoft.com/.default", WAC_RESOURCE = "e03a13ee-9730-4cae-8525-47559c8cf18a", WAC_SCOPE = `${WAC_RESOURCE}/.default`, OFFICE_WAM_CLIENT_ID = "d3590ed6-52b3-4102-aeff-aad2292ab01c", MSAL_ORGANIZATIONS_AUTHORITY = "https://login.microsoftonline.com/organizations", AUTH_CONTROL_PREFIX = "/auth/", AUTH_GENERATION_HEADER = "x-office-auth-generation", AUTH_GENERATION_GUARD_HEADER = "x-office-auth-generation-guard", AUTH_HELPER_TIMEOUT_MS = 300 * 1e3, GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, AuthError = class extends Error {
      code;
      resource;
      claims;
      constructor(code, message, resource, claims) {
        super(message), this.name = "AuthError", this.code = code, this.resource = resource, this.claims = claims;
      }
    };
  }
});

// ../shared/auth/auth-product.ts
function resolveProductClientId(product, platform = process.platform) {
  return platform === MACOS_PLATFORM && product.macOS ? product.macOS.clientId : OFFICE_WAM_CLIENT_ID;
}
function resolveProductConnectScopes(product, platform = process.platform) {
  return platform === MACOS_PLATFORM && product.macOS ? [OFFICE_SCOPE] : [OFFICE_SCOPE, GRAPH_SCOPE];
}
var NATIVE_ARCHITECTURES, X64_ONLY_ARCHITECTURES, SHARED_WXP_MACOS, GENERIC_AUTH_PRODUCT, MACOS_PLATFORM, WINDOWS_PLATFORM, init_auth_product = __esm({
  "../shared/auth/auth-product.ts"() {
    init_auth_contract();
    NATIVE_ARCHITECTURES = ["x64", "arm64"], X64_ONLY_ARCHITECTURES = ["x64"], SHARED_WXP_MACOS = {
      clientId: "8635a963-d212-4631-a476-150106739fb2",
      redirectUri: "msauth.com.msauth.unsignedapp://auth",
      architectures: NATIVE_ARCHITECTURES
    }, GENERIC_AUTH_PRODUCT = {
      name: "Office",
      workerPathEnvVar: "OFFICE_AUTH_WORKER_PATH",
      windowExecutable: "OfficeAuthWindow.exe",
      lockPrefix: "office",
      architectures: NATIVE_ARCHITECTURES,
      additionalScopes: []
    }, MACOS_PLATFORM = "darwin", WINDOWS_PLATFORM = "win32";
  }
});

// src/runtime/auth-product.ts
var POWERPOINT_AUTH_PRODUCT, init_auth_product2 = __esm({
  "src/runtime/auth-product.ts"() {
    init_auth_contract();
    init_auth_product();
    POWERPOINT_AUTH_PRODUCT = {
      name: "PowerPoint",
      workerPathEnvVar: "POWERPOINT_AUTH_WORKER_PATH",
      windowExecutable: "PowerPointAuthWindow.exe",
      lockPrefix: "powerpoint",
      architectures: X64_ONLY_ARCHITECTURES,
      additionalScopes: [WAC_SCOPE],
      macOS: SHARED_WXP_MACOS
    };
  }
});

// ../shared/auth/http-auth.ts
function decodeAuthenticationClaims(encoded) {
  if (encoded.length > 24e3 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(encoded))
    throw new AuthError("invalid_claims", "The service returned an invalid authentication challenge.");
  let bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64url") !== encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""))
    throw new AuthError("invalid_claims", "The service returned an invalid authentication challenge.");
  let decoded;
  try {
    decoded = new TextDecoder("utf-8", { fatal: !0 }).decode(bytes);
  } catch {
    throw new AuthError("invalid_claims", "Authentication claims must contain valid UTF-8.");
  }
  let claims = normalizeClaims(decoded);
  if (!claims) throw new AuthError("invalid_claims", "The service returned an empty authentication challenge.");
  return claims;
}
function normalizeViewerClaims(input) {
  if (input == null || input === "") return;
  let values = (Array.isArray(input) ? input : [input]).map((value) => {
    if (typeof value != "string") return value;
    let text = value.trim();
    return text.startsWith("{") ? text : decodeAuthenticationClaims(text);
  });
  return normalizeClaims(values);
}
function claimsFromResponse(response) {
  let header = response.headers.get("www-authenticate");
  if (!header || response.status !== 401) return;
  let match = /(?:^|[,\s])claims\s*=\s*"([^"]+)"/i.exec(header);
  if (!match) {
    if (/insufficient_claims/i.test(header)) throw new AuthError("invalid_claims", "The service omitted its required authentication claims.");
    return;
  }
  return decodeAuthenticationClaims(match[1]);
}
var init_http_auth = __esm({
  "../shared/auth/http-auth.ts"() {
    init_auth_contract();
  }
});

// ../shared/auth/renewable-office-fetch.ts
function createRenewableOfficeFetch(fetchImpl, officeTokenProvider, onUnauthorized, product = GENERIC_AUTH_PRODUCT) {
  return officeTokenProvider ? async (input, init = {}) => {
    let lastToken, send = async (forceRefresh, claims2, rejectedToken) => {
      let token = await officeTokenProvider({ forceRefresh, ...claims2 ? { claims: claims2 } : {}, ...rejectedToken ? { rejectedToken } : {} });
      lastToken = token;
      let headers = new Headers(init.headers);
      return headers.set("authorization", ["Bearer", token].join(" ")), fetchImpl(input, {
        ...init,
        headers
      });
    }, response = await send(!1);
    if (response.status !== 401)
      return response;
    let claims;
    try {
      claims = claimsFromResponse(response);
    } finally {
      await response.body?.cancel();
    }
    let refreshed = await send(!0, claims, lastToken);
    if (refreshed.status === 401 && onUnauthorized) {
      try {
        onUnauthorized(claimsFromResponse(refreshed) ?? claims);
      } finally {
        await refreshed.body?.cancel();
      }
      throw new AuthError("interaction_required", `Reconnect your ${product.name} account before retrying this resource.`);
    }
    return refreshed;
  } : fetchImpl;
}
var init_renewable_office_fetch = __esm({
  "../shared/auth/renewable-office-fetch.ts"() {
    init_http_auth();
    init_auth_contract();
    init_auth_product();
  }
});

// ../shared/runtime/viewer-sessions.ts
function viewerSessionLifecycle(sessions, authStatus) {
  let accountBinding = () => {
    let status = authStatus?.();
    return JSON.stringify([status?.generation, status?.account]);
  }, revokeInstance = (instanceId) => {
    if (!(typeof instanceId != "string" || !instanceId))
      for (let [key, session2] of sessions)
        session2.instanceId === instanceId && sessions.delete(key);
  }, isActive = (session2) => session2.key && (sessions.get(session2.key) !== session2 || session2.expiresAt === void 0 || session2.expiresAt <= Date.now() || session2.accountBinding !== accountBinding()) ? (sessions.delete(session2.key), !1) : !0;
  return {
    revokeInstance,
    isActive,
    bind(key, origin, instanceId) {
      return revokeInstance(instanceId), { key, origin, instanceId, accountBinding: accountBinding() };
    },
    assertActive(session2) {
      if (!isActive(session2))
        throw new Error("Viewer session expired or revoked.");
    }
  };
}
var init_viewer_sessions = __esm({
  "../shared/runtime/viewer-sessions.ts"() {
  }
});

// ../shared/viewer/viewer-host.ts
import { readFile } from "node:fs/promises";
import { join as join3 } from "node:path";
import { randomUUID } from "node:crypto";
function writeJson(response, statusCode, value) {
  response.statusCode = statusCode, response.setHeader("content-type", "application/json"), response.setHeader("cache-control", "no-store"), response.end(JSON.stringify(value));
}
async function readBoundedJsonRequest(request) {
  let chunks = [], size = 0;
  for await (let chunk of request) {
    if (size += chunk.length, size > MAX_VIEWER_SESSION_REQUEST_BYTES)
      throw new RangeError("Viewer request is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
async function fetchGraphJson(fetchImpl, path, name, noun) {
  let response = await fetchImpl(`https://graph.microsoft.com/v1.0${path}`, {
    headers: new Headers({ accept: "application/json" }),
    redirect: "manual"
  });
  if (!response.ok)
    throw await response.body?.cancel(), response.status === 401 ? new AuthError("interaction_required", `Reconnect your ${name} account to access Microsoft Graph.`, GRAPH_SCOPE2) : response.status === 403 ? new AuthError("access_denied", `The selected account cannot access this ${noun} in Microsoft Graph.`, GRAPH_SCOPE2) : new Error(`Microsoft Graph returned HTTP ${response.status}.`);
  return response.json();
}
function createViewerHost(config) {
  let { product, viewerDirectory: viewerDirectory2, getToken, authStatus, onUnauthorized } = config, name = product.authProduct.name, noun = product.noun, capabilities = config.capabilities ?? {}, fetchImpl = config.fetchImpl ?? fetch, sessions = /* @__PURE__ */ new Map(), lifecycle = viewerSessionLifecycle(sessions, authStatus), graphFetch = createRenewableOfficeFetch(
    fetchImpl,
    (options) => getToken(GRAPH_SCOPE2, options),
    onUnauthorized ? (claims) => onUnauthorized(GRAPH_SCOPE2, claims) : void 0,
    product.authProduct
  );
  function parseArtifactUrl(value) {
    let artifact = product.parseArtifactUrl ? product.parseArtifactUrl(value) : new URL(value);
    if (artifact.protocol !== "https:" || !product.isTrustedHost(artifact.hostname))
      throw new TypeError("artifactUrl must use a trusted SharePoint or OneDrive host.");
    if (artifact.username || artifact.password)
      throw new TypeError("artifactUrl must use a trusted SharePoint or OneDrive host and must not include embedded credentials.");
    if (artifact.port)
      throw new TypeError("artifactUrl must use a trusted SharePoint or OneDrive host and must not include an explicit port.");
    return artifact;
  }
  function unsupportedAudience(detail = "") {
    return new TypeError(`${name} requested an unsupported token audience${detail}.`);
  }
  function scopeForResource(resourceUrl, documentOrigin) {
    if (product.supportsWac && resourceUrl === WAC_RESOURCE)
      return WAC_SCOPE;
    let url = new URL(resourceUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      throw unsupportedAudience();
    let host2 = url.hostname.toLowerCase();
    if (GRAPH_HOSTS.has(host2))
      return GRAPH_SCOPE2;
    if (product.isTrustedHost(host2)) {
      if (url.origin !== documentOrigin)
        throw unsupportedAudience(": it must match the current viewer session document origin");
      return `${url.origin}/.default`;
    }
    if (product.officeHostSuffixes.some((suffix) => host2.endsWith(suffix)))
      return `${url.origin}/.default`;
    throw unsupportedAudience();
  }
  function pruneExpiredSessions() {
    let now = Date.now();
    for (let [key, session2] of sessions)
      session2.expiresAt <= now && sessions.delete(key);
  }
  function getSession(key) {
    pruneExpiredSessions();
    let session2 = sessions.get(key);
    return session2 && lifecycle.isActive(session2) ? session2 : null;
  }
  async function resolveSession(session2) {
    if (lifecycle.assertActive(session2), session2.resolved)
      return session2.resolved;
    let shareId = `u!${Buffer.from(session2.artifactUrl, "utf8").toString("base64url")}`, driveItem = await fetchGraphJson(
      graphFetch,
      `/shares/${shareId}/driveItem?$select=id,name,parentReference`,
      name,
      noun
    );
    lifecycle.assertActive(session2);
    let driveId = driveItem?.parentReference?.driveId, itemId = driveItem?.id;
    if (typeof driveId != "string" || typeof itemId != "string")
      throw new Error("Microsoft Graph did not return a drive and item identity.");
    let identity = await fetchGraphJson(
      graphFetch,
      `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$select=sharepointIds`,
      name,
      noun
    );
    lifecycle.assertActive(session2);
    let baseUrl = identity?.sharepointIds?.siteUrl, fileId = identity?.sharepointIds?.listItemUniqueId;
    if (typeof baseUrl != "string" || typeof fileId != "string" || !product.isTrustedHost(new URL(baseUrl).hostname))
      throw new Error("Microsoft Graph did not return a trusted SharePoint identity.");
    let tenantId = authStatus?.()?.account?.tenantId;
    return session2.resolved = {
      baseUrl,
      driveId,
      fileId,
      fileName: typeof driveItem.name == "string" ? driveItem.name : session2.title,
      itemId,
      wiseEnvironment: new URL(baseUrl).hostname.includes("sharepoint-df") ? "MSIT" : "PRODUCTION",
      ...tenantId ? { tenantId } : {}
    }, session2.resolved;
  }
  async function getCardData(artifactUrl, title) {
    let artifact = parseArtifactUrl(artifactUrl), resolved = await resolveSession({
      artifactUrl: artifact.toString(),
      title: title || name
    }), thumbnailDataUri, thumbnailResponse = await graphFetch(
      `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(resolved.driveId)}/items/${encodeURIComponent(resolved.itemId)}/thumbnails/0/large/content`,
      { redirect: "follow" }
    );
    if (thumbnailResponse.status === 401 || thumbnailResponse.status === 403)
      throw await thumbnailResponse.body?.cancel(), new AuthError(
        thumbnailResponse.status === 401 ? "interaction_required" : "access_denied",
        `The selected account cannot load the ${noun} preview.`,
        GRAPH_SCOPE2
      );
    if (!thumbnailResponse.ok && thumbnailResponse.status !== 404)
      throw await thumbnailResponse.body?.cancel(), new Error(`Microsoft Graph thumbnail returned HTTP ${thumbnailResponse.status}.`);
    if (thumbnailResponse.ok) {
      let contentType = thumbnailResponse.headers.get("content-type");
      if (contentType?.startsWith("image/")) {
        let bytes = Buffer.from(await thumbnailResponse.arrayBuffer());
        bytes.length <= 2 * 1024 * 1024 && (thumbnailDataUri = `data:${contentType};base64,${bytes.toString("base64")}`);
      }
    }
    return {
      artifactUrl: artifact.toString(),
      fileName: resolved.fileName,
      ...thumbnailDataUri ? { thumbnailDataUri } : {}
    };
  }
  async function handleSelection(request, response, requestUrl, session2) {
    if (requireJsonRequest(request, response))
      try {
        if (requestUrl.hostname !== "127.0.0.1" || request.headers.origin !== requestUrl.origin) {
          writeJson(response, 403, { error: "Selection updates must come from the viewer page." });
          return;
        }
        if (!session2.instanceId || !config.onSelection) {
          writeJson(response, 409, { error: "This viewer has no chat canvas binding." });
          return;
        }
        let input = await readBoundedJsonRequest(request);
        if (!Array.isArray(input?.sheets) || !input.sheets.length || input.sheets.length > 8 || input.sheets.some((sheet) => typeof sheet.name != "string" || !sheet.name.length || sheet.name.length > 128 || !Array.isArray(sheet.ranges) || !sheet.ranges.length || sheet.ranges.length > 32 || sheet.ranges.some((range) => typeof range != "string" || !range.length || range.length > 128)))
          throw new TypeError(`Invalid ${name} selection.`);
        lifecycle.assertActive(session2), await config.onSelection({
          instanceId: session2.instanceId,
          workbookUrl: session2.artifactUrl,
          sheets: input.sheets.map(({ name: sheetName, ranges }) => ({ name: sheetName, ranges }))
        }), writeJson(response, 200, { ok: !0 });
      } catch (error) {
        writeJson(
          response,
          error instanceof RangeError ? 413 : error instanceof SyntaxError || error instanceof TypeError ? 400 : 502,
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
  }
  async function handleClose(request, response, requestUrl, session2, key) {
    if (requestUrl.hostname !== "127.0.0.1" || request.headers.origin !== requestUrl.origin)
      writeJson(response, 403, { error: "Close requests must come from the viewer page." });
    else if (!session2.instanceId || !config.onClose)
      writeJson(response, 409, { error: "This viewer has no chat canvas binding." });
    else
      try {
        await config.onClose(session2.instanceId), sessions.delete(key), writeJson(response, 200, { ok: !0 });
      } catch (error) {
        writeJson(response, 502, { error: error instanceof Error ? error.message : String(error) });
      }
  }
  async function handleToken(request, response, session2) {
    if (requireJsonRequest(request, response))
      try {
        let body = await readBoundedJsonRequest(request);
        lifecycle.assertActive(session2);
        let resource = product.supportsWac && body.resourceUrl === WAC_RESOURCE ? void 0 : new URL(body.resourceUrl);
        scopeForResource(body.resourceUrl, resource?.origin);
        let documentOrigin = resource && product.isTrustedHost(resource.hostname) ? new URL((await resolveSession(session2)).baseUrl).origin : void 0, scope = scopeForResource(body.resourceUrl, documentOrigin);
        lifecycle.assertActive(session2);
        let tenantId = authStatus?.()?.account?.tenantId;
        if (body.tenantId && tenantId && String(body.tenantId).toLowerCase() !== tenantId.toLowerCase())
          throw new AuthError("account_mismatch", `The ${noun} requested a different tenant. Switch accounts explicitly.`);
        let claims = normalizeViewerClaims(body.claims), token = await getToken(scope, {
          forceRefresh: body.forceRefresh === !0 || claims !== void 0,
          claims
        });
        lifecycle.assertActive(session2), writeJson(response, 200, { token });
      } catch (error) {
        error instanceof AuthError ? (["interaction_required", "account_unavailable"].includes(error.code) && onUnauthorized?.(error.resource ?? GRAPH_SCOPE2, error.claims), writeJson(response, authHttpStatus(error), authErrorBody(error))) : writeJson(response, error instanceof RangeError ? 413 : 400, {
          error: error instanceof Error ? error.message : String(error)
        });
      }
  }
  let sessionRoutes = [
    "config",
    "token",
    ...capabilities.artifactRoute ? ["artifact"] : [],
    ...capabilities.statusRoute ? ["status"] : [],
    ...capabilities.selection ? ["selection", "close"] : []
  ], sessionRoutePattern = new RegExp(
    `^/viewer/session/([a-f0-9]{32})(?:/(${sessionRoutes.join("|")}))?$`
  );
  return {
    revokeInstance: lifecycle.revokeInstance,
    resetAuthSessions() {
      sessions.clear(), config.onReset?.();
    },
    hasActiveSessions() {
      return pruneExpiredSessions(), sessions.size > 0;
    },
    createViewerUrl(origin, artifactUrl, title, mode = "view", instanceId = void 0) {
      pruneExpiredSessions();
      let artifact = parseArtifactUrl(artifactUrl);
      if (!["view", "edit"].includes(mode))
        throw new TypeError(`${name} canvas mode must be 'view' or 'edit'.`);
      let key = randomUUID().replaceAll("-", ""), binding = lifecycle.bind(key, origin, instanceId);
      if (sessions.size >= MAX_VIEWER_SESSIONS)
        throw new Error(
          `The ${name} runtime already has ${MAX_VIEWER_SESSIONS} active viewer sessions.`
        );
      return sessions.set(key, {
        ...binding,
        artifactUrl: artifact.toString(),
        expiresAt: Date.now() + VIEWER_SESSION_TTL_MS,
        mode,
        title: title || name,
        instanceId
      }), `${origin}/viewer/session/${key}`;
    },
    ...capabilities.cardData ? { getCardData } : {},
    async handleRequest(request, response, requestUrl) {
      let validatedUrl = localRequestUrl(request, response);
      if (!validatedUrl || (requestUrl = validatedUrl, await config.preHandler?.(request, response, requestUrl)))
        return !0;
      if (request.method === "GET" && VIEWER_ASSETS.includes(requestUrl.pathname)) {
        let isCss = requestUrl.pathname.endsWith(".css");
        response.setHeader("cache-control", "no-store");
        try {
          let asset = await readFile(join3(
            viewerDirectory2,
            isCss ? "viewer.bundle.css" : "viewer.bundle.js"
          ));
          response.statusCode = 200, response.setHeader(
            "content-type",
            isCss ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8"
          ), response.end(asset);
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
          writeJson(response, 404, { error: `${name} viewer asset not found.` });
        }
        return !0;
      }
      let match = sessionRoutePattern.exec(requestUrl.pathname);
      if (!match)
        return !1;
      let session2 = getSession(match[1]);
      if (!session2 || session2.origin !== requestUrl.origin)
        return writeJson(response, 404, { error: `${name} viewer session expired.` }), !0;
      let route = match[2];
      if (request.method === "GET" && !route)
        return response.statusCode = 200, response.setHeader("content-type", "text/html; charset=utf-8"), response.setHeader("cache-control", "no-store"), response.setHeader(
          "content-security-policy",
          "default-src 'self' https: data: blob:; script-src 'self' https: 'unsafe-inline' 'unsafe-eval'; style-src 'self' https: 'unsafe-inline'; frame-src https:; connect-src 'self' https:;"
        ), response.end(await readFile(join3(viewerDirectory2, "index.html"))), !0;
      if (request.method === "GET" && route === "artifact")
        return writeJson(response, 200, { artifactUrl: session2.artifactUrl }), !0;
      if (request.method === "GET" && route === "status")
        return writeJson(response, 200, { active: !0 }), !0;
      if (request.method === "GET" && route === "config") {
        try {
          let { itemId: _itemId, ...resolvedConfig } = await resolveSession(session2);
          lifecycle.assertActive(session2), writeJson(response, 200, { ...resolvedConfig, mode: session2.mode });
        } catch (error) {
          writeJson(
            response,
            error instanceof AuthError ? authHttpStatus(error) : 502,
            error instanceof AuthError ? authErrorBody(error) : {
              error: error instanceof Error ? error.message : String(error)
            }
          );
        }
        return !0;
      }
      return request.method === "POST" && route === "selection" ? (await handleSelection(request, response, requestUrl, session2), !0) : request.method === "POST" && route === "close" ? (await handleClose(request, response, requestUrl, session2, match[1]), !0) : request.method === "POST" && route === "token" ? (await handleToken(request, response, session2), !0) : (writeJson(response, 405, { error: "Method not allowed." }), !0);
    }
  };
}
var GRAPH_SCOPE2, GRAPH_HOSTS, OFFICE_HOST_SUFFIXES, VIEWER_SESSION_TTL_MS, MAX_VIEWER_SESSION_REQUEST_BYTES, MAX_VIEWER_SESSIONS, VIEWER_ASSETS, init_viewer_host = __esm({
  "../shared/viewer/viewer-host.ts"() {
    init_auth_contract();
    init_http_auth();
    init_renewable_office_fetch();
    init_local_http();
    init_viewer_sessions();
    GRAPH_SCOPE2 = "https://graph.microsoft.com/.default", GRAPH_HOSTS = /* @__PURE__ */ new Set([
      "graph.microsoft.com",
      "graph.microsoft.us",
      "dod-graph.microsoft.us",
      "graph.microsoft.de",
      "microsoftgraph.chinacloudapi.cn"
    ]), OFFICE_HOST_SUFFIXES = [
      ".officeapps.live.com",
      ".office.com",
      ".onedrive.com"
    ], VIEWER_SESSION_TTL_MS = 3600 * 1e3, MAX_VIEWER_SESSION_REQUEST_BYTES = 64 * 1024, MAX_VIEWER_SESSIONS = 16, VIEWER_ASSETS = ["/viewer/viewer.bundle.js", "/viewer/viewer.bundle.css"];
  }
});

// src/runtime/powerpoint-url.ts
function isTrustedPowerPointHost(hostname) {
  let normalized = String(hostname ?? "").toLowerCase();
  return trustedExactHosts.has(normalized) || trustedHostPatterns.some((pattern) => pattern.test(normalized));
}
function parseTrustedPowerPointUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("artifactUrl must be a valid absolute URL.");
  }
  if (url.protocol !== "https:")
    throw new TypeError("artifactUrl must use HTTPS.");
  if (!isTrustedPowerPointHost(url.hostname))
    throw new TypeError(
      "artifactUrl must use a recognized SharePoint or OneDrive host."
    );
  if (url.username || url.password)
    throw new TypeError("artifactUrl must not contain user information.");
  if ([...url.searchParams.keys()].some((name) => sensitiveUrlParameters.has(name.toLowerCase())))
    throw new TypeError("artifactUrl must not contain credential parameters.");
  return url;
}
var trustedHostPatterns, trustedExactHosts, sensitiveUrlParameters, init_powerpoint_url = __esm({
  "src/runtime/powerpoint-url.ts"() {
    trustedHostPatterns = [
      /\.sharepoint\.com$/i,
      /\.sharepoint-df\.com$/i,
      /\.sharepoint\.us$/i,
      /\.sharepoint\.de$/i,
      /\.sharepoint\.cn$/i
    ], trustedExactHosts = /* @__PURE__ */ new Set([
      "1drv.ms",
      "onedrive.cloud.microsoft",
      "onedrive.live.com"
    ]), sensitiveUrlParameters = /* @__PURE__ */ new Set([
      "access_token",
      "authorization",
      "bearer",
      "client_secret",
      "code",
      "id_token",
      "refresh_token",
      "sig",
      "signature",
      "token"
    ]);
  }
});

// src/runtime/primus-viewer.ts
import { existsSync } from "node:fs";
import { dirname, join as join4 } from "node:path";
import { fileURLToPath } from "node:url";
function createPrimusViewerHost({
  fetchImpl = fetch,
  acquireToken = async (_scope, _options) => {
    throw new AuthError("not_connected", "Connect your PowerPoint account before accessing presentations.");
  },
  resourceTokenProvider = void 0,
  authStatus = void 0,
  onUnauthorized = void 0
} = {}) {
  let tokenProviders = /* @__PURE__ */ new Map();
  async function getToken(scope, options = {}) {
    return resourceTokenProvider ? resourceTokenProvider(scope, options) : options.claims ? (await acquireToken(scope, options)).token : (tokenProviders.has(scope) || tokenProviders.set(scope, createTokenProvider({ scope, acquireToken })), tokenProviders.get(scope)(options));
  }
  return createViewerHost({
    product: {
      authProduct: POWERPOINT_AUTH_PRODUCT,
      noun: "presentation",
      isTrustedHost: isTrustedPowerPointHost,
      parseArtifactUrl: parseTrustedPowerPointUrl,
      officeHostSuffixes: OFFICE_HOST_SUFFIXES,
      supportsWac: !1
    },
    viewerDirectory,
    capabilities: { statusRoute: !0, cardData: !0 },
    fetchImpl,
    getToken,
    authStatus,
    onUnauthorized,
    onReset: () => tokenProviders.clear()
  });
}
var currentDirectory, adjacentViewerDirectory, viewerDirectory, init_primus_viewer = __esm({
  "src/runtime/primus-viewer.ts"() {
    init_token_provider2();
    init_auth_contract();
    init_auth_product2();
    init_viewer_host();
    init_powerpoint_url();
    currentDirectory = dirname(fileURLToPath(import.meta.url)), adjacentViewerDirectory = join4(currentDirectory, "viewer"), viewerDirectory = existsSync(adjacentViewerDirectory) ? adjacentViewerDirectory : join4(currentDirectory, "..", "viewer");
  }
});

// ../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/polyfills.js
var require_polyfills = __commonJS({
  "../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/polyfills.js"(exports, module) {
    var constants = __require("constants"), origCwd = process.cwd, cwd = null, platform = process.env.GRACEFUL_FS_PLATFORM || process.platform;
    process.cwd = function() {
      return cwd || (cwd = origCwd.call(process)), cwd;
    };
    try {
      process.cwd();
    } catch {
    }
    typeof process.chdir == "function" && (chdir = process.chdir, process.chdir = function(d) {
      cwd = null, chdir.call(process, d);
    }, Object.setPrototypeOf && Object.setPrototypeOf(process.chdir, chdir));
    var chdir;
    module.exports = patch;
    function patch(fs) {
      constants.hasOwnProperty("O_SYMLINK") && process.version.match(/^v0\.6\.[0-2]|^v0\.5\./) && patchLchmod(fs), fs.lutimes || patchLutimes(fs), fs.chown = chownFix(fs.chown), fs.fchown = chownFix(fs.fchown), fs.lchown = chownFix(fs.lchown), fs.chmod = chmodFix(fs.chmod), fs.fchmod = chmodFix(fs.fchmod), fs.lchmod = chmodFix(fs.lchmod), fs.chownSync = chownFixSync(fs.chownSync), fs.fchownSync = chownFixSync(fs.fchownSync), fs.lchownSync = chownFixSync(fs.lchownSync), fs.chmodSync = chmodFixSync(fs.chmodSync), fs.fchmodSync = chmodFixSync(fs.fchmodSync), fs.lchmodSync = chmodFixSync(fs.lchmodSync), fs.stat = statFix(fs.stat), fs.fstat = statFix(fs.fstat), fs.lstat = statFix(fs.lstat), fs.statSync = statFixSync(fs.statSync), fs.fstatSync = statFixSync(fs.fstatSync), fs.lstatSync = statFixSync(fs.lstatSync), fs.chmod && !fs.lchmod && (fs.lchmod = function(path, mode, cb) {
        cb && process.nextTick(cb);
      }, fs.lchmodSync = function() {
      }), fs.chown && !fs.lchown && (fs.lchown = function(path, uid, gid, cb) {
        cb && process.nextTick(cb);
      }, fs.lchownSync = function() {
      }), platform === "win32" && (fs.rename = typeof fs.rename != "function" ? fs.rename : (function(fs$rename) {
        function rename4(from, to, cb) {
          var start = Date.now(), backoff = 0;
          fs$rename(from, to, function CB(er) {
            if (er && (er.code === "EACCES" || er.code === "EPERM" || er.code === "EBUSY") && Date.now() - start < 6e4) {
              setTimeout(function() {
                fs.stat(to, function(stater, st) {
                  stater && stater.code === "ENOENT" ? fs$rename(from, to, CB) : cb(er);
                });
              }, backoff), backoff < 100 && (backoff += 10);
              return;
            }
            cb && cb(er);
          });
        }
        return Object.setPrototypeOf && Object.setPrototypeOf(rename4, fs$rename), rename4;
      })(fs.rename)), fs.read = typeof fs.read != "function" ? fs.read : (function(fs$read) {
        function read(fd, buffer, offset, length, position, callback_) {
          var callback;
          if (callback_ && typeof callback_ == "function") {
            var eagCounter = 0;
            callback = function(er, _, __) {
              if (er && er.code === "EAGAIN" && eagCounter < 10)
                return eagCounter++, fs$read.call(fs, fd, buffer, offset, length, position, callback);
              callback_.apply(this, arguments);
            };
          }
          return fs$read.call(fs, fd, buffer, offset, length, position, callback);
        }
        return Object.setPrototypeOf && Object.setPrototypeOf(read, fs$read), read;
      })(fs.read), fs.readSync = typeof fs.readSync != "function" ? fs.readSync : /* @__PURE__ */ (function(fs$readSync) {
        return function(fd, buffer, offset, length, position) {
          for (var eagCounter = 0; ; )
            try {
              return fs$readSync.call(fs, fd, buffer, offset, length, position);
            } catch (er) {
              if (er.code === "EAGAIN" && eagCounter < 10) {
                eagCounter++;
                continue;
              }
              throw er;
            }
        };
      })(fs.readSync);
      function patchLchmod(fs2) {
        fs2.lchmod = function(path, mode, callback) {
          fs2.open(
            path,
            constants.O_WRONLY | constants.O_SYMLINK,
            mode,
            function(err, fd) {
              if (err) {
                callback && callback(err);
                return;
              }
              fs2.fchmod(fd, mode, function(err2) {
                fs2.close(fd, function(err22) {
                  callback && callback(err2 || err22);
                });
              });
            }
          );
        }, fs2.lchmodSync = function(path, mode) {
          var fd = fs2.openSync(path, constants.O_WRONLY | constants.O_SYMLINK, mode), threw = !0, ret;
          try {
            ret = fs2.fchmodSync(fd, mode), threw = !1;
          } finally {
            if (threw)
              try {
                fs2.closeSync(fd);
              } catch {
              }
            else
              fs2.closeSync(fd);
          }
          return ret;
        };
      }
      function patchLutimes(fs2) {
        constants.hasOwnProperty("O_SYMLINK") && fs2.futimes ? (fs2.lutimes = function(path, at, mt, cb) {
          fs2.open(path, constants.O_SYMLINK, function(er, fd) {
            if (er) {
              cb && cb(er);
              return;
            }
            fs2.futimes(fd, at, mt, function(er2) {
              fs2.close(fd, function(er22) {
                cb && cb(er2 || er22);
              });
            });
          });
        }, fs2.lutimesSync = function(path, at, mt) {
          var fd = fs2.openSync(path, constants.O_SYMLINK), ret, threw = !0;
          try {
            ret = fs2.futimesSync(fd, at, mt), threw = !1;
          } finally {
            if (threw)
              try {
                fs2.closeSync(fd);
              } catch {
              }
            else
              fs2.closeSync(fd);
          }
          return ret;
        }) : fs2.futimes && (fs2.lutimes = function(_a, _b, _c, cb) {
          cb && process.nextTick(cb);
        }, fs2.lutimesSync = function() {
        });
      }
      function chmodFix(orig) {
        return orig && function(target, mode, cb) {
          return orig.call(fs, target, mode, function(er) {
            chownErOk(er) && (er = null), cb && cb.apply(this, arguments);
          });
        };
      }
      function chmodFixSync(orig) {
        return orig && function(target, mode) {
          try {
            return orig.call(fs, target, mode);
          } catch (er) {
            if (!chownErOk(er)) throw er;
          }
        };
      }
      function chownFix(orig) {
        return orig && function(target, uid, gid, cb) {
          return orig.call(fs, target, uid, gid, function(er) {
            chownErOk(er) && (er = null), cb && cb.apply(this, arguments);
          });
        };
      }
      function chownFixSync(orig) {
        return orig && function(target, uid, gid) {
          try {
            return orig.call(fs, target, uid, gid);
          } catch (er) {
            if (!chownErOk(er)) throw er;
          }
        };
      }
      function statFix(orig) {
        return orig && function(target, options, cb) {
          typeof options == "function" && (cb = options, options = null);
          function callback(er, stats) {
            stats && (stats.uid < 0 && (stats.uid += 4294967296), stats.gid < 0 && (stats.gid += 4294967296)), cb && cb.apply(this, arguments);
          }
          return options ? orig.call(fs, target, options, callback) : orig.call(fs, target, callback);
        };
      }
      function statFixSync(orig) {
        return orig && function(target, options) {
          var stats = options ? orig.call(fs, target, options) : orig.call(fs, target);
          return stats && (stats.uid < 0 && (stats.uid += 4294967296), stats.gid < 0 && (stats.gid += 4294967296)), stats;
        };
      }
      function chownErOk(er) {
        if (!er || er.code === "ENOSYS")
          return !0;
        var nonroot = !process.getuid || process.getuid() !== 0;
        return !!(nonroot && (er.code === "EINVAL" || er.code === "EPERM"));
      }
    }
  }
});

// ../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/legacy-streams.js
var require_legacy_streams = __commonJS({
  "../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/legacy-streams.js"(exports, module) {
    var Stream = __require("stream").Stream;
    module.exports = legacy;
    function legacy(fs) {
      return {
        ReadStream,
        WriteStream
      };
      function ReadStream(path, options) {
        if (!(this instanceof ReadStream)) return new ReadStream(path, options);
        Stream.call(this);
        var self = this;
        this.path = path, this.fd = null, this.readable = !0, this.paused = !1, this.flags = "r", this.mode = 438, this.bufferSize = 64 * 1024, options = options || {};
        for (var keys = Object.keys(options), index = 0, length = keys.length; index < length; index++) {
          var key = keys[index];
          this[key] = options[key];
        }
        if (this.encoding && this.setEncoding(this.encoding), this.start !== void 0) {
          if (typeof this.start != "number")
            throw TypeError("start must be a Number");
          if (this.end === void 0)
            this.end = 1 / 0;
          else if (typeof this.end != "number")
            throw TypeError("end must be a Number");
          if (this.start > this.end)
            throw new Error("start must be <= end");
          this.pos = this.start;
        }
        if (this.fd !== null) {
          process.nextTick(function() {
            self._read();
          });
          return;
        }
        fs.open(this.path, this.flags, this.mode, function(err, fd) {
          if (err) {
            self.emit("error", err), self.readable = !1;
            return;
          }
          self.fd = fd, self.emit("open", fd), self._read();
        });
      }
      function WriteStream(path, options) {
        if (!(this instanceof WriteStream)) return new WriteStream(path, options);
        Stream.call(this), this.path = path, this.fd = null, this.writable = !0, this.flags = "w", this.encoding = "binary", this.mode = 438, this.bytesWritten = 0, options = options || {};
        for (var keys = Object.keys(options), index = 0, length = keys.length; index < length; index++) {
          var key = keys[index];
          this[key] = options[key];
        }
        if (this.start !== void 0) {
          if (typeof this.start != "number")
            throw TypeError("start must be a Number");
          if (this.start < 0)
            throw new Error("start must be >= zero");
          this.pos = this.start;
        }
        this.busy = !1, this._queue = [], this.fd === null && (this._open = fs.open, this._queue.push([this._open, this.path, this.flags, this.mode, void 0]), this.flush());
      }
    }
  }
});

// ../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/clone.js
var require_clone = __commonJS({
  "../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/clone.js"(exports, module) {
    "use strict";
    module.exports = clone;
    var getPrototypeOf = Object.getPrototypeOf || function(obj) {
      return obj.__proto__;
    };
    function clone(obj) {
      if (obj === null || typeof obj != "object")
        return obj;
      if (obj instanceof Object)
        var copy = { __proto__: getPrototypeOf(obj) };
      else
        var copy = /* @__PURE__ */ Object.create(null);
      return Object.getOwnPropertyNames(obj).forEach(function(key) {
        Object.defineProperty(copy, key, Object.getOwnPropertyDescriptor(obj, key));
      }), copy;
    }
  }
});

// ../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/graceful-fs.js
var require_graceful_fs = __commonJS({
  "../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/graceful-fs.js"(exports, module) {
    var fs = __require("fs"), polyfills = require_polyfills(), legacy = require_legacy_streams(), clone = require_clone(), util = __require("util"), gracefulQueue, previousSymbol;
    typeof Symbol == "function" && typeof Symbol.for == "function" ? (gracefulQueue = /* @__PURE__ */ Symbol.for("graceful-fs.queue"), previousSymbol = /* @__PURE__ */ Symbol.for("graceful-fs.previous")) : (gracefulQueue = "___graceful-fs.queue", previousSymbol = "___graceful-fs.previous");
    function noop() {
    }
    function publishQueue(context, queue2) {
      Object.defineProperty(context, gracefulQueue, {
        get: function() {
          return queue2;
        }
      });
    }
    var debug = noop;
    util.debuglog ? debug = util.debuglog("gfs4") : /\bgfs4\b/i.test(process.env.NODE_DEBUG || "") && (debug = function() {
      var m = util.format.apply(util, arguments);
      m = "GFS4: " + m.split(/\n/).join(`
GFS4: `), console.error(m);
    });
    fs[gracefulQueue] || (queue = global[gracefulQueue] || [], publishQueue(fs, queue), fs.close = (function(fs$close) {
      function close(fd, cb) {
        return fs$close.call(fs, fd, function(err) {
          err || resetQueue(), typeof cb == "function" && cb.apply(this, arguments);
        });
      }
      return Object.defineProperty(close, previousSymbol, {
        value: fs$close
      }), close;
    })(fs.close), fs.closeSync = (function(fs$closeSync) {
      function closeSync(fd) {
        fs$closeSync.apply(fs, arguments), resetQueue();
      }
      return Object.defineProperty(closeSync, previousSymbol, {
        value: fs$closeSync
      }), closeSync;
    })(fs.closeSync), /\bgfs4\b/i.test(process.env.NODE_DEBUG || "") && process.on("exit", function() {
      debug(fs[gracefulQueue]), __require("assert").equal(fs[gracefulQueue].length, 0);
    }));
    var queue;
    global[gracefulQueue] || publishQueue(global, fs[gracefulQueue]);
    module.exports = patch(clone(fs));
    process.env.TEST_GRACEFUL_FS_GLOBAL_PATCH && !fs.__patched && (module.exports = patch(fs), fs.__patched = !0);
    function patch(fs2) {
      polyfills(fs2), fs2.gracefulify = patch, fs2.createReadStream = createReadStream, fs2.createWriteStream = createWriteStream;
      var fs$readFile = fs2.readFile;
      fs2.readFile = readFile8;
      function readFile8(path, options, cb) {
        return typeof options == "function" && (cb = options, options = null), go$readFile(path, options, cb);
        function go$readFile(path2, options2, cb2, startTime) {
          return fs$readFile(path2, options2, function(err) {
            err && (err.code === "EMFILE" || err.code === "ENFILE") ? enqueue([go$readFile, [path2, options2, cb2], err, startTime || Date.now(), Date.now()]) : typeof cb2 == "function" && cb2.apply(this, arguments);
          });
        }
      }
      var fs$writeFile = fs2.writeFile;
      fs2.writeFile = writeFile5;
      function writeFile5(path, data, options, cb) {
        return typeof options == "function" && (cb = options, options = null), go$writeFile(path, data, options, cb);
        function go$writeFile(path2, data2, options2, cb2, startTime) {
          return fs$writeFile(path2, data2, options2, function(err) {
            err && (err.code === "EMFILE" || err.code === "ENFILE") ? enqueue([go$writeFile, [path2, data2, options2, cb2], err, startTime || Date.now(), Date.now()]) : typeof cb2 == "function" && cb2.apply(this, arguments);
          });
        }
      }
      var fs$appendFile = fs2.appendFile;
      fs$appendFile && (fs2.appendFile = appendFile2);
      function appendFile2(path, data, options, cb) {
        return typeof options == "function" && (cb = options, options = null), go$appendFile(path, data, options, cb);
        function go$appendFile(path2, data2, options2, cb2, startTime) {
          return fs$appendFile(path2, data2, options2, function(err) {
            err && (err.code === "EMFILE" || err.code === "ENFILE") ? enqueue([go$appendFile, [path2, data2, options2, cb2], err, startTime || Date.now(), Date.now()]) : typeof cb2 == "function" && cb2.apply(this, arguments);
          });
        }
      }
      var fs$copyFile = fs2.copyFile;
      fs$copyFile && (fs2.copyFile = copyFile);
      function copyFile(src, dest, flags, cb) {
        return typeof flags == "function" && (cb = flags, flags = 0), go$copyFile(src, dest, flags, cb);
        function go$copyFile(src2, dest2, flags2, cb2, startTime) {
          return fs$copyFile(src2, dest2, flags2, function(err) {
            err && (err.code === "EMFILE" || err.code === "ENFILE") ? enqueue([go$copyFile, [src2, dest2, flags2, cb2], err, startTime || Date.now(), Date.now()]) : typeof cb2 == "function" && cb2.apply(this, arguments);
          });
        }
      }
      var fs$readdir = fs2.readdir;
      fs2.readdir = readdir2;
      var noReaddirOptionVersions = /^v[0-5]\./;
      function readdir2(path, options, cb) {
        typeof options == "function" && (cb = options, options = null);
        var go$readdir = noReaddirOptionVersions.test(process.version) ? function(path2, options2, cb2, startTime) {
          return fs$readdir(path2, fs$readdirCallback(
            path2,
            options2,
            cb2,
            startTime
          ));
        } : function(path2, options2, cb2, startTime) {
          return fs$readdir(path2, options2, fs$readdirCallback(
            path2,
            options2,
            cb2,
            startTime
          ));
        };
        return go$readdir(path, options, cb);
        function fs$readdirCallback(path2, options2, cb2, startTime) {
          return function(err, files) {
            err && (err.code === "EMFILE" || err.code === "ENFILE") ? enqueue([
              go$readdir,
              [path2, options2, cb2],
              err,
              startTime || Date.now(),
              Date.now()
            ]) : (files && files.sort && files.sort(), typeof cb2 == "function" && cb2.call(this, err, files));
          };
        }
      }
      if (process.version.substr(0, 4) === "v0.8") {
        var legStreams = legacy(fs2);
        ReadStream = legStreams.ReadStream, WriteStream = legStreams.WriteStream;
      }
      var fs$ReadStream = fs2.ReadStream;
      fs$ReadStream && (ReadStream.prototype = Object.create(fs$ReadStream.prototype), ReadStream.prototype.open = ReadStream$open);
      var fs$WriteStream = fs2.WriteStream;
      fs$WriteStream && (WriteStream.prototype = Object.create(fs$WriteStream.prototype), WriteStream.prototype.open = WriteStream$open), Object.defineProperty(fs2, "ReadStream", {
        get: function() {
          return ReadStream;
        },
        set: function(val) {
          ReadStream = val;
        },
        enumerable: !0,
        configurable: !0
      }), Object.defineProperty(fs2, "WriteStream", {
        get: function() {
          return WriteStream;
        },
        set: function(val) {
          WriteStream = val;
        },
        enumerable: !0,
        configurable: !0
      });
      var FileReadStream = ReadStream;
      Object.defineProperty(fs2, "FileReadStream", {
        get: function() {
          return FileReadStream;
        },
        set: function(val) {
          FileReadStream = val;
        },
        enumerable: !0,
        configurable: !0
      });
      var FileWriteStream = WriteStream;
      Object.defineProperty(fs2, "FileWriteStream", {
        get: function() {
          return FileWriteStream;
        },
        set: function(val) {
          FileWriteStream = val;
        },
        enumerable: !0,
        configurable: !0
      });
      function ReadStream(path, options) {
        return this instanceof ReadStream ? (fs$ReadStream.apply(this, arguments), this) : ReadStream.apply(Object.create(ReadStream.prototype), arguments);
      }
      function ReadStream$open() {
        var that = this;
        open4(that.path, that.flags, that.mode, function(err, fd) {
          err ? (that.autoClose && that.destroy(), that.emit("error", err)) : (that.fd = fd, that.emit("open", fd), that.read());
        });
      }
      function WriteStream(path, options) {
        return this instanceof WriteStream ? (fs$WriteStream.apply(this, arguments), this) : WriteStream.apply(Object.create(WriteStream.prototype), arguments);
      }
      function WriteStream$open() {
        var that = this;
        open4(that.path, that.flags, that.mode, function(err, fd) {
          err ? (that.destroy(), that.emit("error", err)) : (that.fd = fd, that.emit("open", fd));
        });
      }
      function createReadStream(path, options) {
        return new fs2.ReadStream(path, options);
      }
      function createWriteStream(path, options) {
        return new fs2.WriteStream(path, options);
      }
      var fs$open = fs2.open;
      fs2.open = open4;
      function open4(path, flags, mode, cb) {
        return typeof mode == "function" && (cb = mode, mode = null), go$open(path, flags, mode, cb);
        function go$open(path2, flags2, mode2, cb2, startTime) {
          return fs$open(path2, flags2, mode2, function(err, fd) {
            err && (err.code === "EMFILE" || err.code === "ENFILE") ? enqueue([go$open, [path2, flags2, mode2, cb2], err, startTime || Date.now(), Date.now()]) : typeof cb2 == "function" && cb2.apply(this, arguments);
          });
        }
      }
      return fs2;
    }
    function enqueue(elem) {
      debug("ENQUEUE", elem[0].name, elem[1]), fs[gracefulQueue].push(elem), retry();
    }
    var retryTimer;
    function resetQueue() {
      for (var now = Date.now(), i = 0; i < fs[gracefulQueue].length; ++i)
        fs[gracefulQueue][i].length > 2 && (fs[gracefulQueue][i][3] = now, fs[gracefulQueue][i][4] = now);
      retry();
    }
    function retry() {
      if (clearTimeout(retryTimer), retryTimer = void 0, fs[gracefulQueue].length !== 0) {
        var elem = fs[gracefulQueue].shift(), fn = elem[0], args = elem[1], err = elem[2], startTime = elem[3], lastTime = elem[4];
        if (startTime === void 0)
          debug("RETRY", fn.name, args), fn.apply(null, args);
        else if (Date.now() - startTime >= 6e4) {
          debug("TIMEOUT", fn.name, args);
          var cb = args.pop();
          typeof cb == "function" && cb.call(null, err);
        } else {
          var sinceAttempt = Date.now() - lastTime, sinceStart = Math.max(lastTime - startTime, 1), desiredDelay = Math.min(sinceStart * 1.2, 100);
          sinceAttempt >= desiredDelay ? (debug("RETRY", fn.name, args), fn.apply(null, args.concat([startTime]))) : fs[gracefulQueue].push(elem);
        }
        retryTimer === void 0 && (retryTimer = setTimeout(retry, 0));
      }
    }
  }
});

// ../../node_modules/.pnpm/retry@0.12.0/node_modules/retry/lib/retry_operation.js
var require_retry_operation = __commonJS({
  "../../node_modules/.pnpm/retry@0.12.0/node_modules/retry/lib/retry_operation.js"(exports, module) {
    function RetryOperation(timeouts, options) {
      typeof options == "boolean" && (options = { forever: options }), this._originalTimeouts = JSON.parse(JSON.stringify(timeouts)), this._timeouts = timeouts, this._options = options || {}, this._maxRetryTime = options && options.maxRetryTime || 1 / 0, this._fn = null, this._errors = [], this._attempts = 1, this._operationTimeout = null, this._operationTimeoutCb = null, this._timeout = null, this._operationStart = null, this._options.forever && (this._cachedTimeouts = this._timeouts.slice(0));
    }
    module.exports = RetryOperation;
    RetryOperation.prototype.reset = function() {
      this._attempts = 1, this._timeouts = this._originalTimeouts;
    };
    RetryOperation.prototype.stop = function() {
      this._timeout && clearTimeout(this._timeout), this._timeouts = [], this._cachedTimeouts = null;
    };
    RetryOperation.prototype.retry = function(err) {
      if (this._timeout && clearTimeout(this._timeout), !err)
        return !1;
      var currentTime = (/* @__PURE__ */ new Date()).getTime();
      if (err && currentTime - this._operationStart >= this._maxRetryTime)
        return this._errors.unshift(new Error("RetryOperation timeout occurred")), !1;
      this._errors.push(err);
      var timeout = this._timeouts.shift();
      if (timeout === void 0)
        if (this._cachedTimeouts)
          this._errors.splice(this._errors.length - 1, this._errors.length), this._timeouts = this._cachedTimeouts.slice(0), timeout = this._timeouts.shift();
        else
          return !1;
      var self = this, timer = setTimeout(function() {
        self._attempts++, self._operationTimeoutCb && (self._timeout = setTimeout(function() {
          self._operationTimeoutCb(self._attempts);
        }, self._operationTimeout), self._options.unref && self._timeout.unref()), self._fn(self._attempts);
      }, timeout);
      return this._options.unref && timer.unref(), !0;
    };
    RetryOperation.prototype.attempt = function(fn, timeoutOps) {
      this._fn = fn, timeoutOps && (timeoutOps.timeout && (this._operationTimeout = timeoutOps.timeout), timeoutOps.cb && (this._operationTimeoutCb = timeoutOps.cb));
      var self = this;
      this._operationTimeoutCb && (this._timeout = setTimeout(function() {
        self._operationTimeoutCb();
      }, self._operationTimeout)), this._operationStart = (/* @__PURE__ */ new Date()).getTime(), this._fn(this._attempts);
    };
    RetryOperation.prototype.try = function(fn) {
      console.log("Using RetryOperation.try() is deprecated"), this.attempt(fn);
    };
    RetryOperation.prototype.start = function(fn) {
      console.log("Using RetryOperation.start() is deprecated"), this.attempt(fn);
    };
    RetryOperation.prototype.start = RetryOperation.prototype.try;
    RetryOperation.prototype.errors = function() {
      return this._errors;
    };
    RetryOperation.prototype.attempts = function() {
      return this._attempts;
    };
    RetryOperation.prototype.mainError = function() {
      if (this._errors.length === 0)
        return null;
      for (var counts = {}, mainError = null, mainErrorCount = 0, i = 0; i < this._errors.length; i++) {
        var error = this._errors[i], message = error.message, count = (counts[message] || 0) + 1;
        counts[message] = count, count >= mainErrorCount && (mainError = error, mainErrorCount = count);
      }
      return mainError;
    };
  }
});

// ../../node_modules/.pnpm/retry@0.12.0/node_modules/retry/lib/retry.js
var require_retry = __commonJS({
  "../../node_modules/.pnpm/retry@0.12.0/node_modules/retry/lib/retry.js"(exports) {
    var RetryOperation = require_retry_operation();
    exports.operation = function(options) {
      var timeouts = exports.timeouts(options);
      return new RetryOperation(timeouts, {
        forever: options && options.forever,
        unref: options && options.unref,
        maxRetryTime: options && options.maxRetryTime
      });
    };
    exports.timeouts = function(options) {
      if (options instanceof Array)
        return [].concat(options);
      var opts = {
        retries: 10,
        factor: 2,
        minTimeout: 1 * 1e3,
        maxTimeout: 1 / 0,
        randomize: !1
      };
      for (var key in options)
        opts[key] = options[key];
      if (opts.minTimeout > opts.maxTimeout)
        throw new Error("minTimeout is greater than maxTimeout");
      for (var timeouts = [], i = 0; i < opts.retries; i++)
        timeouts.push(this.createTimeout(i, opts));
      return options && options.forever && !timeouts.length && timeouts.push(this.createTimeout(i, opts)), timeouts.sort(function(a, b) {
        return a - b;
      }), timeouts;
    };
    exports.createTimeout = function(attempt, opts) {
      var random = opts.randomize ? Math.random() + 1 : 1, timeout = Math.round(random * opts.minTimeout * Math.pow(opts.factor, attempt));
      return timeout = Math.min(timeout, opts.maxTimeout), timeout;
    };
    exports.wrap = function(obj, options, methods) {
      if (options instanceof Array && (methods = options, options = null), !methods) {
        methods = [];
        for (var key in obj)
          typeof obj[key] == "function" && methods.push(key);
      }
      for (var i = 0; i < methods.length; i++) {
        var method = methods[i], original = obj[method];
        obj[method] = function(original2) {
          var op = exports.operation(options), args = Array.prototype.slice.call(arguments, 1), callback = args.pop();
          args.push(function(err) {
            op.retry(err) || (err && (arguments[0] = op.mainError()), callback.apply(this, arguments));
          }), op.attempt(function() {
            original2.apply(obj, args);
          });
        }.bind(obj, original), obj[method].options = options;
      }
    };
  }
});

// ../../node_modules/.pnpm/retry@0.12.0/node_modules/retry/index.js
var require_retry2 = __commonJS({
  "../../node_modules/.pnpm/retry@0.12.0/node_modules/retry/index.js"(exports, module) {
    module.exports = require_retry();
  }
});

// ../../node_modules/.pnpm/signal-exit@3.0.7/node_modules/signal-exit/signals.js
var require_signals = __commonJS({
  "../../node_modules/.pnpm/signal-exit@3.0.7/node_modules/signal-exit/signals.js"(exports, module) {
    module.exports = [
      "SIGABRT",
      "SIGALRM",
      "SIGHUP",
      "SIGINT",
      "SIGTERM"
    ];
    process.platform !== "win32" && module.exports.push(
      "SIGVTALRM",
      "SIGXCPU",
      "SIGXFSZ",
      "SIGUSR2",
      "SIGTRAP",
      "SIGSYS",
      "SIGQUIT",
      "SIGIOT"
      // should detect profiler and enable/disable accordingly.
      // see #21
      // 'SIGPROF'
    );
    process.platform === "linux" && module.exports.push(
      "SIGIO",
      "SIGPOLL",
      "SIGPWR",
      "SIGSTKFLT",
      "SIGUNUSED"
    );
  }
});

// ../../node_modules/.pnpm/signal-exit@3.0.7/node_modules/signal-exit/index.js
var require_signal_exit = __commonJS({
  "../../node_modules/.pnpm/signal-exit@3.0.7/node_modules/signal-exit/index.js"(exports, module) {
    var process2 = global.process, processOk = function(process3) {
      return process3 && typeof process3 == "object" && typeof process3.removeListener == "function" && typeof process3.emit == "function" && typeof process3.reallyExit == "function" && typeof process3.listeners == "function" && typeof process3.kill == "function" && typeof process3.pid == "number" && typeof process3.on == "function";
    };
    processOk(process2) ? (assert = __require("assert"), signals = require_signals(), isWin = /^win/i.test(process2.platform), EE = __require("events"), typeof EE != "function" && (EE = EE.EventEmitter), process2.__signal_exit_emitter__ ? emitter = process2.__signal_exit_emitter__ : (emitter = process2.__signal_exit_emitter__ = new EE(), emitter.count = 0, emitter.emitted = {}), emitter.infinite || (emitter.setMaxListeners(1 / 0), emitter.infinite = !0), module.exports = function(cb, opts) {
      if (!processOk(global.process))
        return function() {
        };
      assert.equal(typeof cb, "function", "a callback must be provided for exit handler"), loaded === !1 && load();
      var ev = "exit";
      opts && opts.alwaysLast && (ev = "afterexit");
      var remove = function() {
        emitter.removeListener(ev, cb), emitter.listeners("exit").length === 0 && emitter.listeners("afterexit").length === 0 && unload();
      };
      return emitter.on(ev, cb), remove;
    }, unload = function() {
      !loaded || !processOk(global.process) || (loaded = !1, signals.forEach(function(sig) {
        try {
          process2.removeListener(sig, sigListeners[sig]);
        } catch {
        }
      }), process2.emit = originalProcessEmit, process2.reallyExit = originalProcessReallyExit, emitter.count -= 1);
    }, module.exports.unload = unload, emit = function(event, code, signal) {
      emitter.emitted[event] || (emitter.emitted[event] = !0, emitter.emit(event, code, signal));
    }, sigListeners = {}, signals.forEach(function(sig) {
      sigListeners[sig] = function() {
        if (processOk(global.process)) {
          var listeners = process2.listeners(sig);
          listeners.length === emitter.count && (unload(), emit("exit", null, sig), emit("afterexit", null, sig), isWin && sig === "SIGHUP" && (sig = "SIGINT"), process2.kill(process2.pid, sig));
        }
      };
    }), module.exports.signals = function() {
      return signals;
    }, loaded = !1, load = function() {
      loaded || !processOk(global.process) || (loaded = !0, emitter.count += 1, signals = signals.filter(function(sig) {
        try {
          return process2.on(sig, sigListeners[sig]), !0;
        } catch {
          return !1;
        }
      }), process2.emit = processEmit, process2.reallyExit = processReallyExit);
    }, module.exports.load = load, originalProcessReallyExit = process2.reallyExit, processReallyExit = function(code) {
      processOk(global.process) && (process2.exitCode = code || /* istanbul ignore next */
      0, emit("exit", process2.exitCode, null), emit("afterexit", process2.exitCode, null), originalProcessReallyExit.call(process2, process2.exitCode));
    }, originalProcessEmit = process2.emit, processEmit = function(ev, arg) {
      if (ev === "exit" && processOk(global.process)) {
        arg !== void 0 && (process2.exitCode = arg);
        var ret = originalProcessEmit.apply(this, arguments);
        return emit("exit", process2.exitCode, null), emit("afterexit", process2.exitCode, null), ret;
      } else
        return originalProcessEmit.apply(this, arguments);
    }) : module.exports = function() {
      return function() {
      };
    };
    var assert, signals, isWin, EE, emitter, unload, emit, sigListeners, loaded, load, originalProcessReallyExit, processReallyExit, originalProcessEmit, processEmit;
  }
});

// ../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/lib/mtime-precision.js
var require_mtime_precision = __commonJS({
  "../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/lib/mtime-precision.js"(exports, module) {
    "use strict";
    var cacheSymbol = /* @__PURE__ */ Symbol();
    function probe(file, fs, callback) {
      let cachedPrecision = fs[cacheSymbol];
      if (cachedPrecision)
        return fs.stat(file, (err, stat2) => {
          if (err)
            return callback(err);
          callback(null, stat2.mtime, cachedPrecision);
        });
      let mtime = new Date(Math.ceil(Date.now() / 1e3) * 1e3 + 5);
      fs.utimes(file, mtime, mtime, (err) => {
        if (err)
          return callback(err);
        fs.stat(file, (err2, stat2) => {
          if (err2)
            return callback(err2);
          let precision = stat2.mtime.getTime() % 1e3 === 0 ? "s" : "ms";
          Object.defineProperty(fs, cacheSymbol, { value: precision }), callback(null, stat2.mtime, precision);
        });
      });
    }
    function getMtime(precision) {
      let now = Date.now();
      return precision === "s" && (now = Math.ceil(now / 1e3) * 1e3), new Date(now);
    }
    module.exports.probe = probe;
    module.exports.getMtime = getMtime;
  }
});

// ../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/lib/lockfile.js
var require_lockfile = __commonJS({
  "../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/lib/lockfile.js"(exports, module) {
    "use strict";
    var path = __require("path"), fs = require_graceful_fs(), retry = require_retry2(), onExit = require_signal_exit(), mtimePrecision = require_mtime_precision(), locks = {};
    function getLockFile(file, options) {
      return options.lockfilePath || `${file}.lock`;
    }
    function resolveCanonicalPath(file, options, callback) {
      if (!options.realpath)
        return callback(null, path.resolve(file));
      options.fs.realpath(file, callback);
    }
    function acquireLock(file, options, callback) {
      let lockfilePath = getLockFile(file, options);
      options.fs.mkdir(lockfilePath, (err) => {
        if (!err)
          return mtimePrecision.probe(lockfilePath, options.fs, (err2, mtime, mtimePrecision2) => {
            if (err2)
              return options.fs.rmdir(lockfilePath, () => {
              }), callback(err2);
            callback(null, mtime, mtimePrecision2);
          });
        if (err.code !== "EEXIST")
          return callback(err);
        if (options.stale <= 0)
          return callback(Object.assign(new Error("Lock file is already being held"), { code: "ELOCKED", file }));
        options.fs.stat(lockfilePath, (err2, stat2) => {
          if (err2)
            return err2.code === "ENOENT" ? acquireLock(file, { ...options, stale: 0 }, callback) : callback(err2);
          if (!isLockStale(stat2, options))
            return callback(Object.assign(new Error("Lock file is already being held"), { code: "ELOCKED", file }));
          removeLock(file, options, (err3) => {
            if (err3)
              return callback(err3);
            acquireLock(file, { ...options, stale: 0 }, callback);
          });
        });
      });
    }
    function isLockStale(stat2, options) {
      return stat2.mtime.getTime() < Date.now() - options.stale;
    }
    function removeLock(file, options, callback) {
      options.fs.rmdir(getLockFile(file, options), (err) => {
        if (err && err.code !== "ENOENT")
          return callback(err);
        callback();
      });
    }
    function updateLock(file, options) {
      let lock2 = locks[file];
      lock2.updateTimeout || (lock2.updateDelay = lock2.updateDelay || options.update, lock2.updateTimeout = setTimeout(() => {
        lock2.updateTimeout = null, options.fs.stat(lock2.lockfilePath, (err, stat2) => {
          let isOverThreshold = lock2.lastUpdate + options.stale < Date.now();
          if (err)
            return err.code === "ENOENT" || isOverThreshold ? setLockAsCompromised(file, lock2, Object.assign(err, { code: "ECOMPROMISED" })) : (lock2.updateDelay = 1e3, updateLock(file, options));
          if (!(lock2.mtime.getTime() === stat2.mtime.getTime()))
            return setLockAsCompromised(
              file,
              lock2,
              Object.assign(
                new Error("Unable to update lock within the stale threshold"),
                { code: "ECOMPROMISED" }
              )
            );
          let mtime = mtimePrecision.getMtime(lock2.mtimePrecision);
          options.fs.utimes(lock2.lockfilePath, mtime, mtime, (err2) => {
            let isOverThreshold2 = lock2.lastUpdate + options.stale < Date.now();
            if (!lock2.released) {
              if (err2)
                return err2.code === "ENOENT" || isOverThreshold2 ? setLockAsCompromised(file, lock2, Object.assign(err2, { code: "ECOMPROMISED" })) : (lock2.updateDelay = 1e3, updateLock(file, options));
              lock2.mtime = mtime, lock2.lastUpdate = Date.now(), lock2.updateDelay = null, updateLock(file, options);
            }
          });
        });
      }, lock2.updateDelay), lock2.updateTimeout.unref && lock2.updateTimeout.unref());
    }
    function setLockAsCompromised(file, lock2, err) {
      lock2.released = !0, lock2.updateTimeout && clearTimeout(lock2.updateTimeout), locks[file] === lock2 && delete locks[file], lock2.options.onCompromised(err);
    }
    function lock(file, options, callback) {
      options = {
        stale: 1e4,
        update: null,
        realpath: !0,
        retries: 0,
        fs,
        onCompromised: (err) => {
          throw err;
        },
        ...options
      }, options.retries = options.retries || 0, options.retries = typeof options.retries == "number" ? { retries: options.retries } : options.retries, options.stale = Math.max(options.stale || 0, 2e3), options.update = options.update == null ? options.stale / 2 : options.update || 0, options.update = Math.max(Math.min(options.update, options.stale / 2), 1e3), resolveCanonicalPath(file, options, (err, file2) => {
        if (err)
          return callback(err);
        let operation = retry.operation(options.retries);
        operation.attempt(() => {
          acquireLock(file2, options, (err2, mtime, mtimePrecision2) => {
            if (operation.retry(err2))
              return;
            if (err2)
              return callback(operation.mainError());
            let lock2 = locks[file2] = {
              lockfilePath: getLockFile(file2, options),
              mtime,
              mtimePrecision: mtimePrecision2,
              options,
              lastUpdate: Date.now()
            };
            updateLock(file2, options), callback(null, (releasedCallback) => {
              if (lock2.released)
                return releasedCallback && releasedCallback(Object.assign(new Error("Lock is already released"), { code: "ERELEASED" }));
              unlock(file2, { ...options, realpath: !1 }, releasedCallback);
            });
          });
        });
      });
    }
    function unlock(file, options, callback) {
      options = {
        fs,
        realpath: !0,
        ...options
      }, resolveCanonicalPath(file, options, (err, file2) => {
        if (err)
          return callback(err);
        let lock2 = locks[file2];
        if (!lock2)
          return callback(Object.assign(new Error("Lock is not acquired/owned by you"), { code: "ENOTACQUIRED" }));
        lock2.updateTimeout && clearTimeout(lock2.updateTimeout), lock2.released = !0, delete locks[file2], removeLock(file2, options, callback);
      });
    }
    function check(file, options, callback) {
      options = {
        stale: 1e4,
        realpath: !0,
        fs,
        ...options
      }, options.stale = Math.max(options.stale || 0, 2e3), resolveCanonicalPath(file, options, (err, file2) => {
        if (err)
          return callback(err);
        options.fs.stat(getLockFile(file2, options), (err2, stat2) => err2 ? err2.code === "ENOENT" ? callback(null, !1) : callback(err2) : callback(null, !isLockStale(stat2, options)));
      });
    }
    function getLocks() {
      return locks;
    }
    onExit(() => {
      for (let file in locks) {
        let options = locks[file].options;
        try {
          options.fs.rmdirSync(getLockFile(file, options));
        } catch {
        }
      }
    });
    module.exports.lock = lock;
    module.exports.unlock = unlock;
    module.exports.check = check;
    module.exports.getLocks = getLocks;
  }
});

// ../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/lib/adapter.js
var require_adapter = __commonJS({
  "../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/lib/adapter.js"(exports, module) {
    "use strict";
    var fs = require_graceful_fs();
    function createSyncFs(fs2) {
      let methods = ["mkdir", "realpath", "stat", "rmdir", "utimes"], newFs = { ...fs2 };
      return methods.forEach((method) => {
        newFs[method] = (...args) => {
          let callback = args.pop(), ret;
          try {
            ret = fs2[`${method}Sync`](...args);
          } catch (err) {
            return callback(err);
          }
          callback(null, ret);
        };
      }), newFs;
    }
    function toPromise(method) {
      return (...args) => new Promise((resolve, reject) => {
        args.push((err, result) => {
          err ? reject(err) : resolve(result);
        }), method(...args);
      });
    }
    function toSync(method) {
      return (...args) => {
        let err, result;
        if (args.push((_err, _result) => {
          err = _err, result = _result;
        }), method(...args), err)
          throw err;
        return result;
      };
    }
    function toSyncOptions(options) {
      if (options = { ...options }, options.fs = createSyncFs(options.fs || fs), typeof options.retries == "number" && options.retries > 0 || options.retries && typeof options.retries.retries == "number" && options.retries.retries > 0)
        throw Object.assign(new Error("Cannot use retries with the sync api"), { code: "ESYNC" });
      return options;
    }
    module.exports = {
      toPromise,
      toSync,
      toSyncOptions
    };
  }
});

// ../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/index.js
var require_proper_lockfile = __commonJS({
  "../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/index.js"(exports, module) {
    "use strict";
    var lockfile = require_lockfile(), { toPromise, toSync, toSyncOptions } = require_adapter();
    async function lock(file, options) {
      let release = await toPromise(lockfile.lock)(file, options);
      return toPromise(release);
    }
    function lockSync(file, options) {
      let release = toSync(lockfile.lock)(file, toSyncOptions(options));
      return toSync(release);
    }
    function unlock(file, options) {
      return toPromise(lockfile.unlock)(file, options);
    }
    function unlockSync(file, options) {
      return toSync(lockfile.unlock)(file, toSyncOptions(options));
    }
    function check(file, options) {
      return toPromise(lockfile.check)(file, options);
    }
    function checkSync(file, options) {
      return toSync(lockfile.check)(file, toSyncOptions(options));
    }
    module.exports = lock;
    module.exports.lock = lock;
    module.exports.unlock = unlock;
    module.exports.lockSync = lockSync;
    module.exports.unlockSync = unlockSync;
    module.exports.check = check;
    module.exports.checkSync = checkSync;
  }
});

// ../shared/runtime/process-lock.ts
import { createHash as createHash2, randomUUID as randomUUID3 } from "node:crypto";
import { lstat, mkdir, realpath, unlink } from "node:fs/promises";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join as join5 } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
async function coordinationPath(name) {
  if (process.platform === WINDOWS_PLATFORM) return `\\\\.\\pipe\\${name}`;
  if (process.platform !== MACOS_PLATFORM || !process.getuid)
    throw new Error("Office runtime coordination requires Windows or macOS.");
  let uid = process.getuid(), directory = join5(tmpdir(), `office-copilot-${uid}`);
  await mkdir(directory, { recursive: !0, mode: 448 });
  let metadata = await lstat(directory);
  if (!metadata.isDirectory() || metadata.uid !== uid || (metadata.mode & 63) !== 0)
    throw new Error("Office runtime coordination requires a private, user-owned socket directory.");
  let path = join5(directory, createHash2("sha256").update(name).digest("hex").slice(0, 24));
  if (Buffer.byteLength(path) > 103) throw new Error("The temporary directory path is too long for Office runtime coordination.");
  return path;
}
async function listenExclusive(name) {
  let path = await coordinationPath(name), server = createServer((socket) => socket.destroy());
  return new Promise((resolve, reject) => {
    let onError = (error) => {
      error.code === "EADDRINUSE" ? resolve(void 0) : reject(error);
    };
    server.once("error", onError), server.listen(path, () => {
      server.off("error", onError), resolve(server);
    });
  });
}
function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
async function isListening(name) {
  let path = await coordinationPath(name);
  return new Promise((resolve, reject) => {
    let socket = connect(path), finish = (alive) => {
      socket.destroy(), resolve(alive);
    };
    socket.once("connect", () => finish(!0)), socket.once("error", (error) => {
      if (socket.destroy(), process.platform === WINDOWS_PLATFORM) {
        resolve(!1);
        return;
      }
      if (error.code !== "ENOENT" && error.code !== "ECONNREFUSED") {
        reject(error);
        return;
      }
      process.platform === MACOS_PLATFORM && error.code === "ECONNREFUSED" ? unlink(path).then(() => resolve(!1), (failure) => {
        failure.code === "ENOENT" ? resolve(!1) : reject(failure);
      }) : resolve(!1);
    });
  });
}
function createDirectoryLock(directory, resource, {
  timeoutMs = 3e4,
  retryMs = 25,
  product = GENERIC_AUTH_PRODUCT
} = {}) {
  let name, resolveName = () => name ??= (async () => {
    await mkdir(directory, { recursive: !0, mode: 448 });
    let resolved = await realpath(directory), canonical = process.platform === WINDOWS_PLATFORM ? resolved.toLowerCase() : resolved, hash = createHash2("sha256").update(`${canonical}\0${resource}`).digest("hex");
    return `${product.lockPrefix}-lock-${hash}`;
  })().catch((error) => {
    throw name = void 0, error;
  });
  async function tryAcquire() {
    let lockName = await resolveName();
    if (process.platform === MACOS_PLATFORM) {
      let { default: lockfile } = await Promise.resolve().then(() => __toESM(require_proper_lockfile(), 1));
      try {
        return { release: await lockfile.lock(join5(directory, `.${lockName}`), {
          realpath: !1
        }) };
      } catch (error) {
        if (error?.code === "ELOCKED") return;
        throw error;
      }
    }
    let server = await listenExclusive(lockName);
    return server ? { release: () => closeServer(server) } : void 0;
  }
  async function acquire() {
    let deadline = Date.now() + timeoutMs;
    for (; ; ) {
      let held = await tryAcquire();
      if (held) return held;
      if (Date.now() >= deadline)
        throw new Error(`${product.name} ${resource} is locked by another Copilot session. Try again shortly.`);
      await sleep(retryMs);
    }
  }
  return {
    tryAcquire,
    async run(work) {
      let held = await acquire();
      try {
        return await work();
      } finally {
        await held.release();
      }
    }
  };
}
async function createRuntimeInstance(product = GENERIC_AUTH_PRODUCT) {
  let id = randomUUID3(), server = await listenExclusive(`${product.lockPrefix}-runtime-instance-${id}`);
  if (!server) throw new Error(`A ${product.name} runtime instance identifier collided.`);
  return { id, release: () => closeServer(server) };
}
async function isRuntimeInstanceAlive(id, product = GENERIC_AUTH_PRODUCT) {
  return typeof id != "string" || !INSTANCE_ID.test(id) ? !1 : isListening(`${product.lockPrefix}-runtime-instance-${id}`);
}
var INSTANCE_ID, init_process_lock = __esm({
  "../shared/runtime/process-lock.ts"() {
    init_auth_product();
    INSTANCE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  }
});

// src/runtime/auth-contract.ts
var init_auth_contract2 = __esm({
  "src/runtime/auth-contract.ts"() {
    init_auth_contract();
  }
});

// src/runtime/renewable-office-fetch.ts
function createRenewableOfficeFetch2(fetchImpl, officeTokenProvider, onUnauthorized) {
  return createRenewableOfficeFetch(fetchImpl, officeTokenProvider, onUnauthorized, POWERPOINT_AUTH_PRODUCT);
}
var init_renewable_office_fetch2 = __esm({
  "src/runtime/renewable-office-fetch.ts"() {
    init_auth_product2();
    init_renewable_office_fetch();
  }
});

// ../shared/auth/account-auth.ts
import { access, mkdir as mkdir5, readFile as readFile7, rename as rename3, rm as rm5, writeFile as writeFile4 } from "node:fs/promises";
import { dirname as dirname4, join as join12 } from "node:path";
function createAccountAuth({
  provider,
  selectionPath,
  legacySelectionPath,
  now = Date.now,
  product = GENERIC_AUTH_PRODUCT,
  lock = createDirectoryLock(dirname4(selectionPath), "account selection", { product })
}) {
  let importMarkerPath = join12(dirname4(selectionPath), "legacy-import.json"), account, changing = !1, generation = 0, uses = 0, coordination = {}, cache = /* @__PURE__ */ new Map(), pending = /* @__PURE__ */ new Map(), challenges = /* @__PURE__ */ new Map();
  function tokenResult(result, expected) {
    let identity = validateAccount(result.account);
    if (expected && !sameAccount(expected, identity))
      throw new AuthError("account_mismatch", "Authentication returned a different account or tenant. No token was used.");
    let expiresAt = Date.parse(result.expiresOn);
    if (typeof result.accessToken != "string" || !result.accessToken || !Number.isFinite(expiresAt) || expiresAt <= now())
      throw new AuthError("authentication_failed", "The auth helper returned an expired or invalid token.");
    return { identity, token: result.accessToken, expiresAt };
  }
  async function persist(identity) {
    if (await mkdir5(dirname4(selectionPath), { recursive: !0, mode: 448 }), !identity) {
      await rm5(selectionPath, { force: !0 });
      return;
    }
    let temporary = `${selectionPath}.${process.pid}.tmp`;
    await writeFile4(temporary, JSON.stringify({ version: 1, account: identity }), { mode: 384 }), await rename3(temporary, selectionPath);
  }
  function status() {
    return {
      generation,
      state: changing ? "connecting" : account ? challenges.size ? "reauthentication_required" : "connected" : "disconnected",
      ...account ? { account: { ...account } } : {},
      requiredResources: [...challenges.keys()]
    };
  }
  function clear() {
    generation++, cache.clear(), pending.clear(), challenges.clear();
  }
  async function readSelection() {
    let record;
    try {
      record = JSON.parse(await readFile7(selectionPath, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw new AuthError("authentication_failed", `${product.name} account state is unreadable. Repair or remove the account selection file.`);
    }
    if (record?.version !== 1) throw new AuthError("authentication_failed", `Unsupported ${product.name} account state.`);
    return validateAccount(record.account);
  }
  async function synchronize(mayAdopt = () => !0) {
    let selected = await readSelection();
    (selected && account ? sameAccount(selected, account) && selected.username === account.username : selected === account) || !mayAdopt() || (clear(), account = selected, coordination.onAccountChanged?.());
  }
  async function markLegacyImportSettled() {
    legacySelectionPath && (await mkdir5(dirname4(importMarkerPath), { recursive: !0, mode: 448 }), await writeFile4(importMarkerPath, JSON.stringify({ version: 1 }), { mode: 384 }));
  }
  async function importLegacySelection() {
    if (!legacySelectionPath || await exists(importMarkerPath)) return;
    let held = await lock.tryAcquire();
    if (held)
      try {
        if (await exists(importMarkerPath)) return;
        let legacy;
        try {
          let record = JSON.parse(await readFile7(legacySelectionPath, "utf8"));
          record?.version === 1 && (legacy = validateAccount(record.account));
        } catch {
        }
        legacy && !await exists(selectionPath) && await persist(legacy), await markLegacyImportSettled();
      } finally {
        await held.release();
      }
  }
  async function interactive(work) {
    if (changing || pending.size) throw new AuthError("auth_busy", `Another ${product.name} authentication operation is active.`);
    changing = !0;
    let held;
    try {
      if (held = await lock.tryAcquire(), !held)
        throw new AuthError("auth_busy", `Another Copilot session is changing the ${product.name} account. Try again after it finishes.`);
      if (await markLegacyImportSettled(), await coordination.busyElsewhere?.())
        throw new AuthError("auth_busy", `A ${product.name} operation is running in another Copilot session. Wait for it to finish before changing the account.`);
      await synchronize(), await work();
    } finally {
      changing = !1, await held?.release();
    }
    return status();
  }
  return {
    async initialize() {
      await importLegacySelection(), account = await readSelection();
    },
    async refresh() {
      let idle = () => !changing && uses === 0 && !coordination.locallyBusy?.();
      idle() && await synchronize(idle);
    },
    // Pins the current account for work outside the operation journal, such as
    // uploads, and blocks account changes here until released. With `publish`,
    // other sessions are also told, so they refuse to change the account meanwhile.
    async beginUse({ publish = !0 } = {}) {
      if (changing) throw new AuthError("auth_busy", `${product.name} account selection is changing.`);
      uses++;
      let pinned = generation, releaseLease;
      try {
        publish && (releaseLease = await coordination.registerUse?.());
      } catch (error) {
        throw uses--, error;
      }
      let released = !1;
      return {
        generation: pinned,
        async release() {
          released || (released = !0, uses--, await releaseLease?.());
        }
      };
    },
    configureCoordination(options) {
      coordination = { ...coordination, ...options };
    },
    status,
    requireInteraction(scope, claims) {
      for (let key of cache.keys())
        key.startsWith(`${scope}\0`) && cache.delete(key);
      challenges.set(scope, normalizeClaims(claims));
    },
    async connect({ switchAccount = !1, tenantId, username } = {}, signal) {
      if (tenantId && !GUID.test(tenantId)) throw new AuthError("invalid_request", "Tenant ID must be a GUID.");
      return username = normalizeAccountUsername(username), interactive(async () => {
        let selected = switchAccount ? void 0 : account;
        if (selected && tenantId && selected.tenantId.toLowerCase() !== tenantId.toLowerCase())
          throw new AuthError("account_mismatch", "Use Switch account to select a different tenant.");
        if (selected?.username && username && selected.username.toLowerCase() !== username.toLowerCase())
          throw new AuthError("account_mismatch", "Use Switch account to select a different username.");
        let tokens = /* @__PURE__ */ new Map(), resources = /* @__PURE__ */ new Set([
          ...resolveProductConnectScopes(product),
          ...switchAccount ? [] : challenges.keys()
        ]);
        for (let scope of resources) {
          let claims = switchAccount ? void 0 : challenges.get(scope), result = tokenResult(await provider({
            operation: "connect",
            scope,
            account: selected,
            tenantId,
            ...!selected?.username && username ? { username } : {},
            ...claims ? { claims } : {},
            forceRefresh: !0,
            forceInteractive: !switchAccount && challenges.has(scope)
          }, signal), selected);
          if (tenantId && result.identity.tenantId.toLowerCase() !== tenantId.toLowerCase())
            throw new AuthError("account_mismatch", "Sign-in returned a different tenant.");
          selected = result.identity, tokens.set(scope, { token: result.token, expiresAt: result.expiresAt });
        }
        signal?.throwIfAborted(), await persist(selected), clear(), account = selected;
        for (let [scope, token] of tokens) cache.set(`${scope}\0`, token);
      });
    },
    async disconnect(signal) {
      return interactive(async () => {
        let previous = account;
        await persist(), clear(), account = void 0, await provider({ operation: "disconnect", scope: OFFICE_SCOPE, account: previous }, signal);
      });
    },
    async getToken(scope, options = {}) {
      if (changing) throw new AuthError("auth_busy", `${product.name} account selection is changing.`);
      if (!account) throw new AuthError("not_connected", `Connect your ${product.name} account before using Office operations.`, scope);
      if (options.generation !== void 0 && options.generation !== generation)
        throw new AuthError("account_mismatch", `The ${product.name} account changed while this operation was running. No token for the new account was used.`, scope);
      if (challenges.has(scope))
        throw new AuthError("interaction_required", `Reconnect your ${product.name} account to satisfy the sign-in or consent requirement.`, scope);
      let claims = normalizeClaims(options.claims), force = options.forceRefresh === !0 || claims !== void 0 || options.rejectedToken !== void 0, key = `${scope}\0${claims ?? ""}`, cached = cache.get(key);
      if (!force && !pending.has(scope) && cached && cached.expiresAt > now() + 300 * 1e3) return cached.token;
      let selected = account, epoch = generation, operation = pending.get(scope);
      if (!operation || force && (!operation.force || operation.claims !== claims || operation.rejectedToken !== options.rejectedToken)) {
        let acquire = async () => {
          try {
            let result = tokenResult(await provider({
              operation: "token",
              scope,
              account: selected,
              forceRefresh: force,
              ...claims ? { claims } : {}
            }), selected);
            if (generation !== epoch) throw new AuthError("account_mismatch", `The ${product.name} account changed during authentication.`);
            if (options.rejectedToken && result.token === options.rejectedToken)
              throw new AuthError("interaction_required", `The Microsoft account provider returned the rejected cached token. Reconnect your ${product.name} account.`, scope, claims);
            if (challenges.has(scope))
              throw new AuthError("interaction_required", `Reconnect your ${product.name} account before retrying this resource.`, scope);
            return pending.get(scope) === entry && (cache.set(key, { token: result.token, expiresAt: result.expiresAt }), cache.set(`${scope}\0`, { token: result.token, expiresAt: result.expiresAt })), result.token;
          } catch (error) {
            throw cache.delete(key), cache.delete(`${scope}\0`), error instanceof AuthError && ["interaction_required", "account_unavailable"].includes(error.code) ? (challenges.set(scope, challenges.get(scope) ?? normalizeClaims(error.claims) ?? claims), new AuthError("interaction_required", `Reconnect your ${product.name} account to satisfy the sign-in or consent requirement.`, scope)) : error;
          }
        }, promise = operation ? operation.promise.then(acquire, acquire) : acquire(), entry = { force, claims, rejectedToken: options.rejectedToken, promise: promise.finally(() => {
          pending.get(scope) === entry && pending.delete(scope);
        }) };
        operation = entry, pending.set(scope, entry);
      }
      return operation.promise;
    }
  };
}
var exists, init_account_auth = __esm({
  "../shared/auth/account-auth.ts"() {
    init_process_lock();
    init_auth_product();
    init_auth_contract();
    exists = (path) => access(path).then(() => !0, () => !1);
  }
});

// src/runtime/account-auth.ts
function createAccountAuth2(options) {
  return createAccountAuth({ ...options, product: POWERPOINT_AUTH_PRODUCT });
}
var init_account_auth2 = __esm({
  "src/runtime/account-auth.ts"() {
    init_auth_product2();
    init_account_auth();
  }
});

// ../shared/auth/native-auth.ts
import { spawn } from "node:child_process";
import { win32 } from "node:path";
function resolveAuthWorkerLaunch({
  workerPath,
  execPath = process.execPath,
  argv = process.argv,
  env = process.env,
  parentPid = process.pid,
  product = GENERIC_AUTH_PRODUCT
}) {
  let workerEnv = {
    ...env,
    [product.workerPathEnvVar]: workerPath
  };
  if (/^node(?:\.exe)?$/i.test(win32.basename(execPath)))
    return { command: execPath, args: [workerPath], env: workerEnv };
  let bootstrap = argv.find((argument) => win32.basename(argument).toLowerCase() === "extension_bootstrap.mjs");
  if (bootstrap)
    return {
      command: execPath,
      args: [bootstrap],
      env: {
        ...workerEnv,
        COPILOT_EXTENSION_PARENT_PID: String(parentPid),
        EXTENSION_PATH: workerPath
      }
    };
  throw new AuthError(
    "broker_unavailable",
    `The Copilot extension runtime cannot launch the ${product.name} authentication worker.`
  );
}
function createNativeAuthProvider({
  workerPath,
  product = GENERIC_AUTH_PRODUCT,
  clientId = resolveProductClientId(product),
  authority = MSAL_ORGANIZATIONS_AUTHORITY,
  timeoutMs = AUTH_HELPER_TIMEOUT_MS,
  resolveLaunch = resolveAuthWorkerLaunch
}) {
  return (request, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AuthError("cancelled", `${product.name} sign-in was cancelled.`));
      return;
    }
    let launch;
    try {
      launch = resolveLaunch({ workerPath, product });
    } catch (error) {
      reject(error);
      return;
    }
    let child = spawn(launch.command, launch.args, {
      env: launch.env,
      windowsHide: !0,
      stdio: ["pipe", "pipe", "pipe"]
    }), output = "", failure, stop = (error) => {
      failure ??= error, child.kill();
    }, abort = () => stop(new AuthError("cancelled", `${product.name} sign-in was cancelled.`)), timer = setTimeout(
      () => stop(new AuthError("timeout", `${product.name} authentication timed out.`)),
      request.operation === "token" ? Math.min(timeoutMs, 6e4) : timeoutMs
    );
    signal?.addEventListener("abort", abort, { once: !0 }), child.stdout.setEncoding("utf8"), child.stdout.on("data", (chunk) => {
      output += chunk, output.length > 1024 * 1024 && stop(new AuthError("authentication_failed", "The auth helper returned an oversized response."));
    }), child.stderr.resume(), child.stdin.on("error", () => {
      stop(new AuthError("broker_unavailable", `The packaged ${product.name} auth helper could not receive its request.`));
    }), child.once("error", () => {
      failure = new AuthError("broker_unavailable", `The packaged ${product.name} auth helper could not start. Reinstall a package for this platform.`);
    }), child.once("close", (code) => {
      if (clearTimeout(timer), signal?.removeEventListener("abort", abort), failure) {
        reject(failure);
        return;
      }
      if (code !== 0 && !output.trim()) {
        reject(new AuthError(
          "broker_unavailable",
          `The authentication worker exited (${code === null ? "terminated" : "0x" + (code >>> 0).toString(16)}) before returning a result. Reconnect or reinstall the plugin.`
        ));
        return;
      }
      let result;
      try {
        result = JSON.parse(output);
      } catch {
        reject(new AuthError("authentication_failed", "The auth helper returned an invalid response."));
        return;
      }
      if (!result || typeof result != "object" || Array.isArray(result)) {
        reject(new AuthError("authentication_failed", "The auth helper returned an invalid response."));
        return;
      }
      if (code !== 0 || result.ok !== !0) {
        reject(new AuthError(
          typeof result.error?.code == "string" ? result.error.code : "authentication_failed",
          typeof result.error?.message == "string" ? result.error.message : `${product.name} authentication failed.`,
          request.scope,
          result.error?.claims
        ));
        return;
      }
      resolve(result);
    });
    let input = JSON.stringify({ ...request, clientId, authority });
    Buffer.byteLength(input) > 64 * 1024 ? stop(new AuthError("invalid_request", `${product.name} authentication input is too large.`)) : child.stdin.end(input);
  });
}
var init_native_auth = __esm({
  "../shared/auth/native-auth.ts"() {
    init_auth_contract();
    init_auth_product();
  }
});

// src/runtime/native-auth.ts
function createNativeAuthProvider2(options) {
  return createNativeAuthProvider({ ...options, product: POWERPOINT_AUTH_PRODUCT });
}
var init_native_auth2 = __esm({
  "src/runtime/native-auth.ts"() {
    init_auth_product2();
    init_native_auth();
  }
});

// src/runtime/runtime-profile-production.ts
var runtime_profile_production_exports = {};
__export(runtime_profile_production_exports, {
  createProfileRuntimeOptions: () => createProfileRuntimeOptions
});
import { join as join13 } from "node:path";
async function createProfileRuntimeOptions({ stateDirectory, uploadDirectory, authWorkerPath }) {
  let auth = createAccountAuth2({
    selectionPath: join13(stateDirectory, "auth", "selection.json"),
    legacySelectionPath: join13(legacyRuntimeStateDirectory("production"), "auth", "selection.json"),
    provider: createNativeAuthProvider2({ workerPath: authWorkerPath })
  }), officeTokenProvider = (options = {}) => auth.getToken(OFFICE_SCOPE, options);
  return {
    authController: auth,
    primusViewerHost: createPrimusViewerHost({
      resourceTokenProvider: (scope, options) => auth.getToken(scope, options),
      authStatus: () => auth.status(),
      onUnauthorized: (scope, claims) => auth.requireInteraction(scope, claims)
    }),
    presentationUploads: { temporaryDirectory: uploadDirectory },
    officeAuthorizationProvider: officeTokenProvider,
    upstreamFetchImpl: createRenewableOfficeFetch2(fetch, officeTokenProvider, (claims) => auth.requireInteraction(OFFICE_SCOPE, claims)),
    renewableOfficeAuthorization: !0
  };
}
var init_runtime_profile_production = __esm({
  "src/runtime/runtime-profile-production.ts"() {
    init_renewable_office_fetch2();
    init_account_auth2();
    init_native_auth2();
    init_auth_contract2();
    init_primus_viewer();
    init_runtime_identity();
  }
});

// src/extension.ts
init_runtime_identity();
import {
  CanvasError,
  createCanvas,
  joinSession
} from "@github/copilot-sdk/extension";
import { fileURLToPath as fileURLToPath3 } from "node:url";

// src/runtime/runtime-host.ts
import { randomUUID as randomUUID9 } from "node:crypto";
import { mkdir as mkdir4, readdir, rm as rm4, writeFile as writeFile2 } from "node:fs/promises";
import { join as join10 } from "node:path";

// src/runtime/office-task-proxy.ts
init_local_http();
init_local_http();
init_primus_viewer();
init_powerpoint_url();
import http from "node:http";
import { createHash as createHash4, randomUUID as randomUUID7 } from "node:crypto";
import { existsSync as existsSync2 } from "node:fs";
import { readFile as readFile5 } from "node:fs/promises";
import { dirname as dirname3, join as join9 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/runtime/operation-journal.ts
import { randomUUID as randomUUID4 } from "node:crypto";
import {
  appendFile,
  mkdir as mkdir2,
  readFile as readFile2,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { join as join6 } from "node:path";

// src/runtime/workflow-contract.ts
init_powerpoint_url();
import { createHash, randomUUID as randomUUID2 } from "node:crypto";
var PPTX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation", OFFICE_RESULT_OUTCOME_URI = "officeagent://result/outcome", OFFICE_RESULT_OUTCOME_MIME_TYPE = "application/json", OFFICE_RESULT_OUTCOME_SCHEMA_VERSION = 1, MAX_OFFICE_ERROR_DETAIL_CHARS = 1e3;
function requireString(value, name) {
  if (typeof value != "string" || !value.trim())
    throw new TypeError(`${name} must be a non-empty string.`);
  return value.trim();
}
function validateArtifactUrl(value) {
  return parseTrustedPowerPointUrl(
    requireString(value, "artifactUrl")
  ).toString();
}
function parsePowerPointWorkflowCall(params) {
  if (!params || typeof params != "object")
    throw new TypeError("PowerPoint workflow parameters are required.");
  let operation = params.name === "generate_artifact" ? "create" : params.name === "edit_artifact" ? "edit" : null;
  if (!operation)
    throw new TypeError(`Unsupported PowerPoint workflow tool: ${params.name}`);
  let input = params.arguments;
  if (!input || typeof input != "object")
    throw new TypeError("PowerPoint workflow arguments are required.");
  if (input.appName !== "PowerPoint")
    throw new TypeError("appName must be 'PowerPoint'.");
  let taskDescription = requireString(
    input.taskDescription,
    "taskDescription"
  ), idempotencyKey = params._meta?.idempotencyKey;
  if (idempotencyKey !== void 0 && (typeof idempotencyKey != "string" || !idempotencyKey.trim() || idempotencyKey.length > 256))
    throw new TypeError(
      "params._meta.idempotencyKey must be a non-empty string of at most 256 characters."
    );
  return {
    operation,
    input: operation === "edit" ? {
      ...input,
      appName: "PowerPoint",
      artifactUrl: validateArtifactUrl(input.artifactUrl),
      taskDescription
    } : {
      ...input,
      appName: "PowerPoint",
      taskDescription
    },
    idempotencyKey: idempotencyKey?.trim()
  };
}
function presentationTitleFromUrl(artifactUrl) {
  let url = new URL(artifactUrl);
  return decodeURIComponent(url.pathname.split("/").pop() || "") || "PowerPoint presentation";
}
function getSearchParameter(url, name) {
  let normalizedName = name.toLowerCase();
  for (let [key, value] of url.searchParams)
    if (key.toLowerCase() === normalizedName)
      return value;
  return null;
}
function stableArtifactIdentities(value) {
  let url = parseTrustedPowerPointUrl(value), identities = /* @__PURE__ */ new Set();
  for (let key of ["sourcedoc", "uniqueid", "listitemuniqueid"]) {
    let candidate = getSearchParameter(url, key);
    candidate && /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i.test(candidate) && identities.add(
      `sharepoint:${candidate.replace(/[{}]/g, "").toLowerCase()}`
    );
  }
  let driveId = getSearchParameter(url, "driveid"), itemId = getSearchParameter(url, "itemid") ?? getSearchParameter(url, "driveitemid");
  driveId && itemId && identities.add(`drive:${driveId}\0${itemId}`);
  let segments = url.pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  for (let index = 0; index + 3 < segments.length; index += 1)
    segments[index].toLowerCase() === "drives" && segments[index + 2].toLowerCase() === "items" && identities.add(
      `drive:${segments[index + 1]}\0${segments[index + 3]}`
    );
  return identities;
}
function canonicalArtifactUrl(value) {
  let url = parseTrustedPowerPointUrl(value);
  return url.hash = "", url.searchParams.sort(), url.toString();
}
function compareArtifactIdentity(expectedUrl, actualUrl) {
  let expectedIdentities = stableArtifactIdentities(expectedUrl), actualIdentities = stableArtifactIdentities(actualUrl);
  return expectedIdentities.size > 0 && actualIdentities.size > 0 ? [...expectedIdentities].some(
    (identity) => actualIdentities.has(identity)
  ) ? "match" : "mismatch" : canonicalArtifactUrl(expectedUrl) === canonicalArtifactUrl(actualUrl) ? "match" : "unverifiable";
}
function typedPowerPointResource(result, operation) {
  let resourceLinks = (Array.isArray(result?.content) ? result.content : []).filter((item) => item?.type === "resource_link");
  if (resourceLinks.length === 0)
    return {
      error: {
        code: "artifact_resource_missing",
        message: "Office MCP returned no typed PowerPoint resource."
      }
    };
  if (resourceLinks.length !== 1)
    return {
      error: {
        code: "artifact_resource_ambiguous",
        message: `Office MCP returned ${resourceLinks.length} artifact resources; exactly one is required.`
      }
    };
  let resource = resourceLinks[0], artifactUrl;
  try {
    artifactUrl = validateArtifactUrl(resource.uri);
  } catch {
    return {
      error: {
        code: "artifact_resource_invalid",
        message: "Office MCP returned an invalid or untrusted PowerPoint resource URL."
      }
    };
  }
  let mimeType = typeof resource.mimeType == "string" ? resource.mimeType.trim().toLowerCase() : "", name = typeof resource.name == "string" ? resource.name.trim() : "", hasWrongMime = mimeType && mimeType !== PPTX_MIME_TYPE, hasWrongExtension = name && !name.toLowerCase().endsWith(".pptx");
  return hasWrongMime || hasWrongExtension || operation === "create" && (mimeType !== PPTX_MIME_TYPE || !name) ? {
    error: {
      code: "artifact_resource_not_powerpoint",
      message: "Office MCP returned a resource that is not a typed PowerPoint presentation."
    }
  } : {
    presentation: {
      artifactUrl,
      title: name || presentationTitleFromUrl(artifactUrl)
    }
  };
}
function failedOutcome(correlationId, error) {
  return {
    outcome: {
      status: "failed",
      correlationId,
      error
    },
    compatibilityFallback: null
  };
}
function textResult(result) {
  return (Array.isArray(result?.content) ? result.content : []).filter(
    (item) => item?.type === "text" && typeof item.text == "string" && item.text.trim()
  ).map((item) => item.text.trim()).join(`
`);
}
function isExplicitNoArtifactSuccess(result) {
  if (!result || typeof result != "object" || "isError" in result && typeof result.isError != "boolean" || result.isError === !0 || !Array.isArray(result.content) || result.content.some((item) => item?.type === "resource_link") || !textResult(result))
    return !1;
  let outcomeResources = result.content.filter(
    (item) => item?.type === "resource" && item.resource?.uri === OFFICE_RESULT_OUTCOME_URI
  );
  if (outcomeResources.length !== 1)
    return !1;
  let resource = outcomeResources[0].resource;
  if (resource.mimeType !== OFFICE_RESULT_OUTCOME_MIME_TYPE)
    return !1;
  let outcome;
  try {
    outcome = JSON.parse(resource.text);
  } catch {
    return !1;
  }
  return outcome && typeof outcome == "object" && Number.isInteger(outcome.schemaVersion) && outcome.schemaVersion === OFFICE_RESULT_OUTCOME_SCHEMA_VERSION && outcome.outcome === "no_artifact" && Array.isArray(outcome.artifactUrls) && outcome.artifactUrls.length === 0;
}
function normalizePowerPointWorkflowResult(result, correlationId = randomUUID2(), {
  allowNoArtifact = !1,
  operation = "create",
  expectedArtifactUrl = void 0
} = {}) {
  if (result?.isError === !0) {
    let detail = textResult(result).slice(0, MAX_OFFICE_ERROR_DETAIL_CHARS);
    return failedOutcome(correlationId, {
      code: "office_tool_error",
      message: detail ? `Office MCP reported an artifact operation error: ${detail}` : "Office MCP reported an artifact operation error."
    });
  }
  let resource = typedPowerPointResource(result, operation);
  if (resource.presentation) {
    if (operation === "edit") {
      if (!expectedArtifactUrl)
        return failedOutcome(correlationId, {
          code: "artifact_identity_missing",
          message: "The trusted edit target is unavailable for artifact identity validation."
        });
      let identity = compareArtifactIdentity(
        expectedArtifactUrl,
        resource.presentation.artifactUrl
      );
      if (identity !== "match")
        return failedOutcome(correlationId, {
          code: identity === "mismatch" ? "artifact_identity_mismatch" : "artifact_identity_unverifiable",
          message: identity === "mismatch" ? "Office MCP returned a different presentation from the trusted edit target." : "Office MCP returned a presentation whose identity cannot be verified against the trusted edit target."
        });
    }
    return {
      outcome: {
        status: "completed",
        ...resource.presentation,
        correlationId
      },
      compatibilityFallback: null
    };
  }
  if (allowNoArtifact && operation === "edit" && isExplicitNoArtifactSuccess(result)) {
    let response = textResult(result);
    return {
      outcome: {
        status: "completed",
        response,
        noArtifact: !0,
        correlationId
      },
      compatibilityFallback: null
    };
  }
  return failedOutcome(correlationId, resource.error);
}
function hashIdempotencyKey(idempotencyKey) {
  return idempotencyKey ? createHash("sha256").update(idempotencyKey, "utf8").digest("hex") : null;
}
function workflowFailure(correlationId, code, message, status = "failed") {
  return {
    status,
    correlationId,
    error: { code, message }
  };
}

// src/runtime/operation-journal.ts
init_runtime_identity();

// src/runtime/process-lock.ts
init_process_lock();
init_auth_product2();
init_process_lock();
function createDirectoryLock2(directory, resource, options = {}) {
  return createDirectoryLock(directory, resource, { ...options, product: POWERPOINT_AUTH_PRODUCT });
}
function createRuntimeInstance2() {
  return createRuntimeInstance(POWERPOINT_AUTH_PRODUCT);
}
function isRuntimeInstanceAlive2(id) {
  return isRuntimeInstanceAlive(id, POWERPOINT_AUTH_PRODUCT);
}

// src/runtime/operation-journal.ts
var ACTIVE_STATUSES = /* @__PURE__ */ new Set([
  "submitted",
  "task_created",
  "polling",
  "elicitation"
]), TERMINAL_STATUSES = /* @__PURE__ */ new Set([
  "completed",
  "failed",
  "cancelled",
  "interrupted"
]), MAX_EVENT_LOG_BYTES = 5 * 1024 * 1024, MAX_RETAINED_OPERATIONS = 1e3, OPERATION_RETENTION_MS = 10080 * 60 * 1e3;
function sanitizeMessage(value) {
  if (typeof value == "string")
    return value.replace(/https?:\/\/\S+/gi, "[url]").replace(/\b(?:Bearer|Basic)\s+\S+/gi, "[authorization]").slice(0, 500);
}
function isValidOperationRecord(key, operation) {
  return operation && typeof operation == "object" && operation.correlationId === key && ["create", "edit"].includes(operation.operation) && (ACTIVE_STATUSES.has(operation.status) || TERMINAL_STATUSES.has(operation.status)) && Number.isFinite(Date.parse(operation.startedAt)) && Number.isFinite(Date.parse(operation.updatedAt)) && (operation.idempotencyHash === void 0 || /^[a-f0-9]{64}$/.test(operation.idempotencyHash)) && (operation.ownerId === void 0 || typeof operation.ownerId == "string" && operation.ownerId.length > 0);
}
function createOperationJournal({
  directory = join6(runtimeStateDirectory(), "operations"),
  persist = !0,
  now = () => /* @__PURE__ */ new Date(),
  createCorrelationId = randomUUID4,
  instanceId = void 0,
  isOwnerAlive = isRuntimeInstanceAlive2,
  lock = persist ? createDirectoryLock2(directory, "operation journal") : void 0
} = {}) {
  let statePath = join6(directory, "state.json"), eventPath = join6(directory, "events.ndjson"), operations = {}, writeQueue = Promise.resolve(), lastPrunedAt = 0;
  function exclusive(work) {
    let run = () => lock ? lock.run(async () => (operations = await load(), work())) : work(), result = writeQueue.then(run, run);
    return writeQueue = result.catch(() => {
    }), result;
  }
  async function load() {
    let parsed;
    try {
      parsed = JSON.parse(await readFile2(statePath, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return {};
      throw new Error("The PowerPoint operation journal is unreadable or corrupt.", { cause: error });
    }
    if (parsed?.version !== 1 || !parsed.operations || typeof parsed.operations != "object" || Array.isArray(parsed.operations) || !Object.entries(parsed.operations).every(
      ([key, operation]) => isValidOperationRecord(key, operation)
    ))
      throw new Error(
        "The PowerPoint operation journal is unreadable or corrupt.",
        { cause: new TypeError("Invalid operation journal schema.") }
      );
    return parsed.operations;
  }
  async function isOrphaned(operation) {
    return ACTIVE_STATUSES.has(operation.status) ? operation.ownerId ? operation.ownerId === instanceId ? !1 : !await isOwnerAlive(operation.ownerId) : !0 : !1;
  }
  async function persistState() {
    if (!persist)
      return;
    let temporaryPath = `${statePath}.${process.pid}.tmp`;
    await writeFile(
      temporaryPath,
      `${JSON.stringify({ version: 1, operations }, null, 2)}
`,
      { encoding: "utf8", mode: 384 }
    ), await rename(temporaryPath, statePath);
  }
  async function appendEvent(event) {
    if (!persist)
      return;
    let line = `${JSON.stringify(event)}
`;
    try {
      (await stat(eventPath)).size + Buffer.byteLength(line) > MAX_EVENT_LOG_BYTES && (await rm(`${eventPath}.1`, { force: !0 }), await rename(eventPath, `${eventPath}.1`));
    } catch (error) {
      if (error?.code !== "ENOENT")
        throw error;
    }
    await appendFile(
      eventPath,
      line,
      { encoding: "utf8", mode: 384 }
    );
  }
  async function record(correlationId, event, details = {}) {
    return exclusive(async () => {
      let operation = operations[correlationId];
      instanceId && operation?.ownerId && operation.ownerId !== instanceId || await applyEvent(correlationId, event, details);
    });
  }
  async function applyEvent(correlationId, event, details = {}) {
    let operation = operations[correlationId];
    if (!operation || TERMINAL_STATUSES.has(operation.status))
      return;
    let timestamp = now().toISOString();
    event !== "compatibility_fallback" && (operation.status = event), operation.updatedAt = timestamp, typeof details.taskId == "string" && (operation.taskId = details.taskId), typeof details.upstreamRequestId == "string" && (operation.upstreamRequestId = details.upstreamRequestId), typeof details.compatibilityFallback == "string" && (operation.compatibilityFallback = details.compatibilityFallback), details.error && (operation.error = {
      code: String(details.error.code || "workflow_failed"),
      message: sanitizeMessage(details.error.message) || "The PowerPoint workflow failed."
    }), ["completed", "failed", "cancelled", "interrupted"].includes(event) && (operation.completedAt = timestamp, operation.durationMs = Math.max(
      0,
      Date.parse(timestamp) - Date.parse(operation.startedAt)
    )), await persistState(), await appendEvent({
      timestamp,
      event,
      correlationId,
      operation: operation.operation,
      ...operation.taskId ? { taskId: operation.taskId } : {},
      ...details.upstreamRequestId ? { upstreamRequestId: String(details.upstreamRequestId) } : {},
      ...details.pollCount !== void 0 ? { pollCount: Number(details.pollCount) } : {},
      ...details.status ? { officeStatus: String(details.status) } : {},
      ...details.compatibilityFallback ? { compatibilityFallback: String(details.compatibilityFallback) } : {},
      ...details.phase ? { phase: String(details.phase) } : {},
      ...details.serverMethod ? { serverMethod: String(details.serverMethod) } : {},
      ...details.clientRequestId !== void 0 ? { clientRequestId: String(details.clientRequestId) } : {},
      ...details.responseAction ? { responseAction: String(details.responseAction) } : {},
      ...details.responseError ? {
        responseError: {
          code: String(details.responseError.code ?? "unknown"),
          message: sanitizeMessage(details.responseError.message) ?? "Copilot rejected the Office server request."
        }
      } : {},
      ...details.elicitationAttempt !== void 0 ? { elicitationAttempt: Number(details.elicitationAttempt) } : {},
      ...sanitizeMessage(details.elicitationMessage) ? {
        elicitationMessage: sanitizeMessage(details.elicitationMessage)
      } : {},
      ...details.elicitationSchema ? { elicitationSchema: details.elicitationSchema } : {},
      ...details.elicitationContent ? { elicitationContent: details.elicitationContent } : {},
      ...operation.durationMs !== void 0 ? { durationMs: operation.durationMs } : {},
      ...operation.error ? { error: operation.error } : {}
    });
  }
  function pruneOperations() {
    let currentTime = now().getTime(), cutoff = currentTime - OPERATION_RETENTION_MS, active = Object.values(operations).filter((operation) => ACTIVE_STATUSES.has(operation.status)), terminal = Object.values(operations).filter(
      (operation) => !ACTIVE_STATUSES.has(operation.status) && Date.parse(operation.updatedAt) >= cutoff
    ).sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    ).slice(0, Math.max(0, MAX_RETAINED_OPERATIONS - active.length)), retained = [...active, ...terminal];
    operations = Object.fromEntries(
      retained.map((operation) => [
        operation.correlationId,
        operation
      ])
    ), lastPrunedAt = currentTime;
  }
  function maybePruneOperations(force = !1) {
    let operationCount = Object.keys(operations).length;
    (force || operationCount > MAX_RETAINED_OPERATIONS || now().getTime() - lastPrunedAt >= 6e4) && pruneOperations();
  }
  return {
    async initialize() {
      if (persist) {
        await mkdir2(directory, { recursive: !0 });
        try {
          (await stat(eventPath)).size > MAX_EVENT_LOG_BYTES && await rename(eventPath, `${eventPath}.1`).catch(() => {
          });
        } catch {
        }
        await exclusive(async () => {
          !lock && persist && (operations = await load()), maybePruneOperations(!0);
          for (let [correlationId, operation] of Object.entries(operations))
            await isOrphaned(operation) && await applyEvent(correlationId, "interrupted", {
              error: {
                code: "runtime_restarted",
                message: "The local runtime restarted before the operation completed."
              }
            });
        });
      }
    },
    async activeOwnerIds() {
      return exclusive(async () => [...new Set(Object.values(operations).filter((operation) => ACTIVE_STATUSES.has(operation.status) && operation.ownerId).map((operation) => operation.ownerId))]);
    },
    async begin({ operation, idempotencyKey }) {
      return exclusive(async () => {
        maybePruneOperations();
        let idempotencyHash = hashIdempotencyKey(idempotencyKey);
        if (idempotencyHash) {
          let existing = Object.values(operations).find(
            (candidate) => candidate.idempotencyHash === idempotencyHash
          );
          if (existing)
            return { accepted: !1, existing: { ...existing } };
        }
        let correlationId = createCorrelationId(), timestamp = now().toISOString();
        return operations[correlationId] = {
          correlationId,
          operation,
          status: "submitted",
          startedAt: timestamp,
          updatedAt: timestamp,
          ...idempotencyHash ? { idempotencyHash } : {},
          ...instanceId ? { ownerId: instanceId } : {}
        }, maybePruneOperations(), await persistState(), await appendEvent({
          timestamp,
          event: "submitted",
          correlationId,
          operation
        }), { accepted: !0, correlationId };
      });
    },
    record,
    // Removes an operation Office never accepted, so its idempotency key stays free.
    async discard(correlationId, reason) {
      return exclusive(async () => {
        let operation = operations[correlationId];
        operation && (delete operations[correlationId], await persistState(), await appendEvent({
          timestamp: now().toISOString(),
          event: "discarded",
          correlationId,
          operation: operation.operation,
          reason: String(reason)
        }));
      });
    },
    async reopen(correlationId) {
      return exclusive(async () => {
        let operation = operations[correlationId];
        if (!operation || operation.status !== "interrupted" && !await isOrphaned(operation))
          return;
        let timestamp = now().toISOString();
        return operation.status = "polling", operation.updatedAt = timestamp, instanceId ? operation.ownerId = instanceId : delete operation.ownerId, delete operation.completedAt, delete operation.durationMs, delete operation.error, await persistState(), await appendEvent({
          timestamp,
          event: "resumed",
          correlationId,
          operation: operation.operation,
          ...operation.taskId ? { taskId: operation.taskId } : {}
        }), structuredClone(operation);
      });
    },
    async get(correlationId) {
      return exclusive(async () => {
        let operation = operations[correlationId];
        return operation ? structuredClone(operation) : void 0;
      });
    },
    async snapshot() {
      return exclusive(async () => structuredClone(operations));
    }
  };
}

// src/runtime/operation-resume-store.ts
init_powerpoint_url();
init_runtime_identity();
import {
  mkdir as mkdir3,
  open,
  readFile as readFile3,
  rename as rename2,
  rm as rm2
} from "node:fs/promises";
import { dirname as dirname2, join as join7 } from "node:path";

// src/runtime/template-picker-handoff.ts
import { createHash as createHash3, randomUUID as randomUUID5 } from "node:crypto";
var ORG_TEMPLATE_SENTINEL_VALUE = "org-template", TEMPLATE_PICKER_TOOL = "show_template_picker", CONTAINER_TEMPLATE_CHOICES_META_KEY = "com.microsoft.office/powerpoint-template-choices", MAX_INTENT_LENGTH = 64e3, TEMPLATE_VALUE_PREFIX = "tmpl-", TemplatePickerHandoff = class extends Error {
  constructor() {
    super("The container asked which organization template to use; the picker takes over."), this.name = "TemplatePickerHandoff";
  }
};
function templateQuestionKey(params) {
  return createHash3("sha256").update(JSON.stringify({
    mode: params?.mode,
    message: params?.message,
    requestedSchema: params?.requestedSchema,
    templateChoices: params?._meta?.[CONTAINER_TEMPLATE_CHOICES_META_KEY]?.map((choice) => ({
      key: choice?.key,
      id: choice?.id
    }))
  })).digest("hex");
}
function isValidTemplatePickerState(value) {
  return value && typeof value == "object" && typeof value.questionKey == "string" && /^[a-f0-9]{64}$/.test(value.questionKey) && Array.isArray(value.choices) && value.choices.length <= 128 && value.choices.every((choice) => choice && typeof choice.key == "string" && choice.key.length > 0 && typeof choice.value == "string" && choice.value.startsWith(TEMPLATE_VALUE_PREFIX) && choice.value.length <= 16384 && typeof choice.label == "string" && choice.label.length <= 200 && (choice.description === void 0 || typeof choice.description == "string" && choice.description.length <= 200) && (choice.thumbnail === void 0 || containerThumbnail(choice.thumbnail) === choice.thumbnail) && typeof choice.multi == "boolean") && (value.pickerInstanceId === void 0 || typeof value.pickerInstanceId == "string" && /^container:[a-f0-9-]{36}$/.test(value.pickerInstanceId)) && (value.recordedChoice === void 0 || value.pickerInstanceId !== void 0 && typeof value.recordedChoice.skipped == "boolean" && (value.recordedChoice.skipped ? value.recordedChoice.templateId === void 0 : value.choices.some((choice) => choice.value === value.recordedChoice.templateId))) && (value.answerAccepted === void 0 || typeof value.answerAccepted == "boolean") && (value.bindings === void 0 || Array.isArray(value.bindings) && value.bindings.length <= 128 && value.bindings.every((binding) => Array.isArray(binding) && binding.length === 2 && typeof binding[0] == "string" && binding[0].length > 0 && binding[0].length <= 16384 && value.choices.some((choice) => choice.value === binding[1])) && new Set(value.bindings.map((binding) => binding[0])).size === value.bindings.length);
}
function selectedValues(value) {
  return Array.isArray(value) ? value : [value];
}
function isOrgTemplateSelection(answer) {
  let result = answer?.result;
  return result?.action !== "accept" || !result.content || typeof result.content != "object" ? !1 : Object.values(result.content).some((value) => selectedValues(value).includes(ORG_TEMPLATE_SENTINEL_VALUE));
}
function questionOptions(params) {
  let properties = params?.requestedSchema?.properties ?? {};
  return Object.entries(properties).flatMap(([key, property]) => (property?.oneOf ?? property?.items?.anyOf ?? []).filter((option) => typeof option?.const == "string").map((option) => ({ key, value: option.const, multi: property?.type === "array" })));
}
function containerTemplateChoices(params) {
  let metadata = params?._meta?.[CONTAINER_TEMPLATE_CHOICES_META_KEY];
  if (metadata !== void 0 && (!Array.isArray(metadata) || metadata.length > 128))
    throw new Error("Office provided invalid container template choices.");
  let choices = (metadata ?? []).map((choice) => {
    if (typeof choice?.key != "string" || typeof choice.id != "string" || !choice.id.startsWith(TEMPLATE_VALUE_PREFIX) || choice.id.length > 16384 || typeof choice.label != "string" || !Object.hasOwn(params.requestedSchema?.properties ?? {}, choice.key))
      throw new Error("Office provided invalid container template choices.");
    let thumbnail = containerThumbnail(choice.thumbnail);
    return {
      key: choice.key,
      value: choice.id,
      label: templateLabel(choice.label),
      ...typeof choice.description == "string" ? { description: templateLabel(choice.description) } : {},
      ...thumbnail ? { thumbnail } : {},
      multi: params.requestedSchema.properties[choice.key].type === "array"
    };
  });
  return choices.length ? choices : questionOptions(params).filter((option) => option.value.startsWith(TEMPLATE_VALUE_PREFIX)).map((option) => ({ ...option, label: templateLabel(option.value) }));
}
function templateLabel(value) {
  return value.replace(/[\p{Cc}\p{Cf}]/gu, "").slice(0, 200);
}
function containerThumbnail(value) {
  if (typeof value != "string" || value.length > 35e4) return;
  let match = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[0] !== value) return;
  let bytes = Buffer.from(match[2], "base64");
  if (bytes.toString("base64") !== match[2]) return;
  let format = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "png" : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "jpeg" : ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii")) ? "gif" : bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP" ? "webp" : void 0;
  return format ? `data:image/${format};base64,${match[2]}` : void 0;
}
function requireContainerPicker(held, ownerHash) {
  if (!ownerHash || ownerHash !== held.ownerHash || Date.parse(held.expiresAt) <= Date.now())
    throw new Error("The authenticated Office account does not own this template picker operation.");
  if (held.templatePicker?.answerAccepted)
    throw new Error("Office already accepted this operation's template answer.");
  if (!held.templatePicker?.choices.length)
    throw new Error("Office did not provide the original operation's template choices. The task remains paused.");
  return held.templatePicker;
}
function buildContainerTemplateOffer(held, correlationId, args, ownerHash) {
  let state = requireContainerPicker(held, ownerHash), choices = state.choices;
  if (new Set(choices.map((choice) => choice.value)).size !== choices.length)
    throw new Error("Office returned duplicate container template IDs.");
  let page = args?.page ?? 0, totalPages = Math.ceil(choices.length / 8);
  if (!Number.isInteger(page) || page < 0 || page >= totalPages)
    throw new Error("Template gallery page unavailable.");
  if (args?.intent !== void 0 && (typeof args.intent != "string" || args.intent.length > MAX_INTENT_LENGTH))
    throw new Error("The original presentation request is invalid.");
  let tiles = choices.slice(page * 8, (page + 1) * 8).map((choice) => ({
    id: choice.value,
    label: choice.label,
    ...choice.description ? { description: choice.description } : {},
    ...choice.thumbnail ? { thumbnail: choice.thumbnail } : {}
  })), pickerInstanceId = `container:${randomUUID5()}`;
  return {
    templatePicker: {
      ...state,
      pickerInstanceId,
      recordedChoice: void 0,
      bindings: tiles.map((tile) => [tile.id, tile.id])
    },
    result: {
      content: [{ type: "text", text: "Choose one of the original operation's templates. The app owns confirmation and continuation; do not call generate_artifact again." }],
      structuredContent: {
        pickerInstanceId,
        correlationId,
        tiles,
        page,
        totalPages,
        totalTemplates: choices.length,
        ...args?.intent ? { intent: args.intent } : {}
      }
    }
  };
}
function recordContainerTemplateChoice(held, args, ownerHash) {
  let state = requireContainerPicker(held, ownerHash);
  if (!state.pickerInstanceId || args?.pickerInstanceId !== state.pickerInstanceId || args.skipped !== void 0 && typeof args.skipped != "boolean" || (args.skipped === !0 ? args.templateId !== void 0 : !state.bindings?.some(([id]) => id === args.templateId)))
    throw new Error("Invalid or superseded container template choice.");
  let choice = { skipped: args.skipped === !0, ...args.skipped === !0 ? {} : { templateId: args.templateId } };
  if (state.recordedChoice && (state.recordedChoice.skipped !== choice.skipped || state.recordedChoice.templateId !== choice.templateId))
    throw new Error("This template picker choice is already recorded.");
  return {
    templatePicker: { ...state, recordedChoice: choice },
    result: {
      content: [{ type: "text", text: "Template choice recorded for the existing operation." }],
      structuredContent: { pickerInstanceId: state.pickerInstanceId, ...choice }
    }
  };
}
function resolveContainerTemplateId(held, pickedTemplateId) {
  if (held.templatePicker?.pickerInstanceId && held.templatePicker.recordedChoice?.templateId !== pickedTemplateId)
    throw new Error("Confirm an offered template before resuming this operation.");
  let resolved = new Map(held.templatePicker?.bindings).get(pickedTemplateId);
  if (resolved) return resolved;
  if (held.templatePicker?.choices.some((choice) => choice.value === pickedTemplateId)) return pickedTemplateId;
  throw new Error("The confirmed template is not bound to this operation's offered templates. Reopen its picker; the task remains paused.");
}
function isTemplateQuestion(params) {
  return questionOptions(params).some((option) => option.value.startsWith(TEMPLATE_VALUE_PREFIX));
}
function withoutTemplateOptions(params) {
  if (!isTemplateQuestion(params)) return params;
  let isTemplate = (option) => typeof option?.const == "string" && option.const.startsWith(TEMPLATE_VALUE_PREFIX), withoutReplacedTemplates = (options) => options.some(
    (option) => option?.const === ORG_TEMPLATE_SENTINEL_VALUE
  ) ? options.filter((option) => !isTemplate(option)) : options, properties = Object.fromEntries(Object.entries(params.requestedSchema.properties ?? {}).map(
    ([key, property]) => [key, {
      ...property,
      ...property?.oneOf ? { oneOf: withoutReplacedTemplates(property.oneOf) } : {},
      ...property?.items?.anyOf ? { items: { ...property.items, anyOf: withoutReplacedTemplates(property.items.anyOf) } } : {}
    }]
  ));
  return { ...params, requestedSchema: { ...params.requestedSchema, properties } };
}
function templateAnswerContent(params, templateId) {
  let bare = (value) => value.startsWith(TEMPLATE_VALUE_PREFIX) ? value.slice(TEMPLATE_VALUE_PREFIX.length) : value, match = [...questionOptions(params), ...containerTemplateChoices(params)].find((option) => bare(option.value) === bare(templateId));
  return match ? { [match.key]: match.multi ? [match.value] : match.value } : void 0;
}
function orgSelectionContent(params) {
  let match = questionOptions(params).find((option) => option.value === ORG_TEMPLATE_SENTINEL_VALUE);
  return match ? { [match.key]: match.multi ? [match.value] : match.value } : void 0;
}
function nonOrgSelectionContent(params) {
  let options = questionOptions(params), org = options.find((option) => option.value === ORG_TEMPLATE_SENTINEL_VALUE), match = org && options.find((option) => option.key === org.key && option.value !== ORG_TEMPLATE_SENTINEL_VALUE && !option.value.startsWith(TEMPLATE_VALUE_PREFIX));
  return match ? { [match.key]: match.multi ? [match.value] : match.value } : void 0;
}
function templatePickerIntent(generateInput) {
  let intent = generateInput?.taskDescription;
  return typeof intent == "string" && intent.length > 0 && intent.length <= MAX_INTENT_LENGTH ? intent : void 0;
}
function buildTemplatePickerHandoffResult(generateInput, correlationId) {
  let intent = templatePickerIntent(generateInput), argumentsHint = { correlationId, ...intent ? { intent } : {} };
  return {
    content: [{ type: "text", text: [
      "The user chose to use one of their organization's templates. Generation is paused until a template is picked and nothing was created yet.",
      `Call the ${TEMPLATE_PICKER_TOOL} tool now with correlationId ${JSON.stringify(correlationId)}${intent ? " and `intent` set to the complete original request below" : ", passing the complete original request, including its full Markdown outline, as `intent`"}. Do not ask the user anything first.`,
      "The picker resumes this existing operation after confirmation. Do not call generate_artifact again; no new generation task is needed.",
      ...intent ? ["", "intent:", intent] : []
    ].join(`
`) }],
    structuredContent: {
      templatePickerHandoff: {
        nextTool: TEMPLATE_PICKER_TOOL,
        arguments: argumentsHint
      }
    }
  };
}

// src/runtime/operation-resume-store.ts
var STORE_VERSION = 1;
function isNonEmptyString(value) {
  return typeof value == "string" && value.length > 0;
}
function isTrustedStoredUrl(value) {
  try {
    return parseTrustedPowerPointUrl(value), !0;
  } catch {
    return !1;
  }
}
function isValidEntry(key, entry) {
  return entry && typeof entry == "object" && entry.correlationId === key && ["create", "edit"].includes(entry.operation) && isNonEmptyString(entry.taskId) && isNonEmptyString(entry.ownerHash) && isNonEmptyString(entry.createdAt) && isNonEmptyString(entry.expiresAt) && Number.isFinite(Date.parse(entry.createdAt)) && Number.isFinite(Date.parse(entry.expiresAt)) && (entry.templatePicker === void 0 || isValidTemplatePickerState(entry.templatePicker)) && (entry.sessionId === void 0 || isNonEmptyString(entry.sessionId)) && (entry.expectedArtifactUrl === void 0 || entry.operation === "edit" && isTrustedStoredUrl(entry.expectedArtifactUrl)) && (entry.result === void 0 || entry.status === "completed" && entry.result && typeof entry.result == "object");
}
function createOperationResumeStore({
  path = join7(runtimeStateDirectory(), "operations", "resume.json"),
  persist = !0,
  now = () => /* @__PURE__ */ new Date(),
  lock = persist ? createDirectoryLock2(dirname2(path), "operation recovery") : void 0
} = {}) {
  let entries = {}, writeQueue = Promise.resolve();
  function enqueue(work) {
    let run = () => lock ? lock.run(async () => (entries = await load(), work())) : work(), result = writeQueue.then(run, run);
    return writeQueue = result.catch(() => {
    }), result;
  }
  async function load() {
    let parsed;
    try {
      parsed = JSON.parse(await readFile3(path, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return {};
      throw new Error(
        "The PowerPoint operation resume store is unreadable or corrupt.",
        { cause: error }
      );
    }
    if (parsed?.version !== STORE_VERSION || !parsed.entries || typeof parsed.entries != "object" || Array.isArray(parsed.entries))
      throw new Error(
        "The PowerPoint operation resume store is unreadable or corrupt.",
        { cause: new TypeError("Invalid operation resume store schema.") }
      );
    return Object.fromEntries(
      Object.entries(parsed.entries).filter(([key, entry]) => {
        try {
          return isValidEntry(key, entry);
        } catch {
          return !1;
        }
      })
    );
  }
  function pruneExpired() {
    let currentTime = now().getTime(), previousCount = Object.keys(entries).length;
    return entries = Object.fromEntries(
      Object.entries(entries).filter(
        ([, entry]) => Date.parse(entry.expiresAt) > currentTime
      )
    ), Object.keys(entries).length !== previousCount;
  }
  async function persistState() {
    if (!persist)
      return;
    await mkdir3(dirname2(path), { recursive: !0 });
    let temporaryPath = `${path}.${process.pid}.tmp`, handle = await open(temporaryPath, "w", 384);
    try {
      await handle.writeFile(
        `${JSON.stringify({ version: STORE_VERSION, entries }, null, 2)}
`,
        "utf8"
      ), await handle.sync();
    } finally {
      await handle.close();
    }
    await rename2(temporaryPath, path);
  }
  return {
    async initialize() {
      persist && await enqueue(async () => {
        pruneExpired() && await persistState();
      });
    },
    async get(correlationId) {
      return enqueue(async () => {
        pruneExpired() && await persistState();
        let entry = entries[correlationId];
        return entry ? structuredClone(entry) : void 0;
      });
    },
    async put(entry) {
      return enqueue(async () => {
        if (!isValidEntry(entry.correlationId, entry))
          throw new TypeError("Invalid resumable PowerPoint operation.");
        return entries[entry.correlationId] = structuredClone(entry), pruneExpired(), await persistState(), structuredClone(entries[entry.correlationId]);
      });
    },
    async update(correlationId, changes) {
      return enqueue(async () => {
        pruneExpired() && await persistState();
        let current = entries[correlationId];
        if (!current)
          return;
        let updated = {
          ...current,
          ...structuredClone(typeof changes == "function" ? changes(structuredClone(current)) : changes),
          correlationId
        };
        if (!isValidEntry(correlationId, updated))
          throw new TypeError("Invalid resumable PowerPoint operation update.");
        return entries[correlationId] = updated, pruneExpired(), await persistState(), structuredClone(entries[correlationId]);
      });
    },
    async remove(correlationId) {
      return enqueue(async () => {
        if (delete entries[correlationId], Object.keys(entries).length === 0) {
          persist && await rm2(path, { force: !0 });
          return;
        }
        await persistState();
      });
    },
    async snapshot() {
      return enqueue(async () => (pruneExpired() && await persistState(), structuredClone(entries)));
    }
  };
}

// src/runtime/task-progress.ts
var GENERIC_OFFICE_STATUS = /* @__PURE__ */ new Set([
  "the operation is now in progress.",
  "processing elicitation response",
  "waiting for elicitation response"
]), WORDING = {
  create: {
    start: "Starting your presentation",
    resume: "Resuming your presentation",
    working: "Creating your presentation",
    continuing: "Applying your answer",
    finishing: "Finishing your presentation"
  },
  edit: {
    start: "Starting your edit",
    resume: "Resuming your edit",
    working: "Editing your presentation",
    continuing: "Applying your answer",
    finishing: "Finishing your edit"
  }
};
function progressPhaseForStatus(status) {
  return status === "working" ? "working" : status === "input_required" ? "input_required" : "finishing";
}
function specificOfficeStatus(statusMessage) {
  if (typeof statusMessage != "string") return;
  let text = statusMessage.trim();
  return text && !GENERIC_OFFICE_STATUS.has(text.toLowerCase()) ? text : void 0;
}
function hasInitialStatusToAnnounce(status, statusMessage) {
  return !!statusMessage && (status !== "working" || specificOfficeStatus(statusMessage) !== void 0);
}
function powerPointProgressMessage({
  operation,
  phase,
  officeStatusMessage
}) {
  let officeStatus = specificOfficeStatus(officeStatusMessage);
  return phase === "input_required" ? officeStatus ? `Waiting for your answer: ${officeStatus}` : "Waiting for your answer" : phase === "start" || phase === "resume" || phase === "continuing" ? WORDING[operation][phase] : officeStatus ?? WORDING[operation][phase];
}

// src/runtime/answered-choices.ts
function shorten(text) {
  let value = text.trim().replace(/\s+/g, " ");
  return value.length > 120 ? `${value.slice(0, 119)}\u2026` : value;
}
function optionTitle(schema, value) {
  let options = schema?.oneOf || schema?.anyOf || schema?.items?.oneOf || schema?.items?.anyOf, option = Array.isArray(options) ? options.find((candidate) => candidate?.const === value) : void 0;
  if (option) return String(option.title ?? option.const);
  let values = schema?.enum || schema?.items?.enum, names = schema?.enumNames || schema?.items?.enumNames, index = Array.isArray(values) ? values.indexOf(value) : -1;
  return index >= 0 && Array.isArray(names) && names[index] !== void 0 ? String(names[index]) : String(value);
}
function describeAnswer(params, result) {
  let properties = params?.requestedSchema?.properties;
  if (result?.action !== "accept" || !properties || typeof properties != "object") return [];
  let content = result.content && typeof result.content == "object" ? result.content : {}, keys = Object.keys(properties), choices = [];
  for (let key of keys) {
    let property = properties[key] ?? {}, value = content[key], answered = value != null && value !== "" && !(Array.isArray(value) && value.length === 0), label = key === "template" ? typeof value == "string" && /^tmpl-/i.test(value) ? "Template" : "Style" : typeof property.title == "string" && property.title.trim() ? property.title : keys.length === 1 && typeof params.message == "string" ? params.message : key;
    if (!answered) {
      key === "template" && choices.push({ label, answer: "Left to PowerPoint" });
      continue;
    }
    let answer = Array.isArray(value) ? value.map((item) => optionTitle(property, item)).join(", ") : typeof value == "boolean" ? value ? "Yes" : "No" : optionTitle(property, value);
    choices.push({ label: shorten(label), answer: shorten(answer) });
  }
  return choices;
}
function formatAnsweredChoices(choices) {
  return choices.map((choice) => `${choice.label}: ${choice.answer}`).join("; ");
}

// src/runtime/office-task-proxy.ts
init_runtime_identity();

// src/runtime/upload-contract.ts
init_powerpoint_url();
var PRESENTATION_UPLOAD_PATH = "/uploads/presentation", UPLOAD_FILE_NAME_HEADER = "x-powerpoint-file-name", UPLOAD_LIMIT_HEADER = "x-powerpoint-upload-max-bytes", UPLOAD_TOTAL_BYTES_HEADER = "x-powerpoint-upload-total-bytes", PPTX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation", MAX_UPLOAD_BYTES = 12 * 1024 * 1024, UPLOAD_TIMEOUT_MS = 1200 * 1e3, UPLOAD_TOOL = "upload_artifact", UPLOAD_FLIGHT = "OfficeAgent.useMCPExperiment7:true", PPTX_ZIP_SIGNATURE = Buffer.from([80, 75, 3, 4]);
function validateUploadFileName(fileName) {
  if (typeof fileName != "string" || !fileName.trim() || fileName.length > 255 || !/\.pptx$/i.test(fileName) || /[\\/:*?"<>|\x00-\x1f\x7f]/.test(fileName))
    throw new TypeError("A valid .pptx file name without directory components is required.");
  return fileName;
}
function parseUploadedPresentation(value) {
  if (typeof value?.name != "string" || !value.name.trim() || typeof value?.webUrl != "string")
    throw new Error("The upload did not return a presentation name and webUrl.");
  return {
    name: validateUploadFileName(value.name.trim()),
    webUrl: parseTrustedPowerPointUrl(value.webUrl).toString()
  };
}

// src/runtime/presentation-upload.ts
init_auth_contract2();
import { randomUUID as randomUUID6 } from "node:crypto";
import { mkdtemp, open as open2, readFile as readFile4, rm as rm3 } from "node:fs/promises";
import { tmpdir as tmpdir2 } from "node:os";
import { join as join8 } from "node:path";
var OVERSIZE_REPORT_TIMEOUT_MS = 1e4, RPC_REQUEST_REJECTION_CODES = /* @__PURE__ */ new Set([-32700, -32600, -32601, -32602]), UploadNotSentError = class extends Error {
  constructor(message, options) {
    super(message, options), this.name = "UploadNotSentError";
  }
}, UploadRpcError = class extends Error {
  code;
  constructor(message, code) {
    super(message), this.name = "UploadRpcError", this.code = code;
  }
}, UploadError = class extends Error {
  statusCode;
  constructor(statusCode, message) {
    super(message), this.statusCode = statusCode;
  }
};
function tooLarge(maxBytes) {
  return new UploadError(
    413,
    `The presentation must be a .pptx file no larger than ${Math.floor(maxBytes / 1024 / 1024)} MB (${maxBytes} bytes).`
  );
}
function abortable(work, signal) {
  return new Promise((resolve, reject) => {
    let abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: !0 }), signal.aborted && abort(), work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
function isRecord(value) {
  return typeof value == "object" && value !== null && !Array.isArray(value);
}
function resultText(result) {
  for (let item of Array.isArray(result.content) ? result.content : [])
    if (isRecord(item) && item.type === "text" && typeof item.text == "string" && item.text.trim())
      return item.text.trim();
}
function uploadedPresentation(result, unconfirmed, reference) {
  if (!isRecord(result)) throw new UploadError(502, unconfirmed);
  if (result.isError === !0) {
    let text = resultText(result), generic = !text || /^internal error\.?$/i.test(text) || /^\[[A-Za-z]+\]\s+Error in execution\.?$/i.test(text);
    throw new UploadError(502, generic ? unconfirmed : `${text} ${reference}`);
  }
  for (let item of Array.isArray(result.content) ? result.content : [])
    if (!(!isRecord(item) || item.type !== "resource_link" || typeof item.uri != "string" || typeof item.name != "string" || !item.name.trim()))
      try {
        return parseUploadedPresentation({ name: item.name, webUrl: item.uri });
      } catch {
        throw new UploadError(
          502,
          `Office saved the presentation but returned a link that cannot be opened safely. Check your OneDrive before retrying; the upload was not replayed. ${reference}`
        );
      }
  throw new UploadError(502, unconfirmed);
}
function targetName(name) {
  let suffix = `-${(/* @__PURE__ */ new Date()).toISOString().replace(/[-:.]/g, "")}-${randomUUID6()}.pptx`, stem = "";
  for (let character of name.slice(0, -5)) {
    if (stem.length + character.length > 247 - suffix.length) break;
    stem += character;
  }
  return `Copilot-${stem}${suffix}`;
}
async function spoolPresentation(request, path, maxBytes) {
  let file = await open2(path, "wx", 384), size = 0, signature = Buffer.alloc(0);
  try {
    for await (let chunk of request.iterator({ destroyOnReturn: !1 })) {
      if (size += chunk.length, size > maxBytes) throw tooLarge(maxBytes);
      if (signature.length < PPTX_ZIP_SIGNATURE.length && (signature = Buffer.concat([signature, chunk.subarray(0, PPTX_ZIP_SIGNATURE.length - signature.length)]), signature.length === PPTX_ZIP_SIGNATURE.length && !signature.equals(PPTX_ZIP_SIGNATURE)))
        throw new UploadError(400, "Only ZIP-based, unencrypted .pptx files can be uploaded.");
      await file.writeFile(chunk);
    }
    if (!signature.equals(PPTX_ZIP_SIGNATURE))
      throw new UploadError(400, "The presentation is empty or is not a ZIP-based .pptx file.");
  } finally {
    await file.close();
  }
}
function createPresentationUploader({
  callUploadTool,
  maxBytes = MAX_UPLOAD_BYTES,
  maxConcurrent = 4,
  temporaryDirectory = tmpdir2(),
  beginAccountUse
}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 4 || maxBytes > MAX_UPLOAD_BYTES || !Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1)
    throw new Error("Invalid PowerPoint upload limits.");
  let active = 0, activeReports = 0, reportShutdown = new AbortController(), reportOversize = (name, totalBytes) => {
    activeReports++, (async () => {
      let signal = AbortSignal.any([reportShutdown.signal, AbortSignal.timeout(OVERSIZE_REPORT_TIMEOUT_MS)]), accountUse = await beginAccountUse?.();
      try {
        signal.throwIfAborted(), await abortable(callUploadTool(
          { artifact: { fileName: targetName(name), totalBytes } },
          { requestId: randomUUID6(), signal }
        ), signal);
      } finally {
        await accountUse?.release();
      }
    })().catch(() => {
      console.error("[powerpoint-copilot] Could not report the oversized presentation to Office.");
    }).finally(() => {
      activeReports--;
    });
  };
  async function upload(path, name, signal) {
    let content = await readFile4(path), fileName = targetName(name), requestId = randomUUID6(), reference = `(Upload reference: ${requestId})`, unconfirmed = `The upload of '${fileName}' could not be confirmed. Check your OneDrive before retrying; the upload was not replayed. ${reference}`, result;
    try {
      result = await abortable(callUploadTool({
        artifact: { fileName, contentBase64: content.toString("base64") }
      }, { requestId, signal }), signal);
    } catch (error) {
      throw error instanceof AuthError ? error : error instanceof UploadNotSentError ? new UploadError(502, `Office could not start the upload, so nothing was uploaded. ${error.message}`) : error instanceof UploadRpcError && error.code !== void 0 && RPC_REQUEST_REJECTION_CODES.has(error.code) ? new UploadError(502, `Office rejected the upload request: ${error.message} ${reference}`) : new UploadError(502, unconfirmed);
    }
    return uploadedPresentation(result, unconfirmed, reference);
  }
  return {
    maxBytes,
    hasActiveReports: () => activeReports > 0,
    abortReports: () => reportShutdown.abort(),
    async handleRequest(request, response, url) {
      if (url.pathname !== PRESENTATION_UPLOAD_PATH) return !1;
      if (request.method !== "POST")
        return response.writeHead(405, { allow: "POST" }), response.end(), !0;
      let admitted = !1, accountUse, controller = new AbortController(), abort = () => {
        response.writableFinished || controller.abort();
      };
      response.once("close", abort);
      try {
        let name;
        try {
          let encoded = request.headers[UPLOAD_FILE_NAME_HEADER];
          name = validateUploadFileName(typeof encoded == "string" ? decodeURIComponent(encoded) : void 0);
        } catch (error) {
          throw new UploadError(400, error instanceof Error ? error.message : String(error));
        }
        let reported = request.headers[UPLOAD_TOTAL_BYTES_HEADER];
        if (reported !== void 0)
          throw typeof reported != "string" || !/^\d+$/.test(reported) || !Number.isSafeInteger(Number(reported)) || Number(reported) <= maxBytes ? new UploadError(400, "Only a presentation over the upload limit can be reported by size.") : (reportOversize(name, Number(reported)), tooLarge(maxBytes));
        if (request.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== PPTX_CONTENT_TYPE)
          throw new UploadError(415, "The upload must contain raw PPTX bytes, not JSON or a local path.");
        let declared = request.headers["content-length"];
        if (declared !== void 0 && !/^\d+$/.test(declared))
          throw new UploadError(400, "Invalid upload length.");
        if (declared !== void 0 && Number(declared) > maxBytes)
          throw reportOversize(name, Number(declared)), tooLarge(maxBytes);
        if (active >= maxConcurrent) throw new UploadError(503, "The PowerPoint runtime is at its upload capacity.");
        active++, admitted = !0, accountUse = await beginAccountUse?.();
        let directory = await mkdtemp(join8(temporaryDirectory, "powerpoint-upload-")), result;
        try {
          let path = join8(directory, "input.pptx");
          await spoolPresentation(request, path, maxBytes);
          let signal = AbortSignal.any([controller.signal, AbortSignal.timeout(UPLOAD_TIMEOUT_MS)]);
          signal.throwIfAborted(), result = await upload(path, name, signal);
        } finally {
          await rm3(directory, { recursive: !0, force: !0 });
        }
        response.destroyed || (response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }), response.end(JSON.stringify(result)));
      } catch (error) {
        !response.destroyed && !response.writableEnded && (response.writeHead(error instanceof AuthError ? authHttpStatus(error) : error instanceof UploadError ? error.statusCode : 502, {
          "content-type": "application/json",
          "cache-control": "no-store",
          connection: "close"
        }), response.end(JSON.stringify(error instanceof AuthError ? authErrorBody(error) : {
          error: error instanceof Error ? error.message : String(error)
        })));
      } finally {
        response.off("close", abort), admitted && active--, await accountUse?.release();
      }
      return !0;
    }
  };
}

// src/runtime/office-task-proxy.ts
init_auth_contract2();

// src/runtime/auth-control.ts
init_auth_contract2();
init_local_http();
function write(response, status, value) {
  response.destroyed || response.writableEnded || (response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }), response.end(JSON.stringify(value)));
}
async function handleAuthControl({
  request,
  response,
  url,
  auth,
  busy,
  invalidateViewers
}) {
  if (!url.pathname.startsWith(AUTH_CONTROL_PREFIX)) return !1;
  if (!auth)
    return write(response, 404, { error: "This profile manages authentication outside the interactive plugin." }), !0;
  if (url.pathname === "/auth/status" && request.method === "GET")
    return write(response, 200, auth.status()), !0;
  if (!["/auth/connect", "/auth/switch", "/auth/disconnect"].includes(url.pathname) || request.method !== "POST")
    return write(response, 405, { error: "Unsupported PowerPoint account action." }), !0;
  if (!requireJsonRequest(request, response)) return !0;
  let controller = new AbortController(), closed = () => {
    response.writableFinished || controller.abort();
  };
  response.once("close", closed);
  try {
    let chunks = [], size = 0;
    for await (let chunk of request.iterator({ destroyOnReturn: !1 })) {
      if (size += chunk.length, size > 16384) throw new AuthError("invalid_request", "Account action is too large.");
      chunks.push(chunk);
    }
    let input = size ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}, allowed = url.pathname === "/auth/disconnect" ? [] : ["tenantId", "username"];
    if (!input || typeof input != "object" || Array.isArray(input) || Object.keys(input).some((key) => !allowed.includes(key)))
      throw new AuthError("invalid_request", "Unsupported account-action parameters.");
    if (input.tenantId !== void 0 && typeof input.tenantId != "string")
      throw new AuthError("invalid_request", "Tenant ID must be a string.");
    if (input.username !== void 0 && typeof input.username != "string")
      throw new AuthError("invalid_request", "The account username must be a string.");
    if (busy()) throw new AuthError("auth_busy", "Finish or cancel active PowerPoint requests before changing authentication.");
    let previous = auth.status().account, result = url.pathname === "/auth/disconnect" ? await auth.disconnect(controller.signal) : await auth.connect({ switchAccount: url.pathname === "/auth/switch", tenantId: input.tenantId, username: input.username }, controller.signal);
    (!previous || !result.account || !sameAccount(previous, result.account)) && invalidateViewers(), write(response, 200, result);
  } catch (error) {
    url.pathname === "/auth/disconnect" && auth.status().state === "disconnected" && invalidateViewers(), error instanceof AuthError ? write(response, authHttpStatus(error), authErrorBody(error)) : write(response, 400, { error: error instanceof Error ? error.message : String(error) });
  } finally {
    response.off("close", closed);
  }
  return !0;
}

// src/runtime/office-task-proxy.ts
var DEFAULT_HOST = "127.0.0.1", DEFAULT_PORT = 0, DEFAULT_UPSTREAM_URL = "https://dogfood.augloop.svc.cloud.microsoft/mcp/office-agent-mcp", ALLOWED_UPSTREAM_URLS = /* @__PURE__ */ new Set([DEFAULT_UPSTREAM_URL]), MCP_PROTOCOL_VERSION = "2025-11-25", OFFICE_CLIENT_METADATA = JSON.stringify({ appName: "ghcp", appPlatform: "Client" }), MAX_REQUEST_BYTES = 1024 * 1024, OAUTH_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource/mcp", RECOVERY_MCP_PATH = "/mcp/recovery", RECOVERY_OAUTH_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource/mcp/recovery", UI_MCP_PATH = "/mcp/ui", OFFICE_MCP_PATH = "/mcp", LEGACY_RECOVERY_MCP_PATH = "/recovery-mcp", LEGACY_RECOVERY_OAUTH_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource/recovery-mcp", LEGACY_UI_MCP_PATH = "/ui-mcp", TASK_TTL_MS = 3600 * 1e3, TASK_TIMEOUT_MS = 1800 * 1e3, DEFAULT_TASK_POLL_MS = 5e3, MIN_TASK_POLL_MS = 2e3, MAX_TASK_POLL_MS = 15e3, DEFAULT_IDLE_TIMEOUT_MS = 900 * 1e3, DEFAULT_TASK_AUTH_BUFFER_MS = 120 * 1e3, MAX_ACTIVE_MANAGED_TASKS = 4, MAX_PENDING_SERVER_REQUESTS = 8, DEFAULT_ELICITATION_WAIT_MS = 600 * 1e3, MAX_ANSWER_REPLAYS = 3, DEFAULT_SSE_KEEPALIVE_MS = 15e3, POWERPOINT_TASK_TOOLS = /* @__PURE__ */ new Set([
  "generate_artifact",
  "edit_artifact"
]), CONVERSATION_HANDOFF_TIMEOUT_MS = 5e3;
function withTimeout(promise, timeoutMs) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs} ms.`)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}
var RESUME_POWERPOINT_TOOL = "resume_powerpoint_operation", OFFICE_OMNI_DISABLE_FLIGHT = "Microsoft.Office.Augloop.OfficeAgent.EnableOmniAgentViaMcpWorkflow:false", ORG_TEMPLATE_PICKER_FLIGHT = "Microsoft.Office.Augloop.OfficeAgent.EnablePptAgentOrgTemplatePicker:true", FLIGHT_SEPARATOR = ";", PLUGIN_DEFAULT_FLIGHTS = [OFFICE_OMNI_DISABLE_FLIGHT, ORG_TEMPLATE_PICKER_FLIGHT].join(FLIGHT_SEPARATOR), POWERPOINT_CARD_URI = "ui://powerpoint/result-card", POWERPOINT_CARD_DATA_TOOL = "powerpoint_card_data", POWERPOINT_CARD_TOOL = "show_presentation_card", runtimeDirectory = dirname3(fileURLToPath2(import.meta.url)), adjacentCardPath = join9(runtimeDirectory, "viewer", "result-card.html"), POWERPOINT_CARD_PATH = existsSync2(adjacentCardPath) ? adjacentCardPath : join9(runtimeDirectory, "..", "viewer", "result-card.html"), HOP_BY_HOP_HEADERS = /* @__PURE__ */ new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]), DECODED_BODY_HEADERS = /* @__PURE__ */ new Set([
  "content-encoding",
  "content-length",
  "content-range"
]);
function augmentInitializeRequest(body) {
  try {
    let message = JSON.parse(body.toString("utf8"));
    return message?.method !== "initialize" || typeof message.params != "object" || message.params === null ? body : (message.params.protocolVersion = MCP_PROTOCOL_VERSION, message.params.capabilities = {
      ...message.params.capabilities,
      tasks: { list: {}, cancel: {} }
    }, Buffer.from(JSON.stringify(message)));
  } catch {
    return body;
  }
}
function addConversationMetadata(message, handoff) {
  return message?.method !== "tools/call" || !POWERPOINT_TASK_TOOLS.has(message.params?.name) || typeof message.params != "object" || message.params === null || typeof handoff?.conversationId != "string" || !handoff.conversationId || !Array.isArray(handoff.conversation) || (message.params._meta = {
    ...message.params._meta,
    conversationId: handoff.conversationId,
    conversation: handoff.conversation,
    conversationSchemaVersion: handoff.conversationSchemaVersion
  }), message;
}
function augmentPowerPointToolCallRequest(body, transformToolCallMeta = void 0) {
  try {
    let parsed = JSON.parse(body.toString("utf8")), messages = Array.isArray(parsed) ? parsed : [parsed], changed = !1;
    for (let message of messages)
      message?.method !== "tools/call" || !POWERPOINT_TASK_TOOLS.has(message.params?.name) || typeof message.params != "object" || message.params === null || (message.params._meta?.flights === void 0 && (message.params._meta = {
        ...message.params._meta,
        flights: PLUGIN_DEFAULT_FLIGHTS
      }, changed = !0), transformToolCallMeta && (message.params._meta = transformToolCallMeta(message.params._meta), changed = !0));
    return changed ? Buffer.from(JSON.stringify(parsed)) : body;
  } catch {
    return body;
  }
}
function transformRpcResponseMessage(requestMessage, responseMessage) {
  return !responseMessage?.result || responseMessage.id !== requestMessage?.id, responseMessage;
}
function transformRpcResponseBody(requestBody, responseBody, onResponseMessage) {
  let requestMessage;
  try {
    requestMessage = JSON.parse(requestBody.toString("utf8"));
  } catch {
    return responseBody;
  }
  if (Array.isArray(requestMessage))
    return responseBody;
  let text = responseBody.toString("utf8"), parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
  }
  if (parsed !== void 0)
    return onResponseMessage?.(requestMessage, parsed), Buffer.from(JSON.stringify(
      transformRpcResponseMessage(requestMessage, parsed)
    ));
  {
    let changed = !1, transformed = text.replace(
      /^data:\s*(\{.*\})\s*$/gm,
      (line, payload) => {
        let parsed2;
        try {
          parsed2 = JSON.parse(payload);
        } catch {
          return line;
        }
        onResponseMessage?.(requestMessage, parsed2);
        let next = transformRpcResponseMessage(requestMessage, parsed2);
        return changed ||= next !== parsed2, `data: ${JSON.stringify(next)}`;
      }
    );
    return changed ? Buffer.from(transformed) : responseBody;
  }
}
function presentationTitleFromUrl2(artifactUrl) {
  let url = new URL(artifactUrl);
  return decodeURIComponent(url.pathname.split("/").pop() || "") || "PowerPoint presentation";
}
var UNSAFE_SOURCE_TEXT = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g;
function sourceLink(value) {
  if (!(typeof value != "string" || value !== value.trim() || new RegExp(UNSAFE_SOURCE_TEXT.source).test(value)))
    try {
      let url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password ? url.href : void 0;
    } catch {
      return;
    }
}
function sourceLabel(value) {
  return value.replace(UNSAFE_SOURCE_TEXT, " ").replace(/[\\`*_{}()<>!#|~&]/g, "\\$&").replace(/\[/g, "&#91;").replace(/\]/g, "&#93;");
}
function presentationSourcesBlock(content) {
  let lines = [], seen = /* @__PURE__ */ new Set();
  for (let item of content) {
    if (item?.type !== "text" || typeof item.text != "string" || !item.text.trimStart().startsWith("{")) continue;
    let parsed;
    try {
      parsed = JSON.parse(item.text);
    } catch {
      continue;
    }
    if (Array.isArray(parsed?.results))
      for (let source of parsed.results) {
        let link = sourceLink(source?.url);
        if (!link || seen.has(link)) continue;
        seen.add(link);
        let title = typeof source.title == "string" && source.title.trim() ? source.title.trim() : link;
        lines.push(`- [${sourceLabel(title)}](<${link.replace(/&/g, "&amp;")}>)`);
      }
  }
  return lines.length ? ["Sources:", "", ...lines].join(`
`) : void 0;
}
function withPresentationSources(content) {
  if (!Array.isArray(content)) return content;
  let sources = presentationSourcesBlock(content);
  return sources ? [
    ...content,
    { type: "text", text: sources },
    { type: "text", text: "End your reply with the Sources block above, copied exactly." }
  ] : content;
}
function decoratePowerPointResult(result, correlationId = randomUUID7(), options = {}) {
  let normalized = normalizePowerPointWorkflowResult(
    result,
    correlationId,
    options
  );
  return normalized.outcome.status !== "completed" ? {
    result,
    workflow: normalized.outcome,
    compatibilityFallback: normalized.compatibilityFallback
  } : {
    result: {
      ...result,
      ...Array.isArray(result?.content) ? { content: withPresentationSources(result.content) } : {},
      structuredContent: {
        ...result?.structuredContent && typeof result.structuredContent == "object" ? result.structuredContent : {},
        powerpointWorkflow: normalized.outcome
      }
    },
    workflow: normalized.outcome,
    compatibilityFallback: normalized.compatibilityFallback
  };
}
function hasRuntimeCapability(request, capability) {
  return hasLocalCapability(request, capability, RUNTIME_CAPABILITY_HEADER);
}
function managedRequestKey(requestId, sessionId, endpoint) {
  return `${endpoint}:${typeof sessionId == "string" ? sessionId : ""}:${String(requestId)}`;
}
function pendingServerRequestKey(requestId, sessionId, endpoint) {
  return `${endpoint}:${typeof sessionId == "string" ? sessionId : ""}:${String(requestId)}`;
}
function matchesPendingClientResponse(candidate, message, sessionId, endpoint) {
  return candidate.requestId === String(message.id) && candidate.clientSessionId === sessionId && candidate.managedTask?.endpoint === endpoint;
}
function deferred() {
  let resolve, reject;
  return { promise: new Promise((onResolve, onReject) => {
    resolve = onResolve, reject = onReject;
  }), resolve, reject };
}
function sameQuestion(left, right) {
  let shape = (value) => JSON.stringify({
    mode: value?.mode,
    message: value?.message,
    requestedSchema: value?.requestedSchema
  });
  return shape(left) === shape(right);
}
function rejectPendingResponse(pendingServerRequests, key, pending, error) {
  pendingServerRequests.get(key) === pending && pendingServerRequests.delete(key), pending.reject(error);
}
function forwardedRequestHeaders(headers, bodyLength, upstreamHeaders = {}) {
  let forwarded = new Headers();
  for (let [name, value] of Object.entries(headers))
    if (!(value === void 0 || HOP_BY_HOP_HEADERS.has(name.toLowerCase()) || [RUNTIME_CAPABILITY_HEADER, AUTH_GENERATION_HEADER, AUTH_GENERATION_GUARD_HEADER].includes(name.toLowerCase())))
      if (Array.isArray(value))
        for (let item of value)
          forwarded.append(name, item);
      else
        forwarded.set(name, value);
  forwarded.set("content-length", String(bodyLength)), forwarded.set("mcp-protocol-version", MCP_PROTOCOL_VERSION), forwarded.set("x-client-metadata", OFFICE_CLIENT_METADATA);
  for (let [name, value] of Object.entries(upstreamHeaders)) forwarded.set(name, value);
  return forwarded;
}
function rewriteOAuthChallenge(value, localOrigin) {
  return value.replace(
    /(resource_metadata\s*=\s*")[^"]*(")/i,
    `$1${localOrigin}${OAUTH_RESOURCE_METADATA_PATH}$2`
  );
}
function bearerTokenExpiresAt(authorizationHeader) {
  let value = Array.isArray(authorizationHeader) ? authorizationHeader[0] : authorizationHeader;
  if (typeof value != "string")
    return;
  let match = /^Bearer\s+([^\s]+)$/i.exec(value.trim());
  if (!match)
    return;
  let segments = match[1].split(".");
  if (segments.length === 3)
    try {
      let payload = JSON.parse(
        Buffer.from(segments[1], "base64url").toString("utf8")
      );
      return Number.isFinite(payload?.exp) ? payload.exp * 1e3 : void 0;
    } catch {
      return;
    }
}
function bearerTokenPayload(authorizationHeader) {
  let value = Array.isArray(authorizationHeader) ? authorizationHeader[0] : authorizationHeader;
  if (typeof value != "string")
    return;
  let match = /^Bearer\s+([^\s]+)$/i.exec(value.trim());
  if (!match)
    return;
  let segments = match[1].split(".");
  if (segments.length === 3)
    try {
      return JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
    } catch {
      return;
    }
}
function bearerPrincipalHash(authorizationHeader) {
  let payload = bearerTokenPayload(authorizationHeader), subject = payload?.oid ?? payload?.sub;
  if (typeof subject != "string" || !subject)
    return;
  let tenant = typeof payload?.tid == "string" ? payload.tid : "", issuer = typeof payload?.iss == "string" ? payload.iss : "";
  return createHash4("sha256").update(`${issuer}\0${tenant}\0${subject}`, "utf8").digest("hex");
}
function accountOwnerHash(account) {
  if (!(!account?.homeAccountId || !account?.tenantId))
    return createHash4("sha256").update(`account\0${account.tenantId.toLowerCase()}\0${account.homeAccountId.toLowerCase()}`, "utf8").digest("hex");
}
function taskExpiresAt(task, fallbackCreatedAt = /* @__PURE__ */ new Date(), previousExpiresAt = void 0) {
  let hasCreatedAt = Number.isFinite(Date.parse(task?.createdAt)), ttl = Number(task?.ttl);
  if (hasCreatedAt && Number.isFinite(ttl) && ttl > 0) {
    let observedExpiry = Date.parse(task.createdAt) + ttl, previousExpiry = Date.parse(previousExpiresAt);
    return new Date(
      Number.isFinite(previousExpiry) ? Math.min(previousExpiry, observedExpiry) : observedExpiry
    ).toISOString();
  }
  return Number.isFinite(Date.parse(previousExpiresAt)) ? new Date(previousExpiresAt).toISOString() : new Date(fallbackCreatedAt.getTime() + TASK_TTL_MS).toISOString();
}
function resumableResult(workflow) {
  return {
    content: [{
      type: "resource_link",
      uri: workflow.artifactUrl,
      name: workflow.title,
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    }],
    structuredContent: {
      powerpointWorkflow: workflow
    }
  };
}
function requireFreshTaskAuthorization(request, response, localOrigin, minimumRemainingMs, metadataPath = OAUTH_RESOURCE_METADATA_PATH) {
  let expiresAt = bearerTokenExpiresAt(request.headers.authorization);
  return expiresAt === void 0 || expiresAt - Date.now() >= minimumRemainingMs ? !0 : (response.statusCode = 401, response.setHeader(
    "www-authenticate",
    `Bearer resource_metadata="${localOrigin}${OAUTH_RESOURCE_METADATA_PATH}"`
  ), metadataPath !== OAUTH_RESOURCE_METADATA_PATH && response.setHeader(
    "www-authenticate",
    [
      "Bearer",
      `resource_metadata="${localOrigin}${metadataPath}"`
    ].join(" ")
  ), response.end(), !1);
}
function writeRecoveryAuthorizationChallenge(response, localOrigin) {
  response.statusCode = 401, response.setHeader(
    "www-authenticate",
    [
      "Bearer",
      `resource_metadata="${localOrigin}${RECOVERY_OAUTH_RESOURCE_METADATA_PATH}"`
    ].join(" ")
  ), response.end();
}
function requireRecoveryAuthorization(request, response, localOrigin) {
  return typeof request.headers.authorization == "string" ? !0 : (writeRecoveryAuthorizationChallenge(response, localOrigin), !1);
}
function copyResponseHeaders(upstreamResponse, response, localOrigin) {
  for (let [name, value] of upstreamResponse.headers) {
    let lowerName = name.toLowerCase();
    !HOP_BY_HOP_HEADERS.has(lowerName) && !DECODED_BODY_HEADERS.has(lowerName) && response.setHeader(
      name,
      lowerName === "www-authenticate" ? rewriteOAuthChallenge(value, localOrigin) : value
    );
  }
}
async function readRequestBody(request) {
  let chunks = [], size = 0;
  for await (let chunk of request) {
    if (size += chunk.length, size > MAX_REQUEST_BYTES)
      throw new RangeError("MCP request body is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function writeJsonError(response, statusCode, message) {
  if (!(response.writableEnded || response.destroyed)) {
    if (response.headersSent) {
      response.end();
      return;
    }
    response.statusCode = statusCode, response.setHeader("content-type", "application/json"), response.end(JSON.stringify({ error: message }));
  }
}
function writeJson2(response, statusCode, value) {
  response.writableEnded || response.destroyed || (response.statusCode = statusCode, response.setHeader("content-type", "application/json"), response.end(JSON.stringify(value)));
}
function writeOfficeAuthenticationError(response, error) {
  error instanceof AuthError ? writeJson2(response, authHttpStatus(error), authErrorBody(error)) : writeJsonError(response, 502, `Office authentication failed: ${error instanceof Error ? error.message : String(error)}`);
}
function writeRpcError(response, requestId, message, data = void 0) {
  if (!(response.writableEnded || response.destroyed)) {
    if (response.headersSent) {
      response.end();
      return;
    }
    response.statusCode = 200, response.setHeader("content-type", "application/json"), response.end(JSON.stringify({
      jsonrpc: "2.0",
      id: requestId,
      error: {
        code: -32e3,
        message,
        ...data === void 0 ? {} : { data }
      }
    }));
  }
}
function writeRpcResult(response, requestId, result) {
  if (!(response.writableEnded || response.destroyed)) {
    if (response.headersSent) {
      response.end();
      return;
    }
    response.statusCode = 200, response.setHeader("content-type", "application/json"), response.end(JSON.stringify({
      jsonrpc: "2.0",
      id: requestId,
      result
    }));
  }
}
function writeRpcResultWithDelivery(response, requestId, result) {
  return response.writableEnded || response.destroyed ? Promise.resolve(!1) : new Promise((resolve) => {
    let settled = !1, finish = (delivered) => {
      settled || (settled = !0, resolve(delivered));
    };
    response.once("finish", () => finish(!0)), response.once("close", () => finish(!1)), writeRpcResult(response, requestId, result);
  });
}
function validateCardPresentation(artifactUrl, title) {
  let artifact = parseTrustedPowerPointUrl(artifactUrl);
  return {
    artifactUrl: artifact.toString(),
    title: typeof title == "string" && title.trim() ? title.trim() : presentationTitleFromUrl2(artifact.toString())
  };
}
async function handlePowerPointUiMcpRequest({
  request,
  response,
  requestUrl,
  cardHtml,
  controlCapability,
  primusViewerHost
}) {
  if (requestUrl.pathname !== UI_MCP_PATH)
    return !1;
  if (request.method === "GET")
    return response.statusCode = 405, response.setHeader("allow", "POST, DELETE"), response.end(), !0;
  if (request.method === "DELETE")
    return response.statusCode = 202, response.end(), !0;
  if (request.method !== "POST")
    return writeJsonError(response, 405, "Method not allowed"), !0;
  let body = await readRequestBody(request), message;
  try {
    message = JSON.parse(body.toString("utf8"));
  } catch {
    return writeJsonError(response, 400, "Invalid JSON-RPC request"), !0;
  }
  if (Array.isArray(message))
    return writeJsonError(response, 400, "Batch requests are not supported"), !0;
  if (message.method === "notifications/initialized" || message.id === void 0)
    return response.statusCode = 202, response.end(), !0;
  if (message.method === "initialize")
    return writeRpcResult(response, message.id, {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        resources: {},
        tools: {}
      },
      serverInfo: {
        name: "powerpoint-copilot-ui",
        version: "0.1.0"
      }
    }), !0;
  if (message.method === "ping")
    return writeRpcResult(response, message.id, {}), !0;
  if (message.method === "tools/list")
    return writeRpcResult(response, message.id, {
      tools: [
        {
          name: POWERPOINT_CARD_TOOL,
          title: "Show PowerPoint presentation card",
          description: "Publish a persistent PowerPoint card in chat after creating or editing a presentation.",
          inputSchema: {
            type: "object",
            properties: {
              artifactUrl: {
                type: "string",
                description: "Canonical HTTPS SharePoint or OneDrive presentation URL."
              },
              title: {
                type: "string",
                description: "Presentation file name shown on the card."
              }
            },
            required: ["artifactUrl"],
            additionalProperties: !1
          },
          _meta: {
            ui: {
              resourceUri: POWERPOINT_CARD_URI,
              visibility: ["model"]
            }
          }
        },
        {
          name: POWERPOINT_CARD_DATA_TOOL,
          description: "Load presentation metadata and a first-slide thumbnail for the PowerPoint card.",
          inputSchema: {
            type: "object",
            properties: {
              artifactUrl: { type: "string" },
              title: { type: "string" }
            },
            required: ["artifactUrl"],
            additionalProperties: !1
          },
          _meta: {
            ui: {
              visibility: ["app"]
            }
          }
        }
      ]
    }), !0;
  if (message.method === "resources/list")
    return writeRpcResult(response, message.id, {
      resources: [{
        uri: POWERPOINT_CARD_URI,
        name: "PowerPoint presentation card",
        description: "Persistent controls for reopening a PowerPoint presentation.",
        mimeType: "text/html;profile=mcp-app"
      }]
    }), !0;
  if (message.method === "resources/read" && message.params?.uri === POWERPOINT_CARD_URI)
    return writeRpcResult(response, message.id, {
      contents: [{
        uri: POWERPOINT_CARD_URI,
        mimeType: "text/html;profile=mcp-app",
        text: cardHtml,
        _meta: {
          ui: {
            csp: {
              connectDomains: [],
              resourceDomains: [],
              frameDomains: []
            }
          }
        }
      }]
    }), !0;
  if (message.method === "tools/call" && message.params?.name === POWERPOINT_CARD_TOOL) {
    try {
      let presentation = validateCardPresentation(
        message.params.arguments?.artifactUrl,
        message.params.arguments?.title
      );
      writeRpcResult(response, message.id, {
        content: [{
          type: "text",
          text: `${presentation.title}
${presentation.artifactUrl}`
        }],
        structuredContent: {
          powerpointPresentation: presentation
        }
      });
    } catch (error) {
      writeRpcError(
        response,
        message.id,
        error instanceof Error ? error.message : String(error)
      );
    }
    return !0;
  }
  if (message.method === "tools/call" && message.params?.name === POWERPOINT_CARD_DATA_TOOL) {
    if (!hasRuntimeCapability(request, controlCapability))
      return writeRpcError(
        response,
        message.id,
        "Runtime capability required for PowerPoint card rehydration."
      ), !0;
    try {
      let cardData = await primusViewerHost.getCardData(
        message.params.arguments?.artifactUrl,
        message.params.arguments?.title
      );
      writeRpcResult(response, message.id, {
        content: [{
          type: "text",
          text: `PowerPoint card data loaded for ${cardData.fileName}.`
        }],
        structuredContent: cardData
      });
    } catch (error) {
      writeRpcError(
        response,
        message.id,
        error instanceof Error ? error.message : String(error)
      );
    }
    return !0;
  }
  return writeRpcError(response, message.id, `Method not found: ${message.method}`), !0;
}
function parseRpcMessages(body) {
  let text = body.toString("utf8");
  try {
    let parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return text.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => JSON.parse(line.slice(5).trim()));
  }
}
async function readRpcResponseMessages(upstreamResponse, onServerRequest = void 0, { onNotification = void 0, onStreamEnd = void 0 } = {}) {
  if (!(upstreamResponse.headers.get("content-type") ?? "").includes("text/event-stream"))
    return parseRpcMessages(Buffer.from(await upstreamResponse.arrayBuffer()));
  if (!upstreamResponse.body)
    return [];
  let messages = [], inflight = [], inflightFailure, reader = upstreamResponse.body.getReader(), decoder = new TextDecoder(), buffer = "", processEvent = async (event) => {
    let data = event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join(`
`);
    if (!data || data === "[DONE]")
      return;
    let message = JSON.parse(data);
    if (messages.push(message), message?.method && message.id !== void 0 && onServerRequest) {
      let handled = Promise.resolve().then(() => onServerRequest(message));
      handled.catch((error) => {
        inflightFailure || (inflightFailure = { error }, reader.cancel().catch(() => {
        }));
      }), inflight.push(handled);
    } else message?.method && message.id === void 0 && onNotification?.(message);
  };
  try {
    for (; !inflightFailure; ) {
      let { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";
      for (let event of events)
        await processEvent(event);
      if (done)
        break;
    }
    !inflightFailure && buffer.trim() && await processEvent(buffer);
  } finally {
    onStreamEnd?.();
  }
  if (inflightFailure) throw inflightFailure.error;
  for (let continuationMessages of await Promise.all(inflight))
    Array.isArray(continuationMessages) && messages.push(...continuationMessages);
  return messages;
}
function clampTaskPollMs(value, minimum, maximum) {
  let numeric = Number(value);
  return !Number.isFinite(numeric) || numeric <= 0 ? DEFAULT_TASK_POLL_MS : Math.max(minimum, Math.min(maximum, Math.floor(numeric)));
}
function writeSseMessage(response, message) {
  response.writableEnded || response.destroyed || response.write(`event: message
data: ${JSON.stringify(message)}

`);
}
function writeTaskProgress(response, progressToken, progress, message) {
  if (!(response.writableEnded || response.destroyed)) {
    if (progressToken == null) {
      response.write(`: keepalive

`);
      return;
    }
    writeSseMessage(response, {
      jsonrpc: "2.0",
      method: "notifications/progress",
      params: {
        progressToken,
        progress,
        ...message ? { message } : {}
      }
    });
  }
}
function writeSseResultWithDelivery(response, message) {
  return response.writableEnded || response.destroyed ? Promise.resolve(!1) : new Promise((resolve) => {
    let settled = !1, finish = (delivered) => {
      settled || (settled = !0, resolve(delivered));
    };
    response.once("finish", () => finish(!0)), response.once("close", () => finish(!1)), writeSseMessage(response, message), response.end();
  });
}
var OfficeMcpHttpError = class extends Error {
  method;
  status;
  constructor(method, status) {
    super(`Office MCP ${method} returned HTTP ${status}`), this.name = "OfficeMcpHttpError", this.method = method, this.status = status;
  }
}, ResumeStatePersistenceError = class extends Error {
  operation;
  constructor(operation, cause) {
    super(`PowerPoint resume-state ${operation} failed.`, { cause }), this.name = "ResumeStatePersistenceError", this.operation = operation;
  }
};
function requiresOfficeReauthentication(error) {
  return error instanceof OfficeMcpHttpError && error.status === 401 || error instanceof AuthError && ["interaction_required", "not_connected", "account_unavailable"].includes(error.code);
}
var TASK_GET_MAX_ATTEMPTS = 3, TASK_GET_RETRY_BASE_MS = 2e3, TRANSIENT_HTTP_STATUSES = /* @__PURE__ */ new Set([408, 429, 500, 502, 503, 504]);
function isTransientTaskGetFailure({ error = void 0, rpcError = void 0 } = {}) {
  return rpcError ? rpcError.code === -32603 : error instanceof OfficeMcpHttpError ? TRANSIENT_HTTP_STATUSES.has(error.status) : error instanceof Error && error.name === "TimeoutError" ? !0 : error instanceof TypeError && /fetch failed/i.test(error.message);
}
async function upstreamRpc({
  upstream,
  baseHeaders,
  fetchImpl,
  method,
  params,
  sessionId,
  onServerRequest = void 0,
  onNotification = void 0,
  onStreamEnd = void 0,
  signal = void 0
}) {
  let id = `powerpoint-proxy-${randomUUID7()}`, body = Buffer.from(JSON.stringify({
    jsonrpc: "2.0",
    id,
    method,
    params
  })), headers = new Headers(baseHeaders);
  headers.set("content-length", String(body.length)), sessionId && headers.set("mcp-session-id", sessionId);
  let upstreamResponse = await fetchImpl(upstream, {
    method: "POST",
    headers,
    body,
    redirect: "manual",
    ...signal ? { signal } : {}
  }), nextSessionId = upstreamResponse.headers.get("mcp-session-id") ?? sessionId;
  if (!upstreamResponse.ok)
    throw new OfficeMcpHttpError(method, upstreamResponse.status);
  let message = (await readRpcResponseMessages(upstreamResponse, onServerRequest, { onNotification, onStreamEnd })).find((candidate) => String(candidate?.id) === id);
  if (!message)
    throw new Error(`Office MCP ${method} returned no matching JSON-RPC response`);
  return {
    message,
    requestId: id,
    sessionId: nextSessionId,
    upstreamResponse
  };
}
async function callOfficeUploadTool({
  upstream,
  fetchImpl,
  upstreamHeaders = {},
  args,
  requestId,
  signal = void 0
}) {
  let baseHeaders = forwardedRequestHeaders({
    "content-type": "application/json",
    accept: "application/json, text/event-stream"
  }, 0, upstreamHeaders), _meta = { flights: UPLOAD_FLIGHT }, sessionId;
  try {
    let initialized = await upstreamRpc({
      upstream,
      baseHeaders,
      fetchImpl,
      signal,
      sessionId: void 0,
      method: "initialize",
      params: {
        _meta,
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "powerpoint-copilot-upload", version: "1.0.0" }
      }
    });
    if (initialized.message.error)
      throw new Error(initialized.message.error.message ?? "Office MCP rejected initialize.");
    if (sessionId = initialized.sessionId, !sessionId) throw new Error("Office MCP did not establish a session.");
    let body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: { _meta } })), headers = new Headers(baseHeaders);
    headers.set("content-length", String(body.length)), headers.set("mcp-session-id", sessionId);
    let notified = await fetchImpl(upstream, { method: "POST", headers, body, redirect: "manual", ...signal ? { signal } : {} });
    if (await notified.body?.cancel(), !notified.ok) throw new OfficeMcpHttpError("notifications/initialized", notified.status);
  } catch (error) {
    throw error instanceof AuthError ? error : new UploadNotSentError(error instanceof OfficeMcpHttpError ? `${error.message}.` : "Office MCP could not be reached.", { cause: error });
  }
  signal?.throwIfAborted();
  let called = await upstreamRpc({
    upstream,
    baseHeaders,
    fetchImpl,
    signal,
    sessionId,
    method: "tools/call",
    params: {
      name: UPLOAD_TOOL,
      arguments: args,
      _meta: { ..._meta, xMetadata: { requestId } }
    }
  });
  if (called.message.error)
    throw new UploadRpcError(
      typeof called.message.error.message == "string" ? called.message.error.message : JSON.stringify(called.message.error),
      typeof called.message.error.code == "number" ? called.message.error.code : void 0
    );
  return called.message.result;
}
async function runManagedTaskCall({
  message,
  response,
  upstream,
  baseHeaders,
  fetchImpl,
  initialSessionId,
  sleepImpl,
  taskTimeoutMs,
  minimumPollMs,
  maximumPollMs,
  localOrigin,
  pendingServerRequests,
  operationJournal,
  resumeStore,
  managedTask,
  activeCorrelationIds,
  elicitationResponseTransformer,
  elicitationWaitMs = DEFAULT_ELICITATION_WAIT_MS,
  dismissedServerRequests = /* @__PURE__ */ new Map(),
  isShuttingDown = () => !1,
  sseKeepAliveMs = DEFAULT_SSE_KEEPALIVE_MS,
  operationOwner = bearerPrincipalHash,
  resumeRecord = void 0
}) {
  let requestId = message.id, progressToken = message.params?._meta?.progressToken, workflowCall, correlationId;
  if (resumeRecord) {
    if (workflowCall = {
      operation: resumeRecord.operation,
      input: resumeRecord.operation === "edit" ? { artifactUrl: resumeRecord.expectedArtifactUrl } : {}
    }, correlationId = resumeRecord.correlationId, !await operationJournal.reopen(correlationId)) {
      writeRpcError(
        response,
        requestId,
        `PowerPoint operation ${correlationId} is not resumable.`
      );
      return;
    }
  } else {
    try {
      workflowCall = parsePowerPointWorkflowCall(message.params);
    } catch (error) {
      writeRpcError(
        response,
        requestId,
        error instanceof Error ? error.message : String(error)
      );
      return;
    }
    let operation = await operationJournal.begin({
      operation: workflowCall.operation,
      idempotencyKey: workflowCall.idempotencyKey
    });
    if (!operation.accepted) {
      writeRpcError(
        response,
        requestId,
        `Idempotency key already belongs to PowerPoint operation ${operation.existing.correlationId} with status '${operation.existing.status}'.`
      );
      return;
    }
    correlationId = operation.correlationId;
  }
  if (activeCorrelationIds.has(correlationId)) {
    writeRpcError(
      response,
      requestId,
      `PowerPoint operation ${correlationId} is already active.`
    );
    return;
  }
  activeCorrelationIds.add(correlationId), managedTask.correlationId = correlationId, managedTask.generateInput = workflowCall.input;
  let sessionId = resumeRecord?.sessionId ?? initialSessionId, taskId = resumeRecord?.taskId, completed = !1, clientClosed = response.destroyed, deliveredResult = !1, terminalEventRecorded = !1, preserveTask = !1, pollCount = 0, elicitation, templateAnswerInFlight, answeredChoices = [], postUpstreamReply = async (reply) => {
    let body = Buffer.from(JSON.stringify(reply)), headers = new Headers(baseHeaders);
    headers.set("content-length", String(body.length)), sessionId && headers.set("mcp-session-id", sessionId);
    let upstreamResponse = await fetchImpl(upstream, {
      method: "POST",
      headers,
      body,
      redirect: "manual"
    });
    if (!upstreamResponse.ok)
      throw new OfficeMcpHttpError("elicitation reply", upstreamResponse.status);
    let messages = await readRpcResponseMessages(upstreamResponse), rejected = messages.find((message2) => message2.error);
    if (rejected) throw new Error(rejected.error.message ?? "Office rejected the elicitation answer.");
    return messages;
  }, openElicitation = (serverRequest, clientRequestId) => {
    let pendingKey = pendingServerRequestKey(clientRequestId, sessionId, managedTask.endpoint), answer = deferred();
    answer.promise.catch(() => {
    });
    let retired = deferred(), ready = deferred();
    ready.resolve();
    let current = {
      clientRequestId,
      params: serverRequest.params,
      startedAt: Date.now(),
      pendingKey,
      answer: answer.promise,
      retired: retired.promise,
      answeredMessage: void 0,
      choicesRecorded: !1,
      failed: void 0,
      // Set once Office announces it stopped waiting for the current upstream id.
      abandoned: !1,
      pending: {
        baseHeaders,
        clientSessionId: managedTask.clientSessionId,
        managedTask,
        requestId: String(clientRequestId),
        serverMethod: serverRequest.method,
        serverRequestParams: serverRequest.params,
        sessionId,
        upstream,
        upstreamRequestId: serverRequest.id,
        deliveredMessage: void 0,
        forwarding: !1,
        // Set once the answer is actually being sent to Office (not while waiting for a re-ask).
        posting: !1,
        // An answer submitted between Office's timeout and its re-ask waits here.
        awaitUpstream: () => ready.promise,
        resolve: answer.resolve,
        reject(error) {
          answer.reject(error), ready.reject(error);
        }
      },
      bind() {
        ready.resolve();
      },
      unbind() {
        ready = deferred(), ready.promise.catch(() => {
        });
      },
      // Settles every waiter: a gap-time answer and the upstream handler.
      fail(error) {
        ready.reject(error), retired.resolve();
      }
    };
    return pendingServerRequests.set(pendingKey, current.pending), elicitation = current, writeSseMessage(response, {
      ...serverRequest,
      id: clientRequestId,
      ...serverRequest.params ? { params: withoutTemplateOptions(serverRequest.params) } : {}
    }), current;
  }, awaitAnswerOrExpiry = async (current, expiry) => {
    let outcome = await Promise.race([
      current.answer.then(
        (continuation) => ({ continuation }),
        (error) => {
          throw current.failed = error, error;
        }
      ),
      expiry.then(() => ({ expired: !0 })),
      current.retired.then(() => ({ retired: !0 }))
    ]);
    if ("continuation" in outcome || current.pending.forwarding) {
      let continuation = "continuation" in outcome ? outcome.continuation : await current.answer;
      return current.answeredMessage = current.pending.deliveredMessage, current.choicesRecorded || (current.choicesRecorded = !0, answeredChoices.push(...describeAnswer(current.params, current.answeredMessage?.result))), continuation;
    }
    return "retired" in outcome || elicitation !== current ? [] : (current.unbind(), await operationJournal.record(correlationId, "elicitation", {
      taskId,
      upstreamRequestId: String(current.pending.upstreamRequestId),
      phase: "expired",
      clientRequestId: current.clientRequestId
    }), []);
  }, dismissElicitation = async (reason) => {
    let current = elicitation;
    if (!current || (elicitation = void 0, pendingServerRequests.get(current.pendingKey) === current.pending && pendingServerRequests.delete(current.pendingKey), current.fail(new Error(reason)), current.answeredMessage)) return;
    let now = Date.now();
    for (let [key, dismissedAt] of dismissedServerRequests)
      now - dismissedAt > 3600 * 1e3 && dismissedServerRequests.delete(key);
    dismissedServerRequests.set(current.pendingKey, now), writeSseMessage(response, {
      jsonrpc: "2.0",
      method: "notifications/cancelled",
      params: { requestId: current.clientRequestId, reason }
    }), await operationJournal.record(correlationId, "elicitation", {
      taskId,
      upstreamRequestId: String(current.pending.upstreamRequestId),
      phase: "dismissed",
      clientRequestId: current.clientRequestId
    });
  }, updateResumeState = async (changes) => {
    try {
      return await resumeStore.update(correlationId, changes);
    } catch (error) {
      throw new ResumeStatePersistenceError("update", error);
    }
  }, removeResumeState = async () => {
    try {
      return await resumeStore.remove(correlationId), !0;
    } catch {
      return console.error(
        `[powerpoint-copilot] Could not remove resume state for ${correlationId}.`
      ), !1;
    }
  }, rejectPendingElicitations = (error) => {
    for (let [id, pending] of pendingServerRequests)
      pending.managedTask === managedTask && (pendingServerRequests.delete(id), pending.reject?.(error));
  }, cancelTask = async () => {
    if (managedTask.cancelPromise)
      return managedTask.cancelPromise;
    if (!taskId)
      return managedTask.cancelConfirmed === !0;
    let cancellingTaskId = taskId;
    managedTask.cancelPromise = (async () => {
      let cancelled = await upstreamRpc({
        upstream,
        baseHeaders,
        fetchImpl,
        method: "tasks/cancel",
        params: { taskId: cancellingTaskId },
        sessionId
      });
      if (cancelled.message?.error)
        throw new Error(
          cancelled.message.error.message ?? "Office MCP tasks/cancel failed."
        );
      if (cancelled.message?.result?.taskId !== cancellingTaskId || cancelled.message?.result?.status !== "cancelled")
        throw new Error(
          "Office MCP did not confirm the requested task as cancelled."
        );
      return taskId = void 0, managedTask.taskId = void 0, managedTask.cancelConfirmed = !0, !0;
    })();
    try {
      return await managedTask.cancelPromise;
    } finally {
      managedTask.cancelPromise = void 0;
    }
  };
  managedTask.cancelTask = cancelTask;
  let finalizeCancellation = async (safeWithoutTask = !1) => {
    if (!managedTask.cancellationError && taskId)
      try {
        await cancelTask();
      } catch (error) {
        managedTask.cancellationError = error;
      }
    let confirmed = safeWithoutTask || managedTask.cancelConfirmed, outcome = managedTask.cancellationError || !confirmed ? workflowFailure(
      correlationId,
      "cancellation_unconfirmed",
      managedTask.cancellationError instanceof Error ? managedTask.cancellationError.message : "Office did not confirm cancellation. The mutation may still complete.",
      "interrupted"
    ) : workflowFailure(
      correlationId,
      "client_cancelled",
      "The Copilot client cancelled the operation.",
      "cancelled"
    );
    return terminalEventRecorded = !0, await operationJournal.record(correlationId, outcome.status, {
      error: outcome.error
    }), confirmed ? await removeResumeState() : taskId && (preserveTask = !0, await updateResumeState({
      status: "interrupted",
      taskId,
      ...sessionId ? { sessionId } : {}
    })), outcome;
  };
  if (managedTask.cancelRequested) {
    completed = !0;
    let outcome = await finalizeCancellation(!0);
    writeRpcError(response, requestId, outcome.error.message, outcome);
    return;
  }
  response.once("close", () => {
    completed || (clientClosed = !0, rejectPendingElicitations(
      new Error("The Copilot client disconnected during elicitation.")
    ));
  });
  let created, task = resumeRecord ? {
    taskId: resumeRecord.taskId,
    status: resumeRecord.officeStatus ?? "working",
    statusMessage: resumeRecord.statusMessage,
    pollInterval: resumeRecord.pollInterval,
    createdAt: resumeRecord.createdAt,
    ttl: Math.max(
      1,
      Date.parse(resumeRecord.expiresAt) - Date.parse(resumeRecord.createdAt)
    )
  } : void 0;
  if (resumeRecord)
    managedTask.taskId = taskId, managedTask.sessionId = sessionId;
  else {
    let forwardedMeta = message.params._meta ? { ...message.params._meta } : void 0;
    forwardedMeta && (delete forwardedMeta.progressToken, delete forwardedMeta.idempotencyKey);
    let taskParams = {
      name: message.params.name,
      arguments: workflowCall.input,
      task: { ttl: TASK_TTL_MS },
      ...forwardedMeta && Object.keys(forwardedMeta).length > 0 ? { _meta: forwardedMeta } : {}
    };
    try {
      created = await upstreamRpc({
        upstream,
        baseHeaders,
        fetchImpl,
        method: "tools/call",
        params: taskParams,
        sessionId
      });
    } catch (error) {
      if (managedTask.cancelRequested) {
        completed = !0;
        let outcome = await finalizeCancellation();
        writeRpcError(response, requestId, outcome.error.message, outcome);
        return;
      }
      if (terminalEventRecorded = !0, completed = !0, error instanceof OfficeMcpHttpError && error.status === 404 && sessionId) {
        await operationJournal.discard(correlationId, "office_session_expired"), writeJsonError(response, 404, "Office MCP session not found. Start a new session and resend the request.");
        return;
      }
      let failure = workflowFailure(
        correlationId,
        "office_task_submission_failed",
        error instanceof Error ? error.message : String(error)
      );
      await operationJournal.record(correlationId, "failed", {
        error: failure.error
      }), writeRpcError(response, requestId, failure.error.message, failure);
      return;
    }
    if (sessionId = created.sessionId, created.message?.error) {
      completed = !0, terminalEventRecorded = !0;
      let failure = workflowFailure(
        correlationId,
        "office_tool_call_failed",
        created.message.error.message ?? "Office MCP tools/call failed."
      );
      await operationJournal.record(correlationId, "failed", {
        error: failure.error,
        upstreamRequestId: created.requestId
      }), response.statusCode = 200, copyResponseHeaders(created.upstreamResponse, response, localOrigin), response.setHeader("content-type", "application/json"), response.end(JSON.stringify({
        ...created.message,
        id: requestId,
        error: {
          ...created.message.error,
          data: failure
        }
      }));
      return;
    }
    if (task = created.message?.result?.task, task?.taskId && (taskId = task.taskId, managedTask.taskId = taskId, managedTask.sessionId = sessionId), managedTask.cancelRequested) {
      completed = !0;
      let outcome = await finalizeCancellation();
      writeRpcError(response, requestId, outcome.error.message, outcome);
      return;
    }
  }
  if (!task?.taskId) {
    let decorated = decoratePowerPointResult(
      created.message?.result,
      correlationId,
      {
        allowNoArtifact: workflowCall.operation === "edit",
        operation: workflowCall.operation,
        expectedArtifactUrl: workflowCall.operation === "edit" ? workflowCall.input.artifactUrl : void 0
      }
    );
    if (decorated.workflow.status !== "completed") {
      terminalEventRecorded = !0, completed = !0, await operationJournal.record(correlationId, "failed", {
        error: decorated.workflow.error
      }), writeRpcError(
        response,
        requestId,
        decorated.workflow.error.message,
        decorated.workflow
      );
      return;
    }
    decorated.compatibilityFallback && await operationJournal.record(correlationId, "compatibility_fallback", {
      compatibilityFallback: decorated.compatibilityFallback
    }), terminalEventRecorded = !0, await operationJournal.record(correlationId, "completed");
    let correlated = {
      ...created.message,
      id: requestId,
      result: decorated.result
    };
    deliveredResult = !0, completed = !0, response.statusCode = 200, copyResponseHeaders(created.upstreamResponse, response, localOrigin), response.setHeader("content-type", "application/json"), response.end(JSON.stringify(correlated));
    return;
  }
  let persistedTaskCreatedAt = Number.isFinite(Date.parse(task.createdAt)) ? new Date(task.createdAt).toISOString() : resumeRecord?.createdAt ?? (/* @__PURE__ */ new Date()).toISOString(), persistedTaskExpiresAt = resumeRecord?.expiresAt ?? taskExpiresAt(task, new Date(persistedTaskCreatedAt));
  if (resumeRecord)
    await updateResumeState({
      officeStatus: task.status,
      ...sessionId ? { sessionId } : {}
    });
  else {
    await operationJournal.record(correlationId, "task_created", {
      taskId,
      upstreamRequestId: created.requestId,
      status: task.status
    });
    let ownerHash = operationOwner(baseHeaders.get("authorization"));
    if (ownerHash)
      try {
        await resumeStore.put({
          correlationId,
          operation: workflowCall.operation,
          taskId,
          ownerHash,
          createdAt: persistedTaskCreatedAt,
          expiresAt: persistedTaskExpiresAt,
          officeStatus: task.status,
          ...task.statusMessage ? { statusMessage: task.statusMessage } : {},
          pollInterval: clampTaskPollMs(
            task.pollInterval,
            minimumPollMs,
            maximumPollMs
          ),
          ...sessionId ? { sessionId } : {},
          ...workflowCall.operation === "edit" ? { expectedArtifactUrl: workflowCall.input.artifactUrl } : {}
        });
      } catch (persistenceError) {
        let cancellationError;
        try {
          await cancelTask();
        } catch (error) {
          cancellationError = error;
        }
        completed = !0, terminalEventRecorded = !0;
        let failure = workflowFailure(
          correlationId,
          cancellationError ? "resume_state_persistence_cancellation_unconfirmed" : "resume_state_persistence_failed",
          cancellationError ? `The Office task was accepted, recovery state could not be persisted, and cancellation was not confirmed: ${cancellationError instanceof Error ? cancellationError.message : String(cancellationError)}` : `The Office task was cancelled because recovery state could not be persisted: ${persistenceError instanceof Error ? persistenceError.message : String(persistenceError)}`,
          cancellationError ? "interrupted" : "failed"
        );
        await operationJournal.record(correlationId, failure.status, {
          error: failure.error,
          taskId,
          ...sessionId ? { sessionId } : {}
        }), writeRpcError(response, requestId, failure.error.message, {
          ...failure,
          ...cancellationError && taskId ? { taskId } : {}
        });
        return;
      }
  }
  response.statusCode = 200, response.setHeader("content-type", "text/event-stream"), response.setHeader("cache-control", "no-cache"), sessionId && response.setHeader("mcp-session-id", sessionId), response.flushHeaders();
  let keepAlive = setInterval(() => {
    !response.writableEnded && !response.destroyed && response.write(`: keepalive

`);
  }, sseKeepAliveMs);
  keepAlive.unref(), response.once("close", () => clearInterval(keepAlive));
  let progress = 0, status = task.status, statusMessage = task.statusMessage, pollMs = clampTaskPollMs(task.pollInterval, minimumPollMs, maximumPollMs), startedAt = Date.now(), progressMessage = (phase, officeStatusMessage) => powerPointProgressMessage({
    operation: workflowCall.operation,
    phase,
    officeStatusMessage
  }), reportProgress = (text) => {
    writeTaskProgress(response, progressToken, ++progress, text);
  };
  reportProgress(progressMessage(resumeRecord ? "resume" : "start")), hasInitialStatusToAnnounce(status, statusMessage) && reportProgress(progressMessage(progressPhaseForStatus(status), statusMessage));
  try {
    for (; ; ) {
      for (; status === "working"; ) {
        if (managedTask.cancelRequested) {
          completed = !0, await finalizeCancellation(), response.end();
          return;
        }
        if (Date.now() - startedAt > taskTimeoutMs) {
          let cancellationError;
          try {
            await cancelTask();
          } catch (error) {
            cancellationError = error;
          }
          terminalEventRecorded = !0, completed = !0;
          let failure = workflowFailure(
            correlationId,
            cancellationError ? "office_task_timeout_cancellation_unconfirmed" : "office_task_timeout",
            cancellationError ? `Office task polling timed out and cancellation was not confirmed: ${cancellationError instanceof Error ? cancellationError.message : String(cancellationError)}` : `Office task polling timed out with status '${status}'`,
            cancellationError ? "interrupted" : "failed"
          );
          await operationJournal.record(correlationId, failure.status, {
            error: failure.error
          }), cancellationError ? (preserveTask = !0, await updateResumeState({
            status: "interrupted",
            taskId,
            ...sessionId ? { sessionId } : {}
          })) : await removeResumeState(), writeSseMessage(response, {
            jsonrpc: "2.0",
            id: requestId,
            error: {
              code: -32e3,
              message: failure.error.message,
              data: failure
            }
          }), response.end();
          return;
        }
        if (await sleepImpl(pollMs), isShuttingDown())
          throw new Error("The PowerPoint runtime stopped while observing the Office task.");
        if (managedTask.cancelRequested) {
          completed = !0, await finalizeCancellation(), response.end();
          return;
        }
        let polled;
        for (let attempt = 1; ; attempt += 1) {
          let failure;
          try {
            if (polled = await upstreamRpc({
              upstream,
              baseHeaders,
              fetchImpl,
              method: "tasks/get",
              params: { taskId },
              sessionId
            }), !polled.message.error || !isTransientTaskGetFailure({ rpcError: polled.message.error }))
              break;
            sessionId = polled.sessionId;
          } catch (error) {
            if (!isTransientTaskGetFailure({ error })) throw error;
            failure = error;
          }
          if (attempt >= TASK_GET_MAX_ATTEMPTS) {
            if (failure) throw failure;
            break;
          }
          if (await sleepImpl(TASK_GET_RETRY_BASE_MS * attempt), isShuttingDown())
            throw new Error("The PowerPoint runtime stopped while observing the Office task.");
        }
        if (sessionId = polled.sessionId, pollCount += 1, managedTask.sessionId = sessionId, managedTask.cancelRequested) {
          completed = !0, await finalizeCancellation(), response.end();
          return;
        }
        if (polled.message.error)
          throw new Error(
            polled.message.error.message ?? "Office MCP tasks/get failed"
          );
        let taskStatus = polled.message.result;
        status = taskStatus?.status, statusMessage = taskStatus?.statusMessage ?? statusMessage, pollMs = clampTaskPollMs(
          taskStatus?.pollInterval,
          minimumPollMs,
          maximumPollMs
        ), await operationJournal.record(correlationId, "polling", {
          pollCount,
          status,
          taskId,
          upstreamRequestId: polled.requestId
        }), persistedTaskExpiresAt = taskExpiresAt(
          taskStatus,
          new Date(persistedTaskCreatedAt),
          persistedTaskExpiresAt
        ), await updateResumeState({
          taskId,
          officeStatus: status,
          ...statusMessage ? { statusMessage } : {},
          pollInterval: pollMs,
          expiresAt: persistedTaskExpiresAt,
          ...sessionId ? { sessionId } : {}
        }), reportProgress(progressMessage(progressPhaseForStatus(status), statusMessage));
      }
      let expirations = /* @__PURE__ */ new Map(), streamEnded = !1, expiryOf = (upstreamRequestId) => {
        let key = String(upstreamRequestId), entry = expirations.get(key);
        return entry || (entry = deferred(), expirations.set(key, entry), streamEnded && entry.resolve()), entry.promise;
      }, questionWasPending = !!elicitation, reasked = !1, cancelledUpstreamIds = /* @__PURE__ */ new Set(), result, resultError;
      try {
        result = await upstreamRpc({
          upstream,
          baseHeaders,
          fetchImpl,
          method: "tasks/result",
          params: { taskId },
          sessionId,
          onNotification: (notification) => {
            let cancelledId = notification?.params?.requestId;
            notification?.method !== "notifications/cancelled" || cancelledId === void 0 || (cancelledUpstreamIds.add(String(cancelledId)), elicitation && String(elicitation.pending.upstreamRequestId) === String(cancelledId) && (elicitation.abandoned = !0), expiryOf(cancelledId), expirations.get(String(cancelledId)).resolve());
          },
          onStreamEnd: () => {
            streamEnded = !0;
            for (let entry of expirations.values()) entry.resolve();
          },
          onServerRequest: async (serverRequest) => {
            if (serverRequest.method === "ping")
              return await postUpstreamReply({ jsonrpc: "2.0", id: serverRequest.id, result: {} }), [];
            let upstreamServerRequestId = serverRequest.id;
            if (clientClosed)
              throw new Error(
                "Office requires user input after the Copilot client disconnected."
              );
            if (await templateAnswerInFlight, (managedTask.skipTemplateSelection || managedTask.pickedTemplateId) && resumeRecord?.templatePicker?.questionKey === templateQuestionKey(serverRequest.params)) {
              let content = managedTask.skipTemplateSelection ? nonOrgSelectionContent(serverRequest.params) : templateAnswerContent(serverRequest.params, managedTask.pickedTemplateId);
              if (content) {
                templateAnswerInFlight = (async () => {
                  if (await operationJournal.record(correlationId, "elicitation", {
                    taskId,
                    upstreamRequestId: String(upstreamServerRequestId),
                    phase: managedTask.skipTemplateSelection ? "template_picker_skipped" : "template_picker_answer"
                  }), cancelledUpstreamIds.has(String(upstreamServerRequestId))) return [];
                  let replies = await postUpstreamReply({
                    jsonrpc: "2.0",
                    id: upstreamServerRequestId,
                    result: { action: "accept", content }
                  });
                  return cancelledUpstreamIds.has(String(upstreamServerRequestId)) || (await updateResumeState((current2) => ({
                    templatePicker: { ...current2.templatePicker, answerAccepted: !0 }
                  })), managedTask.pickedTemplateId = void 0, managedTask.skipTemplateSelection = !1), replies;
                })();
                try {
                  return await templateAnswerInFlight;
                } finally {
                  templateAnswerInFlight = void 0;
                }
              }
              if (managedTask.pickedTemplateId && orgSelectionContent(serverRequest.params))
                throw new Error("Office no longer offers the confirmed template on this operation; refusing to substitute an organization or design style.");
            }
            let reask = elicitation?.abandoned && sameQuestion(elicitation.params, serverRequest.params);
            if (elicitation && !reask && (elicitation.answeredMessage ? elicitation = void 0 : await dismissElicitation("Office replaced this question with a new one.")), reask) {
              let current2 = elicitation;
              return reasked = !0, current2.abandoned = cancelledUpstreamIds.has(String(upstreamServerRequestId)), current2.pending.upstreamRequestId = upstreamServerRequestId, current2.pending.sessionId = sessionId, await operationJournal.record(correlationId, "elicitation", {
                taskId,
                upstreamRequestId: String(upstreamServerRequestId),
                phase: current2.answeredMessage ? "replayed" : "reasked",
                clientRequestId: current2.clientRequestId
              }), current2.answeredMessage ? await postUpstreamReply({ ...current2.answeredMessage, id: upstreamServerRequestId }) : (current2.bind(), await awaitAnswerOrExpiry(current2, expiryOf(upstreamServerRequestId)));
            }
            let clientServerRequestId = upstreamServerRequestId === 0 ? `powerpoint-server-${randomUUID7()}` : upstreamServerRequestId;
            if (await operationJournal.record(correlationId, "elicitation", {
              taskId,
              upstreamRequestId: String(upstreamServerRequestId),
              phase: "request",
              serverMethod: serverRequest.method,
              clientRequestId: clientServerRequestId
            }), pendingServerRequests.size >= MAX_PENDING_SERVER_REQUESTS)
              throw new Error(
                "Too many pending Office elicitation requests."
              );
            let current = openElicitation(serverRequest, clientServerRequestId);
            return cancelledUpstreamIds.has(String(upstreamServerRequestId)) && (current.abandoned = !0), await awaitAnswerOrExpiry(current, expiryOf(upstreamServerRequestId));
          }
        });
      } catch (error) {
        if (!elicitation || elicitation.failed) throw error;
        resultError = error;
      }
      if (managedTask.cancelRequested) {
        await dismissElicitation("The PowerPoint operation was cancelled."), completed = !0, await finalizeCancellation(), response.writableEnded || response.end();
        return;
      }
      if (elicitation) {
        let current = elicitation;
        if (resultError !== void 0) {
          if (current.pending.posting || current.answeredMessage) {
            await current.answer.catch(() => {
            }), elicitation = void 0, status = "working";
            continue;
          }
          current.abandoned = !0;
        }
        let officeGaveUp = current.abandoned && (!questionWasPending || reasked);
        if (officeGaveUp && current.answeredMessage && (current.replays = (current.replays ?? 0) + 1) <= MAX_ANSWER_REPLAYS) {
          status = "input_required";
          continue;
        }
        if (officeGaveUp && !current.answeredMessage && Date.now() - current.startedAt < elicitationWaitMs) {
          status = "input_required";
          continue;
        }
        let interruptForInput = async (code, message2) => {
          let failure = workflowFailure(correlationId, code, message2, "interrupted");
          preserveTask = !0, completed = !0, terminalEventRecorded = !0, await operationJournal.record(correlationId, "interrupted", { error: failure.error, taskId }), await updateResumeState({
            status: "interrupted",
            officeStatus: "input_required",
            taskId,
            ...sessionId ? { sessionId } : {}
          }), writeSseMessage(response, {
            jsonrpc: "2.0",
            id: requestId,
            error: { code: -32e3, message: failure.error.message, data: failure }
          }), response.end();
        };
        if (officeGaveUp && current.answeredMessage) {
          elicitation = void 0, await interruptForInput(
            "office_answer_not_accepted",
            `Office did not accept the answer after ${MAX_ANSWER_REPLAYS + 1} attempts. The Office task was preserved; call resume_powerpoint_operation with correlationId '${correlationId}' to answer it again.`
          );
          return;
        }
        if (officeGaveUp && !current.answeredMessage) {
          await dismissElicitation("The answer window for this question expired.");
          let minutes = Math.round(elicitationWaitMs / 6e4);
          await interruptForInput(
            "office_elicitation_timeout",
            `No answer to Office's question arrived within ${minutes} minute${minutes === 1 ? "" : "s"}. The Office task was preserved; call resume_powerpoint_operation with correlationId '${correlationId}' to answer it again.`
          );
          return;
        }
        current.answeredMessage ? elicitation = void 0 : await dismissElicitation(resultError !== void 0 || result?.message?.error ? "Office could not continue this operation." : "Office no longer needs an answer to this question.");
      }
      if (resultError) throw resultError;
      if (result.message.error) {
        let failure = workflowFailure(
          correlationId,
          "office_task_result_failed",
          result.message.error.message ?? "Office MCP tasks/result failed."
        );
        terminalEventRecorded = !0, await operationJournal.record(correlationId, "failed", {
          error: failure.error,
          upstreamRequestId: result.requestId
        }), await removeResumeState(), writeSseMessage(response, {
          jsonrpc: "2.0",
          id: requestId,
          error: {
            ...result.message.error,
            data: failure
          }
        }), deliveredResult = !0, completed = !0, response.end();
        return;
      }
      let continuationTask = result.message.result?.task;
      if (continuationTask?.taskId) {
        taskId = continuationTask.taskId, status = continuationTask.status, statusMessage = continuationTask.statusMessage ?? statusMessage, persistedTaskCreatedAt = Number.isFinite(
          Date.parse(continuationTask.createdAt)
        ) ? new Date(continuationTask.createdAt).toISOString() : (/* @__PURE__ */ new Date()).toISOString(), persistedTaskExpiresAt = taskExpiresAt(
          continuationTask,
          new Date(persistedTaskCreatedAt)
        ), pollMs = clampTaskPollMs(
          continuationTask.pollInterval,
          minimumPollMs,
          maximumPollMs
        ), managedTask.taskId = taskId, managedTask.sessionId = sessionId, await operationJournal.record(correlationId, "task_created", {
          taskId,
          upstreamRequestId: result.requestId,
          status
        }), await updateResumeState({
          taskId,
          officeStatus: status,
          ...statusMessage ? { statusMessage } : {},
          createdAt: persistedTaskCreatedAt,
          expiresAt: persistedTaskExpiresAt,
          pollInterval: pollMs,
          ...sessionId ? { sessionId } : {}
        }), reportProgress(progressMessage("continuing", statusMessage));
        continue;
      }
      let decorated = decoratePowerPointResult(
        result.message.result,
        correlationId,
        {
          allowNoArtifact: workflowCall.operation === "edit",
          operation: workflowCall.operation,
          expectedArtifactUrl: workflowCall.operation === "edit" ? workflowCall.input.artifactUrl : void 0
        }
      );
      if (decorated.workflow.status !== "completed") {
        terminalEventRecorded = !0, await operationJournal.record(correlationId, "failed", {
          error: decorated.workflow.error,
          upstreamRequestId: result.requestId
        }), await removeResumeState(), writeSseMessage(response, {
          jsonrpc: "2.0",
          id: requestId,
          error: {
            code: -32e3,
            message: decorated.workflow.error.message,
            data: decorated.workflow
          }
        }), deliveredResult = !0, completed = !0, response.end();
        return;
      }
      decorated.compatibilityFallback && await operationJournal.record(correlationId, "compatibility_fallback", {
        compatibilityFallback: decorated.compatibilityFallback,
        taskId,
        upstreamRequestId: result.requestId
      }), answeredChoices.length > 0 && (Object.assign(decorated.workflow, { choices: answeredChoices }), decorated.result = {
        ...decorated.result,
        content: [
          ...Array.isArray(decorated.result?.content) ? decorated.result.content : [],
          { type: "text", text: `The user's choices in PowerPoint's questions: ${formatAnsweredChoices(answeredChoices)}.` }
        ]
      }), terminalEventRecorded = !0, await updateResumeState({
        status: "completed",
        officeStatus: "completed",
        result: resumableResult(decorated.workflow)
      }), await operationJournal.record(correlationId, "completed", {
        taskId,
        upstreamRequestId: result.requestId
      }), completed = !0, deliveredResult = await writeSseResultWithDelivery(response, {
        jsonrpc: "2.0",
        id: requestId,
        result: decorated.result
      }), deliveredResult && await removeResumeState();
      return;
    }
  } catch (error) {
    if (managedTask.templatePickerHandoff && !managedTask.cancelRequested && taskId)
      try {
        await operationJournal.record(correlationId, "interrupted", {
          reason: "template_picker_handoff",
          taskId
        }), await updateResumeState({
          status: "interrupted",
          officeStatus: "input_required",
          taskId,
          ...sessionId ? { sessionId } : {},
          templatePicker: managedTask.templatePicker
        }), preserveTask = !0, completed = !0, terminalEventRecorded = !0, !clientClosed && !response.writableEnded && (deliveredResult = await writeSseResultWithDelivery(response, {
          jsonrpc: "2.0",
          id: requestId,
          result: buildTemplatePickerHandoffResult(managedTask.generateInput, correlationId)
        }), response.end());
        return;
      } catch (handoffError) {
        error = handoffError;
      }
    if (error instanceof ResumeStatePersistenceError) {
      let cancellationError2 = managedTask.cancellationError;
      if (taskId && !cancellationError2)
        try {
          await cancelTask();
        } catch (cancelError) {
          cancellationError2 = cancelError;
        }
      completed = !0, preserveTask = !!taskId;
      let failure2 = workflowFailure(
        correlationId,
        cancellationError2 || taskId ? "resume_state_persistence_cancellation_unconfirmed" : "resume_state_persistence_failed",
        cancellationError2 || taskId ? `PowerPoint recovery state could not be persisted and task cancellation was not confirmed: ${cancellationError2 instanceof Error ? cancellationError2.message : error.message}` : "The Office task was cancelled because PowerPoint recovery state could not be persisted.",
        cancellationError2 || taskId ? "interrupted" : "failed"
      );
      terminalEventRecorded || (terminalEventRecorded = !0, await operationJournal.record(correlationId, failure2.status, {
        error: failure2.error,
        ...taskId ? { taskId } : {},
        ...sessionId ? { sessionId } : {}
      })), !clientClosed && !response.writableEnded && (writeSseMessage(response, {
        jsonrpc: "2.0",
        id: requestId,
        error: {
          code: -32e3,
          message: failure2.error.message,
          data: {
            ...failure2,
            ...taskId ? { taskId } : {}
          }
        }
      }), response.end());
      return;
    }
    if (managedTask.cancelRequested) {
      completed = !0, await finalizeCancellation(), response.writableEnded || response.end();
      return;
    }
    if (taskId) {
      preserveTask = !0, completed = !0;
      let reauthenticationRequired = requiresOfficeReauthentication(error), failure2 = workflowFailure(
        correlationId,
        reauthenticationRequired ? "office_task_reauthentication_required" : "office_task_interrupted",
        reauthenticationRequired ? `Office authorization expired while observing the task. The task was preserved; call resume_powerpoint_operation with correlationId '${correlationId}' after reauthentication.` : clientClosed ? "The Copilot client disconnected. The Office task was preserved and can be resumed." : `Office task observation was interrupted: ${error instanceof Error ? error.message : String(error)}`,
        "interrupted"
      );
      terminalEventRecorded || (terminalEventRecorded = !0, await operationJournal.record(correlationId, "interrupted", {
        error: failure2.error
      }));
      try {
        await updateResumeState({
          status: "interrupted",
          officeStatus: status,
          taskId,
          ...sessionId ? { sessionId } : {}
        });
      } catch {
        failure2.error.message += " The updated recovery state could not be persisted.";
      }
      clientClosed || (writeSseMessage(response, {
        jsonrpc: "2.0",
        id: requestId,
        error: {
          code: -32e3,
          message: failure2.error.message,
          data: failure2
        }
      }), response.end());
      return;
    }
    let cancellationError;
    try {
      await cancelTask();
    } catch (cancelError) {
      cancellationError = cancelError;
    }
    let failure = workflowFailure(
      correlationId,
      "office_task_runtime_failed",
      cancellationError ? `${error instanceof Error ? error.message : String(error)} Cancellation was not confirmed: ${cancellationError instanceof Error ? cancellationError.message : String(cancellationError)}` : error instanceof Error ? error.message : String(error)
    );
    terminalEventRecorded || (terminalEventRecorded = !0, await operationJournal.record(correlationId, "failed", {
      error: failure.error
    })), clientClosed || (completed = !0, writeSseMessage(response, {
      jsonrpc: "2.0",
      id: requestId,
      error: {
        code: -32e3,
        message: failure.error.message,
        data: failure
      }
    }), response.end());
  } finally {
    for (let [id, pending] of pendingServerRequests)
      pending.managedTask === managedTask && (pendingServerRequests.delete(id), pending.reject?.(new Error("Managed Office task ended before elicitation completed")));
    if (!deliveredResult && taskId && !preserveTask && !terminalEventRecorded)
      try {
        await cancelTask();
      } catch (error) {
        await operationJournal.record(correlationId, "failed", {
          error: {
            code: "cancellation_unconfirmed",
            message: error instanceof Error ? error.message : String(error)
          }
        });
      }
  }
}
function logTaskNegotiation(requestBody, responseBody) {
  try {
    let parsedRequest = JSON.parse(requestBody.toString("utf8")), requests = Array.isArray(parsedRequest) ? parsedRequest : [parsedRequest], responseText = responseBody.toString("utf8"), parsedResponses;
    try {
      let parsedResponse = JSON.parse(responseText);
      parsedResponses = Array.isArray(parsedResponse) ? parsedResponse : [parsedResponse];
    } catch {
      parsedResponses = responseText.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => JSON.parse(line.slice(5).trim()));
    }
    for (let request of requests) {
      let upstreamResponse = parsedResponses.find((candidate) => candidate?.id === request?.id);
      if (request?.method === "initialize")
        console.error("[powerpoint-copilot] Office MCP task capabilities:", JSON.stringify(
          upstreamResponse?.result?.capabilities?.tasks ?? null
        ));
      else if (request?.method === "tools/list") {
        let tools = upstreamResponse?.result?.tools, taskSupport = Array.isArray(tools) ? Object.fromEntries(tools.map((tool) => [
          tool?.name,
          tool?.execution?.taskSupport ?? null
        ])) : {};
        console.error("[powerpoint-copilot] Office MCP tool task support:", JSON.stringify(taskSupport));
      }
    }
  } catch {
  }
}
async function startOfficeTaskProxy({
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  upstreamUrl = DEFAULT_UPSTREAM_URL,
  fetchImpl = fetch,
  sleepImpl = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  taskTimeoutMs = TASK_TIMEOUT_MS,
  taskAuthBufferMs = DEFAULT_TASK_AUTH_BUFFER_MS,
  minimumPollMs = MIN_TASK_POLL_MS,
  maximumPollMs = MAX_TASK_POLL_MS,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
  primusViewerHost = createPrimusViewerHost({ fetchImpl }),
  controlCapability = String(randomUUID7()),
  allowTestUpstream = !1,
  operationJournal = void 0,
  operationResumeStore = void 0,
  upstreamFetchImpl = fetchImpl,
  renewableOfficeAuthorization = !1,
  officeAuthorizationProvider = void 0,
  authController = void 0,
  requireMcpCapability = !0,
  runtimeProfile = "production",
  elicitationResponseTransformer = void 0,
  maxActiveManagedTasks = MAX_ACTIVE_MANAGED_TASKS,
  maxConnections = 32,
  elicitationWaitMs = DEFAULT_ELICITATION_WAIT_MS,
  sseKeepAliveMs = DEFAULT_SSE_KEEPALIVE_MS,
  conversationProvider = void 0,
  conversationHandoffTimeoutMs = CONVERSATION_HANDOFF_TIMEOUT_MS,
  transformToolCallMeta = void 0,
  // A build profile may add an Office MCP upstream to the allowlist and headers for its requests
  // (the eval profile's local AugLoop); production supplies neither.
  profileUpstreamUrls = [],
  upstreamHeaders = {},
  // Enables local presentation uploads, which Office stores through `upload_artifact` using the
  // runtime's own Office authorization (`upstreamFetchImpl`).
  presentationUploads = void 0
} = {}) {
  if (assertLoopbackBind(host), officeAuthorizationProvider && !requireMcpCapability)
    throw new Error("Runtime-owned Office authentication requires capability-protected MCP.");
  if (!Number.isSafeInteger(maxActiveManagedTasks) || maxActiveManagedTasks < 1)
    throw new RangeError("maxActiveManagedTasks must be a positive integer.");
  if (!Number.isSafeInteger(maxConnections) || maxConnections < 1)
    throw new RangeError("maxConnections must be a positive integer.");
  let upstream = new URL(upstreamUrl), activeManagedTasks = /* @__PURE__ */ new Map(), activeCorrelationIds = /* @__PURE__ */ new Set(), pendingServerRequests = /* @__PURE__ */ new Map(), dismissedServerRequests = /* @__PURE__ */ new Map(), shuttingDown2 = !1, externalAuthOwner = officeAuthorizationProvider && requireMcpCapability && controlCapability ? createHash4("sha256").update(`runtime\0${controlCapability}`, "utf8").digest("hex") : void 0, operationOwner = (authorizationHeader) => authController ? accountOwnerHash(authController.status().account) : bearerPrincipalHash(authorizationHeader) ?? externalAuthOwner, activeHandlers = /* @__PURE__ */ new Set(), requestAccountUses = /* @__PURE__ */ new WeakMap();
  operationJournal ??= createOperationJournal(), operationResumeStore ??= createOperationResumeStore();
  let cardHtml = await readFile5(POWERPOINT_CARD_PATH, "utf8"), activeRequests = 0, idleTimer, lastActivityAt = Date.now(), isExplicitTestUpstream = allowTestUpstream && upstream.protocol === "http:" && upstream.hostname === "127.0.0.1";
  if (!ALLOWED_UPSTREAM_URLS.has(upstream.toString()) && !profileUpstreamUrls.includes(upstream.toString()) && !isExplicitTestUpstream)
    throw new Error(
      `Office task proxy upstream is not allowlisted: ${upstream.toString()}`
    );
  let presentationUploader = presentationUploads ? createPresentationUploader({
    ...presentationUploads,
    maxBytes: presentationUploads.maxBytes ?? MAX_UPLOAD_BYTES,
    callUploadTool: (args, { requestId, signal }) => callOfficeUploadTool({
      upstream,
      fetchImpl: upstreamFetchImpl,
      upstreamHeaders,
      args,
      requestId,
      signal
    }),
    ...authController ? { beginAccountUse: () => authController.beginUse() } : {}
  }) : void 0;
  await operationJournal.initialize(), await operationResumeStore.initialize(), await authController?.initialize();
  let validateRecoveryTaskAccess = async (managedTask, requestHeaders) => {
    if (managedTask?.endpoint !== RECOVERY_MCP_PATH || !managedTask.taskId)
      throw new Error("The recovery task is not available for authorization validation.");
    let validated = await upstreamRpc({
      upstream,
      baseHeaders: requestHeaders,
      fetchImpl: upstreamFetchImpl,
      method: "tasks/get",
      params: { taskId: managedTask.taskId },
      sessionId: managedTask.sessionId
    });
    if (validated.message?.error)
      throw new Error(
        validated.message.error.message ?? "Office MCP rejected recovery task access."
      );
  };
  async function handleRequest(request, response) {
    activeRequests += 1, lastActivityAt = Date.now();
    let released = !1, releaseRequest = () => {
      released || (released = !0, activeRequests -= 1, lastActivityAt = Date.now(), scheduleIdleShutdown());
    };
    response.once("finish", releaseRequest), response.once("close", releaseRequest);
    let requestUrl = localRequestUrl(request, response);
    if (!requestUrl) return;
    if (requestUrl.pathname === LEGACY_RECOVERY_MCP_PATH ? requestUrl.pathname = RECOVERY_MCP_PATH : requestUrl.pathname === LEGACY_RECOVERY_OAUTH_RESOURCE_METADATA_PATH ? requestUrl.pathname = RECOVERY_OAUTH_RESOURCE_METADATA_PATH : requestUrl.pathname === LEGACY_UI_MCP_PATH && (requestUrl.pathname = UI_MCP_PATH), (requestUrl.pathname === "/health" || requestUrl.pathname.startsWith("/viewer/sessions") || requestUrl.pathname === PRESENTATION_UPLOAD_PATH || requestUrl.pathname.startsWith(AUTH_CONTROL_PREFIX) || [
      "/mcp",
      RECOVERY_MCP_PATH,
      UI_MCP_PATH,
      OAUTH_RESOURCE_METADATA_PATH,
      RECOVERY_OAUTH_RESOURCE_METADATA_PATH
    ].includes(requestUrl.pathname)) && !hasRuntimeCapability(request, controlCapability)) {
      writeJsonError(response, 401, "Runtime capability required");
      return;
    }
    if (request.method === "POST" && ["/mcp", RECOVERY_MCP_PATH, UI_MCP_PATH].includes(requestUrl.pathname) && !requireJsonRequest(request, response))
      return;
    try {
      await authController?.refresh();
    } catch (error) {
      writeOfficeAuthenticationError(response, error);
      return;
    }
    if (response.setHeader(AUTH_GENERATION_HEADER, String(authController?.status().generation ?? 0)), response.setHeader(AUTH_GENERATION_GUARD_HEADER, "1"), authController && ["/mcp", RECOVERY_MCP_PATH, UI_MCP_PATH].includes(requestUrl.pathname) && request.headers[AUTH_GENERATION_HEADER] !== String(authController.status().generation)) {
      writeJson2(response, 409, {
        code: "account_generation_changed",
        error: "PowerPoint account generation is missing or changed before dispatch. The request was not sent to Office. Reinitialize the MCP session before retrying."
      });
      return;
    }
    if (authController && ["/mcp", RECOVERY_MCP_PATH, UI_MCP_PATH].includes(requestUrl.pathname)) {
      let use;
      try {
        use = authController.beginUse({ publish: !1 });
      } catch (error) {
        writeOfficeAuthenticationError(response, error);
        return;
      }
      requestAccountUses.set(request, use);
      try {
        await use;
      } catch (error) {
        writeOfficeAuthenticationError(response, error);
        return;
      }
    }
    if (await handleAuthControl({
      request,
      response,
      url: requestUrl,
      auth: authController,
      busy: () => activeHandlers.size > 1 || activeManagedTasks.size > 0 || pendingServerRequests.size > 0 || presentationUploader?.hasActiveReports() === !0,
      invalidateViewers: () => primusViewerHost.resetAuthSessions?.()
    })) return;
    if (authController && requestUrl.pathname === PRESENTATION_UPLOAD_PATH) {
      let auth = authController.status();
      if (!auth.account || auth.state === "connecting") {
        let error = new AuthError(
          auth.account ? "auth_busy" : "not_connected",
          auth.account ? "PowerPoint account selection is changing." : "Connect your PowerPoint account before using presentations."
        );
        writeJson2(response, authHttpStatus(error), authErrorBody(error));
        return;
      }
    }
    let admittedBody;
    if (request.method === "POST" && ["/mcp", RECOVERY_MCP_PATH].includes(requestUrl.pathname))
      try {
        if (admittedBody = await readRequestBody(request), !isJsonRpcPayload(JSON.parse(admittedBody.toString("utf8")))) {
          writeJsonError(response, 400, "Invalid JSON-RPC request.");
          return;
        }
      } catch (error) {
        writeJsonError(
          response,
          error instanceof RangeError ? 413 : 400,
          error instanceof RangeError ? error.message : "Invalid JSON-RPC request."
        );
        return;
      }
    let officeAuthFailure;
    if (officeAuthorizationProvider && ["/mcp", RECOVERY_MCP_PATH].includes(requestUrl.pathname))
      try {
        let token = await officeAuthorizationProvider();
        request.headers.authorization = ["Bearer", token].join(" ");
      } catch (error) {
        if (request.method !== "POST") {
          writeOfficeAuthenticationError(response, error);
          return;
        }
        officeAuthFailure = { error };
      }
    if (!await presentationUploader?.handleRequest(request, response, requestUrl) && !await primusViewerHost.handleRequest(request, response, requestUrl)) {
      if (request.method === "GET" && requestUrl.pathname === "/health") {
        response.statusCode = 204, response.setHeader("x-powerpoint-copilot-proxy", "1"), response.setHeader(UPLOAD_LIMIT_HEADER, String(presentationUploader?.maxBytes ?? 0)), response.setHeader("x-powerpoint-runtime-version", String(RUNTIME_PROTOCOL_VERSION)), response.setHeader("x-powerpoint-runtime-profile", runtimeProfile), response.setHeader(
          "x-powerpoint-max-active-operations",
          String(maxActiveManagedTasks)
        ), response.setHeader(
          "x-powerpoint-active-operations",
          String(activeManagedTasks.size)
        ), response.setHeader(
          "x-powerpoint-max-connections",
          String(maxConnections)
        ), response.setHeader(
          "x-powerpoint-renewable-office-auth",
          renewableOfficeAuthorization ? "1" : "0"
        ), response.end();
        return;
      }
      try {
        if (await handlePowerPointUiMcpRequest({
          request,
          response,
          requestUrl,
          cardHtml,
          controlCapability,
          primusViewerHost
        }))
          return;
      } catch (error) {
        error instanceof RangeError ? writeJsonError(response, 413, error.message) : writeJsonError(
          response,
          500,
          error instanceof Error ? error.message : String(error)
        );
        return;
      }
      if (request.method === "GET" && [
        OAUTH_RESOURCE_METADATA_PATH,
        RECOVERY_OAUTH_RESOURCE_METADATA_PATH
      ].includes(requestUrl.pathname)) {
        try {
          let metadataUrl = new URL(
            `/.well-known/oauth-protected-resource${upstream.pathname}`,
            upstream.origin
          ), upstreamResponse = await fetchImpl(metadataUrl, {
            headers: { accept: "application/json" },
            redirect: "manual"
          }), metadata = await upstreamResponse.json();
          metadata.resource = requestUrl.pathname === RECOVERY_OAUTH_RESOURCE_METADATA_PATH ? `${requestUrl.origin}${RECOVERY_MCP_PATH}` : `${requestUrl.origin}/mcp`, response.statusCode = upstreamResponse.status, copyResponseHeaders(upstreamResponse, response, requestUrl.origin), response.setHeader("content-type", "application/json"), response.end(JSON.stringify(metadata));
        } catch (error) {
          writeJsonError(
            response,
            502,
            error instanceof Error ? error.message : String(error)
          );
        }
        return;
      }
      if (!["/mcp", RECOVERY_MCP_PATH].includes(requestUrl.pathname) || !["POST", "GET", "DELETE"].includes(request.method ?? "")) {
        writeJsonError(response, 404, "Not found");
        return;
      }
      if (request.method === "GET") {
        response.statusCode = 405, response.setHeader("allow", "POST, DELETE"), response.end();
        return;
      }
      try {
        let rawBody = admittedBody ?? await readRequestBody(request), body = augmentPowerPointToolCallRequest(
          augmentInitializeRequest(rawBody),
          transformToolCallMeta
        ), headers = forwardedRequestHeaders(request.headers, body.length, upstreamHeaders), parsedMessage;
        try {
          parsedMessage = JSON.parse(body.toString("utf8"));
        } catch {
          parsedMessage = null;
        }
        if (officeAuthFailure) {
          if (!Array.isArray(parsedMessage) && parsedMessage?.method === void 0 && parsedMessage?.id !== void 0) {
            let match = [...pendingServerRequests.entries()].find(([, candidate]) => !candidate.forwarding && matchesPendingClientResponse(
              candidate,
              parsedMessage,
              request.headers["mcp-session-id"],
              requestUrl.pathname
            ));
            match && rejectPendingResponse(pendingServerRequests, match[0], match[1], officeAuthFailure.error);
          }
          writeOfficeAuthenticationError(response, officeAuthFailure.error);
          return;
        }
        if (requestUrl.pathname === RECOVERY_MCP_PATH) {
          if (request.method === "DELETE") {
            response.statusCode = 202, response.end();
            return;
          }
          if (parsedMessage?.method === "notifications/initialized") {
            response.statusCode = 202, response.end();
            return;
          }
          if (parsedMessage?.method === "initialize") {
            writeRpcResult(response, parsedMessage.id, {
              protocolVersion: MCP_PROTOCOL_VERSION,
              capabilities: { tools: {} },
              serverInfo: {
                name: "powerpoint-copilot-recovery",
                version: "0.1.0"
              }
            });
            return;
          }
          if (parsedMessage?.method === "ping") {
            writeRpcResult(response, parsedMessage.id, {});
            return;
          }
          if (parsedMessage?.method === "tools/list") {
            writeRpcResult(response, parsedMessage.id, {
              tools: [{
                name: RESUME_POWERPOINT_TOOL,
                title: "Resume PowerPoint operation",
                description: "Reconnect to a previously interrupted PowerPoint operation without submitting the mutation again.",
                inputSchema: {
                  type: "object",
                  properties: {
                    correlationId: {
                      type: "string",
                      description: "Correlation ID returned by the interrupted operation."
                    },
                    templateId: {
                      type: "string",
                      minLength: 1,
                      maxLength: 16384,
                      description: "Confirmed organization template ID used to answer the existing operation's template question."
                    },
                    skipTemplateSelection: {
                      type: "boolean",
                      description: "Continue the existing operation without an organization template after explicit Skip. Do not supply templateId."
                    }
                  },
                  required: ["correlationId"],
                  additionalProperties: !1
                }
              }]
            });
            return;
          }
          let isContinuationResponse = parsedMessage?.method === void 0 && parsedMessage?.id !== void 0, isCancellation = parsedMessage?.method === "notifications/cancelled", isResumeCall = parsedMessage?.method === "tools/call" && parsedMessage?.params?.name === RESUME_POWERPOINT_TOOL;
          if (!isContinuationResponse && !isCancellation && !isResumeCall) {
            writeRpcError(
              response,
              parsedMessage?.id,
              `Method not found: ${parsedMessage?.method}`
            );
            return;
          }
          if (!requireRecoveryAuthorization(
            request,
            response,
            requestUrl.origin
          ))
            return;
        }
        if (request.method === "POST" && !Array.isArray(parsedMessage) && parsedMessage?.method === void 0 && parsedMessage?.id !== void 0) {
          let requestedPendingKey = pendingServerRequestKey(
            parsedMessage.id,
            request.headers["mcp-session-id"],
            requestUrl.pathname
          );
          if (dismissedServerRequests.has(requestedPendingKey)) {
            writeRpcError(
              response,
              parsedMessage.id,
              "This question was dismissed because Office stopped waiting for an answer. Resume the PowerPoint operation to answer it again."
            );
            return;
          }
          let continuationOwnerHash = requestUrl.pathname === RECOVERY_MCP_PATH ? operationOwner(request.headers.authorization) : void 0, matchesPending = (candidate) => matchesPendingClientResponse(candidate, parsedMessage, request.headers["mcp-session-id"], requestUrl.pathname) && (requestUrl.pathname !== RECOVERY_MCP_PATH || candidate.managedTask?.ownerHash === continuationOwnerHash), directPending = pendingServerRequests.get(
            requestedPendingKey
          ), matchedPending = directPending && matchesPending(directPending) ? [
            requestedPendingKey,
            directPending
          ] : [...pendingServerRequests.entries()].find(
            ([, candidate]) => matchesPending(candidate)
          ), pendingKey = matchedPending?.[0], pending = matchedPending?.[1];
          if (pending) {
            if (requestUrl.pathname === RECOVERY_MCP_PATH)
              try {
                await validateRecoveryTaskAccess(
                  pending.managedTask,
                  headers
                );
              } catch (error) {
                rejectPendingResponse(pendingServerRequests, pendingKey, pending, error), requiresOfficeReauthentication(error) ? writeRecoveryAuthorizationChallenge(
                  response,
                  requestUrl.origin
                ) : writeRpcError(
                  response,
                  parsedMessage.id,
                  `Office rejected recovery control authorization: ${error instanceof Error ? error.message : String(error)}`
                );
                return;
              }
            if (pending.forwarding) {
              writeRpcError(
                response,
                parsedMessage.id,
                "This elicitation response is already being forwarded."
              );
              return;
            }
            pending.forwarding = !0;
            try {
              await pending.awaitUpstream?.();
            } catch (error) {
              writeRpcError(
                response,
                parsedMessage.id,
                `This question is no longer open: ${error instanceof Error ? error.message : String(error)}`
              );
              return;
            }
            if (isOrgTemplateSelection(parsedMessage)) {
              pending.managedTask.templatePicker = {
                questionKey: templateQuestionKey(pending.serverRequestParams),
                choices: containerTemplateChoices(pending.serverRequestParams)
              }, pending.managedTask.templatePickerHandoff = !0, pendingServerRequests.delete(pendingKey), pending.reject(new TemplatePickerHandoff()), response.statusCode = 202, response.end();
              return;
            }
            pending.posting = !0;
            let transformed = elicitationResponseTransformer?.({
              message: parsedMessage,
              serverMethod: pending.serverMethod,
              serverRequestParams: pending.serverRequestParams,
              attempt: pending.managedTask.elicitationTransformCount ?? 0
            });
            transformed && (pending.managedTask.elicitationTransformCount = transformed.attempt);
            let forwardedMessage = transformed?.message ?? parsedMessage;
            await operationJournal.record(
              pending.managedTask.correlationId,
              "elicitation",
              {
                taskId: pending.managedTask.taskId,
                upstreamRequestId: String(pending.upstreamRequestId),
                phase: "response",
                clientRequestId: parsedMessage.id,
                responseAction: forwardedMessage.result?.action,
                responseError: parsedMessage.error,
                ...transformed?.metadata ?? {}
              }
            );
            let upstreamBody = pending.upstreamRequestId === forwardedMessage.id && forwardedMessage === parsedMessage ? body : Buffer.from(JSON.stringify({
              ...forwardedMessage,
              id: pending.upstreamRequestId
            })), responseHeaders = new Headers(pending.baseHeaders);
            responseHeaders.set("content-length", String(upstreamBody.length)), pending.sessionId && responseHeaders.set("mcp-session-id", pending.sessionId);
            try {
              let upstreamResponse2 = await upstreamFetchImpl(pending.upstream, {
                method: "POST",
                headers: responseHeaders,
                body: upstreamBody,
                redirect: "manual"
              });
              pendingServerRequests.delete(pendingKey);
              let continuationMessages = await readRpcResponseMessages(upstreamResponse2);
              if (pending.managedTask?.cancelRequested) {
                let continuationTaskIds = continuationMessages.map((message) => message?.result?.task?.taskId).filter((taskId) => typeof taskId == "string"), continuationSessionId = upstreamResponse2.headers.get(
                  "mcp-session-id"
                ) ?? pending.sessionId;
                for (let continuationTaskId of continuationTaskIds)
                  try {
                    let cancelled = await upstreamRpc({
                      upstream: pending.upstream,
                      baseHeaders: pending.baseHeaders,
                      fetchImpl: upstreamFetchImpl,
                      method: "tasks/cancel",
                      params: { taskId: continuationTaskId },
                      sessionId: continuationSessionId
                    });
                    if (cancelled.message?.error)
                      throw new Error(
                        cancelled.message.error.message ?? "Office MCP tasks/cancel failed."
                      );
                    if (cancelled.message?.result?.taskId !== continuationTaskId || cancelled.message?.result?.status !== "cancelled")
                      throw new Error(
                        "Office MCP did not confirm the continuation task as cancelled."
                      );
                    pending.managedTask.cancelConfirmed = !0;
                  } catch (error) {
                    pending.managedTask.cancellationError = error;
                  }
                pending.reject(
                  new Error("The Copilot client cancelled during elicitation.")
                ), response.statusCode = 202, response.end();
                return;
              }
              pending.deliveredMessage = forwardedMessage, pending.resolve(continuationMessages), response.statusCode = 202, response.end();
            } catch (error) {
              rejectPendingResponse(pendingServerRequests, pendingKey, pending, error), writeRpcError(
                response,
                parsedMessage.id,
                error instanceof Error ? error.message : String(error)
              );
            }
            return;
          } else {
            if ([...pendingServerRequests.values()].some(
              (candidate) => candidate.requestId === String(parsedMessage.id) && candidate.managedTask?.endpoint !== requestUrl.pathname
            )) {
              writeRpcError(
                response,
                parsedMessage.id,
                "The elicitation response belongs to a different MCP endpoint."
              );
              return;
            }
            if ([...pendingServerRequests.values()].some(
              (candidate) => candidate.requestId === String(parsedMessage.id) && candidate.managedTask?.endpoint === requestUrl.pathname && (requestUrl.pathname !== RECOVERY_MCP_PATH || candidate.managedTask?.ownerHash === continuationOwnerHash)
            )) {
              writeRpcError(
                response,
                parsedMessage.id,
                "The elicitation response MCP session does not match its request."
              );
              return;
            }
          }
        }
        if (request.method === "POST" && requestUrl.pathname === RECOVERY_MCP_PATH && !Array.isArray(parsedMessage) && parsedMessage?.method === "tools/call" && parsedMessage?.params?.name === RESUME_POWERPOINT_TOOL && parsedMessage.id !== void 0) {
          if (!renewableOfficeAuthorization && !requireFreshTaskAuthorization(
            request,
            response,
            requestUrl.origin,
            taskTimeoutMs + taskAuthBufferMs,
            RECOVERY_OAUTH_RESOURCE_METADATA_PATH
          ))
            return;
          let correlationId = parsedMessage.params?.arguments?.correlationId;
          if (typeof correlationId != "string" || !correlationId.trim() || correlationId.length > 128) {
            writeRpcError(
              response,
              parsedMessage.id,
              "correlationId must be a non-empty string of at most 128 characters."
            );
            return;
          }
          let ownerHash = operationOwner(request.headers.authorization), pickedTemplateId = parsedMessage.params?.arguments?.templateId, skipTemplateSelection = parsedMessage.params?.arguments?.skipTemplateSelection;
          if (skipTemplateSelection !== void 0 && typeof skipTemplateSelection != "boolean" || skipTemplateSelection === !0 && pickedTemplateId !== void 0) {
            writeRpcError(response, parsedMessage.id, "skipTemplateSelection must be a boolean and cannot be combined with templateId.");
            return;
          }
          if (pickedTemplateId !== void 0 && (typeof pickedTemplateId != "string" || pickedTemplateId.length === 0 || pickedTemplateId.length > 16384)) {
            writeRpcError(response, parsedMessage.id, "templateId must be a non-empty string of at most 16384 characters.");
            return;
          }
          let resumeRecord = await operationResumeStore.get(
            correlationId.trim()
          );
          if (!resumeRecord) {
            writeRpcError(
              response,
              parsedMessage.id,
              `No resumable PowerPoint operation was found for ${correlationId.trim()}. It may have expired.`
            );
            return;
          }
          if (!ownerHash || ownerHash !== resumeRecord.ownerHash) {
            writeRpcError(
              response,
              parsedMessage.id,
              "The authenticated Office account does not own this PowerPoint operation."
            );
            return;
          }
          if (pickedTemplateId !== void 0 || skipTemplateSelection === !0) {
            if (!resumeRecord.templatePicker) {
              writeRpcError(response, parsedMessage.id, "This operation has no saved template question. Resume it without a template choice to recover its question.");
              return;
            }
            try {
              if (skipTemplateSelection === !0 && resumeRecord.templatePicker.pickerInstanceId && resumeRecord.templatePicker.recordedChoice?.skipped !== !0)
                throw new Error("Record Skip in the picker before resuming this operation.");
              pickedTemplateId !== void 0 && (pickedTemplateId = resolveContainerTemplateId(resumeRecord, pickedTemplateId));
            } catch (error) {
              writeRpcError(response, parsedMessage.id, error instanceof Error ? error.message : String(error));
              return;
            }
          }
          if (resumeRecord.status !== "completed")
            try {
              let validated = await upstreamRpc({
                upstream,
                baseHeaders: headers,
                fetchImpl: upstreamFetchImpl,
                method: "tasks/get",
                params: { taskId: resumeRecord.taskId },
                sessionId: resumeRecord.sessionId
              });
              if (validated.message?.error)
                throw new Error(
                  validated.message.error.message ?? "Office MCP rejected recovery task access."
                );
              resumeRecord.sessionId = validated.sessionId, resumeRecord.officeStatus = validated.message?.result?.status ?? resumeRecord.officeStatus, resumeRecord.statusMessage = validated.message?.result?.statusMessage ?? resumeRecord.statusMessage;
            } catch (error) {
              requiresOfficeReauthentication(error) ? writeRecoveryAuthorizationChallenge(
                response,
                requestUrl.origin
              ) : writeRpcError(
                response,
                parsedMessage.id,
                `Office rejected recovery authorization: ${error instanceof Error ? error.message : String(error)}`
              );
              return;
            }
          if (resumeRecord.status === "completed" && resumeRecord.result) {
            try {
              let validated = await upstreamRpc({
                upstream,
                baseHeaders: headers,
                fetchImpl: upstreamFetchImpl,
                method: "tasks/get",
                params: { taskId: resumeRecord.taskId },
                sessionId: resumeRecord.sessionId
              });
              if (validated.message?.error)
                throw new Error(
                  validated.message.error.message ?? "Office MCP rejected the cached task."
                );
              if (validated.message?.result?.status !== "completed")
                throw new Error(
                  "Office MCP no longer reports the cached task as completed."
                );
            } catch (error) {
              writeRpcError(
                response,
                parsedMessage.id,
                `The cached PowerPoint result could not be revalidated: ${error instanceof Error ? error.message : String(error)}`
              );
              return;
            }
            await writeRpcResultWithDelivery(
              response,
              parsedMessage.id,
              resumeRecord.result
            ) && await operationResumeStore.remove(
              resumeRecord.correlationId
            );
            return;
          }
          if (activeManagedTasks.size >= maxActiveManagedTasks) {
            writeRpcError(
              response,
              parsedMessage.id,
              `The PowerPoint runtime already has ${maxActiveManagedTasks} active operations.`
            );
            return;
          }
          let requestKey = managedRequestKey(
            parsedMessage.id,
            request.headers["mcp-session-id"],
            requestUrl.pathname
          ), managedTask = {
            cancelConfirmed: !1,
            cancelPromise: void 0,
            cancelRequested: !1,
            cancelTask: async () => {
            },
            correlationId: void 0,
            requestId: parsedMessage.id,
            clientSessionId: request.headers["mcp-session-id"],
            endpoint: requestUrl.pathname,
            ownerHash,
            pickedTemplateId: resumeRecord.templatePicker?.answerAccepted ? void 0 : pickedTemplateId,
            skipTemplateSelection: !resumeRecord.templatePicker?.answerAccepted && skipTemplateSelection
          };
          if (activeManagedTasks.has(requestKey)) {
            writeRpcError(
              response,
              parsedMessage.id,
              "A PowerPoint recovery operation with this MCP request ID is already active."
            );
            return;
          }
          activeManagedTasks.set(requestKey, managedTask);
          try {
            await runManagedTaskCall({
              message: parsedMessage,
              response,
              upstream,
              baseHeaders: headers,
              fetchImpl: upstreamFetchImpl,
              initialSessionId: request.headers["mcp-session-id"],
              sleepImpl,
              taskTimeoutMs,
              minimumPollMs,
              maximumPollMs,
              localOrigin: requestUrl.origin,
              pendingServerRequests,
              operationJournal,
              resumeStore: operationResumeStore,
              managedTask,
              activeCorrelationIds,
              elicitationResponseTransformer,
              elicitationWaitMs,
              dismissedServerRequests,
              isShuttingDown: () => shuttingDown2,
              sseKeepAliveMs,
              operationOwner,
              resumeRecord
            });
          } finally {
            activeManagedTasks.get(requestKey) === managedTask && activeManagedTasks.delete(requestKey), managedTask.correlationId && activeCorrelationIds.delete(managedTask.correlationId);
          }
          return;
        }
        if (request.method === "POST" && !Array.isArray(parsedMessage) && parsedMessage?.method === "notifications/cancelled") {
          let cancelledRequestId = parsedMessage?.params?.requestId, cancellationSessionId = request.headers["mcp-session-id"], activeTask = activeManagedTasks.get(
            managedRequestKey(
              cancelledRequestId,
              cancellationSessionId,
              requestUrl.pathname
            )
          ) ?? [...activeManagedTasks.values()].find(
            (candidate) => String(candidate.requestId) === String(cancelledRequestId) && candidate.endpoint === requestUrl.pathname && (candidate.clientSessionId === cancellationSessionId || candidate.sessionId === cancellationSessionId)
          ), cancellationOwnerHash = requestUrl.pathname === RECOVERY_MCP_PATH ? operationOwner(request.headers.authorization) : void 0;
          if (activeTask && activeTask.endpoint === requestUrl.pathname && (requestUrl.pathname !== RECOVERY_MCP_PATH || activeTask.ownerHash === cancellationOwnerHash)) {
            if (requestUrl.pathname === RECOVERY_MCP_PATH)
              try {
                await validateRecoveryTaskAccess(
                  activeTask,
                  headers
                );
              } catch (error) {
                requiresOfficeReauthentication(error) ? writeRecoveryAuthorizationChallenge(
                  response,
                  requestUrl.origin
                ) : writeJsonError(
                  response,
                  403,
                  `Office rejected recovery cancellation authorization: ${error instanceof Error ? error.message : String(error)}`
                );
                return;
              }
            activeTask.cancelRequested = !0;
            try {
              await activeTask.cancelTask();
            } catch (error) {
              activeTask.cancellationError = error;
            }
            for (let [id, pending] of pendingServerRequests)
              pending.managedTask === activeTask && (pendingServerRequests.delete(id), pending.reject?.(
                new Error("The Copilot client cancelled during elicitation.")
              ));
          }
          response.statusCode = 202, response.end();
          return;
        }
        if (request.method === "POST" && !Array.isArray(parsedMessage) && parsedMessage?.method === "tools/call" && POWERPOINT_TASK_TOOLS.has(parsedMessage?.params?.name) && parsedMessage.id !== void 0) {
          if (!renewableOfficeAuthorization && !requireFreshTaskAuthorization(
            request,
            response,
            requestUrl.origin,
            taskTimeoutMs + taskAuthBufferMs
          ))
            return;
          if (activeManagedTasks.size >= maxActiveManagedTasks) {
            writeRpcError(
              response,
              parsedMessage.id,
              `The PowerPoint runtime already has ${maxActiveManagedTasks} active operations.`
            );
            return;
          }
          let requestKey = managedRequestKey(
            parsedMessage.id,
            request.headers["mcp-session-id"],
            requestUrl.pathname
          );
          if (activeManagedTasks.has(requestKey)) {
            writeRpcError(
              response,
              parsedMessage.id,
              "A PowerPoint operation with this MCP request ID is already active."
            );
            return;
          }
          let managedTask = {
            cancelConfirmed: !1,
            cancelPromise: void 0,
            cancelRequested: !1,
            cancelTask: async () => {
            },
            correlationId: void 0,
            requestId: parsedMessage.id,
            clientSessionId: request.headers["mcp-session-id"],
            endpoint: requestUrl.pathname,
            ownerHash: operationOwner(
              request.headers.authorization
            )
          };
          activeManagedTasks.set(requestKey, managedTask);
          try {
            if (conversationProvider && requestUrl.pathname === OFFICE_MCP_PATH) {
              try {
                let handoff = await withTimeout(conversationProvider(), conversationHandoffTimeoutMs);
                addConversationMetadata(parsedMessage, handoff), console.error(`[powerpoint] Conversation handoff: ${handoff?.conversation?.length ?? 0} messages.`);
              } catch (error) {
                console.error("[powerpoint] Conversation handoff unavailable:", error instanceof Error ? error.message : String(error));
              }
              if (shuttingDown2 || response.destroyed || response.writableEnded) {
                writeRpcError(response, parsedMessage.id, "The PowerPoint runtime stopped before the operation was submitted.");
                return;
              }
            }
            await runManagedTaskCall({
              message: parsedMessage,
              response,
              upstream,
              baseHeaders: headers,
              fetchImpl: upstreamFetchImpl,
              initialSessionId: request.headers["mcp-session-id"],
              sleepImpl,
              taskTimeoutMs,
              minimumPollMs,
              maximumPollMs,
              localOrigin: requestUrl.origin,
              pendingServerRequests,
              operationJournal,
              resumeStore: operationResumeStore,
              managedTask,
              activeCorrelationIds,
              elicitationResponseTransformer,
              elicitationWaitMs,
              dismissedServerRequests,
              isShuttingDown: () => shuttingDown2,
              sseKeepAliveMs,
              operationOwner
            });
          } finally {
            activeManagedTasks.get(requestKey) === managedTask && activeManagedTasks.delete(requestKey), managedTask.correlationId && activeCorrelationIds.delete(managedTask.correlationId);
          }
          return;
        }
        let pickerToolNames = /* @__PURE__ */ new Set(["show_template_picker", "record_template_choice"]);
        if (Array.isArray(parsedMessage) && parsedMessage.some((message) => message?.method === "tools/call" && pickerToolNames.has(message.params?.name)))
          throw new Error("Template picker tools must be called individually.");
        if (request.method === "POST" && parsedMessage?.method === "tools/call" && pickerToolNames.has(parsedMessage.params?.name)) {
          let args = parsedMessage.params.arguments, ownerHash = operationOwner(headers.get("authorization")), result;
          if (parsedMessage.params.name === "show_template_picker") {
            let correlationId = args?.correlationId;
            if (typeof correlationId != "string" || !correlationId || correlationId.length > 128)
              throw new Error("Open the picker with the original paused operation's correlationId.");
            if (!await operationResumeStore.update(correlationId, (held) => {
              let offer = buildContainerTemplateOffer(held, correlationId, args, ownerHash);
              return result = offer.result, { templatePicker: offer.templatePicker };
            })) throw new Error("The original template operation is missing or expired.");
          } else {
            if (typeof args?.pickerInstanceId != "string" || !args.pickerInstanceId.startsWith("container:"))
              throw new Error("The template picker must belong to the original paused operation.");
            let entries = await operationResumeStore.snapshot(), held = Object.values(entries).find((entry) => entry.templatePicker?.pickerInstanceId === args?.pickerInstanceId);
            if (!held) throw new Error("The template picker is missing, superseded or expired.");
            if (!await operationResumeStore.update(held.correlationId, (current) => {
              let choice = recordContainerTemplateChoice(current, args, ownerHash);
              return result = choice.result, { templatePicker: choice.templatePicker };
            })) throw new Error("The original template operation is missing or expired.");
          }
          writeRpcResult(response, parsedMessage.id, result);
          return;
        }
        let upstreamResponse = await upstreamFetchImpl(upstream, {
          method: request.method,
          headers,
          body: request.method === "GET" ? void 0 : body,
          redirect: "manual"
        });
        if (request.method === "GET" && upstreamResponse.body) {
          response.statusCode = upstreamResponse.status, copyResponseHeaders(upstreamResponse, response, requestUrl.origin);
          for await (let chunk of upstreamResponse.body)
            response.write(Buffer.from(chunk));
          response.end();
          return;
        }
        response.statusCode = upstreamResponse.status, copyResponseHeaders(upstreamResponse, response, requestUrl.origin);
        let responseBody = Buffer.from(await upstreamResponse.arrayBuffer());
        logTaskNegotiation(body, responseBody);
        let transformedBody = transformRpcResponseBody(body, responseBody);
        response.end(transformedBody);
      } catch (error) {
        if (error instanceof RangeError) {
          writeJsonError(response, 413, error.message);
          return;
        }
        writeJsonError(
          response,
          502,
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  }
  let server = http.createServer((request, response) => {
    let handler = handleRequest(request, response).catch((error) => {
      console.error(error), !response.destroyed && !response.writableEnded && writeJsonError(response, 500, error instanceof Error ? error.message : String(error));
    }).finally(async () => {
      let use = requestAccountUses.get(request);
      requestAccountUses.delete(request), await use?.then((held) => held.release(), () => {
      }), activeHandlers.delete(handler), lastActivityAt = Date.now(), scheduleIdleShutdown();
    });
    activeHandlers.add(handler);
  });
  server.maxConnections = maxConnections, server.headersTimeout = 15e3, server.requestTimeout = Math.max(
    6e4,
    taskTimeoutMs + 6e4
  );
  function scheduleIdleShutdown() {
    if (clearTimeout(idleTimer), !server.listening || !Number.isFinite(idleTimeoutMs) || idleTimeoutMs <= 0)
      return;
    let idleFor = Date.now() - lastActivityAt;
    idleTimer = setTimeout(() => {
      let hasViewerLease = primusViewerHost.hasActiveSessions?.() === !0;
      if (activeRequests > 0 || activeHandlers.size > 0 || activeManagedTasks.size > 0 || pendingServerRequests.size > 0 || presentationUploader?.hasActiveReports() === !0 || hasViewerLease || Date.now() - lastActivityAt < idleTimeoutMs) {
        lastActivityAt = Date.now(), scheduleIdleShutdown();
        return;
      }
      server.close();
    }, Math.max(1, idleTimeoutMs - idleFor)), idleTimer.unref();
  }
  await new Promise((resolve, reject) => {
    let onError = (error) => {
      server.off("listening", onListening), reject(error);
    }, onListening = () => {
      server.off("error", onError), resolve();
    };
    server.once("error", onError), server.once("listening", onListening), server.listen(port, host);
  });
  let address = server.address(), listeningPort = typeof address == "object" && address ? address.port : port, proxyServer = Object.assign(server, {
    operationJournal,
    operationResumeStore,
    runtimeCapability: controlCapability,
    // Stops observing Office tasks so they become resumable by another session.
    async shutdown() {
      shuttingDown2 = !0, presentationUploader?.abortReports();
      for (let [key, pending] of pendingServerRequests)
        pendingServerRequests.delete(key), pending.reject?.(new Error("The PowerPoint runtime stopped while waiting for an answer."));
      await new Promise((resolve) => {
        server.close(() => resolve()), server.closeAllConnections();
      });
    },
    hasActiveOperations() {
      return activeManagedTasks.size > 0 || pendingServerRequests.size > 0 || presentationUploader?.hasActiveReports() === !0;
    },
    invalidateViewerSessions() {
      primusViewerHost.resetAuthSessions?.();
    },
    async waitForActiveOperations() {
      for (; activeHandlers.size > 0 || activeManagedTasks.size > 0 || pendingServerRequests.size > 0 || presentationUploader?.hasActiveReports() === !0; )
        await new Promise((resolve) => setTimeout(resolve, 100));
    },
    async createPowerPointViewerUrl(artifactUrl, title, mode = "view", instanceId) {
      if (shuttingDown2) throw new Error("The PowerPoint runtime is closed.");
      if (await authController?.refresh(), shuttingDown2) throw new Error("The PowerPoint runtime is closed.");
      let auth = authController?.status();
      if (auth && (!auth.account || auth.state === "connecting"))
        throw new AuthError(
          auth.account ? "auth_busy" : "not_connected",
          auth.account ? "PowerPoint account selection is changing." : "Connect your PowerPoint account before using presentations."
        );
      return primusViewerHost.createViewerUrl(
        `http://${host}:${listeningPort}`,
        artifactUrl,
        title,
        mode,
        instanceId
      );
    },
    revokeViewerInstance(instanceId) {
      primusViewerHost.revokeInstance(instanceId);
    }
  });
  return server.once("close", () => {
    clearTimeout(idleTimer), primusViewerHost.resetAuthSessions?.(), presentationUploader?.abortReports();
  }), scheduleIdleShutdown(), proxyServer;
}
var officeTaskProxyDefaults = Object.freeze({
  host: DEFAULT_HOST,
  port: DEFAULT_PORT,
  upstreamUrl: DEFAULT_UPSTREAM_URL,
  protocolVersion: MCP_PROTOCOL_VERSION,
  idleTimeoutMs: DEFAULT_IDLE_TIMEOUT_MS
});

// src/runtime/runtime-host.ts
init_runtime_identity();

// src/runtime/mcp-transport.ts
init_runtime_identity();
import { randomUUID as randomUUID8 } from "node:crypto";

// src/runtime/mcp-routing.ts
var OFFICE_ENDPOINT = "/mcp", RECOVERY_ENDPOINT = "/mcp/recovery", UI_ENDPOINT = "/mcp/ui", MCP_ENDPOINTS = [
  OFFICE_ENDPOINT,
  RECOVERY_ENDPOINT,
  UI_ENDPOINT
], RESUME_TOOL = "resume_powerpoint_operation", CARD_TOOL = "show_presentation_card", CARD_DATA_TOOL = "powerpoint_card_data", CARD_RESOURCE_PREFIX = "ui://powerpoint/";
function messageKey(id) {
  return `${typeof id}:${String(id)}`;
}
function resultFor(messages, id) {
  return messages.find(
    (message) => message?.id === id && (message.result !== void 0 || message.error !== void 0)
  );
}
function createServerRequestRouter() {
  let routes = /* @__PURE__ */ new Map(), forwardedIds = /* @__PURE__ */ new Map(), originalKey = (endpoint, id) => `${endpoint}\0${messageKey(id)}`, nextId = 1;
  return {
    forward(endpoint, message) {
      if (!message?.method || message.id === void 0)
        return message;
      let forwardedId = `powerpoint-server-${nextId++}`;
      return routes.set(messageKey(forwardedId), {
        endpoint,
        originalId: message.id
      }), forwardedIds.set(originalKey(endpoint, message.id), forwardedId), { ...message, id: forwardedId };
    },
    restore(message, defaultEndpoint = OFFICE_ENDPOINT) {
      let key = messageKey(message?.id), route = routes.get(key);
      return routes.delete(key), route && forwardedIds.delete(originalKey(route.endpoint, route.originalId)), {
        endpoint: route?.endpoint ?? defaultEndpoint,
        message: route ? { ...message, id: route.originalId } : message
      };
    },
    // Returns the cancellation renamed to the forwarded id, or undefined when
    // the host was never shown (or already answered) the cancelled request.
    cancelled(endpoint, message) {
      let key = originalKey(endpoint, message?.params?.requestId), forwardedId = forwardedIds.get(key);
      if (forwardedId !== void 0)
        return forwardedIds.delete(key), routes.delete(messageKey(forwardedId)), { ...message, params: { ...message.params, requestId: forwardedId } };
    }
  };
}
function firstErrorOrFallback(message, responses, description) {
  return responses.find((response) => response?.error) ?? {
    jsonrpc: "2.0",
    id: message.id,
    error: {
      code: -32e3,
      message: `No PowerPoint MCP endpoint returned ${description}.`
    }
  };
}
function mergedListResponse(message, responses, property) {
  if (property === "tools") {
    let failed = responses.find(({ response }) => !response?.result || response.error);
    if (failed)
      return firstErrorOrFallback(message, [failed.response], property);
  }
  let successful = responses.filter(({ response }) => response?.result && !response.error);
  if (successful.length === 0)
    return firstErrorOrFallback(
      message,
      responses.map(({ response }) => response),
      property
    );
  let values = successful.flatMap(
    ({ response }) => Array.isArray(response?.result?.[property]) ? response.result[property] : []
  ), cursors = Object.fromEntries(successful.filter(
    ({ response }) => typeof response.result.nextCursor == "string" && response.result.nextCursor
  ).map(({ endpoint, response }) => [
    endpoint,
    response.result.nextCursor
  ])), seen = /* @__PURE__ */ new Set();
  return {
    jsonrpc: "2.0",
    id: message.id,
    result: {
      [property]: values.filter((value) => {
        let key = value?.name ?? value?.uri ?? JSON.stringify(value);
        return seen.has(key) ? !1 : (seen.add(key), !0);
      }),
      ...Object.keys(cursors).length > 0 ? {
        nextCursor: Buffer.from(JSON.stringify({
          version: 1,
          cursors
        })).toString("base64url")
      } : {}
    }
  };
}
function listEndpointRequests(message, endpoints) {
  if (!message.params?.cursor)
    return endpoints.map((endpoint) => ({ endpoint, message }));
  let state;
  try {
    state = JSON.parse(
      Buffer.from(message.params.cursor, "base64url").toString("utf8")
    );
  } catch {
    throw new Error("The PowerPoint MCP pagination cursor is invalid.");
  }
  if (state?.version !== 1 || !state.cursors || typeof state.cursors != "object")
    throw new Error("The PowerPoint MCP pagination cursor is invalid.");
  let allowed = new Set(endpoints), requests = Object.entries(state.cursors).map(([endpoint, cursor]) => {
    if (!allowed.has(endpoint) || typeof cursor != "string" || !cursor)
      throw new Error("The PowerPoint MCP pagination cursor is invalid.");
    return {
      endpoint,
      message: {
        ...message,
        params: {
          ...message.params,
          cursor
        }
      }
    };
  });
  if (requests.length === 0)
    throw new Error("The PowerPoint MCP pagination cursor is invalid.");
  return requests;
}
function mergedInitializeResponse(message, responses) {
  let office = responses.find(({ endpoint }) => endpoint === OFFICE_ENDPOINT)?.response;
  if (!office?.result || office.error)
    return firstErrorOrFallback(message, [office], "Office initialization");
  let failed = responses.find(({ response }) => !response?.result || response.error);
  if (failed)
    return firstErrorOrFallback(message, [failed.response], "initialization");
  let base = office.result, capabilities = {};
  for (let { response } of responses)
    for (let [name, value] of Object.entries(
      response.result.capabilities ?? {}
    ))
      capabilities[name] = value && typeof value == "object" ? { ...capabilities[name] ?? {}, ...value } : value;
  return {
    jsonrpc: "2.0",
    id: message.id,
    result: {
      ...base,
      capabilities,
      serverInfo: {
        name: "powerpoint",
        version: base.serverInfo?.version ?? "1.0.0"
      }
    }
  };
}
function endpointForTool(toolName) {
  return toolName === RESUME_TOOL ? RECOVERY_ENDPOINT : toolName === CARD_TOOL || toolName === CARD_DATA_TOOL ? UI_ENDPOINT : OFFICE_ENDPOINT;
}
function endpointForResource(uri) {
  return typeof uri == "string" && uri.startsWith(CARD_RESOURCE_PREFIX) ? UI_ENDPOINT : OFFICE_ENDPOINT;
}

// src/runtime/mcp-transport.ts
init_auth_contract2();
var SESSION_SAFE_READS = /* @__PURE__ */ new Set(["ping", "tools/list", "resources/list", "resources/templates/list", "resources/read"]), SESSION_RETRYABLE = /* @__PURE__ */ new Set([...SESSION_SAFE_READS, "tools/call"]), OfficeSessionNotFoundError = class extends Error {
  constructor() {
    super("Office MCP rejected its session with HTTP 404. The request was not retried; reinitialize before another operation, or resume a submitted mutation using its correlation ID.");
  }
};
function createMcpTransport({ runtimeClient, readMessages, fetchImpl = fetch }) {
  let initializeParams, generation, closing = !1, controllers = /* @__PURE__ */ new Set();
  async function send(state, endpoint, message, onMessage, signal) {
    let headers = new Headers({
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      [RUNTIME_CAPABILITY_HEADER]: state.runtime.capability
    }), sessionId = state.sessions.get(endpoint);
    state.authGeneration !== void 0 && headers.set(AUTH_GENERATION_HEADER, state.authGeneration), sessionId && headers.set("mcp-session-id", sessionId);
    let response;
    try {
      response = await fetchImpl(`${state.runtime.origin}${endpoint}`, {
        method: "POST",
        headers,
        body: JSON.stringify(message),
        signal,
        redirect: "manual"
      });
    } catch (error) {
      throw new Error(
        "PowerPoint runtime connection failed. The request was not retried; a submitted mutation may still complete. Resume using its correlation ID if available.",
        { cause: error }
      );
    }
    if (endpoint === OFFICE_ENDPOINT && sessionId && response.status === 404)
      throw await response.body?.cancel(), state.sessions.get(endpoint) === sessionId && (state.sessions.delete(endpoint), state.initialized.delete(endpoint)), new OfficeSessionNotFoundError();
    let nextSessionId = response.headers.get("mcp-session-id");
    nextSessionId && state.sessions.get(endpoint) === sessionId && (endpoint !== RECOVERY_ENDPOINT || message.method === "initialize") && state.sessions.set(endpoint, nextSessionId);
    let requiresResult = typeof message.method == "string" && message.id !== void 0, receivedResult = !1, incompleteResponse = (cause) => new Error(
      "PowerPoint runtime response was interrupted or incomplete before a matching JSON-RPC result or error. The request was not retried; a submitted mutation may still complete. Resume using its correlation ID if available.",
      { cause }
    );
    try {
      await readMessages(response, async (reply) => {
        requiresResult && reply?.id === message.id && reply.method === void 0 && (reply.result !== void 0 || reply.error !== void 0) && (receivedResult = !0), await onMessage(reply);
      });
    } catch (error) {
      throw requiresResult && !receivedResult && response.ok ? incompleteResponse(error) : response.ok ? error : new Error(`PowerPoint ${endpoint} ${message.method ?? "server response"}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    if (requiresResult && !receivedResult) throw incompleteResponse();
  }
  async function ensureInitialized(state, endpoint, signal) {
    if (!initializeParams || state.initialized.has(endpoint)) return;
    let pending = state.initializing.get(endpoint);
    pending || (pending = (async () => {
      let id = `powerpoint-reconnect-${randomUUID8()}`, reply;
      if (await send(state, endpoint, {
        jsonrpc: "2.0",
        id,
        method: "initialize",
        params: initializeParams
      }, async (message) => {
        message.id === id && (reply = message);
      }, signal), !reply?.result || reply.error)
        throw new Error(reply?.error?.message || "PowerPoint runtime reinitialization failed.");
      await send(state, endpoint, {
        jsonrpc: "2.0",
        method: "notifications/initialized"
      }, async () => {
      }, signal), state.initialized.add(endpoint);
    })().finally(() => state.initializing.delete(endpoint)), state.initializing.set(endpoint, pending)), await pending;
  }
  return {
    async request(endpoint, message, onMessage, signal) {
      if (closing) throw new Error("The PowerPoint MCP relay is closing.");
      signal?.throwIfAborted();
      let controller = new AbortController();
      controllers.add(controller);
      let abort = () => controller.abort(signal?.reason);
      signal?.addEventListener("abort", abort, { once: !0 });
      try {
        let runtime2 = await runtimeClient.runtime();
        if (closing) throw new Error("The PowerPoint MCP relay is closing.");
        (generation?.runtime.capability !== runtime2.capability || generation.authGeneration !== runtime2.authGeneration) && (generation = {
          runtime: runtime2,
          authGeneration: runtime2.authGeneration,
          sessions: /* @__PURE__ */ new Map(),
          initialized: /* @__PURE__ */ new Set(),
          initializing: /* @__PURE__ */ new Map()
        });
        let state = generation;
        if (message.method === "initialize")
          initializeParams = message.params, state.sessions.delete(endpoint), await send(state, endpoint, message, async (reply) => {
            reply.id === message.id && reply.result && !reply.error && state.initialized.add(endpoint), await onMessage(reply);
          }, controller.signal);
        else
          try {
            await ensureInitialized(state, endpoint, controller.signal), await send(state, endpoint, message, onMessage, controller.signal);
          } catch (error) {
            if (!(error instanceof OfficeSessionNotFoundError) || !initializeParams || !SESSION_RETRYABLE.has(message.method)) throw error;
            let current = await runtimeClient.runtime();
            if (closing) throw new Error("The PowerPoint MCP relay is closing.");
            if (current.capability !== state.runtime.capability || current.origin !== state.runtime.origin || current.authGeneration !== state.authGeneration)
              throw new Error("The PowerPoint account or runtime changed while recovering an Office session. The request was not retried.");
            await ensureInitialized(state, endpoint, controller.signal), await send(state, endpoint, message, onMessage, controller.signal);
          }
      } finally {
        signal?.removeEventListener("abort", abort), controllers.delete(controller);
      }
    },
    async close() {
      closing = !0;
      for (let controller of controllers) controller.abort();
      await runtimeClient.close();
    }
  };
}

// src/runtime/mcp-response.ts
async function readResponseMessages(response, onMessage) {
  let contentType = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    if (contentType.includes("application/json")) {
      let reader = response.body?.getReader(), text = "";
      if (reader) {
        let decoder2 = new TextDecoder();
        try {
          for (; text.length <= 16384; ) {
            let next = await reader.read();
            if (next.done) break;
            text += decoder2.decode(next.value, { stream: !0 });
          }
        } finally {
          await reader.cancel();
        }
      }
      if (text.length <= 16384 && text) {
        let error;
        try {
          error = JSON.parse(text);
        } catch {
        }
        if (typeof error?.error == "string")
          throw new Error(`PowerPoint runtime HTTP ${response.status}: ${error.error}`);
      }
    }
    throw response.body?.locked || await response.body?.cancel(), new Error(`PowerPoint runtime returned HTTP ${response.status}.`);
  }
  if (!response.body) return;
  if (!contentType.includes("text/event-stream")) {
    let text = await response.text();
    if (!text.trim()) return;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(
        `PowerPoint runtime returned invalid JSON (HTTP ${response.status}).`
      );
    }
    await onMessage(parsed);
    return;
  }
  let decoder = new TextDecoder(), buffer = "", data = [];
  async function lineReceived(line) {
    if (line === "") {
      if (data.length > 0) {
        let value = data.join(`
`);
        data = [], value && await onMessage(JSON.parse(value));
      }
    } else line.startsWith("data:") && data.push(line.slice(5).replace(/^ /, ""));
  }
  async function consumeLines(final = !1) {
    for (; ; ) {
      let index = buffer.search(/[\r\n]/);
      if (index < 0 || !final && buffer[index] === "\r" && index === buffer.length - 1) break;
      let length = buffer.startsWith(`\r
`, index) ? 2 : 1, line = buffer.slice(0, index);
      buffer = buffer.slice(index + length), await lineReceived(line);
    }
  }
  for await (let chunk of response.body)
    buffer += decoder.decode(chunk, { stream: !0 }), await consumeLines();
  buffer += decoder.decode(), await consumeLines(!0), buffer && await lineReceived(buffer), await lineReceived("");
}

// src/runtime/mcp-relay.ts
function createMcpRelay({ transport }) {
  let serverRequestRouter = createServerRequestRouter(), activeRequestEndpoints = /* @__PURE__ */ new Map();
  async function collectEndpoint(endpoint, message, signal) {
    let messages = [];
    return await transport.request(endpoint, message, async (responseMessage) => {
      messages.push(responseMessage);
    }, signal), messages;
  }
  async function emitEndpoint(endpoint, message, write2, signal) {
    message.id !== void 0 && message.method && activeRequestEndpoints.set(messageKey(message.id), endpoint);
    try {
      await transport.request(endpoint, message, async (responseMessage) => {
        if (responseMessage?.method && responseMessage.id !== void 0) {
          write2(serverRequestRouter.forward(endpoint, responseMessage));
          return;
        }
        if (responseMessage?.method === "notifications/cancelled") {
          let cancelled = serverRequestRouter.cancelled(endpoint, responseMessage);
          cancelled && write2(cancelled);
          return;
        }
        write2(responseMessage);
      }, signal);
    } finally {
      message.id !== void 0 && message.method && activeRequestEndpoints.delete(messageKey(message.id));
    }
  }
  async function mergedList(message, endpoints, property, write2, signal) {
    let requests = listEndpointRequests(message, endpoints), endpointMessages = await Promise.all(
      requests.map(({ endpoint, message: endpointMessage }) => collectEndpoint(endpoint, endpointMessage, signal))
    );
    write2(mergedListResponse(
      message,
      endpointMessages.map((messages, index) => ({
        endpoint: requests[index].endpoint,
        response: resultFor(messages, message.id)
      })),
      property
    ));
  }
  async function dispatch(message, write2, signal) {
    if (!message || Array.isArray(message) || message.jsonrpc !== "2.0")
      throw new Error("Batch and non-JSON-RPC messages are not supported.");
    if (message.method === void 0 && message.id !== void 0) {
      let route = serverRequestRouter.restore(message);
      await emitEndpoint(route.endpoint, route.message, write2, signal);
      return;
    }
    if (message.method === "initialize") {
      let endpointMessages = await Promise.all(
        MCP_ENDPOINTS.map((endpoint) => collectEndpoint(endpoint, message, signal))
      );
      write2(mergedInitializeResponse(
        message,
        endpointMessages.map((messages, index) => ({
          endpoint: MCP_ENDPOINTS[index],
          response: resultFor(messages, message.id)
        }))
      ));
      return;
    }
    if (message.method === "notifications/initialized") {
      await Promise.all(MCP_ENDPOINTS.map((endpoint) => transport.request(endpoint, message, async () => {
      }, signal)));
      return;
    }
    if (message.method === "tools/list") {
      await mergedList(message, MCP_ENDPOINTS, "tools", write2, signal);
      return;
    }
    if (message.method === "resources/list" || message.method === "resources/templates/list") {
      await mergedList(
        message,
        [OFFICE_ENDPOINT, UI_ENDPOINT],
        message.method === "resources/list" ? "resources" : "resourceTemplates",
        write2,
        signal
      );
      return;
    }
    if (message.method === "resources/read") {
      await emitEndpoint(endpointForResource(message.params?.uri), message, write2, signal);
      return;
    }
    if (message.method === "tools/call") {
      await emitEndpoint(endpointForTool(message.params?.name), message, write2, signal);
      return;
    }
    if (message.method === "notifications/cancelled") {
      let requestId = message.params?.requestId;
      await emitEndpoint(
        activeRequestEndpoints.get(messageKey(requestId)) ?? OFFICE_ENDPOINT,
        message,
        write2,
        signal
      );
      return;
    }
    await emitEndpoint(OFFICE_ENDPOINT, message, write2, signal);
  }
  return {
    async handle(message, write2, signal) {
      try {
        await dispatch(message, write2, signal);
      } catch (error) {
        if (message?.id === void 0 || message?.method === void 0) {
          console.error("[powerpoint] MCP relay message failed", error);
          return;
        }
        write2({
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32e3,
            message: error instanceof Error ? error.message : String(error)
          }
        });
      }
    },
    close: () => transport.close()
  };
}

// src/runtime/mcp-facade.ts
init_local_http();
import http2 from "node:http";
import { randomBytes as randomBytes3, timingSafeEqual as timingSafeEqual2 } from "node:crypto";
var MCP_FACADE_CAPABILITY_HEADER = "x-powerpoint-mcp-capability", MCP_FACADE_PATH = "/mcp", MAX_REQUEST_BYTES2 = 1024 * 1024;
function writeJson3(response, statusCode, value) {
  if (response.headersSent || response.writableEnded) {
    response.end();
    return;
  }
  response.statusCode = statusCode, response.setHeader("content-type", "application/json"), response.end(JSON.stringify(value));
}
function rpcFailure(response, statusCode, code, message) {
  writeJson3(response, statusCode, { jsonrpc: "2.0", id: null, error: { code, message } });
}
function hasCapability(request, expected) {
  let supplied = request.headers[MCP_FACADE_CAPABILITY_HEADER];
  if (typeof supplied != "string") return !1;
  let value = Buffer.from(supplied);
  return value.length === expected.length && timingSafeEqual2(value, expected);
}
async function readBody(request) {
  let chunks = [], size = 0;
  for await (let chunk of request) {
    if (size += chunk.length, size > MAX_REQUEST_BYTES2) throw new RangeError("MCP request body is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
async function startMcpFacade({
  relay,
  capability = randomBytes3(32).toString("base64url"),
  host = "127.0.0.1",
  heartbeatMs = 15e3
}) {
  assertLoopbackBind(host);
  let expected = Buffer.from(capability), active = /* @__PURE__ */ new Set(), origin = "";
  async function handle(request, response) {
    let requestUrl = localRequestUrl(request, response);
    if (!requestUrl) return;
    if (!hasCapability(request, expected)) {
      writeJson3(response, 403, { error: "PowerPoint MCP capability required." });
      return;
    }
    if (requestUrl.pathname !== MCP_FACADE_PATH) {
      writeJson3(response, 404, { error: "Not found" });
      return;
    }
    if (request.method !== "POST") {
      response.statusCode = 405, response.setHeader("allow", "POST"), response.end();
      return;
    }
    if (!requireJsonRequest(request, response)) return;
    let message;
    try {
      message = JSON.parse(await readBody(request));
    } catch (error) {
      error instanceof RangeError ? rpcFailure(response, 413, -32600, error.message) : rpcFailure(response, 400, -32700, "Invalid JSON-RPC message.");
      return;
    }
    if (Array.isArray(message) || !isJsonRpcPayload(message)) {
      rpcFailure(response, 400, -32600, "Invalid or unsupported JSON-RPC message.");
      return;
    }
    if (typeof message.method != "string" || message.id === void 0) {
      await relay.handle(message, (stray) => {
        console.error("[powerpoint] Dropped an MCP reply without an open request stream.", {
          id: stray?.id,
          method: stray?.method,
          error: stray?.error?.message
        });
      }), response.statusCode = 202, response.end();
      return;
    }
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive"
    }), response.flushHeaders();
    let disconnected = new AbortController();
    response.once("close", () => {
      response.writableFinished || disconnected.abort(new Error("The Copilot host disconnected."));
    });
    let write2 = (reply) => {
      !response.writableEnded && !response.destroyed && response.write(`event: message
data: ${JSON.stringify(reply)}

`);
    }, heartbeat = setInterval(() => {
      !response.writableEnded && !response.destroyed && response.write(`: keepalive

`);
    }, heartbeatMs);
    heartbeat.unref();
    try {
      await relay.handle(message, write2, disconnected.signal);
    } finally {
      clearInterval(heartbeat), response.end();
    }
  }
  let server = http2.createServer((request, response) => {
    let work = handle(request, response).catch((error) => {
      console.error("[powerpoint] MCP request failed", error), response.headersSent ? response.end() : writeJson3(response, 500, { error: "PowerPoint MCP request failed." });
    }).finally(() => active.delete(work));
    active.add(work);
  });
  server.headersTimeout = 15e3, server.requestTimeout = 6e4, await new Promise((resolve, reject) => {
    server.once("error", reject), server.listen(0, host, () => {
      server.off("error", reject), resolve();
    });
  });
  let address = server.address();
  if (!address || typeof address == "string")
    throw server.close(), new Error("The PowerPoint MCP endpoint did not bind to loopback.");
  return origin = `http://${host}:${address.port}`, {
    url: `${origin}${MCP_FACADE_PATH}`,
    headers: { [MCP_FACADE_CAPABILITY_HEADER]: capability },
    async close() {
      await new Promise((resolve) => {
        server.close(() => resolve()), server.closeAllConnections();
      }), await Promise.allSettled([...active]);
    }
  };
}

// src/runtime/runtime-host.ts
async function reclaimDeadInstanceDirectories(root, ownId) {
  await mkdir4(root, { recursive: !0, mode: 448 });
  for (let entry of await readdir(root, { withFileTypes: !0 }))
    entry.name !== ownId && (entry.isDirectory() && await isRuntimeInstanceAlive2(entry.name) || await rm4(join10(root, entry.name), { recursive: !0, force: !0 }));
}
function createAccountUseLeases(root, ownId) {
  let own = join10(root, ownId);
  return {
    async register() {
      await mkdir4(own, { recursive: !0, mode: 448 });
      let file = join10(own, randomUUID9());
      return await writeFile2(file, "", { mode: 384 }), () => rm4(file, { force: !0 });
    },
    async activeElsewhere() {
      let entries;
      try {
        entries = await readdir(root, { withFileTypes: !0 });
      } catch (error) {
        if (error.code === "ENOENT") return !1;
        throw error;
      }
      for (let entry of entries)
        if (!(!entry.isDirectory() || entry.name === ownId) && (await readdir(join10(root, entry.name))).length && await isRuntimeInstanceAlive2(entry.name))
          return !0;
      return !1;
    },
    release: () => rm4(own, { recursive: !0, force: !0 })
  };
}
async function startPowerPointRuntime({
  profile,
  authWorkerPath,
  createProfileRuntimeOptions: createProfileRuntimeOptions2,
  proxyOptions = {},
  shutdownTimeoutMs = 5e3
}) {
  if (process.platform !== "win32" && process.platform !== "darwin")
    throw new Error("The PowerPoint plugin runtime requires Windows or macOS.");
  let stateDirectory = runtimeStateDirectory(profile);
  await mkdir4(stateDirectory, { recursive: !0, mode: 448 });
  let cleanup = [], closed = !1;
  async function close() {
    if (!closed) {
      closed = !0;
      for (let step of cleanup.reverse())
        try {
          await step();
        } catch (error) {
          console.error("[powerpoint] Runtime shutdown step failed", error);
        }
    }
  }
  try {
    let instance = await createRuntimeInstance2();
    cleanup.push(() => instance.release());
    let uploadRoot = runtimeUploadDirectory(profile);
    await reclaimDeadInstanceDirectories(uploadRoot, instance.id);
    let uploadDirectory = join10(uploadRoot, instance.id);
    await mkdir4(uploadDirectory, { recursive: !0, mode: 448 }), cleanup.push(() => rm4(uploadDirectory, { recursive: !0, force: !0 }));
    let options = await createProfileRuntimeOptions2({ stateDirectory, uploadDirectory, authWorkerPath }), operations = join10(stateDirectory, "operations"), capability = createRuntimeCapability(), operationJournal = createOperationJournal({ directory: operations, instanceId: instance.id }), proxy = await startOfficeTaskProxy({
      ...options,
      ...proxyOptions,
      port: 0,
      idleTimeoutMs: 0,
      runtimeProfile: profile,
      requireMcpCapability: !0,
      controlCapability: capability,
      operationJournal,
      operationResumeStore: createOperationResumeStore({ path: join10(operations, "resume.json") })
    });
    cleanup.push(async () => {
      await proxy.shutdown(), await Promise.race([
        proxy.waitForActiveOperations(),
        new Promise((resolve) => setTimeout(resolve, shutdownTimeoutMs).unref())
      ]);
    });
    let address = proxy.address();
    if (!address || typeof address != "object") throw new Error("The PowerPoint runtime did not bind to loopback.");
    let origin = `http://127.0.0.1:${address.port}`, auth = options.authController, leaseRoot = join10(stateDirectory, "account-use");
    await reclaimDeadInstanceDirectories(leaseRoot, instance.id);
    let leases = createAccountUseLeases(leaseRoot, instance.id);
    cleanup.push(() => leases.release()), auth?.configureCoordination({
      locallyBusy: () => proxy.hasActiveOperations(),
      busyElsewhere: async () => {
        for (let owner of await operationJournal.activeOwnerIds())
          if (owner !== instance.id && await isRuntimeInstanceAlive2(owner)) return !0;
        return leases.activeElsewhere();
      },
      registerUse: () => leases.register(),
      onAccountChanged: () => proxy.invalidateViewerSessions()
    });
    let endpoint = async () => {
      if (closed) throw new Error("The PowerPoint runtime is closed.");
      return await auth?.refresh(), { origin, capability, authGeneration: String(auth?.status().generation ?? 0) };
    }, relay = createMcpRelay({
      transport: createMcpTransport({
        runtimeClient: { runtime: endpoint, close: async () => {
        } },
        readMessages: readResponseMessages
      })
    }), facade = await startMcpFacade({ relay }).catch(async (error) => {
      throw await relay.close(), error;
    });
    return cleanup.push(() => facade.close()), cleanup.push(() => relay.close()), {
      profile,
      instanceId: instance.id,
      stateDirectory,
      auth,
      endpoint,
      async createPowerPointViewerUrl(artifactUrl, title, mode = "view", viewerInstanceId) {
        if (closed) throw new Error("The PowerPoint runtime is closed.");
        return proxy.createPowerPointViewerUrl(artifactUrl, title, mode, viewerInstanceId);
      },
      async revokeViewerInstance(viewerInstanceId) {
        if (closed) throw new Error("The PowerPoint runtime is closed.");
        proxy.revokeViewerInstance(viewerInstanceId);
      },
      mcp: { url: facade.url, headers: facade.headers },
      close
    };
  } catch (error) {
    throw await close(), error;
  }
}

// src/runtime/session-conversation.ts
var TRUNCATION_MARKER = `
[truncated by PowerPoint plugin conversation handoff]`;
function truncateUtf8(value, maximumBytes) {
  if (Buffer.byteLength(value, "utf8") <= maximumBytes) return value;
  let contentBudget = maximumBytes - Buffer.byteLength(TRUNCATION_MARKER, "utf8"), low = 0, high = value.length;
  for (; low < high; ) {
    let middle = Math.ceil((low + high) / 2);
    Buffer.byteLength(value.slice(0, middle), "utf8") <= contentBudget ? low = middle : high = middle - 1;
  }
  return `${value.slice(0, low)}${TRUNCATION_MARKER}`;
}
function serializeToolInvocation(start) {
  let name = start?.data?.mcpToolName || start?.data?.toolName || "unknown", invocation = JSON.stringify({ name, arguments: start?.data?.arguments ?? {} });
  return Buffer.byteLength(invocation, "utf8") <= 65536 ? invocation : JSON.stringify({ name, arguments: { _truncated: "Tool arguments exceeded the conversation handoff limit." } });
}
function serializeToolResult(complete) {
  let content = complete?.data?.result?.content;
  return typeof content == "string" && content ? content : content ? JSON.stringify(content) : complete?.data?.error?.message ? String(complete.data.error.message) : complete?.data?.success ? "Tool completed without a text result." : "Tool execution failed without an error message.";
}
function toMessageAnnotations(attachments) {
  if (!(!Array.isArray(attachments) || attachments.length === 0))
    return attachments.map(({ data: _data, content: _content, ...metadata }) => metadata);
}
function boundConversation(messages) {
  let userTurns = 0, firstMessage = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1)
    if (messages[index].author === "user" && (userTurns += 1, userTurns > 20)) {
      firstMessage = index + 1;
      break;
    }
  let selected = [], totalBytes = 2;
  for (let index = messages.length - 1; index >= firstMessage; index -= 1) {
    let messageBytes = Buffer.byteLength(JSON.stringify(messages[index]), "utf8");
    if (totalBytes + messageBytes > 524288) break;
    selected.unshift(messages[index]), totalBytes += messageBytes + 1;
  }
  return selected;
}
function toOfficeConversation(events) {
  let toolStarts = /* @__PURE__ */ new Map(), conversation = [];
  for (let event of Array.isArray(events) ? events : [])
    if (!(!event || event.agentId || event.ephemeral)) {
      if (event.type === "tool.execution_start")
        toolStarts.set(event.data?.toolCallId, event);
      else if (event.type === "user.message") {
        if (typeof event.data?.content != "string" || !event.data.content) continue;
        conversation.push({
          author: "user",
          text: truncateUtf8(event.data.content, 262144),
          createdAt: event.timestamp,
          messageId: event.id,
          requestId: event.data.interactionId,
          messageAnnotations: toMessageAnnotations(event.data.attachments)
        });
      } else if (event.type === "assistant.message") {
        let phase = typeof event.data?.phase == "string" ? event.data.phase.toLowerCase() : void 0;
        if (typeof event.data?.content != "string" || !event.data.content || phase && phase !== "response" && phase !== "final") continue;
        conversation.push({
          author: "bot",
          text: truncateUtf8(event.data.content, 262144),
          createdAt: event.timestamp,
          messageId: event.data.messageId || event.id,
          requestId: event.data.requestId || event.data.turnId
        });
      } else if (event.type === "tool.execution_complete") {
        let start = toolStarts.get(event.data?.toolCallId);
        if (!start) continue;
        conversation.push({
          author: "bot",
          text: `${start.data?.mcpToolName || start.data?.toolName || "tool"} completed.`,
          createdAt: event.timestamp,
          messageType: "InternalSearchResult",
          contentOrigin: "Tool",
          hiddenText: truncateUtf8(serializeToolResult(event), 262144),
          invocation: serializeToolInvocation(start),
          messageId: event.data.toolCallId,
          requestId: event.data.turnId || start.data?.turnId
        });
      }
    }
  return boundConversation(conversation);
}

// src/runtime/upload-client.ts
init_runtime_identity();
import { open as open3, realpath as realpath2 } from "node:fs/promises";
import { basename } from "node:path";
import { Readable } from "node:stream";
async function uploadLocalPresentation(filePath, {
  runtimeClient,
  fetchImpl = fetch,
  signal = AbortSignal.timeout(UPLOAD_TIMEOUT_MS)
}) {
  let resolved = await realpath2(filePath), name = validateUploadFileName(basename(resolved)), file = await open3(resolved, "r");
  try {
    let info = await file.stat();
    if (!info.isFile() || info.size < 4)
      throw new Error(`The source must be a nonempty .pptx file no larger than ${MAX_UPLOAD_BYTES} bytes.`);
    let signature = Buffer.alloc(4);
    if (await file.read(signature, 0, 4, 0), !signature.equals(PPTX_ZIP_SIGNATURE))
      throw new Error("Only ZIP-based, unencrypted .pptx files can be uploaded.");
    let runtime2 = await runtimeClient.runtime(), headers = new Headers({ [RUNTIME_CAPABILITY_HEADER]: runtime2.capability }), health = await fetchImpl(`${runtime2.origin}/health`, { headers, signal, redirect: "manual" });
    if (health.status >= 300 && health.status < 400)
      throw await health.body?.cancel(), new Error("PowerPoint runtime discovery returned an unexpected redirect.");
    let limit = Number(health.headers.get(UPLOAD_LIMIT_HEADER));
    if (health.status !== 204 || !Number.isSafeInteger(limit) || limit <= 0)
      throw await health.body?.cancel(), new Error("The PowerPoint runtime does not support local uploads. Reinstall the plugin.");
    if (headers.set(UPLOAD_FILE_NAME_HEADER, encodeURIComponent(name)), info.size > limit) {
      headers.set(UPLOAD_TOTAL_BYTES_HEADER, String(info.size));
      let body = await (await fetchImpl(`${runtime2.origin}${PRESENTATION_UPLOAD_PATH}`, {
        method: "POST",
        headers,
        signal,
        redirect: "manual"
      }).catch(() => {
      }))?.json().catch(() => {
      });
      throw new Error(typeof body?.error == "string" && body.error ? body.error : `The presentation must be a .pptx file no larger than ${limit} bytes.`);
    }
    headers.set("content-type", PPTX_CONTENT_TYPE), headers.set("content-length", String(info.size));
    let input = file.createReadStream({ start: 0, autoClose: !1 }), response;
    try {
      let init = {
        method: "POST",
        headers,
        body: Readable.toWeb(input),
        duplex: "half",
        signal,
        redirect: "manual"
      };
      try {
        response = await fetchImpl(`${runtime2.origin}${PRESENTATION_UPLOAD_PATH}`, init);
      } catch {
        throw new Error("The upload could not be confirmed. Check OneDrive before retrying; the request was not replayed.");
      }
      if (response.status >= 300 && response.status < 400)
        throw await response.body?.cancel(), new Error("PowerPoint upload returned an unexpected redirect; the request was not replayed.");
      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error("The runtime returned an incomplete upload response. Check OneDrive before retrying.");
      }
      if (!response.ok) throw new Error(result.error || `PowerPoint upload failed (HTTP ${response.status}).`);
      return parseUploadedPresentation(result);
    } finally {
      input.destroy();
    }
  } finally {
    await file.close();
  }
}

// src/office-mcp-registration.ts
import { readFile as readFile6, writeFile as writeFile3 } from "node:fs/promises";
import { tmpdir as tmpdir3 } from "node:os";
import { join as join11 } from "node:path";
var RECOVERY_WINDOW_MS = 600 * 1e3, MAX_RECOVERIES = 2;
function isMissingServerError(error) {
  return /has no installed config/i.test(error instanceof Error ? error.message : String(error));
}
function createRecoveryBudget(sessionId, {
  directory = tmpdir3(),
  now = () => Date.now()
} = {}) {
  let file = join11(directory, `powerpoint-copilot-mcp-recovery-${sessionId.replace(/[^\w-]/g, "_")}.json`);
  return {
    async claim() {
      let attempts = [];
      try {
        attempts = JSON.parse(await readFile6(file, "utf8"));
      } catch {
      }
      let recent = (Array.isArray(attempts) ? attempts : []).filter((at) => now() - at < RECOVERY_WINDOW_MS);
      return recent.length >= MAX_RECOVERIES ? !1 : (await writeFile3(file, JSON.stringify([...recent, now()])), !0);
    }
  };
}
function createOfficeMcpRecovery({
  reloadExtensions,
  isBusy,
  budget
}) {
  return {
    // Reloading ends this extension process, so it never runs during an Office operation.
    async recover() {
      return isBusy() || !await budget.claim() ? !1 : (await reloadExtensions(), !0);
    }
  };
}

// src/extension.ts
var POWERPOINT_MCP_SERVER = "powerpoint", MCP_TIMEOUT_MS = 1200 * 1e3, MCP_RECOVERY_DELAY_MS = 1e3, DEFAULT_CANVAS_INSTANCE = "powerpoint-presentation-view", WORKFLOW_TOOLS = new Set(["generate_artifact", "edit_artifact", "resume_powerpoint_operation"].map((name) => `${POWERPOINT_MCP_SERVER}-${name}`)), CANVAS_MODE_DESCRIPTION = "Canvas layout. Both modes open the presentation in the editable PowerPoint web editor with the user's document permissions: 'view' (default) hides the PowerPoint header and ribbon for a compact layout; 'edit' shows them.", runtime, startupError, officeMcpRegistration, session;
try {
  let { createProfileRuntimeOptions: createProfileRuntimeOptions2 } = await Promise.resolve().then(() => (init_runtime_profile_production(), runtime_profile_production_exports));
  runtime = await startPowerPointRuntime({
    profile: "production",
    authWorkerPath: fileURLToPath3(new URL("./auth/auth-worker.cjs", import.meta.url)),
    createProfileRuntimeOptions: createProfileRuntimeOptions2,
    proxyOptions: {
      // Hands the chat so far to Office with each create/edit, as the Excel plugin does.
      conversationProvider: async () => {
        if (!session) throw new Error("The Copilot session is not ready to provide conversation history.");
        return {
          conversationId: String(session.sessionId),
          conversationSchemaVersion: "2",
          conversation: toOfficeConversation(await session.getEvents())
        };
      }
    }
  });
} catch (error) {
  startupError = error, console.error("[powerpoint] The PowerPoint runtime failed to start.", error);
}
function requireRuntime() {
  if (runtime) return runtime;
  let reason = startupError instanceof Error ? startupError.message : String(startupError);
  throw new Error(`The PowerPoint runtime failed to start: ${reason} Restart Copilot after resolving the problem.`);
}
var shuttingDown = !1;
function shutdown() {
  shuttingDown || (shuttingDown = !0, Promise.resolve(runtime?.close()).finally(() => process.exit(0)));
}
process.stdin.once("end", shutdown);
process.once("SIGTERM", shutdown);
async function refreshOfficeMcp({ onlyIfDisconnected = !1 } = {}) {
  let mcp = session.rpc.mcp;
  if (onlyIfDisconnected && typeof mcp.list == "function") {
    let { servers } = await mcp.list();
    if (servers?.find((server) => server.name === POWERPOINT_MCP_SERVER)?.status === "connected") return;
  }
  typeof mcp.restartServer == "function" ? await mcp.restartServer({ serverName: POWERPOINT_MCP_SERVER }) : await mcp.reload();
}
async function accountAction(action, input) {
  let { origin, capability } = await requireRuntime().endpoint(), response = await fetch(`${origin}/auth/${action}`, {
    method: action === "status" ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      [RUNTIME_CAPABILITY_HEADER]: capability
    },
    ...action === "status" ? {} : { body: JSON.stringify(input ?? {}) },
    redirect: "manual",
    signal: AbortSignal.timeout(360 * 1e3)
  }), result = await response.json();
  if (!response.ok) throw new Error(result.error || `PowerPoint account action failed (HTTP ${response.status}).`);
  if (action !== "status" || result.state === "connected")
    try {
      await refreshOfficeMcp({ onlyIfDisconnected: action === "status" });
    } catch (error) {
      let recovery = isMissingServerError(error) ? officeMcpRegistration : void 0;
      return recovery ? (setTimeout(() => {
        recovery.recover().catch((reloadError) => {
          console.error("[powerpoint] Could not reload the extension to restore Office tools.", reloadError);
        });
      }, MCP_RECOVERY_DELAY_MS), {
        ...result,
        mcpStatus: "reloading",
        warning: "Office tools were not registered in this chat, so the PowerPoint extension is reloading to restore them. Search for the powerpoint tools again in a few seconds. If they are still missing, reload extensions or restart Copilot."
      }) : {
        ...result,
        mcpStatus: "restart_required",
        warning: `Account action completed, but MCP refresh did not complete: ${String(error)}. Restart Copilot to refresh Office tools.`
      };
    }
  return result;
}
async function createPowerPointViewerUrl(artifactUrl, title, mode, instanceId) {
  return requireRuntime().createPowerPointViewerUrl(artifactUrl, title, mode, instanceId);
}
session = await joinSession({
  enableMcpApps: !0,
  ...runtime ? {
    mcpServers: {
      [POWERPOINT_MCP_SERVER]: {
        type: "http",
        url: runtime.mcp.url,
        headers: runtime.mcp.headers,
        timeout: MCP_TIMEOUT_MS
      }
    }
  } : {},
  tools: [
    {
      name: "powerpoint_account_status",
      description: "Show the PowerPoint plugin's selected Microsoft 365 account and sign-in status. Returns no tokens.",
      parameters: { type: "object", properties: {}, additionalProperties: !1 },
      handler: async () => accountAction("status")
    },
    {
      name: "connect_powerpoint_account",
      description: "Explicitly connect or reauthenticate with Microsoft's native account provider. For first connection, ask the user for their Microsoft 365 username in Copilot and pass it here. Never guesses an account or changes a pinned identity; Microsoft alone handles passwords, consent, and MFA.",
      parameters: {
        type: "object",
        properties: {
          tenantId: { type: "string", description: "Optional work/school tenant GUID." },
          username: { type: "string", description: "User-provided Microsoft 365 username, required on first connection. Omit when reauthenticating an already pinned account." }
        },
        additionalProperties: !1
      },
      handler: async (args) => accountAction("connect", args)
    },
    {
      name: "switch_powerpoint_account",
      description: "Choose a different account through Microsoft's native account provider using a username explicitly supplied by the user in Copilot. Requires an idle runtime and invalidates existing viewers. Does not change the OS account.",
      parameters: {
        type: "object",
        properties: {
          tenantId: { type: "string", description: "Optional work/school tenant GUID." },
          username: { type: "string", description: "User-provided Microsoft 365 username for the account to select. Never infer this value." }
        },
        required: ["username"],
        additionalProperties: !1
      },
      handler: async (args) => accountAction("switch", args)
    },
    {
      name: "disconnect_powerpoint_account",
      description: "Disconnect the PowerPoint plugin, clear its selected identity/token cache and invalidate viewers. Does not sign out the OS account or other Office applications. Requires an idle runtime.",
      parameters: { type: "object", properties: {}, additionalProperties: !1 },
      handler: async () => accountAction("disconnect")
    },
    {
      name: "upload_powerpoint_presentation",
      description: "Upload an explicitly named local .pptx presentation (up to 12 MB) to the connected account's OneDrive through Office (its Copilot files folder) so it can be edited. Creates a uniquely named copy, never modifies the local file, and returns its name and webUrl. If the upload cannot be confirmed, do not retry; ask the user to check OneDrive.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Absolute path to the local .pptx file supplied by the user.",
            minLength: 1
          }
        },
        required: ["path"],
        additionalProperties: !1
      },
      handler: async (args) => {
        let active = requireRuntime();
        return uploadLocalPresentation(args.path, { runtimeClient: { runtime: () => active.endpoint() } });
      }
    },
    {
      name: "open_powerpoint_canvas",
      description: "Open or focus a trusted SharePoint or OneDrive PowerPoint presentation in the Copilot app canvas.",
      defer: "never",
      parameters: {
        type: "object",
        properties: {
          artifactUrl: {
            type: "string",
            description: "Canonical HTTPS SharePoint or OneDrive presentation URL."
          },
          title: {
            type: "string",
            description: "Optional presentation name shown in the canvas header."
          },
          instanceId: {
            type: "string",
            description: "Optional canvas instance identifier. Omit it: a presentation that is already open reuses its panel."
          },
          mode: {
            type: "string",
            enum: ["view", "edit"],
            description: CANVAS_MODE_DESCRIPTION
          }
        },
        required: ["artifactUrl"],
        additionalProperties: !1
      },
      handler: async (args) => openPresentationCanvas(args)
    }
  ],
  canvases: [
    createCanvas({
      id: "powerpoint-canvas",
      displayName: "PowerPoint",
      description: "Open an Office MCP PowerPoint artifact in the Copilot app canvas.",
      inputSchema: {
        type: "object",
        properties: {
          artifactUrl: {
            type: "string",
            description: "Canonical HTTPS SharePoint or OneDrive URL returned by Office MCP.",
            minLength: 1
          },
          title: {
            type: "string",
            description: "Optional presentation name shown in the canvas header."
          },
          mode: {
            type: "string",
            enum: ["view", "edit"],
            description: CANVAS_MODE_DESCRIPTION,
            default: "view"
          }
        },
        required: ["artifactUrl"],
        additionalProperties: !1
      },
      actions: [
        {
          name: "refresh_presentation",
          description: "Refresh the currently open PowerPoint canvas after the presentation changes.",
          handler: async () => ({
            refreshedAt: (/* @__PURE__ */ new Date()).toISOString()
          })
        }
      ],
      onClose: async (ctx) => {
        await requireRuntime().revokeViewerInstance(`${session.sessionId}:${ctx.instanceId}`);
      },
      open: async (ctx) => {
        let url;
        try {
          url = await createPowerPointViewerUrl(
            ctx.input?.artifactUrl,
            ctx.input?.title,
            ctx.input?.mode || "view",
            `${session.sessionId}:${ctx.instanceId}`
          );
        } catch (error) {
          throw new CanvasError(
            "invalid_powerpoint_url",
            error instanceof Error ? error.message : String(error)
          );
        }
        return {
          title: typeof ctx.input?.title == "string" && ctx.input.title.trim() ? ctx.input.title.trim() : "PowerPoint",
          status: ctx.input?.mode === "edit" ? "Opening PowerPoint editor with ribbon" : "Opening PowerPoint editor",
          url
        };
      }
    })
  ]
});
var canvasInstances = /* @__PURE__ */ new Map();
function openPresentationCanvas({ artifactUrl, title, mode = "view", instanceId = void 0 }) {
  let resolvedInstance = canvasInstances.get(artifactUrl) ?? instanceId ?? (mode === "edit" ? "powerpoint-presentation-edit" : DEFAULT_CANVAS_INSTANCE);
  return canvasInstances.set(artifactUrl, resolvedInstance), session.rpc.canvas.open({
    canvasId: "powerpoint-canvas",
    instanceId: resolvedInstance,
    input: { artifactUrl, title, mode }
  });
}
function openWorkflowResult(workflow) {
  if (workflow?.status !== "completed" || typeof workflow.artifactUrl != "string") return;
  let title = typeof workflow.title == "string" ? workflow.title.replace(/\.pptx$/i, "") : void 0;
  openPresentationCanvas({ artifactUrl: workflow.artifactUrl, title }).catch((error) => {
    console.error("[powerpoint] Could not open the canvas automatically.", error);
  });
}
var workflowCalls = /* @__PURE__ */ new Set();
session.on("tool.execution_start", (event) => {
  WORKFLOW_TOOLS.has(event.data?.toolName) && workflowCalls.add(event.data.toolCallId);
});
session.on("tool.execution_complete", (event) => {
  !workflowCalls.delete(event.data?.toolCallId) || !event.data.success || openWorkflowResult(event.data.result?.structuredContent?.powerpointWorkflow);
});
officeMcpRegistration = runtime && typeof session.rpc.extensions?.reload == "function" ? createOfficeMcpRecovery({
  reloadExtensions: () => session.rpc.extensions.reload(),
  isBusy: () => workflowCalls.size > 0,
  budget: createRecoveryBudget(String(session.sessionId ?? process.env.SESSION_ID ?? "unknown"))
}) : void 0;
export {
  POWERPOINT_MCP_SERVER
};
