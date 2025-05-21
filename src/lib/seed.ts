
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
  { name: 'Home & Kitchen', slug: 'home-kitchen', description: 'Appliances, decor, and essentials for your home.', order: 5, imageUrl: 'https://placehold.co/100x100/6f42c1/ffffff.png?text=Home', dataAiHint: "kitchen appliances", isActive: true },
  { name: 'Books & Media', slug: 'books-media', description: 'Books, movies, music, and games.', order: 6, imageUrl: 'https://placehold.co/100x100/fd7e14/ffffff.png?text=Books', dataAiHint: "books movies", isActive: true },
];

const storesData: Omit<Store, 'id' | 'createdAt' | 'updatedAt'>[] = [
    { name: 'Amazon', slug: "amazon", logoUrl: 'https://placehold.co/120x60/FF9900/000000.png?text=Amazon', heroImageUrl: 'https://placehold.co/1200x300/FF9900/000000.png?text=Amazon+Deals', dataAiHint: 'amazon logo', affiliateLink: 'https://www.amazon.in/?tag=magicsaver-21&subid={CLICK_ID}', cashbackRate: 'Up to 7%', cashbackRateValue: 7, cashbackType: 'percentage', description: 'Wide range of products.', categories: ['electronics', 'fashion', 'home-kitchen', 'books-media'], isFeatured: true, isActive: true, isTodaysDeal: true, terms: 'Cashback varies by category. Read T&Cs on store page.' },
    { name: 'Flipkart', slug: "flipkart", logoUrl: 'https://placehold.co/120x60/2874F0/ffffff.png?text=Flipkart', heroImageUrl: 'https://placehold.co/1200x300/2874F0/ffffff.png?text=Flipkart+Big+Saving+Days', dataAiHint: 'flipkart logo', affiliateLink: 'https://www.flipkart.com/?affid=magicsaver&subid={CLICK_ID}', cashbackRate: 'Up to 6.5%', cashbackRateValue: 6.5, cashbackType: 'percentage', description: 'India\'s leading online store.', categories: ['electronics', 'fashion', 'home-kitchen'], isFeatured: true, isActive: true, isTodaysDeal: false, terms: 'Rates differ for new/existing users. Check offer terms.' },
    { name: 'Myntra', slug: "myntra", logoUrl: 'https://placehold.co/120x60/E84A5F/ffffff.png?text=Myntra', heroImageUrl: 'https://placehold.co/1200x300/E84A5F/ffffff.png?text=Myntra+Fashion+Carnival', dataAiHint: 'myntra fashion', affiliateLink: 'https://www.myntra.com/?ref=magicsaver&subid={CLICK_ID}', cashbackRate: 'Flat 8%', cashbackRateValue: 8, cashbackType: 'percentage', description: 'Top fashion destination.', categories: ['fashion', 'beauty'], isFeatured: false, isActive: true, isTodaysDeal: true },
    { name: 'Ajio', slug: "ajio", logoUrl: 'https://placehold.co/120x60/000000/ffffff.png?text=AJIO', heroImageUrl: 'https://placehold.co/1200x300/00A2A2/ffffff.png?text=AJIO+Style+Specials', dataAiHint: 'ajio fashion', affiliateLink: 'https://www.ajio.com/?source=magicsaver&subid={CLICK_ID}', cashbackRate: 'Up to 10%', cashbackRateValue: 10, cashbackType: 'percentage', description: 'Curated fashion and lifestyle.', categories: ['fashion'], isFeatured: true, isActive: true, isTodaysDeal: false },
];

