
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
  conversionId?: string | null; // Link to the conversion document
  storeId: string;
  storeName?: string | null;
  orderId?: string | null;
  productDetails?: string | null; // E.g., product name or "General Purchase"
  transactionDate: Date | Timestamp;
  reportedDate?: Date | Timestamp | null; // When the affiliate network reported it
  saleAmount: number;
  cashbackRateApplied?: string | null; // e.g., "5%" or "Flat Rs.50"
  initialCashbackAmount: number; // Cashback calculated at time of conversion/reporting
  finalSaleAmount?: number | null; // If admin adjusts
  finalCashbackAmount?: number | null; // If admin adjusts
  currency?: string;
  status: CashbackStatus;
  confirmationDate?: Date | Timestamp | null;
  rejectionReason?: string | null;
  paidDate?: Date | Timestamp | null;
  payoutId?: string | null; // Link to a PayoutRequest
  adminNotes?: string | null;
  notesToUser?: string | null; // Notes visible to the user in their history
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

export interface Click {
  id: string; // Firestore document ID
  clickId: string; // The actual UUID generated on the client, also stored as a field
  userId: string | null;
  storeId: string;
  storeName?: string | null;
  couponId?: string | null;
  productId?: string | null;
  productName?: string | null;
  affiliateLink: string;
  originalLink?: string | null;
  timestamp: Date | Timestamp | FieldValue;
  userAgent?: string | null;
  clickedCashbackDisplay?: string | null;
  clickedCashbackRateValue?: number | null;
  clickedCashbackType?: CashbackType | null;
  conversionId?: string | null;
  hasConversion?: boolean;
}

export interface Conversion {
  id?: string; // Firestore document ID
  clickId: string; // The click_id from the postback, should match a Click.clickId
  originalClickFirebaseId?: string | null; // The Firestore document ID of the matched click
  userId: string | null;
  storeId: string | null;
  storeName?: string | null;
  orderId: string;
  saleAmount: number;
  currency?: string;
  commissionAmount?: number | null;
  status: 'received' | 'processed' | 'error' | 'unmatched_click';
  timestamp: Date | Timestamp | FieldValue;
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
  cashbackRate: string; // Display string e.g., "Up to 5%" or "Flat Rs. 50"
  cashbackRateValue: number; // Numerical value for calculation
  cashbackType: CashbackType; // 'percentage' or 'fixed'
  description: string;
  detailedDescription?: string | null;
  categories: string[]; // Array of category slugs or IDs
  rating?: number | null;
  ratingCount?: number | null;
  cashbackTrackingTime?: string | null;
  cashbackConfirmationTime?: string | null;
  cashbackOnAppOrders?: boolean | null;
  detailedCashbackRatesLink?: string | null;
  topOffersText?: string | null; // Bullet points or short text
  offerDetailsLink?: string | null;
  terms?: string | null;
  isFeatured: boolean;
  isActive: boolean;
  isTodaysDeal?: boolean; // For stores specifically marked as "Today's Deal"
  dataAiHint?: string | null; // For placeholder images
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

export interface Coupon {
  id: string;
  storeId: string;
  store?: Store; // Populated on the client if needed
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
  storeName?: string; // Denormalized for easier display on product cards if needed
  name: string;
  description?: string | null;
  imageUrl: string | null;
  affiliateLink: string;
  price?: number | null;
  priceDisplay?: string | null; // e.g., "Rs. 999" or "On Sale"
  category?: string | null; // Category slug or ID
  brand?: string | null;
  sku?: string | null;
  isActive: boolean;
  isFeatured?: boolean;
  isTodaysPick?: boolean; // For products specifically chosen as "Today's Pick"
  dataAiHint?: string | null;
  // Product-specific cashback details
  productSpecificCashbackDisplay?: string | null; // e.g. "Flat Rs. 20 Cashback" or "10% Extra CB"
  productSpecificCashbackRateValue?: number | null; // Numerical value (e.g., 20 or 10)
  productSpecificCashbackType?: CashbackType | null; // 'percentage' or 'fixed'
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
  paymentDetails: PayoutDetails; // This should store the details like account number, UPI, PayPal email
  transactionIds: string[]; // IDs of Transactions covered by this payout
  adminNotes?: string | null;
  failureReason?: string | null;
}

// Form values
export interface StoreFormValues extends Omit<Store, 'id' | 'createdAt' | 'updatedAt'> {}
export interface CouponFormValues extends Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'store' | 'expiryDate'> {
  expiryDate?: Date | null; // Form deals with JS Date or null/undefined
}
export interface BannerFormValues extends Omit<Banner, 'id' | 'createdAt' | 'updatedAt'> {}
export interface CategoryFormValues extends Omit<Category, 'id' | 'createdAt' | 'updatedAt'> {}
export interface ProductFormValues extends Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'storeName'> {}
export interface TransactionFormValues extends Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'confirmationDate' | 'paidDate' | 'payoutId' | 'reportedDate' | 'currency' | 'finalSaleAmount' | 'finalCashbackAmount' | 'transactionDate'> {
  transactionDate: Date; // Form expects a JS Date
}

    