import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
export function passwordHash(password, salt = randomBytes(16).toString('hex')) { return { salt, hash: scryptSync(password, salt, 32).toString('hex') }; }
export function passwordMatches(password, saved) { return typeof password === 'string' && password.length <= 256 && timingSafeEqual(Buffer.from(saved.hash, 'hex'), scryptSync(password, saved.salt, 32)); }
export class Sessions {
  constructor(password) { this.password = password; this.sessions = new Map(); this.attempts = new Map(); }
  login(address, password, now = Date.now()) {
    for (const [key, item] of this.sessions) if (item.expires <= now) this.sessions.delete(key);
    for (const [key, item] of this.attempts) if (item.until <= now) this.attempts.delete(key);
    const attempt = this.attempts.get(address) || { count: 0, until: now + 900000 };
    if (attempt.count >= 5) return { status: 429 };
    attempt.count++; this.attempts.set(address, attempt);
    if (!passwordMatches(password, this.password)) return { status: 401 };
    this.attempts.delete(address);
    const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
    this.sessions.set(token, { csrf, expires: now + 8 * 3600000 });
    return { status: 200, token, csrf };
  }
  get(cookie = '', now = Date.now()) {
    const token = cookie.split(';').map(s => s.trim()).find(s => s.startsWith('__Host-varta='))?.slice(13);
    const session = this.sessions.get(token);
    if (session?.expires > now) return { ...session, token };
    if (token) this.sessions.delete(token);
    return null;
  }
}
