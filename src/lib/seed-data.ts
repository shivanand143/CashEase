// src/lib/seed-data.ts
import type { Store, Coupon, CashbackType, Category, Banner, Transaction, PayoutRequest, Click, UserProfile, PayoutDetails } from '@/lib/types';
import { collection, writeBatch, serverTimestamp, doc, getDocs, query, where, limit, Timestamp, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useToast } from '@/hooks/use-toast'; // Assuming useToast works in this context
import { v4 as uuidv4 } from 'uuid';

// --- Seed Data Definitions ---

const categoriesData: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { name: 'Electronics', slug: 'electronics', description: 'Gadgets, Computers, TVs, etc.', imageUrl: 'https://picsum.photos/seed/cat-electronics/100/100', order: 1 },
  { name: 'Fashion', slug: 'fashion', description: 'Clothing, Shoes, Accessories', imageUrl: 'https://picsum.photos/seed/cat-fashion/100/100', order: 0 },
  { name: 'Home & Kitchen', slug: 'home', description: 'Furniture, Decor, Appliances', imageUrl: 'https://picsum.photos/seed/cat-home/100/100', order: 3 },
  { name: 'Beauty', slug: 'beauty', description: 'Makeup, Skincare, Haircare', imageUrl: 'https://picsum.photos/seed/cat-beauty/100/100', order: 4 },
  { name: 'Travel', slug: 'travel', description: 'Flights, Hotels, Bookings', imageUrl: 'https://picsum.photos/seed/cat-travel/100/100', order: 2 },
  { name: 'Grocery', slug: 'grocery', description: 'Daily Essentials', imageUrl: 'https://picsum.photos/seed/cat-grocery/100/100', order: 5 },
  { name: 'Mobiles', slug: 'mobiles', description: 'Smartphones and Accessories', imageUrl: 'https://picsum.photos/seed/cat-mobiles/100/100', order: 6 },
  { name: 'Books', slug: 'books', description: 'Books and Stationery', imageUrl: 'https://picsum.photos/seed/cat-books/100/100', order: 7 },
  { name: 'Flights', slug: 'flights', description: 'Flight Bookings', imageUrl: 'https://picsum.photos/seed/cat-flights/100/100', order: 8 },
  { name: 'Hotels', slug: 'hotels', description: 'Hotel Bookings', imageUrl: 'https://picsum.photos/seed/cat-hotels/100/100', order: 9 },
  { name: 'Cosmetics', slug: 'cosmetics', description: 'Cosmetic Products', imageUrl: 'https://picsum.photos/seed/cat-cosmetics/100/100', order: 10 },
   { name: 'Skincare', slug: 'skincare', description: 'Skincare Products', imageUrl: 'https://picsum.photos/seed/cat-skincare/100/100', order: 11 },
   { name: 'Accessories', slug: 'accessories', description: 'Fashion Accessories', imageUrl: 'https://picsum.photos/seed/cat-accessories/100/100', order: 12 },
];

