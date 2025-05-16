
// src/lib/seed.ts
import { collection, doc, setDoc, getDoc, serverTimestamp, writeBatch, Timestamp, addDoc, increment } from 'firebase/firestore';
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
  { name: 'Home & Kitchen', slug: 'home-kitchen', description: 'Furniture, decor, and kitchenware.', order: 5, imageUrl: 'https://placehold.co/100x100/17a2b8/ffffff.png?text=Home', dataAiHint: "furniture kitchenware", isActive: true },
  { name: 'Groceries', slug: 'groceries', description: 'Daily essentials and pantry needs.', order: 6, imageUrl: 'https://placehold.co/100x100/6f42c1/ffffff.png?text=Grocery', dataAiHint: "food grocery", isActive: true },
];

const storesData: Omit<Store, 'id' | 'createdAt' | 'updatedAt'>[] = [
    { name: 'Amazon', slug: "amazon", logoUrl: 'https://placehold.co/120x60/000000/ffffff.png?text=Amazon', heroImageUrl: 'https://placehold.co/1200x300/000000/ffffff.png?text=Amazon+Deals', dataAiHint: 'amazon logo', affiliateLink: 'https://www.amazon.in/?tag=cashease-21', cashbackRate: 'Up to 7%', cashbackRateValue: 7, cashbackType: 'percentage', description: 'Wide range of products.', categories: ['electronics', 'fashion', 'home-kitchen'], isFeatured: true, isActive: true, isTodaysDeal: true, terms: 'Cashback varies by category. Not valid on gift cards.' },
    { name: 'Flipkart', slug: "flipkart", logoUrl: 'https://placehold.co/120x60/007bff/ffffff.png?text=Flipkart', heroImageUrl: 'https://placehold.co/1200x300/007bff/ffffff.png?text=Flipkart+Offers', dataAiHint: 'flipkart logo', affiliateLink: 'https://www.flipkart.com/?affid=cashease', cashbackRate: 'Up to 6.5%', cashbackRateValue: 6.5, cashbackType: 'percentage', description: 'India\'s leading online store.', categories: ['electronics', 'fashion', 'home-kitchen'], isFeatured: true, isActive: true, isTodaysDeal: false, terms: 'Cashback rates differ for new/existing users.' },
    { name: 'Myntra', slug: "myntra", logoUrl: 'https://placehold.co/120x60/e83e8c/ffffff.png?text=Myntra', heroImageUrl: 'https://placehold.co/1200x300/e83e8c/ffffff.png?text=Myntra+Fashion', dataAiHint: 'myntra fashion logo', affiliateLink: 'https://www.myntra.com/?ref=cashease', cashbackRate: 'Flat 8%', cashbackRateValue: 8, cashbackType: 'percentage', description: 'Top fashion destination.', categories: ['fashion', 'beauty'], isFeatured: true, isActive: true, isTodaysDeal: true },
];

const couponsData: Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'store'>[] = [
  { storeId: 'amazon', code: 'AMZDEAL10', description: 'Extra 10% off select Amazon Fashion.', link: null, expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), isFeatured: true, isActive: true },
  { storeId: 'flipkart', code: null, description: 'Flipkart Electronics Sale - Up to 80% Off', link: 'https://www.flipkart.com/electronics-sale?affid=cashease', expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), isFeatured: true, isActive: true },
  { storeId: 'myntra', code: 'MYNTRA200', description: '₹200 off on orders above ₹1999.', link: null, expiryDate: null, isFeatured: false, isActive: true },
];

const bannersData: Omit<Banner, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { title: 'Mega Electronics Sale', subtitle: 'Up to 50% off + Extra 5% Cashback via CashEase', imageUrl: 'https://placehold.co/1200x400/28a745/ffffff.png?text=Electronics+Spectacular', dataAiHint: 'electronics sale', link: '/category/electronics', altText: 'Electronics Sale Banner', order: 1, isActive: true },
  { title: 'Fashion Frenzy Fest', subtitle: 'Get 60-80% off on top fashion brands this season', imageUrl: 'https://placehold.co/1200x400/007bff/ffffff.png?text=Fashion+Frenzy', dataAiHint: 'fashion clothing sale', link: '/category/fashion', altText: 'Fashion Sale Banner', order: 2, isActive: true },
];

