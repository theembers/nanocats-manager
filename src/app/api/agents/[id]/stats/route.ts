import { NextRequest, NextResponse } from "next/server";
import { getAgent } from "@/lib/store";
import { processManager } from "@/lib/process-manager";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: name } = await params;
    const agent = getAgent(name);

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const memory = await processManager.getMemory(name);

    return NextResponse.json({
      pid: agent.pid || null,
      memory,
    });
  } catch (error) {
    console.error("GET /api/agents/[id]/stats error:", error);
    return NextResponse.json(
      { error: "Failed to get agent stats" },
      { status: 500 }
    );
  }
}