const storesData: Omit<Store, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { name: 'Amazon IN', logoUrl: 'https://picsum.photos/seed/amazonin/120/60', cashbackRate: 'Up to 5% Rewards', dataAiHint: "amazon india logo", affiliateLink: 'https://amazon.in?tag=cashease-21', description: 'India\'s largest online store. Find everything from electronics & fashion to groceries & books. Enjoy fast delivery and great deals.', categories: ['electronics', 'fashion', 'home', 'books', 'grocery'], isFeatured: true, isActive: true, cashbackType: 'percentage', cashbackRateValue: 5, terms: 'Cashback varies by category. Check specific category rates before purchasing. Not applicable on gift cards or bill payments.' },
  { name: 'Flipkart', logoUrl: 'https://picsum.photos/seed/flipkart/120/60', cashbackRate: 'Up to 4.5% Rewards', dataAiHint: "flipkart logo", affiliateLink: 'https://flipkart.com?affid=cashease', description: 'Shop for mobiles, fashion, electronics, home appliances, groceries, and more. Leading Indian e-commerce platform.', categories: ['electronics', 'fashion', 'home', 'mobiles', 'grocery'], isFeatured: true, isActive: true, cashbackType: 'percentage', cashbackRateValue: 4.5, terms: 'Cashback rates differ for product categories. Mobiles often have lower rates. No cashback on flight bookings.' },
  { name: 'Myntra', logoUrl: 'https://picsum.photos/seed/myntra/120/60', cashbackRate: 'Flat 6% Cashback', dataAiHint: "myntra logo", affiliateLink: 'https://myntra.com?ref=cashease', description: 'Your ultimate destination for fashion and lifestyle, being host to a wide array of merchandise.', categories: ['fashion', 'accessories', 'beauty'], isFeatured: true, isActive: true, cashbackType: 'percentage', cashbackRateValue: 6, terms: 'Cashback applicable on all products unless otherwise specified. May not apply if other non-CashEase coupons are used.' },
  { name: 'Ajio', logoUrl: 'https://picsum.photos/seed/ajio/120/60', cashbackRate: 'Up to 8% Cashback', dataAiHint: "ajio logo", affiliateLink: 'https://ajio.com?cjevent=cashease', description: 'Curated fashion brands. Handpicked styles for men, women, and kids. International brands available.', categories: ['fashion', 'accessories'], isFeatured: true, isActive: true, cashbackType: 'percentage', cashbackRateValue: 8, terms: 'Cashback calculated on final order value after discounts. Ensure you click through CashEase before adding items to cart.' },
  { name: 'MakeMyTrip', logoUrl: 'https://picsum.photos/seed/makemytrip/120/60', cashbackRate: '₹150 on Flights', dataAiHint: "makemytrip logo", affiliateLink: 'https://makemytrip.com?partner=cashease', description: 'Book flights, hotels, holiday packages, buses, and trains. India\'s leading online travel company.', categories: ['travel', 'flights', 'hotels'], isFeatured: true, isActive: true, cashbackType: 'fixed', cashbackRateValue: 150, terms: 'Fixed cashback applicable only on successful domestic flight bookings. Hotel cashback varies.' },
  { name: 'Nykaa', logoUrl: 'https://picsum.photos/seed/nykaa/120/60', cashbackRate: 'Flat 7% Cashback', dataAiHint: "nykaa logo", affiliateLink: 'https://nykaa.com?partner=cashease', description: 'Premier online beauty and wellness destination. Shop makeup, skincare, haircare, fragrances, and more.', categories: ['beauty', 'cosmetics', 'skincare'], isFeatured: true, isActive: true, cashbackType: 'percentage', cashbackRateValue: 7, terms: 'Cashback applies to most products. Some luxury brands might be excluded. Check terms before purchase.' },
  { name: 'Tata CLiQ', logoUrl: 'https://picsum.photos/seed/tatacliq/120/60', cashbackRate: 'Up to 5% Cashback', dataAiHint: "tata cliq logo", affiliateLink: 'https://tatacliq.com?partner=cashease', description: 'Authentic brands across Electronics, Fashion, Footwear, and Accessories. Curated by Tata.', categories: ['electronics', 'fashion', 'home'], isFeatured: false, isActive: true, cashbackType: 'percentage', cashbackRateValue: 5, terms: 'Cashback rates vary by category.' },
  { name: 'BigBasket', logoUrl: 'https://picsum.photos/seed/bigbasket/120/60', cashbackRate: 'Flat ₹50 Cashback', dataAiHint: "bigbasket logo", affiliateLink: 'https://bigbasket.com?partner=cashease', description: 'India\'s largest online grocery store. Get fresh produce, staples, and daily essentials delivered to your doorstep.', categories: ['grocery'], isFeatured: false, isActive: true, cashbackType: 'fixed', cashbackRateValue: 50, terms: 'Cashback applicable on first order of the month above ₹1000. Terms may change.' },
];

const couponsData: { storeName: string; data: Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'storeId'> }[] = [
  { storeName: 'Myntra', data: { code: 'MYNTRA200', description: '₹200 Off on Orders Above ₹1499', link: null, expiryDate: null, isFeatured: true, isActive: true } },
  { storeName: 'Amazon IN', data: { code: 'AMZSAVE10', description: '10% off Select Electronics (Max ₹500)', link: null, expiryDate: null, isFeatured: true, isActive: true } },
  { storeName: 'Ajio', data: { code: null, description: 'Flat 50-80% Off Top Brands', link: 'https://ajio.com/shop/sale', expiryDate: null, isFeatured: true, isActive: true } },
  { storeName: 'Flipkart', data: { code: 'FLIPFIRST', description: '₹100 Off First Order on App', link: null, expiryDate: null, isFeatured: false, isActive: true } },
  { storeName: 'MakeMyTrip', data: { code: 'FLYNOW', description: 'Flat ₹500 Off Domestic Flights', link: null, expiryDate: Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)), isFeatured: true, isActive: true } }, // Expires in 30 days
  { storeName: 'Nykaa', data: { code: 'NYKNEW15', description: '15% Off First Order', link: null, expiryDate: null, isFeatured: false, isActive: true } },
  { storeName: 'Tata CLiQ', data: { code: 'CLIQ500', description: '₹500 Off on orders above ₹2500', link: null, expiryDate: null, isFeatured: false, isActive: true } },
  { storeName: 'BigBasket', data: { code: null, description: 'Up to 50% Off Daily Essentials', link: 'https://bigbasket.com/offers/', expiryDate: null, isFeatured: true, isActive: true } },
];

