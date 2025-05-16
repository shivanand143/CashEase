
// src/lib/seed.ts
import { collection, doc, setDoc, getDoc, serverTimestamp, writeBatch, Timestamp, addDoc } from 'firebase/firestore';
import { db, firebaseInitializationError } from './firebase/config'; // Adjust path as needed
import type { Store, Coupon, Category, Banner, UserProfile, Product, Click, Transaction } from './types'; // Adjust path as needed
import { v4 as uuidv4 } from 'uuid';

const INITIAL_ADMIN_UID = process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID || null;

const categoriesData: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { name: 'Fashion', slug: 'fashion', description: 'Latest trends in clothing and accessories.', order: 1, imageUrl: 'https://placehold.co/100x100/007bff/ffffff.png', dataAiHint: "clothing fashion", isActive: true },
  { name: 'Electronics', slug: 'electronics', description: 'Gadgets, appliances, and more.', order: 2, imageUrl: 'https://placehold.co/100x100/28a745/ffffff.png', dataAiHint: "gadgets electronics", isActive: true },
  { name: 'Travel', slug: 'travel', description: 'Flights, hotels, and holiday packages.', order: 3, imageUrl: 'https://placehold.co/100x100/ffc107/000000.png', dataAiHint: "vacation travel", isActive: true },
  { name: 'Beauty', slug: 'beauty', description: 'Skincare, makeup, and personal care.', order: 4, imageUrl: 'https://placehold.co/100x100/dc3545/ffffff.png', dataAiHint: "cosmetics makeup", isActive: true },
  { name: 'Home & Kitchen', slug: 'home-kitchen', description: 'Furniture, decor, and kitchenware.', order: 5, imageUrl: 'https://placehold.co/100x100/17a2b8/ffffff.png', dataAiHint: "furniture kitchenware", isActive: true },
  { name: 'Groceries', slug: 'groceries', description: 'Daily essentials and pantry needs.', order: 6, imageUrl: 'https://placehold.co/100x100/6f42c1/ffffff.png', dataAiHint: "food grocery", isActive: true },
];

const storesData: Omit<Store, 'id' | 'createdAt' | 'updatedAt'>[] = [
    { name: 'Amazon', slug: "amazon", logoUrl: 'https://placehold.co/120x60/000000/ffffff.png?text=Amazon', heroImageUrl: 'https://placehold.co/1200x300/000000/ffffff.png?text=Amazon+Deals', dataAiHint: 'amazon logo', affiliateLink: 'https://www.amazon.in/?tag=cashease-21', cashbackRate: 'Up to 7%', cashbackRateValue: 7, cashbackType: 'percentage', description: 'Wide range of products.', categories: ['electronics', 'fashion', 'home-kitchen', 'books'], isFeatured: true, isActive: true, isTodaysDeal: true, terms: 'Cashback varies by category. Not valid on gift cards.' },
    { name: 'Flipkart', slug: "flipkart", logoUrl: 'https://placehold.co/120x60/007bff/ffffff.png?text=Flipkart', heroImageUrl: 'https://placehold.co/1200x300/007bff/ffffff.png?text=Flipkart+Offers', dataAiHint: 'flipkart logo', affiliateLink: 'https://www.flipkart.com/?affid=cashease', cashbackRate: 'Up to 6.5%', cashbackRateValue: 6.5, cashbackType: 'percentage', description: 'India\'s leading online store.', categories: ['electronics', 'fashion', 'mobiles-tablets', 'home-kitchen'], isFeatured: true, isActive: true, terms: 'Cashback rates differ for new/existing users. Check specific category rates.' },
    { name: 'Myntra', slug: "myntra", logoUrl: 'https://placehold.co/120x60/e83e8c/ffffff.png?text=Myntra', heroImageUrl: 'https://placehold.co/1200x300/e83e8c/ffffff.png?text=Myntra+Fashion', dataAiHint: 'myntra fashion logo', affiliateLink: 'https://www.myntra.com/?ref=cashease', cashbackRate: 'Flat 8%', cashbackRateValue: 8, cashbackType: 'percentage', description: 'Top fashion destination.', categories: ['fashion', 'beauty'], isFeatured: true, isActive: true, isTodaysDeal: true },
];

