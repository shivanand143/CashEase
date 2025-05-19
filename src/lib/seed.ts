
// src/lib/seed.ts
import { collection, doc, setDoc, getDoc, serverTimestamp, writeBatch, Timestamp, addDoc, increment, runTransaction } from 'firebase/firestore';
import { db, firebaseInitializationError } from './firebase/config';
import type { Store, Coupon, Category, Banner, UserProfile, Product, Click, Transaction } from './types';
import { v4 as uuidv4 } from 'uuid';

const INITIAL_ADMIN_UID = process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID || "testAdminUser123";
const EXAMPLE_USER_ID = "testUser123"; // A generic test user

const categoriesData: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { name: 'Fashion', slug: 'fashion', description: 'Latest trends in clothing and accessories.', order: 1, imageUrl: 'https://placehold.co/100x100/007bff/ffffff.png?text=Fashion', dataAiHint: "clothing fashion", isActive: true },
  { name: 'Electronics', slug: 'electronics', description: 'Gadgets, appliances, and more.', order: 2, imageUrl: 'https://placehold.co/100x100/28a745/ffffff.png?text=Electronics', dataAiHint: "gadgets electronics", isActive: true },
  { name: 'Travel', slug: 'travel', description: 'Flights, hotels, and holiday packages.', order: 3, imageUrl: 'https://placehold.co/100x100/ffc107/000000.png?text=Travel', dataAiHint: "vacation travel", isActive: true },
  { name: 'Beauty', slug: 'beauty', description: 'Skincare, makeup, and personal care.', order: 4, imageUrl: 'https://placehold.co/100x100/dc3545/ffffff.png?text=Beauty', dataAiHint: "cosmetics makeup", isActive: true },
  { name: 'Home & Kitchen', slug: 'home-kitchen', description: 'Furniture, decor, and kitchenware.', order: 5, imageUrl: 'https://placehold.co/100x100/17a2b8/ffffff.png?text=Home', dataAiHint: "furniture kitchen", isActive: true },
  { name: 'Groceries', slug: 'groceries', description: 'Daily essentials and pantry needs.', order: 6, imageUrl: 'https://placehold.co/100x100/6f42c1/ffffff.png?text=Grocery', dataAiHint: "food grocery", isActive: true },
  { name: 'Books & Media', slug: 'books-media', description: 'Books, movies, music, and games.', order: 7, imageUrl: 'https://placehold.co/100x100/fd7e14/ffffff.png?text=Books', dataAiHint: "books movies", isActive: true },
  { name: 'Health & Wellness', slug: 'health-wellness', description: 'Fitness equipment, supplements, and healthcare products.', order: 8, imageUrl: 'https://placehold.co/100x100/20c997/ffffff.png?text=Health', dataAiHint: "fitness health", isActive: true },
];

const storesData: Omit<Store, 'id' | 'createdAt' | 'updatedAt'>[] = [
    { name: 'Amazon', slug: "amazon", logoUrl: 'https://placehold.co/120x60/FF9900/000000.png?text=Amazon', heroImageUrl: 'https://placehold.co/1200x300/000000/ffffff.png?text=Amazon+Deals', dataAiHint: 'amazon logo', affiliateLink: 'https://www.amazon.in/?tag=magicsaver-21', cashbackRate: 'Up to 7%', cashbackRateValue: 7, cashbackType: 'percentage', description: 'Wide range of products.', categories: ['electronics', 'fashion', 'home-kitchen', 'books-media'], isFeatured: true, isActive: true, isTodaysDeal: true, terms: 'Cashback varies by category. Not valid on gift cards.' },
    { name: 'Flipkart', slug: "flipkart", logoUrl: 'https://placehold.co/120x60/2874F0/ffffff.png?text=Flipkart', heroImageUrl: 'https://placehold.co/1200x300/2874F0/ffffff.png?text=Flipkart+Offers', dataAiHint: 'flipkart logo', affiliateLink: 'https://www.flipkart.com/?affid=magicsaver', cashbackRate: 'Up to 6.5%', cashbackRateValue: 6.5, cashbackType: 'percentage', description: 'India\'s leading online store.', categories: ['electronics', 'fashion', 'home-kitchen', 'groceries'], isFeatured: true, isActive: true, isTodaysDeal: false, terms: 'Cashback rates differ for new/existing users.' },
    { name: 'Myntra', slug: "myntra", logoUrl: 'https://placehold.co/120x60/E84A5F/ffffff.png?text=Myntra', heroImageUrl: 'https://placehold.co/1200x300/E84A5F/ffffff.png?text=Myntra+Fashion', dataAiHint: 'myntra fashion', affiliateLink: 'https://www.myntra.com/?ref=magicsaver', cashbackRate: 'Flat 8%', cashbackRateValue: 8, cashbackType: 'percentage', description: 'Top fashion destination.', categories: ['fashion', 'beauty'], isFeatured: true, isActive: true, isTodaysDeal: true },
    { name: 'MakeMyTrip', slug: 'makemytrip', logoUrl: 'https://placehold.co/120x60/0066FF/ffffff.png?text=MMT', heroImageUrl: 'https://placehold.co/1200x300/0066FF/ffffff.png?text=Travel+Deals', dataAiHint: 'travel booking', affiliateLink: 'https://www.makemytrip.com/?cmp=magicsaver', cashbackRate: '₹500 Cashback', cashbackRateValue: 500, cashbackType: 'fixed', description: 'Flights, Hotels & Holidays.', categories: ['travel'], isFeatured: false, isActive: true, isTodaysDeal: false },
    { name: 'Nykaa', slug: 'nykaa', logoUrl: 'https://placehold.co/120x60/FC2779/ffffff.png?text=Nykaa', heroImageUrl: 'https://placehold.co/1200x300/FC2779/ffffff.png?text=Beauty+Sale', dataAiHint: 'beauty cosmetics', affiliateLink: 'https://www.nykaa.com/?utm_source=magicsaver', cashbackRate: 'Up to 5%', cashbackRateValue: 5, cashbackType: 'percentage', description: 'Beauty and cosmetics online.', categories: ['beauty'], isFeatured: true, isActive: true, isTodaysDeal: false },
];

