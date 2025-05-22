
// src/lib/seed.ts
import { collection, doc, setDoc, getDoc, serverTimestamp, writeBatch, Timestamp, addDoc, increment, runTransaction, query, where, limit, getDocs, WriteBatch } from 'firebase/firestore';
import { db, firebaseInitializationError } from './firebase/config';
import type { Store, Coupon, Category, Banner, UserProfile, Product, Click, Transaction, CashbackStatus, Conversion, CashbackType } from './types';
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
    { name: 'Amazon', slug: "amazon", logoUrl: 'https://placehold.co/120x60/FF9900/000000.png?text=Amazon', heroImageUrl: 'https://placehold.co/1200x300/FF9900/000000.png?text=Amazon+Deals', dataAiHint: 'amazon logo', affiliateLink: 'https://www.amazon.in/?tag=magicsaver-21&subid={CLICK_ID}', cashbackRate: 'Up to 7%', cashbackRateValue: 7, cashbackType: 'percentage', description: 'Wide range of products.', categories: ['electronics', 'fashion', 'home-kitchen', 'books-media'], isFeatured: true, isActive: true, isTodaysDeal: true, terms: 'Cashback varies by category. Read T&Cs on store page.' },
    { name: 'Flipkart', slug: "flipkart", logoUrl: 'https://placehold.co/120x60/2874F0/ffffff.png?text=Flipkart', heroImageUrl: 'https://placehold.co/1200x300/2874F0/ffffff.png?text=Flipkart+Big+Saving+Days', dataAiHint: 'flipkart logo', affiliateLink: 'https://www.flipkart.com/?affid=magicsaver&affExtParam1={CLICK_ID}', cashbackRate: 'Up to 6.5%', cashbackRateValue: 6.5, cashbackType: 'percentage', description: 'India\'s leading online store.', categories: ['electronics', 'fashion', 'home-kitchen'], isFeatured: true, isActive: true, isTodaysDeal: false, terms: 'Rates differ for new/existing users. Check offer terms.' },
    { name: 'Myntra', slug: "myntra", logoUrl: 'https://placehold.co/120x60/E84A5F/ffffff.png?text=Myntra', heroImageUrl: 'https://placehold.co/1200x300/E84A5F/ffffff.png?text=Myntra+Fashion+Carnival', dataAiHint: 'myntra fashion', affiliateLink: 'https://www.myntra.com/?ref=magicsaver&subid={CLICK_ID}', cashbackRate: 'Flat 8%', cashbackRateValue: 8, cashbackType: 'percentage', description: 'Top fashion destination.', categories: ['fashion', 'beauty'], isFeatured: false, isActive: true, isTodaysDeal: true },
    { name: 'Ajio', slug: "ajio", logoUrl: 'https://placehold.co/120x60/000000/ffffff.png?text=AJIO', heroImageUrl: 'https://placehold.co/1200x300/00A2A2/ffffff.png?text=AJIO+Style+Specials', dataAiHint: 'ajio fashion', affiliateLink: 'https://www.ajio.com/?source=magicsaver&subref={CLICK_ID}', cashbackRate: 'Up to 10%', cashbackRateValue: 10, cashbackType: 'percentage', description: 'Curated fashion and lifestyle.', categories: ['fashion'], isFeatured: true, isActive: true, isTodaysDeal: false },
];

