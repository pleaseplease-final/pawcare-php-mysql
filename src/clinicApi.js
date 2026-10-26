// Every clinic operation must receive a real server acknowledgment.
export async function clinicRequest(method, path, body, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (options.ifNoneMatch) headers['If-None-Match'] = options.ifNoneMatch;
  try {
    const token = globalThis.localStorage?.getItem('pawcare_token') || globalThis.sessionStorage?.getItem('pawcare_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch { /* Cookie sessions still work when browser storage is unavailable. */ }
  let response;
  try {
    response = await fetch(path, { method, headers, credentials: 'include', ...(options.signal ? {signal: options.signal} : {}), ...(method === 'GET' ? {cache: 'no-store'} : {}), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch {
    throw new Error('Unable to reach the clinic server. Your changes have not been confirmed. Check your connection and retry.');
  }
  if (response.status === 304 && options.responseMetadata && options.ifNoneMatch) {
    return {notModified: true, etag: options.ifNoneMatch};
  }
  if(options.blob && response.ok) {
    if(!response.headers.get('Content-Type')?.startsWith('application/pdf'))throw new Error('The clinic server did not return a PDF. Please retry.');
    return response.blob();
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error('The clinic server returned an invalid response. Refresh to check whether your changes were saved.'); }
  if (!data || typeof data !== 'object') throw new Error('The clinic server returned an invalid response. Refresh to check your records.');
  if (!response.ok || data?.success === false) {
    const error = new Error(data?.error || `The clinic request failed (${response.status}). Please try again.`);
    error.status = response.status;
    error.fields = data?.errors;
    error.cooldownUntil = data?.cooldownUntil;
    error.unlockRequired = data?.unlockRequired === true;
    error.unverified = data?.unverified === true;
    error.retryAfter = Number(data?.retryAfter || response.headers.get("Retry-After")) || 0;
    error.isApiError = true;
    throw error;
  }
  if (data.token) {
    try { globalThis.localStorage?.setItem('pawcare_token', data.token); globalThis.sessionStorage?.setItem('pawcare_token', data.token); } catch { /* Cookie session remains available. */ }
  }
  const value = data?.data !== undefined ? data.data : data;
  return options.responseMetadata ? {data: value, etag: response.headers.get('ETag'), notModified: false} : value;
}
