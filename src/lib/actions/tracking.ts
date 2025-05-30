// src/lib/actions/tracking.ts
import { doc, setDoc, serverTimestamp, FieldValue } from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Click, CashbackType } from '@/lib/types';

export interface TrackClickClientSideData {
  userId: string; // Made non-null as per rule
  storeId: string;
  storeName?: string | null;
  couponId?: string | null;
  productId?: string | null;
  productName?: string | null;
  clickId: string;
  affiliateLink: string;
  originalLink?: string | null;
  // Product-specific cashback details at time of click
  clickedCashbackDisplay?: string | null;
  clickedCashbackRateValue?: number | null;
  clickedCashbackType?: CashbackType | null;
}

export async function trackClickClientSide(data: TrackClickClientSideData): Promise<{success: boolean, error?: string, clickId?: string}> {
  const operation = "trackClickClientSide";
  const { userId, clickId: clientGeneratedClickId } = data; // Destructure for logging

  console.log(`%c[${operation}]%c Initiating for user: ${userId || 'Guest'}, ClientClickID: ${clientGeneratedClickId}`, "color: blue; font-weight: bold;", "color: black;", {data});

  if (firebaseInitializationError) {
    const errorMsg = `Firebase not initialized: ${firebaseInitializationError}. Cannot track click.`;
    console.error(`%c[${operation}]%c ${errorMsg}`, "color: red; font-weight: bold;", "color: black;");
    return { success: false, error: errorMsg };
  }
  if (!db) {
    const errorMsg = "Firestore database instance (db) is not available. Cannot track click.";
    console.error(`%c[${operation}]%c ${errorMsg}`, "color: red; font-weight: bold;", "color: black;");
    return { success: false, error: errorMsg };
  }

  // Ensure critical data is present
  if (!userId || !data.storeId || !data.affiliateLink || !clientGeneratedClickId) {
    const errorMsg = `Missing critical data: userId, storeId, affiliateLink, or clickId. ClickId: ${clientGeneratedClickId}`;
    console.error(`%c[${operation}]%c ${errorMsg}`, "color: red; font-weight: bold;", "color: black;", data);
    return { success: false, error: errorMsg };
  }

  // Store clickId in localStorage
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('magicsaver_lastClickId', clientGeneratedClickId);
      console.log(`%c[${operation}]%c Stored clickId ${clientGeneratedClickId} in localStorage as magicsaver_lastClickId.`, "color: blue; font-weight: bold;", "color: black;");
    } catch (e) {
      console.warn(`%c[${operation}]%c Failed to store clickId in localStorage:`, "color: orange; font-weight: bold;", "color: black;", e);
    }
  }

  const firestoreDb = db; // TypeScript knows this is Firestore now

  try {
    const clickDocRef = doc(firestoreDb, 'clicks', clientGeneratedClickId);

    // Explicitly type for clarity before saving, ensuring all fields match `Click` type
    const clickDataToSave: Omit<Click, 'id'> = { // `id` will be the document ID
      clickId: clientGeneratedClickId,
      userId: userId,
      storeId: data.storeId,
      storeName: data.storeName || null,
      couponId: data.couponId || null,
      productId: data.productId || null,
      productName: data.productName || null,
      affiliateLink: data.affiliateLink,
      originalLink: data.originalLink || null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      timestamp: serverTimestamp() as FieldValue, // Cast for FieldValue
      clickedCashbackDisplay: data.clickedCashbackDisplay || null,
      clickedCashbackRateValue: data.clickedCashbackRateValue ?? null,
      clickedCashbackType: data.clickedCashbackType || null,
      hasConversion: false, // Default to false
      conversionId: null, // Default to null
    };

    console.log(`%c[${operation}]%c Preparing to set document in /clicks/${clientGeneratedClickId} with data:`, "color: blue; font-weight: bold;", "color: black;", clickDataToSave);
    await setDoc(clickDocRef, clickDataToSave);

    console.log(`%c[${operation}]%c SUCCESS: Click tracked for User ${userId}, Click ID ${clientGeneratedClickId}, Store ${data.storeId}`, "color: green; font-weight: bold;", "color: black;");
    return { success: true, clickId: clientGeneratedClickId };
  } catch (error) {
    console.error(`%c[${operation}]%c ERROR writing to Firestore for Click ID ${clientGeneratedClickId}, User ${userId}:`, "color: red; font-weight: bold;", "color: black;", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error tracking click." };
  }
}