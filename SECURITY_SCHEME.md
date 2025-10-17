# Security Scheme

This document outlines the security implementation for the educational Bitcoin node system. The implementation follows a simplified version of Bitcoin's P2PKH (Pay-to-Public-Key-Hash) model.

## Cryptographic Primitives

This simplified educational implementation uses:

1. **SHA-256** - For hashing operations
2. **ECDSA with secp256k1 curve** - For asymmetric cryptography

Note: The real Bitcoin implementation uses a combination of both SHA-256 and RIPEMD-160 for address generation (SHA-256 followed by RIPEMD-160). For simplicity in our educational version, we'll only implement SHA-256.

### ECDSA with secp256k1 

ECDSA (Elliptic Curve Digital Signature Algorithm) is Bitcoin's signature scheme that uses the secp256k1 elliptic curve defined by the equation y² = x³ + 7. In this system, a private key is a 256-bit number, while the public key is a point on the curve derived by multiplying the private key with a standard generator point G. The security relies on the computational difficulty of the elliptic curve discrete logarithm problem - it's easy to derive the public key from the private key but practically impossible to do the reverse. For our educational implementation, we use this same cryptographic system but deterministically derive keys from node IDs.

## Schema Modifications

### Transaction Output

```typescript
export interface TransactionOutput {
  idx: number;        // Position index in the outputs array
  nodeId: string;     // Recipient node identifier
  value: number;      // BTC amount
  lock: string;       // ADDED: Bitcoin address of recipient (hash of public key)
}
```

### Transaction Input

```typescript
export interface TransactionInput {
  sourceOutputId: string;   // Format: "{txid}-{idx}" or "REWARDER_NODE_ID" for coinbase
  sourceNodeId?: string;    // Optional: ID of the node that created this output (for UI purposes)
  key: {                    // ADDED: Data needed to verify ownership
    publicKey: string;      // Public key corresponding to the address in the lock
    signature: string;      // Signature proving ownership
  };
}
```

## Key Generation Process

When a node starts, it will generate a key pair directly from the node ID. While this is not cryptographically secure for a production system, it's sufficient for educational purposes. The public key is then hashed using SHA-256 to create the node's Bitcoin address.

## Signature Generation and Verification

For the signature process, we define two simple interfaces:

```typescript
interface SignatureInput {
  currentInput: {
    sourceOutputId: string;
  };
  allOutputs: TransactionOutput[];
}

interface SignatureOperations {
  generateSignature(data: SignatureInput, privateKey: string): string;
  verifySignature(data: SignatureInput, signature: string, publicKey: string): boolean;
}
```

### Signature Generation

When creating a transaction, the sender must sign it to prove ownership of the coins being spent. This is done using the `generateSignature` function from the `SignatureOperations` interface:

```typescript
// The input data for signature generation/verification
interface SignatureInput {
  sourceOutputId: string;  // Reference to the UTXO being spent
  allOutputs: TransactionOutput[];  // All outputs in the transaction
  txid?: string;  // The transaction ID that will be calculated from the transaction data
}

// Call the generateSignature function with:
const signature = generateSignature(signatureInput, privateKey);
```

For implementation, you can use the popular `noble-secp256k1` library, which provides a clean JavaScript implementation of ECDSA with the secp256k1 curve.

The ECDSA signature generation implemented by this function includes:

1. Taking the `SignatureInput` object containing the reference to the UTXO being spent, all outputs, and the transaction ID
2. Using the ECDSA algorithm with the secp256k1 curve to sign this data with the sender's private key
3. Returning the signature to be included in the transaction

### Signature Verification

When verifying a transaction, for each input:

1. Retrieve the referenced output from the UTXO set
2. Verify that the hash of the public key in the input's `key` matches the `lock` in the referenced output
3. Recreate the same `SignatureInput` object used for signing
4. Verify the signature against the public key and the input data

For implementation, you can use the same `noble-secp256k1` library that was used for signature generation. This library provides a verification function that takes the signature, the data that was signed, and the public key as inputs, and returns a boolean indicating whether the signature is valid.

## Why Include All Outputs in the Signature

Including all transaction outputs in the signature calculation is essential for Bitcoin's security model. By signing the complete transaction, including inputs, outputs, and transaction ID, we protect against transaction malleability where a transaction's ID could be changed while keeping it valid. This prevents tracking issues in wallets and exchanges, as well as stopping downstream transaction breakage when one transaction depends on another. Without proper signing, malicious validators could potentially redirect funds to themselves by modifying transactions in the mempool before they're confirmed. The signature ensures the integrity of the entire transaction, validating both which coins are being spent and their destination, while preventing double-spend attacks where someone might create alternate versions of a transaction spending the same inputs. In a decentralized network, these cryptographic safeguards replace the need for trusted validators, ensuring transactions are processed exactly as intended.

## Example Transaction Flow

1. Alice wants to send 1 BTC to Bob
2. Alice creates a transaction with:
   - Input: References her UTXO
   - Output: Contains Bob's address in the `lock` field
3. Alice generates a signature over the input reference and all outputs
4. She includes her public key and the signature in the input's `key` field
5. The network verifies that:
   - The hash of Alice's public key matches the `lock` in the UTXO she's spending
   - The signature is valid for the transaction data

This process ensures that only the rightful owner of bitcoins can spend them, while also preventing transaction manipulation and double-spending.