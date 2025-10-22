import { Blockchain } from '../../../core/blockchain/blockchain';
import { createBlockTemplate } from '../../../core/blockchain/block';
import { createCoinbaseTransaction } from '../../../core/blockchain/transaction';
import { Block, EthereumTransaction } from '../../../types/types';
import { generatePrivateKey, derivePublicKey, generateSignature, sha256Hash } from '../../../utils/cryptoUtils';
import { createSignatureInput } from '../../../core/blockchain/transaction';

// Helper to create a transaction
async function createTestTransaction(
  from: string,
  to: string,
  value: number,
  nonce: number,
  privateKey: string
): Promise<EthereumTransaction> {
  const txid = sha256Hash({ from, to, value, nonce, timestamp: Date.now() });
  const signature = await generateSignature(createSignatureInput({ txid }), privateKey);
  const publicKey = derivePublicKey(privateKey);
  
  return {
    txid,
    from,
    to,
    value,
    nonce,
    timestamp: Date.now(),
    publicKey,
    signature
  };
}

describe('World State Consistency - Incremental vs Rebuild', () => {
  
  describe('Genesis only', () => {
    it('should have identical world states after genesis only', () => {
      const minerAddress = 'miner-1';
      const blockchain1 = new Blockchain('node1', minerAddress);
      const blockchain2 = new Blockchain('node2', minerAddress);
      
      const worldState1 = blockchain1.getWorldState();
      const worldState2 = blockchain2.getWorldState();
      
      // Both should have only the miner with genesis coinbase reward
      expect(Object.keys(worldState1).sort()).toEqual(Object.keys(worldState2).sort());
      expect(worldState1[minerAddress].balance).toBe(worldState2[minerAddress].balance);
      expect(worldState1[minerAddress].nonce).toBe(worldState2[minerAddress].nonce);
      
      // Should have 4 ETH from genesis
      expect(worldState1[minerAddress].balance).toBe(4);
    });
  });
  
  describe('Simple coinbase blocks', () => {
    it('should have identical world states after one block with only coinbase', async () => {
      const minerPrivateKey = generatePrivateKey('miner-1');
      const minerAddress = derivePublicKey(minerPrivateKey);
      
      const blockchain1 = new Blockchain('node1', minerAddress);
      const blockchain2 = new Blockchain('node2', minerAddress);
      
      // Create block 1 with only coinbase
      const block1 = createBlockTemplate(
        blockchain1.getLatestBlock(),
        [createCoinbaseTransaction(minerAddress)]
      );
      
      // Path 1: Add incrementally
      await blockchain1.addBlock(block1);
      const worldState1 = blockchain1.getWorldState();
      
      // Path 2: Replace chain
      const genesis = blockchain2.getLatestBlock();
      await blockchain2.replaceChain([genesis, block1]);
      const worldState2 = blockchain2.getWorldState();
      
      // Compare
      expect(Object.keys(worldState1).sort()).toEqual(Object.keys(worldState2).sort());
      expect(worldState1[minerAddress].balance).toBe(worldState2[minerAddress].balance);
      expect(worldState1[minerAddress].nonce).toBe(worldState2[minerAddress].nonce);
      
      // Both should have 8 ETH (genesis 4 + block1 4)
      expect(worldState1[minerAddress].balance).toBe(8);
    });
    
    it('should have identical world states after multiple coinbase-only blocks', async () => {
      const minerPrivateKey = generatePrivateKey('miner-1');
      const minerAddress = derivePublicKey(minerPrivateKey);
      
      const blockchain1 = new Blockchain('node1', minerAddress);
      const blockchain2 = new Blockchain('node2', minerAddress);
      
      // Create 3 blocks with only coinbase
      const block1 = createBlockTemplate(
        blockchain1.getLatestBlock(),
        [createCoinbaseTransaction(minerAddress)]
      );
      
      const block2 = createBlockTemplate(
        block1,
        [createCoinbaseTransaction(minerAddress)]
      );
      
      const block3 = createBlockTemplate(
        block2,
        [createCoinbaseTransaction(minerAddress)]
      );
      
      // Path 1: Add incrementally
      await blockchain1.addBlock(block1);
      await blockchain1.addBlock(block2);
      await blockchain1.addBlock(block3);
      const worldState1 = blockchain1.getWorldState();
      
      // Path 2: Replace chain
      const genesis = blockchain2.getLatestBlock();
      await blockchain2.replaceChain([genesis, block1, block2, block3]);
      const worldState2 = blockchain2.getWorldState();
      
      // Compare
      expect(Object.keys(worldState1).sort()).toEqual(Object.keys(worldState2).sort());
      expect(worldState1[minerAddress].balance).toBe(worldState2[minerAddress].balance);
      expect(worldState1[minerAddress].nonce).toBe(worldState2[minerAddress].nonce);
      
      // Should have 16 ETH (genesis 4 + 3 blocks * 4)
      expect(worldState1[minerAddress].balance).toBe(16);
    });
  });
  
  describe('Blocks with transfers', () => {
    it('should have identical world states with coinbase and transfer', async () => {
      const minerPrivateKey = generatePrivateKey('miner-1');
      const minerAddress = derivePublicKey(minerPrivateKey);
      const peerPrivateKey = generatePrivateKey('peer-1');
      const peerAddress = derivePublicKey(peerPrivateKey);
      
      const blockchain1 = new Blockchain('node1', minerAddress);
      const blockchain2 = new Blockchain('node2', minerAddress);
      
      // Block 1: Coinbase only
      const block1 = createBlockTemplate(
        blockchain1.getLatestBlock(),
        [createCoinbaseTransaction(minerAddress)]
      );
      
      // Block 2: Coinbase + transfer from miner to peer
      const transfer = await createTestTransaction(
        minerAddress,
        peerAddress,
        1,
        0, // nonce
        minerPrivateKey
      );
      
      const block2 = createBlockTemplate(
        block1,
        [createCoinbaseTransaction(minerAddress), transfer]
      );
      
      // Path 1: Incremental
      await blockchain1.addBlock(block1);
      await blockchain1.addBlock(block2);
      const worldState1 = blockchain1.getWorldState();
      
      // Path 2: Rebuild
      const genesis = blockchain2.getLatestBlock();
      await blockchain2.replaceChain([genesis, block1, block2]);
      const worldState2 = blockchain2.getWorldState();
      
      // Compare addresses
      expect(Object.keys(worldState1).sort()).toEqual(Object.keys(worldState2).sort());
      
      // Compare miner
      expect(worldState1[minerAddress].balance).toBe(worldState2[minerAddress].balance);
      expect(worldState1[minerAddress].nonce).toBe(worldState2[minerAddress].nonce);
      
      // Compare peer
      expect(worldState1[peerAddress].balance).toBe(worldState2[peerAddress].balance);
      expect(worldState1[peerAddress].nonce).toBe(worldState2[peerAddress].nonce);
      
      // Verify expected values
      // Miner: genesis(4) + block1(4) + block2(4) - transfer(1) = 11
      expect(worldState1[minerAddress].balance).toBe(11);
      expect(worldState1[minerAddress].nonce).toBe(1);
      
      // Peer: transfer(1) = 1
      expect(worldState1[peerAddress].balance).toBe(1);
      expect(worldState1[peerAddress].nonce).toBe(0);
    });
    
    it('should have identical world states with multiple transfers between accounts', async () => {
      const minerPrivateKey = generatePrivateKey('miner-1');
      const minerAddress = derivePublicKey(minerPrivateKey);
      const alicePrivateKey = generatePrivateKey('alice-1');
      const aliceAddress = derivePublicKey(alicePrivateKey);
      const bobPrivateKey = generatePrivateKey('bob-1');
      const bobAddress = derivePublicKey(bobPrivateKey);
      
      const blockchain1 = new Blockchain('node1', minerAddress);
      const blockchain2 = new Blockchain('node2', minerAddress);
      
      // Block 1: Coinbase + miner sends 2 ETH to Alice
      const tx1 = await createTestTransaction(minerAddress, aliceAddress, 2, 0, minerPrivateKey);
      const block1 = createBlockTemplate(
        blockchain1.getLatestBlock(),
        [createCoinbaseTransaction(minerAddress), tx1]
      );
      
      // Block 2: Coinbase + Alice sends 1 ETH to Bob
      const tx2 = await createTestTransaction(aliceAddress, bobAddress, 1, 0, alicePrivateKey);
      const block2 = createBlockTemplate(
        block1,
        [createCoinbaseTransaction(minerAddress), tx2]
      );
      
      // Block 3: Coinbase + Bob sends 0.5 ETH back to Alice
      const tx3 = await createTestTransaction(bobAddress, aliceAddress, 0.5, 0, bobPrivateKey);
      const block3 = createBlockTemplate(
        block2,
        [createCoinbaseTransaction(minerAddress), tx3]
      );
      
      // Path 1: Incremental
      await blockchain1.addBlock(block1);
      await blockchain1.addBlock(block2);
      await blockchain1.addBlock(block3);
      const worldState1 = blockchain1.getWorldState();
      
      // Path 2: Rebuild
      const genesis = blockchain2.getLatestBlock();
      await blockchain2.replaceChain([genesis, block1, block2, block3]);
      const worldState2 = blockchain2.getWorldState();
      
      // Compare all addresses
      expect(Object.keys(worldState1).sort()).toEqual(Object.keys(worldState2).sort());
      
      for (const address of Object.keys(worldState1)) {
        expect(worldState1[address].balance).toBe(worldState2[address].balance);
        expect(worldState1[address].nonce).toBe(worldState2[address].nonce);
      }
      
      // Verify expected values
      // Miner: genesis(4) + block1(4) + block2(4) + block3(4) - tx1(2) = 14
      expect(worldState1[minerAddress].balance).toBe(14);
      expect(worldState1[minerAddress].nonce).toBe(1);
      
      // Alice: tx1(2) - tx2(1) + tx3(0.5) = 1.5
      expect(worldState1[aliceAddress].balance).toBe(1.5);
      expect(worldState1[aliceAddress].nonce).toBe(1);
      
      // Bob: tx2(1) - tx3(0.5) = 0.5
      expect(worldState1[bobAddress].balance).toBe(0.5);
      expect(worldState1[bobAddress].nonce).toBe(1);
    });
  });
  
  describe('Edge cases - Invalid transactions', () => {
    it('should handle failed transactions identically (insufficient balance)', async () => {
      const minerPrivateKey = generatePrivateKey('miner-1');
      const minerAddress = derivePublicKey(minerPrivateKey);
      const peerAddress = derivePublicKey(generatePrivateKey('peer-1'));
      
      const blockchain1 = new Blockchain('node1', minerAddress);
      const blockchain2 = new Blockchain('node2', minerAddress);
      
      // Block 1: Coinbase + invalid transfer (insufficient balance)
      // Miner only has 4 ETH from genesis, trying to send 10 ETH
      const invalidTx = await createTestTransaction(minerAddress, peerAddress, 10, 0, minerPrivateKey);
      
      const block1 = createBlockTemplate(
        blockchain1.getLatestBlock(),
        [createCoinbaseTransaction(minerAddress), invalidTx]
      );
      
      // Path 1: Incremental
      await blockchain1.addBlock(block1);
      const worldState1 = blockchain1.getWorldState();
      
      // Path 2: Rebuild
      const genesis = blockchain2.getLatestBlock();
      await blockchain2.replaceChain([genesis, block1]);
      const worldState2 = blockchain2.getWorldState();
      
      // Compare
      expect(Object.keys(worldState1).sort()).toEqual(Object.keys(worldState2).sort());
      expect(worldState1[minerAddress].balance).toBe(worldState2[minerAddress].balance);
      
      // Invalid transaction should be skipped, so miner should have genesis(4) + block1(4) = 8
      expect(worldState1[minerAddress].balance).toBe(8);
      
      // Peer should not exist (transaction failed)
      expect(worldState1[peerAddress]).toBeUndefined();
      expect(worldState2[peerAddress]).toBeUndefined();
    });
  });
});
