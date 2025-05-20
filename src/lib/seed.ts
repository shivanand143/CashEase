
// src/lib/seed.ts
import { collection, doc, setDoc, getDoc, serverTimestamp, writeBatch, Timestamp, addDoc, increment, runTransaction, query, where, limit, getDocs } from 'firebase/firestore';
import { db, firebaseInitializationError } from './firebase/config';
import type { Store, Coupon, Category, Banner, UserProfile, Product, Click, Transaction, CashbackStatus } from './types';
import { v4 as uuidv4 } from 'uuid';

const INITIAL_ADMIN_UID = process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID || "testAdminUser123";
const EXAMPLE_USER_ID_1 = "testUser001";
const EXAMPLE_USER_ID_2 = "testUser002";

const categoriesData: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { name: 'Fashion', slug: 'fashion', description: 'Latest trends in clothing and accessories.', order: 1, imageUrl: 'https://placehold.co/100x100/007bff/ffffff.png?text=Fashion', dataAiHint: "clothing fashion", isActive: true },
  { name: 'Electronics', slug: 'electronics', description: 'Gadgets, appliances, and more.', order: 2, imageUrl: 'https://placehold.co/100x100/28a745/ffffff.png?text=Electronics', dataAiHint: "gadgets electronics", isActive: true },
  { name: 'Travel', slug: 'travel', description: 'Flights, hotels, and holiday packages.', order: 3, imageUrl: 'https://placehold.co/100x100/ffc107/000000.png?text=Travel', dataAiHint: "vacation travel", isActive: true },
  { name: 'Beauty', slug: 'beauty', description: 'Skincare, makeup, and personal care.', order: 4, imageUrl: 'https://placehold.co/100x100/dc3545/ffffff.png?text=Beauty', dataAiHint: "cosmetics makeup", isActive: true },
];

const storesData: Omit<Store, 'id' | 'createdAt' | 'updatedAt'>[] = [
    { name: 'Amazon', slug: "amazon", logoUrl: 'https://placehold.co/120x60/FF9900/000000.png?text=Amazon', heroImageUrl: 'https://placehold.co/1200x300/000000/ffffff.png?text=Amazon+Deals', dataAiHint: 'amazon logo', affiliateLink: 'https://www.amazon.in/?tag=magicsaver-21&subid={CLICK_ID}', cashbackRate: 'Up to 7%', cashbackRateValue: 7, cashbackType: 'percentage', description: 'Wide range of products.', categories: ['electronics', 'fashion'], isFeatured: true, isActive: true, isTodaysDeal: true, terms: 'Cashback varies by category.' },
    { name: 'Flipkart', slug: "flipkart", logoUrl: 'https://placehold.co/120x60/2874F0/ffffff.png?text=Flipkart', heroImageUrl: 'https://placehold.co/1200x300/2874F0/ffffff.png?text=Flipkart+Offers', dataAiHint: 'flipkart logo', affiliateLink: 'https://www.flipkart.com/?affid=magicsaver&subid={CLICK_ID}', cashbackRate: 'Up to 6.5%', cashbackRateValue: 6.5, cashbackType: 'percentage', description: 'India\'s leading online store.', categories: ['electronics', 'fashion'], isFeatured: true, isActive: true, isTodaysDeal: false, terms: 'Rates differ for new/existing users.' },
    { name: 'Myntra', slug: "myntra", logoUrl: 'https://placehold.co/120x60/E84A5F/ffffff.png?text=Myntra', heroImageUrl: 'https://placehold.co/1200x300/E84A5F/ffffff.png?text=Myntra+Fashion', dataAiHint: 'myntra fashion', affiliateLink: 'https://www.myntra.com/?ref=magicsaver&subid={CLICK_ID}', cashbackRate: 'Flat 8%', cashbackRateValue: 8, cashbackType: 'percentage', description: 'Top fashion destination.', categories: ['fashion', 'beauty'], isFeatured: false, isActive: true, isTodaysDeal: true },
];

