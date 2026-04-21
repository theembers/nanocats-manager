import fs from "fs";
import path from "path";
import os from "os";
import type { AgentInstance } from "./types";
import MANAGER_SKILL_CONTENT from "../assets/skills/nanocats-manager-skill/SKILL.md";
import {
  MANAGER_DIR,
  STORE_FILE,
  SHARED_CONFIG_DIR,
  BACKUP_DIR,
  SHARED_SKILLS_DIR,
  SHARED_SKILLS_CONFIG,
  SHARED_MCP_CONFIG,
  AGENTS_DIR,
  NANOBOT_DIR_PREFIX,
} from "./config";

export const BACKUP_AGENTS_FILE = path.join(BACKUP_DIR, "agents.json");
export const MANAGER_SKILL_NAME = "nanocats-manager-skill";

/**
 * 确保存储目录和文件存在，返回当前存储的所有 AgentInstance
 * 同时清理孤儿数据（无法关联到配置文件的记录）
 */
export function ensureStore(): AgentInstance[] {
  if (!fs.existsSync(MANAGER_DIR)) {
    fs.mkdirSync(MANAGER_DIR, { recursive: true });
  }

  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify([], null, 2), "utf-8");
    return [];
  }

  try {
    const data = fs.readFileSync(STORE_FILE, "utf-8");
    const agents = JSON.parse(data) as AgentInstance[];
    
    // 清理孤儿数据：过滤掉无法关联到配置文件的 agent
    const validAgents = agents.filter((agent) => {
      const configExists = fs.existsSync(agent.configPath);
      const workspaceExists = fs.existsSync(agent.workspacePath);
      
      if (!configExists || !workspaceExists) {
        console.log(`[Store Cleanup] Removing orphan agent: ${agent.name} (config exists: ${configExists}, workspace exists: ${workspaceExists})`);
        return false;
      }
      return true;
    });
    
    // 如果有孤儿数据被清理，保存清理后的结果
    if (validAgents.length !== agents.length) {
      console.log(`[Store Cleanup] Removed ${agents.length - validAgents.length} orphan agent(s)`);
      saveStore(validAgents);
    }
    
    return validAgents;
  } catch {
    // 如果文件损坏，重置为空数组
    fs.writeFileSync(STORE_FILE, JSON.stringify([], null, 2), "utf-8");
    return [];
  }
}

/**
 * 保存 agents 数组到 JSON 文件
 */
export function saveStore(agents: AgentInstance[]): void {
  ensureStore(); // 确保目录存在
  fs.writeFileSync(STORE_FILE, JSON.stringify(agents, null, 2), "utf-8");
}

/**
 * 获取所有 agent 实例
 */
export function getAgents(): AgentInstance[] {
  return ensureStore();
}

/**
 * 根据 name 获取单个 agent（name 作为主键）
 */
export function getAgent(name: string): AgentInstance | undefined {
  const agents = ensureStore();
  return agents.find((agent) => agent.name === name);
}

/**
 * 创建新的 agent
 * 使用 name 作为主键进行唯一性检查
 */
export function createAgent(agent: AgentInstance): AgentInstance {
  const agents = ensureStore();

  // 检查是否已存在相同 name（主键）
  if (agents.some((a) => a.name === agent.name)) {
    throw new Error(`Agent with name "${agent.name}" already exists`);
  }

  agents.push(agent);
  saveStore(agents);
  return agent;
}

/**
 * 更新 agent 的部分字段
 * 使用 name 作为主键查找
 */
export function updateAgent(
  name: string,
  updates: Partial<Omit<AgentInstance, "name">>
): AgentInstance | undefined {
  const agents = ensureStore();
  const index = agents.findIndex((agent) => agent.name === name);

  if (index === -1) {
    return undefined;
  }

  agents[index] = { ...agents[index], ...updates };
  saveStore(agents);
  return agents[index];
}

/**
 * 删除 agent
 * 使用 name 作为主键查找
 */
