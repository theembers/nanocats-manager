"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AgentInstance } from "@/lib/types";
import { DraggableAgentCard } from "./draggable-agent-card";

interface DashboardSidebarProps {
  agents: AgentInstance[];
  onStatusChange: () => void;
}

export function DashboardSidebar({ agents, onStatusChange }: DashboardSidebarProps) {
  const [version, setVersion] = useState<string>("");
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [startStopLoading, setStartStopLoading] = useState(false);

  useEffect(() => {
    fetchVersion();
  }, []);

  const fetchVersion = async () => {
    try {
      const res = await fetch("/api/nanobot/version");
      if (res.ok) {
        const data = await res.json();
        setVersion(data.version);
      }
    } catch (error) {
      console.error("Failed to fetch nanobot version:", error);
    }
  };

  const handleUpdate = async () => {
    if (updating) return;

    setUpdating(true);
    setUpdateMsg(null);

    try {
      const res = await fetch("/api/nanobot/update", { method: "POST" });
      const data = await res.json();

      if (res.ok && data.success) {
        setUpdateMsg({ type: "success", text: "Nanobot updated successfully!" });
        fetchVersion();
      } else {
        setUpdateMsg({ type: "error", text: data.error || "Update failed" });
      }
    } catch (error) {
      setUpdateMsg({ type: "error", text: "Update request failed" });
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleAll = async () => {
    if (startStopLoading) return;
    setStartStopLoading(true);

    const hasRunning = agents.some(a => a.status === "running");
    const endpoint = hasRunning ? "/api/agents/stop-all" : "/api/agents/start-all";

    try {
      await fetch(endpoint, { method: "POST" });
      onStatusChange();
    } catch (error) {
      console.error("Failed to toggle agents:", error);
    } finally {
      setStartStopLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#3a3a38] border-r border-white/5" suppressHydrationWarning>
      <div className="h-14 px-4 flex items-center border-b border-white/5">
        <img
          src="/nanocats_logo.png"
          alt="NanoCats"
          className="h-8 w-auto object-contain"
        />
      </div>

      <div className="px-3 py-2 border-b border-white/5">
        <Link href="/agents/new">
          <button className="sidebar-btn sidebar-btn-primary" suppressHydrationWarning>
            <PlusIcon className="w-4 h-4" />
            New Agent
          </button>
        </Link>
      </div>

      <div className="px-3 py-2 border-b border-white/5">
        <Link href="/manager">
          <button className="sidebar-btn sidebar-btn-primary" suppressHydrationWarning>
            <ShieldIcon className="w-4 h-4" />
            Manager Console
          </button>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
<div className="flex items-center justify-between px-1 mb-3" suppressHydrationWarning>
            <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest" suppressHydrationWarning>
              Agents ({agents.length})
            </div>
            {agents.length > 0 && (
              <button
                onClick={handleToggleAll}
                disabled={startStopLoading}
                className={`icon-btn ${agents.some(a => a.status === "running") ? "icon-btn-success" : "icon-btn-gray"}`}
                title={agents.some(a => a.status === "running") ? "Stop All" : "Start All"}
              >
                {startStopLoading ? (
                  <RefreshIcon className="w-4 h-4 animate-spin" />
                ) : agents.some(a => a.status === "running") ? (
                  <StopIcon className="w-4 h-4" />
                ) : (
                  <PlayIcon className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
          {agents.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-sm">
            No agents
          </div>
        ) : (
          agents.map((agent) => (
            <DraggableAgentCard
              key={agent.name}
              agent={agent}
              onStatusChange={onStatusChange}
            />
          ))
        )}
      </div>

      <div className="p-3 border-t border-white/5 space-y-2">
        {version && (
          <div className="text-[10px] text-zinc-500 text-center">
            nanobot v{version}
          </div>
        )}
        <button
          onClick={handleUpdate}
          disabled={updating}
          className="sidebar-btn sidebar-btn-primary"
        >
          {updating ? (
            <>
              <LoadingIcon className="w-4 h-4 animate-spin" />
              Updating...
            </>
          ) : (
            <>
              <RefreshIcon className="w-4 h-4" />
              Update Nanobot
            </>
          )}
        </button>
        {updateMsg && (
          <div
            className={`text-[10px] text-center ${
              updateMsg.type === "success" ? "text-[#EDD7AD]" : "text-primary"
            }`}
          >
            {updateMsg.text}
          </div>
        )}
        <p className="text-[10px] text-zinc-600 text-center">
          Drag agents to workspace
        </p>
      </div>
    </div>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14"/>
      <path d="M12 5v14"/>
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
      <path d="M3 3v5h5"/>
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
      <path d="M16 16h5v5"/>
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
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}

function LoadingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  );
}