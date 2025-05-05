
import type { Store, Coupon, CashbackType, Category, Banner, Transaction, PayoutRequest, Click, UserProfile, PayoutDetails } from '@/lib/types';
import { collection, writeBatch, serverTimestamp, doc, getDocs, query, where, limit, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useToast } from '@/hooks/use-toast'; // Assuming useToast works in this context

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
  { name: 'Amazon IN', logoUrl: 'https://picsum.photos/seed/amazonin/100/50', cashbackRate: 'Up to 5% Rewards', dataAiHint: "amazon india logo", affiliateLink: 'https://amazon.in?tag=cashease-21', description: 'Wide range of products.', categories: ['electronics', 'fashion', 'home', 'books', 'grocery'], isFeatured: true, isActive: true, cashbackType: 'percentage', cashbackRateValue: 5, terms: 'Cashback varies by category.' },
  { name: 'Flipkart', logoUrl: 'https://picsum.photos/seed/flipkart/100/50', cashbackRate: 'Up to 4.5% Rewards', dataAiHint: "flipkart logo", affiliateLink: 'https://flipkart.com?affid=cashease', description: 'Leading Indian e-commerce.', categories: ['electronics', 'fashion', 'home', 'mobiles'], isFeatured: true, isActive: true, cashbackType: 'percentage', cashbackRateValue: 4.5 },
  { name: 'Myntra', logoUrl: 'https://picsum.photos/seed/myntra/100/50', cashbackRate: 'Flat 6% Cashback', dataAiHint: "myntra logo", affiliateLink: 'https://myntra.com?ref=cashease', description: 'Fashion and lifestyle.', categories: ['fashion', 'accessories', 'beauty'], isFeatured: true, isActive: true, cashbackType: 'percentage', cashbackRateValue: 6 },
  { name: 'Ajio', logoUrl: 'https://picsum.photos/seed/ajio/100/50', cashbackRate: 'Up to 8% Cashback', dataAiHint: "ajio logo", affiliateLink: 'https://ajio.com?cjevent=cashease', description: 'Curated fashion brands.', categories: ['fashion', 'accessories'], isFeatured: false, isActive: true, cashbackType: 'percentage', cashbackRateValue: 8 },
  { name: 'MakeMyTrip', logoUrl: 'https://picsum.photos/seed/makemytrip/100/50', cashbackRate: 'Up to ₹1500 on Flights', dataAiHint: "makemytrip logo", affiliateLink: 'https://makemytrip.com?partner=cashease', description: 'Book flights, hotels.', categories: ['travel', 'flights', 'hotels'], isFeatured: true, isActive: true, cashbackType: 'fixed', cashbackRateValue: 1500 },
  { name: 'Nykaa', logoUrl: 'https://picsum.photos/seed/nykaa/100/50', cashbackRate: 'Up to 7% Cashback', dataAiHint: "nykaa logo", affiliateLink: 'https://nykaa.com?partner=cashease', description: 'Beauty, makeup, wellness.', categories: ['beauty', 'cosmetics', 'skincare'], isFeatured: true, isActive: true, cashbackType: 'percentage', cashbackRateValue: 7 },
  { name: 'Tata CLiQ', logoUrl: 'https://picsum.photos/seed/tatacliq/100/50', cashbackRate: 'Up to 5% Cashback', dataAiHint: "tata cliq logo", affiliateLink: 'https://tatacliq.com?partner=cashease', description: 'Electronics, Fashion & more.', categories: ['electronics', 'fashion', 'home'], isFeatured: false, isActive: true, cashbackType: 'percentage', cashbackRateValue: 5 },
  { name: 'BigBasket', logoUrl: 'https://picsum.photos/seed/bigbasket/100/50', cashbackRate: 'Flat ₹50 Cashback', dataAiHint: "bigbasket logo", affiliateLink: 'https://bigbasket.com?partner=cashease', description: 'Online grocery store.', categories: ['grocery'], isFeatured: false, isActive: true, cashbackType: 'fixed', cashbackRateValue: 50 },
];

