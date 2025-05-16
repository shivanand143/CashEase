
'use server';

import { doc, setDoc, serverTimestamp } from 'firebase/firestore'; // Use setDoc with specific ID
import { db } from '@/lib/firebase/config';
// Click interface will be in types.ts

interface TrackClickData {
  userId: string;
  storeId: string;
  storeName?: string;
  couponId?: string | null;
  productId?: string | null;
  productName?: string | null;
  affiliateLink: string;
  clickId: string; // This will be used as the document ID
  userAgent?: string;
}

export async function trackClick(data: TrackClickData): Promise<void> {
  console.log('Tracking click (Server Action):', data);
  if (!db) {
    console.error("Firestore not initialized. Cannot track click.");
    return;
  }

  try {
    // Use the generated clickId as the document ID for easy lookup and idempotency (if needed)
    const clickDocRef = doc(db, 'clicks', data.clickId);

    await setDoc(clickDocRef, {
      userId: data.userId,
      storeId: data.storeId,
      storeName: data.storeName || null,
      couponId: data.couponId || null,
      productId: data.productId || null,
      productName: data.productName || null,
      affiliateLink: data.affiliateLink,
      timestamp: serverTimestamp(), // Use Firestore server timestamp
      userAgent: data.userAgent || null,
    });

    console.log(`Click tracked successfully for user ${data.userId}, clickId: ${data.clickId}`);
  } catch (error) {
    console.error('Error writing click data to Firestore:', error);
  }
}
