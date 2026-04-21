"use client";

import { useState } from "react";
import Link from "next/link";
import { createAvatar } from '@dicebear/core';
import { identicon } from '@dicebear/collection';
import { AgentInstance } from "@/lib/types";

interface AgentCardProps {
  agent: AgentInstance;
  onStatusChange?: () => void;
}

export function AgentCard({ agent, onStatusChange }: AgentCardProps) {
  const [loading, setLoading] = useState(false);
  const [confirmingStop, setConfirmingStop] = useState(false);

  // Generate DiceBear avatar SVG
  const avatarSvg = (() => {
    const avatar = createAvatar(identicon, {
      seed: agent.name,
      size: 40,
    });
    return avatar.toString();
  })();

  const handleStart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setLoading(true);
    try {
      // 使用 agent.name 作为 API 路径参数
      const res = await fetch(`/api/agents/${agent.name}/start`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error("Failed to start agent");
      }
      onStatusChange?.();
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStopClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmingStop(true);
  };

  const handleConfirmStop = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    try {
      // 使用 agent.name 作为 API 路径参数
      const res = await fetch(`/api/agents/${agent.name}/stop`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error("Failed to stop agent");
      }
      onStatusChange?.();
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
      setConfirmingStop(false);
    }
  };

  const handleCancelStop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmingStop(false);
  };

  const truncatePath = (path: string, maxLength: number = 35) => {
    if (path.length <= maxLength) return path;
    return "..." + path.slice(-maxLength + 3);
  };

  const isRunning = agent.status === "running";
  const isError = agent.status === "error";

  return (
    // 使用 agent.name 作为页面路由参数
    <Link href={`/agents/${agent.name}`} className="block">
      <div className="glass-card rounded-lg overflow-hidden relative">
        {/* 顶部状态条 */}
        <div 
          className={`card-status-bar ${isRunning ? 'running' : isError ? 'error' : 'stopped'}`} 
        />
        
        <div className="p-5">
          {/* Header: name and status */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg overflow-hidden bg-zinc-700 flex items-center justify-center border-2 ${
                isRunning 
                  ? "border-green-500" 
                  : isError
                  ? "border-red-500"
                  : "border-zinc-500"
              }`}>
                <div className="w-8 h-8" dangerouslySetInnerHTML={{ __html: avatarSvg }} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-heading font-semibold text-white text-lg leading-tight uppercase">
                    {agent.name}
                  </h3>
                  {agent.role && (
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      agent.role === "manager"
                        ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                        : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                    }`}>
                      {agent.role === "manager" ? "Manager" : "Member"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`w-2 h-2 rounded-full ${
                    isRunning 
                      ? "bg-green-400 animate-status-pulse" 
                      : isError
                      ? "bg-red-400"
                      : "bg-zinc-400"
                  }`} />
                  <span className={`text-xs font-medium ${
                    isRunning 
                      ? "text-green-400" 
                      : isError
                      ? "text-red-400"
                      : "text-zinc-400"
                  }`}>
                    {isRunning ? "Running" : isError ? "Error" : "Stopped"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Info section */}
          <div className="space-y-3 mb-5">
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
                <GlobeIcon className="w-4 h-4 text-zinc-400" />
              </div>
              <div>
                <p className="text-zinc-500 text-xs uppercase tracking-wider">Port</p>
                <p className="text-zinc-200 font-mono">{agent.port}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
                <FolderIcon className="w-4 h-4 text-zinc-400" />
              </div>
              <div className="min-w-0">
                <p className="text-zinc-500 text-xs uppercase tracking-wider">Workspace</p>
                <p className="text-zinc-400 truncate font-mono text-xs" title={agent.workspacePath}>
                  {truncatePath(agent.workspacePath)}
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end">
            {isRunning ? (
              confirmingStop ? (
                <div className="flex items-center gap-2 animate-fade-in-up">
                  <span className="text-xs text-zinc-400">Confirm stop?</span>
                  <button
                    onClick={handleConfirmStop}
                    disabled={loading}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium btn-destructive disabled:opacity-50"
                  >
                    {loading ? (
                      <LoaderIcon className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      "Confirm"
                    )}
                  </button>
                  <button
                    onClick={handleCancelStop}
                    disabled={loading}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium glass-button text-zinc-300"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleStopClick}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium btn-destructive"
                >
                  <StopIcon className="w-4 h-4" />
                  Stop
                </button>
              )
            ) : (
              <button
                onClick={handleStart}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium btn-success disabled:opacity-50"
              >
                {loading ? (
                  <LoaderIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <PlayIcon className="w-4 h-4" />
                )}
                Start
              </button>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function LoaderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
