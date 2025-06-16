// src/app/api/disable-preview/route.ts
import { draftMode } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextRequest } from 'next/server';

// Route handler for disabling draft mode (preview mode)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const redirectPath = searchParams.get('redirect') || '/';

  // ✅ Await draftMode() before calling disable
  const draft = await draftMode();
  draft.disable();

  console.log('Preview mode disabled. Redirecting...');

  // ✅ Trigger redirect
  redirect(redirectPath);
}