const couponsData: { storeName: string; data: Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'storeId'> }[] = [
  { storeName: 'Myntra', data: { code: 'MYNTRA200', description: '₹200 Off on Orders Above ₹1499', link: null, expiryDate: null, isFeatured: true, isActive: true } },
  { storeName: 'Amazon IN', data: { code: 'AMZSAVE10', description: '10% off Select Electronics (Max ₹500)', link: null, expiryDate: null, isFeatured: true, isActive: true } },
  { storeName: 'Ajio', data: { code: null, description: 'Flat 50-80% Off Top Brands', link: 'https://ajio.com/shop/sale', expiryDate: null, isFeatured: true, isActive: true } },
  { storeName: 'Flipkart', data: { code: 'FLIPFIRST', description: '₹100 Off First Order on App', link: null, expiryDate: null, isFeatured: false, isActive: true } },
  { storeName: 'MakeMyTrip', data: { code: 'FLYNOW', description: 'Flat ₹500 Off Domestic Flights', link: null, expiryDate: null, isFeatured: true, isActive: true } },
  { storeName: 'Nykaa', data: { code: 'NYKNEW15', description: '15% Off First Order', link: null, expiryDate: null, isFeatured: false, isActive: true } },
  { storeName: 'Tata CLiQ', data: { code: 'CLIQ500', description: '₹500 Off on orders above ₹2500', link: null, expiryDate: null, isFeatured: false, isActive: true } },
   { storeName: 'BigBasket', data: { code: null, description: 'Up to 50% Off Daily Essentials', link: 'https://bigbasket.com/offers/', expiryDate: null, isFeatured: true, isActive: true } },
];

const bannersData: Omit<Banner, 'id' | 'createdAt' | 'updatedAt'>[] = [
   { title: 'Mega Electronics Sale!', subtitle: 'Up to 60% off on Laptops, TVs & More', imageUrl: 'https://picsum.photos/seed/banner-electronics/1200/400', link: '/category/electronics', altText: 'Electronics Sale Banner', order: 0, isActive: true, dataAiHint: 'electronics sale discount' },
   { title: 'Top Fashion Trends', subtitle: 'Get the latest styles with extra cashback', imageUrl: 'https://picsum.photos/seed/banner-fashion/1200/400', link: '/category/fashion', altText: 'Fashion Trends Banner', order: 1, isActive: true, dataAiHint: 'fashion models clothing sale' },
   { title: 'Travel Deals', subtitle: 'Book your next vacation and save big!', imageUrl: 'https://picsum.photos/seed/banner-travel/1200/400', link: '/category/travel', altText: 'Travel Deals Banner', order: 2, isActive: true, dataAiHint: 'travel vacation airplane destination' },
];

// --- NEW: Example User Data ---
// IMPORTANT: Replace placeholder UIDs with actual UIDs from your Firebase Authentication
// if you want the data to be associated with real users.
const TEST_USER_ID_1 = 'PLACEHOLDER_UID_1'; // e.g., 'user1_from_firebase_auth'
const TEST_USER_ID_2 = 'PLACEHOLDER_UID_2'; // e.g., 'user2_from_firebase_auth'
const ADMIN_USER_ID = process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID || 'ADMIN_PLACEHOLDER_UID'; // Use admin UID from env if set

