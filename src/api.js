// Thin wrapper around the server API. Throws an Error with a readable message on failure.

async function request(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await response.json(); } catch { /* empty body */ }
  if (!response.ok) {
    const error = new Error((data && data.error) || `Request failed (${response.status})`);
    error.status = response.status;
    error.details = data && data.details;
    if (response.status === 401) window.dispatchEvent(new CustomEvent('weekwell:signed-out'));
    throw error;
  }
  return data;
}

export const api = {
  authConfig: () => request('GET', '/auth/config'),
  me: () => request('GET', '/api/me'),
  logout: () => request('POST', '/auth/logout'),
  getState: () => request('GET', '/api/state'),
  putState: (state) => request('PUT', '/api/state', state),
  listTransactions: (from, to) => request('GET', `/api/transactions?${new URLSearchParams({ ...(from && { from }), ...(to && { to }) })}`),
  addTransaction: (t) => request('POST', '/api/transactions', t),
  updateTransaction: (id, t) => request('PUT', `/api/transactions/${encodeURIComponent(id)}`, t),
  deleteTransaction: (id) => request('DELETE', `/api/transactions/${encodeURIComponent(id)}`),
  renameCategory: (from, to) => request('POST', '/api/transactions/rename-category', { from, to }),
  upStatus: () => request('GET', '/api/up/status'),
  upSync: () => request('POST', '/api/up/sync'),
  exportAll: () => request('GET', '/api/export'),
  importAll: (backup) => request('POST', '/api/import', backup),
};