export function deleteAgent(name: string): boolean {
  const agents = ensureStore();
  const index = agents.findIndex((agent) => agent.name === name);

  if (index === -1) {
    return false;
  }

  agents.splice(index, 1);
  saveStore(agents);
  return true;
}

/**
 * 更新 agent 的运行状态
 * 当状态变为 stopped 时，自动删除 pid
 * 使用 name 作为主键查找
 */
export function updateAgentStatus(
  name: string,
  status: AgentInstance["status"],
  pid?: number
): AgentInstance | undefined {
  const agents = ensureStore();
  const index = agents.findIndex((agent) => agent.name === name);

  if (index === -1) {
    return undefined;
  }

  agents[index].status = status;

  if (status === "stopped") {
    delete agents[index].pid;
  } else if (pid !== undefined) {
    agents[index].pid = pid;
  }

  saveStore(agents);
  return agents[index];
}

/**
 * 获取下一个可用端口
 * 从 18790 开始，找到第一个未被占用的端口
 */
export function getNextAvailablePort(): number {
  const BASE_PORT = 18790;
  const agents = ensureStore();

  const usedPorts = new Set(agents.map((agent) => agent.port));

  let port = BASE_PORT;
  while (usedPorts.has(port)) {
    port++;
  }

  return port;
}

/**
 * 获取下一个可用的 webchat 端口
 * 从 19121 开始，独立于 gateway 端口池
 */
export function getNextWebchatPort(): number {
  const BASE_PORT = 19121;
  const agents = ensureStore();

  // 需要从各 agent 的 config.json 中读取 webchat.port
  // 这里暂时只检查已知的 agents，后续可以通过扫描 config 优化
  const usedPorts = new Set<number>();

  for (const agent of agents) {
    try {
      if (fs.existsSync(agent.configPath)) {
        const config = JSON.parse(fs.readFileSync(agent.configPath, "utf-8"));
        if (config.channels?.webchat?.port) {
          usedPorts.add(config.channels.webchat.port);
        }
      }
    } catch {
      // 忽略读取错误
    }
  }

  let port = BASE_PORT;
  while (usedPorts.has(port)) {
    port++;
  }

  return port;
}

/**
 * 从文件系统扫描并加载 agents
 * 扫描 AGENTS_BASE_PATH 下的 .nanobot-* 目录
 * 自动添加到存储中（如果不存在）
 * 自动修复重复的端口分配
 */
export function scanAndLoadAgentsFromDisk(): AgentInstance[] {
  if (!fs.existsSync(AGENTS_DIR)) {
    return ensureStore();
  }

  const agents = ensureStore();
  const existingPaths = new Set(agents.map((a) => a.workspacePath));
  let hasChanges = false;

  // 1. 先检测并修复已存在 agents 中的重复端口
  const portToAgents = new Map<number, AgentInstance[]>();
  for (const agent of agents) {
    const list = portToAgents.get(agent.port) || [];
    list.push(agent);
    portToAgents.set(agent.port, list);
  }

  // 为重复端口的 agent 分配新端口（保留第一个，其他的重新分配）
  for (const [port, agentList] of portToAgents) {
    if (agentList.length > 1) {
      console.log(`[Port Fix] Found ${agentList.length} agents using port ${port}`);
      // 保留第一个，为其他的分配新端口
      for (let i = 1; i < agentList.length; i++) {
        const agent = agentList[i];
        const usedPorts = new Set(agents.map((a) => a.port));
        let newPort = 18790;
        while (usedPorts.has(newPort)) {
          newPort++;
        }
        console.log(`[Port Fix] Reassigning port for ${agent.name}: ${agent.port} -> ${newPort}`);
        agent.port = newPort;
        hasChanges = true;
      }
    }
  }

  try {
    const entries = fs.readdirSync(AGENTS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith(NANOBOT_DIR_PREFIX)) {
        continue;
      }

      const agentDir = path.join(AGENTS_DIR, entry.name);
      const configPath = path.join(agentDir, "config.json");
      const workspacePath = path.join(agentDir, "workspace");

      // 检查是否有 config.json
      if (!fs.existsSync(configPath)) {
        continue;
      }

      // 如果已存在，跳过
      if (existingPaths.has(workspacePath)) {
        continue;
      }

      // 从目录名提取 agent 名称
      const name = entry.name.slice(NANOBOT_DIR_PREFIX.length);

      // 获取下一个可用端口（基于当前已使用的端口集合）
      const usedPorts = new Set(agents.map((a) => a.port));
      let port = 18790;
      while (usedPorts.has(port)) {
        port++;
      }

      // 创建新的 agent（不再生成 UUID，使用 name 作为主键）
      const newAgent: AgentInstance = {
        name,
        configPath,
        workspacePath,
        port,
        status: "stopped",
        createdAt: new Date().toISOString(),
      };

      agents.push(newAgent);
      // 立即将新端口加入已使用集合，确保下一个 agent 获得不同端口
      usedPorts.add(port);
      hasChanges = true;
    }

    if (hasChanges) {
      saveStore(agents);
    }
    return agents;
  } catch (error) {
    console.error("Failed to scan agents from disk:", error);
    return agents;
  }
}

