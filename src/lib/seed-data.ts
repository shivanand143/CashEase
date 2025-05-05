
import type { Store, Coupon, CashbackType } from '@/lib/types';
import { collection, writeBatch, serverTimestamp, doc, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { toast } from '@/hooks/use-toast'; // Assuming useToast works in this context

// --- Seed Data Definitions ---

const storesData: Omit<Store, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { name: 'Amazon IN', logoUrl: 'https://picsum.photos/seed/amazonin/100/50', cashbackRate: 'Up to 5% Rewards', dataAiHint: "amazon india logo", affiliateLink: 'https://amazon.in?tag=cashease-21', description: 'Wide range of products.', categories: ['Electronics', 'Fashion', 'Home', 'Books', 'Grocery'], isFeatured: true, cashbackType: 'percentage', cashbackRateValue: 5, terms: 'Cashback varies by category.' },
  { name: 'Flipkart', logoUrl: 'https://picsum.photos/seed/flipkart/100/50', cashbackRate: 'Up to 4.5% Rewards', dataAiHint: "flipkart logo", affiliateLink: 'https://flipkart.com?affid=cashease', description: 'Leading Indian e-commerce.', categories: ['Electronics', 'Fashion', 'Home', 'Mobiles'], isFeatured: true, cashbackType: 'percentage', cashbackRateValue: 4.5 },
  { name: 'Myntra', logoUrl: 'https://picsum.photos/seed/myntra/100/50', cashbackRate: 'Flat 6% Cashback', dataAiHint: "myntra logo", affiliateLink: 'https://myntra.com?ref=cashease', description: 'Fashion and lifestyle.', categories: ['Fashion', 'Accessories', 'Beauty'], isFeatured: true, cashbackType: 'percentage', cashbackRateValue: 6 },
  { name: 'Ajio', logoUrl: 'https://picsum.photos/seed/ajio/100/50', cashbackRate: 'Up to 8% Cashback', dataAiHint: "ajio logo", affiliateLink: 'https://ajio.com?cjevent=cashease', description: 'Curated fashion brands.', categories: ['Fashion', 'Accessories'], isFeatured: false, cashbackType: 'percentage', cashbackRateValue: 8 },
  { name: 'MakeMyTrip', logoUrl: 'https://picsum.photos/seed/makemytrip/100/50', cashbackRate: 'Up to ₹1500 on Flights', dataAiHint: "makemytrip logo", affiliateLink: 'https://makemytrip.com?partner=cashease', description: 'Book flights, hotels.', categories: ['Travel', 'Flights', 'Hotels'], isFeatured: true, cashbackType: 'fixed', cashbackRateValue: 1500 },
  { name: 'Nykaa', logoUrl: 'https://picsum.photos/seed/nykaa/100/50', cashbackRate: 'Up to 7% Cashback', dataAiHint: "nykaa logo", affiliateLink: 'https://nykaa.com?partner=cashease', description: 'Beauty, makeup, wellness.', categories: ['Beauty', 'Cosmetics', 'Skincare'], isFeatured: true, cashbackType: 'percentage', cashbackRateValue: 7 },
];

const couponsData: { storeName: string; data: Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'storeId'> }[] = [
  { storeName: 'Myntra', data: { code: 'MYNTRA200', description: '₹200 Off on Orders Above ₹1499', link: null, expiryDate: null, isFeatured: true, isActive: true } },
  { storeName: 'Amazon IN', data: { code: 'AMZSAVE10', description: '10% off Select Electronics (Max ₹500)', link: null, expiryDate: null, isFeatured: true, isActive: true } },
  { storeName: 'Ajio', data: { code: null, description: 'Flat 50-80% Off Top Brands', link: 'https://ajio.com/shop/sale', expiryDate: null, isFeatured: true, isActive: true } },
  { storeName: 'Flipkart', data: { code: 'FLIPFIRST', description: '₹100 Off First Order on App', link: null, expiryDate: null, isFeatured: false, isActive: true } },
  { storeName: 'MakeMyTrip', data: { code: 'FLYNOW', description: 'Flat ₹500 Off Domestic Flights', link: null, expiryDate: null, isFeatured: true, isActive: true } },
  { storeName: 'Nykaa', data: { code: 'NYKNEW15', description: '15% Off First Order', link: null, expiryDate: null, isFeatured: false, isActive: true } },
];

// --- Seeding Function ---

export async function seedDatabase() {
  if (!db) {
    console.error("Firestore DB is not initialized. Cannot seed data.");
    toast({ variant: "destructive", title: "Seeding Error", description: "Database not available." });
    return;
  }

  console.log("Starting database seeding process...");
  const batch = writeBatch(db);
  const storesCollection = collection(db, 'stores');
  const couponsCollection = collection(db, 'coupons');
  const storeNameToIdMap = new Map<string, string>();

  try {
    // 1. Seed Stores and build name-to-ID map
    console.log("Seeding stores...");
    let storeCount = 0;
    for (const storeData of storesData) {
      const storeDocRef = doc(storesCollection); // Auto-generate ID
      storeNameToIdMap.set(storeData.name, storeDocRef.id);
      batch.set(storeDocRef, {
        ...storeData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      storeCount++;
    }
    console.log(`Prepared ${storeCount} stores for batch write.`);

    // 2. Seed Coupons using the store ID map
    console.log("Seeding coupons...");
    let couponCount = 0;
    let skippedCoupons = 0;
    for (const { storeName, data: couponData } of couponsData) {
      const storeId = storeNameToIdMap.get(storeName);
      if (storeId) {
        const couponDocRef = doc(couponsCollection);
        batch.set(couponDocRef, {
          ...couponData,
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

    // 3. Commit the batch
    await batch.commit();
    console.log("Database seeding completed successfully.");
    toast({ title: "Seeding Complete", description: `${storeCount} stores and ${couponCount} coupons added.` });

  } catch (error) {
    console.error("Error during database seeding:", error);
    toast({ variant: "destructive", title: "Seeding Failed", description: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` });
  }
}

// Optional: Function to check if seeding is needed (e.g., check if stores collection is empty)
export async function needsSeeding(): Promise<boolean> {
   if (!db) return false; // Cannot check if DB is not available
   try {
       const storesRef = collection(db, "stores");
       const q = query(storesRef, limit(1));
       const snapshot = await getDocs(q);
       return snapshot.empty; // Needs seeding if the collection is empty
   } catch (error) {
       console.error("Error checking if seeding is needed:", error);
       return false; // Assume seeding is not needed if there's an error
   }
}
