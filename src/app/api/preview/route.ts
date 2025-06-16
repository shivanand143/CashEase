// src/app/api/preview/route.ts
import { draftMode } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const slug = searchParams.get('slug');

  if (secret !== process.env.PREVIEW_SECRET_TOKEN) {
    return new Response('Invalid token', { status: 401 });
  }

  if (!slug) {
    return new Response('Missing slug parameter', { status: 400 });
  }

  // ✅ Correctly await and enable draft mode
  const draft = await draftMode();
  draft.enable();

  const redirectPath = slug.startsWith('/') ? slug : `/${slug}`;
  console.log(`Preview mode enabled. Redirecting to: ${redirectPath}`);

  redirect(redirectPath);
}
