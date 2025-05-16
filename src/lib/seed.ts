
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
  { name: 'Books', slug: 'books', description: 'Bestsellers and new releases.', order: 8, imageUrl: 'https://placehold.co/100x100.png', dataAiHint: "reading books", isActive: true },
  { name: 'Sports & Outdoors', slug: 'sports-outdoors', description: 'Equipment and gear for all activities.', order: 9, imageUrl: 'https://placehold.co/100x100.png', dataAiHint: "sports equipment", isActive: true },
  { name: 'Kids & Toys', slug: 'kids-toys', description: 'Fun and educational toys for children.', order: 10, imageUrl: 'https://placehold.co/100x100.png', dataAiHint: "children toys", isActive: true },
  { name: 'Health & Wellness', slug: 'health-wellness', description: 'Vitamins, supplements, and healthcare products.', order: 11, imageUrl: 'https://placehold.co/100x100.png', dataAiHint: "health fitness", isActive: true },
  { name: 'Gifts & Flowers', slug: 'gifts-flowers', description: 'Perfect gifts for any occasion.', order: 12, imageUrl: 'https://placehold.co/100x100.png', dataAiHint: "gifts flowers", isActive: true },
];

const storesData: Omit<Store, 'id' | 'createdAt' | 'updatedAt'>[] = [
    { name: 'Amazon', slug: "amazon", logoUrl: 'https://placehold.co/120x60.png', heroImageUrl: 'https://placehold.co/1200x300.png', dataAiHint: 'amazon logo', affiliateLink: 'https://www.amazon.in/?tag=cashease-21', cashbackRate: 'Up to 7%', cashbackRateValue: 7, cashbackType: 'percentage', description: 'Wide range of products.', categories: ['electronics', 'fashion', 'home-kitchen', 'books'], isFeatured: true, isActive: true, terms: 'Cashback varies by category. Not valid on gift cards.' },
    { name: 'Flipkart', slug: "flipkart", logoUrl: 'https://placehold.co/120x60.png', heroImageUrl: 'https://placehold.co/1200x300.png', dataAiHint: 'flipkart logo', affiliateLink: 'https://www.flipkart.com/?affid=cashease', cashbackRate: 'Up to 6.5%', cashbackRateValue: 6.5, cashbackType: 'percentage', description: 'India\'s leading online store.', categories: ['electronics', 'fashion', 'mobiles-tablets', 'home-kitchen'], isFeatured: true, isActive: true, terms: 'Cashback rates differ for new/existing users. Check specific category rates.' },
    { name: 'Myntra', slug: "myntra", logoUrl: 'https://placehold.co/120x60.png', heroImageUrl: 'https://placehold.co/1200x300.png', dataAiHint: 'myntra fashion logo', affiliateLink: 'https://www.myntra.com/?ref=cashease', cashbackRate: 'Flat 8%', cashbackRateValue: 8, cashbackType: 'percentage', description: 'Top fashion destination.', categories: ['fashion', 'beauty'], isFeatured: true, isActive: true, terms: 'Cashback applicable on app and web.' },
    { name: 'Ajio', slug: "ajio", logoUrl: 'https://placehold.co/120x60.png', heroImageUrl: 'https://placehold.co/1200x300.png', dataAiHint: 'ajio fashion logo', affiliateLink: 'https://www.ajio.com/?partner=cashease', cashbackRate: 'Flat ₹150', cashbackRateValue: 150, cashbackType: 'fixed', description: 'Curated fashion brands.', categories: ['fashion'], isFeatured: false, isActive: true, isTodaysDeal: true },
    { name: 'MakeMyTrip', slug: "makemytrip", logoUrl: 'https://placehold.co/120x60.png', heroImageUrl: 'https://placehold.co/1200x300.png', dataAiHint: 'makemytrip travel logo', affiliateLink: 'https://www.makemytrip.com/?source=cashease', cashbackRate: 'Up to ₹500', cashbackRateValue: 500, cashbackType: 'fixed', description: 'Flights, hotels, and holidays.', categories: ['travel'], isFeatured: true, isActive: true },
    { name: 'Nykaa', slug: 'nykaa', logoUrl: 'https://placehold.co/120x60.png', heroImageUrl: 'https://placehold.co/1200x300.png', dataAiHint: 'nykaa beauty logo', affiliateLink: 'https://www.nykaa.com/?ptype=custom&pname=cashease', cashbackRate: '5% Cashback', cashbackRateValue: 5, cashbackType: 'percentage', description: 'Online beauty and wellness destination.', categories: ['beauty', 'health-wellness'], isFeatured: true, isActive: true, terms: 'Cashback on select brands only.' },
    { name: 'BigBasket', slug: 'bigbasket', logoUrl: 'https://placehold.co/120x60.png', heroImageUrl: 'https://placehold.co/1200x300.png', dataAiHint: 'bigbasket grocery logo', affiliateLink: 'https://www.bigbasket.com/?utm_source=cashease', cashbackRate: 'Flat ₹100 on First Order', cashbackRateValue: 100, cashbackType: 'fixed', description: 'Online grocery supermarket.', categories: ['groceries'], isFeatured: false, isActive: true, isTodaysDeal: false },
];