const productsData: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'storeName'>[] = [
  { storeId: 'amazon', name: 'Echo Dot (5th Gen, 2023 release) - Smart Speaker', description: 'Smart speaker with Alexa and improved sound. Control your smart home, listen to music, and more.', imageUrl: 'https://placehold.co/300x300/000000/ffffff.png?text=Echo+5', dataAiHint: 'smart speaker', affiliateLink: 'https://www.amazon.in/dp/B09B8X2SQL?tag=magicsaver-21&subid={CLICK_ID}', price: 4499, category: 'electronics', isActive: true, isFeatured: true, isTodaysPick: true, productSpecificCashbackDisplay: "Flat ₹100 CB", productSpecificCashbackRateValue: 100, productSpecificCashbackType: "fixed" },
  { storeId: 'flipkart', name: 'Samsung Galaxy F54 5G (Stardust Silver, 256 GB)', description: 'Powerful 5G smartphone with 108MP camera, Super AMOLED+ display, and long-lasting battery.', imageUrl: 'https://placehold.co/300x300/007bff/ffffff.png?text=Galaxy+F54', dataAiHint: 'samsung phone', affiliateLink: 'https://www.flipkart.com/samsung-galaxy-f54-5g/p/itm3f62bd8d719c7?pid=MOBGDR4BYTRG5JFA&affid=magicsaver&affExtParam1={CLICK_ID}', price: 22999, category: 'electronics', isActive: true, isFeatured: true, isTodaysPick: true, productSpecificCashbackDisplay: "2% CB", productSpecificCashbackRateValue: 2, productSpecificCashbackType: "percentage" },
  { storeId: 'myntra', name: 'PUMA Men Smash Vulc Casual Shoes - White', description: 'Stylish Puma sneakers for everyday wear. Comfortable and durable.', imageUrl: 'https://placehold.co/300x300/e83e8c/ffffff.png?text=Puma+Shoes', dataAiHint: 'puma sneakers', affiliateLink: 'https://www.myntra.com/casual-shoes/puma/puma-men-smash-vulc-casual-shoes/1038100/buy?ref=magicsaver&subid={CLICK_ID}', price: 2499, category: 'fashion', isActive: true, isFeatured: true, isTodaysPick: false },
  { storeId: 'ajio', name: 'LEVIS Mens 512 Slim Taper Fit Jeans', description: 'Classic Levis slim taper fit jeans for men. Modern style with comfort.', imageUrl: 'https://placehold.co/300x300/17a2b8/ffffff.png?text=Levis+Jeans', dataAiHint: 'levis jeans', affiliateLink: 'https://www.ajio.com/levis-men-jeans/p/462800000_blue?source=magicsaver&subref={CLICK_ID}', price: 1799, category: 'fashion', isActive: true, isFeatured: true, isTodaysPick: true, productSpecificCashbackDisplay: "5% Extra CB", productSpecificCashbackRateValue: 5, productSpecificCashbackType: "percentage" },
  { storeId: 'amazon', name: 'OnePlus Bullets Z2 Bluetooth Wireless Earphones', description: 'Wireless earphones with fast charging, 30-hour battery life, and IP55 water resistance.', imageUrl: 'https://placehold.co/300x300/6c757d/ffffff.png?text=OnePlus+Z2', dataAiHint: 'wireless earphones', affiliateLink: 'https://www.amazon.in/dp/B0B3MNY99S?tag=magicsaver-21&subid={CLICK_ID}', price: 1999, category: 'electronics', isActive: true, isFeatured: false, isTodaysPick: true },
];

const couponsData: Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'store'>[] = [
  { storeId: 'amazon', code: 'AMZDEAL10', description: 'Extra 10% off select Amazon Fashion. Max discount ₹200.', link: 'https://www.amazon.in/fashion?tag=magicsaver-21&subid={CLICK_ID}', expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), isFeatured: true, isActive: true },
  { storeId: 'flipkart', code: null, description: 'Flipkart Electronics Sale - Up to 80% Off Laptops & Mobiles.', link: 'https://www.flipkart.com/electronics-sale?affid=magicsaver&affExtParam1={CLICK_ID}', expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), isFeatured: true, isActive: true },
  { storeId: 'myntra', code: 'MYNTRA200', description: 'Flat ₹200 off on ₹1999+ for new users. Valid on first order.', link: 'https://www.myntra.com/?ref=magicsaver&subid={CLICK_ID}', expiryDate: null, isFeatured: false, isActive: true },
  { storeId: 'ajio', code: 'AJIOSALE', description: 'Get 50-70% off on AJIO Fashion Sale.', link: 'https://www.ajio.com/sale?source=magicsaver&subref={CLICK_ID}', expiryDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), isFeatured: true, isActive: true },
];