const productsData: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'storeName'>[] = [
  { storeId: 'amazon', name: 'Echo Dot (5th Gen)', description: 'Smart speaker with Alexa.', imageUrl: 'https://placehold.co/300x300/000000/ffffff.png?text=Echo+5', dataAiHint: 'smart speaker', affiliateLink: 'https://www.amazon.in/dp/B09B8X2SQL?tag=magicsaver-21&subid={CLICK_ID}', price: 4499, category: 'electronics', isActive: true, isFeatured: true, isTodaysPick: true },
  { storeId: 'flipkart', name: 'Samsung Galaxy F54 5G', description: 'Powerful 5G smartphone.', imageUrl: 'https://placehold.co/300x300/007bff/ffffff.png?text=Galaxy+F54', dataAiHint: 'samsung phone', affiliateLink: 'https://www.flipkart.com/samsung-galaxy-f54-5g/p/itm3f62bd8d719c7?pid=MOBGDR4BYTRG5JFA&affid=magicsaver&subid={CLICK_ID}', price: 22999, category: 'electronics', isActive: true, isFeatured: false, isTodaysPick: true },
  { storeId: 'myntra', name: 'PUMA Men Casual Shoes', description: 'Stylish Puma sneakers.', imageUrl: 'https://placehold.co/300x300/e83e8c/ffffff.png?text=Puma+Shoes', dataAiHint: 'puma sneakers', affiliateLink: 'https://www.myntra.com/casual-shoes/puma/puma-men-smash-vulc-casual-shoes/1038100/buy?ref=magicsaver&subid={CLICK_ID}', price: 2499, category: 'fashion', isActive: true, isFeatured: true, isTodaysPick: false },
];

const couponsData: Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'store'>[] = [
  { storeId: 'amazon', code: 'AMZDEAL10', description: 'Extra 10% off select Amazon Fashion.', link: 'https://www.amazon.in/fashion?tag=magicsaver-21&subid={CLICK_ID}', expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), isFeatured: true, isActive: true },
  { storeId: 'flipkart', code: null, description: 'Flipkart Electronics Sale - Up to 80% Off.', link: 'https://www.flipkart.com/electronics-sale?affid=magicsaver&subid={CLICK_ID}', expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), isFeatured: true, isActive: true },
  { storeId: 'myntra', code: 'MYNTRA200', description: 'Flat ₹200 off on ₹1999+ for new users.', link: 'https://www.myntra.com/?ref=magicsaver&subid={CLICK_ID}', expiryDate: null, isFeatured: false, isActive: true },
];

const bannersData: Omit<Banner, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { title: 'Mega Electronics Sale', subtitle: 'Up to 50% off + Extra 5% Cashback', imageUrl: 'https://placehold.co/1200x400/28a745/ffffff.png?text=Electronics+Sale', dataAiHint: 'electronics sale', link: '/category/electronics', order: 1, isActive: true },
  { title: 'Fashion Frenzy Fest', subtitle: 'Get 60-80% off on top fashion brands', imageUrl: 'https://placehold.co/1200x400/007bff/ffffff.png?text=Fashion+Fest', dataAiHint: 'fashion clothing', link: '/category/fashion', order: 2, isActive: true },
];

