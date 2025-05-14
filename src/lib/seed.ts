// src/lib/seed.ts
import { collection, doc, setDoc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, firebaseInitializationError } from './firebase/config'; // Adjust path as needed
import type { Store, Coupon, Category, Banner, UserProfile, Product } from './types'; // Adjust path as needed
import { v4 as uuidv4 } from 'uuid';

const INITIAL_ADMIN_UID = process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID || null;

const categoriesData: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { name: 'Fashion', slug: 'fashion', description: 'Latest trends in clothing and accessories.', order: 1, imageUrl: 'https://placehold.co/100x100.png', dataAiHint: "clothing fashion", isActive: true },
  { name: 'Electronics', slug: 'electronics', description: 'Gadgets, appliances, and more.', order: 2, imageUrl: 'https://placehold.co/100x100.png', dataAiHint: "gadgets electronics", isActive: true },
  { name: 'Travel', slug: 'travel', description: 'Flights, hotels, and holiday packages.', order: 3, imageUrl: 'https://placehold.co/100x100.png', dataAiHint: "vacation travel", isActive: true },
  { name: 'Beauty', slug: 'beauty', description: 'Skincare, makeup, and personal care.', order: 4, imageUrl: 'https://placehold.co/100x100.png', dataAiHint: "cosmetics makeup", isActive: true },
  { name: 'Home & Kitchen', slug: 'home-kitchen', description: 'Furniture, decor, and kitchenware.', order: 5, imageUrl: 'https://placehold.co/100x100.png', dataAiHint: "furniture kitchenware", isActive: true },
  { name: 'Groceries', slug: 'groceries', description: 'Daily essentials and pantry needs.', order: 6, imageUrl: 'https://placehold.co/100x100.png', dataAiHint: "food grocery", isActive: true },
  { name: 'Mobiles & Tablets', slug: 'mobiles-tablets', description: 'Latest smartphones and tablets.', order: 7, imageUrl: 'https://placehold.co/100x100.png', dataAiHint: "smartphone tablet", isActive: true },
];

const storesData: Omit<Store, 'id' | 'createdAt' | 'updatedAt'>[] = [
    { name: 'Amazon', slug: "amazon", logoUrl: 'https://placehold.co/120x60.png', heroImageUrl: 'https://placehold.co/1200x300.png', dataAiHint: 'amazon logo', affiliateLink: 'https://www.amazon.in/?tag=cashease-21', cashbackRate: 'Up to 7%', cashbackRateValue: 7, cashbackType: 'percentage', description: 'Wide range of products.', categories: ['electronics', 'fashion', 'home-kitchen'], isFeatured: true, isActive: true, terms: 'Cashback varies by category. Not valid on gift cards.' },
    { name: 'Flipkart', slug: "flipkart", logoUrl: 'https://placehold.co/120x60.png', heroImageUrl: 'https://placehold.co/1200x300.png', dataAiHint: 'flipkart logo', affiliateLink: 'https://www.flipkart.com/?affid=cashease', cashbackRate: 'Up to 6.5%', cashbackRateValue: 6.5, cashbackType: 'percentage', description: 'India\'s leading online store.', categories: ['electronics', 'fashion', 'mobiles-tablets'], isFeatured: true, isActive: true, terms: 'Cashback rates differ for new/existing users. Check specific category rates.' },
    { name: 'Myntra', slug: "myntra", logoUrl: 'https://placehold.co/120x60.png', heroImageUrl: 'https://placehold.co/1200x300.png', dataAiHint: 'myntra fashion logo', affiliateLink: 'https://www.myntra.com/?ref=cashease', cashbackRate: 'Flat 8%', cashbackRateValue: 8, cashbackType: 'percentage', description: 'Top fashion destination.', categories: ['fashion', 'beauty'], isFeatured: true, isActive: true, terms: 'Cashback applicable on app and web.' },
    { name: 'Ajio', slug: "ajio", logoUrl: 'https://placehold.co/120x60.png', heroImageUrl: 'https://placehold.co/1200x300.png', dataAiHint: 'ajio fashion logo', affiliateLink: 'https://www.ajio.com/?partner=cashease', cashbackRate: 'Flat ₹150', cashbackRateValue: 150, cashbackType: 'fixed', description: 'Curated fashion brands.', categories: ['fashion'], isFeatured: false, isActive: true },
    { name: 'MakeMyTrip', slug: "makemytrip", logoUrl: 'https://placehold.co/120x60.png', heroImageUrl: 'https://placehold.co/1200x300.png', dataAiHint: 'makemytrip travel logo', affiliateLink: 'https://www.makemytrip.com/?source=cashease', cashbackRate: 'Up to ₹500', cashbackRateValue: 500, cashbackType: 'fixed', description: 'Flights, hotels, and holidays.', categories: ['travel'], isFeatured: true, isActive: true, terms: 'Cashback amount varies based on booking type.' },
];

