"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AgentInstance } from "@/lib/types";

interface ConfigPanelProps {
  activeAgents: AgentInstance[];
  onRemoveAgent: (agentName: string) => void;
}

interface AgentConfig {
  content: string;
  configPath: string;
}

export function ConfigPanel({ activeAgents, onRemoveAgent }: ConfigPanelProps) {
  const router = useRouter();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [configData, setConfigData] = useState<Record<string, AgentConfig>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ agent: string; type: "success" | "error"; message: string } | null>(null);

  const selectedAgentData = selectedAgent ? activeAgents.find(a => a.name === selectedAgent) : null;

  useEffect(() => {
    if (activeAgents.length > 0 && !selectedAgent) {
      setSelectedAgent(activeAgents[0].name);
    } else if (activeAgents.length > 0 && !activeAgents.find(a => a.name === selectedAgent)) {
      setSelectedAgent(activeAgents[0].name);
    }
  }, [activeAgents, selectedAgent]);

  useEffect(() => {
    const fetchConfigs = async () => {
      if (activeAgents.length === 0) return;

      setLoading(true);
      try {
        const results: Record<string, AgentConfig> = {};
        await Promise.all(
          activeAgents.map(async (agent) => {
            try {
              const res = await fetch(`/api/agents/${agent.name}/config`);
              if (res.ok) {
                const data = await res.json();
                let content = data.content || "";
                try {
                  const parsed = JSON.parse(content);
                  content = JSON.stringify(parsed, null, 2);
                } catch {}
                results[agent.name] = { content, configPath: agent.configPath };
              }
            } catch {}
          })
        );
        setConfigData(results);
      } catch (err) {
        setError("Failed to load configurations");
      } finally {
        setLoading(false);
      }
    };

    fetchConfigs();
  }, [activeAgents]);

  const handleSave = async () => {
    if (!selectedAgent || !configData[selectedAgent]) return;

    const content = configData[selectedAgent].content;

    try {
      JSON.parse(content);
    } catch {
      setFeedback({ agent: selectedAgent, type: "error", message: "Invalid JSON format" });
      return;
    }

    setSaving(selectedAgent);
    setFeedback(null);

    try {
      const res = await fetch(`/api/agents/${selectedAgent}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (res.ok) {
        setFeedback({ agent: selectedAgent, type: "success", message: "Configuration saved" });
      } else {
        const data = await res.json();
        setFeedback({ agent: selectedAgent, type: "error", message: data.error || "Failed to save" });
      }
    } catch {
      setFeedback({ agent: selectedAgent, type: "error", message: "Network error" });
    } finally {
      setSaving(null);
    }
  };

  const updateConfig = (agentName: string, content: string) => {
    setConfigData(prev => ({
      ...prev,
      [agentName]: { ...prev[agentName], content }
    }));
  };

  if (activeAgents.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center mx-auto mb-4">
            <SettingsIcon className="w-8 h-8 text-zinc-600" />
          </div>
          <h3 className="text-lg font-medium text-zinc-400 mb-2">Empty Configuration</h3>
          <p className="text-sm text-zinc-500">Drag agents here to edit their configurations</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex justify-center mb-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 px-4">
          {activeAgents.map((agent) => (
            <button
              key={agent.name}
              onClick={() => setSelectedAgent(agent.name)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                selectedAgent === agent.name
                  ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                  : "bg-zinc-800 text-zinc-400 border border-transparent hover:text-zinc-200"
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${agent.status === "running" ? "bg-green-400" : "bg-zinc-500"}`} />
              {agent.name}
              <button
                onClick={(e) => { e.stopPropagation(); onRemoveAgent(agent.name); }}
                className="ml-1 p-0.5 rounded hover:bg-zinc-700"
              >
                <CloseIcon className="w-3 h-3" />
              </button>
            </button>
          ))}
          {selectedAgent && (
            <button
              onClick={() => router.push(`/agents/${selectedAgent}/manager`)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30 transition-all whitespace-nowrap"
            >
              <ShieldIcon className="w-4 h-4" />
              Manager Console
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-zinc-400">Loading...</span>
        </div>
      ) : selectedAgent && configData[selectedAgent] ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-4xl h-full flex flex-col glass-card rounded-xl overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <SettingsIcon className="w-4 h-4 text-zinc-500" />
                <span className="text-sm text-zinc-400 font-mono truncate max-w-md">{configData[selectedAgent].configPath}</span>
              </div>
              <button
                onClick={handleSave}
                disabled={saving === selectedAgent}
                className="px-4 py-1.5 rounded-lg btn-success text-sm font-medium disabled:opacity-50"
              >
                {saving === selectedAgent ? "Saving..." : "Save"}
              </button>
            </div>

            {feedback && feedback.agent === selectedAgent && (
              <div className={`mx-3 mt-3 p-2 rounded-lg text-sm ${
                feedback.type === "success" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
              }`}>
                {feedback.message}
              </div>
            )}

            <div className="flex-1 p-3 overflow-auto">
              <textarea
                value={configData[selectedAgent].content}
                onChange={(e) => updateConfig(selectedAgent, e.target.value)}
                className="w-full h-full min-h-[400px] bg-black/30 border border-zinc-800 rounded-lg px-4 py-3 text-sm font-mono text-zinc-300 focus:outline-none focus:border-orange-500/50 resize-none"
                spellCheck={false}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-zinc-500">Select an agent to edit configuration</span>
        </div>
      )}
    </div>
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

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}