const couponsData: Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'store'>[] = [
  { storeId: 'amazon', code: 'AMZDEAL10', description: 'Extra 10% off select Amazon Fashion for new users.', link: null, expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), isFeatured: true, isActive: true },
  { storeId: 'flipkart', code: null, description: 'Flipkart Big Billion Days Preview - Up to 80% Off Electronics', link: 'https://www.flipkart.com/big-billion-days?affid=cashease', expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), isFeatured: true, isActive: true },
  { storeId: 'myntra', code: 'MYNTRA20', description: 'Flat 20% off on orders above ₹1999.', link: null, expiryDate: null, isFeatured: false, isActive: true },
];

const bannersData: Omit<Banner, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { title: 'Mega Electronics Sale', subtitle: 'Up to 50% off + Extra 5% Cashback via CashEase', imageUrl: 'https://placehold.co/1200x400/28a745/ffffff.png?text=Electronics+Spectacular', dataAiHint: 'electronics sale', link: '/category/electronics', altText: 'Electronics Sale Banner', order: 1, isActive: true },
  { title: 'Fashion Frenzy Fest', subtitle: 'Get 60-80% off on top fashion brands this season', imageUrl: 'https://placehold.co/1200x400/007bff/ffffff.png?text=Fashion+Frenzy', dataAiHint: 'fashion clothing sale', link: '/category/fashion', altText: 'Fashion Sale Banner', order: 2, isActive: true },
];

const productsData: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'storeName'>[] = [
  { storeId: 'amazon', name: 'Echo Dot (5th Gen)', description: 'Latest smart speaker with Alexa and improved sound.', imageUrl: 'https://placehold.co/300x300/000000/ffffff.png?text=Echo+5', dataAiHint: 'smart speaker', affiliateLink: 'https://www.amazon.in/dp/B09B8X2SQL?tag=cashease-21', price: 4499, priceDisplay: '₹4,499', category: 'electronics', brand: 'Amazon', isActive: true, isFeatured: true, isTodaysPick: true },
  { storeId: 'flipkart', name: 'Samsung Galaxy F54 5G', description: 'Powerful 5G smartphone with 108MP camera.', imageUrl: 'https://placehold.co/300x300/007bff/ffffff.png?text=Galaxy+F54', dataAiHint: 'samsung phone', affiliateLink: 'https://www.flipkart.com/samsung-galaxy-f54-5g/p/itm3f62bd8d719c7?pid=MOBGDR4BYTRG5JFA&affid=cashease', price: 22999, priceDisplay: '₹22,999', category: 'mobiles-tablets', brand: 'Samsung', isActive: true, isFeatured: true, isTodaysPick: true },
  { storeId: 'myntra', name: 'Puma Men Casual Shoes', description: 'Stylish and comfortable sneakers for everyday wear.', imageUrl: 'https://placehold.co/300x300/e83e8c/ffffff.png?text=Puma+Shoes', dataAiHint: 'puma sneakers shoes', affiliateLink: 'https://www.myntra.com/casual-shoes/puma/puma-men-smash-vulc-casual-shoes/1038100/buy?ref=cashease', price: 2499, priceDisplay: '₹2,499', category: 'fashion', brand: 'Puma', isActive: true, isFeatured: true, isTodaysPick: false },
];

// Example User ID for seed data (replace with a real test user ID from your Auth)
const EXAMPLE_USER_ID = INITIAL_ADMIN_UID || "testUser123"; // Use admin or a generic ID

const clicksData: Omit<Click, 'id' | 'timestamp'>[] = [
    { userId: EXAMPLE_USER_ID, storeId: 'amazon', storeName: 'Amazon', affiliateLink: 'https://www.amazon.in/?tag=cashease-21&subid=click1', clickId: 'click1', productId: productsData[0].id, productName: productsData[0].name, userAgent: 'SeedScript/1.0' },
    { userId: EXAMPLE_USER_ID, storeId: 'myntra', storeName: 'Myntra', affiliateLink: 'https://www.myntra.com/?ref=cashease&subid=click2', clickId: 'click2', couponId: 'myntra-coupon1', userAgent: 'SeedScript/1.0' },
];

