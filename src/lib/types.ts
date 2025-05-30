// src/lib/types.ts
import type { Timestamp, FieldValue } from 'firebase/firestore';

// Basic user type from Firebase Auth
export type { User } from 'firebase/auth';

// User Profile stored in Firestore
export interface UserProfile {
  uid: string;
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
  id: string;
  userId: string;
  clickId?: string | null;
  conversionId?: string | null;
  storeId: string;
  storeName?: string | null;
  orderId?: string | null;
  productDetails?: string | null;
  transactionDate: Date | Timestamp;
  reportedDate?: Date | Timestamp | null;
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
  payoutId?: string | null;
  adminNotes?: string | null;
  notesToUser?: string | null;
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

export interface Click {
  id: string; // Firestore document ID
  clickId: string; // The actual UUID generated on the client, also stored as a field
  userId: string | null; // Can be null for guest clicks if allowed, but usually from logged-in user
  storeId: string;
  storeName?: string | null;
  couponId?: string | null;
  productId?: string | null;
  productName?: string | null;
  affiliateLink: string;
  originalLink?: string | null;
  timestamp: Date | Timestamp | FieldValue; // Allow FieldValue for serverTimestamp on create
  userAgent?: string | null;
  // Product-specific cashback details at time of click
  clickedCashbackDisplay?: string | null;
  clickedCashbackRateValue?: number | null;
  clickedCashbackType?: CashbackType | null;
  conversionId?: string | null; // Link to a conversion if one occurs
  hasConversion?: boolean; // Derived or set when conversion happens
}

export interface Conversion {
  id?: string; // Firestore document ID
  clickId: string; // The click_id from the postback, should match a Click.clickId
  originalClickFirebaseId?: string | null; // The Firestore document ID of the matched click from /clicks collection
  userId: string | null; // Denormalized from the click for easier querying/rules
  storeId: string | null; // Denormalized from the click
  storeName?: string | null; // Denormalized from the click or postback
  orderId: string;
  saleAmount: number;
  currency?: string;
  commissionAmount?: number | null; // If your network provides this
  status: 'received' | 'processed' | 'error' | 'unmatched_click'; // Status of this conversion record processing
  timestamp: Date | Timestamp | FieldValue; // Allow FieldValue for serverTimestamp on create
  postbackData?: Record<string, any>; // Store the raw postback query
  processingError?: string | null; // If there was an error processing this conversion
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
  id: string;
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
  isActive: boolean;
  isFeatured?: boolean;
  isTodaysPick?: boolean;
  dataAiHint?: string | null;
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

// Form values
export interface StoreFormValues extends Omit<Store, 'id' | 'createdAt' | 'updatedAt'> {}
export interface CouponFormValues extends Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'store' | 'expiryDate'> {
  expiryDate?: Date | null; // Form deals with JS Date or null
}
export interface BannerFormValues extends Omit<Banner, 'id' | 'createdAt' | 'updatedAt'> {}
export interface CategoryFormValues extends Omit<Category, 'id' | 'createdAt' | 'updatedAt'> {}
export interface ProductFormValues extends Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'storeName'> {}
export interface TransactionFormValues extends Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'confirmationDate' | 'paidDate' | 'payoutId' | 'reportedDate' | 'currency' | 'finalSaleAmount' | 'finalCashbackAmount' | 'transactionDate'> {
  transactionDate: Date; // Form expects a JS Date
}