const productsData: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'storeName'>[] = [
  { storeId: 'amazon', name: 'Echo Dot (5th Gen, 2023 release)', description: 'Smart speaker with Alexa and improved sound.', imageUrl: 'https://placehold.co/300x300/000000/ffffff.png?text=Echo+5', dataAiHint: 'smart speaker', affiliateLink: 'https://www.amazon.in/dp/B09B8X2SQL?tag=magicsaver-21&subid={CLICK_ID}', price: 4499, category: 'electronics', isActive: true, isFeatured: true, isTodaysPick: true },
  { storeId: 'flipkart', name: 'Samsung Galaxy F54 5G (Stardust Silver, 256 GB)', description: 'Powerful 5G smartphone with 108MP camera.', imageUrl: 'https://placehold.co/300x300/007bff/ffffff.png?text=Galaxy+F54', dataAiHint: 'samsung phone', affiliateLink: 'https://www.flipkart.com/samsung-galaxy-f54-5g/p/itm3f62bd8d719c7?pid=MOBGDR4BYTRG5JFA&affid=magicsaver&subid={CLICK_ID}', price: 22999, category: 'electronics', isActive: true, isFeatured: true, isTodaysPick: true },
  { storeId: 'myntra', name: 'PUMA Men Smash Vulc Casual Shoes', description: 'Stylish Puma sneakers for everyday wear.', imageUrl: 'https://placehold.co/300x300/e83e8c/ffffff.png?text=Puma+Shoes', dataAiHint: 'puma sneakers', affiliateLink: 'https://www.myntra.com/casual-shoes/puma/puma-men-smash-vulc-casual-shoes/1038100/buy?ref=magicsaver&subid={CLICK_ID}', price: 2499, category: 'fashion', isActive: true, isFeatured: true, isTodaysPick: false },
  { storeId: 'ajio', name: 'LEVIS Mens Slim Fit Jeans', description: 'Classic Levis slim fit jeans for men.', imageUrl: 'https://placehold.co/300x300/17a2b8/ffffff.png?text=Levis+Jeans', dataAiHint: 'levis jeans', affiliateLink: 'https://www.ajio.com/levis-men-jeans/p/462800000_blue?source=magicsaver&subid={CLICK_ID}', price: 1799, category: 'fashion', isActive: true, isFeatured: true, isTodaysPick: true },
  { storeId: 'amazon', name: 'OnePlus Bullets Z2 Bluetooth Earphones', description: 'Wireless earphones with fast charging.', imageUrl: 'https://placehold.co/300x300/6c757d/ffffff.png?text=OnePlus+Z2', dataAiHint: 'wireless earphones', affiliateLink: 'https://www.amazon.in/dp/B0B3MNY99S?tag=magicsaver-21&subid={CLICK_ID}', price: 1999, category: 'electronics', isActive: true, isFeatured: false, isTodaysPick: true },
];

const couponsData: Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'store'>[] = [
  { storeId: 'amazon', code: 'AMZDEAL10', description: 'Extra 10% off select Amazon Fashion. Max discount ₹200.', link: 'https://www.amazon.in/fashion?tag=magicsaver-21&subid={CLICK_ID}', expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), isFeatured: true, isActive: true },
  { storeId: 'flipkart', code: null, description: 'Flipkart Electronics Sale - Up to 80% Off Laptops & Mobiles.', link: 'https://www.flipkart.com/electronics-sale?affid=magicsaver&subid={CLICK_ID}', expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), isFeatured: true, isActive: true },
  { storeId: 'myntra', code: 'MYNTRA200', description: 'Flat ₹200 off on ₹1999+ for new users. Valid on first order.', link: 'https://www.myntra.com/?ref=magicsaver&subid={CLICK_ID}', expiryDate: null, isFeatured: false, isActive: true },
  { storeId: 'ajio', code: 'AJIOSALE', description: 'Get 50-70% off on AJIO Fashion Sale.', link: 'https://www.ajio.com/sale?source=magicsaver&subid={CLICK_ID}', expiryDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), isFeatured: true, isActive: true },
];

const bannersData: Omit<Banner, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { title: 'Mega Electronics Sale', subtitle: 'Up to 50% off + Extra 5% Cashback via MagicSaver', imageUrl: 'https://placehold.co/1200x400/28a745/ffffff.png?text=Electronics+Sale', dataAiHint: 'electronics sale', link: '/category/electronics', order: 1, isActive: true },
  { title: 'Fashion Frenzy Fest', subtitle: 'Get 60-80% off on top fashion brands + Assured Cashback', imageUrl: 'https://placehold.co/1200x400/007bff/ffffff.png?text=Fashion+Fest', dataAiHint: 'fashion clothing', link: '/category/fashion', order: 2, isActive: true },
  { title: 'Travel Big, Save Bigger!', subtitle: 'Exclusive deals on flights and hotels for your next getaway.', imageUrl: 'https://placehold.co/1200x400/ffc107/000000.png?text=Travel+Deals', dataAiHint: 'travel vacation', link: '/category/travel', order: 3, isActive: true },
];

