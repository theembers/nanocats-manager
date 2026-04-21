"use client";

import { useState, useEffect } from "react";
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

  const isRunning = agent.status === "running";
  const isError = agent.status === "error";

  return (
    <Link href={`/agents/${agent.name}`} className="block">
      <div className="glass-card rounded-lg overflow-hidden relative p-4">
        {/* Header: avatar + name + action button */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-700">
              <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: avatarSvg }} />
            </div>
            <h3 className="font-heading font-semibold text-white text-sm uppercase flex items-center gap-1.5">
              {agent.name}
              <span className={`w-2 h-2 rounded-full ${
                isRunning
                  ? "bg-green-500"
                  : isError
                  ? "bg-red-500"
                  : "bg-zinc-500"
              }`} />
            </h3>
          </div>

          {/* Action button - icon only */}
          {isRunning ? (
            confirmingStop ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleConfirmStop}
                  disabled={loading}
                  className="px-2 py-1 rounded text-xs font-medium btn-destructive disabled:opacity-50"
                >
                  {loading ? <LoaderIcon className="w-3 h-3 animate-spin" /> : "Y"}
                </button>
                <button
                  onClick={handleCancelStop}
                  disabled={loading}
                  className="px-2 py-1 rounded text-xs font-medium glass-button text-zinc-300"
                >
                  N
                </button>
              </div>
            ) : (
              <button
                onClick={handleStopClick}
                className="w-8 h-8 flex items-center justify-center rounded-lg btn-destructive"
              >
                {loading ? (
                  <LoaderIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <StopIcon className="w-4 h-4" />
                )}
              </button>
            )
          ) : (
            <button
              onClick={handleStart}
              disabled={loading}
              className="w-8 h-8 flex items-center justify-center rounded-lg btn-success disabled:opacity-50"
            >
              {loading ? (
                <LoaderIcon className="w-4 h-4 animate-spin" />
              ) : (
                <PlayIcon className="w-4 h-4" />
              )}
            </button>
          )}
        </div>

        {/* Info rows */}
        <div className="space-y-1.5 text-xs font-mono text-zinc-400">
          <div className="flex items-center gap-4">
            <span>PORT:{agent.port}</span>
            <span className="text-zinc-600">|</span>
            <span>PID:{agent.pid || "—"}</span>
          </div>
          <div className="flex items-center gap-4">
            <span>Skills:{skillsCount}</span>
            <span className="text-zinc-600">|</span>
            <span>MEM:{formatMemory(memoryKB)}</span>
          </div>
        </div>
      </div>
    </Link>
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