// Use store slugs as IDs for coupons if slugs are defined, otherwise use a placeholder/index
const couponsData: Omit<Coupon, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { storeId: 'amazon', code: 'AMZDEAL10', description: 'Extra 10% off select Amazon Fashion.', link: null, expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), isFeatured: true, isActive: true },
  { storeId: 'flipkart', code: 'FLIPNEW5', description: '5% off for new Flipkart users on first order.', link: null, expiryDate: null, isFeatured: true, isActive: true },
  { storeId: 'myntra', code: null, description: 'Myntra End of Reason Sale - Up to 70% Off', link: 'https://www.myntra.com/sale', expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), isFeatured: true, isActive: true },
  { storeId: 'ajio', code: 'AJIOFREESHIP', description: 'Free Shipping on orders above ₹999.', link: null, expiryDate: null, isFeatured: false, isActive: true },
  { storeId: 'makemytrip', code: null, description: 'MakeMyTrip Domestic Flight Offer - Flat ₹1000 Off', link: 'https://www.makemytrip.com/flights/', expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), isFeatured: false, isActive: true },
];

const bannersData: Omit<Banner, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { title: 'Mega Electronics Sale', subtitle: 'Up to 50% off + Extra 5% Cashback', imageUrl: 'https://placehold.co/1200x400.png', dataAiHint: 'electronics sale', link: '/category/electronics', altText: 'Electronics Sale Banner', order: 1, isActive: true },
  { title: 'Fashion Frenzy', subtitle: 'Get 60% off on top brands', imageUrl: 'https://placehold.co/1200x400.png', dataAiHint: 'fashion clothing sale', link: '/category/fashion', altText: 'Fashion Sale Banner', order: 2, isActive: true },
  { title: 'Travel Deals', subtitle: 'Book flights and hotels with exclusive offers', imageUrl: 'https://placehold.co/1200x400.png', dataAiHint: 'travel holiday vacation', link: '/category/travel', altText: 'Travel Deals Banner', order: 3, isActive: true },
];

const productsData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { storeId: 'amazon', name: 'Echo Dot (4th Gen)', description: 'Smart speaker with Alexa.', imageUrl: 'https://placehold.co/300x300.png', dataAiHint: 'smart speaker', affiliateLink: 'https://www.amazon.in/dp/B084DWX1PV?tag=cashease-21', price: 3499, priceDisplay: '₹3,499', category: 'electronics', brand: 'Amazon', isActive: true, isFeatured: true, isTodaysPick: true },
  { storeId: 'amazon', name: 'OnePlus Nord CE 3 Lite 5G', description: 'Mid-range smartphone with great features.', imageUrl: 'https://placehold.co/300x300.png', dataAiHint: 'smartphone mobile', affiliateLink: 'https://www.amazon.in/dp/B0BY8MCQ9S?tag=cashease-21', price: 19999, priceDisplay: '₹19,999', category: 'mobiles-tablets', brand: 'OnePlus', isActive: true, isFeatured: true, isTodaysPick: true },
  { storeId: 'flipkart', name: 'Noise ColorFit Pulse Go Buzz', description: 'Smartwatch with call function.', imageUrl: 'https://placehold.co/300x300.png', dataAiHint: 'smartwatch wearable', affiliateLink: 'https://www.flipkart.com/noise-colorfit-pulse-go-buzz-1-69-display-bluetooth-calling-smartwatch/p/itm440b4f0b67309?pid=SMWGHRFHMZKMSYVQ&affid=cashease', price: 1799, priceDisplay: '₹1,799', category: 'electronics', brand: 'Noise', isActive: true, isFeatured: false, isTodaysPick: false },
  { storeId: 'myntra', name: 'Roadster Men T-Shirt', description: 'Comfortable cotton t-shirt.', imageUrl: 'https://placehold.co/300x300.png', dataAiHint: 'men clothing t-shirt', affiliateLink: 'https://www.myntra.com/tshirts/roadster/roadster-men-navy-blue-printed-round-neck-t-shirt/10340099/buy?ref=cashease', price: 499, priceDisplay: '₹499', category: 'fashion', brand: 'Roadster', isActive: true, isFeatured: true, isTodaysPick: false },
];


