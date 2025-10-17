# Bitcoin Simulator Implementation Plan

Based on the requirements document, this implementation plan outlines a structured approach for developing the Bitcoin simulator. The plan breaks down the development into logical phases with clear milestones and includes key code snippets from the requirements document.

## Phase 1: Project Setup and Core Types

1. **Initialize React TypeScript Project**
   - Create project using Create React App with TypeScript template
   - Set up ESLint and Prettier for code quality
   - Configure directory structure as specified in requirements

2. **Implement Core Types**
   - Create `/src/types/types.ts` with all interfaces defined in requirements
   - Implement utility types for blockchain operations

3. **Configuration System**
   - Create `/src/config/config.ts` with simulator configuration parameters
   - Implement environment-specific configuration options
   
   Configuration parameters (from requirements):
   ```typescript
   // config.ts
   export const SimulatorConfig = {
     // Mining parameters
     BLOCK_REWARD: 4,           // BTC rewarded to miners
     CEILING: "0x01000000000000000000000000000000000000000000000000000000000000000",  // Target difficulty
     // Ceiling explanation: 
     // - SHA-256 produces a 256-bit (64 hex character) hash
     // - This ceiling requires the first hex digit to be 0
     // - Roughly 1/256 of all hashes will be valid
     // - This should provide reasonable mining difficulty for web workers
     
     // Network parameters
     NODE_COUNT: 4,             // Number of nodes in the network
     
     // Transaction parameters
     REDISTRIBUTION_PERCENTAGE: 50, // Percentage of coins to redistribute
     
     // Constants
     REWARDER_NODE_ID: "COINBASE-REWARD",
     GENESIS_BLOCK_HASH: "0000000000000000000000000000000000000000000000000000000000000000"
   };
   ```

## Phase 2: Blockchain Core Implementation

1. **Block and Transaction Data Structures**
   - Implement transaction creation and validation
   - Implement block structure and validation
   - Create SHA-256 hashing utilities
   
   Key types to implement (from requirements):
   ```typescript
   export interface TransactionInput {
     sourceOutputId: string;  // Format: "{txid}-{idx}" or "REWARDER_NODE_ID" for coinbase
   }

   export interface TransactionOutput {
     idx: number;        // Position index in the outputs array
     nodeId: string;     // Recipient node identifier
     value: number;      // BTC amount
   }

   export interface Transaction {
     txid?: string;      // Hash of inputs + outputs (calculated on creation)
     inputs: TransactionInput[];
     outputs: TransactionOutput[];
     timestamp?: number; // When the transaction was created
   }

   export interface UTXOSet {
     [sourceOutputId: string]: TransactionOutput;
   }

   export interface BlockHeader {
     transactionHash: string;  // SHA256 hash of all transactions
     timestamp: number;        // Local machine time
     previousHeaderHash: string; // Previous block's header hash
     ceiling: number;          // Target threshold value
     nonce: number;            // Value miners adjust to find valid hash
     height: number;           // Block height in the chain
   }

   export interface Block {
     header: BlockHeader;
     transactions: Transaction[];
     hash?: string;      // Calculated hash of the block header
   }
   ```

2. **UTXO Management**
   - Implement UTXO set data structure
   - Create functions for updating UTXO based on transactions
   - Implement validation of transaction inputs against UTXO

3. **Genesis Block Creation**
   - Implement genesis block generation
   - Create initial blockchain state

## Phase 3: Mining and Consensus

