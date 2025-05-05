// src/app/api/disable-preview/route.ts
import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextRequest } from 'next/server'

// Route handler for disabling draft mode (previously preview mode)
// Example: /api/disable-preview?redirect=/
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const redirectPath = searchParams.get('redirect') || '/' // Default redirect path

  // Disable Draft Mode by clearing the cookie
  draftMode().disable()

  console.log('Preview mode disabled. Redirecting...')
  // Redirect to the specified path or homepage
  redirect(redirectPath)

  // Note: If using pages router, you would use `res.clearPreviewData()` and `res.redirect()`
  // With App Router, `draftMode().disable()` and `redirect()` are used.
}
