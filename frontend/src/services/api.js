 	
const API_BASE = "https://scamguard-backend-1o1a.onrender.com";

export function getToken() {
  return localStorage.getItem("scamguard_token");
}

export function setToken(token) {
  localStorage.setItem("scamguard_token", token);
}

export function clearToken() {
  localStorage.removeItem("scamguard_token");
}

export function logout() {
  clearToken();
}

export async function apiRequest(path, options = {}) {
  const token = getToken();

  const headers = {
    ...(options.body !== undefined
      ? { "Content-Type": "application/json" }
      : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error(
      "Serverə qoşulmaq mümkün olmadı. Backend-in işlədiyini yoxla."
    );
  }

  if (!response.ok) {
    let message = `Sorğu uğursuz oldu (${response.status}).`;

    try {
      const data = await response.json();

      if (typeof data.detail === "string") {
        message = data.detail;
      } else if (Array.isArray(data.detail)) {
        message = data.detail
          .map((item) => item.msg || "Məlumat düzgün deyil")
          .join(", ");
      } else if (typeof data.message === "string") {
        message = data.message;
      }
    } catch {
      // Server JSON qaytarmadıqda standart xəta göstərilir.
    }

    if (response.status === 401 && token) {
      clearToken();
      window.dispatchEvent(new Event("scamguard:unauthorized"));
    }

    throw new Error(message);
  }

  if (response.status === 204) return null;

  return response.json();
}

export async function register(email, password) {
  const data = await apiRequest("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: email.trim(), password }),
  });

  if (!data.access_token) {
    throw new Error("Server giriş tokeni qaytarmadı.");
  }

  setToken(data.access_token);
  return data.user;
}

export async function login(email, password) {
  const data = await apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: email.trim(), password }),
  });

  if (!data.access_token) {
    throw new Error("Server giriş tokeni qaytarmadı.");
  }

  setToken(data.access_token);
  return data.user;
}

export async function getProfile() {
  const data = await apiRequest("/auth/me");
  return data.user ?? data;
}

export async function getHistory() {
  const data = await apiRequest("/analyses");
  return Array.isArray(data) ? data : data.items ?? [];
}

export async function getAnalysis(id) {
  return apiRequest(`/analyses/${encodeURIComponent(id)}`);
}

export async function deleteAnalysis(id) {
  return apiRequest(`/analyses/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function saveAnalysis(payload) {
  return apiRequest("/analyses", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function submitReport(payload) {
  return apiRequest("/reports", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function analyzeMessage(message) {
  return apiRequest("/analyze/message", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}