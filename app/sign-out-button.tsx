"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "./auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [error, setError] = useState("");

  async function signOut() {
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError(result.error.message || "We couldn’t sign you out. Please try again.");
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setError("We couldn’t reach the server. Check your connection and try again.");
    }
  }

  return <div className="actions"><button type="button" onClick={signOut}>Sign out</button>{error && <span className="error" role="alert">{error}</span>}</div>;
}
