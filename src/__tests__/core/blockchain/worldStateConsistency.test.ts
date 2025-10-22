import { Blockchain } from '../../../core/blockchain/blockchain';
import { Block, EthereumTransaction } from '../../../types/types';
import { SimulatorConfig } from '../../../config/config';
import { createCoinbaseTransaction } from '../../../core/blockchain/transaction';

describe('World State Consistency', () => {
  it('should have same world state whether built incrementally or rebuilt from blocks', async () => {
    // Create two blockchains with same miner address
    const minerAddress = 'miner-address-1';
    const blockchain1 = new Blockchain('node1', minerAddress);
    const blockchain2 = new Blockchain('node2', minerAddress);
    
    // Build a simple 2-block chain
    // Block 1: Just coinbase (gives miner 4 ETH)
    const coinbase1 = createCoinbaseTransaction(minerAddress);
    const block1: Block = {
      header: {
        height: 1,
        timestamp: Date.now(),
        previousHeaderHash: blockchain1.getLatestBlock().hash!,
        transactionHash: 'hash1',
        nonce: 123,
        ceiling: parseInt(SimulatorConfig.CEILING, 16)
      },
      transactions: [coinbase1],
      hash: 'block1-hash'
    };
    
    // Block 2: Coinbase + payment from miner to peer
    const coinbase2 = createCoinbaseTransaction(minerAddress);
    const peerAddress = 'peer-address-1';
    const payment: EthereumTransaction = {
      txid: 'payment-tx',
      from: minerAddress,
      to: peerAddress,
      value: 1,
      nonce: 0, // Miner's first non-coinbase transaction
      timestamp: Date.now(),
      publicKey: 'miner-pubkey',
      signature: 'miner-sig'
    };
    
    const block2: Block = {
      header: {
        height: 2,
        timestamp: Date.now() + 1000,
        previousHeaderHash: 'block1-hash',
        transactionHash: 'hash2',
        nonce: 456,
        ceiling: parseInt(SimulatorConfig.CEILING, 16)
      },
      transactions: [coinbase2, payment],
      hash: 'block2-hash'
    };
    
    // Path 1: Add blocks incrementally to blockchain1
    await blockchain1.addBlock(block1);
    await blockchain1.addBlock(block2);
    
    // Get world state from incremental build
    const worldState1 = blockchain1.getWorldState();
    
    // Path 2: Replace entire chain in blockchain2 (rebuild from scratch)
    const genesis = blockchain2.getLatestBlock();
    await blockchain2.replaceChain([genesis, block1, block2]);
    
    // Get world state from rebuild
    const worldState2 = blockchain2.getWorldState();
    
    // They should be identical!
    console.log('WorldState1:', worldState1);
    console.log('WorldState2:', worldState2);
    
    expect(Object.keys(worldState1).sort()).toEqual(Object.keys(worldState2).sort());
    
    for (const address of Object.keys(worldState1)) {
      expect(worldState1[address].balance).toBe(worldState2[address].balance);
      expect(worldState1[address].nonce).toBe(worldState2[address].nonce);
    }
  });
});
