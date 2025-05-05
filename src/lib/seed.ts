// src/lib/seed.ts
import { collection, doc, setDoc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebase/config'; // Adjust path as needed
import type { Store, Coupon, Category, Banner, UserProfile } from './types'; // Adjust path as needed
import { v4 as uuidv4 } from 'uuid';

const INITIAL_ADMIN_UID = process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID || null;

const categoriesData: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { name: 'Fashion', slug: 'fashion', description: 'Latest trends in clothing and accessories.', order: 1, imageUrl: 'https://picsum.photos/seed/fashioncat/100/100' },
  { name: 'Electronics', slug: 'electronics', description: 'Gadgets, appliances, and more.', order: 2, imageUrl: 'https://picsum.photos/seed/electronicscat/100/100' },
  { name: 'Travel', slug: 'travel', description: 'Flights, hotels, and holiday packages.', order: 3, imageUrl: 'https://picsum.photos/seed/travelcat/100/100' },
  { name: 'Beauty', slug: 'beauty', description: 'Skincare, makeup, and personal care.', order: 4, imageUrl: 'https://picsum.photos/seed/beautycat/100/100' },
  { name: 'Home & Kitchen', slug: 'home-kitchen', description: 'Furniture, decor, and kitchenware.', order: 5, imageUrl: 'https://picsum.photos/seed/homecat/100/100' },
  { name: 'Groceries', slug: 'groceries', description: 'Daily essentials and pantry needs.', order: 6, imageUrl: 'https://picsum.photos/seed/grocerycat/100/100' },
  { name: 'Mobiles & Tablets', slug: 'mobiles-tablets', description: 'Latest smartphones and tablets.', order: 7, imageUrl: 'https://picsum.photos/seed/mobilecat/100/100' },
];

const storesData: Omit<Store, 'id' | 'createdAt' | 'updatedAt'>[] = [
    { name: 'Amazon', logoUrl: 'https://picsum.photos/seed/amazonlogo/120/60', affiliateLink: 'https://www.amazon.in/?tag=cashease-21', cashbackRate: 'Up to 7%', cashbackRateValue: 7, cashbackType: 'percentage', description: 'Wide range of products.', categories: ['electronics', 'fashion', 'home-kitchen', 'books'], isFeatured: true, isActive: true, terms: 'Cashback varies by category. Not valid on gift cards.', dataAiHint: 'amazon logo' },
    { name: 'Flipkart', logoUrl: 'https://picsum.photos/seed/flipkartlogo/120/60', affiliateLink: 'https://www.flipkart.com/?affid=cashease', cashbackRate: 'Up to 6.5%', cashbackRateValue: 6.5, cashbackType: 'percentage', description: 'India\'s leading online store.', categories: ['electronics', 'fashion', 'mobiles-tablets', 'home-kitchen'], isFeatured: true, isActive: true, terms: 'Cashback rates differ for new/existing users. Check specific category rates.', dataAiHint: 'flipkart logo' },
    { name: 'Myntra', logoUrl: 'https://picsum.photos/seed/myntralogo/120/60', affiliateLink: 'https://www.myntra.com/?ref=cashease', cashbackRate: 'Flat 8%', cashbackRateValue: 8, cashbackType: 'percentage', description: 'Top fashion destination.', categories: ['fashion', 'beauty'], isFeatured: true, isActive: true, terms: 'Cashback applicable on app and web.', dataAiHint: 'myntra fashion logo' },
    { name: 'Ajio', logoUrl: 'https://picsum.photos/seed/ajiologo/120/60', affiliateLink: 'https://www.ajio.com/?partner=cashease', cashbackRate: 'Flat ₹150', cashbackRateValue: 150, cashbackType: 'fixed', description: 'Curated fashion brands.', categories: ['fashion'], isFeatured: false, isActive: true, dataAiHint: 'ajio fashion logo' },
    { name: 'MakeMyTrip', logoUrl: 'https://picsum.photos/seed/mmtlogo/120/60', affiliateLink: 'https://www.makemytrip.com/?source=cashease', cashbackRate: 'Up to ₹500', cashbackRateValue: 500, cashbackType: 'fixed', description: 'Flights, hotels, and holidays.', categories: ['travel'], isFeatured: true, isActive: true, terms: 'Cashback amount varies based on booking type (flight/hotel/domestic/international).', dataAiHint: 'makemytrip travel logo' },
];

// Generate store IDs explicitly for coupon linking
const storeIds = storesData.map(() => uuidv4()); // Generate unique IDs

const couponsData: Omit<Coupon, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { storeId: storeIds[0], code: 'AMZDEAL10', description: 'Extra 10% off select Amazon Fashion.', link: null, expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), isFeatured: true, isActive: true }, // Expires in 30 days
  { storeId: storeIds[1], code: 'FLIPNEW5', description: '5% off for new Flipkart users on first order.', link: null, expiryDate: null, isFeatured: true, isActive: true },
  { storeId: storeIds[2], code: null, description: 'Myntra End of Reason Sale - Up to 70% Off', link: 'https://www.myntra.com/sale', expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), isFeatured: true, isActive: true }, // Expires in 7 days
  { storeId: storeIds[3], code: 'AJIOFREESHIP', description: 'Free Shipping on orders above ₹999.', link: null, expiryDate: null, isFeatured: false, isActive: true },
  { storeId: storeIds[4], code: null, description: 'MakeMyTrip Domestic Flight Offer - Flat ₹1000 Off', link: 'https://www.makemytrip.com/flights/', expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), isFeatured: false, isActive: true }, // Expires in 15 days
];

