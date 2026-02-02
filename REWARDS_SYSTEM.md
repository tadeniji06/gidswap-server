# Rewards System Documentation

## Overview

The GidSwap Rewards System allows users to earn points for every successful swap transaction and withdraw those points as Naira.

## Key Features

- **Earn Points**: 1 USD swap = 1 Point
- **Minimum Withdrawal**: 5000 points = 5000 Naira
- **Automatic Calculation**: Points are automatically awarded when transactions are successful
- **Withdrawal System**: Users can request withdrawals to their bank accounts

---

## Database Models

### 1. User Model (Updated)

**File**: `models/User.js`

Added field:

```javascript
rewardPoints: { type: Number, default: 0 }
```

### 2. Rewards Model (New)

**File**: `models/Rewards.js`

Tracks individual reward transactions:

- `type`: "earned" or "withdrawn"
- `points`: Number of points
- `transaction`: Reference to Transaction (for earned rewards)
- `withdrawalDetails`: Bank account info and status (for withdrawals)

---

## API Endpoints

### Base URL: `/api/rewards`

All endpoints require authentication (JWT token).

### 1. Recalculate User Points

**POST** `/api/rewards/recalculate`

Calculates points from ALL successful transactions since account creation.

**Response:**

```json
{
	"success": true,
	"message": "Points recalculated successfully",
	"data": {
		"totalEarned": 15000,
		"totalWithdrawn": 5000,
		"currentBalance": 10000,
		"newRewardsAdded": 5
	}
}
```

---

### 2. Get Rewards Summary

**GET** `/api/rewards/summary`

Returns user's current points balance and summary.

**Response:**

```json
{
  "success": true,
  "data": {
    "currentBalance": 10000,
    "totalEarned": 15000,
    "totalWithdrawn": 5000,
    "minimumWithdrawal": 5000,
    "conversionRate": "1 point = 1 Naira",
    "canWithdraw": true,
    "recentActivity": [...]
  }
}
```

---

### 3. Get Reward History

**GET** `/api/rewards/history?page=1&limit=20`

Returns paginated list of all reward transactions.

**Query Parameters:**

- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)

**Response:**

```json
{
  "success": true,
  "data": {
    "rewards": [...],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "totalRecords": 50,
      "hasMore": true
    }
  }
}
```

---

### 4. Request Withdrawal

**POST** `/api/rewards/withdraw`

Request to withdraw points (minimum 5000).

**Request Body:**

```json
{
	"points": 5000,
	"accountDetails": {
		"accountNumber": "1234567890",
		"bankName": "GTBank",
		"accountName": "John Doe"
	}
}
```

**Response:**

```json
{
	"success": true,
	"message": "Withdrawal request submitted successfully",
	"data": {
		"withdrawalId": "64abc...",
		"points": 5000,
		"amountInNaira": 5000,
		"status": "pending",
		"remainingBalance": 5000
	}
}
```

**Validation:**

- Minimum withdrawal: 5000 points
- User must have sufficient balance
- Account details are required

---

### 5. Get Withdrawal History

**GET** `/api/rewards/withdrawals`

Returns all withdrawal requests by the user.

**Response:**

```json
{
  "success": true,
  "data": {
    "withdrawals": [
      {
        "_id": "64abc...",
        "points": -5000,
        "withdrawalDetails": {
          "amountInNaira": 5000,
          "status": "completed",
          "accountDetails": {...},
          "processedAt": "2026-02-02T10:00:00Z"
        },
        "createdAt": "2026-02-01T10:00:00Z"
      }
    ]
  }
}
```

---

### 6. Update Withdrawal Status (Admin)

**PATCH** `/api/rewards/withdrawals/:withdrawalId`

Update the status of a withdrawal request.

**Request Body:**

```json
{
	"status": "completed" // or "pending", "failed"
}
```

**Note:**

- If status is "failed", points are automatically refunded to the user
- If status is "completed", processedAt timestamp is set

---

## Automatic Points Award

Points are automatically awarded when a transaction reaches one of these statuses:

- `fulfilled`
- `validated`
- `settled`

**Implementation**: `routes/payCrestWebhook.js`

The webhook handler automatically calls `awardPointsForTransaction()` when a transaction is successful.

**Features:**

- Prevents duplicate awards for the same transaction
- Automatically updates user's total points
- Creates a reward record for tracking

---

## Helper Functions

### `awardPointsForTransaction(userId, transactionId, amountInUSD)`

**File**: `utils/rewardsHelper.js`

Automatically awards points for a successful transaction.

**Parameters:**

- `userId`: User's ObjectId
- `transactionId`: Transaction's ObjectId
- `amountInUSD`: Transaction amount in USD

**Returns:**

```javascript
{
  success: true,
  message: "Points awarded successfully",
  points: 100
}
```

---

## Usage Flow

### For Users:

1. **Make a swap** → Transaction is created
2. **Transaction succeeds** → Points are automatically awarded
3. **Check balance** → GET `/api/rewards/summary`
4. **Request withdrawal** → POST `/api/rewards/withdraw` (min 5000 points)
5. **Track withdrawal** → GET `/api/rewards/withdrawals`

### For Admins:

1. **Receive withdrawal request** → User submits withdrawal
2. **Process payment** → Transfer Naira to user's bank account
3. **Update status** → PATCH `/api/rewards/withdrawals/:id` with status "completed"

---

## Points Calculation

**Formula**: `1 USD = 1 Point`

Example:

- User swaps $100 USDT → Earns 100 points
- User swaps $50 USDC → Earns 50 points
- Total: 150 points

**Withdrawal**:

- 5000 points = ₦5,000
- 10000 points = ₦10,000

---

## Database Indexes

For optimal performance, the following indexes are created:

**Rewards Model:**

- `{ user: 1, createdAt: -1 }` - For fetching user's reward history
- `{ user: 1, type: 1 }` - For filtering by reward type

**Transactions Model:**

- `{ user: 1, orderId: 1 }` - For user transaction queries

---

## Error Handling

All endpoints return consistent error responses:

```json
{
	"success": false,
	"message": "Error description",
	"error": "Detailed error message"
}
```

Common errors:

- `400`: Invalid request (insufficient points, missing fields)
- `401`: Unauthorized (missing/invalid token)
- `404`: Resource not found
- `500`: Internal server error

---

## Testing the System

### 1. Test Points Calculation

```bash
# After a successful transaction, check if points were awarded
GET /api/rewards/summary
```

### 2. Test Recalculation

```bash
# Manually trigger recalculation
POST /api/rewards/recalculate
```

### 3. Test Withdrawal

```bash
# Request withdrawal
POST /api/rewards/withdraw
Body: {
  "points": 5000,
  "accountDetails": {
    "accountNumber": "1234567890",
    "bankName": "GTBank",
    "accountName": "Test User"
  }
}
```

---

## Future Enhancements

Potential features to add:

1. **Bonus Points**: Special promotions (e.g., 2x points on weekends)
2. **Referral Rewards**: Earn points for referring friends
3. **Point Expiry**: Points expire after X months
4. **Tiered Rewards**: Higher swap amounts earn bonus points
5. **Admin Dashboard**: View all withdrawal requests
6. **Email Notifications**: Notify users when points are earned/withdrawn

---

## Notes

- Points are only awarded for successful transactions (fulfilled/validated/settled)
- Duplicate awards are prevented automatically
- Failed withdrawals automatically refund points to the user
- All monetary values are stored as integers (no decimals for points)
- Withdrawal status must be manually updated by admin after processing payment

---

## Support

For issues or questions, contact the development team.
