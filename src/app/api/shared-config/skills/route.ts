import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { SHARED_SKILLS_DIR, SHARED_SKILLS_CONFIG } from "@/lib/config";
import { ensureSharedConfig } from "@/lib/store";

interface SharedSkill {
  name: string;
  path: string;
  description?: string;
  enabled: boolean;
}

/**
 * GET /api/shared-config/skills - 获取所有共享 skills
 */
export async function GET() {
  try {
    ensureSharedConfig();

    // 读取启用的 skills 列表
    let enabledSkills: string[] = [];
    if (fs.existsSync(SHARED_SKILLS_CONFIG)) {
      try {
        const config = JSON.parse(fs.readFileSync(SHARED_SKILLS_CONFIG, "utf-8"));
        enabledSkills = config.enabled || [];
      } catch {
        // 配置文件解析失败，使用空数组
      }
    }

    // 扫描 skills 目录
    if (!fs.existsSync(SHARED_SKILLS_DIR)) {
      return NextResponse.json({ skills: [] });
    }

    const entries = fs.readdirSync(SHARED_SKILLS_DIR, { withFileTypes: true });
    const skills: SharedSkill[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillPath = entry.name;
      const skillFullPath = path.join(SHARED_SKILLS_DIR, skillPath);
      const skillMdPath = path.join(skillFullPath, "SKILL.md");

      // 检查是否有 SKILL.md
      if (!fs.existsSync(skillMdPath)) continue;

      // 读取 SKILL.md 获取描述
      let description = "";
      let displayName = skillPath;
      try {
        const content = fs.readFileSync(skillMdPath, "utf-8");

        // 尝试解析 YAML frontmatter
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (frontmatterMatch) {
          const frontmatter = frontmatterMatch[1];

          // 提取 name
          const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
          if (nameMatch) {
            displayName = nameMatch[1].trim();
          }

          // 提取 description
          const descMatch = frontmatter.match(/^description:\s*>?\s*\n?([\s\S]*?)(?=^\w+:|\n---|$)/m);
          if (descMatch) {
            description = descMatch[1]
              .split("\n")
              .map((line) => line.trim().replace(/^\s+/, ""))
              .join(" ")
              .trim()
              .slice(0, 200);
          }
        }

        // 如果没有从 frontmatter 获取到描述，尝试提取第一行标题
        if (!description) {
          const firstLine = content.split("\n")[0];
          if (firstLine && firstLine.startsWith("#")) {
            description = firstLine.replace(/^#+\s*/, "").trim();
          }
        }
      } catch {
        // 读取失败，使用默认值
      }

      skills.push({
        name: displayName,
        path: skillPath,
        description,
        enabled: enabledSkills.includes(skillPath),
      });
    }

    return NextResponse.json({ skills });
  } catch (error) {
    console.error("GET /api/shared-config/skills error:", error);
    return NextResponse.json(
      { error: "Failed to get shared skills" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/shared-config/skills - 添加共享 skill
 * 从管理员 agent 的 workspace/skills 复制到共享配置
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { managerName, skillPath } = body;

    if (!managerName || !skillPath) {
      return NextResponse.json(
        { error: "managerName and skillPath are required" },
        { status: 400 }
      );
    }

    // 获取管理员 agent
    const { getAgent } = await import("@/lib/store");
    const agent = getAgent(managerName);

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // 源路径：管理员 agent 的 workspace/skills/{skillPath}
    const sourcePath = path.join(agent.workspacePath, "skills", skillPath);
    const sourceSkillMd = path.join(sourcePath, "SKILL.md");

    if (!fs.existsSync(sourceSkillMd)) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    // 确保共享配置目录存在
    ensureSharedConfig();

    // 目标路径：共享配置目录
    const destPath = path.join(SHARED_SKILLS_DIR, skillPath);

    // 如果已存在，返回错误
    if (fs.existsSync(destPath)) {
      return NextResponse.json(
        { error: "Skill already exists in shared config" },
        { status: 409 }
      );
    }

    // 复制 skill 到共享配置目录
    fs.cpSync(sourcePath, destPath, { recursive: true });

    // 添加到启用的列表
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

    if (!config.enabled.includes(skillPath)) {
      config.enabled.push(skillPath);
      fs.writeFileSync(SHARED_SKILLS_CONFIG, JSON.stringify(config, null, 2), "utf-8");
    }

    return NextResponse.json({
      success: true,
      skill: { name: skillPath, path: skillPath, enabled: true },
    });
  } catch (error) {
    console.error("POST /api/shared-config/skills error:", error);
    return NextResponse.json(
      { error: "Failed to add shared skill" },
      { status: 500 }
    );
  }
}
