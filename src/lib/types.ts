// src/lib/types.ts
import type { User as FirebaseUser } from 'firebase/auth'; // Import Firebase User type

// Export Firebase User type along with existing types
export type User = FirebaseUser;

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  role: 'user' | 'admin'; // User role
  cashbackBalance: number; // Current available cashback balance
  pendingCashback: number; // Cashback waiting for confirmation
  lifetimeCashback: number; // Total cashback earned
  referralCode?: string | null; // Optional referral code - allow null
  referredBy?: string | null; // UID of the user who referred this user - allow null
  createdAt: Date;
  updatedAt?: Date; // Added optional updatedAt
}

export interface Store {
  id: string; // Firestore document ID
  name: string;
  logoUrl: string; // URL to the store's logo
  affiliateLink: string; // Base affiliate link (may need appending parameters)
  cashbackRate: string; // Display text for cashback rate (e.g., "Up to 5%", "Flat $10")
  description?: string; // Optional description or terms
  categories: string[]; // e.g., ["Fashion", "Electronics"]
  isActive: boolean; // Whether the store is currently active
  createdAt: Date;
  updatedAt: Date;
}

export interface Coupon {
  id: string; // Firestore document ID
  storeId: string; // Reference to the Store document ID
  code?: string | null; // Make code optional/nullable
  description: string; // Details about the coupon offer
  link?: string | null; // Direct link to the offer/coupon page (can be affiliate link), optional
  expiryDate?: Date | null; // Optional expiry date
  isFeatured: boolean; // Highlight this coupon
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClickLog {
  id: string; // Firestore document ID
  userId: string; // User who clicked
  storeId: string; // Store that was clicked
  couponId?: string; // Optional: Coupon associated with the click
  timestamp: Date; // Time of the click
  userAgent?: string; // Browser/device info
  ipAddress?: string; // User's IP address (handle privacy implications)
  trackingId?: string; // Unique ID passed to affiliate network (if possible)
}

export type CashbackStatus = 'pending' | 'confirmed' | 'rejected' | 'paid';

export interface Transaction {
  id: string; // Firestore document ID (or affiliate network's transaction ID if unique)
  userId: string; // User associated with the transaction
  storeId: string; // Store where the purchase was made
  clickId?: string; // Reference to the ClickLog ID (for matching)
  saleAmount: number; // Amount of the sale reported by affiliate network
  cashbackAmount: number; // Calculated cashback amount
  status: CashbackStatus;
  transactionDate: Date; // Date of the purchase
  confirmationDate?: Date | null; // Date the cashback was confirmed/rejected
  payoutId?: string | null; // Reference to the PayoutRequest ID if included
  notes?: string; // Admin notes (e.g., reason for rejection)
  createdAt: Date;
  updatedAt: Date;
}

export type PayoutStatus = 'pending' | 'approved' | 'rejected' | 'processing' | 'completed';

export interface PayoutRequest {
  id: string; // Firestore document ID
  userId: string; // User requesting payout
  amount: number; // Amount requested
  status: PayoutStatus;
  requestedAt: Date; // Use Date directly
  processedAt?: Date | null; // Date the request was approved/rejected/processed
  paymentMethod: string; // e.g., "PayPal", "Bank Transfer"
  paymentDetails: Record<string, any>; // e.g., { paypalEmail: 'user@example.com' }
  adminNotes?: string; // Notes from the admin processing the request
  transactionIds: string[]; // List of Transaction IDs included in this payout
}

// Fix for logClick type error - ClickData needs to be defined
export interface ClickData {
    userId: string;
    storeId: string;
    couponId?: string;
    timestamp: any; // Using 'any' for serverTimestamp compatibility
    // userAgent?: string; // Optional fields
    // ipAddress?: string; // Optional fields
}
