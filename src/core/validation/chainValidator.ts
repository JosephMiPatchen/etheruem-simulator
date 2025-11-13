import { Block } from '../../types/types';
import { SimulatorConfig } from '../../config/config';

/**
 * Lightweight chain validation for PoS block tree
 * 
 * Only validates structural integrity:
 * - Hashes link together correctly
 * - Slots are in correct order (gaps allowed for missed slots)
 * - Genesis block has correct previous hash
 * 
 * Does NOT validate transactions or rebuild state.
 * Full validation happens when blocks are applied to 
 * our state via a LMD GHOST header being move to a chain in our block tree
 * 
 * This is suitable for validating chains received from peers before
 * adding them to the block tree.
 */
export const lightValidateChain = async (chain: Block[]): Promise<boolean> => {
  // 1. Check if the chain is empty
  if (chain.length === 0) {
    console.error('[lightValidateChain] Chain is empty');
    return false;
  }
  
  // 2. Verify genesis block has correct previous hash
  if (chain[0].header.previousHeaderHash !== SimulatorConfig.GENESIS_PREV_HASH) {
    console.error('[lightValidateChain] Genesis block must have GENESIS_PREV_HASH');
    return false;
  }
  
  // 3. Validate each block's hash links to previous block
  for (let i = 1; i < chain.length; i++) {
    const block = chain[i];
    const previousBlock = chain[i - 1];
    
    // Check hash linkage
    if (block.header.previousHeaderHash !== previousBlock.hash) {
      console.error(`[lightValidateChain] Hash mismatch at height ${block.header.height}: ${block.header.previousHeaderHash} !== ${previousBlock.hash}`);
      return false;
    }
    
    // Check slot ordering (slots must increase, gaps allowed for missed slots)
    if (block.header.slot <= previousBlock.header.slot) {
      console.error(`[lightValidateChain] Slot not increasing at height ${block.header.height}: ${block.header.slot} <= ${previousBlock.header.slot}`);
      return false;
    }
  }
  
  return true;
};