const transactionsData: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'confirmationDate' | 'paidDate' | 'payoutId'>[] = [
    {
        userId: EXAMPLE_USER_ID,
        storeId: 'amazon',
        storeName: 'Amazon',
        clickId: 'click1', // Link to a click
        orderId: 'AMZ-ORDER-001',
        saleAmount: 2500,
        cashbackAmount: 125, // Example 5%
        status: 'pending',
        transactionDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        adminNotes: 'Initial pending transaction from seed.',
    },
    {
        userId: EXAMPLE_USER_ID,
        storeId: 'myntra',
        storeName: 'Myntra',
        clickId: 'click2',
        orderId: 'MYN-ORDER-002',
        saleAmount: 3000,
        cashbackAmount: 240, // Example 8%
        status: 'confirmed',
        transactionDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), // 40 days ago
        adminNotes: 'Confirmed transaction from seed.',
    },
    {
        userId: EXAMPLE_USER_ID,
        storeId: 'flipkart',
        storeName: 'Flipkart',
        orderId: 'FLIP-ORDER-003',
        saleAmount: 1000,
        cashbackAmount: 65,
        status: 'pending',
        transactionDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
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

  // Seed Categories
  console.log("Seeding categories...");
  for (const category of categoriesData) {
    const categoryRef = doc(db, 'categories', category.slug);
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
    }
  }

  // Seed Stores
  console.log("Seeding stores...");
  for (const store of storesData) {
    const storeRef = doc(db, 'stores', store.slug!); // Use slug as ID
    const docSnap = await getDoc(storeRef);
    if (!docSnap.exists()) {
      batch.set(storeRef, {
        ...store,
        isFeatured: store.isFeatured === undefined ? false : store.isFeatured,
        isTodaysDeal: store.isTodaysDeal === undefined ? false : store.isTodaysDeal,
        isActive: store.isActive === undefined ? true : store.isActive,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      writeCount++;
      console.log(`  - Added store: ${store.name} (ID: ${store.slug})`);
    }
  }

  // Seed Coupons
  console.log("Seeding coupons...");
  for (const coupon of couponsData) {
    const couponRef = doc(collection(db, 'coupons')); // Auto-generate ID
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
    const bannerRef = doc(collection(db, 'banners')); // Auto-generate ID
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
    const productRef = doc(collection(db, 'products')); // Auto-generate ID
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

  // Seed Clicks
  console.log("Seeding clicks...");
  for (const click of clicksData) {
    const clickRef = doc(db, 'clicks', click.clickId); // Use clickId as document ID
    const docSnap = await getDoc(clickRef);
    if(!docSnap.exists()){
        batch.set(clickRef, {
            ...click,
            timestamp: serverTimestamp(),
        });
        writeCount++;
        console.log(`  - Added click: ${click.clickId}`);
    }
  }

  // Seed Transactions
  console.log("Seeding transactions...");
  let pendingCashbackForUser = 0;
  let confirmedCashbackForUser = 0;
  let lifetimeCashbackForUser = 0;

  for (const transaction of transactionsData) {
    const transactionRef = doc(collection(db, 'transactions')); // Auto-generate ID
    const transactionDate = transaction.transactionDate instanceof Date ? Timestamp.fromDate(transaction.transactionDate) : serverTimestamp();
    batch.set(transactionRef, {
      ...transaction,
      transactionDate: transactionDate,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    writeCount++;
    console.log(`  - Added transaction for store: ${transaction.storeName || transaction.storeId}, User: ${transaction.userId}`);
    if (transaction.userId === EXAMPLE_USER_ID) {
        if (transaction.status === 'pending') {
            pendingCashbackForUser += transaction.cashbackAmount;
        } else if (transaction.status === 'confirmed') {
            confirmedCashbackForUser += transaction.cashbackAmount;
            lifetimeCashbackForUser += transaction.cashbackAmount;
        }
    }
  }


   // Seed/Update User Profile (Admin or Test User)
   if (INITIAL_ADMIN_UID) {
     console.log(`Checking/updating initial admin user (UID: ${INITIAL_ADMIN_UID})...`);
     const adminUserRef = doc(db, 'users', INITIAL_ADMIN_UID);
     const adminDocSnap = await getDoc(adminUserRef);

     const profileUpdates: Partial<UserProfile> = {
        role: 'admin',
        updatedAt: serverTimestamp(),
     };
     if (INITIAL_ADMIN_UID === EXAMPLE_USER_ID) {
         profileUpdates.pendingCashback = pendingCashbackForUser;
         profileUpdates.cashbackBalance = confirmedCashbackForUser;
         profileUpdates.lifetimeCashback = lifetimeCashbackForUser;
     }


     if (!adminDocSnap.exists()) {
       const adminProfile: Omit<UserProfile, 'id'|'createdAt' | 'updatedAt'> = {
         uid: INITIAL_ADMIN_UID,
         email: `admin_${INITIAL_ADMIN_UID.substring(0,5)}@cashease.example.com`,
         displayName: 'CashEase Admin',
         photoURL: null,
         role: 'admin',
         cashbackBalance: INITIAL_ADMIN_UID === EXAMPLE_USER_ID ? confirmedCashbackForUser : 0,
         pendingCashback: INITIAL_ADMIN_UID === EXAMPLE_USER_ID ? pendingCashbackForUser : 0,
         lifetimeCashback: INITIAL_ADMIN_UID === EXAMPLE_USER_ID ? lifetimeCashbackForUser : 0,
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
       console.log(`  - Added initial admin user profile (UID: ${INITIAL_ADMIN_UID}) with balances.`);
     } else {
       // Update existing admin's balances if they are the example user
        const existingAdminData = adminDocSnap.data() as UserProfile;
        const updatesForExistingAdmin: Partial<UserProfile> = { updatedAt: serverTimestamp() };
        if (existingAdminData.role !== 'admin') updatesForExistingAdmin.role = 'admin';

        if (INITIAL_ADMIN_UID === EXAMPLE_USER_ID) {
            updatesForExistingAdmin.pendingCashback = (existingAdminData.pendingCashback || 0) + pendingCashbackForUser;
            updatesForExistingAdmin.cashbackBalance = (existingAdminData.cashbackBalance || 0) + confirmedCashbackForUser;
            updatesForExistingAdmin.lifetimeCashback = (existingAdminData.lifetimeCashback || 0) + lifetimeCashbackForUser;
        }
        batch.update(adminUserRef, updatesForExistingAdmin);
        writeCount++; // Count as a write even for update
        console.log("  - Updated initial admin user profile with balances/role.");
     }
   } else if (EXAMPLE_USER_ID && EXAMPLE_USER_ID !== INITIAL_ADMIN_UID) {
       // Seed a generic test user if no admin UID and example user is different
       console.log(`Seeding test user (UID: ${EXAMPLE_USER_ID}) with balances...`);
       const testUserRef = doc(db, 'users', EXAMPLE_USER_ID);
       const testUserSnap = await getDoc(testUserRef);
       if (!testUserSnap.exists()) {
           const testUserProfile: Omit<UserProfile, 'id'|'createdAt' | 'updatedAt'> = {
             uid: EXAMPLE_USER_ID,
             email: `testuser@cashease.example.com`,
             displayName: 'Test User',
             photoURL: null,
             role: 'user',
             cashbackBalance: confirmedCashbackForUser,
             pendingCashback: pendingCashbackForUser,
             lifetimeCashback: lifetimeCashbackForUser,
             referralCode: uuidv4().substring(0, 8).toUpperCase(),
             referralCount: 0,
             referralBonusEarned: 0,
             referredBy: null,
             isDisabled: false,
             lastPayoutRequestAt: null,
             payoutDetails: null,
           };
           batch.set(testUserRef, { ...testUserProfile, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
           writeCount++;
           console.log(`  - Added test user profile (UID: ${EXAMPLE_USER_ID}) with balances.`);
       } else {
           const existingTestData = testUserSnap.data() as UserProfile;
           batch.update(testUserRef, {
               pendingCashback: (existingTestData.pendingCashback || 0) + pendingCashbackForUser,
               cashbackBalance: (existingTestData.cashbackBalance || 0) + confirmedCashbackForUser,
               lifetimeCashback: (existingTestData.lifetimeCashback || 0) + lifetimeCashbackForUser,
               updatedAt: serverTimestamp()
           });
           writeCount++;
            console.log(`  - Updated test user profile (UID: ${EXAMPLE_USER_ID}) with balances.`);
       }
   } else {
     console.log("Initial admin UID not set. Skipping specific admin user seeding/update.");
   }


  if (writeCount > 0) {
    try {
      await batch.commit();
      console.log(`Successfully committed ${writeCount} writes to the database.`);
    } catch (error) {
      console.error("Error committing seed data batch:", error);
    }
  } else {
    console.log("No new data to seed (collections might exist with these specific IDs or no new items added).");
  }

  console.log("Database seeding finished.");
}

if (require.main === module) {
  seedDatabase().catch(console.error);
}
