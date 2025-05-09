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
  createdAt: Date | Timestamp; // Use Date on client, Timestamp on server/write
  updatedAt: Date | Timestamp;
  lastPayoutRequestAt?: Date | Timestamp | null; // Last payout request time
  payoutDetails?: PayoutDetails | null; // Saved payout details
}

// Payout Details (flexible structure)
export interface PayoutDetails {
  method: PayoutMethod;
  detail: string; // e.g., PayPal email, UPI ID, Bank details string
}


export type CashbackStatus = 'pending' | 'confirmed' | 'rejected' | 'paid';

export interface Transaction {
  id: string; // Firestore document ID
  userId: string;
  storeId: string;
  storeName?: string; // Denormalized for easier display
  clickId?: string | null; // ID from the click tracking system
  saleAmount: number;
  cashbackAmount: number;
  status: CashbackStatus;
  transactionDate: Date | Timestamp; // Date of purchase
  confirmationDate?: Date | Timestamp | null; // Date cashback confirmed by retailer
  paidDate?: Date | Timestamp | null; // Date cashback was included in a payout
  payoutId?: string | null; // ID of the PayoutRequest this transaction was part of
  adminNotes?: string | null; // Notes added by admin (e.g., reason for rejection)
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

// For logging user clicks on affiliate links
export interface Click {
    id: string; // Firestore document ID (can be the generated clickId)
    userId: string;
    storeId: string;
    storeName?: string; // Optional: Denormalized store name
    couponId?: string | null; // Optional: if the click was on a specific coupon
    affiliateLink: string; // The specific link that was clicked (with clickId appended if applicable)
    timestamp: Date | Timestamp; // Firestore server timestamp preferred
    userAgent?: string; // Optional: User agent string
    // Add other relevant details if needed, e.g., source page, IP address (handle privacy carefully)
}


export type CashbackType = 'percentage' | 'fixed';
export type PayoutMethod = 'paypal' | 'bank_transfer' | 'gift_card'; // Allow customization
export type PayoutStatus = 'pending' | 'approved' | 'processing' | 'paid' | 'rejected' | 'failed';


// Store information
export interface Store {
  id: string; // Firestore document ID
  name: string;
  logoUrl: string | null;
  heroImageUrl?: string | null; // For the store detail page hero banner
  affiliateLink: string; // The BASE tracking link (clickId added dynamically)
  cashbackRate: string; // User-friendly display string (e.g., "Up to 5%", "Flat ₹50")
  cashbackRateValue: number; // The numeric value for calculations
  cashbackType: CashbackType; // 'percentage' or 'fixed'
  description: string;
  detailedDescription?: string | null; // Longer description for store page
  categories: string[]; // Array of category slugs or names
  rating?: number | null; // e.g., 4.5
  ratingCount?: number | null; // e.g., 1800
  cashbackTrackingTime?: string | null; // e.g., "36 Hours"
  cashbackConfirmationTime?: string | null; // e.g., "35 Days"
  cashbackOnAppOrders?: boolean | null; // Is cashback available on app orders?
  detailedCashbackRatesLink?: string | null; // Link to a page with detailed cashback rates
  topOffersText?: string | null; // Text for "Top Store Offers" section
  offerDetailsLink?: string | null; // Link for "See Offer Details"
  terms?: string | null; // Specific terms and conditions for offers
  isFeatured: boolean; // Highlighted store
  isActive: boolean; // Whether the store is active on the platform
  dataAiHint?: string | null; // Optional hint for AI image generation/search
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

// Coupon information
export interface Coupon {
  id: string; // Firestore document ID
  storeId: string; // ID of the store this coupon belongs to
  store?: Store; // Optional: Denormalized store data for display
  code: string | null; // The actual coupon code (if applicable)
  description: string; // What the coupon offers
  link: string | null; // Direct link to the offer page (if applicable, overrides store link)
  expiryDate: Date | Timestamp | null; // When the coupon expires
  isFeatured: boolean; // Highlighted coupon
  isActive: boolean; // Whether the coupon is active
  isTopOffer?: boolean; // Flag if this is a top offer for the store page
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

// Category information
export interface Category {
    id: string; // Firestore document ID (often same as slug for simplicity)
    name: string;
    slug: string; // URL-friendly identifier (e.g., 'electronics', 'mens-fashion')
    description?: string | null;
    imageUrl?: string | null; // Optional image for the category
    order: number; // For custom sorting of categories
    createdAt: Date | Timestamp;
    updatedAt: Date | Timestamp;
}

// Banner information
export interface Banner {
    id: string; // Firestore document ID
    title?: string | null;
    subtitle?: string | null;
    imageUrl: string;
    link?: string | null; // URL the banner links to
    altText: string; // For accessibility
    dataAiHint?: string | null; // Optional hint for AI image generation/search
    order: number; // Display order
    isActive: boolean; // Whether the banner is currently displayed
    createdAt: Date | Timestamp;
    updatedAt: Date | Timestamp;
}


// Payout Request
export interface PayoutRequest {
  id: string; // Firestore document ID
  userId: string;
  amount: number; // Amount requested
  status: PayoutStatus;
  requestedAt: Date | Timestamp;
  processedAt?: Date | Timestamp | null; // Timestamp when status changed from pending
  paymentMethod: PayoutMethod;
  paymentDetails: PayoutDetails; // Nested object for details
  transactionIds: string[]; // IDs of the 'confirmed' transactions included in this payout
  adminNotes?: string | null; // Notes from admin (e.g., reason for rejection, transaction ID)
  failureReason?: string | null; // If status is 'failed'
}

// Helper type for combining Coupon and Store data
export interface CouponWithStore extends Coupon {
  store?: Store; // Optional nested store data
}

// Form values for Store, used in admin panel
export interface StoreFormValues extends Omit<Store, 'id' | 'createdAt' | 'updatedAt'> {}
// Form values for Coupon, used in admin panel
export interface CouponFormValues extends Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'store'> {}
// Form values for Banner, used in admin panel
export interface BannerFormValues extends Omit<Banner, 'id' | 'createdAt' | 'updatedAt'> {}
// Form values for Category, used in admin panel
export interface CategoryFormValues extends Omit<Category, 'id' | 'createdAt' | 'updatedAt'> {}