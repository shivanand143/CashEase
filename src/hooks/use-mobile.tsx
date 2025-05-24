
"use client"; // Ensure this hook only runs on the client

import * as React from "react";

const MOBILE_BREAKPOINT = 768; // Standard Tailwind md breakpoint

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    // Initialize state based on current window size if available, otherwise default to false
    if (typeof window !== 'undefined') {
      return window.innerWidth < MOBILE_BREAKPOINT;
    }
    return false; // Default for SSR or if window is not defined
  });

  React.useEffect(() => {
    // Check if window is defined (prevents errors during SSR)
    if (typeof window === 'undefined') {
      return;
    }

    const checkDevice = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    // Listener for window resize
    window.addEventListener('resize', checkDevice);

    // Cleanup listener on component unmount
    return () => window.removeEventListener('resize', checkDevice);
  }, []); // Empty dependency array ensures this runs only once on mount

  return isMobile;
}