const bannersData: Omit<Banner, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { title: 'Mega Electronics Sale', subtitle: 'Up to 50% off + Extra 5% Cashback via MagicSaver', imageUrl: 'https://placehold.co/1200x400/28a745/ffffff.png?text=Electronics+Sale', dataAiHint: 'electronics sale', link: '/category/electronics', order: 1, isActive: true },
  { title: 'Fashion Frenzy Fest', subtitle: 'Get 60-80% off on top fashion brands + Assured Cashback', imageUrl: 'https://placehold.co/1200x400/007bff/ffffff.png?text=Fashion+Fest', dataAiHint: 'fashion clothing', link: '/category/fashion', order: 2, isActive: true },
  { title: 'Travel Big, Save Bigger!', subtitle: 'Exclusive deals on flights and hotels for your next getaway.', imageUrl: 'https://placehold.co/1200x400/ffc107/000000.png?text=Travel+Deals', dataAiHint: 'travel vacation', link: '/category/travel', order: 3, isActive: true },
];

const exampleClicksBase: Omit<Click, 'id' | 'timestamp' | 'userAgent' | 'clickId' | 'clickedCashbackDisplay' | 'clickedCashbackRateValue' | 'clickedCashbackType'>[] = [
    { userId: EXAMPLE_USER_ID_1, storeId: 'amazon', storeName: 'Amazon', affiliateLink: 'https://www.amazon.in/dp/B09B8X2SQL?tag=magicsaver-21', originalLink: 'https://www.amazon.in/dp/B09B8X2SQL', productId: 'echo-dot-5th-gen-2023-release-smart-speaker', productName: 'Echo Dot (5th Gen, 2023 release) - Smart Speaker' },
    { userId: EXAMPLE_USER_ID_1, storeId: 'myntra', storeName: 'Myntra', affiliateLink: 'https://www.myntra.com/?ref=magicsaver', originalLink: 'https://www.myntra.com/', couponId: 'myntra200' },
    { userId: EXAMPLE_USER_ID_2, storeId: 'flipkart', storeName: 'Flipkart', affiliateLink: 'https://www.flipkart.com/samsung-galaxy-f54-5g/p/itm3f62bd8d719c7?pid=MOBGDR4BYTRG5JFA&affid=magicsaver', originalLink: 'https://www.flipkart.com/samsung-galaxy-f54-5g/p/itm3f62bd8d719c7', productId: 'samsung-galaxy-f54-5g-stardust-silver-256-gb', productName: 'Samsung Galaxy F54 5G (Stardust Silver, 256 GB)' },
];

const exampleConversionsBase: Omit<Conversion, 'id' | 'timestamp' | 'postbackData' | 'status'>[] = [
    { clickId: 'click_seed_amazon_echo', userId: EXAMPLE_USER_ID_1, storeId: 'amazon', storeName: 'Amazon', orderId: 'AMZ-ORDER-SEED-001', saleAmount: 4499 },
    { clickId: 'click_seed_myntra_coupon', userId: EXAMPLE_USER_ID_1, storeId: 'myntra', storeName: 'Myntra', orderId: 'MYN-ORDER-SEED-002', saleAmount: 3000 },
    { clickId: 'click_seed_flipkart_galaxy', userId: EXAMPLE_USER_ID_2, storeId: 'flipkart', storeName: 'Flipkart', orderId: 'FLIP-ORDER-SEED-003', saleAmount: 22999 },
];

