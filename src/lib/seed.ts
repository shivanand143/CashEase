
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
    { name: 'Amazon', slug: "amazon", logoUrl: 'https://placehold.co/120x60/FF9900/000000.png?text=Amazon', heroImageUrl: 'https://placehold.co/1200x300/FF9900/000000.png?text=Amazon+Deals', dataAiHint: 'amazon logo', affiliateLink: 'https://www.amazon.in/?tag=magicsaver-21&click_id={CLICK_ID}', cashbackRate: 'Up to 7%', cashbackRateValue: 7, cashbackType: 'percentage', description: 'Wide range of products.', categories: ['electronics', 'fashion', 'home-kitchen', 'books-media'], isFeatured: true, isActive: true, isTodaysDeal: true, terms: 'Cashback varies by category. Read T&Cs on store page.' },
    { name: 'Flipkart', slug: "flipkart", logoUrl: 'https://placehold.co/120x60/2874F0/ffffff.png?text=Flipkart', heroImageUrl: 'https://placehold.co/1200x300/2874F0/ffffff.png?text=Flipkart+Big+Saving+Days', dataAiHint: 'flipkart logo', affiliateLink: 'https://www.flipkart.com/?affid=magicsaver&affExtParam1={CLICK_ID}', cashbackRate: 'Up to 6.5%', cashbackRateValue: 6.5, cashbackType: 'percentage', description: 'India\'s leading online store.', categories: ['electronics', 'fashion', 'home-kitchen'], isFeatured: true, isActive: true, isTodaysDeal: false, terms: 'Rates differ for new/existing users. Check offer terms.' },
    { name: 'Myntra', slug: "myntra", logoUrl: 'https://placehold.co/120x60/E84A5F/ffffff.png?text=Myntra', heroImageUrl: 'https://placehold.co/1200x300/E84A5F/ffffff.png?text=Myntra+Fashion+Carnival', dataAiHint: 'myntra fashion', affiliateLink: 'https://www.myntra.com/?ref=magicsaver&click_id={CLICK_ID}', cashbackRate: 'Flat 8%', cashbackRateValue: 8, cashbackType: 'percentage', description: 'Top fashion destination.', categories: ['fashion', 'beauty'], isFeatured: false, isActive: true, isTodaysDeal: true },
    { name: 'Ajio', slug: "ajio", logoUrl: 'https://placehold.co/120x60/000000/ffffff.png?text=AJIO', heroImageUrl: 'https://placehold.co/1200x300/00A2A2/ffffff.png?text=AJIO+Style+Specials', dataAiHint: 'ajio fashion', affiliateLink: 'https://www.ajio.com/?source=magicsaver&click_id={CLICK_ID}', cashbackRate: 'Up to 10%', cashbackRateValue: 10, cashbackType: 'percentage', description: 'Curated fashion and lifestyle.', categories: ['fashion'], isFeatured: true, isActive: true, isTodaysDeal: false },
];

