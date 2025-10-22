# Ethereum Simulator

A blockchain simulator demonstrating Ethereum's account-based model with Proof of Work (PoW) consensus. This project is evolving from a Bitcoin-style UTXO model toward a full Ethereum simulator with smart contracts and Proof of Stake.

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Installation

```bash
# Clone the repository
git clone https://github.com/JosephMiPatchen/etheruem-simulator.git
cd etheruem-simulator

# Install dependencies
npm install
```

## 🏃 Running the Simulator

### Start the Application

```bash
npm run start
```

This will:
- Start the Vite development server
- Open the simulator in your browser at `http://localhost:5173`
- Enable hot module replacement for live updates

### Build for Production

```bash
npm run build
```

The production-ready files will be in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## 🧪 Running Tests

### Run All Tests

```bash
npm test
```

This runs the complete test suite using Jest.

**Expected Output:**
```
Test Suites: 8 passed, 8 total
Tests:       77 passed, 77 total
Snapshots:   0 total
Time:        ~0.5s
```

### Run Tests in Watch Mode

```bash
npm test -- --watch
```

### Run Tests with Coverage

```bash
npm test -- --coverage
```

### Run Specific Test File

```bash
npm test <test-file-name>
```

Example:
```bash
npm test worldState
npm test blockchain
```

## 📁 Project Structure

```
etheruem-simulator/
├── src/
│   ├── core/
│   │   ├── blockchain/       # Blockchain, blocks, transactions, WorldState
│   │   ├── mining/           # Mining logic
│   │   ├── validation/       # Transaction and block validation
│   │   └── node.ts           # Node implementation
│   ├── network/              # P2P networking simulation
│   ├── ui/                   # React UI components
│   ├── utils/                # Cryptographic utilities
│   ├── types/                # TypeScript type definitions
│   └── config/               # Configuration constants
├── __tests__/                # Test files
└── dist/                     # Production build output
```

## 🔑 Key Features

### Ethereum Account Model
- **WorldState**: Manages account balances and nonces
- **Accounts**: Each account has an address, balance, and nonce
- **Transactions**: From/to addresses with value and nonce for replay protection

### Transaction Signing
- Uses **cryptographic commitment pattern**
- Signs just the `txid` (transaction hash)
- `txid = hash(from, to, value, nonce, timestamp)`
- Validation verifies both data integrity and authorization

### Mining & Consensus
- **Proof of Work (PoW)** mining with adjustable difficulty
- **Block rewards** for miners
- **Peer payments** to redistribute rewards across the network
- **Nonce-based** replay protection

### Validation
- Transaction signature verification
- Block hash validation
- Chain consistency checks
- Account balance and nonce verification

## 🧪 Test Coverage

The project includes comprehensive unit tests for:

- ✅ **WorldState** (16 tests) - Account management and state updates
- ✅ **Blockchain** - Block addition, chain validation, state management
- ✅ **Block Creation** - Genesis blocks, block templates
- ✅ **Mining** - Transaction creation, block mining
- ✅ **Validation** - Transaction, block, and chain validation
- ✅ **Cryptographic Utilities** - Hashing, signing, verification
- ✅ **Node Operations** - State management, peer communication

**Current Status:** 77/77 tests passing (100% pass rate)

## 🛠️ Development

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run start` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm test` | Run all tests |
| `npm test -- --watch` | Run tests in watch mode |
| `npm test -- --coverage` | Run tests with coverage report |

### Configuration

Key configuration values can be found in `src/config/config.ts`:

- `BLOCK_REWARD`: Reward for mining a block (default: 4 ETH)
- `CEILING`: Mining difficulty target
- `NODE_COUNT`: Number of nodes in the network
- `REDISTRIBUTION_RATIO`: Percentage of block reward to redistribute

## 🎯 Roadmap

This simulator is evolving toward a full Ethereum implementation:

### ✅ Completed
- [x] Ethereum account model (WorldState)
- [x] Account-based transactions
- [x] Nonce-based replay protection
- [x] Simplified transaction signing (cryptographic commitment)
- [x] Comprehensive test suite

### 🚧 In Progress
- [ ] UI updates for account model visualization

### 📋 Planned
- [ ] Smart contract platform
- [ ] Proof of Stake (PoS) consensus
- [ ] Validator system
- [ ] EVM-compatible execution environment

## 📚 Architecture

### Transaction Flow

1. **Create Transaction**: User creates transaction with from/to/value/nonce
2. **Calculate txid**: Hash of transaction data (excluding signature)
3. **Sign txid**: Sign the transaction hash with private key
4. **Broadcast**: Send to network
5. **Validate**: Nodes verify signature and account state
6. **Mine**: Miners include in blocks
7. **Update State**: WorldState updated with new balances/nonces

### Block Creation

1. **Coinbase Transaction**: Reward miner with block reward
2. **Peer Payments**: Distribute portion of reward to peers
3. **Calculate Hashes**: Transaction hash and block hash
4. **Mine**: Find valid nonce below difficulty target
5. **Broadcast**: Send to network for validation

## 🤝 Contributing

This is an educational project demonstrating blockchain concepts. Feel free to explore, learn, and experiment!

## 📄 License

MIT License - See LICENSE file for details

## 🔗 Links

- **Repository**: https://github.com/JosephMiPatchen/etheruem-simulator
- **Issues**: https://github.com/JosephMiPatchen/etheruem-simulator/issues

---

**Built with:** TypeScript, React, Vite, Jest, Noble Crypto Libraries
