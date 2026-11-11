import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getAuth } from "../../server/auth";

export const dynamic = "force-dynamic";

export default async function PrivateLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) {
    const hasSessionCookie = requestHeaders.get("cookie")
      ?.split(";")
      .some((cookie) => /^\s*(?:__Secure-|__Host-)?better-auth\.session_token=/.test(cookie));
    redirect(hasSessionCookie ? "/login?expired=1" : "/login");
  }
  return children;
}
