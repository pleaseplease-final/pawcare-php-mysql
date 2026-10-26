import { createHash } from 'node:crypto';

// Call only after authentication, scope filtering and successful database reads.
// Do not cache clinical records in a shared proxy or persist them in a browser.
export function sendClinicState(req, res, data) {
  const body = JSON.stringify({success: true, data});
  const etag = `"${createHash('sha256').update(body).digest('hex')}"`;
  res.set('ETag', etag);
  res.set('Cache-Control', 'private, no-store');
  if (req.get('If-None-Match') === etag) return res.status(304).end();
  return res.type('json').send(body);
}