const productsData: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'storeName'>[] = [
  { storeId: 'amazon', name: 'Echo Dot (5th Gen) - Smart Speaker', description: 'Latest smart speaker with Alexa and improved sound quality.', imageUrl: 'https://placehold.co/300x300/000000/ffffff.png?text=Echo+5', dataAiHint: 'smart speaker', affiliateLink: 'https://www.amazon.in/dp/B09B8X2SQL?tag=cashease-21', price: 4499, priceDisplay: '₹4,499', category: 'electronics', brand: 'Amazon', isActive: true, isFeatured: true, isTodaysPick: true },
  { storeId: 'flipkart', name: 'Samsung Galaxy F54 5G (128GB)', description: 'Powerful 5G smartphone with 108MP camera and long battery life.', imageUrl: 'https://placehold.co/300x300/007bff/ffffff.png?text=Galaxy+F54', dataAiHint: 'samsung phone', affiliateLink: 'https://www.flipkart.com/samsung-galaxy-f54-5g/p/itm3f62bd8d719c7?pid=MOBGDR4BYTRG5JFA&affid=cashease', price: 22999, priceDisplay: '₹22,999', category: 'electronics', brand: 'Samsung', isActive: true, isFeatured: true, isTodaysPick: true },
  { storeId: 'myntra', name: 'PUMA Men Casual Shoes - Smash Vulc', description: 'Stylish and comfortable sneakers for everyday wear, white.', imageUrl: 'https://placehold.co/300x300/e83e8c/ffffff.png?text=Puma+Shoes', dataAiHint: 'puma sneakers shoes', affiliateLink: 'https://www.myntra.com/casual-shoes/puma/puma-men-smash-vulc-casual-shoes/1038100/buy?ref=cashease', price: 2499, priceDisplay: '₹2,499', category: 'fashion', brand: 'Puma', isActive: true, isFeatured: false, isTodaysPick: false },
];


const clicksData: Omit<Click, 'id' | 'timestamp'>[] = [
    { userId: EXAMPLE_USER_ID, storeId: 'amazon', storeName: 'Amazon', affiliateLink: 'https://www.amazon.in/?tag=cashease-21&subid=click1', clickId: 'click1', productId: 'amazon-product-echo', productName: 'Echo Dot (5th Gen)', userAgent: 'SeedScript/1.0' },
    { userId: EXAMPLE_USER_ID, storeId: 'myntra', storeName: 'Myntra', affiliateLink: 'https://www.myntra.com/?ref=cashease&subid=click2', clickId: 'click2', couponId: 'myntra-coupon-flat200', userAgent: 'SeedScript/1.0' },
];

