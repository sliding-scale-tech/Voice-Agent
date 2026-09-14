import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { PUBLIC_ROUTE_PATTERNS } from "@/lib/public-routes";

const isPublicRoute = createRouteMatcher(PUBLIC_ROUTE_PATTERNS);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mp3)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