// Note: Affiliate links in clicksData should already have {CLICK_ID} replaced by actual clickId during click generation.
// For seeding, we simulate this by having a distinct clickId.
const clicksData: Omit<Click, 'id' | 'timestamp' | 'userAgent'>[] = [
    { userId: EXAMPLE_USER_ID_1, storeId: 'amazon', storeName: 'Amazon', affiliateLink: `https://www.amazon.in/dp/B09B8X2SQL?tag=magicsaver-21&subid=clickseed001`, clickId: 'clickseed001', productId: productsData[0].id || 'product-echo-dot', productName: productsData[0].name },
    { userId: EXAMPLE_USER_ID_1, storeId: 'myntra', storeName: 'Myntra', affiliateLink: `https://www.myntra.com/?ref=magicsaver&subid=clickseed002`, clickId: 'clickseed002', couponId: couponsData.find(c => c.storeId === 'myntra')?.id || 'coupon-myntra200' },
    { userId: EXAMPLE_USER_ID_2, storeId: 'flipkart', storeName: 'Flipkart', affiliateLink: `https://www.flipkart.com/samsung-galaxy-f54-5g/p/itm3f62bd8d719c7?pid=MOBGDR4BYTRG5JFA&affid=magicsaver&subid=clickseed003`, clickId: 'clickseed003', productId: productsData[1].id || 'product-galaxy-f54', productName: productsData[1].name },
];

