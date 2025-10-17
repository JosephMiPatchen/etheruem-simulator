import { SimulatorConfig } from '../../config/config';
import { Block, Transaction, UTXOSet } from '../../types/types';

/**
 * Helper function to process a transaction for UTXO updates
 * Removes spent outputs and adds new outputs
 */
const processTransactionForUTXO = (utxoSet: UTXOSet, transaction: Transaction): void => {
  // Remove spent outputs from UTXO set
  for (const input of transaction.inputs) {
    // The delete operator safely handles non-existent properties in the case of coinbase inputs
    delete utxoSet[input.sourceOutputId];
  }
  
  // Add new outputs to UTXO set
  if (transaction.txid) {
    for (const output of transaction.outputs) {
      const outputId = `${transaction.txid}-${output.idx}`;
      utxoSet[outputId] = output;
    }
  }
};

/**
 * Updates the UTXO set with a new transaction
 * Removes spent outputs and adds new outputs
 */
export const updateUTXOSet = (
  utxoSet: UTXOSet,
  transaction: Transaction
): UTXOSet => {
  // Create a copy of the UTXO set to maintain immutability
  // This ensures the original set remains unchanged if validation fails
  // and makes debugging easier by preserving state history
  const newUtxoSet = { ...utxoSet };
  
  // Validate that all non-coinbase inputs exist in the UTXO set
  const isCoinbase = transaction.inputs[0].sourceOutputId === SimulatorConfig.REWARDER_NODE_ID;
  
  if (!isCoinbase) {
    // Check if all inputs exist in the UTXO set
    const missingInputs = transaction.inputs.filter(input => 
      utxoSet[input.sourceOutputId] === undefined
    );
    
    // If any input doesn't exist, log errors and return the original UTXO set unchanged
    if (missingInputs.length > 0) {
      console.error(`Transaction ${transaction.txid} has missing inputs:`);
      missingInputs.forEach(input => {
        console.error(`  Missing input: ${input.sourceOutputId}`);
      });
      return utxoSet;
    }
  }
  
  // Process the transaction (remove inputs, add outputs)
  processTransactionForUTXO(newUtxoSet, transaction);
  
  return newUtxoSet;
};

/**
 * Rebuilds the UTXO set from blocks
 * This is used when switching to a new chain
 */
export const rebuildUTXOSetFromBlocks = (blocks: Block[]): UTXOSet => {
  // Extract all transactions from blocks
  const transactions = blocks.flatMap(block => block.transactions);
  return rebuildUTXOSetFromTransactions(transactions);
};

/**
 * Rebuilds the UTXO set from transactions
 * This is used when switching to a new chain
 */
export const rebuildUTXOSetFromTransactions = (transactions: Transaction[]): UTXOSet => {
  const utxoSet: UTXOSet = {};
  
  // Process transactions in order
  for (const transaction of transactions) {
    // Skip transactions without txid
    if (!transaction.txid) continue;
    
    // Process the transaction (remove inputs, add outputs)
    processTransactionForUTXO(utxoSet, transaction);
  }
  
  return utxoSet;
};

/**
 * Rebuilds the UTXO set from a blockchain
 * This is used when switching to a new chain
 * @deprecated Use rebuildUTXOSetFromBlocks instead
 */
export const rebuildUTXOSet = (transactions: Transaction[]): UTXOSet => {
  return rebuildUTXOSetFromTransactions(transactions);
};
