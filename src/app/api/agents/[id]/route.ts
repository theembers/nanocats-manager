import { NextRequest, NextResponse } from "next/server";
import { getAgent, updateAgent, softDeleteAgent } from "@/lib/store";
import { processManager } from "@/lib/process-manager";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/agents/[id] - Get single agent details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: name } = await params;
    const agent = getAgent(name);

    if (!agent) {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404 }
      );
    }

    // 使用 agent.name 作为进程管理的 key
    const isRunning = processManager.isRunning(agent.name);
    const agentWithStatus = {
      ...agent,
      status: isRunning ? "running" : "stopped",
    };

    return NextResponse.json(agentWithStatus);
  } catch (error) {
    console.error("GET /api/agents/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to get agent" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/agents/[id] - Update agent metadata
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: name } = await params;
    const body = await request.json();
    const { name: newName, port } = body;

    const agent = getAgent(name);
    if (!agent) {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404 }
      );
    }

    // 字段更新
    const updates: { name?: string; port?: number } = {};
    if (newName !== undefined) updates.name = newName;
    if (port !== undefined) updates.port = port;

    const updatedAgent = updateAgent(name, updates);

    if (!updatedAgent) {
      return NextResponse.json(
        { error: "Failed to update agent" },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedAgent);
  } catch (error) {
    console.error("PUT /api/agents/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update agent" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/agents/[id] - Delete agent (backup entire directory)
 * 将整个 agent 目录移动到备份目录 ~/.nanocats-manager/backups/
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: name } = await params;

    const agent = getAgent(name);
    if (!agent) {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404 }
      );
    }

    // Stop the process if running
    if (processManager.isRunning(agent.name)) {
      await processManager.stopGateway(agent.name);
    }

    // 假删除：备份整个 agent 目录
    const backupResult = softDeleteAgent(name);
    if (!backupResult) {
      return NextResponse.json(
        { error: "Failed to backup agent" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Agent "${name}" has been backed up to: ${backupResult.backupPath}`,
      backupPath: backupResult.backupPath,
    });
  } catch (error) {
    console.error("DELETE /api/agents/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete agent" },
      { status: 500 }
    );
  }
}
