
// src/lib/seed.ts
import { collection, doc, setDoc, getDoc, serverTimestamp, writeBatch, Timestamp, addDoc, increment, runTransaction, query, where, limit, getDocs } from 'firebase/firestore';
import { db, firebaseInitializationError } from './firebase/config';
import type { Store, Coupon, Category, Banner, UserProfile, Product, Click, Transaction, CashbackStatus, Conversion } from './types';
import { v4 as uuidv4 } from 'uuid';

const INITIAL_ADMIN_UID = process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID || "testAdminUser123";
const EXAMPLE_USER_ID_1 = "testUser001";
const EXAMPLE_USER_ID_2 = "testUser002";

const categoriesData: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { name: 'Fashion', slug: 'fashion', description: 'Latest trends in clothing and accessories.', order: 1, imageUrl: 'https://placehold.co/100x100/007bff/ffffff.png?text=Fashion', dataAiHint: "clothing fashion", isActive: true },
  { name: 'Electronics', slug: 'electronics', description: 'Gadgets, appliances, and more.', order: 2, imageUrl: 'https://placehold.co/100x100/28a745/ffffff.png?text=Electronics', dataAiHint: "gadgets electronics", isActive: true },
  { name: 'Travel', slug: 'travel', description: 'Flights, hotels, and holiday packages.', order: 3, imageUrl: 'https://placehold.co/100x100/ffc107/000000.png?text=Travel', dataAiHint: "vacation travel", isActive: true },
  { name: 'Beauty', slug: 'beauty', description: 'Skincare, makeup, and personal care.', order: 4, imageUrl: 'https://placehold.co/100x100/dc3545/ffffff.png?text=Beauty', dataAiHint: "cosmetics makeup", isActive: true },
  { name: 'Home & Kitchen', slug: 'home-kitchen', description: 'Appliances, decor, and essentials for your home.', order: 5, imageUrl: 'https://placehold.co/100x100/6f42c1/ffffff.png?text=Home', dataAiHint: "kitchen appliances", isActive: true },
  { name: 'Books & Media', slug: 'books-media', description: 'Books, movies, music, and games.', order: 6, imageUrl: 'https://placehold.co/100x100/fd7e14/ffffff.png?text=Books', dataAiHint: "books movies", isActive: true },
];

const storesData: Omit<Store, 'id' | 'createdAt' | 'updatedAt'>[] = [
    { name: 'Amazon', slug: "amazon", logoUrl: 'https://placehold.co/120x60/FF9900/000000.png?text=Amazon', heroImageUrl: 'https://placehold.co/1200x300/FF9900/000000.png?text=Amazon+Deals', dataAiHint: 'amazon logo', affiliateLink: 'https://www.amazon.in/?tag=magicsaver-21', cashbackRate: 'Up to 7%', cashbackRateValue: 7, cashbackType: 'percentage', description: 'Wide range of products.', categories: ['electronics', 'fashion', 'home-kitchen', 'books-media'], isFeatured: true, isActive: true, isTodaysDeal: true, terms: 'Cashback varies by category. Read T&Cs on store page.' },
    { name: 'Flipkart', slug: "flipkart", logoUrl: 'https://placehold.co/120x60/2874F0/ffffff.png?text=Flipkart', heroImageUrl: 'https://placehold.co/1200x300/2874F0/ffffff.png?text=Flipkart+Big+Saving+Days', dataAiHint: 'flipkart logo', affiliateLink: 'https://www.flipkart.com/?affid=magicsaver', cashbackRate: 'Up to 6.5%', cashbackRateValue: 6.5, cashbackType: 'percentage', description: 'India\'s leading online store.', categories: ['electronics', 'fashion', 'home-kitchen'], isFeatured: true, isActive: true, isTodaysDeal: false, terms: 'Rates differ for new/existing users. Check offer terms.' },
    { name: 'Myntra', slug: "myntra", logoUrl: 'https://placehold.co/120x60/E84A5F/ffffff.png?text=Myntra', heroImageUrl: 'https://placehold.co/1200x300/E84A5F/ffffff.png?text=Myntra+Fashion+Carnival', dataAiHint: 'myntra fashion', affiliateLink: 'https://www.myntra.com/?ref=magicsaver', cashbackRate: 'Flat 8%', cashbackRateValue: 8, cashbackType: 'percentage', description: 'Top fashion destination.', categories: ['fashion', 'beauty'], isFeatured: false, isActive: true, isTodaysDeal: true },
    { name: 'Ajio', slug: "ajio", logoUrl: 'https://placehold.co/120x60/000000/ffffff.png?text=AJIO', heroImageUrl: 'https://placehold.co/1200x300/00A2A2/ffffff.png?text=AJIO+Style+Specials', dataAiHint: 'ajio fashion', affiliateLink: 'https://www.ajio.com/?source=magicsaver', cashbackRate: 'Up to 10%', cashbackRateValue: 10, cashbackType: 'percentage', description: 'Curated fashion and lifestyle.', categories: ['fashion'], isFeatured: true, isActive: true, isTodaysDeal: false },
];

