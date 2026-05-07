/**
 * Concur connection test endpoint.
 * Calls GET /list/v4/lists to verify auth + API access works.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLists } from "@/lib/concur/lists";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const lists = await getLists();
    return NextResponse.json({
      status: "success",
      listCount: lists.length,
      lists: lists.map((l) => ({
        id: l.id,
        value: l.value,
        levelCount: l.levelCount,
        category: l.category,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { status: "failed", error: String(err) },
      { status: 500 }
    );
  }
}