1. **Mining Logic**
   - Implement the mining process with non-blocking architecture
   - Create coinbase transaction generation
   - Implement "Robin Hood" transaction distribution
   
   Transaction creation implementation (from requirements):
   ```typescript
   // Helper function to calculate transaction ID
   function calculateTxid(inputs, outputs, blockHeight) {
     // Block height is included to ensure uniqueness across blocks
     // Without this, identical transactions in different blocks could have the same txid
     // This prevents UTXO collisions and mirrors Bitcoin's approach to coinbase uniqueness
     return sha256Hash(JSON.stringify({ 
       inputs, 
       outputs,
       blockHeight 
     }));
   }
   
   function createBlockTransactions(minerNodeId: string, peerNodes: string[], height: number): Transaction[] {
     // Create coinbase transaction first
     const coinbaseInputs = [{ sourceOutputId: CONFIG.REWARDER_NODE_ID }];
     const coinbaseOutputs = [{ idx: 0, nodeId: minerNodeId, value: CONFIG.BLOCK_REWARD }];
     
     const coinbaseTransaction = {
       inputs: coinbaseInputs,
       outputs: coinbaseOutputs,
       timestamp: Date.now(),
       blockHeight: height,
       txid: calculateTxid(coinbaseInputs, coinbaseOutputs, height)
     };
     
     // Calculate redistribution amounts
     const redistributionAmount = (CONFIG.BLOCK_REWARD * CONFIG.REDISTRIBUTION_PERCENTAGE) / 100;
     const amountPerPeer = redistributionAmount / peerNodes.length;
     
     // Create redistribution transaction using the coinbase output
     const coinbaseOutputId = `${coinbaseTransaction.txid}-0`;
     const redistributionInputs = [{ sourceOutputId: coinbaseOutputId }];
     
     // One output for each peer, plus change back to miner
     const redistributionOutputs = [
       ...peerNodes.map((peerId, idx) => ({
         idx,
         nodeId: peerId,
         value: amountPerPeer
       })),
       {
         idx: peerNodes.length,
         nodeId: minerNodeId,
         value: CONFIG.BLOCK_REWARD - redistributionAmount
       }
     ];
     
     const redistributionTransaction = {
       inputs: redistributionInputs,
       outputs: redistributionOutputs,
       timestamp: Date.now(),
       blockHeight: height,
       txid: calculateTxid(redistributionInputs, redistributionOutputs, height)
     };
     
     return [coinbaseTransaction, redistributionTransaction];
   }
   ```
   
   Mining process implementation (from requirements):
   ```typescript
   function setupMiningProcess(node) {
     // Flag to control mining state
     let isMining = false;
     
     // Start mining a new block
     function startMining(previousHeaderHash, height) {
       // Don't start if already mining
       if (isMining) return;
       
       isMining = true;
       
       // Prepare the block to mine
       const transactions = createBlockTransactions(node.id, node.peerIds, height);
       
       const header = {
         transactionHash: sha256Hash(JSON.stringify(transactions)),
         timestamp: Date.now(),
         previousHeaderHash,
         ceiling: CONFIG.CEILING,
         nonce: 0,
         height
       };
       
       let block = { header, transactions };
       
       // Schedule the mining loop to run without blocking
       scheduleMiningIteration(block);
     }
     
     // Perform a small batch of mining attempts, then yield to event loop
     function scheduleMiningIteration(block) {
       // Using setTimeout with 0 defers execution until after event processing
       // This is critical for allowing the node to respond to network messages
       setTimeout(() => {
         // Check if we should stop mining (e.g., if longer chain was found)
         if (!isMining) return;
         
         // CRITICAL: Check if the blockchain has changed since we started mining
         if (node.blockchain[node.blockchain.length - 1].hash !== block.header.previousHeaderHash) {
           console.log("Chain changed while mining, recomputing block template");
           // The chain has changed - we need to restart mining on the new tip
           const newTip = node.blockchain[node.blockchain.length - 1];
           stopMining();
           startMining(newTip.hash, newTip.header.height + 1);
           return;
         }
         
         // Perform a batch of mining attempts
         const BATCH_SIZE = 1000;
         let found = false;
         
         for (let i = 0; i < BATCH_SIZE; i++) {
           let blockHash = sha256Hash(JSON.stringify(block.header));
           
           // Check if hash is valid
           if (blockHash < CONFIG.CEILING) {
             // Found a valid block!
             block.hash = blockHash;
             handleMinedBlock(block);
             found = true;
             break;
           }
           
           // Try next nonce
           block.header.nonce++;
         }
         
         // If we didn't find a valid block, schedule another batch
         if (!found && isMining) {
           scheduleMiningIteration(block);
         }
       }, 0); // Zero timeout yields to the event loop without adding delay
     }
     
     // Handle successful mining
     function handleMinedBlock(block) {
       isMining = false;
       
       // Process the block locally
       node.addBlock(block);
       
       // Broadcast the block to peers
       node.broadcastBlock(block);
     }
     
     // Handle receiving a new block from the network
     function handleReceivedBlock(block) {
       // Validate the received block
       if (node.validateBlock(block)) {
         // If valid and creates a longer chain, adopt it
         if (node.addBlockToChain(block)) {
           // Stop current mining operation if we're adopting a new block
           stopMining();
           
           // Start mining on top of the new chain
           startMining(block.hash, block.header.height + 1);
         }
       }
     }
     
     // Stop current mining operation
     function stopMining() {
       isMining = false;
     }
     
     // Set up network message handlers
     node.onBlockReceived = handleReceivedBlock;
     node.onChainUpdated = (newTip) => {
       stopMining();
       startMining(newTip.hash, newTip.header.height + 1);
     };
     
     return {
       startMining,
       stopMining
     };
   }
   ```

