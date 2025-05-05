// src/app/api/preview/route.ts
import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextRequest } from 'next/server'

// Route handler for enabling draft mode (previously preview mode)
// Example: /api/preview?secret=<token>&slug=/posts/my-post
// In production, ensure the secret is securely managed and verified.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  const slug = searchParams.get('slug') // The slug of the page to preview

  // Check the secret and next parameters
  // PREVIEW_SECRET_TOKEN should be set in your environment variables
  // This is a basic check; enhance security as needed.
  if (secret !== process.env.PREVIEW_SECRET_TOKEN) {
    return new Response('Invalid token', { status: 401 })
  }

  // Validate the slug parameter
  if (!slug) {
    return new Response('Missing slug parameter', { status: 400 })
  }

  // Enable Draft Mode by setting the cookie
  draftMode().enable()

  // Redirect to the path from the fetched post
  // Ensure the slug starts with '/'
  const redirectPath = slug.startsWith('/') ? slug : `/${slug}`
  console.log(`Preview mode enabled. Redirecting to: ${redirectPath}`)

  // Redirect to the path from the fetched post
  redirect(redirectPath)

  // Note: If using pages router, you would use `res.setPreviewData({})` and `res.redirect(slug)`
  // With App Router, `draftMode().enable()` and `redirect()` are used.
}