const couponsData: Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'store'>[] = [
  { storeId: 'amazon', code: 'AMZDEAL10', description: 'Extra 10% off select Amazon Fashion items. Limited time offer!', link: null, expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), isFeatured: true, isActive: true },
  { storeId: 'flipkart', code: null, description: 'Flipkart Electronics Sale - Up to 80% Off on Mobiles, Laptops & more.', link: 'https://www.flipkart.com/electronics-sale?affid=magicsaver', expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), isFeatured: true, isActive: true },
  { storeId: 'myntra', code: 'MYNTRA200', description: 'Flat ₹200 off on minimum purchase of ₹1999 for new users.', link: null, expiryDate: null, isFeatured: false, isActive: true },
  { storeId: 'makemytrip', code: 'MMTFLY', description: 'Get ₹1000 off on domestic flights booked via MakeMyTrip.', link: 'https://www.makemytrip.com/flights?cmp=magicsaver', expiryDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), isFeatured: true, isActive: true },
  { storeId: 'nykaa', code: 'NYKBEAUTY15', description: 'Nykaa Beauty Bonanza: 15% off on selected skincare products.', link: null, expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), isFeatured: false, isActive: true },
];

const bannersData: Omit<Banner, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { title: 'Mega Electronics Sale', subtitle: 'Up to 50% off + Extra 5% Cashback via MagicSaver', imageUrl: 'https://placehold.co/1200x400/28a745/ffffff.png?text=Electronics+Sale', dataAiHint: 'electronics sale', link: '/category/electronics', altText: 'Electronics Sale Banner', order: 1, isActive: true },
  { title: 'Fashion Frenzy Fest', subtitle: 'Get 60-80% off on top fashion brands this season', imageUrl: 'https://placehold.co/1200x400/007bff/ffffff.png?text=Fashion+Fest', dataAiHint: 'fashion clothing', link: '/category/fashion', altText: 'Fashion Sale Banner', order: 2, isActive: true },
  { title: 'Travel More, Save More', subtitle: 'Exclusive flight and hotel deals with assured cashback', imageUrl: 'https://placehold.co/1200x400/ffc107/000000.png?text=Travel+Deals', dataAiHint: 'travel vacation', link: '/category/travel', altText: 'Travel Deals Banner', order: 3, isActive: true },
];

