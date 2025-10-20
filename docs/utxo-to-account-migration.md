# UTXO to Account Model Migration Analysis

## Overview

This document identifies all core files that need to be modified to migrate from Bitcoin's UTXO model to Ethereum's Account model.

## New Data Structures

### Account Model
```typescript
interface Account {
  address: string;          // sha256(publicKey)
  nonce: number;            // transaction count (prevents replay)
  balance: number;          // ETH balance
  code?: string;            // contract bytecode (undefined for EOAs)
  storage?: { [key: string]: string }; // contract storage
}

interface WorldState {
  [address: string]: Account;  // global mapping of address → account
}
```

### Transaction Model (Ethereum-style)
```typescript
interface Transaction {
  from: string;             // sender address (derived from publicKey)
  to: string;               // recipient address
  value: number;            // amount to transfer
  nonce: number;            // sender's transaction count
  publicKey: string;        // sender's public key
  signature: string;        // signature of transaction data
  data?: string;            // contract call data (future)
  timestamp: number;
}
```

## Files Requiring Changes

### 1. Type Definitions
**File:** `src/types/types.ts`

**Changes:**
- Add `Account` interface
- Add `WorldState` interface  
- Replace `TransactionInput` and `TransactionOutput` with new Ethereum-style `Transaction`
- Remove `UTXOSet` interface
- Update `NodeState` to use `WorldState` instead of `UTXOSet`

**Impact:** HIGH - This is the foundation for all other changes

---

### 2. Blockchain Core

#### `src/core/blockchain/blockchain.ts`
**Current:** Manages blocks and UTXO set
**Changes:**
- Replace `private utxoSet: UTXOSet` with `private worldState: WorldState`
- Replace `getUTXOSet()` with `getWorldState()`
- Update `addBlock()` to update account balances instead of UTXO set
- Update `replaceChain()` to rebuild world state instead of UTXO set
- Remove all UTXO-related logic

**Impact:** HIGH - Core state management

#### `src/core/blockchain/utxo.ts` → RENAME to `worldState.ts`
**Current:** UTXO set manipulation functions
**Changes:**
- Rename file to `worldState.ts`
- Replace `updateUTXOSet()` with `updateWorldState()`
- Replace `rebuildUTXOSetFromBlocks()` with `rebuildWorldStateFromBlocks()`
- Implement account balance updates instead of UTXO tracking
- Implement nonce increments

**Impact:** HIGH - State update logic

#### `src/core/blockchain/transaction.ts`
**Current:** Creates Bitcoin-style transactions with inputs/outputs
**Changes:**
- Remove `createCoinbaseTransaction()` (or adapt for account model)
- Remove `createRedistributionTransaction()` (or adapt)
- Update `createSignatureInput()` to sign Ethereum-style transaction data
- Create new functions for Ethereum-style transactions

**Impact:** HIGH - Transaction creation logic

#### `src/core/blockchain/block.ts`
**Current:** Block creation with Bitcoin transactions
**Changes:**
- Update to work with new transaction format
- May need minimal changes if transactions are properly abstracted

**Impact:** MEDIUM - Depends on transaction abstraction

---

### 3. Validation Logic

#### `src/core/validation/transactionValidator.ts`
**Current:** Validates transactions against UTXO set
**Changes:**
- Remove UTXO existence checks
- Add account balance checks (`worldState[from].balance >= value`)
- Add nonce validation (`worldState[from].nonce === transaction.nonce`)
- Remove input/output sum validation (no longer needed)
- Update to validate single from/to/value instead of multiple inputs/outputs
- Keep signature validation (still needed!)

**Impact:** HIGH - Core validation logic

#### `src/core/validation/securityValidator.ts`
**Current:** Validates signatures against UTXO locks
**Changes:**
- Remove UTXO lookup logic
- Validate that `sha256(transaction.publicKey) === transaction.from`
- Update signature validation to sign new transaction format
- Still verify signature proves ownership of private key

**Impact:** HIGH - Security validation

#### `src/core/validation/blockValidator.ts`
**Current:** Validates blocks with UTXO updates
**Changes:**
- Replace temporary UTXO set with temporary world state
- Update to use `updateWorldState()` instead of `updateUTXOSet()`
- Account balance validation instead of UTXO validation

