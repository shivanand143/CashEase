
// Remove 'use server'; to make this a client-side utility
import { doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore'; // Added Timestamp
import { db, firebaseInitializationError } from '@/lib/firebase/config';

export interface TrackClickData {
  userId: string;
  storeId: string;
  storeName?: string | null;
  couponId?: string | null;
  productId?: string | null;
  productName?: string | null;
  affiliateLink: string;
  clickId: string;
  userAgent?: string | null;
  timestamp: Date | ReturnType<typeof serverTimestamp>; // Allow Date for client, convert to serverTimestamp
}

// Renamed to reflect client-side execution
export async function trackClickClientSide(data: Omit<TrackClickData, 'timestamp' | 'userAgent'>): Promise<{success: boolean, error?: string, clickId?: string}> {
  console.log('CLIENT-SIDE TRACKING CLICK: Received data:', JSON.stringify(data, null, 2));

  if (firebaseInitializationError || !db) {
    const errorMsg = `Firestore not initialized. Cannot track click. Error: ${firebaseInitializationError}`;
    console.error('CLIENT-SIDE TRACKING CLICK ERROR:', errorMsg);
    return { success: false, error: errorMsg };
  }

  if (!data.userId || !data.storeId || !data.affiliateLink || !data.clickId) {
    const errorMsg = `Missing critical data for click tracking: userId, storeId, affiliateLink, or clickId. ClickId: ${data.clickId}`;
    console.error('CLIENT-SIDE TRACKING CLICK ERROR:', errorMsg, 'Full data:', data);
    return { success: false, error: errorMsg };
  }

  try {
    const clickDocRef = doc(db, 'clicks', data.clickId);

    const clickDataToSave = {
      userId: data.userId,
      storeId: data.storeId,
      storeName: data.storeName || null,
      couponId: data.couponId || null,
      productId: data.productId || null,
      productName: data.productName || null,
      affiliateLink: data.affiliateLink,
      clickId: data.clickId, // Ensure this matches doc ID
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null, // Get userAgent on client
      timestamp: serverTimestamp(), // Use serverTimestamp for consistency
    };

    console.log('CLIENT-SIDE TRACKING CLICK: Preparing to set document with data:', JSON.stringify(clickDataToSave, null, 2));
    await setDoc(clickDocRef, clickDataToSave);

    console.log(`CLIENT-SIDE CLICK TRACKED SUCCESSFULLY: User ${data.userId}, Click ID ${data.clickId}, Store ${data.storeId}`);
    return { success: true, clickId: data.clickId };
  } catch (error) {
    console.error(`CLIENT-SIDE ERROR TRACKING CLICK (Firestore write failed): Click ID ${data.clickId}, User ${data.userId}`, error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error tracking click." };
  }
}
