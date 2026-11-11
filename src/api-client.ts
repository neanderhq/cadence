"use client";

export class ApiClientError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  } catch {
    throw new ApiClientError("We couldn’t reach the server. Check your connection and try again.", 0);
  }

  if (response.status === 401 && typeof window !== "undefined") {
    window.location.assign("/login?expired=1");
    throw new ApiClientError("Your session expired. Please sign in again.", 401);
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: unknown } | null;
    const message = typeof payload?.error === "string" ? payload.error : "The request could not be completed.";
    throw new ApiClientError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
