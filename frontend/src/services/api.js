// src/services/api.js
const API_URL = import.meta.env.VITE_API_URL;

async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem("access_token");

  // const headers = {
  //   "Content-Type": "application/json",
  //   ...(token ? { Authorization: `Bearer ${token}` } : {}),
  //   ...options.headers,
  // };
  const isFormData = options.body instanceof FormData;

  const headers = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const detail =
      (data && typeof data === "object" && data.detail) ||
      (typeof data === "string" ? data : null) ||
      res.statusText ||
      "Erro ao comunicar com a API";
    const error = new Error(detail);
    error.status = res.status;
    error.payload = data;
    throw error;
  }

  return data;

}

// exporta como default
export default apiFetch;

// e também nomeado, se precisar
export { apiFetch };
