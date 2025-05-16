
'use server';

import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';

export interface TrackClickData {
  userId: string;
  storeId: string;
  storeName?: string | null;
  couponId?: string | null;
  productId?: string | null;
  productName?: string | null;
  affiliateLink: string;
  clickId: string; // This will be used as the document ID
  userAgent?: string | null;
  timestamp: Date | ReturnType<typeof serverTimestamp>;
}

export async function trackClick(data: Omit<TrackClickData, 'timestamp'>): Promise<{success: boolean, error?: string, clickId?: string}> {
  console.log('TRACKING CLICK (Server Action): Received data:', JSON.stringify(data, null, 2));

  if (firebaseInitializationError || !db) {
    const errorMsg = `Firestore not initialized. Cannot track click. Error: ${firebaseInitializationError}`;
    console.error('TRACKING CLICK ERROR:', errorMsg);
    return { success: false, error: errorMsg };
  }

  if (!data.userId || !data.storeId || !data.affiliateLink || !data.clickId) {
    const errorMsg = `Missing critical data for click tracking: userId, storeId, affiliateLink, or clickId. ClickId: ${data.clickId}`;
    console.error('TRACKING CLICK ERROR:', errorMsg, 'Full data:', data);
    return { success: false, error: errorMsg };
  }

  try {
    const clickDocRef = doc(db, 'clicks', data.clickId);

    const clickDataToSave: Omit<TrackClickData, 'id' | 'timestamp'> & { timestamp: ReturnType<typeof serverTimestamp> } = {
      userId: data.userId,
      storeId: data.storeId,
      storeName: data.storeName || null,
      couponId: data.couponId || null,
      productId: data.productId || null,
      productName: data.productName || null,
      affiliateLink: data.affiliateLink,
      clickId: data.clickId,
      userAgent: data.userAgent || null,
      timestamp: serverTimestamp(),
    };

    console.log('TRACKING CLICK: Preparing to set document with data:', JSON.stringify(clickDataToSave, null, 2));
    await setDoc(clickDocRef, clickDataToSave);

    console.log(`CLICK TRACKED SUCCESSFULLY: User ${data.userId}, Click ID ${data.clickId}, Store ${data.storeId}`);
    return { success: true, clickId: data.clickId };
  } catch (error) {
    console.error(`ERROR TRACKING CLICK (Firestore write failed): Click ID ${data.clickId}, User ${data.userId}`, error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error tracking click." };
  }
}
