"use client";

import { useState, useEffect } from "react";
import { createAvatar } from '@dicebear/core';
import { identicon } from '@dicebear/collection';
import { AgentInstance } from "@/lib/types";

interface DraggableAgentCardProps {
  agent: AgentInstance;
  onStatusChange?: () => void;
}

export function DraggableAgentCard({ agent, onStatusChange }: DraggableAgentCardProps) {
  const [loading, setLoading] = useState(false);
  const [skillsCount, setSkillsCount] = useState<number>(0);
  const [memoryKB, setMemoryKB] = useState<number | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [skillsRes, statsRes] = await Promise.all([
          fetch(`/api/agents/${agent.name}/skills`),
          fetch(`/api/agents/${agent.name}/stats`),
        ]);
        if (skillsRes.ok) {
          const data = await skillsRes.json();
          setSkillsCount(data.skills?.length || 0);
        }
        if (statsRes.ok) {
          const data = await statsRes.json();
          setMemoryKB(data.memory);
        }
      } catch {}
    };
    fetchData();
  }, [agent.name]);

  const formatMemory = (kb: number | null) => {
    if (kb === null) return "—";
    const mb = kb / 1024;
    return mb < 100 ? `${mb.toFixed(1)}MB` : `${Math.round(mb)}MB`;
  };

  // Generate DiceBear avatar SVG
  const avatarSvg = (() => {
    const avatar = createAvatar(identicon, {
      seed: agent.name,
      size: 32,
    });
    return avatar.toString();
  })();

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
      className="glass-card rounded-lg overflow-hidden cursor-grab active:cursor-grabbing hover:border-orange-500/30 transition-all duration-200 group p-3"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-700">
            <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: avatarSvg }} />
          </div>
          <h3 className="font-heading font-semibold text-white text-sm truncate uppercase flex items-center gap-1.5">
            {agent.name}
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              isRunning
                ? "bg-green-500"
                : isError
                ? "bg-red-500"
                : "bg-zinc-500"
            }`} />
          </h3>
        </div>

        {isRunning ? (
          <button
            onClick={handleConfirmStop}
            disabled={loading}
            className="w-7 h-7 flex items-center justify-center rounded-md btn-destructive disabled:opacity-50"
          >
            {loading ? (
              <LoaderIcon className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <StopIcon className="w-3.5 h-3.5" />
            )}
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={loading}
            className="w-7 h-7 flex items-center justify-center rounded-md btn-success disabled:opacity-50"
          >
            {loading ? (
              <LoaderIcon className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <PlayIcon className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>

      <div className="mt-2 text-[10px] font-mono">
        <div className="text-zinc-400 mb-1">
          PORT {agent.port} · PID {agent.pid || "—"} · MEM {formatMemory(memoryKB)}
        </div>
        <div className="text-orange-400">
          SKILLS {skillsCount}
        </div>
      </div>
    </div>
  );
}

// Icon components
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