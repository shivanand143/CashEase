// src/lib/types.ts
import type { User as FirebaseUser } from 'firebase/auth'; // Import Firebase User type
import type { Timestamp as FirestoreTimestamp } from 'firebase/firestore'; // Import Firestore Timestamp

// Export Firebase User type along with existing types
// Add optional role and ensure necessary fields for profile exist
export type User = FirebaseUser & { role?: 'user' | 'admin' };

export interface UserProfile {
  uid: string; // Firebase Auth UID, matches the document ID
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  role: 'user' | 'admin'; // User role
  cashbackBalance: number; // Current available cashback balance (confirmed, not paid out)
  pendingCashback: number; // Cashback waiting for confirmation
  lifetimeCashback: number; // Total confirmed cashback earned (including paid out)
  referralCode: string; // User's unique referral code
  referredBy?: string | null; // UID of the user who referred this user
  referralCount: number; // Number of users successfully referred
  referralBonusEarned?: number; // Optional: Total bonus earned from referrals
  isDisabled: boolean; // Flag to disable user account
  createdAt: Date | FirestoreTimestamp;
  updatedAt: Date | FirestoreTimestamp;
  lastPayoutRequestAt?: Date | FirestoreTimestamp | null; // Optional: Track last payout request time
  // Add other profile fields as needed, e.g., payout preferences
  payoutDetails?: {
      method?: 'paypal' | 'bank_transfer' | 'gift_card'; // Example methods
      details?: Record<string, string>; // Store details like email or account info securely
  };
}


export type CashbackType = 'percentage' | 'fixed';

export interface Store {
  id: string; // Firestore document ID
  name: string;
  logoUrl?: string | null;
  affiliateLink: string; // Base affiliate link
  cashbackRate: string; // Display text (e.g., "Up to 5%", "Flat ₹10")
  cashbackRateValue: number; // Numeric value for calculation
  cashbackType: CashbackType; // 'percentage' or 'fixed'
  description?: string; // Optional description, terms, conditions
  categories: string[]; // e.g., ["Fashion", "Electronics"]
  isActive: boolean;
  isFeatured?: boolean; // Optional: Highlight this store
  terms?: string; // Optional: Specific terms for the store's cashback
  popularityScore?: number; // Optional: For sorting/displaying popular stores
  createdAt: Date | FirestoreTimestamp;
  updatedAt: Date | FirestoreTimestamp;
}

export interface Coupon {
  id: string; // Firestore document ID
  storeId: string; // Reference to the Store document ID
  code?: string | null; // Coupon code (optional)
  description: string; // Details about the offer
  link?: string | null; // Direct link to the offer page (optional)
  expiryDate?: Date | FirestoreTimestamp | null; // Optional expiry date
  isFeatured: boolean; // Highlight this coupon
  isActive: boolean;
  usageCount?: number; // Optional: Track how many times used
  terms?: string; // Optional: Specific terms for the coupon
  createdAt: Date | FirestoreTimestamp;
  updatedAt: Date | FirestoreTimestamp;
}

// Interface for tracked clicks
export interface ClickLog {
  id: string; // Firestore document ID
  userId: string; // User who clicked
  storeId: string; // Store that was clicked
  couponId?: string; // Optional: Coupon associated with the click
  timestamp: Date | FirestoreTimestamp; // Time of the click
  userAgent?: string; // Browser/device info
  // Consider adding referrer URL if needed
  // ipAddress?: string; // User's IP address (Requires careful privacy handling and backend implementation)
}


export type CashbackStatus = 'pending' | 'confirmed' | 'rejected' | 'paid' | 'cancelled'; // Added 'cancelled'

export interface Transaction {
  id: string; // Firestore document ID
  userId: string; // User associated with the transaction
  storeId: string; // Store where the purchase was made
  clickId?: string | null; // Reference to the ClickLog ID
  orderId?: string | null; // Optional: Order ID from the retailer/network
  saleAmount: number; // Amount of the sale reported
  cashbackAmount: number; // Calculated cashback amount
  status: CashbackStatus;
  transactionDate: Date | FirestoreTimestamp; // Date of the purchase
  confirmationDate?: Date | FirestoreTimestamp | null; // Date cashback was confirmed/rejected
  paidDate?: Date | FirestoreTimestamp | null; // Optional: Date cashback was included in a payout
  payoutId?: string | null; // Reference to the PayoutRequest ID if included
  notes?: string | null; // Admin or system notes (e.g., reason for rejection/cancellation)
  createdAt: Date | FirestoreTimestamp; // Firestore record creation time
  updatedAt: Date | FirestoreTimestamp; // Firestore record update time
}

export type PayoutStatus = 'pending' | 'approved' | 'rejected' | 'processing' | 'completed' | 'failed'; // Added 'failed'

export interface PayoutRequest {
  id: string; // Firestore document ID
  userId: string; // User requesting payout
  amount: number; // Amount requested
  status: PayoutStatus;
  requestedAt: Date | FirestoreTimestamp;
  processedAt?: Date | FirestoreTimestamp | null; // Date the request status last changed
  paymentMethod: string; // e.g., "PayPal", "Bank Transfer"
  paymentDetails: Record<string, any>; // e.g., { paypalEmail: 'user@example.com' }
  adminNotes?: string | null; // Notes from the admin processing the request
  transactionIds: string[]; // List of Transaction IDs included in this payout
  failureReason?: string | null; // Optional: Reason if payout failed
}

// Renamed from ClickData for clarity
export interface TrackClickData {
    userId: string;
    storeId: string;
    couponId?: string;
    timestamp: any; // Using 'any' for serverTimestamp compatibility
    userAgent?: string;
}