const productsData: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'storeName'>[] = [
  { storeId: 'amazon', name: 'Echo Dot (5th Gen, 2023 release)', description: 'Smart speaker with Alexa.', imageUrl: 'https://placehold.co/300x300/000000/ffffff.png?text=Echo+5', dataAiHint: 'smart speaker', affiliateLink: 'https://www.amazon.in/dp/B09B8X2SQL?tag=magicsaver-21&click_id={CLICK_ID}', price: 4499, category: 'electronics', isActive: true, isFeatured: true, isTodaysPick: true, productSpecificCashbackDisplay: "Flat ₹100 CB", productSpecificCashbackRateValue: 100, productSpecificCashbackType: "fixed" },
  { storeId: 'flipkart', name: 'Samsung Galaxy F54 5G (256 GB)', description: 'Powerful 5G smartphone.', imageUrl: 'https://placehold.co/300x300/007bff/ffffff.png?text=Galaxy+F54', dataAiHint: 'samsung phone', affiliateLink: 'https://www.flipkart.com/samsung-galaxy-f54-5g/p/itm3f62bd8d719c7?pid=MOBGDR4BYTRG5JFA&affid=magicsaver&click_id={CLICK_ID}', price: 22999, category: 'electronics', isActive: true, isFeatured: true, isTodaysPick: true, productSpecificCashbackDisplay: "2% CB", productSpecificCashbackRateValue: 2, productSpecificCashbackType: "percentage" },
  { storeId: 'myntra', name: 'PUMA Men Smash Vulc Casual Shoes', description: 'Stylish Puma sneakers.', imageUrl: 'https://placehold.co/300x300/e83e8c/ffffff.png?text=Puma+Shoes', dataAiHint: 'puma sneakers', affiliateLink: 'https://www.myntra.com/casual-shoes/puma/puma-men-smash-vulc-casual-shoes/1038100/buy?ref=magicsaver&click_id={CLICK_ID}', price: 2499, category: 'fashion', isActive: true, isFeatured: true, isTodaysPick: false },
  { storeId: 'ajio', name: 'LEVIS Mens 512 Slim Taper Fit Jeans', description: 'Classic Levis jeans.', imageUrl: 'https://placehold.co/300x300/17a2b8/ffffff.png?text=Levis+Jeans', dataAiHint: 'levis jeans', affiliateLink: 'https://www.ajio.com/levis-men-jeans/p/462800000_blue?source=magicsaver&click_id={CLICK_ID}', price: 1799, category: 'fashion', isActive: true, isFeatured: true, isTodaysPick: true, productSpecificCashbackDisplay: "5% Extra CB", productSpecificCashbackRateValue: 5, productSpecificCashbackType: "percentage" },
  { storeId: 'amazon', name: 'OnePlus Bullets Z2 Earphones', description: 'Wireless earphones.', imageUrl: 'https://placehold.co/300x300/6c757d/ffffff.png?text=OnePlus+Z2', dataAiHint: 'wireless earphones', affiliateLink: 'https://www.amazon.in/dp/B0B3MNY99S?tag=magicsaver-21&click_id={CLICK_ID}', price: 1999, category: 'electronics', isActive: true, isFeatured: false, isTodaysPick: true },
];

const couponsData: Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'store'>[] = [
  { storeId: 'amazon', code: 'AMZDEAL10', description: 'Extra 10% off select Amazon Fashion. Max discount ₹200.', link: 'https://www.amazon.in/fashion?tag=magicsaver-21&click_id={CLICK_ID}', expiryDate: Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)), isFeatured: true, isActive: true },
  { storeId: 'flipkart', code: null, description: 'Flipkart Electronics Sale - Up to 80% Off.', link: 'https://www.flipkart.com/electronics-sale?affid=magicsaver&click_id={CLICK_ID}', expiryDate: Timestamp.fromDate(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)), isFeatured: true, isActive: true },
  { storeId: 'myntra', code: 'MYNTRA200', description: 'Flat ₹200 off on ₹1999+ for new users.', link: 'https://www.myntra.com/?ref=magicsaver&click_id={CLICK_ID}', expiryDate: null, isFeatured: false, isActive: true },
  { storeId: 'ajio', code: 'AJIOSALE', description: 'Get 50-70% off on AJIO Fashion Sale.', link: 'https://www.ajio.com/sale?source=magicsaver&click_id={CLICK_ID}', expiryDate: Timestamp.fromDate(new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)), isFeatured: true, isActive: true },
];

const bannersData: Omit<Banner, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { title: 'Mega Electronics Sale', subtitle: 'Up to 50% off + Extra 5% Cashback', imageUrl: 'https://placehold.co/1200x400/28a745/ffffff.png?text=Electronics+Sale', dataAiHint: 'electronics sale', link: '/category/electronics', order: 1, isActive: true },
  { title: 'Fashion Frenzy Fest', subtitle: 'Get 60-80% off + Assured Cashback', imageUrl: 'https://placehold.co/1200x400/007bff/ffffff.png?text=Fashion+Fest', dataAiHint: 'fashion clothing', link: '/category/fashion', order: 2, isActive: true },
];

