import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';

import { authEnv } from '@/config/auth';
import authConfig from '@/libs/next-auth/auth.config';

import { OAUTH_AUTHORIZED } from './const/auth';

export const config = {
  matcher: [
    // include any files in the api or trpc folders that might have an extension
    '/(api|trpc)(.*)',
    // include the /
    '/',
    '/chat(.*)',
    '/settings(.*)',
    // ↓ cloud ↓
  ],
};

const defaultMiddleware = () => NextResponse.next();

// Initialize an Edge compatible NextAuth middleware
const { auth: nextAuthEdgeMiddleware } = NextAuth(authConfig);
const nextAuthMiddleware = nextAuthEdgeMiddleware((req) => {
  // skip the '/' route
  if (req.nextUrl.pathname === '/') return NextResponse.next();

  // Just check if session exists
  const session = req.auth;

  // Check if next-auth throws errors
  // refs: https://github.com/lobehub/lobe-chat/pull/1323
  const isLoggedIn = !!session?.expires;

  // Remove & amend OAuth authorized header
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete(OAUTH_AUTHORIZED);
  if (isLoggedIn) requestHeaders.set(OAUTH_AUTHORIZED, 'true');

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
});

const isProtectedRoute = createRouteMatcher([
  '/settings(.*)',
  // ↓ cloud ↓
]);

export default authEnv.NEXT_PUBLIC_ENABLE_CLERK_AUTH
  ? clerkMiddleware(
      (auth, req) => {
        if (isProtectedRoute(req)) auth().protect();
      },
      { signInUrl: '/login', signUpUrl: '/signup' },
    )
  : authEnv.NEXT_PUBLIC_ENABLE_NEXT_AUTH
    ? nextAuthMiddleware
    : defaultMiddleware;
