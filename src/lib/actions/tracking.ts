
'use server';

import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';

export interface TrackClickData { // Exporting for potential use in other server components
  userId: string;
  storeId: string;
  storeName?: string | null; // Made explicitly nullable
  couponId?: string | null;
  productId?: string | null;
  productName?: string | null; // Made explicitly nullable
  affiliateLink: string;
  clickId: string; // This will be used as the document ID
  userAgent?: string | null; // Made explicitly nullable
  timestamp: Date | ReturnType<typeof serverTimestamp>; // Allow Date for client-side, serverTimestamp for server
}

export async function trackClick(data: Omit<TrackClickData, 'timestamp'>): Promise<{success: boolean, error?: string}> {
  console.log('TRACKING CLICK (Server Action): Attempting to track click for user:', data.userId, 'clickId:', data.clickId);
  if (firebaseInitializationError || !db) {
    const errorMsg = `Firestore not initialized. Cannot track click. Error: ${firebaseInitializationError}`;
    console.error(errorMsg);
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
      clickId: data.clickId, // Ensure clickId is part of the document data as well
      userAgent: data.userAgent || null, // Store User-Agent if available
      timestamp: serverTimestamp(),
    };

    await setDoc(clickDocRef, clickDataToSave);

    console.log(`CLICK TRACKED: User ${data.userId}, Click ID ${data.clickId}, Store ${data.storeId}`);
    return { success: true };
  } catch (error) {
    console.error('ERROR TRACKING CLICK: Firestore write failed for clickId', data.clickId, error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error tracking click." };
  }
}
