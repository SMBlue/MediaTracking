"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();

  const errorFromUrl = searchParams.get("error");
  const errorMessage =
    errorFromUrl === "domain"
      ? "Only @bluestate.co email addresses are allowed."
      : errorFromUrl === "auth"
      ? "Authentication failed. Please try again."
      : error;

  const handleGoogleSignIn = async () => {
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          hd: "bluestate.co",
        },
      },
    });

    if (error) {
      console.error("OAuth error:", error);
      setError(error.message);
      setLoading(false);
    } else if (data?.url) {
      window.location.href = data.url;
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center space-y-2">
        <div className="mx-auto size-10 rounded-lg bg-bs-cobalt/95 flex items-center justify-center shadow-sm">
          <span className="text-white text-lg font-bold tracking-tight">M</span>
        </div>
        <CardTitle className="text-xl pt-1">MBA Tracker</CardTitle>
        <CardDescription>Sign in with your Blue State Google account</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorMessage && (
          <div className="p-3 rounded-md border border-bs-coral/30 bg-bs-coral/5 text-bs-coral-dark text-sm">
            {errorMessage}
          </div>
        )}
        <Button
          onClick={handleGoogleSignIn}
          className="w-full"
          disabled={loading}
        >
          {loading ? "Redirecting…" : "Sign in with Google"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Restricted to @bluestate.co accounts
        </p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
