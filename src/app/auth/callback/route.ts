import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const ALLOWED_DOMAIN = "bluestate.co";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=auth", requestUrl.origin)
    );
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
    code
  );
  if (exchangeError) {
    return NextResponse.redirect(
      new URL("/login?error=auth", requestUrl.origin)
    );
  }

  // Hard-enforce domain — the Google `hd` hint is just a UI filter and can
  // be bypassed. Reject anything that isn't @bluestate.co.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? "";
  const atIndex = email.lastIndexOf("@");
  const domain =
    atIndex > 0 ? email.slice(atIndex + 1).toLowerCase() : "";

  if (domain !== ALLOWED_DOMAIN) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL("/login?error=domain", requestUrl.origin)
    );
  }

  return NextResponse.redirect(new URL("/", requestUrl.origin));
}
