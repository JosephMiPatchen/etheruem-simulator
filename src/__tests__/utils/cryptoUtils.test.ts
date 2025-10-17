import { 
  sha256Hash,
  isHashBelowCeiling,
  generatePrivateKey,
  derivePublicKey,
  generateAddress,
  generateSignature,
  verifySignature,
  hexToBuffer,
  bufferToHex
} from '../../utils/cryptoUtils';

// Mock console methods
const originalConsole = { ...console };
beforeAll(() => {
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
  console.info = jest.fn();
});

afterAll(() => {
  console.log = originalConsole.log;
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
});

describe('Crypto Utilities', () => {
  describe('sha256Hash', () => {
    it('should create consistent hashes for the same input', () => {
      const input = { test: 'data' };
      const hash1 = sha256Hash(input);
      const hash2 = sha256Hash(input);
      
      expect(hash1).toBe(hash2);
    });
    
    it('should create different hashes for different inputs', () => {
      const input1 = { test: 'data1' };
      const input2 = { test: 'data2' };
      
      const hash1 = sha256Hash(input1);
      const hash2 = sha256Hash(input2);
      
      expect(hash1).not.toBe(hash2);
    });
    
    it('should handle string inputs', () => {
      const input = 'test string';
      const hash = sha256Hash(input);
      
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA-256 produces a 64-character hex string
    });
  });
  
  describe('isHashBelowCeiling', () => {
    it('should return true when hash is below ceiling', () => {
      const hash = '0000000000000000000000000000000000000000000000000000000000000001';
      const ceiling = '0000000000000000000000000000000000000000000000000000000000000002';
      
      expect(isHashBelowCeiling(hash, ceiling)).toBe(true);
    });
    
    it('should return false when hash is above ceiling', () => {
      const hash = '0000000000000000000000000000000000000000000000000000000000000002';
      const ceiling = '0000000000000000000000000000000000000000000000000000000000000001';
      
      expect(isHashBelowCeiling(hash, ceiling)).toBe(false);
    });
    
    it('should handle equal values', () => {
      const hash = '0000000000000000000000000000000000000000000000000000000000000001';
      const ceiling = '0000000000000000000000000000000000000000000000000000000000000001';
      
      expect(isHashBelowCeiling(hash, ceiling)).toBe(false);
    });
  });
  
  describe('Key Generation and Derivation', () => {
    it('should generate consistent private keys for the same node ID', () => {
      const nodeId = 'test-node';
      const key1 = generatePrivateKey(nodeId);
      const key2 = generatePrivateKey(nodeId);
      
      expect(key1).toBe(key2);
    });
    
    it('should derive consistent public keys from the same private key', () => {
      const privateKey = generatePrivateKey('test-node');
      const publicKey1 = derivePublicKey(privateKey);
      const publicKey2 = derivePublicKey(privateKey);
      
      expect(publicKey1).toBe(publicKey2);
    });
    
    it('should generate different private keys for different node IDs', () => {
      const key1 = generatePrivateKey('node1');
      const key2 = generatePrivateKey('node2');
      
      expect(key1).not.toBe(key2);
    });
    
    it('should generate consistent addresses from the same public key', () => {
      const publicKey = derivePublicKey(generatePrivateKey('test-node'));
      const address1 = generateAddress(publicKey);
      const address2 = generateAddress(publicKey);
      
      expect(address1).toBe(address2);
    });
  });
  
  describe('Signatures', () => {
    const testData = {
      sourceOutputId: 'test-output',
      allOutputs: [{ idx: 0, nodeId: 'test-node', value: 10, lock: 'test-lock' }],
      txid: 'test-txid'
    };
    
    it('should generate and verify valid signatures', async () => {
      const privateKey = generatePrivateKey('test-node');
      const publicKey = derivePublicKey(privateKey);
      
      const signature = await generateSignature(testData, privateKey);
      const isValid = await verifySignature(testData, signature, publicKey);
      
      expect(isValid).toBe(true);
    });
    
    it('should reject invalid signatures', async () => {
      const privateKey1 = generatePrivateKey('node1');
      const privateKey2 = generatePrivateKey('node2');
      
      // Sign with privateKey1 but verify with publicKey2
      const signature = await generateSignature(testData, privateKey1);
      const isValid = await verifySignature(testData, signature, derivePublicKey(privateKey2));
      
      expect(isValid).toBe(false);
    });
    
    it('should reject signatures for modified data', async () => {
      const privateKey = generatePrivateKey('test-node');
      const publicKey = derivePublicKey(privateKey);
      
      const signature = await generateSignature(testData, privateKey);
      
      // Modify the data
      const modifiedData = {
        ...testData,
        sourceOutputId: 'modified-output'
      };
      
      const isValid = await verifySignature(modifiedData, signature, publicKey);
      expect(isValid).toBe(false);
    });
  });
  
  describe('Buffer Conversion', () => {
    it('should convert hex to buffer and back', () => {
      const originalHex = '0123456789abcdef';
      const buffer = hexToBuffer(originalHex);
      const resultHex = bufferToHex(buffer);
      
      expect(resultHex).toBe(originalHex);
    });
    
    it('should handle empty hex string', () => {
      const buffer = hexToBuffer('');
      const resultHex = bufferToHex(buffer);
      
      expect(resultHex).toBe('');
    });
  });
});