const productsData: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'storeName'>[] = [
  { storeId: 'amazon', name: 'Echo Dot (5th Gen, 2023 release)', description: 'Smart speaker with Alexa and improved sound.', imageUrl: 'https://placehold.co/300x300/000000/ffffff.png?text=Echo+5', dataAiHint: 'smart speaker', affiliateLink: 'https://www.amazon.in/dp/B09B8X2SQL?tag=magicsaver-21', price: 4499, category: 'electronics', isActive: true, isFeatured: true, isTodaysPick: true },
  { storeId: 'flipkart', name: 'Samsung Galaxy F54 5G (Stardust Silver, 256 GB)', description: 'Powerful 5G smartphone with 108MP camera.', imageUrl: 'https://placehold.co/300x300/007bff/ffffff.png?text=Galaxy+F54', dataAiHint: 'samsung phone', affiliateLink: 'https://www.flipkart.com/samsung-galaxy-f54-5g/p/itm3f62bd8d719c7?pid=MOBGDR4BYTRG5JFA&affid=magicsaver', price: 22999, category: 'electronics', isActive: true, isFeatured: true, isTodaysPick: true },
  { storeId: 'myntra', name: 'PUMA Men Smash Vulc Casual Shoes', description: 'Stylish Puma sneakers for everyday wear.', imageUrl: 'https://placehold.co/300x300/e83e8c/ffffff.png?text=Puma+Shoes', dataAiHint: 'puma sneakers', affiliateLink: 'https://www.myntra.com/casual-shoes/puma/puma-men-smash-vulc-casual-shoes/1038100/buy?ref=magicsaver', price: 2499, category: 'fashion', isActive: true, isFeatured: true, isTodaysPick: false },
  { storeId: 'ajio', name: 'LEVIS Mens Slim Fit Jeans', description: 'Classic Levis slim fit jeans for men.', imageUrl: 'https://placehold.co/300x300/17a2b8/ffffff.png?text=Levis+Jeans', dataAiHint: 'levis jeans', affiliateLink: 'https://www.ajio.com/levis-men-jeans/p/462800000_blue?source=magicsaver', price: 1799, category: 'fashion', isActive: true, isFeatured: true, isTodaysPick: true },
  { storeId: 'amazon', name: 'OnePlus Bullets Z2 Bluetooth Earphones', description: 'Wireless earphones with fast charging.', imageUrl: 'https://placehold.co/300x300/6c757d/ffffff.png?text=OnePlus+Z2', dataAiHint: 'wireless earphones', affiliateLink: 'https://www.amazon.in/dp/B0B3MNY99S?tag=magicsaver-21', price: 1999, category: 'electronics', isActive: true, isFeatured: false, isTodaysPick: true },
];

const couponsData: Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'store'>[] = [
  { storeId: 'amazon', code: 'AMZDEAL10', description: 'Extra 10% off select Amazon Fashion. Max discount ₹200.', link: 'https://www.amazon.in/fashion?tag=magicsaver-21', expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), isFeatured: true, isActive: true },
  { storeId: 'flipkart', code: null, description: 'Flipkart Electronics Sale - Up to 80% Off Laptops & Mobiles.', link: 'https://www.flipkart.com/electronics-sale?affid=magicsaver', expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), isFeatured: true, isActive: true },
  { storeId: 'myntra', code: 'MYNTRA200', description: 'Flat ₹200 off on ₹1999+ for new users. Valid on first order.', link: 'https://www.myntra.com/?ref=magicsaver', expiryDate: null, isFeatured: false, isActive: true },
  { storeId: 'ajio', code: 'AJIOSALE', description: 'Get 50-70% off on AJIO Fashion Sale.', link: 'https://www.ajio.com/sale?source=magicsaver', expiryDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), isFeatured: true, isActive: true },
];

