/**
 * Unit tests for BLS signature functions
 * Tests BLS12-381 signature generation, verification, and aggregation
 */

import {
  generateBLSKeyPair,
  generateBLSSignature,
  verifyBLSSignature,
  aggregateBLSSignatures
} from '../utils/cryptoUtils';

describe('BLS Signatures (BLS12-381)', () => {
  describe('Key Generation', () => {
    it('should generate a valid BLS key pair', () => {
      const keyPair = generateBLSKeyPair();
      
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();
      expect(typeof keyPair.privateKey).toBe('string');
      expect(typeof keyPair.publicKey).toBe('string');
      expect(keyPair.privateKey.length).toBeGreaterThan(0);
      expect(keyPair.publicKey.length).toBeGreaterThan(0);
    });

    it('should generate different key pairs each time', () => {
      const keyPair1 = generateBLSKeyPair();
      const keyPair2 = generateBLSKeyPair();
      
      expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);
      expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
    });
  });

  describe('Single Signature', () => {
    it('should sign and verify a message with string input', () => {
      const keyPair = generateBLSKeyPair();
      const message = 'Hello, Ethereum!';
      
      const signature = generateBLSSignature(message, keyPair.privateKey);
      const isValid = verifyBLSSignature(message, signature, keyPair.publicKey);
      
      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(isValid).toBe(true);
    });

    it('should sign and verify a message with Uint8Array input', () => {
      const keyPair = generateBLSKeyPair();
      const message = new Uint8Array([1, 2, 3, 4, 5]);
      
      const signature = generateBLSSignature(message, keyPair.privateKey);
      const isValid = verifyBLSSignature(message, signature, keyPair.publicKey);
      
      expect(isValid).toBe(true);
    });

    it('should fail verification with wrong public key', () => {
      const keyPair1 = generateBLSKeyPair();
      const keyPair2 = generateBLSKeyPair();
      const message = 'Test message';
      
      const signature = generateBLSSignature(message, keyPair1.privateKey);
      const isValid = verifyBLSSignature(message, signature, keyPair2.publicKey);
      
      expect(isValid).toBe(false);
    });

    it('should fail verification with modified message', () => {
      const keyPair = generateBLSKeyPair();
      const originalMessage = 'Original message';
      const modifiedMessage = 'Modified message';
      
      const signature = generateBLSSignature(originalMessage, keyPair.privateKey);
      const isValid = verifyBLSSignature(modifiedMessage, signature, keyPair.publicKey);
      
      expect(isValid).toBe(false);
    });

    it('should be deterministic - same message and key produce same signature', () => {
      const keyPair = generateBLSKeyPair();
      const message = 'Deterministic test';
      
      const signature1 = generateBLSSignature(message, keyPair.privateKey);
      const signature2 = generateBLSSignature(message, keyPair.privateKey);
      
      expect(signature1).toBe(signature2);
    });
  });

  describe('Signature Aggregation', () => {
    it('should aggregate multiple signatures into one', () => {
      const message = 'Common message for all validators';
      
      // Create 3 validators
      const validator1 = generateBLSKeyPair();
      const validator2 = generateBLSKeyPair();
      const validator3 = generateBLSKeyPair();
      
      // Each validator signs the same message
      const sig1 = generateBLSSignature(message, validator1.privateKey);
      const sig2 = generateBLSSignature(message, validator2.privateKey);
      const sig3 = generateBLSSignature(message, validator3.privateKey);
      
      // Aggregate the signatures
      const aggregatedSig = aggregateBLSSignatures([sig1, sig2, sig3]);
      
      expect(aggregatedSig).toBeDefined();
      expect(typeof aggregatedSig).toBe('string');
      // Aggregated signature should be different from individual signatures
      expect(aggregatedSig).not.toBe(sig1);
      expect(aggregatedSig).not.toBe(sig2);
      expect(aggregatedSig).not.toBe(sig3);
    });

    it('should handle single signature aggregation', () => {
      const keyPair = generateBLSKeyPair();
      const message = 'Single signature';
      
      const signature = generateBLSSignature(message, keyPair.privateKey);
      const aggregated = aggregateBLSSignatures([signature]);
      
      // Single signature aggregation should return the same signature
      expect(aggregated).toBe(signature);
      
      // Should still verify correctly
      const isValid = verifyBLSSignature(message, aggregated, keyPair.publicKey);
      expect(isValid).toBe(true);
    });

    it('should throw error when aggregating empty array', () => {
      expect(() => {
        aggregateBLSSignatures([]);
      }).toThrow('Cannot aggregate empty signature array');
    });
  });
});
