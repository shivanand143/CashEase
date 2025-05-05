import type { Store, Coupon, CashbackType, Category, Banner, Transaction, PayoutRequest } from '@/lib/types';
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
  // Add a few more stores for variety
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
  // Add collections for Transactions and Payouts if needed for sample data
  // const transactionsCollection = collection(db, 'transactions');
  // const payoutRequestsCollection = collection(db, 'payoutRequests');

  const storeNameToIdMap = new Map<string, string>();

  try {
    // 0. Check if data already exists (optional, prevents re-seeding)
    const storesCheckQuery = query(storesCollection, limit(1));
    const storesSnapshot = await getDocs(storesCheckQuery);
    if (!storesSnapshot.empty) {
      console.log("Database already contains data. Skipping seeding.");
      toast({ title: "Seeding Skipped", description: "Database already contains data." });
      return;
    }

    // 1. Seed Categories
    console.log("Seeding categories...");
    let categoryCount = 0;
    for (const categoryData of categoriesData) {
        // Use slug as document ID for categories
        const categoryDocRef = doc(categoriesCollection, categoryData.slug);
        batch.set(categoryDocRef, {
            ...categoryData,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        categoryCount++;
    }
    console.log(`Prepared ${categoryCount} categories for batch write.`);


    // 2. Seed Stores and build name-to-ID map
    console.log("Seeding stores...");
    let storeCount = 0;
    for (const storeData of storesData) {
      // Auto-generate ID for stores
      const storeDocRef = doc(storesCollection);
      storeNameToIdMap.set(storeData.name, storeDocRef.id);
      batch.set(storeDocRef, {
        ...storeData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      storeCount++;
    }
    console.log(`Prepared ${storeCount} stores for batch write.`);

    // 3. Seed Coupons using the store ID map
    console.log("Seeding coupons...");
    let couponCount = 0;
    let skippedCoupons = 0;
    for (const { storeName, data: couponData } of couponsData) {
      const storeId = storeNameToIdMap.get(storeName);
      if (storeId) {
        const couponDocRef = doc(couponsCollection);
        // Convert expiryDate string to Timestamp if necessary (assuming current format is ok for seed)
        const expiryTimestamp = couponData.expiryDate instanceof Date
           ? Timestamp.fromDate(couponData.expiryDate)
           : couponData.expiryDate; // Keep as null if already null

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
    console.log(`Prepared ${couponCount} coupons for batch write. Skipped ${skippedCoupons}.`);

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
     console.log(`Prepared ${bannerCount} banners for batch write.`);


    // 5. (Optional) Seed Sample Transactions & Payouts for testing
    // These would typically require existing user IDs.
    // Example (replace 'TEST_USER_ID' with an actual UID if testing):
    /*
    const testUserId = 'TEST_USER_ID'; // Replace with a valid user ID from your auth
    if (testUserId !== 'TEST_USER_ID') { // Only seed if a real UID is provided
        const transactionDocRef = doc(transactionsCollection);
        batch.set(transactionDocRef, {
            userId: testUserId,
            storeId: storeNameToIdMap.get('Amazon IN'), // Example
            storeName: 'Amazon IN',
            saleAmount: 500,
            cashbackAmount: 25, // Example calculation
            status: 'pending',
            transactionDate: Timestamp.fromDate(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)), // 3 days ago
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        console.log("Prepared sample transaction.");

        const payoutRequestDocRef = doc(payoutRequestsCollection);
        batch.set(payoutRequestDocRef, {
            userId: testUserId,
            amount: 250,
            status: 'pending',
            requestedAt: serverTimestamp(),
            paymentMethod: 'bank_transfer',
            paymentDetails: { method: 'bank_transfer', detail: 'testuser@upi' },
            transactionIds: [] // Normally link real transaction IDs here
        });
        console.log("Prepared sample payout request.");
    } else {
        console.log("Skipping sample transaction/payout seeding (TEST_USER_ID not replaced).");
    }
    */

    // 6. Commit the batch
    await batch.commit();
    console.log("Database seeding completed successfully.");
    toast({ title: "Seeding Complete", description: `${storeCount} stores, ${couponCount} coupons, ${categoryCount} categories, and ${bannerCount} banners added.` });

  } catch (error) {
    console.error("Error during database seeding:", error);
    toast({ variant: "destructive", title: "Seeding Failed", description: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` });
  }
}

// Optional: Function to check if seeding is needed
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