const bannersData: Omit<Banner, 'id' | 'createdAt' | 'updatedAt'>[] = [
   { title: 'Mega Electronics Sale!', subtitle: 'Up to 60% off on Laptops, TVs & More', imageUrl: 'https://picsum.photos/seed/banner-electronics/1200/400', link: '/category/electronics', altText: 'Electronics Sale Banner', order: 0, isActive: true, dataAiHint: 'electronics sale discount' },
   { title: 'Top Fashion Trends', subtitle: 'Get the latest styles with extra cashback', imageUrl: 'https://picsum.photos/seed/banner-fashion/1200/400', link: '/category/fashion', altText: 'Fashion Trends Banner', order: 1, isActive: true, dataAiHint: 'fashion models clothing sale' },
   { title: 'Travel Deals', subtitle: 'Book your next vacation and save big!', imageUrl: 'https://picsum.photos/seed/banner-travel/1200/400', link: '/category/travel', altText: 'Travel Deals Banner', order: 2, isActive: true, dataAiHint: 'travel vacation airplane destination' },
];

// --- Example User Data ---
// IMPORTANT: Set the NEXT_PUBLIC_INITIAL_ADMIN_UID environment variable to a real UID
// from your Firebase Authentication to make that user an admin.
const ADMIN_USER_ID = process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID || `seed_admin_${Date.now()}`;
const TEST_USER_ID_1 = `seed_user_${Date.now()}_1`;
const TEST_USER_ID_2 = `seed_user_${Date.now()}_2`;

const usersData: Omit<UserProfile, 'createdAt' | 'updatedAt' | 'lastPayoutRequestAt' | 'payoutDetails'>[] = [
  {
    uid: TEST_USER_ID_1,
    email: `testuser1_${Date.now()}@example.com`, // Use timestamp for uniqueness
    displayName: 'Test User One',
    photoURL: `https://i.pravatar.cc/150?u=${TEST_USER_ID_1}`,
    role: 'user',
    cashbackBalance: 350.75,
    pendingCashback: 120.50,
    lifetimeCashback: 850.25,
    referralCode: uuidv4().substring(0, 8).toUpperCase(),
    referralCount: 2,
    referralBonusEarned: 100,
    referredBy: null,
    isDisabled: false,
  },
  {
    uid: TEST_USER_ID_2,
    email: `testuser2_${Date.now()}@example.com`,
    displayName: 'Test User Two',
    photoURL: `https://i.pravatar.cc/150?u=${TEST_USER_ID_2}`,
    role: 'user',
    cashbackBalance: 150.00,
    pendingCashback: 45.00,
    lifetimeCashback: 195.00,
    referralCode: uuidv4().substring(0, 8).toUpperCase(),
    referralCount: 0,
    referralBonusEarned: 0,
    referredBy: usersData[0].referralCode, // Referred by user one
    isDisabled: false,
  },
  // Add the admin user only if the placeholder UID is different from the env var or if env var is not set
  ...(ADMIN_USER_ID.startsWith('seed_admin_') ? [{
    uid: ADMIN_USER_ID,
    email: `admin_${Date.now()}@example.com`,
    displayName: 'Admin User',
    photoURL: `https://i.pravatar.cc/150?u=${ADMIN_USER_ID}`,
    role: 'admin',
    cashbackBalance: 0,
    pendingCashback: 0,
    lifetimeCashback: 0,
    referralCode: uuidv4().substring(0, 8).toUpperCase(),
    referralCount: 0,
    referralBonusEarned: 0,
    referredBy: null,
    isDisabled: false,
  }] : []),
];

