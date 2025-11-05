## Latest Message Driven Heaviest-Observed Sub-Tree Fork Selection Algo

In bitcoin you simply select the chain with the most proof of work, in Etheruem its more complex.

In Ethereum’s Proof-of-Stake, the LMD-GHOST (Latest-Message-Driven Greediest-Heaviest-Observed-Sub-Tree) fork-choice rule determines the canonical chain not by the longest or even the single most attested path, but by the heaviest subtree based on each validator’s latest attestation. Unlike a simple “heaviest-path” rule, which can oscillate when new blocks or late votes appear, LMD-GHOST aggregates the most recent vote from every validator and attributes that validator’s full effective balance to the block they last attested to as head. Older votes are ignored, so each validator contributes weight to exactly one branch at a time.

Example:
Imagine the block tree is decorated so that every node (block) records the total attestation weight of its entire subtree, computed using only each validator’s latest attestation. To find the canonical chain—or fork choice—LMD-GHOST starts at the root (the justified checkpoint) and repeatedly moves to the child whose subtree has the greatest total latest-attestation weight. It keeps doing this greedily—“greediest heaviest observed subtree”—until reaching a leaf node. That final leaf is the current head block, representing the canonical tip of Ethereum’s chain as seen by the most up-to-date validator votes.


Here’s a compact ASCII demo of **LMD-GHOST**.

```
Justified Checkpoint (J)
└─┬─ A
  │  ├─ A1
  │  └─ A2
  └─┬─ B
     └─ B1

Latest messages (one per validator):
  V1 → A2   V2 → A2   V3 → B1   V4 → A1   V5 → A2
  (assume each validator has equal weight)

Subtree weights (sum latest-vote weights bubbling up):
  A2: V1,V2,V5 = 3
  A1: V4       = 1
  A:  A1+A2    = 4

  B1: V3       = 1
  B:  B1       = 1

LMD-GHOST walk:
  At J: compare children A(4) vs B(1)  → pick A
  At A: compare children A1(1) vs A2(3) → pick A2
  → Head = A2
```

**Late update example (stability):**

```
Suppose V3 later attests to A2 (latest message moves from B1 → A2):

New subtree weights:
  A2: V1,V2,V5,V3 = 4
  A1: V4           = 1
  A:  5
  B1: —            = 0
  B:  0

Walk remains J → A → A2 (no oscillation).
```

**Legend**

* “Latest message” = only the validator’s most recent attestation counts.
* Node weight = sum of latest messages for all descendants (including the node).
* LMD-GHOST = at each step, pick the child with the **heaviest subtree**, until a leaf (the head).
