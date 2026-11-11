"use client";

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      credentials: "same-origin",
      cache: "no-store",
      headers: options.body ? { "content-type": "application/json", ...options.headers } : options.headers,
    });
  } catch {
    throw new Error("Couldn’t reach the server. Check your connection and try again.");
  }

  if (response.status === 401) {
    window.location.assign("/login?expired=1");
    throw new Error("Your session expired. Please sign in again.");
  }

  if (response.status === 204) return undefined as T;
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : "We couldn’t save that change. Please try again.";
    throw new Error(message);
  }
  return payload as T;
}
