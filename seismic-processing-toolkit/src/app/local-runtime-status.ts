declare const __APP_VERSION__: string;
declare const __GIT_COMMIT__: string;

function browserDescription(userAgent: string): string {
  if (/Edg\/(\d+[\d.]*)/.test(userAgent)) return `Edge ${RegExp.$1}`;
  if (/Firefox\/(\d+[\d.]*)/.test(userAgent)) return `Firefox ${RegExp.$1}`;
  if (/Chrome\/(\d+[\d.]*)/.test(userAgent)) return `Chrome ${RegExp.$1}`;
  if (/Version\/(\d+[\d.]*).*Safari/.test(userAgent)) return `Safari ${RegExp.$1}`;
  return "Unknown browser";
}

export function initialLocalRuntimeStatus(): string {
  const mode = import.meta.env.DEV ? "Vite development" : "static production build";
  const worker = typeof Worker === "undefined" ? "module workers unavailable" : "module workers available";
  const isolation = globalThis.crossOriginIsolated ? "cross-origin isolated" : "not cross-origin isolated";
  return `v${__APP_VERSION__} · ${__GIT_COMMIT__} · ${mode} · ${worker} · ${isolation} · ${browserDescription(navigator.userAgent)}`;
}

/** Detects only the same-origin local static server; no external status service is contacted. */
export async function localServerRuntimeStatus(): Promise<string | undefined> {
  try {
    const response = await fetch(new URL("/", window.location.origin), { method: "HEAD", cache: "no-store" });
    if (response.headers.get("X-Seismic-Local-Server") === "1") return "packaged/local static server";
    if (response.headers.get("X-Seismic-Runtime") === "vite-preview") return "Vite preview";
    return undefined;
  } catch { return undefined; }
}
