
"use client"; // Error components must be Client Components

import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Log the error to an error reporting service
    console.error("Root Error Boundary Caught:", error);
  }, [error]);

  return (
    <div className="container mx-auto flex flex-col items-center justify-center min-h-[calc(100vh-20rem)] space-y-6">
      <Alert variant="destructive" className="max-w-md">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Something went wrong!</AlertTitle>
        <AlertDescription>
           {error.message || "An unexpected error occurred."}
        </AlertDescription>
      </Alert>
      <Button
        onClick={
          // Attempt to recover by trying to re-render the segment
          () => reset()
        }
      >
        Try again
      </Button>
    </div>
  );
}