const couponsData: Omit<Coupon, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { storeId: 'amazon', code: 'AMZDEAL10', description: 'Extra 10% off select Amazon Fashion.', link: null, expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), isFeatured: true, isActive: true },
  { storeId: 'flipkart', code: 'FLIPNEW5', description: '5% off for new Flipkart users on first order.', link: null, expiryDate: null, isFeatured: true, isActive: true },
  { storeId: 'myntra', code: null, description: 'Myntra End of Reason Sale - Up to 70% Off', link: 'https://www.myntra.com/sale?ref=cashease', expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), isFeatured: true, isActive: true },
  { storeId: 'ajio', code: 'AJIOFREESHIP', description: 'Free Shipping on orders above ₹999.', link: null, expiryDate: null, isFeatured: false, isActive: true },
  { storeId: 'makemytrip', code: null, description: 'MakeMyTrip Domestic Flight Offer - Flat ₹1000 Off', link: 'https://www.makemytrip.com/flights/?source=cashease', expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), isFeatured: false, isActive: true },
  { storeId: 'nykaa', code: 'NYKBEAUTY15', description: '15% Off on Nykaa Naturals.', link: null, expiryDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000), isFeatured: true, isActive: true },
  { storeId: 'bigbasket', code: 'BBFRESH', description: 'Get ₹50 off on fruits and vegetables.', link: null, expiryDate: null, isFeatured: false, isActive: true },
];

const bannersData: Omit<Banner, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { title: 'Mega Electronics Sale', subtitle: 'Up to 50% off + Extra 5% Cashback', imageUrl: 'https://placehold.co/1200x400.png?text=Electronics+Sale', dataAiHint: 'electronics sale', link: '/category/electronics', altText: 'Electronics Sale Banner', order: 1, isActive: true },
  { title: 'Fashion Frenzy', subtitle: 'Get 60% off on top brands', imageUrl: 'https://placehold.co/1200x400.png?text=Fashion+Frenzy', dataAiHint: 'fashion clothing sale', link: '/category/fashion', altText: 'Fashion Sale Banner', order: 2, isActive: true },
  { title: 'Travel Deals', subtitle: 'Book flights and hotels with exclusive offers', imageUrl: 'https://placehold.co/1200x400.png?text=Travel+Deals', dataAiHint: 'travel holiday vacation', link: '/category/travel', altText: 'Travel Deals Banner', order: 3, isActive: true },
  { title: 'Beauty Bonanza', subtitle: 'Flat 20% off on makeup essentials', imageUrl: 'https://placehold.co/1200x400.png?text=Beauty+Bonanza', dataAiHint: 'makeup cosmetics sale', link: '/category/beauty', altText: 'Beauty Bonanza Banner', order: 4, isActive: true },
];

