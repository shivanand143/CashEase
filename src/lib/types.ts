// src/lib/types.ts
import type { User as FirebaseUser } from 'firebase/auth'; // Import Firebase User type
import type { Timestamp as FirestoreTimestamp } from 'firebase/firestore'; // Import Firestore Timestamp

// Export Firebase User type along with existing types
export type User = FirebaseUser;

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  role: 'user' | 'admin'; // User role
  cashbackBalance: number; // Current available cashback balance (confirmed, not paid out)
  pendingCashback: number; // Cashback waiting for confirmation
  lifetimeCashback: number; // Total confirmed cashback earned (including paid out)
  referralCode?: string | null; // Optional referral code - allow null
  referredBy?: string | null; // UID of the user who referred this user - allow null
  isDisabled?: boolean; // Optional: Flag to disable user account
  createdAt: Date | FirestoreTimestamp; // Allow both Date and Timestamp initially
  updatedAt?: Date | FirestoreTimestamp; // Allow both Date and Timestamp initially
}

export type CashbackType = 'percentage' | 'fixed';

export interface Store {
  id: string; // Firestore document ID
  name: string;
  logoUrl?: string | null; // URL to the store's logo, optional
  affiliateLink: string; // Base affiliate link (may need appending parameters)
  cashbackRate: string; // Display text for cashback rate (e.g., "Up to 5%", "Flat ₹10")
  cashbackRateValue: number; // Numeric value for calculation (e.g., 0.05 for 5%, 10 for ₹10)
  cashbackType: CashbackType; // 'percentage' or 'fixed'
  description?: string; // Optional description or terms
  categories: string[]; // e.g., ["Fashion", "Electronics"]
  isActive: boolean; // Whether the store is currently active
  createdAt: Date | FirestoreTimestamp;
  updatedAt: Date | FirestoreTimestamp;
}

export interface Coupon {
  id: string; // Firestore document ID
  storeId: string; // Reference to the Store document ID
  code?: string | null; // Make code optional/nullable
  description: string; // Details about the coupon offer
  link?: string | null; // Direct link to the offer/coupon page (can be affiliate link), optional
  expiryDate?: Date | FirestoreTimestamp | null; // Optional expiry date
  isFeatured: boolean; // Highlight this coupon
  isActive: boolean;
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
  // ipAddress?: string; // User's IP address (handle privacy implications - Requires backend handling)
  // trackingId?: string; // Unique ID passed to affiliate network (if possible)
}


export type CashbackStatus = 'pending' | 'confirmed' | 'rejected' | 'paid';

export interface Transaction {
  id: string; // Firestore document ID (can be auto-generated or from affiliate network)
  userId: string; // User associated with the transaction
  storeId: string; // Store where the purchase was made
  clickId?: string | null; // Reference to the ClickLog ID (for matching)
  saleAmount: number; // Amount of the sale reported by affiliate network
  cashbackAmount: number; // Calculated cashback amount
  status: CashbackStatus;
  transactionDate: Date | FirestoreTimestamp; // Date of the purchase (from affiliate report)
  confirmationDate?: Date | FirestoreTimestamp | null; // Date the cashback was confirmed/rejected by admin
  payoutId?: string | null; // Reference to the PayoutRequest ID if included
  adminNotes?: string | null; // Admin notes (e.g., reason for rejection)
  // Timestamps for the transaction record itself in Firestore
  createdAt: Date | FirestoreTimestamp;
  updatedAt: Date | FirestoreTimestamp;
}

export type PayoutStatus = 'pending' | 'approved' | 'rejected' | 'processing' | 'completed';

export interface PayoutRequest {
  id: string; // Firestore document ID
  userId: string; // User requesting payout
  amount: number; // Amount requested (should match sum of transaction cashback amounts)
  status: PayoutStatus;
  requestedAt: Date | FirestoreTimestamp; // Use Date or Timestamp
  processedAt?: Date | FirestoreTimestamp | null; // Date the request was approved/rejected/processed
  paymentMethod: string; // e.g., "PayPal", "Bank Transfer"
  paymentDetails: Record<string, any>; // e.g., { paypalEmail: 'user@example.com' }
  adminNotes?: string; // Notes from the admin processing the request
  transactionIds: string[]; // List of Transaction IDs included in this payout
}

// Renamed from ClickData to avoid confusion with ClickLog interface
export interface TrackClickData {
    userId: string;
    storeId: string;
    couponId?: string;
    timestamp: any; // Using 'any' for serverTimestamp compatibility
    userAgent?: string;
    // ipAddress?: string;
}
