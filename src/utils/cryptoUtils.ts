/**
 * Cryptographic utilities for the Bitcoin simulator
 * Implements all cryptographic operations including hashing, key generation, and signatures
 * Uses noble-secp256k1 for ECDSA operations and @noble/hashes for SHA-256
 */

import * as secp from 'noble-secp256k1';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

// Use dynamic import for BLS to work with both ES modules and Jest
const blsModule = require('@noble/curves/bls12-381');
const bls = blsModule.bls12_381;
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

/**
 * Generates a BLS signature for the given message
 * @param message The message to sign (as string or Uint8Array)
 * @param privateKey The BLS private key (hex string)
 * @returns The BLS signature as a hex string
 */
export function generateBLSSignature(message: string | Uint8Array, privateKey: string): string {
  try {
    // Convert message to bytes if it's a string
    const messageBytes = typeof message === 'string' 
      ? new TextEncoder().encode(message)
      : message;
    
    // Convert private key from hex to bytes
    const privateKeyBytes = hexToBytes(privateKey);
    
    // Sign the message
    const signature = bls.sign(messageBytes, privateKeyBytes);
    
    // Return signature as hex string
    return bytesToHex(signature);
  } catch (error) {
    console.error('Error generating BLS signature:', error);
    throw error;
  }
}

/**
 * Verifies a BLS signature (supports both single and aggregated signatures)
 * @param message The message that was signed (as string or Uint8Array)
 * @param signature The BLS signature to verify (hex string)
 * @param publicKey The BLS public key or array of public keys for aggregated signatures (hex string or array)
 * @returns True if the signature is valid, false otherwise
 */
export function verifyBLSSignature(
  message: string | Uint8Array,
  signature: string,
  publicKey: string | string[]
): boolean {
  try {
    // Convert message to bytes if it's a string
    const messageBytes = typeof message === 'string'
      ? new TextEncoder().encode(message)
      : message;
    
    // Convert signature from hex to bytes
    const signatureBytes = hexToBytes(signature);
    
    // Handle single or aggregated public keys
    if (Array.isArray(publicKey)) {
      // Aggregated verification: multiple public keys
      const publicKeyPoints = publicKey.map(pk => bls.G1.ProjectivePoint.fromHex(pk));
      
      // Aggregate the public keys by summing points
      const aggregatedPoint = publicKeyPoints.reduce((acc, point) => acc.add(point));
      const aggregatedPublicKey = aggregatedPoint.toRawBytes();
      
      // Verify with aggregated public key
      return bls.verify(signatureBytes, messageBytes, aggregatedPublicKey);
    } else {
      // Single signature verification
      const publicKeyBytes = hexToBytes(publicKey);
      return bls.verify(signatureBytes, messageBytes, publicKeyBytes);
    }
  } catch (error) {
    console.error('Error verifying BLS signature:', error);
    return false;
  }
}

/**
 * Aggregates multiple BLS signatures into a single signature
 * This is the key feature of BLS - constant-size aggregated signatures
 * @param signatures Array of BLS signatures (hex strings)
 * @returns The aggregated signature as a hex string
 */
export function aggregateBLSSignatures(signatures: string[]): string {
  try {
    if (signatures.length === 0) {
      throw new Error('Cannot aggregate empty signature array');
    }
    
    if (signatures.length === 1) {
      return signatures[0];
    }
    
    // Convert all signatures to points on the curve
    const signaturePoints = signatures.map(sig => bls.G2.ProjectivePoint.fromHex(sig));
    
    // Aggregate signatures by summing points on the curve
    const aggregatedPoint = signaturePoints.reduce((acc, point) => acc.add(point));
    
    return bytesToHex(aggregatedPoint.toRawBytes());
  } catch (error) {
    console.error('Error aggregating BLS signatures:', error);
    throw error;
  }
}

/**
 * Generates a BLS key pair (private key and public key)
 * @returns Object containing privateKey and publicKey as hex strings
 */
export function generateBLSKeyPair(): { privateKey: string; publicKey: string } {
  try {
    // Generate random private key (32 bytes)
    const privateKey = bls.utils.randomPrivateKey();
    
    // Derive public key from private key
    const publicKey = bls.getPublicKey(privateKey);
    
    return {
      privateKey: bytesToHex(privateKey),
      publicKey: bytesToHex(publicKey)
    };
  } catch (error) {
    console.error('Error generating BLS key pair:', error);
    throw error;
  }
}
