/**
 * MT5 Credential Encryption/Decryption Utility
 * AES-256 encryption for storing credentials locally
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_FILE = path.join(__dirname, '../data/mt5_credentials.json');
const ALGORITHM = 'aes-256-gcm';

class CredentialEncryption {
  constructor(encryptionKey) {
    // Encryption key should be 32 bytes for AES-256
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY environment variable not set');
    }
    
    // If key is a string, derive a 32-byte key from it
    if (typeof encryptionKey === 'string') {
      this.key = crypto
        .createHash('sha256')
        .update(String(encryptionKey))
        .digest();
    } else {
      this.key = encryptionKey;
    }
    
    if (this.key.length !== 32) {
      throw new Error('Encryption key must be 32 bytes');
    }
  }

  /**
   * Encrypt MT5 credentials
   * @param {number} account - MT5 account number
   * @param {string} password - MT5 password
   * @param {string} server - MT5 server name
   * @returns {object} Encrypted data with IV and auth tag
   */
  encryptCredentials(account, password, server) {
    try {
      const plaintext = JSON.stringify({
        account,
        password,
        server,
        timestamp: Date.now()
      });

      // Generate random IV
      const iv = crypto.randomBytes(16);

      // Create cipher
      const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
      
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt MT5 credentials
   * @param {object} encryptedData - Contains encrypted, iv, authTag
   * @returns {object} {account, password, server, timestamp}
   */
  decryptCredentials(encryptedData) {
    try {
      const { encrypted, iv, authTag } = encryptedData;

      if (!encrypted || !iv || !authTag) {
        throw new Error('Missing encryption data');
      }

      const ivBuffer = Buffer.from(iv, 'hex');
      const authTagBuffer = Buffer.from(authTag, 'hex');

      // Create decipher
      const decipher = crypto.createDecipheriv(ALGORITHM, this.key, ivBuffer);
      decipher.setAuthTag(authTagBuffer);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted);
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Save encrypted credentials to disk
   * @param {number} account - Account number
   * @param {string} password - Password
   * @param {string} server - Server name
   */
  saveCredentials(account, password, server) {
    try {
      // Create data directory if doesn't exist
      const dataDir = path.dirname(CREDENTIALS_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const encrypted = this.encryptCredentials(account, password, server);
      fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(encrypted, null, 2));

      console.log('[CredentialEncryption] Credentials saved to disk');
    } catch (error) {
      console.error(`[CredentialEncryption] Failed to save credentials: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load encrypted credentials from disk
   * @returns {object|null} {account, password, server, timestamp} or null if not found
   */
  loadCredentials() {
    try {
      if (!fs.existsSync(CREDENTIALS_FILE)) {
        console.log('[CredentialEncryption] No saved credentials found');
        return null;
      }

      const encryptedData = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
      return this.decryptCredentials(encryptedData);
    } catch (error) {
      console.error(`[CredentialEncryption] Failed to load credentials: ${error.message}`);
      return null;
    }
  }

  /**
   * Clear saved credentials
   */
  clearCredentials() {
    try {
      if (fs.existsSync(CREDENTIALS_FILE)) {
        fs.unlinkSync(CREDENTIALS_FILE);
        console.log('[CredentialEncryption] Credentials cleared');
      }
    } catch (error) {
      console.error(`[CredentialEncryption] Failed to clear credentials: ${error.message}`);
    }
  }

  /**
   * Check if credentials are saved
   * @returns {boolean}
   */
  hasCredentials() {
    return fs.existsSync(CREDENTIALS_FILE);
  }
}

// Singleton instance
let instance = null;

export function getCredentialManager() {
  if (!instance) {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new Error('ENCRYPTION_KEY environment variable not set');
    }
    instance = new CredentialEncryption(key);
  }
  return instance;
}

export default CredentialEncryption;
