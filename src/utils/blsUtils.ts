/**
 * BLS Signature utilities for Ethereum Proof of Stake
 * Uses BLS12-381 curve for signature aggregation
 * Browser-friendly synchronous implementation using @rigidity/bls-signatures
 */

// @ts-ignore - Library has type definitions but package.json exports issue
import { AugSchemeMPL, PrivateKey, JacobianPoint } from '@rigidity/bls-signatures';

/**
 * Generates a BLS key pair (private key and public key)
 * @returns Object with privateKey and publicKey as hex strings
 */
export function generateBLSKeyPair(): { privateKey: string; publicKey: string } {
  // Generate random 32-byte seed
  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);
  
  // Generate private key from seed using PrivateKey.fromSeed
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
 * @param message The message to sign (as string or Uint8Array)
 * @param privateKeyHex The BLS private key (hex string)
 * @returns The BLS signature as a hex string
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
  
  // Sign the message using AugSchemeMPL (more secure, used by Ethereum)
  const signature = AugSchemeMPL.sign(privateKey, messageBytes);
  
  // Return signature as hex string
  return signature.toHex();
}

/**
 * Verifies a BLS signature (supports both single and aggregated signatures)
 * @param message The message that was signed (as string or Uint8Array)
 * @param signatureHex The BLS signature to verify (hex string)
 * @param publicKeyHex The BLS public key or array of public keys for aggregated signatures (hex string or array)
 * @returns True if the signature is valid, false otherwise
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
      // For AugSchemeMPL with same message, aggregate public keys
      const publicKeys = publicKeyHex.map(pk => JacobianPoint.fromHexG1(pk));
      
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
 * @param signatureHexArray Array of BLS signatures (hex strings)
 * @returns The aggregated signature as a hex string
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

/**
 * Signs an epoch number for RANDAO reveal
 * @param epoch The epoch number to sign
 * @param privateKeyHex The validator's BLS private key (hex string)
 * @returns The RANDAO reveal signature as hex string
 */
export function generateRANDAOReveal(
  epoch: number,
  privateKeyHex: string
): string {
  // Convert epoch to bytes (8 bytes for uint64, little-endian)
  const epochBytes = new Uint8Array(8);
  const view = new DataView(epochBytes.buffer);
  view.setBigUint64(0, BigInt(epoch), true); // little-endian
  
  return generateBLSSignature(epochBytes, privateKeyHex);
}

/**
 * Verifies a RANDAO reveal
 * @param epoch The epoch number that was signed
 * @param revealHex The RANDAO reveal signature (hex string)
 * @param publicKeyHex The validator's BLS public key (hex string)
 * @returns True if valid, false otherwise
 */
export function verifyRANDAOReveal(
  epoch: number,
  revealHex: string,
  publicKeyHex: string
): boolean {
  // Convert epoch to bytes
  const epochBytes = new Uint8Array(8);
  const view = new DataView(epochBytes.buffer);
  view.setBigUint64(0, BigInt(epoch), true);
  
  return verifyBLSSignature(epochBytes, revealHex, publicKeyHex);
}