const productsData: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'storeName'>[] = [
  { storeId: 'amazon', name: 'Echo Dot (5th Gen, 2023 release) - Smart speaker with Alexa', description: 'Latest smart speaker with Alexa and improved sound quality. Control music, smart home devices, and more with your voice.', imageUrl: 'https://placehold.co/300x300/000000/ffffff.png?text=Echo+5', dataAiHint: 'smart speaker', affiliateLink: 'https://www.amazon.in/dp/B09B8X2SQL?tag=magicsaver-21', price: 4499, priceDisplay: '₹4,499', category: 'electronics', brand: 'Amazon', isActive: true, isFeatured: true, isTodaysPick: true },
  { storeId: 'flipkart', name: 'Samsung Galaxy F54 5G (Meteor Blue, 128 GB) (8 GB RAM)', description: 'Powerful 5G smartphone with 108MP camera, Super AMOLED+ display, and long battery life.', imageUrl: 'https://placehold.co/300x300/007bff/ffffff.png?text=Galaxy+F54', dataAiHint: 'samsung phone', affiliateLink: 'https://www.flipkart.com/samsung-galaxy-f54-5g/p/itm3f62bd8d719c7?pid=MOBGDR4BYTRG5JFA&affid=magicsaver', price: 22999, priceDisplay: '₹22,999', category: 'electronics', brand: 'Samsung', isActive: true, isFeatured: true, isTodaysPick: true },
  { storeId: 'myntra', name: 'PUMA Men Smash Vulc Casual Shoes - White', description: 'Stylish and comfortable sneakers from PUMA for everyday wear, classic white color.', imageUrl: 'https://placehold.co/300x300/e83e8c/ffffff.png?text=Puma+Shoes', dataAiHint: 'puma sneakers', affiliateLink: 'https://www.myntra.com/casual-shoes/puma/puma-men-smash-vulc-casual-shoes/1038100/buy?ref=magicsaver', price: 2499, priceDisplay: '₹2,499', category: 'fashion', brand: 'Puma', isActive: true, isFeatured: false, isTodaysPick: false },
  { storeId: 'amazon', name: 'OnePlus Nord CE 3 Lite 5G (Pastel Lime, 8GB RAM, 128GB Storage)', description: 'Affordable 5G smartphone with a smooth display and fast charging.', imageUrl: 'https://placehold.co/300x300/90EE90/000000.png?text=Nord+CE3', dataAiHint: 'oneplus phone', affiliateLink: 'https://www.amazon.in/dp/B0BZCRMW9S?tag=magicsaver-21', price: 19999, priceDisplay: '₹19,999', category: 'electronics', brand: 'OnePlus', isActive: true, isFeatured: true, isTodaysPick: false },
  { storeId: 'nykaa', name: 'Lakme Absolute Perfect Radiance Skin Brightening Day Creme', description: 'Lightweight day cream for a radiant glow and sun protection.', imageUrl: 'https://placehold.co/300x300/FC2779/ffffff.png?text=Lakme+Creme', dataAiHint: 'lakme cream', affiliateLink: 'https://www.nykaa.com/lakme-absolute-perfect-radiance-skin-lightening-day-creme/p/27594?utm_source=magicsaver', price: 350, priceDisplay: '₹350', category: 'beauty', brand: 'Lakme', isActive: true, isFeatured: true, isTodaysPick: true },
];


const clicksData: Omit<Click, 'id' | 'timestamp'>[] = [
    { userId: EXAMPLE_USER_ID, storeId: 'amazon', storeName: 'Amazon', affiliateLink: 'https://www.amazon.in/?tag=magicsaver-21&subid=clickseed1', clickId: 'clickseed1', productId: productsData[0].storeId === 'amazon' ? productsData[0].name.replace(/\s+/g, '-').toLowerCase() : 'some-product-id', productName: productsData[0].name, userAgent: 'SeedScript/1.0' },
    { userId: EXAMPLE_USER_ID, storeId: 'myntra', storeName: 'Myntra', affiliateLink: 'https://www.myntra.com/?ref=magicsaver&subid=clickseed2', clickId: 'clickseed2', couponId: couponsData.find(c => c.storeId === 'myntra')?.code || 'some-coupon-id', userAgent: 'SeedScript/1.0' },
];

const transactionsData: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'confirmationDate' | 'paidDate' | 'payoutId'>[] = [
    {
        userId: EXAMPLE_USER_ID,
        storeId: 'amazon',
        storeName: 'Amazon',
        clickId: 'clickseed1',
        orderId: 'AMZ-ORDER-SEED-001',
        saleAmount: 2500,
        cashbackAmount: 125,
        status: 'pending',
        transactionDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        adminNotes: 'Initial pending transaction from seed.',
        notesToUser: 'Your cashback is being tracked for Amazon order.'
    },
    {
        userId: EXAMPLE_USER_ID,
        storeId: 'myntra',
        storeName: 'Myntra',
        clickId: 'clickseed2',
        orderId: 'MYN-ORDER-SEED-002',
        saleAmount: 3000,
        cashbackAmount: 240,
        status: 'confirmed',
        transactionDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), // 40 days ago
        adminNotes: 'Confirmed transaction from seed.',
        notesToUser: 'Your Myntra cashback is confirmed!'
    },
    {
        userId: EXAMPLE_USER_ID,
        storeId: 'flipkart',
        storeName: 'Flipkart',
        orderId: 'FLIP-ORDER-SEED-003',
        saleAmount: 1000,
        cashbackAmount: 65,
        status: 'pending',
        transactionDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        notesToUser: 'Awaiting retailer confirmation for Flipkart order.'
    }
];


