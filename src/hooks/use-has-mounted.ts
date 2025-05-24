
"use client";

import { useState, useEffect } from 'react';

/**
 * Custom hook to determine if the component has mounted on the client.
 * This is useful for preventing hydration mismatches when rendering
 * different UI based on client-side information (e.g., window size).
 * @returns {boolean} True if the component has mounted, false otherwise.
 */
export function useHasMounted() {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  return hasMounted;
}
