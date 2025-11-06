/**
 * Cryptographic utilities for the Bitcoin simulator
 * Implements all cryptographic operations including hashing, key generation, and signatures
 * Uses noble-secp256k1 for ECDSA operations and @noble/hashes for SHA-256
 */

import * as secp from 'noble-secp256k1';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

// Re-export utility functions from @noble/hashes
export { bytesToHex, hexToBytes };

/**
 * Signature input data for Ethereum transactions
 * 
 * We sign just the txid (transaction ID) because:
 * - txid = hash(from, to, value, nonce, timestamp)
 * - The txid cryptographically commits to all transaction data
 * - Signing the txid proves authorization of the complete transaction
 * - During validation, we verify both:
 *   1. hash(transaction_data) === txid (data integrity)
 *   2. signature is valid for txid (authorization)
 */
export type SignatureInput = string;  // Just the txid

/**
 * Hashes data with SHA-256
 * @param data The data to hash
 * @returns The hash as a hex string
 */
export const sha256Hash = (data: any): string => {
  // Convert the data to a JSON string for consistent hashing
  const stringData = typeof data === 'string' ? data : JSON.stringify(data);
  // Use noble-hashes for SHA-256 hashing
  const hashBytes = sha256(new TextEncoder().encode(stringData));
  return bytesToHex(hashBytes);
};

/**
 * Checks if a hash is below the ceiling (difficulty target)
 * @param hash The hash to check
 * @param ceiling The ceiling value (difficulty target)
 * @returns True if the hash is below the ceiling
 */
export const isHashBelowCeiling = (hash: string, ceiling: string): boolean => {
  // Ensure both strings are in the same format (remove 0x prefix if present)
  const normalizedHash = hash.replace('0x', '');
  const normalizedCeiling = ceiling.replace('0x', '');
  
  // Compare digit by digit from left to right
  for (let i = 0; i < normalizedHash.length && i < normalizedCeiling.length; i++) {
    const hashDigit = parseInt(normalizedHash[i], 16);
    const ceilingDigit = parseInt(normalizedCeiling[i], 16);
    
    if (hashDigit < ceilingDigit) return true;
    if (hashDigit > ceilingDigit) return false;
  }
  
  // If all digits match, consider them equal (not below)
  return false;
};

/**
 * Generates a private key from a node ID
 * @param nodeId The node ID to generate a private key for
 * @returns The private key as a hex string
 */
export function generatePrivateKey(nodeId: string): string {
  // Create a deterministic but seemingly random private key from the nodeId
  // In a real system, private keys would be randomly generated and securely stored
  const nodeIdBuffer = new TextEncoder().encode(nodeId + 'PRIVATE_KEY_SALT');
  const privateKeyBytes = sha256(nodeIdBuffer);
  return bytesToHex(privateKeyBytes);
}

/**
 * Derives a public key from a private key
 * @param privateKey The private key as a hex string
 * @returns The public key as a hex string
 */
export function derivePublicKey(privateKey: string): string {
  // Convert hex private key to bytes
  const privateKeyBytes = hexToBytes(privateKey);
  // Derive the public key from the private key using secp256k1
  const publicKeyBytes = secp.getPublicKey(privateKeyBytes, true); // true for compressed format
  return bytesToHex(publicKeyBytes);
}

/**
 * Generates an address from a public key
 * @param publicKey The public key as a hex string
 * @returns The address as a hex string
 */
export function generateAddress(publicKey: string): string {
  // In real Bitcoin, this would be: RIPEMD160(SHA256(publicKey))
  // For simplicity, we just use SHA256
  const publicKeyBytes = hexToBytes(publicKey);
  const addressBytes = sha256(publicKeyBytes);
  return bytesToHex(addressBytes);
}

/**
 * Generates a signature for transaction data
 * @param data The data to sign
 * @param privateKey The private key to sign with
 * @returns The signature as a hex string
 */
export async function generateSignature(data: SignatureInput, privateKey: string): Promise<string> {
  try {
    // Create a message hash from the transaction data
    const messageString = JSON.stringify(data);
    const messageHash = sha256(new TextEncoder().encode(messageString));
    
    // Sign the message hash with the private key
    const signatureBytes = await secp.sign(messageHash, privateKey);
    
    // Convert signature to hex string
    return bytesToHex(signatureBytes);
  } catch (error) {
    console.error('Error generating signature:', error);
    // Use a fallback signature in case of error
    return `error-${Date.now()}`;
  }
}

/**
 * Verifies a signature for transaction data
 * @param data The data that was signed
 * @param signature The signature to verify
 * @param publicKey The public key to verify against
 * @returns True if the signature is valid, false otherwise
 */
