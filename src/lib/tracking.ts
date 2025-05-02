// src/lib/tracking.ts
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { ClickLog } from '@/lib/types';

/**
 * Logs a user click event to Firestore.
 *
 * @param userId - The ID of the user who clicked.
 * @param storeId - The ID of the store that was clicked.
 * @param couponId - Optional: The ID of the coupon associated with the click.
 * @returns A promise that resolves when the click is successfully logged.
 * @throws Throws an error if logging fails.
 */
export async function logClick(userId: string, storeId: string, couponId?: string): Promise<void> {
  if (!userId || !storeId) {
    console.warn('User ID and Store ID are required for click tracking.');
    // Decide if you want to throw an error or just return
    // throw new Error('User ID and Store ID are required.');
     return; // Silently ignore if required IDs are missing in this implementation
  }

  try {
    const clicksCollection = collection(db, 'clicks');

    const clickData: Omit<IDBDatabase, 'id'> = {
      userId: userId,
      storeId: storeId,
      timestamp: serverTimestamp(), // Use server timestamp for accuracy
      // Optional: Include couponId if provided
      ...(couponId && { couponId: couponId }),
      // Optional: Add userAgent and IP address (handle privacy carefully)
      // userAgent: navigator.userAgent, // Only available client-side
      // ipAddress: '...', // Need to get this server-side or via a function if required
    };

    await addDoc(clicksCollection, clickData);
    console.log(`Click logged for user ${userId} on store ${storeId}` + (couponId ? ` with coupon ${couponId}`: ''));

  } catch (error) {
    console.error("Error logging click:", error);
    // Depending on requirements, you might want to re-throw the error
    // or handle it silently so it doesn't block user redirection.
     // throw new Error('Failed to log click event.');
  }
}
