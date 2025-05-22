
// Client-side utility for click tracking
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Click } from '@/lib/types'; // Ensure Click type is comprehensive

export interface TrackClickClientSideData extends Omit<Click, 'id' | 'timestamp' | 'userAgent'> {
  // userId can be null if user is not logged in
}

export async function trackClickClientSide(data: TrackClickClientSideData): Promise<{success: boolean, error?: string, clickId?: string}> {
  const operation = "trackClickClientSide";
  console.log(`%c[${operation}]%c Initiating for user: ${data.userId || 'Guest'}`, "color: blue; font-weight: bold;", "color: black;");

  if (firebaseInitializationError || !db) {
    const errorMsg = firebaseInitializationError || "Firestore not initialized";
    console.error(`%c[${operation}]%c ${errorMsg}. Cannot track click.`, "color: red; font-weight: bold;", "color: black;");
    return { success: false, error: errorMsg };
  }

  if (!data.storeId || !data.affiliateLink || !data.clickId) {
    const errorMsg = `Missing critical data: storeId, affiliateLink, or clickId. ClickId: ${data.clickId}`;
    console.error(`%c[${operation}]%c ${errorMsg}`, "color: red; font-weight: bold;", "color: black;", data);
    return { success: false, error: errorMsg };
  }

  // Store clickId in localStorage as per user's spec (though main linking is via URL param)
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('clickId', data.clickId);
      console.log(`%c[${operation}]%c Stored clickId ${data.clickId} in localStorage.`, "color: blue; font-weight: bold;", "color: black;");
    } catch (e) {
      console.warn(`%c[${operation}]%c Failed to store clickId in localStorage:`, "color: orange; font-weight: bold;", "color: black;", e);
    }
  }

  try {
    // The document ID will be the clickId generated on the client
    const clickDocRef = doc(db, 'clicks', data.clickId);

    const clickDataToSave: Click = {
      id: data.clickId, // Store the ID also as a field in the document
      clickId: data.clickId, // Explicitly storing the field as per type
      userId: data.userId || null, // Allow null if user isn't logged in
      storeId: data.storeId,
      storeName: data.storeName || null,
      couponId: data.couponId || null,
      productId: data.productId || null,
      productName: data.productName || null,
      affiliateLink: data.affiliateLink, // This should be the final link with clickId
      originalLink: data.originalLink || null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      timestamp: serverTimestamp(), // Use serverTimestamp for consistency
    };

    console.log(`%c[${operation}]%c Preparing to set document in /clicks/${data.clickId} with data:`, "color: blue; font-weight: bold;", "color: black;", clickDataToSave);
    await setDoc(clickDocRef, clickDataToSave);

    console.log(`%c[${operation}]%c SUCCESS: Click tracked for User ${data.userId || 'Guest'}, Click ID ${data.clickId}, Store ${data.storeId}`, "color: green; font-weight: bold;", "color: black;");
    return { success: true, clickId: data.clickId };
  } catch (error) {
    console.error(`%c[${operation}]%c ERROR writing to Firestore for Click ID ${data.clickId}, User ${data.userId || 'Guest'}:`, "color: red; font-weight: bold;", "color: black;", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error tracking click." };
  }
}

    