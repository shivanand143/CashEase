
// src/lib/types.ts
import type { Timestamp } from 'firebase/firestore';

// Basic user type from Firebase Auth
export type { User } from 'firebase/auth';

// User Profile stored in Firestore
export interface UserProfile {
  uid: string; // Corresponds to Firebase Auth UID
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: 'user' | 'admin'; // User roles
  cashbackBalance: number; // Confirmed cashback available for payout
  pendingCashback: number; // Cashback tracked but not yet confirmed
  lifetimeCashback: number; // Total confirmed cashback earned over time
  referralCode: string | null; // User's unique referral code
  referralCount: number; // Number of users referred
  referralBonusEarned: number; // Total bonus earned from referrals
  referredBy: string | null; // UID of the user who referred this user
  isDisabled: boolean; // To disable user accounts
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
  lastPayoutRequestAt?: Date | Timestamp | null;
  payoutDetails?: PayoutDetails | null;
}

// Payout Details
export interface PayoutDetails {
  method: PayoutMethod;
  detail: string;
}

export type CashbackStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'paid';

export interface Transaction {
  id: string; // Firestore document ID
  userId: string;
  clickId?: string | null; // Link to the original click, if available
  storeId: string;
  storeName?: string | null; // Denormalized for easier display
  orderId?: string | null; // Retailer's order ID
  productDetails?: string | null; // e.g., "iPhone 15, 2 items of clothing"
  transactionDate: Date | Timestamp; // Date of purchase
  reportedDate?: Date | Timestamp; // Date admin/system reported/entered it
  saleAmount: number; // Initial sale amount reported
  cashbackRateApplied?: string | null; // e.g., "5%" or "₹50 Flat"
  initialCashbackAmount?: number; // Calculated or manually entered
  finalSaleAmount?: number | null; // Updated by admin for adjustments
  finalCashbackAmount?: number | null; // Updated by admin
  currency?: string; // e.g., "INR"
  status: CashbackStatus;
  confirmationDate?: Date | Timestamp | null; // Date cashback confirmed
  rejectionReason?: string | null;
  paidDate?: Date | Timestamp | null; // Date cashback was included in a payout
  payoutId?: string | null; // ID of the PayoutRequest this transaction was part of
  adminNotes?: string | null; // For admin internal use
  notesToUser?: string | null; // e.g., reason for adjustment or rejection visible to user
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

export interface Click {
    id: string; // Firestore document ID (this will be the generated clickId)
    userId: string;
    storeId: string;
    storeName?: string | null; // Denormalized
    couponId?: string | null;
    productId?: string | null;
    productName?: string | null; // Denormalized
    affiliateLink: string; // The final affiliate link clicked
    timestamp: Date | Timestamp;
    userAgent?: string | null;
    clickId: string; // Ensure clickId is part of the data itself
}

export type CashbackType = 'percentage' | 'fixed';
export type PayoutMethod = 'paypal' | 'bank_transfer' | 'gift_card';
export type PayoutStatus = 'pending' | 'approved' | 'processing' | 'paid' | 'rejected' | 'failed';

export interface Store {
  id: string;
  name: string;
  slug?: string | null;
  logoUrl: string | null;
  heroImageUrl?: string | null;
  affiliateLink: string;
  cashbackRate: string;
  cashbackRateValue: number;
  cashbackType: CashbackType;
  description: string;
  detailedDescription?: string | null;
  categories: string[];
  rating?: number | null;
  ratingCount?: number | null;
  cashbackTrackingTime?: string | null;
  cashbackConfirmationTime?: string | null;
  cashbackOnAppOrders?: boolean | null;
  detailedCashbackRatesLink?: string | null;
  topOffersText?: string | null;
  offerDetailsLink?: string | null;
  terms?: string | null;
  isFeatured: boolean;
  isActive: boolean;
  isTodaysDeal?: boolean;
  dataAiHint?: string | null;
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

export interface Coupon {
  id: string;
  storeId: string;
  store?: Store;
  code: string | null;
  description: string;
  link: string | null;
  expiryDate: Date | Timestamp | null;
  isFeatured: boolean;
  isActive: boolean;
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

export interface Category {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    imageUrl?: string | null;
    order: number;
    isActive: boolean;
    dataAiHint?: string | null;
    createdAt: Date | Timestamp;
    updatedAt: Date | Timestamp;
}

export interface Banner {
    id: string;
    title?: string | null;
    subtitle?: string | null;
    imageUrl: string;
    link?: string | null;
    altText?: string | null;
    dataAiHint?: string | null;
    order: number;
    isActive: boolean;
    createdAt: Date | Timestamp;
    updatedAt: Date | Timestamp;
}

export interface Product {
  id:string;
  storeId: string;
  storeName?: string;
  name: string;
  description?: string | null;
  imageUrl: string | null;
  affiliateLink: string;
  price?: number | null;
  priceDisplay?: string | null;
  category?: string | null;
  brand?: string | null;
  sku?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  features?: string[];
  specifications?: Record<string, string>;
  isActive: boolean;
  isFeatured?: boolean;
  isTodaysPick?: boolean;
  dataAiHint?: string | null;
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

export interface PayoutRequest {
  id: string;
  userId: string;
  amount: number;
  status: PayoutStatus;
  requestedAt: Date | Timestamp;
  processedAt?: Date | Timestamp | null;
  paymentMethod: PayoutMethod;
  paymentDetails: PayoutDetails;
  transactionIds: string[];
  adminNotes?: string | null;
  failureReason?: string | null;
}

// Enriched types for frontend display
export interface CouponWithStore extends Coupon {
  store?: Store;
}

export interface ProductWithStore extends Product {
  store?: Store;
}

// Form values
export interface StoreFormValues extends Omit<Store, 'id' | 'createdAt' | 'updatedAt'> {}
export interface CouponFormValues extends Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'store'> {}
export interface BannerFormValues extends Omit<Banner, 'id' | 'createdAt' | 'updatedAt'> {}
export interface CategoryFormValues extends Omit<Category, 'id' | 'createdAt' | 'updatedAt'> {}
export interface ProductFormValues extends Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'storeName'> {}
export interface TransactionFormValues extends Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'confirmationDate' | 'paidDate' | 'payoutId' | 'reportedDate'> {
    transactionDate: Date;
}
