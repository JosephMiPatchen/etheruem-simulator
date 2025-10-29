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

    it('should verify aggregated signature with multiple public keys', () => {
      const message = 'Attestation for block 12345';
      
      // Create 4 validators
      const validators = [
        generateBLSKeyPair(),
        generateBLSKeyPair(),
        generateBLSKeyPair(),
        generateBLSKeyPair()
      ];
      
      // Each validator signs the message
      const signatures = validators.map(v => 
        generateBLSSignature(message, v.privateKey)
      );
      
      // Aggregate signatures
      const aggregatedSig = aggregateBLSSignatures(signatures);
      
      // Verify with all public keys
      const publicKeys = validators.map(v => v.publicKey);
      const isValid = verifyBLSSignature(message, aggregatedSig, publicKeys);
      
      expect(isValid).toBe(true);
    });

    it('should fail verification if one validator is missing from public keys', () => {
      const message = 'Block attestation';
      
      const validators = [
        generateBLSKeyPair(),
        generateBLSKeyPair(),
        generateBLSKeyPair()
      ];
      
      // All 3 validators sign
      const signatures = validators.map(v => 
        generateBLSSignature(message, v.privateKey)
      );
      const aggregatedSig = aggregateBLSSignatures(signatures);
      
      // Try to verify with only 2 public keys (missing one)
      const incompletePublicKeys = [validators[0].publicKey, validators[1].publicKey];
      const isValid = verifyBLSSignature(message, aggregatedSig, incompletePublicKeys);
      
      expect(isValid).toBe(false);
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

    it('should demonstrate O(1) verification benefit - constant signature size', () => {
      const message = 'Epoch 100 attestation';
      
      // Simulate 100 validators (like a small Ethereum committee)
      const validators = Array.from({ length: 100 }, () => generateBLSKeyPair());
      
      // Each validator signs
      const signatures = validators.map(v => 
        generateBLSSignature(message, v.privateKey)
      );
      
      // Aggregate all 100 signatures
      const aggregatedSig = aggregateBLSSignatures(signatures);
      
      // Key insight: aggregated signature size is constant!
      // Individual signatures would be 100 * signature_size
      // Aggregated signature is just 1 * signature_size
      expect(aggregatedSig.length).toBeLessThan(signatures.join('').length);
      
      // Verify with all 100 public keys
      const publicKeys = validators.map(v => v.publicKey);
      const isValid = verifyBLSSignature(message, aggregatedSig, publicKeys);
      
      expect(isValid).toBe(true);
    });
  });

  describe('RANDAO Use Case', () => {
    it('should sign epoch number for RANDAO reveal', () => {
      const validator = generateBLSKeyPair();
      const epoch = 12345;
      const epochBytes = new Uint8Array(new BigUint64Array([BigInt(epoch)]).buffer);
      
      // Validator signs the epoch number
      const randaoReveal = generateBLSSignature(epochBytes, validator.privateKey);
      
      // Verify the reveal
      const isValid = verifyBLSSignature(epochBytes, randaoReveal, validator.publicKey);
      
      expect(isValid).toBe(true);
    });

    it('should demonstrate RANDAO reveal is deterministic per validator per epoch', () => {
      const validator = generateBLSKeyPair();
      const epoch = 999;
      const epochBytes = new Uint8Array(new BigUint64Array([BigInt(epoch)]).buffer);
      
      // Same validator signing same epoch multiple times
      const reveal1 = generateBLSSignature(epochBytes, validator.privateKey);
      const reveal2 = generateBLSSignature(epochBytes, validator.privateKey);
      
      // Should produce identical reveals
      expect(reveal1).toBe(reveal2);
    });

    it('should produce different reveals for different epochs', () => {
      const validator = generateBLSKeyPair();
      const epoch1 = 100;
      const epoch2 = 101;
      
      const epoch1Bytes = new Uint8Array(new BigUint64Array([BigInt(epoch1)]).buffer);
      const epoch2Bytes = new Uint8Array(new BigUint64Array([BigInt(epoch2)]).buffer);
      
      const reveal1 = generateBLSSignature(epoch1Bytes, validator.privateKey);
      const reveal2 = generateBLSSignature(epoch2Bytes, validator.privateKey);
      
      // Different epochs should produce different reveals
      expect(reveal1).not.toBe(reveal2);
    });

    it('should produce different reveals for different validators', () => {
      const validator1 = generateBLSKeyPair();
      const validator2 = generateBLSKeyPair();
      const epoch = 500;
      const epochBytes = new Uint8Array(new BigUint64Array([BigInt(epoch)]).buffer);
      
      const reveal1 = generateBLSSignature(epochBytes, validator1.privateKey);
      const reveal2 = generateBLSSignature(epochBytes, validator2.privateKey);
      
      // Different validators should produce different reveals
      expect(reveal1).not.toBe(reveal2);
    });
  });

  describe('Ethereum PoS Attestation Simulation', () => {
    it('should simulate committee attestation aggregation', () => {
      const blockRoot = 'Block root hash for slot 12345';
      const committeeSize = 128; // Typical Ethereum committee size
      
      // Create committee of validators
      const committee = Array.from({ length: committeeSize }, () => generateBLSKeyPair());
      
      // Each committee member attests to the block
      const attestations = committee.map(validator =>
        generateBLSSignature(blockRoot, validator.privateKey)
      );
      
      // Aggregate all attestations
      const aggregatedAttestation = aggregateBLSSignatures(attestations);
      
      // Verify the aggregated attestation
      const publicKeys = committee.map(v => v.publicKey);
      const isValid = verifyBLSSignature(blockRoot, aggregatedAttestation, publicKeys);
      
      expect(isValid).toBe(true);
      
      // Demonstrate space savings: 128 signatures → 1 signature
      console.log(`Committee size: ${committeeSize}`);
      console.log(`Individual signatures total length: ${attestations.join('').length}`);
      console.log(`Aggregated signature length: ${aggregatedAttestation.length}`);
      console.log(`Space savings: ${((1 - aggregatedAttestation.length / attestations.join('').length) * 100).toFixed(2)}%`);
    });
  });
});
