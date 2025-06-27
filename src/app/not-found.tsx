"use client";

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Frown } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function NotFoundPage() {
  return (
    <React.Suspense fallback={<div>Loading...</div>}>
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
    </React.Suspense>
  );
}