const transactionsData: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'confirmationDate' | 'paidDate' | 'payoutId'>[] = [
    {
        userId: EXAMPLE_USER_ID,
        storeId: 'amazon',
        storeName: 'Amazon',
        clickId: 'click1', 
        orderId: 'AMZ-ORDER-001',
        saleAmount: 2500,
        cashbackAmount: 125, 
        status: 'pending',
        transactionDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        adminNotes: 'Initial pending transaction from seed.',
        notesToUser: 'Your cashback is being tracked.'
    },
    {
        userId: EXAMPLE_USER_ID,
        storeId: 'myntra',
        storeName: 'Myntra',
        clickId: 'click2',
        orderId: 'MYN-ORDER-002',
        saleAmount: 3000,
        cashbackAmount: 240, 
        status: 'confirmed',
        transactionDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), // 40 days ago
        adminNotes: 'Confirmed transaction from seed.',
        notesToUser: 'Your cashback is confirmed!'
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
        notesToUser: 'Awaiting retailer confirmation.'
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

  const processCollection = async <T extends { id?: string, slug?: string }>(
    collectionName: string,
    data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>[],
    idField?: keyof T 
  ) => {
    console.log(`Seeding ${collectionName}...`);
    for (const item of data) {
      const docId = idField ? (item as any)[idField] : (item.slug || uuidv4());
      if (!docId) {
        console.warn(`  - Skipping item in ${collectionName} due to missing ID/slug:`, item);
        continue;
      }
      const itemRef = doc(db, collectionName, docId);
      const docSnap = await getDoc(itemRef);
      if (!docSnap.exists()) {
        batch.set(itemRef, {
          ...(item as any),
          isActive: (item as any).isActive === undefined ? true : (item as any).isActive,
          isFeatured: (item as any).isFeatured === undefined ? false : (item as any).isFeatured,
          isTodaysDeal: (item as any).isTodaysDeal === undefined ? false : (item as any).isTodaysDeal, // For stores
          isTodaysPick: (item as any).isTodaysPick === undefined ? false : (item as any).isTodaysPick, // For products
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        writeCount++;
        console.log(`  - Added ${collectionName}: ${(item as any).name || docId} (ID: ${docId})`);
      }
    }
  };

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
    const productRef = doc(collection(db, 'products')); // Auto-generate ID
    // Ensure productsData items match the Product type for isTodaysPick
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
    const clickRef = doc(db, 'clicks', click.clickId); 
    const docSnap = await getDoc(clickRef);
    if(!docSnap.exists()){
        batch.set(clickRef, { ...click, timestamp: serverTimestamp() });
        writeCount++;
        console.log(`  - Added click: ${click.clickId}`);
    }
  }

  let userInitialPending = 0;
  let userInitialConfirmed = 0;
  let userInitialLifetime = 0;

  console.log("Seeding transactions...");
  for (const transaction of transactionsData) {
    const transactionRef = doc(collection(db, 'transactions'));
    const transactionDate = transaction.transactionDate instanceof Date ? Timestamp.fromDate(transaction.transactionDate) : serverTimestamp();
    batch.set(transactionRef, { ...transaction, transactionDate, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    writeCount++;
    console.log(`  - Added transaction for store: ${transaction.storeName || transaction.storeId}, User: ${transaction.userId}`);
    
    if (transaction.userId === EXAMPLE_USER_ID) {
        if (transaction.status === 'pending') {
            userInitialPending += transaction.cashbackAmount;
        } else if (transaction.status === 'confirmed') {
            userInitialConfirmed += transaction.cashbackAmount;
            userInitialLifetime += transaction.cashbackAmount;
        }
    }
  }

  const seedUser = async (uid: string, role: 'admin' | 'user', isExampleUserBalances: boolean) => {
    console.log(`Checking/Seeding user (UID: ${uid}, Role: ${role})...`);
    const userRef = doc(db, 'users', uid);
    const userDocSnap = await getDoc(userRef);

    const profileData: Partial<UserProfile> = {
      uid: uid,
      email: role === 'admin' ? `admin_${uid.substring(0,5)}@cashease.example.com` : `user_${uid.substring(0,5)}@cashease.example.com`,
      displayName: role === 'admin' ? 'CashEase Admin' : 'Test User',
      role: role,
      cashbackBalance: isExampleUserBalances ? userInitialConfirmed : 0,
      pendingCashback: isExampleUserBalances ? userInitialPending : 0,
      lifetimeCashback: isExampleUserBalances ? userInitialLifetime : 0,
      referralCode: uuidv4().substring(0, 8).toUpperCase(),
      referralCount: 0,
      referralBonusEarned: 0,
      isDisabled: false,
      updatedAt: serverTimestamp(),
    };

    if (!userDocSnap.exists()) {
      batch.set(userRef, { ...profileData, createdAt: serverTimestamp() });
      writeCount++;
      console.log(`  - Added ${role} profile (UID: ${uid}) with balances.`);
    } else {
      // Only update if it's the example user getting balances, or to ensure role
      const existingData = userDocSnap.data() as UserProfile;
      const updates: Partial<UserProfile> = { updatedAt: serverTimestamp() };
      if (existingData.role !== role) updates.role = role;
      if (isExampleUserBalances) {
          updates.pendingCashback = (existingData.pendingCashback || 0) + userInitialPending;
          updates.cashbackBalance = (existingData.cashbackBalance || 0) + userInitialConfirmed;
          updates.lifetimeCashback = (existingData.lifetimeCashback || 0) + userInitialLifetime;
      }
      if (Object.keys(updates).length > 1) { // more than just updatedAt
        batch.update(userRef, updates);
        writeCount++;
        console.log(`  - Updated ${role} profile (UID: ${uid}) with balances/role.`);
      }
    }
  };
  
  await seedUser(INITIAL_ADMIN_UID, 'admin', INITIAL_ADMIN_UID === EXAMPLE_USER_ID);
  if (EXAMPLE_USER_ID !== INITIAL_ADMIN_UID) {
    await seedUser(EXAMPLE_USER_ID, 'user', true);
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

// To run this script directly (e.g., `node -r ts-node/register src/lib/seed.ts`):
if (require.main === module) {
  seedDatabase().catch(error => {
    console.error("Unhandled error during seeding:", error);
    process.exit(1);
  });
}
