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
  if (!res.ok) {
    throw new Error(`Erro ${res.status}: ${res.statusText}`);
  }

  // Se não tiver corpo (ex: DELETE retorna 204), não tenta parsear JSON
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }

}

// exporta como default
export default apiFetch;

// e também nomeado, se precisar
export { apiFetch };
