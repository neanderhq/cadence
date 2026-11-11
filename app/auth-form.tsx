"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "./auth-client";

type Props = { mode: "login" | "signup"; expired?: boolean };

export function AuthForm({ mode, expired = false }: Props) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isSignup = mode === "signup";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();

    try {
      const result = isSignup
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message || "We couldn’t complete that request. Check your details and try again.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("We couldn’t reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <p className="eyebrow">Content Board</p>
      <h1>{isSignup ? "Create your account" : "Welcome back"}</h1>
      <p>{isSignup ? "Your private workspace is created when you sign up." : "Sign in to open your private workspace."}</p>
      {expired && <p className="error" role="status">Your session expired. Please sign in again.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <form onSubmit={submit}>
        {isSignup && <label>Name<input name="name" autoComplete="name" required maxLength={120} /></label>}
        <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
        <label>Password<input name="password" type="password" autoComplete={isSignup ? "new-password" : "current-password"} required minLength={isSignup ? 12 : undefined} maxLength={128} /></label>
        <button type="submit" disabled={busy}>{busy ? "Please wait…" : isSignup ? "Create account" : "Sign in"}</button>
      </form>
      <p>{isSignup ? "Already have an account? " : "New to Content Board? "}<Link href={isSignup ? "/login" : "/signup"}>{isSignup ? "Sign in" : "Create an account"}</Link></p>
    </main>
  );
}
