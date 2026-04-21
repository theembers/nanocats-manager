import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { SHARED_MCP_CONFIG } from "@/lib/config";
import { ensureSharedConfig } from "@/lib/store";

interface McpConfig {
  mcpServers: Record<string, any>;
}

/**
 * GET /api/shared-config/mcp - 获取 MCP 配置
 */
export async function GET() {
  try {
    ensureSharedConfig();

    if (!fs.existsSync(SHARED_MCP_CONFIG)) {
      return NextResponse.json({ mcpServers: {} });
    }

    try {
      const config = JSON.parse(fs.readFileSync(SHARED_MCP_CONFIG, "utf-8"));
      // 返回纯 mcpServers 对象，不包含字段名
      return NextResponse.json(config.mcpServers || {});
    } catch {
      return NextResponse.json({});
    }
  } catch (error) {
    console.error("GET /api/shared-config/mcp error:", error);
    return NextResponse.json(
      { error: "Failed to get MCP config" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/shared-config/mcp - 更新 MCP 配置
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { mcpServers, managerName } = body;

    // 验证权限：只有 manager 可以修改
    if (managerName) {
      const { getAgent } = await import("@/lib/store");
      const agent = getAgent(managerName);
      if (!agent) {
        return NextResponse.json(
          { error: "Agent not found" },
          { status: 404 }
        );
      }
    }

    // 验证 JSON 格式
    if (typeof mcpServers !== "object" || mcpServers === null) {
      return NextResponse.json(
        { error: "Invalid MCP config: mcpServers must be an object" },
        { status: 400 }
      );
    }

    ensureSharedConfig();

    // 保存时用 mcpServers 作为字段名包装，保持文件格式一致
    const config: McpConfig = { mcpServers };
    fs.writeFileSync(SHARED_MCP_CONFIG, JSON.stringify(config, null, 2), "utf-8");

    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error("PUT /api/shared-config/mcp error:", error);
    return NextResponse.json(
      { error: "Failed to update MCP config" },
      { status: 500 }
    );
  }
}
