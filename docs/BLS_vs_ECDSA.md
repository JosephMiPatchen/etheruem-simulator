
# ECDSA vs BLS Signatures

Both **ECDSA** and **BLS** are digital signature algorithms that prove a message was authorized by the holder of a private key and that the message data hasn’t been altered.
Ethereum’s **execution layer** (regular transactions) uses **ECDSA** on the `secp256k1` curve, while the **consensus layer** (validator activity) uses **BLS** on the `BLS12-381` curve.

The main distinction is that **BLS supports aggregation**: many validators can sign the same message and combine their signatures into a single constant-size proof.
This lets thousands of validators attest to a block without bloating its size, whereas ECDSA requires one signature per signer.
Computation for each signer is similar, but verification and network cost scale very differently.

| Operation / Property          | **ECDSA**                    | **BLS**                                       |
| ----------------------------- | ---------------------------- | --------------------------------------------- |
| **Curve**                     | secp256k1                    | BLS12-381                                     |
| **Aggregation**               | ❌ Not supported              | ✅ Native aggregation                          |
| **Signers’ total work**       | O(M) (each signs once)       | O(M) (each signs once)                        |
| **Verifier work (M signers)** | O(M) (separate verifies)     | **O(1)** for same-message aggregate           |
| **Message-size factor (N)**   | Only affects one hash (O(N)) | Same (O(N))                                   |
| **Signature size**            | ≈ 65 B × M                   | **96 B (constant)**                           |
| **Used in Ethereum**          | User transactions            | Validator attestations, blocks, RANDAO reveal |

In short, **ECDSA** is simple and proven for single-party signatures, while **BLS** trades more complex math for massive scalability in multi-signer systems like Ethereum’s Proof-of-Stake.

### Why BLS is Used on the Consensus Layer

BLS is used on Ethereum’s consensus layer because it allows thousands of validator signatures to be **aggregated into a single constant-size proof**, reducing both bandwidth and verification cost from **O(M)** to **O(1)**. This makes block validation practical at Ethereum’s scale, where every epoch involves massive numbers of attestations. Beyond efficiency, BLS offers **deterministic aggregation**, simpler verification logic, and compatibility with modern cryptographic systems like zero-knowledge proofs. In short, it’s the only signature scheme that makes large-scale Proof-of-Stake consensus both lightweight and mathematically clean. Also the order of the child signatures does not matter which is super important for decentralized systems.x
