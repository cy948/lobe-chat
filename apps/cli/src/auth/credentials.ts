import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface StoredApiKeyCredentials {
  token: string;
  tokenType: 'apiKey';
  userId: string;
}

export interface StoredJwtCredentials {
  expiresAt?: number;
  refreshToken?: string;
  token: string;
  tokenType: 'jwt';
  userId?: string;
}

export type StoredCredentials = StoredApiKeyCredentials | StoredJwtCredentials;

const LOBEHUB_DIR_NAME = process.env.LOBEHUB_CLI_HOME || '.lobehub';
const CREDENTIALS_DIR = path.join(os.homedir(), LOBEHUB_DIR_NAME);
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, 'credentials.json');

function deriveKey(): Buffer {
  const material = `lobehub-cli:${os.hostname()}:${os.userInfo().username}`;

  return crypto.pbkdf2Sync(material, 'lobehub-cli-salt', 100_000, 32, 'sha256');
}

function encrypt(plaintext: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, authTag, encrypted]);

  return packed.toString('base64');
}

function decrypt(encoded: string): string {
  const key = deriveKey();
  const packed = Buffer.from(encoded, 'base64');
  const iv = packed.subarray(0, 12);
  const authTag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);

  decipher.setAuthTag(authTag);

  return decipher.update(ciphertext) + decipher.final('utf8');
}

function isStoredCredentials(data: unknown): data is StoredCredentials {
  if (!data || typeof data !== 'object') return false;

  const credentials = data as Partial<StoredCredentials>;

  if (typeof credentials.token !== 'string') return false;

  if (credentials.tokenType === 'apiKey') {
    return typeof credentials.userId === 'string';
  }

  if (credentials.tokenType !== 'jwt') return false;
  if (credentials.expiresAt !== undefined && typeof credentials.expiresAt !== 'number') {
    return false;
  }
  if (credentials.refreshToken !== undefined && typeof credentials.refreshToken !== 'string') {
    return false;
  }
  if (credentials.userId !== undefined && typeof credentials.userId !== 'string') {
    return false;
  }

  return true;
}

export function saveCredentials(credentials: StoredCredentials): void {
  fs.mkdirSync(CREDENTIALS_DIR, { mode: 0o700, recursive: true });
  const encrypted = encrypt(JSON.stringify(credentials));

  fs.writeFileSync(CREDENTIALS_FILE, encrypted, { mode: 0o600 });
}

export function loadCredentials(): StoredCredentials | null {
  try {
    const data = fs.readFileSync(CREDENTIALS_FILE, 'utf8');
    const decrypted = decrypt(data);
    const credentials = JSON.parse(decrypted);

    return isStoredCredentials(credentials) ? credentials : null;
  } catch {
    return null;
  }
}

export function clearCredentials(): boolean {
  try {
    fs.unlinkSync(CREDENTIALS_FILE);
    return true;
  } catch {
    return false;
  }
}