export async function verifySignature(
  data: SignatureInput, 
  signature: string, 
  publicKey: string
): Promise<boolean> {
  try {
    // If the signature starts with 'error-', it's an invalid signature
    if (signature.startsWith('error-')) {
      return false;
    }
    
    // Create message hash from the transaction data
    const messageString = JSON.stringify(data);
    const messageHash = sha256(new TextEncoder().encode(messageString));
    
    // Convert hex signature and public key to bytes
    const signatureBytes = hexToBytes(signature);
    const publicKeyBytes = hexToBytes(publicKey);
    
    // Verify the signature
    return await secp.verify(signatureBytes, messageHash, publicKeyBytes);
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
}

/**
 * Utility function to convert hex string to bytes
 * @param hex The hex string to convert
 * @returns The bytes as a Uint8Array
 */
export function hexToBuffer(hex: string): Buffer {
  const bytes = hexToBytes(hex);
  return Buffer.from(bytes);
}

/**
 * Utility function to convert bytes to hex string
 * @param buffer The buffer to convert
 * @returns The hex string
 */
export function bufferToHex(buffer: Buffer): string {
  return bytesToHex(new Uint8Array(buffer));
}

// ============================================================================
// BLS Signature Functions (BLS12-381)
// Used for Ethereum Proof of Stake consensus layer
// ============================================================================

// @ts-ignore - Library has type definitions but package.json exports issue
import { AugSchemeMPL, PrivateKey, JacobianPoint } from '@rigidity/bls-signatures';

/**
 * Generates a BLS key pair (private key and public key)
 * @returns Object containing privateKey and publicKey as hex strings
 * 
 * @example
 * const keyPair = generateBLSKeyPair();
 * console.log(keyPair.privateKey); // "a1b2c3..."
 * console.log(keyPair.publicKey);  // "d4e5f6..."
 */
export function generateBLSKeyPair(): { privateKey: string; publicKey: string } {
  // Generate random 32-byte seed
  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);
  
  // Generate private key from seed
  const privateKey = PrivateKey.fromSeed(seed);
  
  // Derive public key
  const publicKey = privateKey.getG1();
  
  return {
    privateKey: privateKey.toHex(),
    publicKey: publicKey.toHex()
  };
}

/**
 * Generates a BLS signature for the given message
 * Uses AugSchemeMPL (Augmented Scheme) - more secure, used by Ethereum
 * 
 * @param message The message to sign (as string or Uint8Array)
 * @param privateKeyHex The BLS private key (hex string)
 * @returns The BLS signature as a hex string
 * 
 * @example
 * const keyPair = generateBLSKeyPair();
 * const message = "Hello, Ethereum!";
 * const signature = generateBLSSignature(message, keyPair.privateKey);
 */
export function generateBLSSignature(
  message: string | Uint8Array,
  privateKeyHex: string
): string {
  // Convert message to bytes if it's a string
  const messageBytes = typeof message === 'string' 
    ? new TextEncoder().encode(message)
    : message;
  
  // Convert private key from hex
  const privateKey = PrivateKey.fromHex(privateKeyHex);
  
  // Sign the message using AugSchemeMPL
  const signature = AugSchemeMPL.sign(privateKey, messageBytes);
  
  // Return signature as hex string
  return signature.toHex();
}

/**
 * Verifies a BLS signature (supports both single and aggregated signatures)
 * 
 * @param message The message that was signed (as string or Uint8Array)
 * @param signatureHex The BLS signature to verify (hex string)
 * @param publicKeyHex The BLS public key (hex string) or array of public keys for aggregated signatures
 * @returns True if the signature is valid, false otherwise
 * 
 * @example Single signature verification:
 * const keyPair = generateBLSKeyPair();
 * const message = "Hello!";
 * const signature = generateBLSSignature(message, keyPair.privateKey);
 * const isValid = verifyBLSSignature(message, signature, keyPair.publicKey);
 * // isValid = true
 * 
 * @example Aggregated signature verification:
 * // Multiple validators sign the same message
 * const validator1 = generateBLSKeyPair();
 * const validator2 = generateBLSKeyPair();
 * const validator3 = generateBLSKeyPair();
 * const message = "Block attestation";
 * 
 * const sig1 = generateBLSSignature(message, validator1.privateKey);
 * const sig2 = generateBLSSignature(message, validator2.privateKey);
 * const sig3 = generateBLSSignature(message, validator3.privateKey);
 * 
 * // Aggregate the signatures
 * const aggregatedSig = aggregateBLSSignatures([sig1, sig2, sig3]);
 * 
 * // Verify with all public keys
 * const publicKeys = [validator1.publicKey, validator2.publicKey, validator3.publicKey];
 * const isValid = verifyBLSSignature(message, aggregatedSig, publicKeys);
 * // isValid = true
 */
