# RANDAO

Ethereum chooses the next proposer via a pseudorandom number sequence where fresh entropy is injected in the recurrence relation via a current proposer’s BLS signature of the current epoch, generated with their private key. Since no one knows the private key, the resulting entropy cannot be guessed, making it impossible for nodes to predict who will be the next proposer and perform a pre-meditated attack on the network. The RANDAO mix sequence is defined by the linear recurrence relation:

$$\text{Mix}_n = \text{Mix}_{n-1} \oplus H(\text{Reveal}_n)$$

Where $\text{Mix}_{n-1}$ is the mix from the previous slot, $\text{Reveal}_n$ is the validator's BLS signature of the current epoch, and $H()$ is a cryptographically secure hash function.

## The Proof of Equal Contribution

The critical security feature of the RANDAO accumulation mechanism is the mathematical guarantee that all participating validators contribute equally to the final random seed. This guarantee stems from the core properties of the XOR ($\oplus$) operation:

Commutativity: The order in which the inputs are XORed does not change the final result ($A \oplus B = B \oplus A$). This means the validator who proposes the first block of an epoch has the exact same cryptographic influence on the final mix as the validator who proposes the last block.

Associativity: The grouping of the XORed inputs does not change the result. This ensures that the final $\text{Mix}_n$ is perfectly equivalent to the XOR sum of all individual, hashed reveals:

$$\text{Mix}_n = H(\text{Reveal}_1) \oplus H(\text{Reveal}_2) \oplus \ldots \oplus H(\text{Reveal}_n)$$

These properties ensure that every single $\text{Reveal}$ retains its full entropy, making the final seed a truly collective and un-biasable product of all participants, which is fundamental to a decentralized protocol.

## Why a Hash Chain Fails

While a non-linear accumulation method like $\text{Mix}_n = H(\text{Mix}_{n-1} + \text{Reveal}_n)$ might seem like a stronger mixer, it is unsuitable for RANDAO because it destroys the necessary mathematical guarantee that each reveal has an equal contribution to the next choice of the proposer. This approach breaks the property of commutativity: the result of $H(A + B)$ is not equal to the result of $H(B + A)$. Therefore, applying the non-linear hash operation in different orders—for instance, one validator's reveal being processed before another's—yields an entirely different final mix, which is exactly the proposal bias the protocol seeks to avoid. You cannot construct the proof of equal contribution shown above because there is no mathematical way to equate these non-linear results.