2. **Consensus Mechanisms**
   - Implement longest chain rule
   - Create chain validation functions
   - Implement chain switching logic
   
   Nakamoto consensus implementation (from requirements):
   
   Blockchain nodes operate in a continuous cycle of communication, validation, and mining, with two primary communication functions:

   1. **Chain Length Management**:
      - Nodes actively request blockchain length information from peers
      - Nodes identify chains with greater proof-of-work than their own
      - Nodes respond to similar requests from other nodes

   2. **Block Propagation**:
      - Nodes broadcast newly mined blocks to the network
      - Nodes listen for block announcements from peers

   When a node discovers a longer blockchain (representing greater cumulative work in this fixed-difficulty system), it:
   1. Validates this chain by verifying that each block's header hash falls below the specified ceiling value
   2. Adopts this superior chain upon successful validation
   3. Redirects mining efforts toward extending this newly acquired blockchain

   The node follows a consistent protocol whenever its blockchain changes:
   1. Updates its local blockchain record
   2. Reconstructs its UTXO set by reprocessing all historical transactions
   3. When successful in mining, updates its own records before broadcasting the new block

3. **Block Validation**
   - Implement all validation rules specified in requirements
   - Create error handling for invalid blocks/transactions
   
   Validation rules to implement (from requirements):
   
   **Transaction Validation Rules**
   1. All transaction inputs must exist in the UTXO set, except for coinbase transactions
   2. The sum of input values must be greater than or equal to the sum of output values
   3. Coinbase transactions must have exactly one input with sourceOutputId equal to REWARDER_NODE_ID
   4. Coinbase transaction reward must equal BLOCK_REWARD
   5. Transaction IDs must be correctly calculated as the hash of inputs and outputs
   6. Transaction outputs must have sequential idx values starting from 0
   7. All values must be positive numbers

   **Block Validation Rules**
   1. Block header hash (using SHA-256) must be below the ceiling value when comparing the full 256-bit hash
   2. Previous header hash must match the hash of the previous block in the chain
   3. Block must contain at least one transaction (the coinbase transaction)
   4. First transaction must be a coinbase transaction
   5. All transactions in the block must be valid according to transaction validation rules
   6. Transaction hash in header must match the SHA-256 hash of all transactions
   7. Block timestamp must be reasonable (not too far in future or past)

## Phase 4: Network Communication

1. **Web Worker Setup**
   - Create node worker implementation
   - Set up message passing infrastructure

2. **Network Message Types**
   - Implement message types for block announcements, requests
   - Create chain length request/response handling

3. **Peer Discovery and Management**
   - Implement peer connection management
   - Create network topology for the 4 nodes

## Phase 5: BasicUI Implementation

1. **Main Application Layout**
   - Create 4-panel layout for nodes
   - Implement start/pause mining controls
   
   UI requirements (from requirements):
   
   - Simple frontend that displays the states of each of the 4 nodes
   - Start/pause mining button to control the simulation
   - 4-panel setup where each panel displays the state of a node
   - Orange cypherpunk theme
   
   Each node's panel will display:
   1. Node-ID and current status (mining/idle)
   2. A horizontal view of its blockchain, which will be a list of boxes labeled by block number and showing the last few digits of its header hash
   3. A button for the UTXO that displays the UTXO data structure in a modal
   4. Visual indication when a node mines a block
   5. Network connections visualization showing connections to other nodes

2. **Node Visualization**
   - Implement node status display
   - Create blockchain visualization with blocks and arrows
   - Implement UTXO modal display

3. **Mining Visualization**
   - Add visual indication for mining activity
   - Implement block creation animation

4. **Network Visualization**
   - Create network connections display
   - Implement message passing visualization


1. **Unit Testing**
   - Test blockchain operations
   - Test mining and consensus logic
   - Test network communication

2. **Integration Testing**
   - Test end-to-end mining process
   - Test consensus across multiple nodes
   - Test UI interactions

3. **Performance Optimization**
   - Optimize mining process
   - Improve UI rendering performance
   - Fine-tune network communication

## Phase 6: Secruity
refer to SECURITY_SCHEME.md

## Implementation Priorities

1. **First Priority**: Core blockchain data structures and operations
2. **Second Priority**: Mining and consensus mechanisms
3. **Third Priority**: Network communication between nodes
4. **Fourth Priority**: UI visualization and interaction

## Technical Considerations

1. **Web Worker Management**
   - Use structured clone algorithm for message passing
   - Implement error handling for worker crashes

2. **React State Management**
   - Consider using Context API for global state
   - Use reducers for complex state transitions

3. **Performance**
   - Implement batched mining to prevent UI freezing
   - Use efficient data structures for UTXO lookups

4. **Testing Strategy**
   - Unit test core blockchain logic
   - Integration test node communication
   - End-to-end test full mining cycles