const exampleTransactionsBase: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'confirmationDate' | 'paidDate' | 'payoutId' | 'reportedDate' | 'conversionId' | 'currency' | 'notesToUser'>[] = [
    {
        userId: EXAMPLE_USER_ID_1, storeId: 'amazon', storeName: 'Amazon', clickId: 'click_seed_amazon_echo', orderId: 'AMZ-ORDER-SEED-001', productDetails: 'Echo Dot (5th Gen)',
        transactionDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), saleAmount: 4499, initialCashbackAmount: 100, // Based on product-specific flat ₹100
        cashbackRateApplied: "Flat ₹100 CB", finalSaleAmount: 4499, finalCashbackAmount: 100, status: 'pending' as CashbackStatus,
        adminNotes: 'Auto-seeded pending transaction for Echo Dot (product-specific CB).'
    },
    {
        userId: EXAMPLE_USER_ID_1, storeId: 'myntra', storeName: 'Myntra', clickId: 'click_seed_myntra_coupon', orderId: 'MYN-ORDER-SEED-002', productDetails: 'Various Fashion Items (Myntra200 coupon used)',
        transactionDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), saleAmount: 3000, initialCashbackAmount: 240, // Assuming 8% store rate
        cashbackRateApplied: "Flat 8%", finalSaleAmount: 3000, finalCashbackAmount: 240, status: 'confirmed' as CashbackStatus,
        adminNotes: 'Auto-seeded confirmed transaction for Myntra fashion.'
    },
    {
        userId: EXAMPLE_USER_ID_2, storeId: 'flipkart', storeName: 'Flipkart', clickId: 'click_seed_flipkart_galaxy', orderId: 'FLIP-ORDER-SEED-003', productDetails: 'Samsung Galaxy F54 5G',
        transactionDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), saleAmount: 22999, initialCashbackAmount: 459.98, // Based on product-specific 2%
        cashbackRateApplied: "2% CB", finalSaleAmount: 22999, finalCashbackAmount: 459.98, status: 'pending' as CashbackStatus,
        adminNotes: 'Auto-seeded pending transaction for Galaxy F54 (product-specific CB).'
    },
     {
        userId: EXAMPLE_USER_ID_1, storeId: 'flipkart', storeName: 'Flipkart', orderId: 'FLIP-ORDER-SEED-004', productDetails: 'Books and Stationery',
        transactionDate: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), saleAmount: 2000, initialCashbackAmount: 130, // Assuming 6.5% store rate
        cashbackRateApplied: "Up to 6.5%", finalSaleAmount: 2000, finalCashbackAmount: 130, status: 'confirmed' as CashbackStatus,
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
  const nowServerTimestamp = serverTimestamp();

  const processCollection = async <T extends { id?: string, slug?: string, name?: string, title?: string }>(
    batch: WriteBatch,
    collectionName: string,
    data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>[],
    idFieldProperty: keyof T = 'slug' as keyof T,
    generateIdFromField?: keyof T
  ) => {
    console.log(`Processing ${collectionName}...`);
    for (const item of data) {
      const docId = (item as any)[idFieldProperty] || (generateIdFromField ? (item as any)[generateIdFromField]?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') : null) || uuidv4();
      if (!docId) {
        console.warn(`  - Skipping item in ${collectionName} due to missing ID property:`, item);
        continue;
      }
      const itemRef = doc(db, collectionName, docId);
      const dataToSet: any = {
        ...item,
        id: docId, // Ensure the ID is part of the document data as well for easier querying if needed
        createdAt: nowServerTimestamp,
        updatedAt: nowServerTimestamp,
      };
      // Set defaults if not present
      dataToSet.isActive = (item as any).isActive === undefined ? true : (item as any).isActive;
      if (['stores', 'products', 'coupons'].includes(collectionName)) {
        dataToSet.isFeatured = (item as any).isFeatured === undefined ? false : (item as any).isFeatured;
      }
      if (collectionName === 'stores') {
        dataToSet.isTodaysDeal = (item as any).isTodaysDeal === undefined ? false : (item as any).isTodaysDeal;
      }
      if (collectionName === 'products') {
        dataToSet.isTodaysPick = (item as any).isTodaysPick === undefined ? false : (item as any).isTodaysPick;
        // ensure product-specific cashback details are null if not provided
        dataToSet.productSpecificCashbackDisplay = (item as any).productSpecificCashbackDisplay || null;
        dataToSet.productSpecificCashbackRateValue = (item as any).productSpecificCashbackRateValue ?? null;
        dataToSet.productSpecificCashbackType = (item as any).productSpecificCashbackType || null;
      }

      batch.set(itemRef, dataToSet, { merge: true }); // Use merge:true to update if exists, or create if not
      writeCount++;
      console.log(`  - Queued ${collectionName}: ${(item as any).name || (item as any).title || docId}`);
    }
  };

  await processCollection(mainBatch, 'categories', categoriesData, 'slug', 'name');
  await processCollection(mainBatch, 'stores', storesData, 'slug', 'name');
  await processCollection(mainBatch, 'products', productsData, 'id', 'name'); // Assuming products will have unique name-based slugs or UUIDs for ID
  await processCollection(mainBatch, 'coupons', couponsData, 'id', 'description'); // Using description for ID generation as an example, UUID is better
  await processCollection(mainBatch, 'banners', bannersData, 'id', 'title');

  // Seed Clicks
  console.log("Processing clicks...");
  const seededClicks: Click[] = [];
  for (const [index, clickItemBase] of exampleClicksBase.entries()) {
    // Try to find corresponding product to get cashback details
    const relatedProduct = productsData.find(p => p.name === clickItemBase.productName);
    const clickId = `click_seed_${clickItemBase.storeId}_${index}_${uuidv4().substring(0,4)}`;
    const clickRef = doc(db, 'clicks', clickId);
    const clickData: Click = {
      ...clickItemBase,
      id: clickId,
      clickId: clickId,
      timestamp: Timestamp.fromDate(new Date(Date.now() - (index + 1) * 60 * 60 * 1000 * 24)), // Stagger timestamps
      userAgent: 'SeedScript/1.0',
      clickedCashbackDisplay: relatedProduct?.productSpecificCashbackDisplay || null,
      clickedCashbackRateValue: relatedProduct?.productSpecificCashbackRateValue ?? null,
      clickedCashbackType: relatedProduct?.productSpecificCashbackType || null,
    };
    mainBatch.set(clickRef, clickData, { merge: true });
    writeCount++;
    console.log(`  - Queued click: ${clickId}`);
    seededClicks.push(clickData);
  }

  // Seed Conversions
  console.log("Processing conversions...");
  const seededConversions: Conversion[] = [];
  for (const [index, convItemBase] of exampleConversionsBase.entries()) {
    const convId = `conv_seed_${convItemBase.orderId}_${index}`;
    const convRef = doc(db, 'conversions', convId);
    const originalClick = seededClicks.find(c => c.clickId === convItemBase.clickId);

    const conversionData: Conversion = {
      ...convItemBase,
      id: convId,
      originalClickFirebaseId: originalClick?.id || null,
      status: originalClick ? 'received' : 'unmatched_click',
      timestamp: Timestamp.fromDate(new Date(Date.now() - (index + 1) * 60 * 60 * 1000 * 20)), // Stagger timestamps
      postbackData: { simulated: true, ...convItemBase },
    };
    mainBatch.set(convRef, conversionData, { merge: true });
    writeCount++;
    console.log(`  - Queued conversion: ${convId} for click ${convItemBase.clickId}`);
    seededConversions.push(conversionData);
  }

  if (writeCount > 0) {
    try {
      await mainBatch.commit();
      console.log(`Successfully committed ${writeCount} item writes (categories, stores, products, clicks, conversions, etc.).`);
      writeCount = 0;
    } catch (error) {
      console.error("Error committing batch:", error);
      return;
    }
  } else {
    console.log("No new base items (categories, stores, etc.) to add/update or they already existed.");
  }

  // Seed Users and Transactions (requires transactions to be atomic per user for balance updates)
  const seedUserAndTransactions = async (uid: string, role: 'admin' | 'user', displayName: string, emailSuffix: string, transactionsForUser: typeof exampleTransactionsBase) => {
    console.log(`Seeding user and transactions for UID: ${uid}, Role: ${role}...`);
    const userRef = doc(db, 'users', uid);
    const email = `${emailSuffix}@magicsaver.example.com`;

    try {
      await runTransaction(db, async (firestoreTransaction) => {
        const userDocSnap = await firestoreTransaction.get(userRef);
        let pendingCashback = 0;
        let cashbackBalance = 0;
        let lifetimeCashback = 0;

        if (!userDocSnap.exists()) {
          const profileData: UserProfile = {
            uid, email, displayName, photoURL: null, role,
            cashbackBalance: 0, pendingCashback: 0, lifetimeCashback: 0, // Start with 0, transactions will update
            referralCode: uuidv4().substring(0, 8).toUpperCase(),
            referralCount: 0, referralBonusEarned: 0, referredBy: null,
            isDisabled: false, createdAt: serverTimestamp() as Timestamp,
            updatedAt: serverTimestamp() as Timestamp,
            lastPayoutRequestAt: null, payoutDetails: null,
          };
          firestoreTransaction.set(userRef, profileData);
          console.log(`  - Added ${role} profile for UID: ${uid}. Balances will be calculated from transactions.`);
        } else {
          // If user exists, we might reset their balances before recalculating from transactions
          // For simplicity in seeding, let's assume we are recalculating based on provided exampleTransactionsBase
          firestoreTransaction.update(userRef, { 
            role, displayName, email, 
            pendingCashback: 0, cashbackBalance: 0, lifetimeCashback: 0, // Reset before summing
            updatedAt: serverTimestamp() 
          });
          console.log(`  - Existing ${role} profile for UID: ${uid} found. Balances will be recalculated.`);
        }

        // Add transactions for this user and update their calculated balances
        for (const [index, txItemBase] of transactionsForUser.entries()) {
          if (txItemBase.userId !== uid) continue;

          const transactionId = `txn_seed_${uid.substring(0,5)}_${txItemBase.orderId || index}`;
          const transactionRef = doc(db, 'transactions', transactionId);
          
          const relatedConversion = seededConversions.find(c => c.clickId === txItemBase.clickId && c.orderId === txItemBase.orderId);

          const transactionData: Transaction = {
            ...txItemBase,
            id: transactionId,
            conversionId: relatedConversion?.id || null,
            currency: 'INR',
            transactionDate: Timestamp.fromDate(txItemBase.transactionDate as Date),
            reportedDate: serverTimestamp() as Timestamp,
            confirmationDate: txItemBase.status === 'confirmed' ? (serverTimestamp() as Timestamp) : null,
            paidDate: null,
            payoutId: null,
            notesToUser: `Cashback for your order at ${txItemBase.storeName}.`,
            createdAt: serverTimestamp() as Timestamp,
            updatedAt: serverTimestamp() as Timestamp,
          };
          firestoreTransaction.set(transactionRef, transactionData, {merge: true});

          if (transactionData.status === 'pending') {
            pendingCashback += transactionData.initialCashbackAmount || 0;
          } else if (transactionData.status === 'confirmed') {
            cashbackBalance += transactionData.initialCashbackAmount || 0;
            lifetimeCashback += transactionData.initialCashbackAmount || 0;
          }
        }
        
        // Update user profile with calculated balances
        firestoreTransaction.update(userRef, {
            pendingCashback: increment(pendingCashback), // Use increment in case userDocSnap wasn't fresh
            cashbackBalance: increment(cashbackBalance),
            lifetimeCashback: increment(lifetimeCashback),
            updatedAt: serverTimestamp()
        });
        console.log(`  - User ${uid} balances updated: Pending: ${pendingCashback}, Confirmed: ${cashbackBalance}, Lifetime: ${lifetimeCashback}`);
      });
    } catch (e) {
      console.error(`Error seeding user ${uid} and their transactions: `, e);
    }
  };
  
  await seedUserAndTransactions(INITIAL_ADMIN_UID, 'admin', 'MagicSaver Admin', `admin_${INITIAL_ADMIN_UID.substring(0,5)}`, exampleTransactionsBase);
  await seedUserAndTransactions(EXAMPLE_USER_ID_1, 'user', 'Test User One', `user1_${EXAMPLE_USER_ID_1.substring(0,5)}`, exampleTransactionsBase);
  await seedUserAndTransactions(EXAMPLE_USER_ID_2, 'user', 'Test User Two', `user2_${EXAMPLE_USER_ID_2.substring(0,5)}`, exampleTransactionsBase);

  console.log("Database seeding finished.");
}