export function verifyBLSSignature(
  message: string | Uint8Array,
  signatureHex: string,
  publicKeyHex: string | string[]
): boolean {
  try {
    // Convert message to bytes if it's a string
    const messageBytes = typeof message === 'string'
      ? new TextEncoder().encode(message)
      : message;
    
    // Convert signature from hex
    const signature = JacobianPoint.fromHexG2(signatureHex);
    
    // Handle single or aggregated public keys
    if (Array.isArray(publicKeyHex)) {
      // Aggregated verification: multiple signers on the same message
      const publicKeys = publicKeyHex.map(pk => JacobianPoint.fromHexG1(pk));
      
      // Aggregate public keys by summing points
      let aggregatedPublicKey = publicKeys[0];
      for (let i = 1; i < publicKeys.length; i++) {
        aggregatedPublicKey = aggregatedPublicKey.add(publicKeys[i]);
      }
      
      // Verify with aggregated public key
      return AugSchemeMPL.verify(aggregatedPublicKey, messageBytes, signature);
    } else {
      // Single signature verification
      const publicKey = JacobianPoint.fromHexG1(publicKeyHex);
      return AugSchemeMPL.verify(publicKey, messageBytes, signature);
    }
  } catch (error) {
    console.error('Error verifying BLS signature:', error);
    return false;
  }
}

/**
 * Aggregates multiple BLS signatures into a single signature
 * This is the key feature of BLS - constant-size aggregated signatures
 * 
 * @param signatureHexArray Array of BLS signatures (hex strings)
 * @returns The aggregated signature as a hex string
 * 
 * @example
 * // 100 validators sign the same message
 * const validators = Array.from({ length: 100 }, () => generateBLSKeyPair());
 * const message = "Epoch 42 attestation";
 * const signatures = validators.map(v => generateBLSSignature(message, v.privateKey));
 * 
 * // Aggregate all 100 signatures into one
 * const aggregatedSig = aggregateBLSSignatures(signatures);
 * 
 * // Verify with all 100 public keys
 * const publicKeys = validators.map(v => v.publicKey);
 * const isValid = verifyBLSSignature(message, aggregatedSig, publicKeys);
 * // isValid = true
 * 
 * // Space savings: 100 signatures → 1 signature (constant size!)
 */
export function aggregateBLSSignatures(signatureHexArray: string[]): string {
  if (signatureHexArray.length === 0) {
    throw new Error('Cannot aggregate empty signature array');
  }
  
  if (signatureHexArray.length === 1) {
    return signatureHexArray[0];
  }
  
  // Convert all signatures from hex
  const signatures = signatureHexArray.map(sig => JacobianPoint.fromHexG2(sig));
  
  // Aggregate signatures using the library's aggregate function
  const aggregated = AugSchemeMPL.aggregate(signatures);
  
  return aggregated.toHex();
}

// ============================================================================
// RANDAO Helper Functions
// Used for validator scheduling and randomness
// ============================================================================

/**
 * Convert number to 8-byte big-endian representation
 * @param n The number to convert
 * @returns 8-byte Uint8Array in big-endian format
 */
export function i2b8(n: number): Uint8Array {
  const b = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    b[i] = n & 0xff;
    n = Math.floor(n / 256);
  }
  return b;
}

/**
 * Concatenate multiple byte arrays
 * @param parts Variable number of Uint8Array to concatenate
 * @returns Single concatenated Uint8Array
 */
export function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/**
 * Parse 8 bytes as big-endian unsigned 64-bit integer
 * Returns as JS number (safe for modulo operations)
 * @param b The byte array to parse
 * @param offset Starting offset in the array
 * @returns Parsed number
 */
export function u64(b: Uint8Array, offset = 0): number {
  let n = 0;
  for (let i = 0; i < 8; i++) {
    n = (n * 256 + (b[offset + i] ?? 0)) >>> 0;
  }
  return n >>> 0;
}

/**
 * XOR two hex strings byte-by-byte
 * @param hex1 First hex string
 * @param hex2 Second hex string
 * @returns XOR result as hex string
 */
export function xorHexStrings(hex1: string, hex2: string): string {
  // Remove 0x prefix if present
  const h1 = hex1.startsWith('0x') ? hex1.slice(2) : hex1;
  const h2 = hex2.startsWith('0x') ? hex2.slice(2) : hex2;
  
  // Ensure both strings are same length
  const maxLen = Math.max(h1.length, h2.length);
  const padded1 = h1.padStart(maxLen, '0');
  const padded2 = h2.padStart(maxLen, '0');
  
  let result = '';
  for (let i = 0; i < maxLen; i++) {
    const xor = parseInt(padded1[i], 16) ^ parseInt(padded2[i], 16);
    result += xor.toString(16);
  }
  return result;
}

/**
 * Hash bytes using SHA-256
 * @param bytes - Bytes to hash
 * @returns Hash as Uint8Array
 */
export function hashBytes(bytes: Uint8Array): Uint8Array {
  // Convert bytes to hex string for sha256Hash function
  const hexString = bytesToHex(bytes);
  
  // Use SHA-256
  const hashHex = sha256Hash(hexString);
  
  // Convert back to bytes
  return hexToBytes(hashHex);
}
