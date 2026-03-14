# Crypto-to-Fiat Onramp Pipeline

## Overview
The GidSwap Onramp Pipeline provides a single, seamless flow for users to convert Crypto directly to Fiat (NGN) in their bank account.

Behind the scenes, the backend runs an automated background bridge:
1. **Leg 1**: User sends Crypto to FixedFloat → FixedFloat converts to Stablecoin and sends it **to the User's Wallet**.
2. **Confirmation**: Once FixedFloat confirms the swap is `DONE`, the backend waits for the user to confirm receipt.
3. **Leg 2**: User clicks "Continue", bridging PayCrest to generate a PayCrest deposit address. The user then sends their Stables to that address, and PayCrest deposits NGN to their bank.

The client interacts with **three** API calls for the entire lifecycle: `/initiate`, `/continue-to-fiat` and status polling `/status`.

---

## The Workflow

```text
CLIENT                       BACKEND                        EXTERNAL APIs
  │                             │                                │
  │  POST /api/onramp/initiate  │                                │
  │─────────────────────────────▶                                │
  │                             │ 1. Creates OnrampSession       │
  │                             │ 2. Instructs FF to send        │
  │                             │    stables to USER'S WALLET    │
  │                             │─────────────────────────────▶ FF
  │                             │◀──────── FF deposit address ──│
  │◀─── deposit address + ID ───│                                │
  │                             │                                │
  │  [User sends crypto to FF]  │                                │
  │                             │                                │
  │                         [BG POLLER]                          │
  │                         polls FF every ~15-30s               │
  │                             │─────── GET /status ──────────▶ FF
  │                             │◀────── "completed" ───────────│
  │                             │                                │
  │  [User confirms receipt]    │                                │
  │  POST /continue-to-fiat     │                                │
  │─────────────────────────────▶                                │
  │                             │──── POST initOrder ──────────▶ PC
  │                             │◀─── PC deposit address ───────│
  │◀─── PC deposit address ─────│                                │
  │                             │                                │
  │ [User sends stables to PC]  │                                │
  │                             │                                │
  │                         [PC WEBHOOK / PC POLLER]             │
  │                         → "settled" → done! ✅               │
  │                             │                                │
  │  GET /api/onramp/status/:id │                                │
  │─────────────────────────────▶                                │
  │◀─── full pipeline status ───│                                │
```

---

No environment variables needed for hot wallets anymore, as all funds are transferred between the 3rd party and the user's wallet directly. STABLE_RECEIVE_ADDRESS can be ignored or safely removed.

---

## API Documentation

### Base URL: `/api/onramp`

All endpoints (except `/rate`) require authentication (JWT token).

### 1. Pre-initiation Rate Quote
**GET** `/api/onramp/rate`

Provides estimated NGN payout *before* the user starts the swap.

**Query Parameters:**
- `fromCurrency`: e.g. "ETH"
- `fromAmount`: e.g. 0.05
- `toStable` (optional): e.g. "USDTBSC". Defaults to "USDTBSC" (Lowest fee network).

**Response:**
```json
{
  "success": true,
  "data": {
    "from": { "currency": "ETH", "amount": 0.05 },
    "intermediate": { "currency": "USDTBSC", "estimatedAmount": 95.5 },
    "to": { "currency": "NGN", "estimatedAmount": 115000, "ratePerStable": 1200 }
  }
}
```

---

### 2. Initiate Onramp
**POST** `/api/onramp/initiate`

Starts the full pipeline. Returns the deposit address for the user's crypto.

**Request Body:**
```json
{
  "fromCurrency": "ETH",
  "fromNetwork": "ETH",
  "fromAmount": 0.05,
  "toStable": "USDTBSC", // Optional
  "payoutDetails": {
    "walletAddress": "0xUserWalletToReceiveStablesDAB3...",
    "bankCode": "058", // GTB
    "accountNumber": "0123456789",
    "accountName": "John Doe",
    "currency": "NGN"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Onramp initiated successfully.",
  "data": {
    "sessionId": "64abcd1234...",
    "status": "ff_awaiting",
    "sendCrypto": {
      "currency": "ETH",
      "network": "ETH",
      "amount": 0.05,
      "depositAddress": "0xabc123ez...",
      "expiresAt": "2026-03-14T15:00:00Z"
    },
    "estimates": {
      "stableAmount": 95.5,
      "ngnPayout": 115000
    }
  }
}
```

---

### 3. Continue to Fiat (Leg 2)
**POST** `/api/onramp/continue-to-fiat`

Called *after* the user receives Stables in their wallet and wants to complete the fiat payout to their bank. Initiates PayCrest order.

**Request Body:**
```json
{
  "sessionId": "64abcd1234..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Fiat payout initiated. Please send stables to the PayCrest address.",
  "data": {
    "status": "pc_awaiting",
    "fiatLeg": {
      "amountToSend": 95.5,
      "token": "USDT",
      "network": "bnb-smart-chain",
      "payCrestDepositAddress": "0xPayCrestDepositAddress...",
      "reference": "ONRAMP-64ABCD..."
    }
  }
}
```

---

### 4. Get Pipeline Status
**GET** `/api/onramp/status/:sessionId`

Client should poll this endpoint (e.g. every 5 seconds) to track the complete pipeline without worrying about the underlying services.

**Pipeline Statuses:**
- `ff_pending` → Initializing...
- `ff_awaiting` → Waiting for user to send crypto to FixedFloat
- `ff_converting` → FixedFloat received crypto, converting to Stables
- `ff_done` → Conversion done! User received Stables in wallet. Awaiting confirmation (`/continue-to-fiat`).
- `pc_pending` → Opening PayCrest leg
- `pc_awaiting` → Paycrest opened, waiting for User to send their Stables to PayCrest deposit address.
- `pc_processing` → PayCrest converting fiat to user's bank
- `completed` → Fiat successfully sent to user's bank account ✅
- `failed` → Swap failed or payment reversed
- `expired` → User didn't send crypto in time

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "64ab...",
    "status": "pc_processing",
    "statusLabel": "Fiat payout processing…",
    "cryptoLeg": {
       "status": "DONE",
       "actualStableAmount": 95.5
    },
    "fiatLeg": {
       "status": "processing",
       "token": "USDT",
       "network": "bnb-smart-chain"
    },
    "estimatedNGN": 115000,
    "finalNGN": null
  }
}
```

---

### 4. Fetch History
**GET** `/api/onramp/history?page=1&limit=10`

Fetches paginated user's onramp history. 

---

## Background Components

1. **`OnrampSession` Model (`models/OnrampSession.js`)**:
   Tracks the full lifecycle of the trade across both FixedFloat and PayCrest legs.
2. **`onrampPoller` (`services/onrampPoller.js`)**:
   Booted in `app.js` runs a continuous global loop every 15 seconds checking status. When FixedFloat hits `DONE`, the poller intercepts it to bridge to PayCrest automatically.
3. **`payCrestBridge` (`utils/payCrestBridge.js`)**:
   Reads the completed FF response, calculates the exact stables delivered, and spins up a PayCrest order targeted directly to the user's Bank account.
4. **`payCrestWebhook` Update**:
   Gracefully accommodates Webhooks that map to `OnrampSession`s in addition to traditional `Transaction`s. Prevents ghosting on 404s.

## Supported Stables Config (`utils/stableConfig.js`)
Config ensures compatibility between FixedFloat's outbound crypto pairs and PayCrest's inbound Stablecoin networks. 
Supported chains: Ethereum, Polygon, BSC, Base, Arbitrum (For USDC/USDT).
