
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
  clickId?: string | null; // The unique ID of the click that led to this transaction
  conversionId?: string | null; // The ID of the conversion record from postback
  storeId: string;
  storeName?: string | null;
  orderId?: string | null; // From affiliate network postback
  productDetails?: string | null; // E.g., "Product Name" or "Coupon Used" from original click
  transactionDate: Date | Timestamp; // When the purchase happened
  reportedDate?: Date | Timestamp; // When the transaction was reported/logged in our system
  saleAmount: number; // Sale amount reported by affiliate network
  cashbackRateApplied?: string | null; // e.g., "5%" or "Flat Rs.50"
  initialCashbackAmount: number; // Cashback amount initially calculated/reported
  finalSaleAmount?: number | null; // If adjusted by admin
  finalCashbackAmount?: number | null; // If adjusted by admin, or final confirmed cashback
  currency?: string;
  status: CashbackStatus;
  confirmationDate?: Date | Timestamp | null; // When admin confirmed it
  rejectionReason?: string | null;
  paidDate?: Date | Timestamp | null; // When included in a paid payout
  payoutId?: string | null; // ID of the PayoutRequest this transaction is part of
  adminNotes?: string | null; // Internal notes by admin
  notesToUser?: string | null; // Notes visible to the user for this transaction
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

export interface Click {
    id: string; // Firestore document ID (this will be the generated clickId from client)
    clickId: string; // The actual UUID generated on the client, also stored as a field
    userId: string | null;
    storeId: string;
    storeName?: string | null;
    couponId?: string | null;
    productId?: string | null;
    productName?: string | null;
    affiliateLink: string; // Final affiliate link (with clickId appended)
    originalLink?: string | null; // Base store/product/coupon link
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
  originalClickFirebaseId?: string | null; // Firestore ID of the matched click document in /clicks
  userId: string | null; // Populated if original click is matched
  storeId: string | null; // Populated if original click is matched
  storeName?: string | null; // From postback or original click
  orderId: string;
  saleAmount: number;
  currency?: string;
  commissionAmount?: number | null; // Optional: if network provides your commission
  status: 'received' | 'processed' | 'error' | 'unmatched_click';
  timestamp: Date | Timestamp;
  postbackData?: Record<string, any>; // Store the raw postback query for auditing
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
  affiliateLink: string; // Base affiliate link, {CLICK_ID} will be replaced
  cashbackRate: string; // Display string like "Up to 5%" or "Flat Rs.50"
  cashbackRateValue: number; // Numerical value for calculation
  cashbackType: CashbackType; // 'percentage' or 'fixed'
  description: string; // Short description
  detailedDescription?: string | null;
  categories: string[]; // Array of category slugs/IDs
  rating?: number | null;
  ratingCount?: number | null;
  cashbackTrackingTime?: string | null;
  cashbackConfirmationTime?: string | null;
  cashbackOnAppOrders?: boolean | null;
  detailedCashbackRatesLink?: string | null;
  topOffersText?: string | null; // Bullet points for top offers
  offerDetailsLink?: string | null;
  terms?: string | null;
  isFeatured: boolean;
  isActive: boolean;
  isTodaysDeal?: boolean; // For highlighting stores offering special deals
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
  link: string | null; // Coupon-specific link, otherwise use store's affiliateLink
  expiryDate: Date | Timestamp | null;
  isFeatured: boolean;
  isActive: boolean;
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

export interface Category {
    id: string; // Firestore document ID (use slug for this)
    name: string;
    slug: string; // URL-friendly identifier, also used as ID
    description?: string | null;
    imageUrl?: string | null;
    order: number; // For sorting display
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
  storeName?: string; // Denormalized store name
  name: string;
  description?: string | null;
  imageUrl: string | null;
  affiliateLink: string; // Direct product affiliate link with {CLICK_ID} placeholder
  price?: number | null;
  priceDisplay?: string | null; // e.g., "₹1,999" or "Sale!"
  category?: string | null; // Category slug/ID
  brand?: string | null;
  sku?: string | null;
  isActive: boolean;
  isFeatured?: boolean;
  isTodaysPick?: boolean;
  dataAiHint?: string | null;
  // Product-specific cashback details
  productSpecificCashbackDisplay?: string | null; // e.g., "Flat Rs.100 Cashback" or "8% Cashback"
  productSpecificCashbackRateValue?: number | null; // e.g., 100 or 8
  productSpecificCashbackType?: CashbackType | null; // 'fixed' or 'percentage'
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
  transactionIds: string[]; // IDs of Transaction documents covered by this payout
  adminNotes?: string | null;
  failureReason?: string | null;
}

// Form values - Omit fields managed by Firestore or system
export interface StoreFormValues extends Omit<Store, 'id' | 'createdAt' | 'updatedAt'> {}
export interface CouponFormValues extends Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'store'> {}
export interface BannerFormValues extends Omit<Banner, 'id' | 'createdAt' | 'updatedAt'> {}
export interface CategoryFormValues extends Omit<Category, 'id' | 'createdAt' | 'updatedAt'> {}
export interface ProductFormValues extends Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'storeName'> {}
export interface TransactionFormValues extends Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'confirmationDate' | 'paidDate' | 'payoutId' | 'reportedDate' | 'currency' | 'conversionId' | 'finalSaleAmount' | 'finalCashbackAmount'> {
    transactionDate: Date; // Expect Date object from form
    saleAmount: number;
    initialCashbackAmount: number;
}

    