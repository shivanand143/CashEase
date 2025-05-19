"use client"; // Mark as client component

import * as React from 'react'; // Import React
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Frown } from 'lucide-react'

// This page is already simple enough that a separate client content file isn't strictly necessary
// unless useSearchParams or other client hooks were being used.
// For consistency with the reversion, we'll ensure it's a client component.

export default function NotFoundPage() { // Renamed from NotFound to NotFoundPage for clarity
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-20rem)] text-center px-4">
      <Frown className="w-24 h-24 text-muted-foreground mb-6" />
      <h1 className="text-4xl font-bold mb-2">404 - Page Not Found</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Oops! The page you are looking for does not exist or has been moved.
      </p>
      <Button asChild>
        <Link href="/">Go back to Homepage</Link>
      </Button>
    </div>
  )
}