const bannersData: Omit<Banner, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { title: 'Mega Electronics Sale', subtitle: 'Up to 50% off + Extra 5% Cashback via MagicSaver', imageUrl: 'https://placehold.co/1200x400/28a745/ffffff.png?text=Electronics+Sale', dataAiHint: 'electronics sale', link: '/category/electronics', order: 1, isActive: true },
  { title: 'Fashion Frenzy Fest', subtitle: 'Get 60-80% off on top fashion brands + Assured Cashback', imageUrl: 'https://placehold.co/1200x400/007bff/ffffff.png?text=Fashion+Fest', dataAiHint: 'fashion clothing', link: '/category/fashion', order: 2, isActive: true },
  { title: 'Travel Big, Save Bigger!', subtitle: 'Exclusive deals on flights and hotels for your next getaway.', imageUrl: 'https://placehold.co/1200x400/ffc107/000000.png?text=Travel+Deals', dataAiHint: 'travel vacation', link: '/category/travel', order: 3, isActive: true },
];

const exampleClicksBase: Omit<Click, 'id' | 'timestamp' | 'userAgent' | 'clickId'>[] = [
    { userId: EXAMPLE_USER_ID_1, storeId: 'amazon', storeName: 'Amazon', affiliateLink: 'https://www.amazon.in/dp/B09B8X2SQL?tag=magicsaver-21', originalLink: 'https://www.amazon.in/dp/B09B8X2SQL', productId: productsData.find(p=>p.name.includes("Echo Dot"))?.id || 'product-echo-dot-seed', productName: productsData.find(p=>p.name.includes("Echo Dot"))?.name },
    { userId: EXAMPLE_USER_ID_1, storeId: 'myntra', storeName: 'Myntra', affiliateLink: 'https://www.myntra.com/?ref=magicsaver', originalLink: 'https://www.myntra.com/', couponId: couponsData.find(c => c.code === 'MYNTRA200')?.id || 'coupon-myntra200-seed' },
    { userId: EXAMPLE_USER_ID_2, storeId: 'flipkart', storeName: 'Flipkart', affiliateLink: 'https://www.flipkart.com/samsung-galaxy-f54-5g/p/itm3f62bd8d719c7?pid=MOBGDR4BYTRG5JFA&affid=magicsaver', originalLink: 'https://www.flipkart.com/samsung-galaxy-f54-5g/p/itm3f62bd8d719c7', productId: productsData.find(p=>p.name.includes("Galaxy F54"))?.id || 'product-galaxy-f54-seed', productName: productsData.find(p=>p.name.includes("Galaxy F54"))?.name },
];

const exampleConversionsBase: Omit<Conversion, 'id' | 'timestamp' | 'postbackData' | 'status'>[] = [
    { clickId: 'click_seed_001', userId: EXAMPLE_USER_ID_1, storeId: 'amazon', storeName: 'Amazon', orderId: 'AMZ-ORDER-SEED-001', saleAmount: 4499 },
    { clickId: 'click_seed_002', userId: EXAMPLE_USER_ID_1, storeId: 'myntra', storeName: 'Myntra', orderId: 'MYN-ORDER-SEED-002', saleAmount: 3000 },
    { clickId: 'click_seed_003', userId: EXAMPLE_USER_ID_2, storeId: 'flipkart', storeName: 'Flipkart', orderId: 'FLIP-ORDER-SEED-003', saleAmount: 22999 },
];

const exampleTransactionsBase: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'confirmationDate' | 'paidDate' | 'payoutId' | 'reportedDate' | 'conversionId' | 'cashbackRateApplied' | 'finalSaleAmount' | 'finalCashbackAmount' | 'currency' | 'notesToUser'>[] = [
    {
        userId: EXAMPLE_USER_ID_1, storeId: 'amazon', storeName: 'Amazon', clickId: 'click_seed_001', orderId: 'AMZ-ORDER-SEED-001', productDetails: 'Echo Dot (5th Gen)',
        transactionDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), saleAmount: 4499, initialCashbackAmount: 125, status: 'pending' as CashbackStatus,
        adminNotes: 'Auto-seeded pending transaction for Echo Dot.'
    },
    {
        userId: EXAMPLE_USER_ID_1, storeId: 'myntra', storeName: 'Myntra', clickId: 'click_seed_002', orderId: 'MYN-ORDER-SEED-002', productDetails: 'Various Fashion Items',
        transactionDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), saleAmount: 3000, initialCashbackAmount: 240, status: 'confirmed' as CashbackStatus,
        adminNotes: 'Auto-seeded confirmed transaction for Myntra fashion.'
    },
    {
        userId: EXAMPLE_USER_ID_2, storeId: 'flipkart', storeName: 'Flipkart', clickId: 'click_seed_003', orderId: 'FLIP-ORDER-SEED-003', productDetails: 'Samsung Galaxy F54 5G',
        transactionDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), saleAmount: 22999, initialCashbackAmount: 345, status: 'pending' as CashbackStatus,
        adminNotes: 'Auto-seeded pending transaction for Galaxy F54.'
    },
     {
        userId: EXAMPLE_USER_ID_1, storeId: 'flipkart', storeName: 'Flipkart', orderId: 'FLIP-ORDER-SEED-004', productDetails: 'Books and Stationery',
        transactionDate: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), saleAmount: 2000, initialCashbackAmount: 100, status: 'confirmed' as CashbackStatus,
        adminNotes: 'Auto-seeded confirmed transaction for Flipkart books.'
    }
];


