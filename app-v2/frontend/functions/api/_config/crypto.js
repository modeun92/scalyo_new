/**
 * Token encryption service — AES-256-GCM via Web Crypto API
 * Cloudflare Workers compatible. EU SaaS standard: tokens encrypted at rest.
 * Key derived from ENCRYPTION_KEY env var via PBKDF2.
 */
const SALT = new Uint8Array([83,99,97,108,121,111,45,50,48,50,54]) // 'Scalyo-2026'

async function deriveKey(secret) {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: SALT, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encryptToken(plaintext, encryptionKey) {
  if (!plaintext || !encryptionKey) return null
  const key = await deriveKey(encryptionKey)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = new TextEncoder()
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext))
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)
  return btoa(String.fromCharCode(...combined))
}

export async function decryptToken(ciphertext, encryptionKey) {
  if (!ciphertext || !encryptionKey) return null
  try {
    const key = await deriveKey(encryptionKey)
    const raw = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0))
    const iv = raw.slice(0, 12)
    const data = raw.slice(12)
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
    return new TextDecoder().decode(decrypted)
  } catch { return null }
}