// Example Clicks (will have IDs generated)
const exampleClicksBase: Omit<Click, 'id' | 'timestamp' | 'userAgent' | 'clickedCashbackDisplay' | 'clickedCashbackRateValue' | 'clickedCashbackType'>[] = [
  { clickId: 'click_seed_amazon_echo', userId: EXAMPLE_USER_ID_1, storeId: 'amazon', storeName: 'Amazon', affiliateLink: 'https://www.amazon.in/dp/B09B8X2SQL?tag=magicsaver-21&click_id=click_seed_amazon_echo', originalLink: 'https://www.amazon.in/dp/B09B8X2SQL', productId: productsData.find(p=>p.name.includes("Echo Dot"))?.storeId || 'echo-dot-seed-id', productName: 'Echo Dot (5th Gen, 2023 release)' },
  { clickId: 'click_seed_myntra_coupon', userId: EXAMPLE_USER_ID_1, storeId: 'myntra', storeName: 'Myntra', affiliateLink: 'https://www.myntra.com/?ref=magicsaver&click_id=click_seed_myntra_coupon', originalLink: 'https://www.myntra.com/', couponId: couponsData.find(c=>c.code==='MYNTRA200')?.storeId || 'myntra200-seed-id' },
  { clickId: 'click_seed_flipkart_galaxy', userId: EXAMPLE_USER_ID_2, storeId: 'flipkart', storeName: 'Flipkart', affiliateLink: 'https://www.flipkart.com/samsung-galaxy-f54-5g/p/itm3f62bd8d719c7?pid=MOBGDR4BYTRG5JFA&affid=magicsaver&click_id=click_seed_flipkart_galaxy', originalLink: 'https://www.flipkart.com/samsung-galaxy-f54-5g/p/itm3f62bd8d719c7', productId: productsData.find(p=>p.name.includes("Samsung Galaxy"))?.storeId || 'galaxy-f54-seed-id', productName: 'Samsung Galaxy F54 5G (256 GB)' },
];