export async function seedDatabase() {
  if (!db || firebaseInitializationError) {
    console.error(`Firestore database is not initialized. Seeding cannot proceed. Error: ${firebaseInitializationError}`);
    return;
  }

  console.log("Starting database seeding...");
  const mainBatch = writeBatch(db);
  let writeCount = 0;
  const nowServerTimestamp = serverTimestamp(); // Use Firestore's serverTimestamp for consistency

  // Process collections like categories, stores, banners
  const processSimpleCollection = async <T extends { id?: string, slug?: string, name?: string, title?: string }>(
    collectionName: string,
    data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>[],
    idFieldProperty: keyof T = 'slug' as keyof T // Default to 'slug'
  ) => {
    console.log(`Seeding ${collectionName}...`);
    for (const item of data) {
      const docId = (item as any)[idFieldProperty] || (item as any).name?.toLowerCase().replace(/\s+/g, '-') || uuidv4();
      if (!docId) {
        console.warn(`  - Skipping item in ${collectionName} due to missing ID property:`, item);
        continue;
      }
      const itemRef = doc(db, collectionName, docId);
      const dataToSet: any = {
        ...item,
        createdAt: nowServerTimestamp,
        updatedAt: nowServerTimestamp,
      };
      if (['stores', 'products', 'coupons', 'categories', 'banners'].includes(collectionName)) {
        dataToSet.isActive = (item as any).isActive === undefined ? true : (item as any).isActive;
      }
      if (['stores', 'products', 'coupons'].includes(collectionName)) {
        dataToSet.isFeatured = (item as any).isFeatured === undefined ? false : (item as any).isFeatured;
      }
       if (collectionName === 'stores') {
        dataToSet.isTodaysDeal = (item as any).isTodaysDeal === undefined ? false : (item as any).isTodaysDeal;
      }
      if (collectionName === 'products') {
        dataToSet.isTodaysPick = (item as any).isTodaysPick === undefined ? false : (item as any).isTodaysPick;
      }

      const docSnap = await getDoc(itemRef); // Check if doc exists before deciding to set or update
      if (!docSnap.exists()) {
          mainBatch.set(itemRef, dataToSet);
          writeCount++;
          console.log(`  - Added ${collectionName}: ${(item as any).name || (item as any).title || docId}`);
      } else {
          mainBatch.update(itemRef, dataToSet); // Update if exists
          writeCount++;
          console.log(`  - Updated ${collectionName}: ${(item as any).name || (item as any).title || docId}`);
      }
    }
  };

  // Seed Clicks
  console.log("Seeding clicks...");
  const seededClicks: Click[] = [];
  for (const clickItemBase of exampleClicksBase) {
    const clickId = clickItemBase.clickId || `click_seed_${uuidv4().substring(0,8)}`;
    const clickRef = doc(db, 'clicks', clickId);
    const clickData: Click = {
      ...clickItemBase,
      id: clickId,
      clickId: clickId, // Ensure clickId is also a field
      timestamp: nowServerTimestamp,
      userAgent: 'SeedScript/1.0',
    };
    const docSnap = await getDoc(clickRef);
    if (!docSnap.exists()) {
        mainBatch.set(clickRef, clickData);
        writeCount++;
        console.log(`  - Added click: ${clickId}`);
        seededClicks.push(clickData);
    } else {
        mainBatch.update(clickRef, clickData);
        writeCount++;
        console.log(`  - Updated click: ${clickId}`);
        seededClicks.push({ ...clickData, id: docSnap.id, timestamp: docSnap.data()?.timestamp || nowServerTimestamp }); // use existing if updated
    }
  }

  // Seed Conversions
  console.log("Seeding conversions...");
  const seededConversions: Conversion[] = [];
  for (const convItemBase of exampleConversionsBase) {
    const convId = `conv_seed_${uuidv4().substring(0,8)}`;
    const convRef = doc(db, 'conversions', convId);
    // Find original click Firebase ID if possible (for demo, we assume clickId field in Click is the UUID)
    const originalClick = seededClicks.find(c => c.clickId === convItemBase.clickId);

    const conversionData: Conversion = {
      ...convItemBase,
      id: convId,
      originalClickFirebaseId: originalClick?.id || null,
      status: 'received',
      timestamp: nowServerTimestamp,
      postbackData: { simulated: true, ...convItemBase },
    };
    const docSnap = await getDoc(convRef);
    if (!docSnap.exists()) {
        mainBatch.set(convRef, conversionData);
        writeCount++;
        console.log(`  - Added conversion: ${convId} for click ${convItemBase.clickId}`);
        seededConversions.push(conversionData);
    } else {
        mainBatch.update(convRef, conversionData);
        writeCount++;
        console.log(`  - Updated conversion: ${convId} for click ${convItemBase.clickId}`);
        seededConversions.push({ ...conversionData, id: docSnap.id, timestamp: docSnap.data()?.timestamp || nowServerTimestamp });
    }
  }

  await processSimpleCollection<Category>('categories', categoriesData, 'slug');
  await processSimpleCollection<Store>('stores', storesData, 'slug');
  await processSimpleCollection<Coupon>('coupons', couponsData, 'id'); // Assuming coupons have an 'id' field pre-defined or use UUID
  await processSimpleCollection<Banner>('banners', bannersData, 'id'); // Assuming banners have an 'id' field or use UUID
  await processSimpleCollection<Product>('products', productsData, 'id'); // Assuming products have an 'id' field or use UUID

  // Commit initial batch for base data
  if (writeCount > 0) {
    try {
      await mainBatch.commit();
      console.log(`Successfully committed ${writeCount} initial item writes (categories, stores, clicks, etc.).`);
      writeCount = 0; // Reset for user/transaction batches
    } catch (error) {
      console.error("Error committing initial batch:", error);
      return; // Stop if initial batch fails
    }
  } else {
    console.log("No new items (categories, stores, etc.) added/updated or they already existed.");
  }


  // Seed Users and then Transactions (as transactions update user balances)
  const seedUser = async (uid: string, role: 'admin' | 'user', displayName: string, emailSuffix: string, exampleTransactions: typeof exampleTransactionsBase) => {
    console.log(`Seeding user (UID: ${uid}, Role: ${role})...`);
    const userRef = doc(db, 'users', uid);
    const email = `${emailSuffix}@magicsaver.example.com`;

    try {
      await runTransaction(db, async (transaction) => {
        const userDocSnap = await transaction.get(userRef);
        let pendingCashback = 0;
        let cashbackBalance = 0;
        let lifetimeCashback = 0;

        // Calculate initial balances from user's transactions
        const userTransactions = exampleTransactions.filter(t => t.userId === uid);
        userTransactions.forEach(t => {
          if (t.status === 'pending') {
            pendingCashback += t.initialCashbackAmount;
          } else if (t.status === 'confirmed') {
            cashbackBalance += t.initialCashbackAmount;
            lifetimeCashback += t.initialCashbackAmount;
          }
        });
        
        if (!userDocSnap.exists()) {
          const profileData: UserProfile = {
            uid, email, displayName, photoURL: null, role,
            cashbackBalance, pendingCashback, lifetimeCashback,
            referralCode: uuidv4().substring(0, 8).toUpperCase(),
            referralCount: 0, referralBonusEarned: 0, referredBy: null,
            isDisabled: false, createdAt: serverTimestamp() as Timestamp,
            updatedAt: serverTimestamp() as Timestamp,
            lastPayoutRequestAt: null, payoutDetails: null,
          };
          transaction.set(userRef, profileData);
          console.log(`  - Added ${role} profile for UID: ${uid}. Initial Balances: Pending ₹${pendingCashback}, Confirmed ₹${cashbackBalance}`);
        } else {
          const existingData = userDocSnap.data() as UserProfile;
          transaction.update(userRef, { 
            role, 
            displayName,
            email, // In case email needs to be standardized
            cashbackBalance: existingData.cashbackBalance || 0, // Keep existing if re-running, let transactions adjust
            pendingCashback: existingData.pendingCashback || 0,
            lifetimeCashback: existingData.lifetimeCashback || 0,
            updatedAt: serverTimestamp() 
          });
          console.log(`  - Updated ${role} profile for UID: ${uid}. Balances will be adjusted by transactions.`);
        }
      });
    } catch (e) {
      console.error(`Error seeding user ${uid}: `, e);
    }
  };

  await seedUser(INITIAL_ADMIN_UID, 'admin', 'MagicSaver Admin', `admin_${INITIAL_ADMIN_UID.substring(0,5)}`, exampleTransactionsBase);
  await seedUser(EXAMPLE_USER_ID_1, 'user', 'Test User One', `user1_${EXAMPLE_USER_ID_1.substring(0,5)}`, exampleTransactionsBase);
  await seedUser(EXAMPLE_USER_ID_2, 'user', 'Test User Two', `user2_${EXAMPLE_USER_ID_2.substring(0,5)}`, exampleTransactionsBase);
  
  // Seed Transactions (this will update user balances again if run multiple times, ensure user seed runs first to set base)
  console.log("Seeding transactions and updating user balances individually...");
  for (const txItemBase of exampleTransactionsBase) {
    const userRef = doc(db, 'users', txItemBase.userId);
    const transactionId = `txn_seed_${uuidv4().substring(0,8)}`;
    const transactionRef = doc(db, 'transactions', transactionId);
    
    // Find related conversion
    const relatedConversion = seededConversions.find(c => c.clickId === txItemBase.clickId && c.orderId === txItemBase.orderId);

    try {
      await runTransaction(db, async (firestoreTransaction) => {
        const userSnap = await firestoreTransaction.get(userRef);
        if (!userSnap.exists()) {
          console.warn(`  - User ${txItemBase.userId} not found. Skipping transaction for ${txItemBase.storeName}.`);
          return;
        }

        // Check if this specific transaction (by orderId and store for this user) already exists to prevent duplicates
        const transQuery = query(collection(db, "transactions"),
                                 where("userId", "==", txItemBase.userId),
                                 where("orderId", "==", txItemBase.orderId),
                                 where("storeId", "==", txItemBase.storeId),
                                 limit(1));
        const existingTransSnap = await firestoreTransaction.get(transQuery); // Use transaction.get
        
        if (!existingTransSnap.empty) {
            console.log(`  - Transaction for order ${txItemBase.orderId} at ${txItemBase.storeName} (User: ${txItemBase.userId}) already exists. Skipping.`);
            return;
        }

        const transactionData: Transaction = {
          ...txItemBase,
          id: transactionId,
          conversionId: relatedConversion?.id || null,
          cashbackRateApplied: txItemBase.storeId === 'amazon' ? 'Up to 7%' : 'Store Default', // Example
          finalSaleAmount: txItemBase.saleAmount,
          finalCashbackAmount: txItemBase.initialCashbackAmount,
          currency: 'INR',
          transactionDate: Timestamp.fromDate(txItemBase.transactionDate as Date),
          reportedDate: serverTimestamp() as Timestamp,
          confirmationDate: txItemBase.status === 'confirmed' ? (serverTimestamp() as Timestamp) : null,
          paidDate: null,
          payoutId: null,
          createdAt: serverTimestamp() as Timestamp,
          updatedAt: serverTimestamp() as Timestamp,
        };
        firestoreTransaction.set(transactionRef, transactionData);

        // Update user balance based on this transaction's status
        const userData = userSnap.data() as UserProfile;
        const updates: Record<string, any> = { updatedAt: serverTimestamp() };
        const cashbackAmount = transactionData.initialCashbackAmount || 0;

        if (transactionData.status === 'pending') {
          updates.pendingCashback = increment(cashbackAmount);
        } else if (transactionData.status === 'confirmed') {
          // If seeding a confirmed transaction, it implies it was pending then confirmed.
          // For simplicity here, directly add to confirmed and lifetime.
          // A more complex seed might simulate the pending -> confirmed transition.
          updates.cashbackBalance = increment(cashbackAmount);
          updates.lifetimeCashback = increment(cashbackAmount);
        }
        if (Object.keys(updates).length > 1) {
            firestoreTransaction.update(userRef, updates);
        }
        console.log(`  - Seeded transaction for ${txItemBase.storeName}, User: ${txItemBase.userId}. Status: ${txItemBase.status}. Balances adjusted.`);
      });
    } catch (error) {
      console.error(`Error in runTransaction for seeding transaction ${txItemBase.orderId}:`, error);
    }
  }
  console.log("Database seeding finished.");
}

    