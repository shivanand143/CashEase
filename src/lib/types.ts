
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
  pendingCashback: number;
  lifetimeCashback: number;
  referralCode: string | null;
  referralCount: number;
  referralBonusEarned: number;
  referredBy: string | null; // UID of the user who referred this user
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
  conversionId?: string | null;
  storeId: string;
  storeName?: string | null;
  orderId?: string | null;
  productDetails?: string | null;
  transactionDate: Date | Timestamp;
  reportedDate?: Date | Timestamp;
  saleAmount: number;
  cashbackRateApplied?: string | null;
  initialCashbackAmount: number;
  finalSaleAmount?: number | null;
  finalCashbackAmount?: number | null;
  currency?: string;
  status: CashbackStatus;
  confirmationDate?: Date | Timestamp | null;
  rejectionReason?: string | null;
  paidDate?: Date | Timestamp | null;
  payoutId?: string | null; // ID of the PayoutRequest this transaction is part of
  adminNotes?: string | null;
  notesToUser?: string | null; // Notes visible to the user for this transaction
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

export interface Click {
    id: string; // Firestore document ID (this will be the generated clickId from client)
    clickId: string; // The actual UUID generated on the client
    userId: string | null;
    storeId: string;
    storeName?: string | null;
    couponId?: string | null;
    productId?: string | null;
    productName?: string | null;
    affiliateLink: string;
    originalLink?: string | null;
    timestamp: Date | Timestamp;
    userAgent?: string | null;
    // Fields for product-specific cashback at time of click
    clickedCashbackDisplay?: string | null;
    clickedCashbackRateValue?: number | null;
    clickedCashbackType?: CashbackType | null;
}

export interface Conversion {
  id?: string; // Firestore document ID
  clickId: string; // The click_id from the postback
  originalClickFirebaseId?: string | null; // Firestore ID of the matched click document
  userId: string | null;
  storeId: string | null;
  storeName?: string | null;
  orderId: string;
  saleAmount: number;
  currency?: string;
  commissionAmount?: number | null;
  status: 'received' | 'processed' | 'error' | 'unmatched_click';
  timestamp: Date | Timestamp;
  postbackData?: Record<string, any>;
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
  store?: Store; // Denormalized store data for easier display
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
  // Product-specific cashback details
  productSpecificCashbackDisplay?: string | null;
  productSpecificCashbackRateValue?: number | null;
  productSpecificCashbackType?: CashbackType | null;
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

// Form values - Omit fields managed by Firestore or system
export interface StoreFormValues extends Omit<Store, 'id' | 'createdAt' | 'updatedAt'> {}
export interface CouponFormValues extends Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'store'> {}
export interface BannerFormValues extends Omit<Banner, 'id' | 'createdAt' | 'updatedAt'> {}
export interface CategoryFormValues extends Omit<Category, 'id' | 'createdAt' | 'updatedAt'> {}
export interface ProductFormValues extends Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'storeName'> {}
export interface TransactionFormValues extends Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'confirmationDate' | 'paidDate' | 'payoutId' | 'reportedDate' | 'currency' | 'conversionId'> {
    transactionDate: Date;
    saleAmount: number;
    initialCashbackAmount: number; // For manual entry, this is what admin sets
    finalSaleAmount?: number;
    finalCashbackAmount?: number;
}
