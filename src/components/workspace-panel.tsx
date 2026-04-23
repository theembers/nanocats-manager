"use client";

import { AgentInstance } from "@/lib/types";
import { AgentChatPanel } from "./agent-chat-panel";

interface WorkspacePanelProps {
  activeAgents: AgentInstance[];
  onRemoveAgent: (agentName: string) => void;
}

export function WorkspacePanel({ activeAgents, onRemoveAgent }: WorkspacePanelProps) {
  if (activeAgents.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#464740]/50 flex items-center justify-center mx-auto mb-4">
            <BotIcon className="w-8 h-8 text-zinc-600" />
          </div>
          <h3 className="text-lg font-medium text-zinc-400 mb-2">Empty Workspace</h3>
          <p className="text-sm text-zinc-500">Drag agents from the sidebar to start chatting</p>
        </div>
      </div>
    );
  }

  const gridClass = activeAgents.length === 1
    ? "grid-cols-1"
    : activeAgents.length === 2
    ? "grid-cols-2"
    : activeAgents.length === 3
    ? "grid-cols-3"
    : activeAgents.length === 4
    ? "grid-cols-2 grid-rows-2"
    : "grid-cols-3 grid-rows-2";

  return (
    <div className="h-full flex items-center justify-center p-4">
      <div className={`grid ${gridClass} gap-4 w-full h-full`}>
        {activeAgents.map((agent) => (
          <AgentChatPanel
            key={agent.name}
            agent={agent}
            onClose={() => onRemoveAgent(agent.name)}
          />
        ))}
      </div>
    </div>
  );
}

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