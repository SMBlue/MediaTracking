/**
 * Walks the BSD-Client-Project list to analyze hierarchy completeness.
 * Reports how many level-2 items have level-3 children, etc.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getListItems, getItemChildren } from "@/lib/concur/lists";
import { CONCUR_LIST_IDS } from "@/lib/concur/constants";

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
    const level1 = await getListItems(CONCUR_LIST_IDS.PROJECTS);

    let totalProjects = 0;
    let projectsWithLocations = 0;
    let projectsWithoutLocations = 0;
    const sampleEmpty: { client: string; project: string }[] = [];
    const sampleFull: { client: string; project: string; locationCount: number }[] = [];

    for (const client of level1) {
      const projects = await getItemChildren(client.id);
      for (const project of projects) {
        totalProjects++;
        const locations = await getItemChildren(project.id);
        if (locations.length > 0) {
          projectsWithLocations++;
          if (sampleFull.length < 5) {
            sampleFull.push({
              client: client.value,
              project: project.value,
              locationCount: locations.length,
            });
          }
        } else {
          projectsWithoutLocations++;
          if (sampleEmpty.length < 5) {
            sampleEmpty.push({
              client: client.value,
              project: project.value,
            });
          }
        }
      }
    }

    return NextResponse.json({
      status: "success",
      summary: {
        totalClients: level1.length,
        totalProjects,
        projectsWithLocations,
        projectsWithoutLocations,
        percentWithLocations: totalProjects > 0
          ? Math.round((projectsWithLocations / totalProjects) * 100)
          : 0,
      },
      sampleProjectsWithLocations: sampleFull,
      sampleProjectsWithoutLocations: sampleEmpty,
    });
  } catch (err) {
    return NextResponse.json(
      { status: "failed", error: String(err) },
      { status: 500 }
    );
  }
}
