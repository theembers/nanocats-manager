import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import {
  getAgents,
  createAgent,
  getNextAvailablePort,
  getNextWebchatPort,
  scanAndLoadAgentsFromDisk,
} from "@/lib/store";
import { generateConfigFromTemplate } from "@/lib/config-template";
import { processManager } from "@/lib/process-manager";
import type { AgentInstance } from "@/lib/types";
import { AGENTS_DIR } from "@/lib/config";

function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function expandPath(p: string): string {
  if (p.startsWith("~")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

const DEFAULT_AGENTS_PATH = AGENTS_DIR;

/**
 * GET /api/agents - List all agent instances
 * 首先扫描磁盘加载新发现的 agents，然后返回列表
 */
export async function GET() {
  try {
    // 扫描磁盘加载 agents
    const agents = scanAndLoadAgentsFromDisk();

    // 同步进程状态
    processManager.syncAllStatuses();

    const agentsWithStatus: AgentInstance[] = agents.map((agent) => {
      // 使用 agent.name 作为进程管理的 key
      const isRunning = processManager.isRunning(agent.name);
      return {
        ...agent,
        status: isRunning ? "running" : (agent.status === "error" ? "error" : "stopped"),
      };
    });

    return NextResponse.json(agentsWithStatus);
  } catch (error) {
    console.error("GET /api/agents error:", error);
    return NextResponse.json(
      { error: "Failed to get agents" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/agents - Create a new agent instance
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, basePath, port, provider, apiKey, model } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    const resolvedBasePath = expandPath(basePath || DEFAULT_AGENTS_PATH);

    if (!fs.existsSync(resolvedBasePath)) {
      fs.mkdirSync(resolvedBasePath, { recursive: true });
    }

    const sanitizedName = sanitizeName(name);
    const agentDirName = `.nanobot-${sanitizedName}`;
    const agentDir = path.join(resolvedBasePath, agentDirName);

    const configPath = path.join(agentDir, "config.json");
    // nanobot onboard 会在 workspace 目录下直接创建文件
    // 所以需要指向 workspace/ 子目录，而不是 agent 根目录
    const workspacePath = path.join(agentDir, "workspace");

    const finalPort = port ?? getNextAvailablePort();
    const webchatPort = getNextWebchatPort();

    generateConfigFromTemplate({
      configPath,
      workspacePath,
      gatewayPort: finalPort,
      webchatPort,
      model: model || "MiniMax-M2.7",
      provider: provider || "minimax",
      apiKey: apiKey || "",
    });

    // 使用 name 作为主键，不再生成 UUID
    const newAgent: AgentInstance = {
      name,
      configPath,
      workspacePath,
      port: finalPort,
      status: "stopped",
      createdAt: new Date().toISOString(),
    };

    const createdAgent = createAgent(newAgent);

    return NextResponse.json(createdAgent, { status: 201 });
  } catch (error) {
    console.error("POST /api/agents error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create agent" },
      { status: 500 }
    );
  }
}
