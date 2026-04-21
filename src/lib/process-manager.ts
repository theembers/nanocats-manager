import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import type { AgentInstance, AgentLog } from "./types";
import { findNanobotBinary } from "./nanobot";
import { getAgents, getAgent, updateAgentStatus, getAgentEnvContent, parseEnvContent, ensureAgentEnvFile } from "./store";
import { CLI_LOG_DIR, getAgentEnvPath } from "./config";

const MAX_LOG_LINES = 1000;

const CLI_LOG_FILE = path.join(CLI_LOG_DIR, "cli-commands.log");

// 确保日志目录存在
function ensureLogDir(): void {
  if (!fs.existsSync(CLI_LOG_DIR)) {
    fs.mkdirSync(CLI_LOG_DIR, { recursive: true });
  }
}

// 写入日志到文件
function writeToLogFile(message: string): void {
  try {
    ensureLogDir();
    fs.appendFileSync(CLI_LOG_FILE, message + "\n", "utf-8");
  } catch (error) {
    console.error("Failed to write log to file:", error);
  }
}

// CLI 操作日志缓冲区
interface CliLogEntry {
  timestamp: string;
  agentName: string;
  command: string;
  action: "start" | "stop" | "restart";
}

const MAX_CLI_LOG_ENTRIES = 100;
const globalForCliLogs = globalThis as unknown as {
  cliLogs: CliLogEntry[];
};

/**
 * 将 CLI 日志写入文件
 */
function writeCliLogToFile(logEntry: CliLogEntry): void {
  try {
    ensureLogDir();
    const logLine = `[${logEntry.timestamp}] [${logEntry.action.toUpperCase()}] [${logEntry.agentName}] ${logEntry.command}\n`;
    fs.appendFileSync(CLI_LOG_FILE, logLine, "utf-8");
  } catch (error) {
    console.error("Failed to write CLI log to file:", error);
  }
}

/**
 * 打印 CLI 指令日志（用于排查问题）
 */
function logCliCommand(agentName: string, command: string, args: string[], action: "start" | "stop" | "restart"): void {
  const fullCommand = `${command} ${args.join(" ")}`;
  const logEntry: CliLogEntry = {
    timestamp: new Date().toISOString(),
    agentName,
    command: fullCommand,
    action,
  };

  // 添加到全局日志缓冲区
  globalForCliLogs.cliLogs = globalForCliLogs.cliLogs || [];
  globalForCliLogs.cliLogs.push(logEntry);

  // 保持日志缓冲区不超过最大行数
  if (globalForCliLogs.cliLogs.length > MAX_CLI_LOG_ENTRIES) {
    globalForCliLogs.cliLogs.shift();
  }

  // 写入日志文件
  writeCliLogToFile(logEntry);

  // 输出到控制台
  console.log(`[CLI ${action.toUpperCase()}] [${agentName}] ${fullCommand}`);
}

/**
 * 获取 CLI 操作日志
 */
export function getCliLogs(): CliLogEntry[] {
  return globalForCliLogs.cliLogs || [];
}

/**
 * 清除 CLI 操作日志
 */
export function clearCliLogs(): void {
  globalForCliLogs.cliLogs = [];
}

interface ManagedProcess {
  process: ChildProcess;
  logs: AgentLog[];
  subscribers: Set<(log: AgentLog) => void>;
}

// 使用 globalThis 缓存单例实例，避免 Next.js 热重载导致单例重建
const globalForProcessManager = globalThis as unknown as {
  processManager: ProcessManager | undefined;
};

// 持久化日志存储：即使进程退出也能查看历史日志
const globalForHistoricalLogs = globalThis as unknown as {
  historicalLogs: Map<string, AgentLog[]>;
};

class ProcessManager {
  private processes: Map<string, ManagedProcess> = new Map();

  /**
   * 加载 agent 的 .env 文件并合并到环境变量
   * 同时确保 .env 文件存在于 nanobot 工作目录（通过 shell source 命令加载）
   */
  private loadAgentEnvVariables(agentName: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };

    const envPath = getAgentEnvPath(agentName);
    console.log(`[Env] ====== Agent ${agentName} .env 注入开始 ======`);
    console.log(`[Env] .env 文件路径: ${envPath}`);
    console.log(`[Env] .env 文件存在: ${fs.existsSync(envPath)}`);

