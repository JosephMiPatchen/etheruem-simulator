# Networking Overview (Quick Reference)

This simulator runs multiple blockchain nodes on a single JavaScript thread and uses the event loop to create realistic, asynchronous networking and mining behavior without Web Workers/threads.

## The Two Timer Systems

1) Periodic Sync (setInterval)
- Purpose: Keep nodes converged on the longest chain.
- There is ONE setInterval started by the app. Every N ms (1000ms), it asks every node to request heights from all its peers.

```ts
// networkManager.startPeriodicHeightRequests(1000)
setInterval(() => {
  for (const node of this.nodesMap.values()) {
    node.requestHeightFromPeers();
  }
}, 1000);
```

Flow:
- Node A sends HEIGHT_REQUEST to its peers.
- Peers respond with HEIGHT_RESPONSE { height }.
- If a peer is taller, Node A sends CHAIN_REQUEST to that peer.
- Peer replies with CHAIN_RESPONSE { blocks }.
- Node A validates and, if longer and valid, replaces its chain.

All of these messages are routed by NetworkManager with a random network delay (50–200ms), so each send is scheduled as a later task:

```ts
// Simulated network latency for every message
aSyncRoute(message) {
  setTimeout(() => {
    deliver(message); // later, on the callback queue
  }, randomDelay(50, 200));
}
```

2) Mining (recursive setTimeout)
- Purpose: Simulate concurrent mining without blocking the main thread.
- When the user clicks Start Mining, each node schedules a mining batch with setTimeout(fn, 0). Each batch tries a fixed number of nonces and then schedules the next batch if no solution was found.

```ts
// Pseudocode similar to Miner.mineBlock()
setTimeout(() => {
  const batchSize = MINING_BATCH_SIZE;
  let found = false;
  for (let i = 0; i < batchSize; i++) {
    const hash = calculateBlockHeaderHash(block.header);
    if (isHashBelowCeiling(hash, CEILING)) {
      found = true;
      broadcastBlock(block); // schedules network-delayed sends
      break;
    }
    block.header.nonce = Math.floor(Math.random() * 0xFFFFFFFF);
  }
  if (!found && this.isMining) {
    // Schedule the next batch (yields back to event loop in between)
    this.mineBlock(block, expectedPreviousHash);
  }
}, 0);
```

Key properties:
- setTimeout(fn, 0) yields to the event loop; the batch runs later (~1ms), allowing other nodes and network tasks to interleave.
- Broadcasting a block uses the same network delay pattern, so peers receive it 50–200ms later and then stop their old mining and start mining on the new tip.

## Message Handling

Every incoming message is handled by NodeWorker.receiveIncomingMessage, which dispatches by type:

```ts
switch (message.type) {
  case BLOCK_ANNOUNCEMENT: handleBlockAnnouncement(msg); break;
  case CHAIN_REQUEST:      handleChainRequest(msg);      break;
  case CHAIN_RESPONSE:     handleChainResponse(msg);     break;
  case HEIGHT_REQUEST:     handleHeightRequest(msg);     break;
  case HEIGHT_RESPONSE:    handleHeightResponse(msg);    break;
}
```

- BLOCK_ANNOUNCEMENT: peer mined a block; validate/add; restart mining on new tip.
- HEIGHT_RESPONSE: if peer is taller, request full chain.
- CHAIN_RESPONSE: validate full chain; if longer and valid, replace; rebuild UTXO; optionally restart mining.

## Why This Feels Concurrent

- Mining batches (setTimeout 0) from multiple nodes and delayed network deliveries (setTimeout 50–200ms) are interleaved by the event loop. The system looks concurrent even though it’s a single thread.
- setInterval (height checks) is resilient—fires every period regardless of errors. Recursive setTimeout is fragile—an exception before scheduling the next batch would stop that node’s mining unless guarded with try/catch.

## TL;DR
- One setInterval drives periodic height sync for all nodes.
- Mining is a chain of small, recursive setTimeout batches per node.
- All inter-node messages are delivered later with a random delay to simulate real network latency.
- This yields realistic forks, reorgs, and convergence without threads or workers.
