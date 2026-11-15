// Encryption at rest for third-party secrets a professional gives us (Voice Monkey token).
// AES-256-GCM with DATA_ENCRYPTION_KEY (32 bytes, base64); output "v1.<iv>.<tag>.<ciphertext>".
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function parseKey(base64: string): Buffer {
  const key = Buffer.from(base64, 'base64');
  if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY precisa ter 32 bytes em base64');
  return key;
}

export function seal(key: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv, c.getAuthTag(), ct]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

/** Throws if the value was tampered with or sealed with another key. */
export function open(key: Buffer, sealed: string): string {
  const [v, iv, tag, ct] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || ct === undefined) throw new Error('formato cifrado inválido');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}
