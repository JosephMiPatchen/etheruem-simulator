/**
 * Cryptographic utilities for the Bitcoin simulator
 * Implements all cryptographic operations including hashing, key generation, and signatures
 * Uses noble-secp256k1 for ECDSA operations and @noble/hashes for SHA-256
 */

import * as secp from 'noble-secp256k1';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { TransactionOutput } from '../types/types';

/**
 * Interface for signature input data
 */
export interface SignatureInput {
  sourceOutputId: string;  // Reference to the UTXO being spent
  allOutputs: TransactionOutput[];  // All outputs in the transaction
  txid?: string;  // The transaction ID that will be calculated from the transaction data
}

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
