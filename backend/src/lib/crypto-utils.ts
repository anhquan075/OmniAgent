import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

/// Derive encryption key from master secret using scrypt
function deriveKey(masterSecret: string, salt: Buffer): Buffer {
  return scryptSync(masterSecret, salt, 32);
}

/**
 * Encrypt a private key with AES-256-GCM
 * @param plaintext The private key to encrypt (hex string)
 * @param masterSecret The master secret from environment
 * @returns Encrypted string: salt:iv:authTag:ciphertext (all hex)
 */
export function encryptPrivateKey(plaintext: string, masterSecret: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(masterSecret, salt);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  // Format: salt:iv:authTag:ciphertext
  return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a private key encrypted with AES-256-GCM
 * @param encryptedData The encrypted string (salt:iv:authTag:ciphertext)
 * @param masterSecret The master secret from environment
 * @returns Decrypted private key (hex string)
 */
export function decryptPrivateKey(encryptedData: string, masterSecret: string): string {
  const [saltHex, ivHex, authTagHex, ciphertext] = encryptedData.split(':');
  
  if (!saltHex || !ivHex || !authTagHex || !ciphertext) {
    throw new Error('Invalid encrypted data format');
  }

  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = deriveKey(masterSecret, salt);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generate a random Ethereum private key
 * @returns Object with address and privateKey (both hex strings)
 */
export function generateSessionKey(): { address: string; privateKey: string } {
  const privateKeyBytes = randomBytes(32);
  const privateKey = privateKeyBytes.toString('hex');
  
  // Derive address from private key (simplified - in production use proper key derivation)
  // This is a mock address generation - in real implementation, use ethers.utils.computeAddress
  const { ethers } = require('ethers');
  const wallet = new ethers.Wallet(privateKey);
  
  return {
    address: wallet.address,
    privateKey: privateKey
  };
}
