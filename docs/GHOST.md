## Greedy Heaviest-Observed Sub-Tree Fork Selection Algo

In bitcoin you simply select the chain with the most proof of work, in Etheruem its more complex.

In Ethereum’s Proof-of-Stake, the GHOST fork-choice rule selects the canonical chain not by the longest or even the single most attested path, but by the heaviest subtree—the branch whose total validator-weighted attestations across all its descendants are greatest. This design makes consensus far more stable than a “heaviest path” rule because votes often arrive slightly out of sync and may scatter across nearby forks. By aggregating all attesting weight under each branch, GHOST captures the full network’s support and prevents the head from oscillating between competing chains when late attestations appear.

Example:
Imagine the block tree is decorated so that every node (block) records the total attestation weight of its entire subtree. To find the canonical chain—or fork choice—GHOST starts at the root (the justified checkpoint) and repeatedly moves to the child with the greatest total subtree weight. It keeps doing this step greedily—“greediest heaviest observed subtree”—until reaching a leaf node. That final leaf is the current head block, representing the canonical tip of the chain.