const clicksData: Omit<Click, 'id' | 'timestamp' | 'userAgent'>[] = [
    { userId: EXAMPLE_USER_ID_1, storeId: 'amazon', storeName: 'Amazon', affiliateLink: `https://www.amazon.in/dp/B09B8X2SQL?tag=magicsaver-21&subid=clickseed001`, clickId: 'clickseed001', productId: productsData.find(p=>p.name.includes("Echo Dot"))?.id || 'product-echo-dot', productName: productsData.find(p=>p.name.includes("Echo Dot"))?.name },
    { userId: EXAMPLE_USER_ID_1, storeId: 'myntra', storeName: 'Myntra', affiliateLink: `https://www.myntra.com/?ref=magicsaver&subid=clickseed002`, clickId: 'clickseed002', couponId: couponsData.find(c => c.code === 'MYNTRA200')?.id || 'coupon-myntra200' },
    { userId: EXAMPLE_USER_ID_2, storeId: 'flipkart', storeName: 'Flipkart', affiliateLink: `https://www.flipkart.com/samsung-galaxy-f54-5g/p/itm3f62bd8d719c7?pid=MOBGDR4BYTRG5JFA&affid=magicsaver&subid=clickseed003`, clickId: 'clickseed003', productId: productsData.find(p=>p.name.includes("Galaxy F54"))?.id || 'product-galaxy-f54', productName: productsData.find(p=>p.name.includes("Galaxy F54"))?.name },
];

