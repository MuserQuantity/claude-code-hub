const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function getToken(): string | null {
  return localStorage.getItem("token");
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

// Auth
export async function register(username: string, password: string, displayName: string) {
  return request<{ token: string; user_id: string; username: string }>(
    "/api/users/register",
    { method: "POST", body: JSON.stringify({ username, password, display_name: displayName }) }
  );
}

export async function login(username: string, password: string) {
  return request<{ token: string; user_id: string; username: string }>(
    "/api/users/login",
    { method: "POST", body: JSON.stringify({ username, password }) }
  );
}

export async function getMe() {
  return request<{
    id: string;
    username: string;
    display_name: string;
    base_url: string;
    model: string;
    system_prompt: string;
    work_dir: string;
    has_api_key: boolean;
    created_at: string;
  }>("/api/users/me");
}

export async function updateMe(data: {
  display_name?: string;
  api_key?: string;
  base_url?: string;
  model?: string;
  system_prompt?: string;
}) {
  return request("/api/users/me", { method: "PATCH", body: JSON.stringify(data) });
}

// Sessions
export interface Session {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_message: string | null;
}

export async function listSessions() {
  return request<Session[]>("/api/sessions/");
}

export async function createSession(title: string = "New Chat") {
  return request<{ id: string; title: string }>("/api/sessions/", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export async function updateSession(id: string, title: string) {
  return request(`/api/sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export async function deleteSession(id: string) {
  return request(`/api/sessions/${id}`, { method: "DELETE" });
}

// Messages
export interface Message {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  tool_calls: string | null;
  tool_results: string | null;
  thinking: string | null;
  created_at: string;
}

export async function getMessages(sessionId: string) {
  return request<Message[]>(`/api/sessions/${sessionId}/messages`);
}

// WebSocket
export function createChatWebSocket(sessionId: string): WebSocket {
  const wsUrl = API_URL.replace(/^http/, "ws");
  return new WebSocket(`${wsUrl}/api/chat/ws/${sessionId}`);
}

// Files
export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

export async function listFiles(path: string = "") {
  const params = path ? `?path=${encodeURIComponent(path)}` : "";
  return request<{ path: string; entries: FileEntry[] }>(`/api/files/list${params}`);
}

export async function uploadFile(file: File, path: string = "") {
  const formData = new FormData();
  formData.append("file", file);
  if (path) formData.append("path", path);

  const token = getToken();
  const res = await fetch(`${API_URL}/api/files/upload${path ? `?path=${encodeURIComponent(path)}` : ""}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Upload failed");
  }
  return res.json() as Promise<{ filename: string; path: string; size: number }>;
}

export function getDownloadUrl(path: string): string {
  const token = getToken();
  return `${API_URL}/api/files/download?path=${encodeURIComponent(path)}&token=${token}`;
}

export { API_URL };