// --- Example Transaction Data ---
const transactionsData: { userId: string; storeName: string; data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'storeId' | 'storeName' | 'payoutId'> }[] = [
    // User 1 Transactions
    { userId: TEST_USER_ID_1, storeName: 'Amazon IN', data: { saleAmount: 1000, cashbackAmount: 50, status: 'confirmed', transactionDate: Timestamp.fromDate(new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)), confirmationDate: Timestamp.fromDate(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)) } },
    { userId: TEST_USER_ID_1, storeName: 'Myntra', data: { saleAmount: 2000, cashbackAmount: 120, status: 'confirmed', transactionDate: Timestamp.fromDate(new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)), confirmationDate: Timestamp.fromDate(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)) } },
    { userId: TEST_USER_ID_1, storeName: 'Flipkart', data: { saleAmount: 500, cashbackAmount: 22.50, status: 'confirmed', transactionDate: Timestamp.fromDate(new Date(Date.now() - 50 * 24 * 60 * 60 * 1000)), confirmationDate: Timestamp.fromDate(new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)) } },
    { userId: TEST_USER_ID_1, storeName: 'Nykaa', data: { saleAmount: 800, cashbackAmount: 56, status: 'pending', transactionDate: Timestamp.fromDate(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)) } }, // Pending
    { userId: TEST_USER_ID_1, storeName: 'Ajio', data: { saleAmount: 1000, cashbackAmount: 80, status: 'confirmed', transactionDate: Timestamp.fromDate(new Date(Date.now() - 35 * 24 * 60 * 60 * 1000)), confirmationDate: Timestamp.fromDate(new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)) } },
    { userId: TEST_USER_ID_1, storeName: 'MakeMyTrip', data: { saleAmount: 5000, cashbackAmount: 150, status: 'confirmed', transactionDate: Timestamp.fromDate(new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)), confirmationDate: Timestamp.fromDate(new Date(Date.now() - 25 * 24 * 60 * 60 * 1000)) } },
    { userId: TEST_USER_ID_1, storeName: 'BigBasket', data: { saleAmount: 1200, cashbackAmount: 50, status: 'pending', transactionDate: Timestamp.fromDate(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)) } }, // Pending
    { userId: TEST_USER_ID_1, storeName: 'Amazon IN', data: { saleAmount: 200, cashbackAmount: 10, status: 'pending', transactionDate: Timestamp.fromDate(new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)) } }, // Recent Pending

    // User 2 Transactions
    { userId: TEST_USER_ID_2, storeName: 'Amazon IN', data: { saleAmount: 3000, cashbackAmount: 150, status: 'confirmed', transactionDate: Timestamp.fromDate(new Date(Date.now() - 42 * 24 * 60 * 60 * 1000)), confirmationDate: Timestamp.fromDate(new Date(Date.now() - 13 * 24 * 60 * 60 * 1000)) } },
    { userId: TEST_USER_ID_2, storeName: 'Ajio', data: { saleAmount: 1500, cashbackAmount: 120, status: 'rejected', transactionDate: Timestamp.fromDate(new Date(Date.now() - 55 * 24 * 60 * 60 * 1000)), adminNotes: 'Returned item' } }, // Rejected
    { userId: TEST_USER_ID_2, storeName: 'BigBasket', data: { saleAmount: 600, cashbackAmount: 50, status: 'pending', transactionDate: Timestamp.fromDate(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)) } }, // Pending
    { userId: TEST_USER_ID_2, storeName: 'Myntra', data: { saleAmount: 1000, cashbackAmount: 60, status: 'pending', transactionDate: Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) } }, // Pending
];


// --- NEW: Example Payout Request Data ---
// Note: transactionIds will be linked manually after seeding transactions for simplicity here
const payoutRequestsData: { userId: string; data: Omit<PayoutRequest, 'id' | 'requestedAt' | 'processedAt' | 'userId' | 'transactionIds'> }[] = [
    // Intentionally leaving this empty initially, as seeding paid requests requires knowing transaction IDs
    // A more advanced seed script could query the just-seeded transactions and link them.
    // Example of a PENDING request (can be created without linking Txs immediately)
    // { userId: TEST_USER_ID_1, data: { amount: 300, status: 'pending', paymentMethod: 'gift_card', paymentDetails: { method: 'gift_card', detail: 'userone@example.com' }, adminNotes: null, failureReason: null } },
];