export async function seedDatabase() {
  if (!db || firebaseInitializationError) {
    console.error(`Firestore database is not initialized. Seeding cannot proceed. Error: ${firebaseInitializationError}`);
    return;
  }

  console.log("Starting database seeding...");
  const batch = writeBatch(db);
  let writeCount = 0;

  // Seed Categories
  console.log("Seeding categories...");
  for (const category of categoriesData) {
    const categoryRef = doc(db, 'categories', category.slug);
    const docSnap = await getDoc(categoryRef);
    if (!docSnap.exists()) {
      batch.set(categoryRef, {
        ...category,
        isActive: category.isActive === undefined ? true : category.isActive, // Default to true if not specified
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      writeCount++;
      console.log(`  - Added category: ${category.name}`);
    } else {
      console.log(`  - Category already exists: ${category.name}`);
    }
  }

  // Seed Stores
  console.log("Seeding stores...");
  for (const store of storesData) {
    const storeId = store.slug || uuidv4(); // Use slug as ID if available, otherwise generate UUID
    const storeRef = doc(db, 'stores', storeId);
    const docSnap = await getDoc(storeRef);
    if (!docSnap.exists()) {
      batch.set(storeRef, {
        ...store,
        id: storeId, // Ensure ID is consistent if using slug
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      writeCount++;
      console.log(`  - Added store: ${store.name} (ID: ${storeId})`);
    } else {
      console.log(`  - Store already exists: ${store.name} (ID: ${storeId})`);
    }
  }


  // Seed Coupons
  console.log("Seeding coupons...");
  for (const coupon of couponsData) {
    const couponRef = doc(collection(db, 'coupons'));
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
    const bannerRef = doc(collection(db, 'banners'));
    batch.set(bannerRef, {
      ...banner,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    writeCount++;
    console.log(`  - Added banner: ${banner.title || 'Untitled Banner'}`);
  }

  // Seed Products
  console.log("Seeding products...");
  for (const product of productsData) {
    const productRef = doc(collection(db, 'products'));
    batch.set(productRef, {
      ...product,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    writeCount++;
    console.log(`  - Added product: ${product.name}`);
  }


   // Seed Initial Admin User
   if (INITIAL_ADMIN_UID) {
     console.log(`Checking for initial admin user (UID: ${INITIAL_ADMIN_UID})...`);
     const adminUserRef = doc(db, 'users', INITIAL_ADMIN_UID);
     const adminDocSnap = await getDoc(adminUserRef);

     if (!adminDocSnap.exists()) {
       const adminProfile: Omit<UserProfile, 'createdAt' | 'updatedAt'> = {
         uid: INITIAL_ADMIN_UID,
         email: `admin_${INITIAL_ADMIN_UID.substring(0,5)}@cashease.example.com`,
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
       if (adminDocSnap.data()?.role !== 'admin') {
          console.log("  - Updating existing user to admin role.");
          batch.update(adminUserRef, { role: 'admin', updatedAt: serverTimestamp() });
          writeCount++;
       }
     }
   } else {
     console.log("Initial admin UID not set (NEXT_PUBLIC_INITIAL_ADMIN_UID). Skipping admin user seeding.");
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
    console.log("No new data to seed (all items likely exist already).");
  }

  console.log("Database seeding finished.");
}

// Ensure you have a way to call this function when needed.
// For example, you might have a script in your package.json:
// "seed": "ts-node src/lib/seed.ts"
// And then run `npm run seed` or `yarn seed`.
//
// Automatically running on server start is usually not recommended for seeding
// unless handled very carefully to prevent re-seeding on every hot reload.

// Example of how to potentially run this
// (Typically you wouldn't call this directly in the module like this for a Next.js app,
// but rather via a script or a specific admin action)
//
// async function main() {
//   await seedDatabase();
// }
// main().catch(console.error);