    // 确保 .env 文件存在于 nanobot 工作目录
    // nanobot 使用 shell 的 "source .env" 命令加载，所以文件必须在 cwd 下
    ensureAgentEnvFile(agentName);
    console.log(`[Env] 已确认 .env 文件存在于 workspace`);

    // 获取 agent 的 .env 文件内容
    const envContent = getAgentEnvContent(agentName);

    if (!envContent || !envContent.trim()) {
      console.log(`[Env] ⚠️  .env 文件为空或不存在，跳过注入`);
      console.log(`[Env] ====== Agent ${agentName} .env 注入结束 ======\n`);
      return env;
    }

    console.log(`[Env] .env 内容预览 (前200字符): ${envContent.substring(0, 200)}...`);

    // 解析并合并到环境变量（作为备用，防止 nanobot 内部不加载）
    try {
      const parsed = parseEnvContent(envContent);
      const keyCount = Object.keys(parsed).length;
      console.log(`[Env] 解析到 ${keyCount} 个环境变量: ${Object.keys(parsed).join(", ")}`);

      for (const [key, value] of Object.entries(parsed)) {
        env[key] = value;
      }

      console.log(`[Env] ✅ .env 变量已成功注入到进程环境`);
      console.log(`[Env] ====== Agent ${agentName} .env 注入结束 ======\n`);
      return env;
    } catch (error) {
      console.error(`[Env] ❌ 解析 .env 失败:`, error);
      console.log(`[Env] ====== Agent ${agentName} .env 注入结束 ======\n`);
      return env;
    }
  }

  /**
   * 获取历史日志（进程退出后仍可访问）
   */
  private getHistoricalLogs(agentId: string): AgentLog[] {
    if (!globalForHistoricalLogs.historicalLogs) {
      globalForHistoricalLogs.historicalLogs = new Map();
    }
    return globalForHistoricalLogs.historicalLogs.get(agentId) || [];
  }

  /**
   * 保存日志到历史记录
   */
  private saveToHistoricalLogs(agentId: string, logs: AgentLog[]): void {
    if (!globalForHistoricalLogs.historicalLogs) {
      globalForHistoricalLogs.historicalLogs = new Map();
    }
    globalForHistoricalLogs.historicalLogs.set(agentId, logs);
  }

  /**
   * 添加历史日志条目
   */
  private appendHistoricalLog(agentId: string, log: AgentLog): void {
    const logs = this.getHistoricalLogs(agentId);
    logs.push(log);
    // 保持历史日志不超过最大行数
    if (logs.length > MAX_LOG_LINES) {
      logs.shift();
    }
    this.saveToHistoricalLogs(agentId, logs);
  }

  /**
   * 启动 gateway 进程
   * 使用 agent.name 作为进程管理的 key
   * 支持加载 .env 环境变量文件
   */
  async startGateway(agent: AgentInstance): Promise<number> {
    // 如果进程已存在，先停止
    if (this.processes.has(agent.name)) {
      await this.stopGateway(agent.name);
    }

    const nanobotPath = await findNanobotBinary();

    // 构造 CLI 指令并打印日志
    const cliArgs = ["gateway", "--config", agent.configPath, "--port", String(agent.port)];
    logCliCommand(agent.name, nanobotPath, cliArgs, "start");

    // 记录启动命令到历史日志
    const startLog: AgentLog = {
      timestamp: new Date().toISOString(),
      stream: "stdout",
      content: `[START] ${nanobotPath} ${cliArgs.join(" ")}`,
    };
    this.appendHistoricalLog(agent.name, startLog);

    // 加载 .env 文件并合并到环境变量
    const envVars = this.loadAgentEnvVariables(agent.name);

    // 验证环境变量是否被设置到 env 对象中
    const customKeys = Object.keys(envVars).filter(k => !Object.keys(process.env).includes(k));
    if (customKeys.length > 0) {
      console.log(`[Start] ✅ 检测到 ${customKeys.length} 个自定义环境变量将注入到 agent: ${customKeys.join(", ")}`);
    } else {
      console.log(`[Start] ⚠️  没有检测到自定义环境变量（.env 为空或解析失败）`);
    }

    // nanobot 会在 cwd 下 source .env 文件，所以 cwd 必须指向 Agent 根目录（.env 所在目录）
    // agent.workspacePath = ~/agents/.nanobot-{name}/workspace
    // agent.configPath = ~/agents/.nanobot-{name}/config.json
    const agentDir = path.dirname(agent.configPath);
    console.log(`[Start] 工作目录 (cwd): ${agentDir}`);

    const childProcess = spawn(
      nanobotPath,
      cliArgs,
      {
        detached: false,
        stdio: ["ignore", "pipe", "pipe"],
        cwd: agentDir,
        env: envVars,
      }
    );

    console.log(`[Start] ✅ Agent ${agent.name} 进程已启动，PID: ${childProcess.pid}`);

    const pid = childProcess.pid;
    if (!pid) {
      // 启动失败，记录错误日志
      const errorLog: AgentLog = {
        timestamp: new Date().toISOString(),
        stream: "stderr",
        content: "[ERROR] Failed to start gateway process: no PID returned",
      };
      this.appendHistoricalLog(agent.name, errorLog);
      throw new Error("Failed to start gateway process: no PID returned");
    }

    const managedProcess: ManagedProcess = {
      process: childProcess,
      logs: [],
      subscribers: new Set(),
    };

    // 使用 agent.name 作为进程管理的 key
    this.processes.set(agent.name, managedProcess);

    // 监听 stderr
    childProcess.stderr?.on("data", (data: Buffer) => {
      const content = data.toString();
      if (content.trim()) {
        this.appendLog(agent.name, "stderr", content);
      }
    });

    // 监听进程标准输出
    childProcess.stdout?.on("data", (data: Buffer) => {
      const content = data.toString();
      if (content.trim()) {
        this.appendLog(agent.name, "stdout", content);
      }
    });

    // 监听进程关闭
    childProcess.on("close", (code) => {
      const exitLog: AgentLog = {
        timestamp: new Date().toISOString(),
        stream: "stderr",
        content: `[EXIT] Process exited with code ${code}`,
      };
      this.appendLog(agent.name, "stderr", `Process exited with code ${code}`);
      // 保存日志到历史记录
      const logs = this.getLogBuffer(agent.name);
      this.saveToHistoricalLogs(agent.name, logs);
      this.processes.delete(agent.name);
      // 更新存储中的状态
      updateAgentStatus(agent.name, code === 0 ? "stopped" : "error");
    });

    // 监听进程错误
    childProcess.on("error", (err) => {
      const errorLog: AgentLog = {
        timestamp: new Date().toISOString(),
        stream: "stderr",
        content: `[ERROR] Process error: ${err.message}`,
      };
      this.appendLog(agent.name, "stderr", `Process error: ${err.message}`);
      this.appendHistoricalLog(agent.name, errorLog);
      // 保存日志到历史记录
      const logs = this.getLogBuffer(agent.name);
      this.saveToHistoricalLogs(agent.name, logs);
      this.processes.delete(agent.name);
      updateAgentStatus(agent.name, "error");
    });

    // 更新存储中的状态
    updateAgentStatus(agent.name, "running", pid);

    return pid;
  }

  /**
   * 停止 gateway 进程
   * 先尝试 SIGTERM，3秒后若仍存活则 SIGKILL
   */
  async stopGateway(agentName: string): Promise<void> {
    const managed = this.processes.get(agentName);
    if (!managed) {
      // 进程不在管理中，直接更新状态
      updateAgentStatus(agentName, "stopped");
      return;
    }

    const { process: childProcess } = managed;

    // 打印 SIGTERM 指令日志
    const pid = childProcess.pid;
    if (pid) {
      logCliCommand(agentName, "kill", ["-TERM", String(pid)], "stop");
    }

    return new Promise<void>((resolve) => {
      let killed = false;

      const onClose = () => {
        killed = true;
        this.processes.delete(agentName);
        updateAgentStatus(agentName, "stopped");
        resolve();
      };

      childProcess.once("close", onClose);

      // 先发送 SIGTERM
      childProcess.kill("SIGTERM");

      // 3秒后检查是否还存活
      setTimeout(() => {
        if (!killed && this.isProcessAlive(childProcess.pid)) {
          // 打印 SIGKILL 指令日志
          const killPid = childProcess.pid;
          if (killPid) {
            logCliCommand(agentName, "kill", ["-KILL", String(killPid)], "stop");
          }
          childProcess.kill("SIGKILL");
        }
      }, 3000);

      // 设置最大等待时间（5秒）
      setTimeout(() => {
        if (!killed) {
          childProcess.removeListener("close", onClose);
          this.processes.delete(agentName);
          updateAgentStatus(agentName, "stopped");
          resolve();
        }
      }, 5000);
    });
  }

  /**
   * 检查进程是否存活
   * 优先检查内存中的进程，如果没有则检查存储中记录的 PID
   */
  isRunning(agentName: string): boolean {
    // 1. 先检查内存中管理的进程
    const managed = this.processes.get(agentName);
    if (managed) {
      return this.isProcessAlive(managed.process.pid);
    }

    // 2. 内存中没有，检查存储中记录的 PID
    const agent = getAgent(agentName);
    if (agent && agent.pid) {
      return this.isProcessAlive(agent.pid);
    }

    return false;
  }

  /**
   * 检查 PID 对应的进程是否存活
   */
  private isProcessAlive(pid: number | undefined): boolean {
    if (!pid) {
      return false;
    }

    try {
      // kill(pid, 0) 不会杀死进程，只是检查进程是否存在
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取进程的内存占用（RSS，单位 KB）
   * 使用 ps -p <pid> -o rss= 获取
   */
  async getMemory(agentName: string): Promise<number | null> {
    const agent = getAgent(agentName);
    if (!agent?.pid) {
      return null;
    }

    return new Promise((resolve) => {
      const { spawn } = require("child_process");
      const ps = spawn("ps", ["-p", String(agent.pid), "-o", "rss="]);

      let output = "";
      ps.stdout.on("data", (data: Buffer) => {
        output += data.toString();
      });

      ps.on("close", () => {
        const rss = parseInt(output.trim(), 10);
        resolve(isNaN(rss) ? null : rss);
      });

      ps.on("error", () => {
        resolve(null);
      });
    });
  }

  /**
   * 获取进程的日志缓冲区
   * 优先从当前运行的进程获取，进程不存在时从历史日志获取
   */
  getLogBuffer(agentId: string): AgentLog[] {
    const managed = this.processes.get(agentId);
    if (managed) {
      return [...managed.logs];
    }
    // 进程不存在，从历史日志获取
    return this.getHistoricalLogs(agentId);
  }

  /**
   * 订阅进程日志
   * 返回取消订阅的函数
   */
  subscribeToLogs(
    agentId: string,
    callback: (log: AgentLog) => void
  ): () => void {
    const managed = this.processes.get(agentId);
    if (!managed) {
      // 进程不存在，订阅者将不会收到任何日志
      // 日志可以从历史日志中获取（通过 getLogBuffer）
      return () => {};
    }

    managed.subscribers.add(callback);

    return () => {
      managed.subscribers.delete(callback);
    };
  }

  /**
   * 添加日志条目
   */
  private appendLog(
    agentId: string,
    stream: "stdout" | "stderr",
    content: string
  ): void {
    const managed = this.processes.get(agentId);
    if (!managed) {
      return;
    }

    // 清理内容（移除尾部换行符，统一格式）
    const cleanContent = content.replace(/\n+$/, "");
    if (!cleanContent) {
      return;
    }

    const log: AgentLog = {
      timestamp: new Date().toISOString(),
      stream,
      content: cleanContent,
    };

    managed.logs.push(log);

    // 保持日志缓冲区不超过最大行数
    if (managed.logs.length > MAX_LOG_LINES) {
      managed.logs.shift();
    }

    // 通知所有订阅者
    for (const subscriber of managed.subscribers) {
      try {
        subscriber(log);
      } catch {
        // 忽略订阅者回调中的错误
      }
    }
  }

  /**
   * 同步所有 agent 状态
   * 检查存储中标记为 running 的 agent，验证 PID 是否还存活
   */
  syncAllStatuses(): void {
    const agents = getAgents();

    for (const agent of agents) {
      if (agent.status === "running" && agent.pid) {
        const isAlive = this.isProcessAlive(agent.pid);
        if (!isAlive) {
          // 进程不存活，更新状态为 stopped
          updateAgentStatus(agent.name, "stopped");
        }
      }
    }
  }
}

// 导出单例实例
export const processManager =
  globalForProcessManager.processManager ?? new ProcessManager();

// 在开发环境下保存到 globalThis
if (process.env.NODE_ENV !== "production") {
  globalForProcessManager.processManager = processManager;
}

// 导出类型供外部使用
export type { ManagedProcess };