const bannersData: Omit<Banner, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { title: 'Mega Electronics Sale', subtitle: 'Up to 50% off + Extra 5% Cashback', imageUrl: 'https://picsum.photos/seed/electronicsbanner/1200/400', link: '/category/electronics', altText: 'Electronics Sale Banner', order: 1, isActive: true, dataAiHint: 'electronics sale banner' },
  { title: 'Fashion Frenzy', subtitle: 'Get 60% off on top brands', imageUrl: 'https://picsum.photos/seed/fashionbanner/1200/400', link: '/category/fashion', altText: 'Fashion Sale Banner', order: 2, isActive: true, dataAiHint: 'fashion clothing sale banner' },
  { title: 'Travel Deals', subtitle: 'Book flights and hotels with exclusive offers', imageUrl: 'https://picsum.photos/seed/travelbanner/1200/400', link: '/category/travel', altText: 'Travel Deals Banner', order: 3, isActive: true, dataAiHint: 'travel holiday vacation banner' },
];


export async function seedDatabase() {
  if (!db) {
    console.error("Firestore database is not initialized. Seeding cannot proceed.");
    return;
  }

  console.log("Starting database seeding...");
  const batch = writeBatch(db);
  let writeCount = 0;

  // Seed Categories
  console.log("Seeding categories...");
  for (const category of categoriesData) {
    const categoryRef = doc(db, 'categories', category.slug); // Use slug as ID
    const docSnap = await getDoc(categoryRef);
    if (!docSnap.exists()) {
      batch.set(categoryRef, {
        ...category,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      writeCount++;
      console.log(`  - Added category: ${category.name}`);
    } else {
      console.log(`  - Category already exists: ${category.name}`);
    }
  }

  // Seed Stores (using generated UUIDs)
  console.log("Seeding stores...");
  for (let i = 0; i < storesData.length; i++) {
      const storeId = storeIds[i];
      const store = storesData[i];
      const storeRef = doc(db, 'stores', storeId);
      const docSnap = await getDoc(storeRef); // Check if ID already exists (unlikely with UUID but good practice)
      if (!docSnap.exists()) {
        batch.set(storeRef, {
          ...store,
          id: storeId, // Add the generated ID to the document data if needed elsewhere
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        writeCount++;
        console.log(`  - Added store: ${store.name} (ID: ${storeId})`);
      } else {
        console.log(`  - Store already exists (by ID): ${store.name}`);
      }
  }


  // Seed Coupons
  console.log("Seeding coupons...");
  for (const coupon of couponsData) {
    // Check if the referenced storeId is valid before adding coupon
    if (!storeIds.includes(coupon.storeId)) {
        console.warn(`  - Skipping coupon "${coupon.description}" due to invalid storeId: ${coupon.storeId}`);
        continue;
    }
    const couponRef = doc(collection(db, 'coupons')); // Auto-generate coupon ID
    batch.set(couponRef, {
      ...coupon,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    writeCount++;
    console.log(`  - Added coupon: ${coupon.description}`);
  }

  // Seed Banners
  console.log("Seeding banners...");
  for (const banner of bannersData) {
    const bannerRef = doc(collection(db, 'banners')); // Auto-generate banner ID
    batch.set(bannerRef, {
      ...banner,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    writeCount++;
    console.log(`  - Added banner: ${banner.title || 'Untitled Banner'}`);
  }

   // Seed Initial Admin User (if UID is configured and user doesn't exist)
   if (INITIAL_ADMIN_UID) {
     console.log(`Checking for initial admin user (UID: ${INITIAL_ADMIN_UID})...`);
     const adminUserRef = doc(db, 'users', INITIAL_ADMIN_UID);
     const adminDocSnap = await getDoc(adminUserRef);

     if (!adminDocSnap.exists()) {
       const adminProfile: Omit<UserProfile, 'createdAt' | 'updatedAt'> = {
         uid: INITIAL_ADMIN_UID,
         email: `admin_${INITIAL_ADMIN_UID.substring(0,5)}@cashease.example`, // Placeholder email
         displayName: 'CashEase Admin',
         photoURL: null,
         role: 'admin',
         cashbackBalance: 0,
         pendingCashback: 0,
         lifetimeCashback: 0,
         referralCode: uuidv4().substring(0, 8).toUpperCase(),
         referralCount: 0,
         referralBonusEarned: 0,
         referredBy: null,
         isDisabled: false,
         lastPayoutRequestAt: null,
         payoutDetails: null,
       };
       batch.set(adminUserRef, {
         ...adminProfile,
         createdAt: serverTimestamp(),
         updatedAt: serverTimestamp(),
       });
       writeCount++;
       console.log(`  - Added initial admin user profile (UID: ${INITIAL_ADMIN_UID})`);
     } else {
       console.log("  - Initial admin user profile already exists.");
       // Optional: Ensure existing user has admin role
       if (adminDocSnap.data()?.role !== 'admin') {
          console.log("  - Updating existing user to admin role.");
          batch.update(adminUserRef, { role: 'admin', updatedAt: serverTimestamp() });
          writeCount++; // Count as a write if updated
       }
     }
   } else {
     console.log("Initial admin UID not set, skipping admin user seeding.");
   }

  // Commit the batch
  if (writeCount > 0) {
    try {
      await batch.commit();
      console.log(`Successfully committed ${writeCount} writes to the database.`);
    } catch (error) {
      console.error("Error committing seed data batch:", error);
    }
  } else {
    console.log("No new data to seed.");
  }

  console.log("Database seeding finished.");
}

// // Example of how to potentially run this (e.g., via a script or admin action)
// seedDatabase().catch(console.error);
