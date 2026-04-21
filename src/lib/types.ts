// ==================== Agent Types ====================

export interface AgentInstance {
  name: string;
  configPath: string;
  workspacePath: string;
  port: number;
  webchatPort?: number;
  status: "running" | "stopped" | "error";
  pid?: number;
  createdAt: string;
  deleted?: boolean; // 假删除标记
  deletedAt?: string; // 删除时间
}

// ==================== Shared Config Types ====================

export interface SharedConfig {
  skills: SharedSkill[];
  mcp: McpConfig | null;
}

export interface SharedSkill {
  name: string;
  path: string;
  description?: string;
  enabled: boolean;
}

export interface McpConfig {
  servers: Record<string, any>;
}

export interface CreateAgentInput {
  name: string;
  basePath?: string;
  port?: number;
  provider?: string;
  apiKey?: string;
  model?: string;
}

export interface AgentLog {
  timestamp: string;
  stream: "stdout" | "stderr";
  content: string;
}


