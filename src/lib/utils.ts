
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Timestamp } from 'firebase/firestore';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Function to format currency (Indian Rupees)
export function formatCurrency(amount: number | undefined | null): string {
  if (amount === undefined || amount === null) {
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
  // Handle cases where it might already be a Date object (e.g., from client-side state)
  if (fieldValue instanceof Date) {
    return fieldValue;
  }
  // Handle string representation if needed (less ideal, but common)
  if (typeof fieldValue === 'string') {
    try {
      const date = new Date(fieldValue);
      // Basic validation: Check if the date is valid
      if (!isNaN(date.getTime())) {
        return date;
      }
    } catch (e) {
      // Ignore errors if parsing fails
    }
  }
  // Handle Firestore serverTimestamp (which might be represented differently before write)
  // This case is less common for reading but added for robustness
  if (typeof fieldValue === 'object' && fieldValue !== null && typeof fieldValue.toDate === 'function') {
      try {
          return fieldValue.toDate();
      } catch (e) {
          // Ignore errors
      }
  }
  // If conversion is not possible or input is invalid, return null
  return null;
};
