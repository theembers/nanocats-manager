"use client";

import Link from "next/link";
import { AgentInstance } from "@/lib/types";
import { DraggableAgentCard } from "./draggable-agent-card";

interface DashboardSidebarProps {
  agents: AgentInstance[];
  onStatusChange: () => void;
}

export function DashboardSidebar({ agents, onStatusChange }: DashboardSidebarProps) {
  return (
    <div className="h-full flex flex-col bg-zinc-950 border-r border-white/5">
      <div className="h-14 px-4 flex items-center border-b border-white/5">
        <img
          src="/nanocats_logo.png"
          alt="NanoCats"
          className="h-8 w-auto object-contain"
        />
      </div>

      <div className="px-3 py-2 border-b border-white/5">
        <Link href="/agents/new">
          <button className="w-full px-3 py-2 rounded-lg bg-orange-500/20 border border-orange-500/50 text-orange-300 hover:bg-orange-500/30 hover:border-orange-400 font-medium text-sm flex items-center justify-center gap-2 transition-all">
            <PlusIcon className="w-4 h-4" />
            New Agent
          </button>
        </Link>
      </div>

      <div className="px-3 py-2 border-b border-white/5">
        <Link href="/manager">
          <button className="w-full px-3 py-2 rounded-lg bg-blue-500/20 border border-blue-500/50 text-blue-300 hover:bg-blue-500/30 hover:border-blue-400 font-medium text-sm flex items-center justify-center gap-2 transition-all">
            <ShieldIcon className="w-4 h-4" />
            Manager Console
          </button>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest mb-3 px-1">
          Agents ({agents.length})
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

      <div className="p-3 border-t border-white/5">
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