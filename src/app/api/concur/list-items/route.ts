/**
 * Fetch list items from a Concur list.
 * Useful for exploring list structure during setup.
 *
 * Usage:
 *   GET /api/concur/list-items?listId={uuid}        — top-level items
 *   GET /api/concur/list-items?itemId={uuid}        — children of a specific item
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getListItems, getItemChildren } from "@/lib/concur/lists";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const listId = searchParams.get("listId");
  const itemId = searchParams.get("itemId");

  if (!listId && !itemId) {
    return NextResponse.json(
      { error: "Provide either listId (for top-level items) or itemId (for children)" },
      { status: 400 }
    );
  }

  try {
    const items = listId
      ? await getListItems(listId)
      : await getItemChildren(itemId!);

    return NextResponse.json({
      status: "success",
      itemCount: items.length,
      items: items.map((item) => ({
        id: item.id,
        code: item.code,
        shortCode: item.shortCode,
        value: item.value,
        parentId: item.parentId,
        level: item.level,
        isDeleted: item.isDeleted,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { status: "failed", error: String(err) },
      { status: 500 }
    );
  }
}
