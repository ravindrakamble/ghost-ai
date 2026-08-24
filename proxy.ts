import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// "/share(.*)" and "/api/public(.*)" (spec 34): the public, unauthenticated
// read-only share page and its backing JSON API. Both are new, unclaimed
// prefixes — narrowly scoped so nothing else becomes accidentally public.
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/share(.*)",
  "/api/public(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
