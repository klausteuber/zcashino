# Zcashino

A provably fair, privacy-focused online casino powered by Zcash (ZEC).

## Features

- **Blockchain Provably Fair** - Server seed hashes committed to Zcash blockchain BEFORE you bet
- **On-Chain Verification** - Every game outcome is verifiable with blockchain proof
- **Privacy First** - No accounts required, play with Zcash shielded transactions
- **Instant Payouts** - Automatic withdrawals directly to your wallet
- **Transparent House Edge** - Clear disclosure of all odds

## Current Status

**Demo Mode** - The blackjack game is fully playable with server-side game logic and database persistence. Blockchain provably fair system uses mock commitments when no Zcash node is connected.

### Implemented
- ✅ Single-player Blackjack (Vegas Strip rules)
- ✅ Perfect Pairs side bet
- ✅ **Blockchain Provably Fair** - Server seed hashes committed on-chain before betting
- ✅ **Commitment Pool** - Pre-generated commitments for instant game starts
- ✅ **Verification System** - Full verification UI at `/verify`
- ✅ Hit, Stand, Double, Split actions
- ✅ Server-side API routes (`/api/session`, `/api/game`, `/api/wallet`, `/api/verify`, `/api/admin/pool`)
- ✅ SQLite database with Prisma 7 (sessions, games, transactions, wallets, commitments)
- ✅ Session management with balance tracking
- ✅ Game history persistence with blockchain proof data
- ✅ **Action History Replay** - Deterministic game state reconstruction for integrity
- ✅ **Zcash Wallet Integration** (deposit addresses, withdrawals, RPC client)
- ✅ **WalletPanel UI component** (balance display, deposit/withdraw interface)
- ✅ **Address validation** (t-addr, z-addr, u-addr support)

### UI/UX Features
- ✅ **Card Deal Animation** - Cards fly in from dealer shoe position with rotation and arc trajectory
- ✅ **3D Card Flip** - Enhanced perspective-based flip animation when dealer reveals hole card
- ✅ **Active Hand Highlight** - Gold pulsing glow indicates current player hand during turn
- ✅ **Winner/Loser Effects** - Green glow for winning hands, grayscale fade for losing hands
- ✅ **Dealer Turn Indicator** - Visual pulse effect while dealer is drawing cards
- ✅ **Insurance Prompt** - Interactive Yes/No buttons when dealer shows Ace (pays 2:1)
- ✅ **Balance Feedback** - Visual animations for wins (green pulse) and losses (red pulse)
- ✅ **Floating Payouts** - "+X.XXXX" floats up from balance on wins
- ✅ **Result Animations** - Blackjack glow, win celebration, loss shake, push effects
- ✅ **Sound Effects** - Web Audio API synthesized sounds (cards, chips, wins, losses)
- ✅ **Mute Toggle** - Sound can be enabled/disabled via header icon
- ✅ **Perfect Pairs Tooltip** - Hover info showing payout table (25:1, 12:1, 6:1)
- ✅ **Provably Fair UI** - Copy buttons, blockchain commitment display, verify link
- ✅ **Micro-interactions** - Button hover/press effects, chip selection feedback
- ✅ **Responsive Design** - Mobile-friendly layout with touch-optimized controls

### Coming Soon
- 🔄 Geo-blocking (UIGEA compliance)
- 🔄 Responsible gambling tools (limits, self-exclusion)
- 📋 Real ZEC node connection (testnet first)
- 📋 Sports betting (Phase 2)
- 📋 Poker (Phase 3)

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/zcashino.git
cd zcashino/zcashino-app

# Install dependencies
npm install

# Set up database
npx prisma db push

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the landing page.

