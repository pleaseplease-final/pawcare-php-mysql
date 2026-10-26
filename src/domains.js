import freeDomains from 'free-email-domains';
// ~14,000 known public/free mail providers (Gmail, Outlook, Yahoo, Rocketmail, iCloud, Proton, ...). Anything else = custom/corporate = blocked.
// Add your own with EXTRA_PUBLIC_DOMAINS=a.com,b.com in .env
const extra = (typeof process !== 'undefined' && process.env?.EXTRA_PUBLIC_DOMAINS)
  || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_EXTRA_PUBLIC_DOMAINS)
  || '';

export const PUBLIC = new Set([
  ...freeDomains,
  ...String(extra).toLowerCase().split(',').map((d) => d.trim()).filter(Boolean)
]);

