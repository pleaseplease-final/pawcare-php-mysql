// Public links and browser access use deployment configuration, never request headers.
export function appUrl() {
  const configured = process.env.APP_URL || process.env.SITE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  if (!configured && process.env.NODE_ENV === 'production') throw new Error('Configure APP_URL for the clinic.');
  const url = new URL(configured || 'http://localhost:5173');
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
    || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')) throw new Error('APP_URL must be a trusted HTTPS URL in production.');
  return url.href.replace(/\/+$/, '');
}
export const sessionCookie = maxAge => ({httpOnly:true, sameSite:'lax', secure:process.env.NODE_ENV === 'production', path:'/', maxAge});
export function trustedBrowserOrigin(req,res,next) {
  const origin = req.get('Origin');
  try {
    const allowedOrigin = new URL(appUrl()).origin;
    if (origin && origin !== allowedOrigin) return res.status(403).json({error:'This browser origin is not allowed.'});
    // No Origin is normal for server clients; browser writes still use SameSite cookies.
    next();
  } catch {
    res.status(503).json({error:'The clinic application URL is not configured correctly.'});
  }
}
export const clinicCors = {origin(origin,callback) {
  try {callback(null, !origin || origin === new URL(appUrl()).origin);}
  catch {callback(null,false);}
}, credentials:true};
