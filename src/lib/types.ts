
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
  role: 'user' | 'admin';
  cashbackBalance: number;
  pendingCashback: number; // Cashback tracked from conversions, awaiting admin approval
  lifetimeCashback: number;
  referralCode: string | null;
  referralCount: number;
  referralBonusEarned: number;
  referredBy: string | null;
  isDisabled: boolean;
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
  lastPayoutRequestAt?: Date | Timestamp | null;
  payoutDetails?: PayoutDetails | null;
}

export interface PayoutDetails {
  method: PayoutMethod;
  detail: string;
}

export type CashbackStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'awaiting_payout' | 'paid';

export interface Transaction {
  id: string; // Firestore document ID
  userId: string;
  clickId?: string | null;
  conversionId?: string | null; // Link to the conversion document
  storeId: string;
  storeName?: string | null;
  orderId?: string | null;
  productDetails?: string | null; // Can be from original click or conversion
  transactionDate: Date | Timestamp; // Date of purchase reported by affiliate network
  reportedDate?: Date | Timestamp; // Date we received the postback/conversion
  saleAmount: number; // Sale amount reported by affiliate network
  cashbackRateApplied?: string | null; // e.g., "5%" or "Store Default"
  initialCashbackAmount: number; // Cashback calculated based on saleAmount and store's rate
  finalSaleAmount?: number | null; // Can be adjusted by admin
  finalCashbackAmount?: number | null; // Can be adjusted by admin
  currency?: string;
  status: CashbackStatus;
  confirmationDate?: Date | Timestamp | null;
  rejectionReason?: string | null;
  paidDate?: Date | Timestamp | null;
  payoutId?: string | null;
  adminNotes?: string | null;
  notesToUser?: string | null; // Notes visible to the user, e.g., reason for adjustment
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

export interface Click {
    id: string; // Firestore document ID (this will be the generated clickId from client)
    clickId: string; // The actual UUID generated on the client
    userId: string | null; // Null if user was not logged in
    storeId: string;
    storeName?: string | null;
    couponId?: string | null;
    productId?: string | null;
    productName?: string | null;
    affiliateLink: string; // The final affiliate link clicked (with clickId appended)
    originalLink?: string | null; // The store/product/coupon link before appending clickId
    timestamp: Date | Timestamp;
    userAgent?: string | null;
    // Potentially add device info, IP (with privacy considerations) if needed
}

export interface Conversion {
  id?: string; // Firestore document ID
  clickId: string; // The click_id from the postback
  originalClickFirebaseId?: string | null; // Firestore ID of the matched click document
  userId: string | null; // From matched click or null
  storeId: string | null; // From matched click or null
  storeName?: string | null; // From matched click or postback
  orderId: string;
  saleAmount: number;
  currency?: string;
  commissionAmount?: number | null; // If provided by network
  status: 'received' | 'processed' | 'error' | 'unmatched_click';
  timestamp: Date | Timestamp;
  postbackData?: Record<string, any>; // Store the raw postback query/body
  processingError?: string | null;
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
  affiliateLink: string; // Base affiliate link for the store
  cashbackRate: string; // Display string like "Up to 5%"
  cashbackRateValue: number; // Numerical value for calculation (e.g., 5 for 5%)
  cashbackType: CashbackType; // 'percentage' or 'fixed'
  description: string;
  detailedDescription?: string | null;
  categories: string[]; // Array of category slugs/IDs
  rating?: number | null;
  ratingCount?: number | null;
  cashbackTrackingTime?: string | null;
  cashbackConfirmationTime?: string | null;
  cashbackOnAppOrders?: boolean | null;
  detailedCashbackRatesLink?: string | null;
  topOffersText?: string | null; // Bullet points or short highlights
  offerDetailsLink?: string | null; // Link to a page with more T&Cs for offers
  terms?: string | null;
  isFeatured: boolean;
  isActive: boolean;
  isTodaysDeal?: boolean;
  dataAiHint?: string | null; // For placeholder image generation
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

export interface Coupon {
  id: string;
  storeId: string;
  store?: Store;
  code: string | null;
  description: string;
  link: string | null; // Specific link for this coupon, overrides store.affiliateLink if present
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
  storeName?: string; // Denormalized for easier display if needed
  name: string;
  description?: string | null;
  imageUrl: string | null;
  affiliateLink: string; // Specific affiliate link for the product
  price?: number | null;
  priceDisplay?: string | null; // e.g., "₹1,999" or "Sale!"
  category?: string | null; // Category ID/slug
  brand?: string | null;
  sku?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  features?: string[];
  specifications?: Record<string, string>;
  isActive: boolean;
  isFeatured?: boolean;
  isTodaysPick?: boolean; // To feature on homepage "Today's Picks"
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
  transactionIds: string[]; // IDs of Transaction documents that this payout covers
  adminNotes?: string | null;
  failureReason?: string | null;
}

// Form values - Omit fields managed by Firestore or system
export interface StoreFormValues extends Omit<Store, 'id' | 'createdAt' | 'updatedAt'> {}
export interface CouponFormValues extends Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'store'> {}
export interface BannerFormValues extends Omit<Banner, 'id' | 'createdAt' | 'updatedAt'> {}
export interface CategoryFormValues extends Omit<Category, 'id' | 'createdAt' | 'updatedAt'> {}
export interface ProductFormValues extends Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'storeName'> {}
export interface TransactionFormValues extends Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'confirmationDate' | 'paidDate' | 'payoutId' | 'reportedDate' | 'cashbackRateApplied' | 'initialCashbackAmount' | 'finalSaleAmount' | 'finalCashbackAmount' | 'currency' | 'conversionId'> {
    transactionDate: Date; // Ensure transactionDate is always a Date for the form
    saleAmount: number;
    cashbackAmount: number; // This will be used as initialCashbackAmount
}

    