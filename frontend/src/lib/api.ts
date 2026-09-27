import { supabase } from "./supabase";

/**
 * Thin typed fetch wrapper around the NestJS API. Every request carries the current
 * Supabase session JWT as a Bearer token; the backend verifies it and decides what the
 * user may do (CLAUDE.md §5). Non-2xx responses throw an ApiError.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** The backend's single error shape (see backend/src/common/filters/http-exception.filter.ts). */
export interface ApiErrorBody {
  statusCode: number;
  /** Stable machine-readable code, e.g. INSUFFICIENT_POOL, INVALID_TRANSITION, VALIDATION_ERROR. */
  code: string;
  /** Human-readable; an array for validation errors. */
  message: string | string[];
  path?: string;
  timestamp?: string;
}

export class ApiError extends Error {
  readonly name = "ApiError";
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: ApiErrorBody | null,
  ) {
    super(message);
  }
}

/** Shape of every backend list endpoint. */
export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const hasBody = body !== undefined;
  // FormData (photo uploads) sets its own multipart boundary header.
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(await authHeader()),
      ...(hasBody && !isForm ? { "Content-Type": "application/json" } : {}),
    },
    body: !hasBody ? undefined : isForm ? body : JSON.stringify(body),
  });

  if (!res.ok) {
    let parsed: ApiErrorBody | null = null;
    try {
      parsed = (await res.json()) as ApiErrorBody;
    } catch {
      // non-JSON error body (e.g. proxy / network layer)
    }
    const message = Array.isArray(parsed?.message)
      ? parsed.message.join("; ")
      : (parsed?.message ?? `${res.status} ${res.statusText}`);
    throw new ApiError(
      res.status,
      parsed?.code ?? "HTTP_ERROR",
      message,
      parsed,
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  /** multipart/form-data, e.g. POST /handovers with the `photo` file. */
  postForm: <T>(path: string, form: FormData) => request<T>("POST", path, form),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T = void>(path: string) => request<T>("DELETE", path),
};