const transactionsData: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'confirmationDate' | 'paidDate' | 'payoutId' | 'reportedDate'>[] = [
    {
        userId: EXAMPLE_USER_ID_1, storeId: 'amazon', storeName: 'Amazon', clickId: 'clickseed001', orderId: 'AMZ-ORDER-SEED-001', productDetails: 'Echo Dot (5th Gen)',
        transactionDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), saleAmount: 4499, initialCashbackAmount: 125, currency: 'INR', status: 'pending' as CashbackStatus,
        notesToUser: 'Awaiting confirmation from Amazon for Echo Dot purchase.'
    },
    {
        userId: EXAMPLE_USER_ID_1, storeId: 'myntra', storeName: 'Myntra', clickId: 'clickseed002', orderId: 'MYN-ORDER-SEED-002', productDetails: 'Various Fashion Items',
        transactionDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), saleAmount: 3000, initialCashbackAmount: 240, currency: 'INR', status: 'confirmed' as CashbackStatus,
        notesToUser: 'Your Myntra cashback for fashion haul is confirmed!'
    },
    {
        userId: EXAMPLE_USER_ID_2, storeId: 'flipkart', storeName: 'Flipkart', clickId: 'clickseed003', orderId: 'FLIP-ORDER-SEED-003', productDetails: 'Samsung Galaxy F54 5G',
        transactionDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), saleAmount: 22999, initialCashbackAmount: 345, currency: 'INR', status: 'pending' as CashbackStatus,
        notesToUser: 'Tracking your Flipkart Galaxy F54 order.'
    },
     {
        userId: EXAMPLE_USER_ID_1, storeId: 'flipkart', storeName: 'Flipkart', orderId: 'FLIP-ORDER-SEED-004', productDetails: 'Books and Stationery',
        transactionDate: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), saleAmount: 2000, initialCashbackAmount: 100, currency: 'INR', status: 'confirmed' as CashbackStatus,
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
  const now = serverTimestamp();

  const processCollection = async <T extends { id?: string, slug?: string, name?: string, title?: string, clickId?: string }>(
    collectionName: string,
    data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>[],
    idFieldProperty?: keyof T
  ) => {
    console.log(`Seeding ${collectionName}...`);
    for (const item of data) {
      let docId: string | undefined = undefined;
      if (idFieldProperty && item[idFieldProperty]) {
        docId = item[idFieldProperty] as string;
      } else if ((item as any).id) { // If ID is already part of the item data (e.g. for products/coupons)
        docId = (item as any).id;
      } else {
        docId = uuidv4();
      }

      if (!docId) {
        console.warn(`  - Skipping item in ${collectionName} due to missing ID property:`, item);
        continue;
      }
      const itemRef = doc(db, collectionName, docId);

      const dataToSet:any = {
        ...(item as any),
        updatedAt: now,
      };
       if (collectionName !== 'clicks') {
         dataToSet.createdAt = now;
       } else {
         dataToSet.timestamp = now;
         dataToSet.id = docId;
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
         mainBatch.update(itemRef, dataToSet); // Update if exists
         writeCount++;
        console.log(`  - Updated ${collectionName}: ${(item as any).name || (item as any).title || docId} (ID: ${docId}) as it already exists.`);
      }
    }
  };

  // Assign IDs if not present, ensuring consistency before relating data
  const productMapByName = new Map<string, string>();
  productsData.forEach((p, i) => {
    const prod = p as any;
    if (!prod.id) prod.id = `prod_seed_${i}_${uuidv4().substring(0,6)}`;
    productMapByName.set(prod.name, prod.id);
  });
  const couponMapByCode = new Map<string, string>();
  couponsData.forEach((c, i) => {
    const coup = c as any;
    if (!coup.id) coup.id = `coupon_seed_${i}_${uuidv4().substring(0,6)}`;
    if (coup.code) couponMapByCode.set(coup.code, coup.id);
  });

  clicksData.forEach(click => {
    if (click.productName && productMapByName.has(click.productName)) {
        click.productId = productMapByName.get(click.productName);
    }
    // If couponId in clickData was storing the code, update it to ID
    if (click.couponId && couponMapByCode.has(click.couponId)) {
        click.couponId = couponMapByCode.get(click.couponId);
    }
  });

  await processCollection<Category>('categories', categoriesData, 'slug');
  await processCollection<Store>('stores', storesData, 'slug');
  await processCollection<Coupon>('coupons', couponsData, 'id'); // Assuming coupons have 'id' in data or use UUID
  await processCollection<Banner>('banners', bannersData, 'id'); // Assuming banners have 'id' or use UUID
  await processCollection<Product>('products', productsData, 'id'); // Assuming products have 'id' or use UUID
  await processCollection<Click>('clicks', clicksData, 'clickId');

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
                    isDisabled: false, createdAt: now as Timestamp,
                    updatedAt: now as Timestamp,
                    lastPayoutRequestAt: null, payoutDetails: null,
                };
                transaction.set(userRef, profileData);
                console.log(`  - Added ${role} profile (UID: ${uid}). Balances to be updated by transactions.`);
            } else {
                const updates: Partial<UserProfile> = { updatedAt: now as Timestamp, role };
                // Reset balances, transactions will rebuild them
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

  if (writeCount > 0) {
    try {
      await mainBatch.commit();
      console.log(`Successfully committed ${writeCount} initial item writes (categories, stores, etc.).`);
    } catch (error) {
      console.error("Error committing mainBatch for items:", error);
      return;
    }
  } else {
    console.log("No new items (categories, stores etc.) added/updated via mainBatch or they already existed as per current logic.");
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

            // Check for existing similar transaction to avoid duplicates from repeated seeding
            const transQuery = query(collection(db, "transactions"),
                                     where("userId", "==", transactionItem.userId),
                                     where("orderId", "==", transactionItem.orderId),
                                     where("storeId", "==", transactionItem.storeId),
                                     where("transactionDate", "==", Timestamp.fromDate(transactionItem.transactionDate as Date)),
                                     limit(1));
            const existingTransSnap = await firestoreTransaction.get(transQuery);
            
            if (!existingTransSnap.empty) {
                console.log(`  - Transaction for order ${transactionItem.orderId} at ${transactionItem.storeName} for user ${transactionItem.userId} (dated ${transactionItem.transactionDate}) already exists. Skipping.`);
                return;
            }

            const transactionRef = doc(collection(db, 'transactions'));
            const transactionDate = transactionItem.transactionDate instanceof Date ? Timestamp.fromDate(transactionItem.transactionDate) : now;
            const reportedDate = now;

            firestoreTransaction.set(transactionRef, {
                ...transactionItem,
                transactionDate, reportedDate,
                createdAt: now, updatedAt: now,
                confirmationDate: transactionItem.status === 'confirmed' ? now : null,
                paidDate: null, payoutId: null,
                currency: transactionItem.currency || 'INR',
                initialCashbackAmount: transactionItem.initialCashbackAmount || 0,
                finalSaleAmount: transactionItem.saleAmount,
                finalCashbackAmount: transactionItem.initialCashbackAmount || 0
            });

            const userData = userSnap.data() as UserProfile;
            const updates: Record<string, any> = { updatedAt: now };
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
        console.error(`Error in runTransaction for seeding transaction ${transactionItem.orderId}:`, error);
    }
  }
  console.log("Database seeding finished.");
}

// Ensure this part is commented out or removed if you are not running this file directly with Node
// if (require.main === module) {
//   seedDatabase().catch(error => {
//     console.error("Unhandled error during seeding:", error);
//     process.exit(1);
//   });
// }