Open [http://localhost:3000/blackjack](http://localhost:3000/blackjack) to play blackjack.

### Build for Production

```bash
npm run build
npm start
```

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **Database:** SQLite with Prisma 7 (LibSQL adapter)
- **Blockchain:** Zcash (ZEC)

## Game Rules

### Blackjack (Vegas Strip Rules)

- 6 decks, shuffled every hand (CSM-style)
- Dealer stands on soft 17
- Blackjack pays 3:2
- Double on any two cards
- Split any pair (up to 4 hands)
- Double after split allowed
- No surrender
- Insurance offered (2:1)

### Perfect Pairs Side Bet

- Mixed Pair (different color): 6:1
- Colored Pair (same color): 12:1
- Perfect Pair (same suit): 25:1

### House Edge

| Game | House Edge |
|------|------------|
| Blackjack (basic strategy) | ~0.5% |
| Perfect Pairs | ~4.5% |
| Insurance | ~7.4% |

## Blockchain Provably Fair

Every game uses an on-chain commit-reveal scheme:

### Flow
1. **Pre-commitment:** Server generates seed, commits SHA256 hash to Zcash blockchain
2. **Betting:** Player sees commitment tx hash + block height before placing bet
3. **Game execution:** Outcome determined by `SHA256(serverSeed:clientSeed:nonce)`
4. **Verification:** Server seed revealed, player can verify:
   - Hash matches pre-committed value
   - Commitment exists on blockchain (before game started)
   - Replay game with revealed seeds

### Commitment Pool
- Pre-generated commitments stored in database for instant game starts
- Background service maintains pool (refills when low, cleans expired)
- Each commitment has txHash, blockHeight, blockTimestamp

### Verification Page (`/verify`)
- Enter Game ID to verify any completed game
- Step-by-step verification: hash match, on-chain confirmation, timestamp validity, outcome replay
- Manual verification mode for external validation

### Demo Mode
When no Zcash node is connected, the system uses mock commitments (prefixed with `mock_`) for development/demo purposes. These demonstrate the full provably fair flow without requiring blockchain infrastructure.

See the [Provably Fair documentation](/provably-fair) for technical details.

### Game State Integrity

The game uses **action history replay** to ensure deterministic state reconstruction:

1. **Seeded Deck**: Each game's deck order is determined by `SHA256(serverSeed:clientSeed:nonce)`
2. **Action Storage**: Every player action (hit, stand, double, split) is recorded in `actionHistory`
3. **State Replay**: On each API request, the game state is reconstructed by:
   - Regenerating the deck from seeds (identical order every time)
   - Replaying all previous actions in sequence
   - Executing the new action
4. **Deck Position**: This ensures the deck position is always correct, preventing card duplication or loss

This architecture guarantees that cards dealt to the player remain in their hand throughout the game, and the dealer always draws from the correct position in the deck.

## Project Structure

```
zcashino-app/
├── prisma/
│   ├── schema.prisma       # Database schema (Session, BlackjackGame, Transaction, DepositWallet, SeedCommitment, GeoCheck)
│   └── dev.db              # SQLite database (dev)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── session/    # Session management API
│   │   │   ├── game/       # Game actions API
│   │   │   ├── wallet/     # Wallet API (deposits, withdrawals)
│   │   │   ├── verify/     # Game verification API
│   │   │   └── admin/pool/ # Commitment pool management API
│   │   ├── page.tsx        # Landing page
│   │   ├── blackjack/      # Blackjack game UI
│   │   ├── verify/         # Game verification page
│   │   └── globals.css     # Global styles & animations
│   ├── components/
│   │   ├── game/           # Card, Chip components
│   │   ├── ui/             # PepeLogo, shared UI
│   │   └── wallet/         # WalletPanel component
│   ├── hooks/
│   │   └── useGameSounds.ts # Web Audio sound effects
│   ├── lib/
│   │   ├── db.ts           # Prisma client with LibSQL adapter
│   │   ├── game/           # Blackjack logic, deck utilities
│   │   ├── provably-fair/  # Provably fair system
│   │   │   ├── index.ts    # Core provably fair functions
│   │   │   ├── blockchain.ts # Blockchain commitment service
│   │   │   └── commitment-pool.ts # Pool management
│   │   ├── services/
│   │   │   └── commitment-pool-manager.ts # Background pool service
│   │   └── wallet/         # Zcash wallet integration
│   │       ├── index.ts    # Core utilities, address validation
│   │       ├── addresses.ts # Address generation, deposit info
│   │       └── rpc.ts      # Zcash RPC client (zcashd)
│   └── types/              # TypeScript definitions
└── prisma.config.ts        # Prisma 7 configuration
```

## License

Proprietary - All rights reserved.

## Responsible Gambling

Gambling can be addictive. Please play responsibly.

- Set limits before you play
- Never chase losses
- Take breaks regularly
- Seek help if needed: [Gamblers Anonymous](https://www.gamblersanonymous.org)

---

**Note:** This software is for educational purposes. Operating an online casino may require licensing in your jurisdiction.
