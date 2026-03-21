import { describe, it, expect } from 'vitest';
import { encryptPrivateKey, decryptPrivateKey, generateSessionKey } from '@/lib/crypto-utils';
import { ethers } from 'ethers';

describe('[UNIT] crypto-utils', () => {
  const masterSecret = 'test-master-secret-for-testing-only';
  const testPrivateKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

  describe('encryptPrivateKey', () => {
    it('should encrypt a private key and return formatted string', () => {
      const encrypted = encryptPrivateKey(testPrivateKey, masterSecret);
      
      // Format: salt:iv:authTag:ciphertext
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(4);
      
      // Verify hex encoding
      parts.forEach(part => {
        expect(part).toMatch(/^[0-9a-f]+$/);
      });
      
      // Salt should be 32 bytes = 64 hex chars
      expect(parts[0]).toHaveLength(64);
      
      // IV should be 16 bytes = 32 hex chars
      expect(parts[1]).toHaveLength(32);
      
      // Auth tag should be 16 bytes = 32 hex chars
      expect(parts[2]).toHaveLength(32);
      
      // Ciphertext should exist
      expect(parts[3].length).toBeGreaterThan(0);
    });

    it('should produce different ciphertext for same plaintext (due to random IV/salt)', () => {
      const encrypted1 = encryptPrivateKey(testPrivateKey, masterSecret);
      const encrypted2 = encryptPrivateKey(testPrivateKey, masterSecret);
      
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should handle empty string', () => {
      const encrypted = encryptPrivateKey('', masterSecret);
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(4);
    });
  });

  describe('decryptPrivateKey', () => {
    it('should decrypt encrypted private key correctly', () => {
      const encrypted = encryptPrivateKey(testPrivateKey, masterSecret);
      const decrypted = decryptPrivateKey(encrypted, masterSecret);
      
      expect(decrypted).toBe(testPrivateKey);
    });

    it('should fail with wrong master secret', () => {
      const encrypted = encryptPrivateKey(testPrivateKey, masterSecret);
      
      expect(() => {
        decryptPrivateKey(encrypted, 'wrong-secret');
      }).toThrow();
    });

    it('should fail with tampered ciphertext', () => {
      const encrypted = encryptPrivateKey(testPrivateKey, masterSecret);
      const parts = encrypted.split(':');
      
      // Tamper with ciphertext
      const tampered = parts.slice(0, 3).join(':') + ':deadbeef';
      
      expect(() => {
        decryptPrivateKey(tampered, masterSecret);
      }).toThrow();
    });

    it('should fail with invalid format', () => {
      expect(() => {
        decryptPrivateKey('invalid:format', masterSecret);
      }).toThrow('Invalid encrypted data format');
      
      expect(() => {
        decryptPrivateKey('only:three:parts', masterSecret);
      }).toThrow('Invalid encrypted data format');
    });

    it('should handle round-trip encryption/decryption', () => {
      const originalKeys = [
        '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        '0x0000000000000000000000000000000000000000000000000000000000000001',
        '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
      ];

      originalKeys.forEach(key => {
        const encrypted = encryptPrivateKey(key, masterSecret);
        const decrypted = decryptPrivateKey(encrypted, masterSecret);
        expect(decrypted).toBe(key);
      });
    });
  });

  describe('generateSessionKey', () => {
    it('should generate valid Ethereum address and private key', () => {
      const { address, privateKey } = generateSessionKey();
      
      // Address should be valid Ethereum address
      expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(ethers.isAddress(address)).toBe(true);
      
      // Private key should be 32 bytes = 64 hex chars (without 0x prefix)
      expect(privateKey).toMatch(/^[0-9a-f]{64}$/);
      expect(privateKey.length).toBe(64);
    });

    it('should generate unique keys each time', () => {
      const key1 = generateSessionKey();
      const key2 = generateSessionKey();
      
      expect(key1.address).not.toBe(key2.address);
      expect(key1.privateKey).not.toBe(key2.privateKey);
    });

    it('should generate keys that can create valid ethers Wallet', () => {
      const { address, privateKey } = generateSessionKey();
      
      // Should be able to create wallet from generated private key
      const wallet = new ethers.Wallet(privateKey);
      expect(wallet.address).toBe(address);
    });

    it('should generate 10 unique addresses', () => {
      const addresses = new Set<string>();
      const privateKeys = new Set<string>();
      
      for (let i = 0; i < 10; i++) {
        const { address, privateKey } = generateSessionKey();
        addresses.add(address);
        privateKeys.add(privateKey);
      }
      
      expect(addresses.size).toBe(10);
      expect(privateKeys.size).toBe(10);
    });

    it('should derive correct address from private key', () => {
      const { address, privateKey } = generateSessionKey();
      
      // Verify address derivation
      const wallet = new ethers.Wallet(privateKey);
      const derivedAddress = wallet.address;
      
      expect(derivedAddress).toBe(address);
      expect(ethers.getAddress(derivedAddress)).toBe(ethers.getAddress(address));
    });
  });

  describe('security properties', () => {
    it('should not leak plaintext in encrypted output', () => {
      const plaintext = 'sensitive-private-key-data-12345';
      const encrypted = encryptPrivateKey(plaintext, masterSecret);
      
      expect(encrypted.toLowerCase()).not.toContain(plaintext.toLowerCase());
      expect(encrypted).not.toContain('sensitive');
      expect(encrypted).not.toContain('private');
    });

    it('should use different salt for each encryption', () => {
      const encrypted1 = encryptPrivateKey(testPrivateKey, masterSecret);
      const encrypted2 = encryptPrivateKey(testPrivateKey, masterSecret);
      
      const salt1 = encrypted1.split(':')[0];
      const salt2 = encrypted2.split(':')[0];
      
      expect(salt1).not.toBe(salt2);
    });

    it('should use different IV for each encryption', () => {
      const encrypted1 = encryptPrivateKey(testPrivateKey, masterSecret);
      const encrypted2 = encryptPrivateKey(testPrivateKey, masterSecret);
      
      const iv1 = encrypted1.split(':')[1];
      const iv2 = encrypted2.split(':')[1];
      
      expect(iv1).not.toBe(iv2);
    });
  });
});
