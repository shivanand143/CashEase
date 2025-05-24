
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
export const safeToDate = (fieldValue: any): Date | null => {
  if (fieldValue instanceof Timestamp) {
    return fieldValue.toDate();
  }
  if (fieldValue instanceof Date) {
    return fieldValue;
  }
  if (typeof fieldValue === 'string') {
    try {
      const date = new Date(fieldValue);
      if (!isNaN(date.getTime())) {
        return date;
      }
    } catch (e) { /* Ignore */ }
  }
  if (typeof fieldValue === 'object' && fieldValue !== null && typeof (fieldValue as any).toDate === 'function') {
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
    // Basic sanity checks for common error strings or overly long strings
    if (string.startsWith("Error:") || string.startsWith("Unhandled") || string.length > 2083) { // Max URL length
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
    // Fallback to store's main affiliate link if product/coupon link is bad, then to '#'
    const fallbackUrl = (storeAffiliateLink && isValidHttpUrl(storeAffiliateLink)) ? storeAffiliateLink : '#';
    if (fallbackUrl === '#') return '#';
    try {
      const fallbackUrlObj = new URL(fallbackUrl);
      fallbackUrlObj.searchParams.set('click_id', clickId); // Using 'click_id'
      fallbackUrlObj.searchParams.set('subid', clickId);
      fallbackUrlObj.searchParams.set('aff_sub', clickId); // Common parameter for affiliate tracking
      return fallbackUrlObj.toString();
    } catch (e) {
        console.error("Error appending click ID to fallback URL:", fallbackUrl, e);
        return '#';
    }
  }
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.set('click_id', clickId); // Consistent parameter name
    urlObj.searchParams.set('subid', clickId); // Common parameter
    urlObj.searchParams.set('aff_sub', clickId); // Another common parameter
    return urlObj.toString();
  } catch (e) {
    console.warn("Error appending click ID to URL, returning original:", url, e);
    return url; // Fallback to original URL if parsing/modification fails
  }
};