// Example Conversions (will have IDs generated)
const exampleConversionsBase: Omit<Conversion, 'id' | 'timestamp' | 'postbackData' | 'status' | 'originalClickFirebaseId'>[] = [
    { clickId: 'click_seed_amazon_echo', userId: EXAMPLE_USER_ID_1, storeId: 'amazon', storeName: 'Amazon', orderId: 'AMZ-ORDER-SEED-001', saleAmount: 4499 },
    { clickId: 'click_seed_myntra_coupon', userId: EXAMPLE_USER_ID_1, storeId: 'myntra', storeName: 'Myntra', orderId: 'MYN-ORDER-SEED-002', saleAmount: 3000 },
    { clickId: 'click_seed_flipkart_galaxy', userId: EXAMPLE_USER_ID_2, storeId: 'flipkart', storeName: 'Flipkart', orderId: 'FLIP-ORDER-SEED-003', saleAmount: 22999 },
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

  const processCollection = async <T extends { id?: string, slug?: string | null, name?: string, title?: string | null }>(
    batch: WriteBatch,
    collectionName: string,
    data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>[],
    idFieldProperty: keyof T = 'slug' as unknown as keyof T,
    generateIdFromField?: keyof T
  ) => {
    console.log(`Processing ${collectionName}...`);
    for (const item of data) {
      const docIdFieldValue = (item as any)[idFieldProperty];
      const docId = (docIdFieldValue !== null && docIdFieldValue !== undefined) 
        ? String(docIdFieldValue) 
        : (generateIdFromField ? String((item as any)[generateIdFromField] ?? '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') : null) || uuidv4();

      if (!docId) {
        console.warn(`  - Skipping item in ${collectionName} due to missing ID property:`, item);
        continue;
      }
      const itemRef = doc(db!, collectionName, docId);
      // Assign the determined docId back to the item if it's a product or coupon for linking
      if (collectionName === 'products' || collectionName === 'coupons') {
        (item as any).id = docId;
      }

      const dataToSet: any = {
        ...item,
        id: docId,
        createdAt: nowServerTimestamp,
        updatedAt: nowServerTimestamp,
      };
      dataToSet.isActive = (item as any).isActive === undefined ? true : (item as any).isActive;
      if (['stores', 'products', 'coupons'].includes(collectionName)) {
        dataToSet.isFeatured = (item as any).isFeatured === undefined ? false : (item as any).isFeatured;
      }
      if (collectionName === 'stores') {
        dataToSet.isTodaysDeal = (item as any).isTodaysDeal === undefined ? false : (item as any).isTodaysDeal;
      }
      if (collectionName === 'products') {
        dataToSet.isTodaysPick = (item as any).isTodaysPick === undefined ? false : (item as any).isTodaysPick;
        dataToSet.productSpecificCashbackDisplay = (item as any).productSpecificCashbackDisplay || null;
        dataToSet.productSpecificCashbackRateValue = (item as any).productSpecificCashbackRateValue ?? null;
        dataToSet.productSpecificCashbackType = (item as any).productSpecificCashbackType || null;
      }

      batch.set(itemRef, dataToSet, { merge: true });
      writeCount++;
      console.log(`  - Queued ${collectionName}: ${(item as any).name || (item as any).title || docId}`);
    }
  };

  await processCollection(mainBatch, 'categories', categoriesData, 'slug', 'name');
  await processCollection(mainBatch, 'stores', storesData, 'slug', 'name');
  // For products and coupons, it's better to ensure their IDs are unique if not provided, so default to uuidv4()
  await processCollection(mainBatch, 'products', productsData, 'id', 'name');
  await processCollection(mainBatch, 'coupons', couponsData, 'id', 'description');
  await processCollection(mainBatch, 'banners', bannersData, 'id', 'title');

  // Seed Clicks
  console.log("Processing clicks...");
  const seededClicks: Click[] = [];
  for (const clickItemBase of exampleClicksBase) {
    const clickDocRef = doc(db, 'clicks', clickItemBase.clickId); // Use the predefined clickId as document ID
    const relatedProduct = productsData.find(p => p.name === clickItemBase.productName);
    const clickData: Click = {
      ...clickItemBase,
      id: clickItemBase.clickId, // Ensure 'id' field matches document ID
      timestamp: Timestamp.fromDate(new Date(Date.now() - Math.floor(Math.random() * 10 + 1) * 24 * 60 * 60 * 1000)), // Randomize timestamp slightly
      userAgent: 'SeedScript/1.0',
      clickedCashbackDisplay: relatedProduct?.productSpecificCashbackDisplay || null,
      clickedCashbackRateValue: relatedProduct?.productSpecificCashbackRateValue ?? null,
      clickedCashbackType: relatedProduct?.productSpecificCashbackType || null,
    };
    mainBatch.set(clickDocRef, clickData, { merge: true });
    writeCount++;
    console.log(`  - Queued click: ${clickData.clickId}`);
    seededClicks.push(clickData);
  }

  // Seed Conversions
  console.log("Processing conversions...");
  const seededConversions: Conversion[] = [];
  for (const convItemBase of exampleConversionsBase) {
    const originalClickDoc = seededClicks.find(c => c.clickId === convItemBase.clickId);
    const convId = `conv_${convItemBase.orderId}_${uuidv4().substring(0,4)}`;
    const convDocRef = doc(db, 'conversions', convId);
    const conversionData: Conversion = {
      ...convItemBase,
      id: convId,
      originalClickFirebaseId: originalClickDoc?.id || null, // This is the Firestore Document ID of the click
      userId: originalClickDoc?.userId || null, // Populate from matched click
      storeId: originalClickDoc?.storeId || null, // Populate from matched click
      status: originalClickDoc ? 'received' : 'unmatched_click',
      timestamp: Timestamp.fromDate(new Date(Date.now() - Math.floor(Math.random() * 5 + 1) * 24 * 60 * 60 * 1000)),
      postbackData: { simulated: true, ...convItemBase },
    };
    mainBatch.set(convDocRef, conversionData, { merge: true });
    writeCount++;
    console.log(`  - Queued conversion: ${convId} for click ${convItemBase.clickId}`);
    seededConversions.push(conversionData);
  }

  // Commit initial batch
  if (writeCount > 0) {
    try {
      await mainBatch.commit();
      console.log(`Successfully committed ${writeCount} initial item writes (categories, stores, etc.).`);
      writeCount = 0; // Reset for next batch operations
    } catch (error) {
      console.error("Error committing initial batch:", error);
      return; // Stop if initial seeding fails
    }
  }

  // Seed Users and then their Transactions (to ensure users exist first)
  const userProfilesToSeed = [
    { uid: INITIAL_ADMIN_UID, role: 'admin' as 'admin' | 'user', displayName: 'MagicSaver Admin', emailSuffix: `admin_${INITIAL_ADMIN_UID.substring(0,5)}` },
    { uid: EXAMPLE_USER_ID_1, role: 'user' as 'admin' | 'user', displayName: 'Test User One', emailSuffix: `user1_${EXAMPLE_USER_ID_1.substring(0,5)}` },
    { uid: EXAMPLE_USER_ID_2, role: 'user' as 'admin' | 'user', displayName: 'Test User Two', emailSuffix: `user2_${EXAMPLE_USER_ID_2.substring(0,5)}` },
  ];

  for (const userData of userProfilesToSeed) {
    console.log(`Processing user: ${userData.uid}`);
    const userRef = doc(db, 'users', userData.uid);
    const userEmail = `${userData.emailSuffix}@magicsaver.example.com`;
    // Use runTransaction for user creation/update and their transactions
    try {
      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        let userProfileData: UserProfile;

        if (!userDoc.exists()) {
          userProfileData = {
            uid: userData.uid, email: userEmail, displayName: userData.displayName, photoURL: null, role: userData.role,
            cashbackBalance: 0, pendingCashback: 0, lifetimeCashback: 0,
            referralCode: uuidv4().substring(0, 8).toUpperCase(), referralCount: 0, referralBonusEarned: 0, referredBy: null,
            isDisabled: false, createdAt: serverTimestamp() as Timestamp, updatedAt: serverTimestamp() as Timestamp,
            lastPayoutRequestAt: null, payoutDetails: null,
          };
          transaction.set(userRef, userProfileData);
          console.log(`  - User profile CREATED for ${userData.uid}`);
        } else {
          userProfileData = userDoc.data() as UserProfile;
           // Reset balances to ensure seed consistency
          userProfileData.pendingCashback = 0;
          userProfileData.cashbackBalance = 0;
          userProfileData.lifetimeCashback = 0;
          transaction.update(userRef, {
            displayName: userData.displayName, email: userEmail, role: userData.role,
            pendingCashback: 0, cashbackBalance: 0, lifetimeCashback: 0,
            updatedAt: serverTimestamp()
          });
          console.log(`  - User profile UPDATED (balances reset) for ${userData.uid}`);
        }

        // Process transactions for this user based on conversions
        let userPendingCashback = 0;
        let userCashbackBalance = 0;
        let userLifetimeCashback = 0;

        const userConversions = seededConversions.filter(c => c.userId === userData.uid && c.status === 'received');
        for (const conv of userConversions) {
          const txId = `txn_${conv.orderId}_${uuidv4().substring(0,4)}`;
          const txRef = doc(db!, 'transactions', txId);

          const originalClick = seededClicks.find(c => c.clickId === conv.clickId);
          let initialCashback = 0;
          let rateApplied = "Store Default";

          if (originalClick?.clickedCashbackRateValue != null && originalClick?.clickedCashbackType) {
            rateApplied = originalClick.clickedCashbackDisplay || "Product Specific";
            if (originalClick.clickedCashbackType === 'fixed') {
              initialCashback = originalClick.clickedCashbackRateValue;
            } else {
              initialCashback = (conv.saleAmount * originalClick.clickedCashbackRateValue) / 100;
            }
          } else if (originalClick?.storeId) {
            const storeData = storesData.find(s => s.slug === originalClick.storeId); // Assuming slug is storeId
            if (storeData) {
              rateApplied = storeData.cashbackRate;
              if (storeData.cashbackType === 'fixed') {
                initialCashback = storeData.cashbackRateValue;
              } else {
                initialCashback = (conv.saleAmount * storeData.cashbackRateValue) / 100;
              }
            }
          }
          initialCashback = parseFloat(initialCashback.toFixed(2));

          // Example: 50% of transactions are pending, 50% are confirmed for seed
          const status: CashbackStatus = Math.random() < 0.5 ? 'pending' : 'confirmed';

          const transactionData: Omit<Transaction, 'id'> = {
            userId: userData.uid, storeId: conv.storeId!, storeName: conv.storeName, orderId: conv.orderId,
            clickId: conv.clickId, conversionId: conv.id, productDetails: originalClick?.productName || originalClick?.couponId || "Purchase",
            transactionDate: Timestamp.fromDate(conv.timestamp as Date), // Conversion timestamp is already a Date here due to earlier processing
            reportedDate: serverTimestamp() as Timestamp,
            saleAmount: conv.saleAmount, cashbackRateApplied: rateApplied, initialCashbackAmount: initialCashback,
            finalSaleAmount: conv.saleAmount, finalCashbackAmount: initialCashback, status: status,
            confirmationDate: status === 'confirmed' ? (serverTimestamp() as Timestamp) : null,
            paidDate: null, payoutId: null, rejectionReason: null, adminNotes: "Auto-seeded transaction.",
            notesToUser: `Cashback for order ${conv.orderId} from ${conv.storeName}.`,
            createdAt: serverTimestamp() as Timestamp, updatedAt: serverTimestamp() as Timestamp,
          };
          transaction.set(txRef, transactionData);
          console.log(`    - Queued transaction ${txId} for user ${userData.uid} with status ${status} and cashback ${initialCashback}`);

          if (status === 'pending') {
            userPendingCashback += initialCashback;
          } else if (status === 'confirmed') {
            userCashbackBalance += initialCashback;
            userLifetimeCashback += initialCashback;
          }
        }
        // Update user balances based on these new transactions
        transaction.update(userRef, {
          pendingCashback: increment(userPendingCashback),
          cashbackBalance: increment(userCashbackBalance),
          lifetimeCashback: increment(userLifetimeCashback),
          updatedAt: serverTimestamp()
        });
        console.log(`  - Finalized balance updates for ${userData.uid}: Pending +${userPendingCashback}, Balance +${userCashbackBalance}, Lifetime +${userLifetimeCashback}`);
      }); // End of runTransaction
      console.log(`Successfully processed user ${userData.uid} and their transactions.`);
    } catch (error) {
      console.error(`Error processing user ${userData.uid}:`, error);
    }
  }
  console.log("Database seeding finished.");
}

// If running this file directly (e.g., `ts-node src/lib/seed.ts`)
if (require.main === module) {
  seedDatabase().then(() => {
    console.log("Seeding script completed.");
    process.exit(0);
  }).catch(error => {
    console.error("Seeding script failed:", error);
    process.exit(1);
  });
}
