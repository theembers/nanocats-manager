import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { SHARED_SKILLS_DIR, SHARED_SKILLS_CONFIG } from "@/lib/config";

interface RouteParams {
  params: Promise<{ name: string }>;
}

/**
 * PUT /api/shared-config/skills/[name] - 启用/禁用共享 skill
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { name } = await params;
    const body = await request.json();
    const { enabled, managerName } = body;

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

    // 读取当前配置
    let config = { enabled: [] as string[] };
    if (fs.existsSync(SHARED_SKILLS_CONFIG)) {
      try {
        config = JSON.parse(fs.readFileSync(SHARED_SKILLS_CONFIG, "utf-8"));
        if (!Array.isArray(config.enabled)) {
          config.enabled = [];
        }
      } catch {
        // 使用默认配置
      }
    }

    // 更新配置
    if (enabled) {
      if (!config.enabled.includes(name)) {
        config.enabled.push(name);
      }
    } else {
      config.enabled = config.enabled.filter((s) => s !== name);
    }

    // 保存配置
    fs.writeFileSync(SHARED_SKILLS_CONFIG, JSON.stringify(config, null, 2), "utf-8");

    return NextResponse.json({ success: true, enabled });
  } catch (error) {
    console.error("PUT /api/shared-config/skills/[name] error:", error);
    return NextResponse.json(
      { error: "Failed to update shared skill" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/shared-config/skills/[name] - 删除共享 skill
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { name } = await params;
    const { searchParams } = new URL(request.url);
    const managerName = searchParams.get("managerName");

    // 验证权限：只有 manager 可以删除
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

    // 检查 skill 是否存在
    const skillPath = path.join(SHARED_SKILLS_DIR, name);
    if (!fs.existsSync(skillPath)) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    // 删除 skill 目录
    fs.rmSync(skillPath, { recursive: true, force: true });

    // 从配置中移除
    let config = { enabled: [] as string[] };
    if (fs.existsSync(SHARED_SKILLS_CONFIG)) {
      try {
        config = JSON.parse(fs.readFileSync(SHARED_SKILLS_CONFIG, "utf-8"));
        if (!Array.isArray(config.enabled)) {
          config.enabled = [];
        }
      } catch {
        // 使用默认配置
      }
    }

    config.enabled = config.enabled.filter((s) => s !== name);
    fs.writeFileSync(SHARED_SKILLS_CONFIG, JSON.stringify(config, null, 2), "utf-8");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/shared-config/skills/[name] error:", error);
    return NextResponse.json(
      { error: "Failed to delete shared skill" },
      { status: 500 }
    );
  }
}
