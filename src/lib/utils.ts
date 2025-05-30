
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Timestamp } from 'firebase/firestore';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Function to format currency (Indian Rupees)
export function formatCurrency(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return '₹0.00'; // Or return an empty string or placeholder
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Helper function to safely convert Firestore Timestamps or JS Dates to JS Dates
// This function is now LESS central, as we primarily work with Timestamps.
// It's still useful for converting a Timestamp to a Date specifically for UI components
// that require a JS Date object (like react-day-picker).
export const safeToDate = (fieldValue: any): Date | null => {
  if (fieldValue instanceof Timestamp) {
    return fieldValue.toDate();
  }
  if (fieldValue instanceof Date) { // If it's already a JS Date
    return fieldValue;
  }
  // Attempt to parse if it's a string (less common for Firestore fields)
  if (typeof fieldValue === 'string') {
    try {
      const date = new Date(fieldValue);
      if (!isNaN(date.getTime())) {
        return date;
      }
    } catch (e) { /* Ignore */ }
  }
  // Handle Firestore's serverTimestamp() FieldValue during optimistic updates if data is read before committed.
  // This case is rare for direct usage as FieldValue is a sentinel.
  if (typeof fieldValue === 'object' && fieldValue !== null && typeof (fieldValue as any).toDate === 'function') {
    // This might catch Timestamps again, but also other objects with toDate, be cautious.
    try {
      return (fieldValue as any).toDate();
    } catch (e) { /* Ignore */ }
  }
  return null;
};


export function isValidHttpUrl(string: string | undefined | null): boolean {
  if (!string) return false;
  let url;
  try {
    if (string.startsWith("Error:") || string.startsWith("Unhandled") || string.length > 2083) {
      console.warn("Invalid URL pattern detected in isValidHttpUrl:", string);
      return false;
    }
    url = new URL(string);
  } catch (_) {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
};

export const appendClickIdToUrl = (url: string, clickId: string, storeAffiliateLink?: string | null): string => {
  if (!url || !isValidHttpUrl(url)) {
    console.warn("ProductCard/CouponCard: Attempted to append click ID to an invalid URL:", url);
    const fallbackUrl = (storeAffiliateLink && isValidHttpUrl(storeAffiliateLink)) ? storeAffiliateLink : '#';
    if (fallbackUrl === '#') return '#';
    try {
      const fallbackUrlObj = new URL(fallbackUrl);
      fallbackUrlObj.searchParams.set('click_id', clickId);
      fallbackUrlObj.searchParams.set('subid', clickId);
      fallbackUrlObj.searchParams.set('aff_sub', clickId);
      return fallbackUrlObj.toString();
    } catch (e) {
        console.error("Error appending click ID to fallback URL:", fallbackUrl, e);
        return '#';
    }
  }
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.set('click_id', clickId);
    urlObj.searchParams.set('subid', clickId);
    urlObj.searchParams.set('aff_sub', clickId);
    return urlObj.toString();
  } catch (e) {
    console.warn("Error appending click ID to URL, returning original:", url, e);
    return url;
  }
};