// --- NEW: Example Click Data ---
const clicksData: { userId: string; storeName: string; couponCode?: string | null; data: Omit<Click, 'id' | 'timestamp' | 'userId' | 'storeId' | 'storeName' | 'couponId'> }[] = [
    { userId: TEST_USER_ID_1, storeName: 'Amazon IN', data: { affiliateLink: 'https://amazon.in?tag=cashease-21&subid=CLICK1', clickId: uuidv4() } },
    { userId: TEST_USER_ID_1, storeName: 'Myntra', couponCode: 'MYNTRA200', data: { affiliateLink: 'https://myntra.com?ref=cashease&subid=CLICK2', clickId: uuidv4() } },
    { userId: TEST_USER_ID_2, storeName: 'Flipkart', data: { affiliateLink: 'https://flipkart.com?affid=cashease&subid=CLICK3', clickId: uuidv4() } },
    { userId: TEST_USER_ID_1, storeName: 'Nykaa', data: { affiliateLink: 'https://nykaa.com?partner=cashease&subid=CLICK4', clickId: uuidv4() } },
    { userId: TEST_USER_ID_2, storeName: 'Ajio', couponCode: null, data: { affiliateLink: 'https://ajio.com/shop/sale&amp;cjevent=cashease&amp;subid=CLICK5', clickId: uuidv4() } }, // Example deal click
];


// --- Seeding Function ---