export async function seedDatabase() {
  if (!db || firebaseInitializationError) {
    console.error(`Firestore database is not initialized. Seeding cannot proceed. Error: ${firebaseInitializationError}`);
    return;
  }

  console.log("Starting database seeding...");
  const batch = writeBatch(db);
  let writeCount = 0;

  const processCollection = async <T extends { id?: string, slug?: string, name?: string }>(
    collectionName: string,
    data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>[],
    idField?: 'slug' // Only allow 'slug' as an explicit ID field for stores/categories
  ) => {
    console.log(`Seeding ${collectionName}...`);
    for (const item of data) {
      const docId = idField === 'slug' && item.slug ? item.slug : uuidv4();
      if (!docId) {
        console.warn(`  - Skipping item in ${collectionName} due to missing ID/slug:`, item);
        continue;
      }
      const itemRef = doc(db, collectionName, docId);
      const docSnap = await getDoc(itemRef);

      const dataToSet = {
        ...(item as any),
        isActive: (item as any).isActive === undefined ? true : (item as any).isActive,
        isFeatured: (item as any).isFeatured === undefined ? false : (item as any).isFeatured,
        // Specific flags for stores and products
        ...(collectionName === 'stores' && { isTodaysDeal: (item as any).isTodaysDeal === undefined ? false : (item as any).isTodaysDeal }),
        ...(collectionName === 'products' && { isTodaysPick: (item as any).isTodaysPick === undefined ? false : (item as any).isTodaysPick }),
        updatedAt: serverTimestamp(),
      };

      if (!docSnap.exists()) {
        batch.set(itemRef, { ...dataToSet, createdAt: serverTimestamp() });
        writeCount++;
        console.log(`  - Added ${collectionName}: ${(item as any).name || docId} (ID: ${docId})`);
      } else {
        // Optionally update existing documents if needed, for now, we only add new ones by ID
        // batch.update(itemRef, dataToSet);
        // writeCount++;
        // console.log(`  - Updated ${collectionName}: ${(item as any).name || docId} (ID: ${docId})`);
      }
    }
  };

  // Seed with slug as ID for categories and stores for predictable linking
  await processCollection<Category>('categories', categoriesData, 'slug');
  await processCollection<Store>('stores', storesData, 'slug');

  // For coupons, banners, products - use auto-generated IDs
  console.log("Seeding coupons...");
  for (const coupon of couponsData) {
    const couponRef = doc(collection(db, 'coupons'));
    batch.set(couponRef, { ...coupon, isActive: coupon.isActive === undefined ? true : coupon.isActive, isFeatured: coupon.isFeatured === undefined ? false : coupon.isFeatured, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    writeCount++;
    console.log(`  - Added coupon: ${coupon.description}`);
  }

  console.log("Seeding banners...");
  for (const banner of bannersData) {
    const bannerRef = doc(collection(db, 'banners'));
    batch.set(bannerRef, { ...banner, isActive: banner.isActive === undefined ? true : banner.isActive, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    writeCount++;
    console.log(`  - Added banner: ${banner.title || 'Untitled Banner'}`);
  }

  console.log("Seeding products...");
  for (const product of productsData) {
    const productRef = doc(collection(db, 'products'));
    const productToSeed = {
        ...product,
        isTodaysPick: product.isTodaysPick === undefined ? false : product.isTodaysPick,
        isActive: product.isActive === undefined ? true : product.isActive,
        isFeatured: product.isFeatured === undefined ? false : product.isFeatured,
    };
    batch.set(productRef, { ...productToSeed, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    writeCount++;
    console.log(`  - Added product: ${product.name}`);
  }

  console.log("Seeding clicks...");
  for (const click of clicksData) {
    const clickRef = doc(db, 'clicks', click.clickId); // Use provided clickId as document ID
    const docSnap = await getDoc(clickRef);
    if(!docSnap.exists()){
        batch.set(clickRef, { ...click, timestamp: serverTimestamp() });
        writeCount++;
        console.log(`  - Added click: ${click.clickId}`);
    }
  }

  // Seed User Profiles
  const seedUser = async (uid: string, role: 'admin' | 'user', displayName: string, email: string) => {
    console.log(`Checking/Seeding user (UID: ${uid}, Role: ${role})...`);
    const userRef = doc(db, 'users', uid);
    const userDocSnap = await getDoc(userRef);

    if (!userDocSnap.exists()) {
        const profileData: UserProfile = {
            uid: uid,
            email: email,
            displayName: displayName,
            photoURL: null,
            role: role,
            cashbackBalance: 0, // Initialized to 0
            pendingCashback: 0,  // Initialized to 0
            lifetimeCashback: 0, // Initialized to 0
            referralCode: uuidv4().substring(0, 8).toUpperCase(),
            referralCount: 0,
            referralBonusEarned: 0,
            referredBy: null,
            isDisabled: false,
            createdAt: serverTimestamp() as Timestamp, // Cast for type consistency
            updatedAt: serverTimestamp() as Timestamp,
            lastPayoutRequestAt: null,
            payoutDetails: null,
        };
        batch.set(userRef, profileData);
        writeCount++;
        console.log(`  - Added ${role} profile (UID: ${uid}). Balances will be updated by transactions.`);
    } else {
        const existingData = userDocSnap.data() as UserProfile;
        const updates: Partial<UserProfile> = { updatedAt: serverTimestamp() };
        if (existingData.role !== role) updates.role = role;
        // Do not overwrite balances here; let transaction seeding handle it
        if (Object.keys(updates).length > 1) {
            batch.update(userRef, updates);
            writeCount++;
            console.log(`  - Ensured role for ${role} profile (UID: ${uid}).`);
        }
    }
  };

  await seedUser(INITIAL_ADMIN_UID, 'admin', 'MagicSaver Admin', `admin_${INITIAL_ADMIN_UID.substring(0,5)}@magicsaver.example.com`);
  await seedUser(EXAMPLE_USER_ID, 'user', 'Test User', `user_${EXAMPLE_USER_ID.substring(0,5)}@magicsaver.example.com`);


  // Commit initial data like categories, stores, etc.
  if (writeCount > 0) {
    try {
      await batch.commit();
      console.log(`Successfully committed ${writeCount} initial writes (categories, stores, users, etc.).`);
      writeCount = 0; // Reset for transaction seeding
    } catch (error) {
      console.error("Error committing initial seed data batch:", error);
      return; // Stop if initial seeding fails
    }
  } else {
    console.log("No new initial data (categories, stores, etc.) to seed.");
  }

  // Seed Transactions and Update User Balances within Firestore Transactions
  // This needs to be done after users are potentially created by the batch above.
  console.log("Seeding transactions and updating user balances...");
  for (const transactionData of transactionsData) {
    try {
        await runTransaction(db, async (firestoreTransaction) => {
            const userRef = doc(db, 'users', transactionData.userId);
            const userSnap = await firestoreTransaction.get(userRef);

            if (!userSnap.exists()) {
                console.warn(`  - User ${transactionData.userId} not found for transaction. Skipping transaction for ${transactionData.storeName}. This might happen if users were not created by previous batch.`);
                return;
            }

            const transactionRef = doc(collection(db, 'transactions'));
            const transactionDate = transactionData.transactionDate instanceof Date ? Timestamp.fromDate(transactionData.transactionDate) : serverTimestamp();
            firestoreTransaction.set(transactionRef, {
                ...transactionData,
                transactionDate,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                confirmationDate: transactionData.status === 'confirmed' ? (transactionData.confirmationDate || serverTimestamp()) : null,
                paidDate: null,
                payoutId: null,
            });

            const userData = userSnap.data() as UserProfile;
            const updates: Partial<UserProfile> = { updatedAt: serverTimestamp() };

            if (transactionData.status === 'pending') {
                updates.pendingCashback = increment(transactionData.cashbackAmount);
            } else if (transactionData.status === 'confirmed') {
                updates.cashbackBalance = increment(transactionData.cashbackAmount);
                updates.lifetimeCashback = increment(transactionData.cashbackAmount);
            }
            firestoreTransaction.update(userRef, updates);
            console.log(`  - Processed transaction for store: ${transactionData.storeName}, User: ${transactionData.userId}. Status: ${transactionData.status}. Balance updated.`);
        });
    } catch (error) {
        console.error(`Error processing transaction for ${transactionData.storeName} (User: ${transactionData.userId}):`, error);
    }
  }

  console.log("Database seeding finished.");
}

// To run this script directly (e.g., `npm run seed` if configured in package.json):
if (require.main === module) {
  seedDatabase().catch(error => {
    console.error("Unhandled error during seeding:", error);
    process.exit(1);
  });
}

    
