
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
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
  lastPayoutRequestAt?: Timestamp | FieldValue | null;
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
  transactionDate: Timestamp; 
  reportedDate?: Timestamp | FieldValue | null; 
  saleAmount: number;
  cashbackRateApplied?: string | null; 
  initialCashbackAmount: number; 
  finalSaleAmount?: number | null; 
  finalCashbackAmount?: number | null; 
  currency?: string;
  status: CashbackStatus;
  confirmationDate?: Timestamp | FieldValue | null; 
  rejectionReason?: string | null;
  paidDate?: Timestamp | FieldValue | null; 
  payoutId?: string | null; 
  adminNotes?: string | null;
  notesToUser?: string | null; 
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

export interface Click {
  id: string; 
  clickId: string; 
  userId: string | null; 
  storeId: string;
  storeName?: string | null;
  couponId?: string | null;
  productId?: string | null;
  productName?: string | null;
  affiliateLink: string; 
  originalLink?: string | null; 
  timestamp: Timestamp | FieldValue;
  userAgent?: string | null;
  clickedCashbackDisplay?: string | null;
  clickedCashbackRateValue?: number | null;
  clickedCashbackType?: CashbackType | null;
  conversionId?: string | null; 
  hasConversion?: boolean;
}

export interface Conversion {
  id?: string; 
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
  timestamp: Timestamp | FieldValue;
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
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

export interface Coupon {
  id: string;
  storeId: string;
  store?: Store; 
  code: string | null;
  description: string;
  link: string | null;
  expiryDate: Timestamp | null; 
  isFeatured: boolean;
  isActive: boolean;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
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
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
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
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
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
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

export interface PayoutRequest {
  id: string;
  userId: string;
  amount: number;
  requestedAmount?: number; // Store the original requested amount for reference
  status: PayoutStatus;
  requestedAt: Timestamp | FieldValue;
  processedAt?: Timestamp | FieldValue | null;
  paymentMethod: PayoutMethod;
  paymentDetails: PayoutDetails;
  transactionIds: string[]; 
  adminNotes?: string | null;
  failureReason?: string | null;
  updatedAt?: Timestamp | FieldValue | null; 
}

// Form values - these will often use JS Date for date pickers
export interface StoreFormValues extends Omit<Store, 'id' | 'createdAt' | 'updatedAt'> {}
export interface CouponFormValues extends Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'store' | 'expiryDate'> {
  expiryDate?: Date | null; 
}
export interface BannerFormValues extends Omit<Banner, 'id' | 'createdAt' | 'updatedAt'> {}
export interface CategoryFormValues extends Omit<Category, 'id' | 'createdAt' | 'updatedAt'> {}
export interface ProductFormValues extends Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'storeName'> {}
export interface TransactionFormValues extends Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'confirmationDate' | 'paidDate' | 'payoutId' | 'reportedDate' | 'currency' | 'finalSaleAmount' | 'finalCashbackAmount' | 'transactionDate'> {
  transactionDate: Date; 
}

// Updated PayoutFormValues to reflect the fields used in the PayoutPage form
export interface PayoutFormValues {
  requestedAmount: number;
  payoutMethod: PayoutMethod;
  payoutDetail: string;
}


export type WithOptionalFieldValue<T> = {
  [P in keyof T]: T[P] | FieldValue | undefined;
};

    