export async function seedDatabase() {
    // NOTE: Directly using useToast here might not work if this script is run
    // outside a React component context (e.g., via node).
    // Consider passing a logging function or using console logs directly.
    // const { toast } = useToast(); // This might fail if run via node directly

    if (!db) {
        console.error("Firestore DB is not initialized. Cannot seed data.");
        // toast?.({ variant: "destructive", title: "Seeding Error", description: "Database not available." });
        return { success: false, message: "Database not available." };
    }

    console.log("Starting database seeding process...");
    const batch = writeBatch(db);
    const categoriesCollection = collection(db, 'categories');
    const storesCollection = collection(db, 'stores');
    const couponsCollection = collection(db, 'coupons');
    const bannersCollection = collection(db, 'banners');
    const usersCollection = collection(db, 'users');
    const transactionsCollection = collection(db, 'transactions');
    const payoutRequestsCollection = collection(db, 'payoutRequests');
    const clicksCollection = collection(db, 'clicks');

    const storeNameToIdMap = new Map<string, string>();
    const couponCodeToIdMap = new Map<string, string>(); // Map coupon codes to their IDs

    try {
        // 0. Check if data already exists (optional, prevents re-seeding)
        const storesCheckQuery = query(storesCollection, limit(1));
        const storesSnapshot = await getDocs(storesCheckQuery);
        if (!storesSnapshot.empty) {
            console.log("Database already contains stores. Skipping seeding (assuming data exists).");
            // toast?.({ title: "Seeding Skipped", description: "Database appears to contain data." });
            return { success: true, message: "Seeding skipped, data already exists." };
        }

        // 1. Seed Categories
        console.log("Seeding categories...");
        let categoryCount = 0;
        for (const categoryData of categoriesData) {
            const categoryDocRef = doc(categoriesCollection, categoryData.slug); // Use slug as ID
            batch.set(categoryDocRef, {
                ...categoryData,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            categoryCount++;
        }
        console.log(`Prepared ${categoryCount} categories.`);

        // 2. Seed Stores and build name-to-ID map
        console.log("Seeding stores...");
        let storeCount = 0;
        for (const storeData of storesData) {
            const storeDocRef = doc(storesCollection); // Auto-generate ID
            storeNameToIdMap.set(storeData.name, storeDocRef.id); // Map name to the generated ID
            batch.set(storeDocRef, {
                ...storeData,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            storeCount++;
        }
        console.log(`Prepared ${storeCount} stores.`);

        // 3. Seed Coupons using the store ID map and build coupon code map
        console.log("Seeding coupons...");
        let couponCount = 0;
        let skippedCoupons = 0;
        for (const { storeName, data: couponData } of couponsData) {
            const storeId = storeNameToIdMap.get(storeName);
            if (storeId) {
                const couponDocRef = doc(couponsCollection); // Auto-generate ID
                if (couponData.code) {
                    couponCodeToIdMap.set(couponData.code, couponDocRef.id); // Map code to ID
                }
                batch.set(couponDocRef, {
                    ...couponData,
                    storeId: storeId, // Link to store
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
                couponCount++;
            } else {
                skippedCoupons++;
                console.warn(`Skipping coupon for "${storeName}" as store ID was not found.`);
            }
        }
        console.log(`Prepared ${couponCount} coupons. Skipped ${skippedCoupons}.`);

        // 4. Seed Banners
        console.log("Seeding banners...");
        let bannerCount = 0;
        for (const bannerData of bannersData) {
            const bannerDocRef = doc(bannersCollection); // Auto-generate ID
            batch.set(bannerDocRef, {
                ...bannerData,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            bannerCount++;
        }
        console.log(`Prepared ${bannerCount} banners.`);

        // 5. Seed Users
        console.log("Seeding users...");
        let userCount = 0;
        for (const userData of usersData) {
            // Use the predefined seed UIDs directly
            const userDocRef = doc(usersCollection, userData.uid);

            // Check if user already exists (useful if script runs multiple times partially)
            const userSnap = await getDoc(userDocRef);
            if (!userSnap.exists()) {
                 batch.set(userDocRef, {
                     ...userData,
                     // uid field is already part of userData
                     createdAt: serverTimestamp(),
                     updatedAt: serverTimestamp(),
                     lastPayoutRequestAt: null,
                     payoutDetails: null,
                 });
                 userCount++;
            } else {
                console.log(`User ${userData.uid} already exists. Skipping creation.`);
            }
        }
        console.log(`Prepared ${userCount} new users.`);

        // 6. Seed Transactions
        console.log("Seeding transactions...");
        let transactionCount = 0;
        let skippedTransactions = 0;
        for (const { userId, storeName, data: txData } of transactionsData) {
            const storeId = storeNameToIdMap.get(storeName);
            // Use the seed user ID directly
            const finalUserId = userId;

            if (finalUserId && storeId) {
                const transactionDocRef = doc(transactionsCollection); // Auto-generate ID
                batch.set(transactionDocRef, {
                    ...txData,
                    userId: finalUserId,
                    storeId: storeId,
                    storeName: storeName, // Denormalized name
                    payoutId: null, // Initialize payoutId as null
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
                transactionCount++;
            } else {
                skippedTransactions++;
                console.warn(`Skipping transaction for user placeholder "${userId}" or store "${storeName}" as ID was not found.`);
            }
        }
        console.log(`Prepared ${transactionCount} transactions. Skipped ${skippedTransactions}.`);

        // 7. Seed Clicks
        console.log("Seeding clicks...");
        let clickCount = 0;
        let skippedClicks = 0;
        for (const { userId, storeName, couponCode, data: clickData } of clicksData) {
            const storeId = storeNameToIdMap.get(storeName);
            const couponId = couponCode ? couponCodeToIdMap.get(couponCode) : null;
            const finalUserId = userId; // Use the seed user ID directly

            if (finalUserId && storeId) {
                const clickDocRef = doc(clicksCollection, clickData.clickId || uuidv4()); // Use provided clickId or generate
                batch.set(clickDocRef, {
                    ...clickData,
                    userId: finalUserId,
                    storeId: storeId,
                    storeName: storeName,
                    couponId: couponId || null, // Set coupon ID if found
                    timestamp: serverTimestamp(),
                });
                clickCount++;
            } else {
                skippedClicks++;
                console.warn(`Skipping click for user "${userId}" or store "${storeName}" as ID was not found.`);
            }
        }
        console.log(`Prepared ${clickCount} clicks. Skipped ${skippedClicks}.`);


        // Commit the batch
        console.log("Committing batch write...");
        await batch.commit();
        console.log("Database seeding completed successfully.");
        // toast?.({ title: "Seeding Complete", description: `Added: ${categoryCount} categories, ${storeCount} stores, ${couponCount} coupons, ${bannerCount} banners, ${userCount} users, ${transactionCount} transactions, ${clickCount} clicks.` });
        return { success: true, message: "Seeding complete." };

    } catch (error) {
        console.error("Error during database seeding:", error);
        // toast?.({ variant: "destructive", title: "Seeding Failed", description: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` });
        return { success: false, message: `Seeding failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
}

// Optional: Function to check if seeding is needed (checks stores collection)
export async function needsSeeding(): Promise<boolean> {
    if (!db) return false;
    try {
        const storesRef = collection(db, "stores");
        const q = query(storesRef, limit(1));
        const snapshot = await getDocs(q);
        return snapshot.empty;
    } catch (error) {
        console.error("Error checking if seeding is needed:", error);
        return false; // Assume seeding is not needed if check fails
    }
}
