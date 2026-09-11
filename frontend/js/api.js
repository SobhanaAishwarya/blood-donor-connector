/* Thin fetch wrapper. Consistent errors, bearer-token injection, JSON in/out. */
window.BDC = window.BDC || {};

BDC.token = {
  get() { try { return localStorage.getItem(BDC.TOKEN_KEY); } catch { return null; } },
  set(t) { try { localStorage.setItem(BDC.TOKEN_KEY, t); } catch { /* ignore */ } },
  clear() { try { localStorage.removeItem(BDC.TOKEN_KEY); } catch { /* ignore */ } },
};

class ApiError extends Error {
  constructor(message, { status, code, errors } = {}) {
    super(message || "Something went wrong.");
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.errors = errors || null;
  }
}
BDC.ApiError = ApiError;

async function request(method, path, body, { auth = true, signal } = {}) {
  const headers = { "Content-Type": "application/json" };
  const tok = BDC.token.get();
  if (auth && tok) headers.Authorization = `Bearer ${tok}`;

  let res;
  try {
    res = await fetch(BDC.API_BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError("Can't reach the server. Check your connection.", { status: 0 });
  }

  let payload = null;
  const text = await res.text();
  if (text) { try { payload = JSON.parse(text); } catch { /* non-json */ } }

  if (!res.ok || (payload && payload.success === false)) {
    const msg = (payload && (payload.error || payload.message)) || `Request failed (${res.status})`;
    if (res.status === 401 && auth) {
      BDC.token.clear();
      // bounce to login unless we're already on a public page
      if (!/\/(login|register|index)\.html$/.test(location.pathname) && location.pathname !== "/") {
        const next = encodeURIComponent(location.pathname + location.search);
        location.href = `/login.html?next=${next}`;
      }
    }
    throw new ApiError(msg, {
      status: res.status,
      code: payload && payload.code,
      errors: payload && payload.errors,
    });
  }
  return payload ? payload.data : null;
}

BDC.api = {
  get: (p, opts) => request("GET", p, undefined, opts),
  post: (p, b, opts) => request("POST", p, b ?? {}, opts),
  put: (p, b, opts) => request("PUT", p, b ?? {}, opts),
  patch: (p, b, opts) => request("PATCH", p, b ?? {}, opts),
  del: (p, opts) => request("DELETE", p, undefined, opts),
  raw: request,
};
