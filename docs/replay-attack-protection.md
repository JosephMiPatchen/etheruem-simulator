# How Blockchain Protects Against Replay Attacks

## The Problem: What is a Replay Attack?

A replay attack occurs when an attacker copies a valid transaction and resubmits it (or a modified version) to steal funds or cause unintended actions.

## Two Layers of Defense

### Layer 1: Transaction-Bound Signatures (Prevents Modification)

The signature is cryptographically bound to the specific transaction data, including the outputs. This prevents attackers from modifying where the money goes.

#### Bad Design: Signing Static Data ❌

```typescript
// Alice signs: "I own UTXO-123"
const signature = sign("I own UTXO-123", alicePrivateKey);

// Alice's transaction
Transaction 1:
  Input: UTXO-123, Signature: 0xABC...
  Output: Send 1 ETH to Bob

// Attacker's modified transaction
Transaction 2:
  Input: UTXO-123, Signature: 0xABC...  ← Same signature!
  Output: Send 10 ETH to Mallory        ← Different output!
  
✅ Signature still valid! (proves Alice owns UTXO-123)
❌ Attacker stole Alice's money!
```

**Problem:** The signature proves ownership but doesn't authorize the specific transaction. An attacker can use the signature with different outputs.

#### Good Design: Signing Transaction Data ✅

```typescript
// Alice signs the transaction data (inputs + outputs)
const signatureInput = {
  sourceOutputId: "UTXO-123",
  allOutputs: [{ nodeId: "Bob", value: 1 }]
};
const signature = sign(signatureInput, alicePrivateKey);

// Alice's transaction
Transaction 1:
  Input: UTXO-123, Signature: 0xDEF...
  Output: Send 1 ETH to Bob
  ✅ Valid (signature matches transaction data)

// Attacker tries to modify
Transaction 2:
  Input: UTXO-123, Signature: 0xDEF...  ← Same signature
  Output: Send 10 ETH to Mallory        ← Different output
  
Verification:
  - Signature was created for: outputs = [Bob: 1 ETH]
  - Transaction contains: outputs = [Mallory: 10 ETH]
  - Mismatch detected!
  
❌ Signature invalid! Transaction rejected!
🔒 Alice's money is safe!
```

**Solution:** The signature proves both:
1. **Authenticity**: "This signature came from Alice"
2. **Integrity**: "This signature is for THIS SPECIFIC transaction"

### Layer 2: UTXO Tracking (Prevents Exact Replay)

Even if an attacker tries to replay the exact same transaction with a valid signature, it will fail because the UTXO has already been spent.

```typescript
Initial State:
UTXO Set: { "tx123-0": { nodeId: "Alice", value: 10 } }

// Alice's transaction executes
Transaction 1:
  Input: tx123-0
  Output: Bob gets 10 ETH
  ✅ Valid signature
  ✅ UTXO exists
  → Transaction accepted
  → UTXO tx123-0 REMOVED from set

New State:
UTXO Set: { "tx456-0": { nodeId: "Bob", value: 10 } }

// Attacker tries exact replay
Transaction 1 (replayed):
  Input: tx123-0
  Output: Bob gets 10 ETH
  ✅ Valid signature (same transaction)
  ❌ UTXO tx123-0 doesn't exist! (already spent)
  → Transaction rejected (double-spend prevented)
```

## What Gets Signed in Our Simulator

In `src/core/blockchain/transaction.ts`:

```typescript
export function createSignatureInput(
  sourceOutputId: string,
  allOutputs: TransactionOutput[]
) {
  return {
    sourceOutputId,  // Which UTXO is being spent
    allOutputs       // Where the money is going (critical!)
  };
}
```

This signature input is then hashed and signed with the sender's private key. During verification, the same signature input is reconstructed and verified against the signature.

## Verification Process

In `src/core/validation/securityValidator.ts`:

```typescript
// 1. Reconstruct what should have been signed
const signatureInput = createSignatureInput(
  input.sourceOutputId,
  transaction.outputs
);

// 2. Verify the signature
const isValid = await verifySignature(
  signatureInput,      // What should have been signed
  input.key.signature, // The actual signature
  input.key.publicKey  // Signer's public key
);

// 3. Reject if signature doesn't match
if (!isValid) {
  return false;  // Transaction modified or wrong signer!
}
```

## Real-World Analogy

### Static Signature = Blank Check
- You sign a blank check
- Someone else fills in the amount and recipient
- Your signature is still valid
- 💸 You're broke!

### Transaction-Bound Signature = Filled-Out Check
- You write the amount and recipient
- You sign it
- Nobody can change it without invalidating your signature
- 🔒 Your money is safe!

## Why Both Layers Are Necessary

**Without signature binding:**
- Attacker can modify outputs before UTXO is spent
- "Intercept and redirect" attack

**Without UTXO tracking:**
- Attacker can replay exact transaction multiple times
- "Copy and paste" attack

**With both:**
- Can't modify the transaction (signature breaks)
- Can't replay the transaction (UTXO already spent)
- 🔒 Fully protected!

## Summary

Digital signatures in blockchain provide:
1. **Authenticity**: Proves who authorized the transaction
2. **Integrity**: Proves the transaction hasn't been modified
3. **Non-repudiation**: Signer can't deny they authorized it

By signing the transaction data (not just static proof of ownership), we ensure that signatures can only be used for the specific transaction they were created for, preventing replay attacks and unauthorized fund transfers.