const usersData: Omit<UserProfile, 'createdAt' | 'updatedAt' | 'lastPayoutRequestAt' | 'payoutDetails'>[] = [
  {
    uid: TEST_USER_ID_1,
    email: 'testuser1@example.com',
    displayName: 'Test User One',
    photoURL: `https://i.pravatar.cc/150?u=${TEST_USER_ID_1}`,
    role: 'user',
    cashbackBalance: 350.75,
    pendingCashback: 120.50,
    lifetimeCashback: 850.25,
    referralCode: 'USERONE123',
    referralCount: 2,
    referralBonusEarned: 100,
    referredBy: null,
    isDisabled: false,
  },
  {
    uid: TEST_USER_ID_2,
    email: 'testuser2@example.com',
    displayName: 'Test User Two',
    photoURL: `https://i.pravatar.cc/150?u=${TEST_USER_ID_2}`,
    role: 'user',
    cashbackBalance: 150.00,
    pendingCashback: 45.00,
    lifetimeCashback: 195.00,
    referralCode: 'USERTWO456',
    referralCount: 0,
    referralBonusEarned: 0,
    referredBy: 'USERONE123', // Referred by user one
    isDisabled: false,
  },
  {
    uid: ADMIN_USER_ID,
    email: 'admin@example.com',
    displayName: 'Admin User',
    photoURL: `https://i.pravatar.cc/150?u=${ADMIN_USER_ID}`,
    role: 'admin',
    cashbackBalance: 0,
    pendingCashback: 0,
    lifetimeCashback: 0,
    referralCode: 'ADMIN789',
    referralCount: 0,
    referralBonusEarned: 0,
    referredBy: null,
    isDisabled: false,
  },
];

// --- NEW: Example Transaction Data ---
const transactionsData: { userId: string; storeName: string; data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'storeId' | 'storeName'> }[] = [
  { userId: TEST_USER_ID_1, storeName: 'Amazon IN', data: { saleAmount: 1000, cashbackAmount: 50, status: 'confirmed', transactionDate: Timestamp.fromDate(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)), confirmationDate: Timestamp.fromDate(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)) } },
  { userId: TEST_USER_ID_1, storeName: 'Myntra', data: { saleAmount: 2000, cashbackAmount: 120, status: 'confirmed', transactionDate: Timestamp.fromDate(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)), confirmationDate: Timestamp.fromDate(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)) } },
  { userId: TEST_USER_ID_1, storeName: 'Flipkart', data: { saleAmount: 500, cashbackAmount: 22.50, status: 'confirmed', transactionDate: Timestamp.fromDate(new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)), confirmationDate: Timestamp.fromDate(new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)) } },
  { userId: TEST_USER_ID_1, storeName: 'Nykaa', data: { saleAmount: 800, cashbackAmount: 56, status: 'pending', transactionDate: Timestamp.fromDate(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)) } }, // Pending
  { userId: TEST_USER_ID_2, storeName: 'Amazon IN', data: { saleAmount: 3000, cashbackAmount: 150, status: 'confirmed', transactionDate: Timestamp.fromDate(new Date(Date.now() - 12 * 24 * 60 * 60 * 1000)), confirmationDate: Timestamp.fromDate(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)) } },
  { userId: TEST_USER_ID_2, storeName: 'Ajio', data: { saleAmount: 1500, cashbackAmount: 120, status: 'rejected', transactionDate: Timestamp.fromDate(new Date(Date.now() - 25 * 24 * 60 * 60 * 1000)), adminNotes: 'Returned item' } }, // Rejected
  { userId: TEST_USER_ID_2, storeName: 'BigBasket', data: { saleAmount: 600, cashbackAmount: 50, status: 'pending', transactionDate: Timestamp.fromDate(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)) } }, // Pending
];

// --- NEW: Example Payout Request Data ---
const payoutRequestsData: { userId: string; data: Omit<PayoutRequest, 'id' | 'requestedAt' | 'processedAt' | 'userId' | 'transactionIds'> }[] = [
  { userId: TEST_USER_ID_1, data: { amount: 250, status: 'paid', paymentMethod: 'bank_transfer', paymentDetails: { method: 'bank_transfer', detail: 'userone@okbank' }, adminNotes: 'Processed via UPI', failureReason: null } }, // Paid
  { userId: TEST_USER_ID_1, data: { amount: 300, status: 'pending', paymentMethod: 'gift_card', paymentDetails: { method: 'gift_card', detail: 'userone@example.com' }, adminNotes: null, failureReason: null } }, // Pending
];