const transactionsData: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'confirmationDate' | 'paidDate' | 'payoutId' | 'reportedDate'>[] = [
    {
        userId: EXAMPLE_USER_ID_1, storeId: 'amazon', storeName: 'Amazon', clickId: 'clickseed001', orderId: 'AMZ-ORDER-SEED-001', productDetails: 'Echo Dot (5th Gen)',
        transactionDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), saleAmount: 4499, cashbackRateApplied: '5% of 2500 subtotal (example)', initialCashbackAmount: 125, currency: 'INR', status: 'pending' as CashbackStatus,
        notesToUser: 'Awaiting confirmation from Amazon for Echo Dot purchase.'
    },
    {
        userId: EXAMPLE_USER_ID_1, storeId: 'myntra', storeName: 'Myntra', clickId: 'clickseed002', orderId: 'MYN-ORDER-SEED-002', productDetails: 'Various Fashion Items',
        transactionDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), saleAmount: 3000, cashbackRateApplied: '8%', initialCashbackAmount: 240, currency: 'INR', status: 'confirmed' as CashbackStatus,
        notesToUser: 'Your Myntra cashback for fashion haul is confirmed!'
    },
    {
        userId: EXAMPLE_USER_ID_2, storeId: 'flipkart', storeName: 'Flipkart', clickId: 'clickseed003', orderId: 'FLIP-ORDER-SEED-003', productDetails: 'Samsung Galaxy F54 5G',
        transactionDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), saleAmount: 22999, cashbackRateApplied: '1.5% (special mobile rate)', initialCashbackAmount: 345, currency: 'INR', status: 'pending' as CashbackStatus,
        notesToUser: 'Tracking your Flipkart Galaxy F54 order.'
    },
     {
        userId: EXAMPLE_USER_ID_1, storeId: 'flipkart', storeName: 'Flipkart', orderId: 'FLIP-ORDER-SEED-004', productDetails: 'Books and Stationery',
        transactionDate: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), saleAmount: 2000, cashbackRateApplied: '5%', initialCashbackAmount: 100, currency: 'INR', status: 'confirmed' as CashbackStatus,
        notesToUser: 'Another confirmed Flipkart cashback for your books order!'
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

  const processCollection = async <T extends { id?: string, slug?: string, name?: string, title?: string, clickId?: string }>(
    collectionName: string,
    data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>[],
    idFieldProperty?: keyof T // e.g., 'slug' for categories/stores, 'clickId' for clicks
  ) => {
    console.log(`Seeding ${collectionName}...`);
    for (const item of data) {
      let docId: string | undefined = undefined;
      if (idFieldProperty && item[idFieldProperty]) {
        docId = item[idFieldProperty] as string;
      } else {
        docId = uuidv4(); // Default to UUID if no specific ID field is provided or found
      }

      if (!docId) {
        console.warn(`  - Skipping item in ${collectionName} due to missing ID property:`, item);
        continue;
      }
      const itemRef = doc(db, collectionName, docId);

      const dataToSet:any = {
        ...(item as any),
        updatedAt: serverTimestamp(),
      };
       if (collectionName !== 'clicks') {
         dataToSet.createdAt = serverTimestamp();
       } else {
         dataToSet.timestamp = serverTimestamp();
         dataToSet.id = docId; // Ensure click document has its ID also as a field
       }

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

      const docSnap = await getDoc(itemRef);
      if (!docSnap.exists()) {
        mainBatch.set(itemRef, dataToSet);
        writeCount++;
        console.log(`  - Added ${collectionName}: ${(item as any).name || (item as any).title || docId} (ID: ${docId})`);
      } else {
        console.log(`  - ${collectionName}: ${(item as any).name || (item as any).title || docId} (ID: ${docId}) already exists. Consider update logic.`);
      }
    }
  };

  await processCollection<Category>('categories', categoriesData, 'slug');
  await processCollection<Store>('stores', storesData, 'slug');
  // Assign IDs to products and coupons before seeding clicks/transactions if they don't have them
  const productMap = new Map<string, string>(); // name to id
  productsData.forEach((p, i) => {
    if (!(productsData[i] as any).id) (productsData[i] as any).id = `prod_seed_${i}_${uuidv4().substring(0,4)}`;
    productMap.set(p.name, (productsData[i] as any).id);
  });
  const couponMap = new Map<string, string>(); // code to id
  couponsData.forEach((c, i) => {
    if (!(couponsData[i] as any).id) (couponsData[i] as any).id = `coupon_seed_${i}_${uuidv4().substring(0,4)}`;
    if (c.code) couponMap.set(c.code, (couponsData[i]as any).id);
  });

  // Update clickData to use these generated IDs
  clicksData.forEach(click => {
      if (click.productName && productMap.has(click.productName)) {
          click.productId = productMap.get(click.productName);
      }
      if (click.couponId && couponMap.has(click.couponId)) { // couponId in clickData was storing the code
          click.couponId = couponMap.get(click.couponId);
      }
  });


  await processCollection<Coupon>('coupons', couponsData);
  await processCollection<Banner>('banners', bannersData);
  await processCollection<Product>('products', productsData);
  await processCollection<Click>('clicks', clicksData, 'clickId'); // Use 'clickId' field as document ID

  const seedUser = async (uid: string, role: 'admin' | 'user', displayName: string, email: string) => {
    console.log(`Checking/Seeding user (UID: ${uid}, Role: ${role})...`);
    const userRef = doc(db, 'users', uid);
    try {
        await runTransaction(db, async (transaction) => {
            const userDocSnap = await transaction.get(userRef);
            if (!userDocSnap.exists()) {
                const profileData: UserProfile = {
                    uid: uid, email, displayName, photoURL: null, role,
                    cashbackBalance: 0, pendingCashback: 0, lifetimeCashback: 0,
                    referralCode: uuidv4().substring(0, 8).toUpperCase(),
                    referralCount: 0, referralBonusEarned: 0, referredBy: null,
                    isDisabled: false, createdAt: serverTimestamp() as Timestamp,
                    updatedAt: serverTimestamp() as Timestamp,
                    lastPayoutRequestAt: null, payoutDetails: null,
                };
                transaction.set(userRef, profileData);
                console.log(`  - Added ${role} profile (UID: ${uid}). Balances to be updated by transactions.`);
            } else {
                const existingData = userDocSnap.data() as UserProfile;
                const updates: Partial<UserProfile> = { updatedAt: serverTimestamp() };
                if (existingData.role !== role) updates.role = role;
                // Reset balances for seed, transactions will rebuild them
                updates.cashbackBalance = 0;
                updates.pendingCashback = 0;
                updates.lifetimeCashback = 0;
                transaction.update(userRef, updates);
                console.log(`  - Ensured role and reset balances for ${role} profile (UID: ${uid}).`);
            }
        });
    } catch (e) {
        console.error(`Error seeding user ${uid}: `, e);
    }
  };

  await seedUser(INITIAL_ADMIN_UID, 'admin', 'MagicSaver Admin', `admin_${INITIAL_ADMIN_UID.substring(0,5)}@magicsaver.example.com`);
  await seedUser(EXAMPLE_USER_ID_1, 'user', 'Test User One', `user1_${EXAMPLE_USER_ID_1.substring(0,5)}@magicsaver.example.com`);
  await seedUser(EXAMPLE_USER_ID_2, 'user', 'Test User Two', `user2_${EXAMPLE_USER_ID_2.substring(0,5)}@magicsaver.example.com`);

  if (writeCount > 0) { // This reflects writes from processCollection if they were batched
    try {
      await mainBatch.commit(); // Commit writes from processCollection
      console.log(`Successfully committed ${writeCount} initial item writes.`);
    } catch (error) {
      console.error("Error committing mainBatch for items:", error);
      return;
    }
  } else {
    console.log("No new items (categories, stores etc.) added via mainBatch or they already existed.");
  }

  console.log("Processing transactions and updating user balances individually...");
  for (const transactionItem of transactionsData) {
    try {
        await runTransaction(db, async (firestoreTransaction) => {
            const userRef = doc(db, 'users', transactionItem.userId);
            const userSnap = await firestoreTransaction.get(userRef);

            if (!userSnap.exists()) {
                console.warn(`  - User ${transactionItem.userId} not found. Skipping transaction for ${transactionItem.storeName}.`);
                return;
            }

            const transQuery = query(collection(db, "transactions"),
                                     where("userId", "==", transactionItem.userId),
                                     where("orderId", "==", transactionItem.orderId),
                                     where("storeId", "==", transactionItem.storeId),
                                     limit(1));
            const existingTransSnap = await firestoreTransaction.get(transQuery);
            
            if (!existingTransSnap.empty) {
                console.log(`  - Transaction for order ${transactionItem.orderId} at ${transactionItem.storeName} for user ${transactionItem.userId} already exists. Skipping.`);
                return;
            }

            const transactionRef = doc(collection(db, 'transactions'));
            const transactionDate = transactionItem.transactionDate instanceof Date ? Timestamp.fromDate(transactionItem.transactionDate) : serverTimestamp();
            const reportedDate = serverTimestamp();

            firestoreTransaction.set(transactionRef, {
                ...transactionItem,
                transactionDate, reportedDate,
                createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
                confirmationDate: transactionItem.status === 'confirmed' ? (serverTimestamp()) : null,
                paidDate: null, payoutId: null,
                currency: transactionItem.currency || 'INR',
                initialCashbackAmount: transactionItem.initialCashbackAmount || 0,
                finalSaleAmount: transactionItem.saleAmount, // Default finalSale to initial sale
                finalCashbackAmount: transactionItem.initialCashbackAmount || 0 // Default finalCashback to initial
            });

            const userData = userSnap.data() as UserProfile;
            const updates: Record<string, any> = { updatedAt: serverTimestamp() };
            const cashbackAmount = transactionItem.initialCashbackAmount || 0;

            if (transactionItem.status === 'pending') {
                updates.pendingCashback = increment(cashbackAmount);
            } else if (transactionItem.status === 'confirmed') {
                updates.cashbackBalance = increment(cashbackAmount);
                updates.lifetimeCashback = increment(cashbackAmount);
            }
            firestoreTransaction.update(userRef, updates);
            console.log(`  - Seeded transaction for ${transactionItem.storeName}, User: ${transactionItem.userId}. Status: ${transactionItem.status}. User balance updated.`);
        });
    } catch (error) {
        console.error(`Error in runTransaction for transaction ${transactionItem.orderId}:`, error);
    }
  }
  console.log("Database seeding finished.");
}

if (require.main === module) {
  seedDatabase().catch(error => {
    console.error("Unhandled error during seeding:", error);
    process.exit(1);
  });
}
