
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
  cashbackBalance: number; // Confirmed and available for payout
  pendingCashback: number; // Tracked but not yet confirmed
  lifetimeCashback: number; // Total confirmed cashback ever earned
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
  conversionId?: string | null; // ID of the original /conversions document
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
  payoutId?: string | null;
  adminNotes?: string | null;
  notesToUser?: string | null;
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

export interface Click {
  id: string;
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
  clickedCashbackDisplay?: string | null;
  clickedCashbackRateValue?: number | null;
  clickedCashbackType?: CashbackType | null;
  // New field to link to conversion
  conversionId?: string | null;
  hasConversion?: boolean; // Derived field for UI indication
}

export interface Conversion {
  id?: string; // Firestore document ID
  clickId: string;
  originalClickFirebaseId?: string | null;
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
  store?: Store;
  code: string | null;
  description: string;
  link: string | null;
  expiryDate: Date | Timestamp | null;
  isFeatured: boolean;
  isActive: boolean;
  // isTodaysDeal?: boolean; // Removed as per later correction
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
export interface CouponFormValues extends Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'store'> {}
export interface BannerFormValues extends Omit<Banner, 'id' | 'createdAt' | 'updatedAt'> {}
export interface CategoryFormValues extends Omit<Category, 'id' | 'createdAt' | 'updatedAt'> {}
export interface ProductFormValues extends Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'storeName'> {}
export interface TransactionFormValues extends Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'confirmationDate' | 'paidDate' | 'payoutId' | 'reportedDate' | 'currency' | 'finalSaleAmount' | 'finalCashbackAmount'> {
  transactionDate: Date; // Expect Date object from form
}