// ==================== Agent Env 文件管理 ====================

/**
 * 获取 agent 的 .env 文件路径
 */
export function getAgentEnvPath(agentName: string): string {
  return path.join(AGENTS_DIR, `${NANOBOT_DIR_PREFIX}${agentName}`, ".env");
}

/**
 * 确保 agent 的 .env 文件存在
 * 如果不存在则创建一个空文件
 */
export function ensureAgentEnvFile(agentName: string): void {
  const envPath = getAgentEnvPath(agentName);
  const dir = path.dirname(envPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, "", "utf-8");
  }
}

/**
 * 获取 agent 的 .env 文件内容
 * 如果文件不存在，返回空字符串
 */
export function getAgentEnvContent(agentName: string): string {
  const envPath = getAgentEnvPath(agentName);
  if (!fs.existsSync(envPath)) {
    return "";
  }
  try {
    return fs.readFileSync(envPath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * 写入 agent 的 .env 文件内容
 */
export function setAgentEnvContent(agentName: string, content: string): boolean {
  const envPath = getAgentEnvPath(agentName);
  try {
    // 确保目录存在
    const dir = path.dirname(envPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(envPath, content, "utf-8");
    return true;
  } catch (error) {
    console.error(`[Env] Failed to write .env file for agent ${agentName}:`, error);
    return false;
  }
}

/**
 * 删除 agent 的 .env 文件
 */
export function deleteAgentEnvFile(agentName: string): boolean {
  const envPath = getAgentEnvPath(agentName);
  if (!fs.existsSync(envPath)) {
    return true;
  }
  try {
    fs.unlinkSync(envPath);
    return true;
  } catch (error) {
    console.error(`[Env] Failed to delete .env file for agent ${agentName}:`, error);
    return false;
  }
}

/**
 * 解析 .env 文件内容，返回环境变量键值对
 * 支持注释（#开头）、空行、KEY=VALUE 格式
 */
export function parseEnvContent(content: string): Record<string, string> {
  const envVars: Record<string, string> = {};
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmedLine = line.trim();
    // 跳过空行和注释
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const equalIndex = trimmedLine.indexOf("=");
    if (equalIndex === -1) {
      continue;
    }

    const key = trimmedLine.substring(0, equalIndex).trim();
    let value = trimmedLine.substring(equalIndex + 1).trim();

    // 移除引号（如果值被引号包围）
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key) {
      envVars[key] = value;
    }
  }

  return envVars;
}

// ==================== 共享配置管理 ====================

/**
 * 确保共享配置目录存在
 */
export function ensureSharedConfig(): void {
  if (!fs.existsSync(SHARED_CONFIG_DIR)) {
    fs.mkdirSync(SHARED_CONFIG_DIR, { recursive: true });
  }
  if (!fs.existsSync(SHARED_SKILLS_DIR)) {
    fs.mkdirSync(SHARED_SKILLS_DIR, { recursive: true });
  }
  // 确保默认配置文件存在
  if (!fs.existsSync(SHARED_SKILLS_CONFIG)) {
    fs.writeFileSync(SHARED_SKILLS_CONFIG, JSON.stringify({ enabled: [] }, null, 2), "utf-8");
  }
  if (!fs.existsSync(SHARED_MCP_CONFIG)) {
    fs.writeFileSync(SHARED_MCP_CONFIG, JSON.stringify({ mcpServers: {} }, null, 2), "utf-8");
  }
}

/**
 * 为成员 agent 设置符号链接到共享配置
 */
export function setupMemberSymlinks(agent: AgentInstance): void {
  ensureSharedConfig();

  const workspaceSkillsDir = path.join(agent.workspacePath, "skills");

  // 确保 skills 目录存在
  if (!fs.existsSync(workspaceSkillsDir)) {
    fs.mkdirSync(workspaceSkillsDir, { recursive: true });
  }

  // 1. 复制 MCP 配置到 agent 的 config.json
  applyMcpConfigToAgent(agent);

  // 2. 为每个启用的 skill 创建符号链接
  applySkillsConfigToAgent(agent);
}

/**
 * 将共享配置应用到指定 agent
 */
export function applySharedConfigToAgent(agent: AgentInstance): void {
  ensureSharedConfig();

  const workspaceSkillsDir = path.join(agent.workspacePath, "skills");

  // 确保 skills 目录存在
  if (!fs.existsSync(workspaceSkillsDir)) {
    fs.mkdirSync(workspaceSkillsDir, { recursive: true });
  }

  // 1. 复制 MCP 配置到 agent 的 config.json
  applyMcpConfigToAgent(agent);

  // 2. 为每个启用的 skill 创建符号链接
  applySkillsConfigToAgent(agent);
}

/**
 * 将共享 MCP 配置应用到 agent 的 config.json
 */
function applyMcpConfigToAgent(agent: AgentInstance): void {
  console.log(`[SharedConfig] applyMcpConfigToAgent called for agent: ${agent.name}`);
  console.log(`[SharedConfig] agent.configPath: ${agent.configPath}`);
  
  try {
    // agent.configPath 已经包含 config.json，不需要再拼接
    const configPath = agent.configPath;
    console.log(`[SharedConfig] Target config path: ${configPath}`);
    
    // 读取 agent 的 config.json
    let agentConfig: any = {};
    if (fs.existsSync(configPath)) {
      try {
        agentConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        console.log(`[SharedConfig] Read agent config.json successfully`);
      } catch {
        console.error(`[SharedConfig] Failed to parse config.json for agent ${agent.name}`);
      }
    } else {
      console.error(`[SharedConfig] config.json not found at: ${configPath}`);
    }

    // 读取共享 MCP 配置
    let sharedMcpConfig: any = { mcpServers: {} };
    console.log(`[SharedConfig] Checking shared mcp config at: ${SHARED_MCP_CONFIG}`);
    console.log(`[SharedConfig] Shared mcp config exists: ${fs.existsSync(SHARED_MCP_CONFIG)}`);
    
    if (fs.existsSync(SHARED_MCP_CONFIG)) {
      try {
        sharedMcpConfig = JSON.parse(fs.readFileSync(SHARED_MCP_CONFIG, "utf-8"));
        console.log(`[SharedConfig] Shared mcp config content:`, JSON.stringify(sharedMcpConfig));
      } catch {
        console.error(`[SharedConfig] Failed to parse shared mcp.json`);
      }
    }

    // 合并 MCP 配置：在 agent 的 tools.mcpServers 中追加共享的 servers
    if (!agentConfig.tools) {
      agentConfig.tools = {};
    }
    if (!agentConfig.tools.mcpServers) {
      agentConfig.tools.mcpServers = {};
    }
    
    // 追加共享的 mcpServers 到 agent 配置
    const sharedServers = sharedMcpConfig.mcpServers || {};
    console.log(`[SharedConfig] Shared servers to merge:`, Object.keys(sharedServers));
    
    for (const [serverName, serverConfig] of Object.entries(sharedServers)) {
      agentConfig.tools.mcpServers[serverName] = serverConfig;
    }

    // 写回 config.json
    fs.writeFileSync(configPath, JSON.stringify(agentConfig, null, 2), "utf-8");
    console.log(`[SharedConfig] Successfully wrote config.json with merged mcpServers`);
    console.log(`[SharedConfig] Final mcpServers in agent config:`, Object.keys(agentConfig.tools.mcpServers));
  } catch (error) {
    console.error(`[SharedConfig] Failed to apply MCP config to agent ${agent.name}:`, error);
  }
}

/**
 * 将共享 skills 配置应用到 agent
 */
function applySkillsConfigToAgent(agent: AgentInstance): void {
  try {
    const workspaceSkillsDir = path.join(agent.workspacePath, "skills");
    
    // 读取启用的 skills 列表
    let enabledSkills: string[] = [];
    if (fs.existsSync(SHARED_SKILLS_CONFIG)) {
      try {
        const config = JSON.parse(fs.readFileSync(SHARED_SKILLS_CONFIG, "utf-8"));
        enabledSkills = config.enabled || [];
      } catch {
        console.error(`[SharedConfig] Failed to parse skills.json`);
      }
    }

    // 获取所有共享 skills 目录
    if (!fs.existsSync(SHARED_SKILLS_DIR)) {
      return;
    }
    const sharedSkillDirs = fs.readdirSync(SHARED_SKILLS_DIR, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);

    // 为每个启用的 skill 创建符号链接
    for (const skillName of enabledSkills) {
      if (!sharedSkillDirs.includes(skillName)) {
        console.log(`[SharedConfig] Skill "${skillName}" not found in shared-config/skills`);
        continue;
      }

      const sharedSkillPath = path.join(SHARED_SKILLS_DIR, skillName);
      const agentSkillSymlink = path.join(workspaceSkillsDir, skillName);

      // 如果已存在符号链接或目录，先清理
      if (fs.existsSync(agentSkillSymlink)) {
        const stats = fs.lstatSync(agentSkillSymlink);
        if (stats.isSymbolicLink() || stats.isDirectory()) {
          fs.rmSync(agentSkillSymlink, { recursive: true, force: true });
        }
      }

      // 创建符号链接
      try {
        fs.symlinkSync(sharedSkillPath, agentSkillSymlink, "junction");
        console.log(`[SharedConfig] Created skill symlink for agent ${agent.name}: ${agentSkillSymlink} -> ${sharedSkillPath}`);
      } catch (error) {
        console.error(`[SharedConfig] Failed to create skill symlink for agent ${agent.name} (${skillName}):`, error);
      }
    }
  } catch (error) {
    console.error(`[SharedConfig] Failed to apply skills config to agent ${agent.name}:`, error);
  }
}

/**
 * 清理成员 agent 的符号链接
 * 读取 skills.json 的 enabled 列表，逐一删除各 skill 的 symlink
 */
export function cleanupMemberSymlinks(agent: AgentInstance): void {
  const workspaceSkillsDir = path.join(agent.workspacePath, "skills");

  // 读取启用的 skills 列表
  let enabledSkills: string[] = [];
  if (fs.existsSync(SHARED_SKILLS_CONFIG)) {
    try {
      const config = JSON.parse(fs.readFileSync(SHARED_SKILLS_CONFIG, "utf-8"));
      enabledSkills = config.enabled || [];
    } catch {
      console.error(`[SharedConfig] Failed to parse skills.json when cleaning up symlinks`);
      return;
    }
  }

  // 逐一删除各 skill 的符号链接
  for (const skillName of enabledSkills) {
    const skillSymlink = path.join(workspaceSkillsDir, skillName);
    if (fs.existsSync(skillSymlink)) {
      try {
        const stats = fs.lstatSync(skillSymlink);
        if (stats.isSymbolicLink() || stats.isDirectory()) {
          fs.rmSync(skillSymlink, { recursive: true, force: true });
          console.log(`[SharedConfig] Removed skill symlink for agent ${agent.name}: ${skillSymlink}`);
        }
      } catch (error) {
        console.error(`[SharedConfig] Failed to remove skill symlink for agent ${agent.name} (${skillName}):`, error);
      }
    }
  }
}

/**
 * 设置 Manager Skill 到 agent 的 workspace
 * 用于创建 Manager 角色 agent 时自动安装
 */
export function setupManagerSkill(agent: AgentInstance): void {
  const managerSkillDir = path.join(agent.workspacePath, "skills", MANAGER_SKILL_NAME);

  // 如果已存在，跳过
  if (fs.existsSync(managerSkillDir)) {
    return;
  }

  // 确保目标目录存在
  fs.mkdirSync(managerSkillDir, { recursive: true });

  // 写入 SKILL.md
  try {
    fs.writeFileSync(path.join(managerSkillDir, "SKILL.md"), MANAGER_SKILL_CONTENT, "utf-8");
    console.log(`[ManagerSkill] Installed nanocats-manager-skill to agent ${agent.name}`);
  } catch (error) {
    console.error(`[ManagerSkill] Failed to write skill to agent ${agent.name}:`, error);
  }
}



// ==================== 备份功能 ====================

/**
 * 确保备份目录存在
 */
export function ensureBackupDir(): void {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

/**
 * 获取备份目录中的 agent 列表
 * 扫描 ~/.nanocats-manager/backups/ 目录下的 .nanobot-* 目录
 */
export function getBackupAgents(): { name: string; backupPath: string; backedUpAt: string }[] {
  ensureBackupDir();
  
  try {
    const entries = fs.readdirSync(BACKUP_DIR, { withFileTypes: true });
    const backups: { name: string; backupPath: string; backedUpAt: string }[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith(NANOBOT_DIR_PREFIX)) {
        continue;
      }

      const name = entry.name.slice(NANOBOT_DIR_PREFIX.length);
      const backupPath = path.join(BACKUP_DIR, entry.name);
      
      // 获取目录修改时间作为备份时间
      const stat = fs.statSync(backupPath);
      
      backups.push({
        name,
        backupPath,
        backedUpAt: stat.mtime.toISOString(),
      });
    }

    return backups;
  } catch {
    return [];
  }
}

/**
 * 假删除 agent（备份整个目录）
 * 1. 停止运行中的进程
 * 2. 将整个 agent 目录移动到备份目录
 * 3. 从主存储中移除
 * 返回备份信息
 */
export function softDeleteAgent(name: string): { name: string; backupPath: string } | undefined {
  const agents = ensureStore();
  const index = agents.findIndex((agent) => agent.name === name);

  if (index === -1) {
    return undefined;
  }

  const agent = agents[index];
  const agentDir = path.dirname(agent.configPath);
  
  // 检查 agent 目录是否存在
  if (!fs.existsSync(agentDir)) {
    console.error(`[Backup] Agent directory does not exist: ${agentDir}`);
    return undefined;
  }

  ensureBackupDir();
  
  const backupDirName = `${NANOBOT_DIR_PREFIX}${name}`;
  const backupPath = path.join(BACKUP_DIR, backupDirName);

  // 如果备份目录已存在，先删除旧备份
  if (fs.existsSync(backupPath)) {
    try {
      fs.rmSync(backupPath, { recursive: true, force: true });
      console.log(`[Backup] Removed old backup: ${backupPath}`);
    } catch (error) {
      console.error(`[Backup] Failed to remove old backup: ${backupPath}`, error);
      return undefined;
    }
  }

  // 移动整个 agent 目录到备份
  try {
    fs.renameSync(agentDir, backupPath);
    console.log(`[Backup] Moved agent directory to backup: ${agentDir} -> ${backupPath}`);
  } catch (error) {
    console.error(`[Backup] Failed to move agent directory: ${agentDir} -> ${backupPath}`, error);
    return undefined;
  }

  // 从主存储中移除
  agents.splice(index, 1);
  saveStore(agents);

  console.log(`[Backup] Agent "${name}" has been backed up to: ${backupPath}`);
  return { name, backupPath };
}