// --- NEW: Example Click Data ---
const clicksData: { userId: string; storeName: string; data: Omit<Click, 'id' | 'timestamp' | 'userId' | 'storeId' | 'storeName'> }[] = [
  { userId: TEST_USER_ID_1, storeName: 'Amazon IN', data: { couponId: null, affiliateLink: 'https://amazon.in?tag=cashease-21&subid=CLICK1', clickId: 'CLICK1' } },
  { userId: TEST_USER_ID_1, storeName: 'Myntra', data: { couponId: 'MYNTRA200_COUPON_ID', affiliateLink: 'https://myntra.com?ref=cashease&subid=CLICK2', clickId: 'CLICK2' } },
  { userId: TEST_USER_ID_2, storeName: 'Flipkart', data: { couponId: null, affiliateLink: 'https://flipkart.com?affid=cashease&subid=CLICK3', clickId: 'CLICK3' } },
];


// --- Seeding Function ---

export async function seedDatabase() {
  const { toast } = useToast(); // Get toast function inside the async function

  if (!db) {
    console.error("Firestore DB is not initialized. Cannot seed data.");
    toast({ variant: "destructive", title: "Seeding Error", description: "Database not available." });
    return;
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
  const userPlaceholderIdMap = new Map<string, string>([
     [TEST_USER_ID_1, TEST_USER_ID_1 === 'PLACEHOLDER_UID_1' ? `seed_user_${Date.now()}_1` : TEST_USER_ID_1],
     [TEST_USER_ID_2, TEST_USER_ID_2 === 'PLACEHOLDER_UID_2' ? `seed_user_${Date.now()}_2` : TEST_USER_ID_2],
     [ADMIN_USER_ID, ADMIN_USER_ID === 'ADMIN_PLACEHOLDER_UID' ? `seed_admin_${Date.now()}` : ADMIN_USER_ID],
  ]);


  try {
    // 0. Check if data already exists (optional, prevents re-seeding)
    const storesCheckQuery = query(storesCollection, limit(1));
    const storesSnapshot = await getDocs(storesCheckQuery);
    if (!storesSnapshot.empty) {
      console.log("Database already contains stores. Skipping seeding (assuming data exists).");
      toast({ title: "Seeding Skipped", description: "Database appears to contain data." });
      return;
    }

    // 1. Seed Categories
    console.log("Seeding categories...");
    let categoryCount = 0;
    for (const categoryData of categoriesData) {
      const categoryDocRef = doc(categoriesCollection, categoryData.slug);
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
      const storeDocRef = doc(storesCollection);
      storeNameToIdMap.set(storeData.name, storeDocRef.id); // Map name to the generated ID
      batch.set(storeDocRef, {
        ...storeData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      storeCount++;
    }
    console.log(`Prepared ${storeCount} stores.`);

    // 3. Seed Coupons using the store ID map
    console.log("Seeding coupons...");
    let couponCount = 0;
    let skippedCoupons = 0;
    for (const { storeName, data: couponData } of couponsData) {
      const storeId = storeNameToIdMap.get(storeName);
      if (storeId) {
        const couponDocRef = doc(couponsCollection);
        const expiryTimestamp = couponData.expiryDate instanceof Date
           ? Timestamp.fromDate(couponData.expiryDate)
           : couponData.expiryDate;

        batch.set(couponDocRef, {
          ...couponData,
          expiryDate: expiryTimestamp,
          storeId: storeId,
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
       const bannerDocRef = doc(bannersCollection);
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
          const finalUserId = userPlaceholderIdMap.get(userData.uid) || userData.uid; // Use mapped ID or original
          // Skip seeding if placeholder wasn't replaced and it's not the admin placeholder
          if (finalUserId.startsWith('PLACEHOLDER_') || (finalUserId === 'ADMIN_PLACEHOLDER_UID' && process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID === 'ADMIN_PLACEHOLDER_UID')) {
              console.warn(`Skipping user seeding for placeholder UID: ${userData.uid}. Replace placeholders or set NEXT_PUBLIC_INITIAL_ADMIN_UID.`);
              continue;
          }
          const userDocRef = doc(usersCollection, finalUserId);
          batch.set(userDocRef, {
              ...userData,
              uid: finalUserId, // Ensure the correct final UID is saved
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              lastPayoutRequestAt: null, // Initialize as null
              payoutDetails: null, // Initialize as null
          });
          userCount++;
      }
      console.log(`Prepared ${userCount} users.`);


      // 6. Seed Transactions
       console.log("Seeding transactions...");
       let transactionCount = 0;
       let skippedTransactions = 0;
       for (const { userId, storeName, data: txData } of transactionsData) {
           const finalUserId = userPlaceholderIdMap.get(userId);
           const storeId = storeNameToIdMap.get(storeName);
           if (finalUserId && storeId) {
               const transactionDocRef = doc(transactionsCollection);
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


      // 7. Seed Payout Requests
       console.log("Seeding payout requests...");
       let payoutRequestCount = 0;
       let skippedPayoutRequests = 0;
       for (const { userId, data: payoutData } of payoutRequestsData) {
            const finalUserId = userPlaceholderIdMap.get(userId);
            if (finalUserId) {
               const payoutRequestDocRef = doc(payoutRequestsCollection);
                // Mock linking transaction IDs - In real seeding, query relevant transactions
               const mockTransactionIds: string[] = []; // Populate if needed for testing relations
               batch.set(payoutRequestDocRef, {
                   ...payoutData,
                   userId: finalUserId,
                   transactionIds: mockTransactionIds,
                   requestedAt: serverTimestamp(), // Set request time
                   processedAt: payoutData.status === 'paid' ? serverTimestamp() : null, // Set process time if paid
                   createdAt: serverTimestamp(), // Add createdAt
                   updatedAt: serverTimestamp(), // Add updatedAt
               });
               payoutRequestCount++;
           } else {
                skippedPayoutRequests++;
               console.warn(`Skipping payout request for user placeholder "${userId}" as ID was not found.`);
           }
       }
       console.log(`Prepared ${payoutRequestCount} payout requests. Skipped ${skippedPayoutRequests}.`);


      // 8. Seed Clicks
       console.log("Seeding clicks...");
       let clickCount = 0;
       let skippedClicks = 0;
       for (const { userId, storeName, data: clickData } of clicksData) {
           const finalUserId = userPlaceholderIdMap.get(userId);
           const storeId = storeNameToIdMap.get(storeName);
           if (finalUserId && storeId) {
               // Use the provided clickId as the document ID
               const clickDocRef = doc(clicksCollection, clickData.clickId || `seed_click_${Date.now()}_${clickCount}`);
               batch.set(clickDocRef, {
                   ...clickData,
                   userId: finalUserId,
                   storeId: storeId,
                   storeName: storeName,
                   timestamp: serverTimestamp(),
               });
               clickCount++;
           } else {
               skippedClicks++;
               console.warn(`Skipping click for user placeholder "${userId}" or store "${storeName}" as ID was not found.`);
           }
       }
       console.log(`Prepared ${clickCount} clicks. Skipped ${skippedClicks}.`);


    // 9. Commit the batch
    console.log("Committing batch write...");
    await batch.commit();
    console.log("Database seeding completed successfully.");
    toast({ title: "Seeding Complete", description: `Added: ${categoryCount} categories, ${storeCount} stores, ${couponCount} coupons, ${bannerCount} banners, ${userCount} users, ${transactionCount} transactions, ${payoutRequestCount} payouts, ${clickCount} clicks.` });

  } catch (error) {
    console.error("Error during database seeding:", error);
    toast({ variant: "destructive", title: "Seeding Failed", description: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` });
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
       return false;
   }
}

  