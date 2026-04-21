import { NextResponse } from "next/server";
import { getAgents } from "@/lib/store";

/**
 * GET /api/shared-config/members - 获取所有 agent
 */
export async function GET() {
  try {
    const agents = getAgents();

    return NextResponse.json({
      members: agents.map((agent) => ({
        name: agent.name,
        status: agent.status,
      })),
    });
  } catch (error) {
    console.error("GET /api/shared-config/members error:", error);
    return NextResponse.json(
      { error: "Failed to get members" },
      { status: 500 }
    );
  }
}
