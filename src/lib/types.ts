
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
  clickId?: string | null; // Link to the original Click.clickId
  conversionId?: string | null; // Link to the Conversion document ID
  storeId: string;
  storeName?: string | null;
  orderId?: string | null;
  productDetails?: string | null; // e.g., Product name or "General Purchase"
  transactionDate: Timestamp; // Date of actual purchase
  reportedDate?: Timestamp | FieldValue | null; // Date affiliate network reported it
  saleAmount: number;
  cashbackRateApplied?: string | null; // e.g., "5%" or "Flat Rs.50"
  initialCashbackAmount: number; // Cashback amount calculated by system
  finalSaleAmount?: number | null; // Sale amount after any adjustments by admin
  finalCashbackAmount?: number | null; // Cashback amount after any adjustments by admin
  currency?: string;
  status: CashbackStatus;
  confirmationDate?: Timestamp | FieldValue | null; // When admin confirmed it
  rejectionReason?: string | null;
  paidDate?: Timestamp | FieldValue | null; // When it was included in a payout
  payoutId?: string | null; // Link to the PayoutRequest document ID
  adminNotes?: string | null;
  notesToUser?: string | null; // Notes visible to the user in their history
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

export interface Click {
  id: string; // Firestore document ID
  clickId: string; // The UUID generated at click time, passed in affiliate link
  userId: string | null; // Null for guest clicks
  storeId: string;
  storeName?: string | null;
  couponId?: string | null;
  productId?: string | null;
  productName?: string | null;
  affiliateLink: string; // The actual link user was sent to (with clickId)
  originalLink?: string | null; // The base link before clickId was appended
  timestamp: Timestamp | FieldValue;
  userAgent?: string | null;
  // Store cashback details at the time of click for accurate calculation later
  clickedCashbackDisplay?: string | null;
  clickedCashbackRateValue?: number | null;
  clickedCashbackType?: CashbackType | null;
  conversionId?: string | null; // Link to conversion document ID if a conversion occurs
  hasConversion?: boolean;
}

export interface Conversion {
  id?: string; // Firestore document ID
  clickId: string; // The clickId from the postback, matches Click.clickId
  originalClickFirebaseId?: string | null; // Firestore document ID of the matched click
  userId: string | null;
  storeId: string | null;
  storeName?: string | null;
  orderId: string;
  saleAmount: number;
  currency?: string; // e.g., "INR"
  commissionAmount?: number | null; // Commission earned by your platform for this sale
  status: 'received' | 'processed' | 'error' | 'unmatched_click';
  timestamp: Timestamp | FieldValue;
  postbackData?: Record<string, any>; // Raw postback data
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
  cashbackRate: string; // Display string like "Up to 5%" or "Flat Rs.50"
  cashbackRateValue: number; // Numerical value (e.g., 5 for 5%, or 50 for Rs.50)
  cashbackType: CashbackType; // 'percentage' or 'fixed'
  description: string;
  detailedDescription?: string | null;
  categories: string[]; // Array of category slugs or IDs
  rating?: number | null;
  ratingCount?: number | null;
  cashbackTrackingTime?: string | null; // e.g., "24-48 Hours"
  cashbackConfirmationTime?: string | null; // e.g., "60-90 Days"
  cashbackOnAppOrders?: boolean | null;
  detailedCashbackRatesLink?: string | null;
  topOffersText?: string | null; // Bullet points for display
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
  store?: Store; // Optional: Denormalized or fetched store data for display
  code: string | null;
  description: string;
  link: string | null;
  expiryDate: Timestamp | null; // Storing as Timestamp
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
  storeName?: string; // Denormalized for convenience
  name: string;
  description?: string | null;
  imageUrl: string | null;
  affiliateLink: string;
  price?: number | null;
  priceDisplay?: string | null; // e.g., "₹1,999" or "On Sale"
  category?: string | null; // Category slug or ID
  brand?: string | null;
  sku?: string | null;
  isActive: boolean;
  isFeatured?: boolean;
  isTodaysPick?: boolean;
  dataAiHint?: string | null;
  // Product-specific cashback override
  productSpecificCashbackDisplay?: string | null; // e.g., "Flat Rs.100 Cashback" or "15% Off"
  productSpecificCashbackRateValue?: number | null; // e.g., 100 or 15
  productSpecificCashbackType?: CashbackType | null; // 'fixed' or 'percentage'
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

export interface PayoutRequest {
  id: string;
  userId: string;
  amount: number;
  status: PayoutStatus;
  requestedAt: Timestamp | FieldValue;
  processedAt?: Timestamp | FieldValue | null;
  paymentMethod: PayoutMethod;
  paymentDetails: PayoutDetails;
  transactionIds: string[]; // IDs of Transaction documents covered by this payout
  adminNotes?: string | null;
  failureReason?: string | null;
  updatedAt?: Timestamp | FieldValue | null; // Added for tracking updates
}

// Form values - these will often use JS Date for date pickers
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
export interface PayoutFormValues extends Pick<PayoutRequest, 'paymentMethod' | 'paymentDetails' | 'amount'> {}

// For use with Firestore Converters to allow FieldValues during writes
export type WithOptionalFieldValue<T> = {
  [P in keyof T]: T[P] | FieldValue | undefined;
};
