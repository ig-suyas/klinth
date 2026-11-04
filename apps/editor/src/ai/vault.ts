import { z } from 'zod';

/**
 * Key vault: the user's Gemini key, locked with their passphrase.
 * PBKDF2-SHA-256 (600,000+ iterations, random salt) makes an AES-GCM key;
 * only the ciphertext, salt and IV are stored. The passphrase never is.
 *
 * Honest limit: this stops casual access (someone opening the browser's
 * storage). It cannot stop a malicious script that runs while the vault is open.
 */

export const VAULT_STORAGE_KEY = 'klinth.vault.v1';
export const PBKDF2_ITERATIONS = 600_000;
export const MIN_PASSPHRASE = 8;
/** Ties the ciphertext to its purpose, so it cannot be swapped for other data. */
const AAD = new TextEncoder().encode('klinth:gemini-key:v1');

const base64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/);

const recordSchema = z
  .object({
    v: z.literal(1),
    // A stored record can never lower the cost below the minimum.
    iterations: z.number().int().min(PBKDF2_ITERATIONS).max(10_000_000),
    salt: base64,
    iv: base64,
    data: base64,
  })
  .strict();

export type VaultRecord = z.infer<typeof recordSchema>;

export class VaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultError';
  }
}

function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Locks `secret` with `passphrase`. Takes about half a second on purpose. */
export async function sealKey(
  secret: string,
  passphrase: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<VaultRecord> {
  if (passphrase.length < MIN_PASSPHRASE) {
    throw new VaultError(`Use a passphrase of at least ${MIN_PASSPHRASE} characters.`);
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations);
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: AAD },
    key,
    new TextEncoder().encode(secret),
  );
  return recordSchema.parse({
    v: 1,
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(data)),
  });
}

/** Unlocks a record. A wrong passphrase (or changed data) throws a VaultError. */
export async function openVault(record: VaultRecord, passphrase: string): Promise<string> {
  const checked = recordSchema.parse(record);
  const key = await deriveKey(passphrase, fromBase64(checked.salt), checked.iterations);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(checked.iv), additionalData: AAD },
      key,
      fromBase64(checked.data),
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new VaultError('That passphrase is not right. Please try again.');
  }
}

type KeyStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStore(): KeyStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The saved record, or null when there is none (or it is damaged). */
export function readVault(store: KeyStore | null = defaultStore()): VaultRecord | null {
  const raw = store?.getItem(VAULT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = recordSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeVault(record: VaultRecord, store: KeyStore | null = defaultStore()): void {
  if (!store)
    throw new VaultError(
      'This browser does not allow saving. Your key works until you close the tab.',
    );
  store.setItem(VAULT_STORAGE_KEY, JSON.stringify(recordSchema.parse(record)));
}

export function forgetVault(store: KeyStore | null = defaultStore()): void {
  store?.removeItem(VAULT_STORAGE_KEY);
}
