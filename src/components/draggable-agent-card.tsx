"use client";

import { useState } from "react";
import { AgentInstance } from "@/lib/types";

interface DraggableAgentCardProps {
  agent: AgentInstance;
  onStatusChange?: () => void;
}

export function DraggableAgentCard({ agent, onStatusChange }: DraggableAgentCardProps) {
  const [loading, setLoading] = useState(false);

  const handleStart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setLoading(true);
    try {
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

  const handleConfirmStop = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    try {
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
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/json", JSON.stringify(agent));
    e.dataTransfer.setData("agentName", agent.name);
    e.dataTransfer.effectAllowed = "copy";
  };

  const isRunning = agent.status === "running";
  const isError = agent.status === "error";

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="glass-card rounded-lg overflow-hidden cursor-grab active:cursor-grabbing hover:border-orange-500/30 transition-all duration-200 group"
    >
      {/* 顶部状态条 */}
      <div
        className={`h-1 ${
          isRunning ? 'bg-green-500' : isError ? 'bg-red-500' : 'bg-zinc-600'
        }`}
      />

      <div className="p-3">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Drag Handle */}
            <div className="flex-shrink-0 p-1 text-zinc-600 group-hover:text-zinc-400 transition-colors">
              <DragHandleIcon className="w-4 h-4" />
            </div>
            <div className={`w-7 h-7 rounded-md flex items-center justify-center ${
              isRunning
                ? "bg-green-500/10 text-green-400"
                : isError
                ? "bg-red-500/10 text-red-400"
                : "bg-zinc-500/10 text-zinc-400"
            }`}>
              <BotIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="font-heading font-semibold text-white text-sm truncate uppercase">
                  {agent.name}
                </h3>
                {agent.role && (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${
                    agent.role === "manager"
                      ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                      : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                  }`}>
                    {agent.role === "manager" ? "M" : "S"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  isRunning
                    ? "bg-green-400 animate-status-pulse"
                    : isError
                    ? "bg-red-400"
                    : "bg-zinc-400"
                }`} />
                <span className={`text-[10px] font-medium ${
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

        {/* Info */}
        <div className="flex items-center gap-2 text-xs text-zinc-400 mb-2 ml-9">
          <span className="font-mono">:{agent.port}</span>
        </div>

        {/* Actions */}
        <div className="flex justify-end ml-9">
          {isRunning ? (
            <button
              onClick={handleConfirmStop}
              disabled={loading}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium btn-destructive disabled:opacity-50"
            >
              {loading ? (
                <LoaderIcon className="w-3 h-3 animate-spin" />
              ) : (
                <StopIcon className="w-3 h-3" />
              )}
              Stop
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={loading}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium btn-success disabled:opacity-50"
            >
              {loading ? (
                <LoaderIcon className="w-3 h-3 animate-spin" />
              ) : (
                <PlayIcon className="w-3 h-3" />
              )}
              Start
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Icon components
function BotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}

function DragHandleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="6" r="1" fill="currentColor" />
      <circle cx="15" cy="6" r="1" fill="currentColor" />
      <circle cx="9" cy="12" r="1" fill="currentColor" />
      <circle cx="15" cy="12" r="1" fill="currentColor" />
      <circle cx="9" cy="18" r="1" fill="currentColor" />
      <circle cx="15" cy="18" r="1" fill="currentColor" />
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