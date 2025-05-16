
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

export type CashbackStatus = 'pending' | 'confirmed' | 'rejected' | 'paid' | 'cancelled';

export interface Transaction {
  id: string; // Firestore document ID
  userId: string;
  storeId: string;
  storeName?: string; // Denormalized for easier display
  orderId?: string | null; // Retailer's order ID
  clickId?: string | null; // Link to the click record
  saleAmount: number;
  cashbackAmount: number; // Cashback earned by the user for this transaction
  commissionAmount?: number | null; // Optional: Commission earned by the platform
  status: CashbackStatus;
  transactionDate: Date | Timestamp; // Date of purchase
  confirmationDate?: Date | Timestamp | null; // Date cashback confirmed by retailer/admin
  paidDate?: Date | Timestamp | null; // Date cashback was included in a payout
  payoutId?: string | null; // ID of the PayoutRequest this transaction was part of
  adminNotes?: string | null;
  notesToUser?: string | null; // e.g. reason for rejection if status is 'rejected'
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

export interface Click {
    id: string; // Firestore document ID (this will be the generated clickId)
    userId: string;
    storeId: string;
    storeName?: string;
    couponId?: string | null;
    productId?: string | null;
    productName?: string | null;
    affiliateLink: string; // The final affiliate link clicked
    timestamp: Date | Timestamp;
    userAgent?: string;
}

export type CashbackType = 'percentage' | 'fixed';
export type PayoutMethod = 'paypal' | 'bank_transfer' | 'gift_card';
export type PayoutStatus = 'pending' | 'approved' | 'processing' | 'paid' | 'rejected' | 'failed';

export interface Store {
  id: string;
  name: string;
  slug?: string;
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
  isTodaysDeal?: boolean; // For highlighting stores with special deals
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
    altText: string;
    dataAiHint?: string | null;
    order: number;
    isActive: boolean;
    createdAt: Date | Timestamp;
    updatedAt: Date | Timestamp;
}

export interface Product {
  id: string;
  storeId: string;
  storeName?: string;
  name: string;
  description?: string | null;
  imageUrl: string | null;
  affiliateLink: string;
  price?: number | null;
  priceDisplay?: string | null;
  category?: string | null; // Category slug
  brand?: string | null;
  sku?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  features?: string[];
  specifications?: Record<string, string>;
  isActive: boolean;
  isFeatured?: boolean;
  isTodaysPick?: boolean; // For highlighting specific products
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
  transactionIds: string[]; // IDs of 'confirmed' transactions included
  adminNotes?: string | null;
  failureReason?: string | null;
}

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
// Form values for manual transaction entry by admin
export interface TransactionFormValues extends Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'confirmationDate' | 'paidDate' | 'payoutId'> {
    transactionDate: Date; // Ensure it's Date for form
}
