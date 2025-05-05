'use server';

import { collection, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Click } from '@/lib/types';

interface TrackClickData {
  userId: string;
  storeId: string;
  storeName?: string; // Optional denormalized name
  couponId?: string | null;
  affiliateLink: string; // The final link clicked (potentially with clickId)
  clickId: string; // The unique ID generated for this click
  userAgent?: string;
  // ipAddress?: string; // Consider privacy implications before storing IP
}

export async function trackClick(data: TrackClickData): Promise<void> {
  console.log('Tracking click (Server Action):', data);
  if (!db) {
    console.error("Firestore not initialized. Cannot track click.");
    // Optionally throw an error or handle it differently
    return;
  }

  try {
    const clicksCollection = collection(db, 'clicks');
    // Use the generated clickId as the document ID for easy lookup
    const clickDocRef = doc(clicksCollection, data.clickId);

    await addDoc(clicksCollection,{
      ...data,
      timestamp: serverTimestamp(), // Use Firestore server timestamp
    });

    console.log(`Click tracked successfully for user ${data.userId}, clickId: ${data.clickId}`);
  } catch (error) {
    console.error('Error writing click data to Firestore:', error);
    // Decide how to handle the error. Maybe log it to a different service.
    // Avoid throwing an error here if you don't want to block the user's redirection.
  }
}