**Impact:** HIGH - Block validation

#### `src/core/validation/chainValidator.ts`
**Current:** Validates chains with UTXO rebuilding
**Changes:**
- Replace UTXO set rebuilding with world state rebuilding
- Update to use `updateWorldState()` instead of `updateUTXOSet()`

**Impact:** HIGH - Chain validation

---

### 4. Node Logic

#### `src/core/node.ts`
**Current:** Node with blockchain and UTXO references
**Changes:**
- Update `getState()` to return world state instead of UTXO set
- May need to update how node tracks its own balance (query world state by address)
- Minimal changes if properly abstracted

**Impact:** MEDIUM - Node state management

---

### 5. Mining Logic

#### `src/core/mining/miner.ts`
**Current:** Creates blocks with Bitcoin-style transactions
**Changes:**
- Update `createBlockTransactions()` to create Ethereum-style transactions
- May need to update reward mechanism (direct balance increase vs transaction)
- Update transaction creation to use account model

**Impact:** MEDIUM - Mining/block creation

---

## Migration Strategy

### Phase 1: Type Definitions
1. Update `types.ts` with new Account and WorldState interfaces
2. Keep old UTXO types temporarily for compatibility
3. Add new Transaction interface alongside old one

### Phase 2: State Management
1. Rename `utxo.ts` to `worldState.ts`
2. Implement `updateWorldState()` and `rebuildWorldStateFromBlocks()`
3. Update `blockchain.ts` to use world state

### Phase 3: Transaction Format
1. Update `transaction.ts` to create Ethereum-style transactions
2. Update signature creation to sign new transaction format

### Phase 4: Validation
1. Update `transactionValidator.ts` for account model
2. Update `securityValidator.ts` for new transaction format
3. Update `blockValidator.ts` and `chainValidator.ts`

### Phase 5: Integration
1. Update `node.ts` to expose world state
2. Update `miner.ts` to create new transaction format
3. Update network layer (if needed)

### Phase 6: UI Updates
1. Update React components to display accounts instead of UTXOs
2. Update balance calculations to query world state
3. Update transaction displays

### Phase 7: Testing & Cleanup
1. Remove old UTXO code
2. Remove old transaction format
3. Test end-to-end

## Key Security Considerations

### Signature Validation (UNCHANGED)
- Still sign transaction data to prevent replay/modification
- Now signing: `{ from, to, value, nonce, timestamp }`
- Signature still proves: authenticity + integrity

### Replay Protection (CHANGED)
- **Old:** UTXO can only be spent once (removed from set)
- **New:** Nonce must increment sequentially
- Each account tracks transaction count
- Transaction with wrong nonce is rejected

### Balance Validation (CHANGED)
- **Old:** Sum of inputs >= sum of outputs
- **New:** `account.balance >= transaction.value`

## Files Summary

### HIGH IMPACT (Must Change)
1. `src/types/types.ts` - Core type definitions
2. `src/core/blockchain/blockchain.ts` - State management
3. `src/core/blockchain/utxo.ts` → `worldState.ts` - State updates
4. `src/core/blockchain/transaction.ts` - Transaction creation
5. `src/core/validation/transactionValidator.ts` - Transaction validation
6. `src/core/validation/securityValidator.ts` - Security validation
7. `src/core/validation/blockValidator.ts` - Block validation
8. `src/core/validation/chainValidator.ts` - Chain validation

### MEDIUM IMPACT (Likely Need Changes)
9. `src/core/node.ts` - Node state
10. `src/core/mining/miner.ts` - Mining/rewards
11. `src/core/blockchain/block.ts` - Block structure

### LOW IMPACT (Minimal/No Changes)
12. `src/core/blockchain/index.ts` - Exports only
13. `src/core/validation/index.ts` - Exports only
14. `src/core/mining/index.ts` - Exports only
15. `src/core/index.ts` - Exports only

## Next Steps

1. Review and approve this migration plan
2. Create feature branch for account model migration
3. Implement changes in phases (type definitions → state → validation → integration)
4. Test thoroughly at each phase
5. Update documentation as we go
