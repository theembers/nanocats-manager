"use client";

import { useEffect, useState, useCallback } from "react";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { WorkspacePanel } from "@/components/workspace-panel";
import { ConfigPanel } from "@/components/config-panel";
import { AgentInstance } from "@/lib/types";

type TabType = "workspace" | "config";

export default function DashboardPage() {
  const [agents, setAgents] = useState<AgentInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("workspace");
  const [workspaceAgents, setWorkspaceAgents] = useState<AgentInstance[]>([]);
  const [configAgents, setConfigAgents] = useState<AgentInstance[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      if (res.ok) {
        const data = await res.json();
        setAgents(data);
      }
    } catch (error) {
      console.error("Failed to fetch agents:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 10000);
    return () => clearInterval(interval);
  }, [fetchAgents]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    try {
      const agentData = e.dataTransfer.getData("application/json");
      if (!agentData) return;

      const agent: AgentInstance = JSON.parse(agentData);
      const agentName = agent.name;

      const maxAgents = 6;
      if (activeTab === "workspace") {
        setWorkspaceAgents(prev => {
          if (prev.find(a => a.name === agentName)) return prev;
          if (prev.length >= maxAgents) return prev;
          return [...prev, agent];
        });
      } else {
        setConfigAgents(prev => {
          if (prev.find(a => a.name === agentName)) return prev;
          if (prev.length >= maxAgents) return prev;
          return [...prev, agent];
        });
      }
    } catch (error) {
      console.error("Failed to process dropped agent:", error);
    }
  };

  const removeFromWorkspace = (agentName: string) => {
    setWorkspaceAgents(prev => prev.filter(a => a.name !== agentName));
  };

  const removeFromConfig = (agentName: string) => {
    setConfigAgents(prev => prev.filter(a => a.name !== agentName));
  };

  return (
    <div className="h-screen flex overflow-hidden">
      <div className="w-[280px] flex-shrink-0">
        <DashboardSidebar agents={agents} onStatusChange={fetchAgents} />
      </div>

      <div
        className="flex-1 flex flex-col overflow-hidden"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="h-14 px-4 flex items-center justify-end gap-4 border-b border-white/5">
          {workspaceAgents.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="px-3 py-1.5 rounded-lg bg-orange-500/20 text-orange-400 text-sm font-medium border border-orange-500/30">
                <WorkspaceIcon className="w-4 h-4 inline mr-1.5" />
                Workspace
                <span className="ml-1.5 px-1.5 py-0.5 rounded bg-orange-500/30 text-xs">
                  {workspaceAgents.length}
                </span>
              </span>
            </div>
          )}
        </div>

        <div className={`flex-1 overflow-hidden transition-all ${isDragOver ? "bg-orange-500/5" : ""}`}>
          {isDragOver && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="glass-card px-8 py-4 rounded-xl border-2 border-dashed border-orange-500/50">
                <p className="text-orange-400 font-medium">Drop to add to {activeTab} (max 4)</p>
              </div>
            </div>
          )}

          {activeTab === "workspace" ? (
            <WorkspacePanel
              activeAgents={workspaceAgents}
              onRemoveAgent={removeFromWorkspace}
            />
          ) : (
            <ConfigPanel
              activeAgents={configAgents}
              onRemoveAgent={removeFromConfig}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function WorkspaceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2"/>
      <path d="M7 7h10"/>
      <path d="M7 12h10"/>
      <path d="M7 17h10"/>
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}