const productsData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { storeId: 'amazon', name: 'Echo Dot (4th Gen)', description: 'Smart speaker with Alexa.', imageUrl: 'https://placehold.co/300x300.png?text=Echo+Dot', dataAiHint: 'smart speaker', affiliateLink: 'https://www.amazon.in/dp/B084DWX1PV?tag=cashease-21', price: 3499, priceDisplay: '₹3,499', category: 'electronics', brand: 'Amazon', isActive: true, isFeatured: true, isTodaysPick: true },
  { storeId: 'amazon', name: 'OnePlus Nord CE 3 Lite 5G', description: 'Mid-range smartphone with great features.', imageUrl: 'https://placehold.co/300x300.png?text=OnePlus+Nord', dataAiHint: 'smartphone mobile', affiliateLink: 'https://www.amazon.in/dp/B0BY8MCQ9S?tag=cashease-21', price: 19999, priceDisplay: '₹19,999', category: 'mobiles-tablets', brand: 'OnePlus', isActive: true, isFeatured: true, isTodaysPick: true },
  { storeId: 'flipkart', name: 'Noise ColorFit Pulse Go Buzz Smartwatch', description: 'Smartwatch with call function and vibrant display.', imageUrl: 'https://placehold.co/300x300.png?text=Noise+Watch', dataAiHint: 'smartwatch wearable', affiliateLink: 'https://www.flipkart.com/noise-colorfit-pulse-go-buzz-1-69-display-bluetooth-calling-smartwatch/p/itm440b4f0b67309?pid=SMWGHRFHMZKMSYVQ&affid=cashease', price: 1799, priceDisplay: '₹1,799', category: 'electronics', brand: 'Noise', isActive: true, isFeatured: false, isTodaysPick: true },
  { storeId: 'myntra', name: 'Roadster Men Graphic Print T-Shirt', description: 'Comfortable cotton t-shirt with a stylish print.', imageUrl: 'https://placehold.co/300x300.png?text=Roadster+Tshirt', dataAiHint: 'men clothing t-shirt', affiliateLink: 'https://www.myntra.com/tshirts/roadster/roadster-men-navy-blue-printed-round-neck-t-shirt/10340099/buy?ref=cashease', price: 499, priceDisplay: '₹499', category: 'fashion', brand: 'Roadster', isActive: true, isFeatured: true, isTodaysPick: false },
  { storeId: 'ajio', name: 'DNMX Solid Slim Fit Jeans', description: 'Trendy slim fit jeans for men.', imageUrl: 'https://placehold.co/300x300.png?text=DNMX+Jeans', dataAiHint: 'men jeans denim', affiliateLink: 'https://www.ajio.com/dnmx-men-solid-slim-fit-jeans/p/4690DNMXMJEANS981?partner=cashease', price: 899, priceDisplay: '₹899', category: 'fashion', brand: 'DNMX', isActive: true, isFeatured: true, isTodaysPick: true },
  { storeId: 'nykaa', name: 'Maybelline New York Colossal Kajal', description: 'Smudge-proof and long-lasting kajal.', imageUrl: 'https://placehold.co/300x300.png?text=Maybelline+Kajal', dataAiHint: 'kajal eyeliner makeup', affiliateLink: 'https://www.nykaa.com/maybelline-new-york-colossal-kajal-24hr/p/20023?ptype=custom&pname=cashease', price: 180, priceDisplay: '₹180', category: 'beauty', brand: 'Maybelline', isActive: true, isFeatured: true, isTodaysPick: false },
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
    const categoryRef = doc(db, 'categories', category.slug); // Use slug as ID
    const docSnap = await getDoc(categoryRef);
    if (!docSnap.exists()) {
      batch.set(categoryRef, {
        ...category,
        isActive: category.isActive === undefined ? true : category.isActive,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      writeCount++;
      console.log(`  - Added category: ${category.name} (ID: ${category.slug})`);
    } else {
      console.log(`  - Category already exists: ${category.name} (ID: ${category.slug})`);
    }
  }

  // Seed Stores
  console.log("Seeding stores...");
  for (const store of storesData) {
    const storeId = store.slug || uuidv4();
    const storeRef = doc(db, 'stores', storeId);
    const docSnap = await getDoc(storeRef);
    if (!docSnap.exists()) {
      batch.set(storeRef, {
        ...store,
        id: storeId, // Ensure ID is consistent
        isFeatured: store.isFeatured === undefined ? false : store.isFeatured,
        isTodaysDeal: store.isTodaysDeal === undefined ? false : store.isTodaysDeal,
        isActive: store.isActive === undefined ? true : store.isActive,
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
      isFeatured: coupon.isFeatured === undefined ? false : coupon.isFeatured,
      isActive: coupon.isActive === undefined ? true : coupon.isActive,
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
      isActive: banner.isActive === undefined ? true : banner.isActive,
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
      isFeatured: product.isFeatured === undefined ? false : product.isFeatured,
      isTodaysPick: product.isTodaysPick === undefined ? false : product.isTodaysPick,
      isActive: product.isActive === undefined ? true : product.isActive,
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
       const adminProfile: Omit<UserProfile, 'id'|'createdAt' | 'updatedAt'> = { // id is not part of UserProfile
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
    console.log("No new data to seed (all items likely exist already or no changes made).");
  }

  console.log("Database seeding finished.");
}
// If running this file directly (e.g., `ts-node src/lib/seed.ts`)
if (require.main === module) {
  seedDatabase().catch(console.error);
}
