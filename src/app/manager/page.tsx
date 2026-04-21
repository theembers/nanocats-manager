"use client";

import { useEffect, useState } from "react";
import { SharedSkill } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Breadcrumb } from "@/components/breadcrumb";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { JsonViewer } from "@/components/json-viewer";

interface MemberInfo {
  name: string;
  status: string;
  role: "manager" | "member";
}

export default function ManagerPage() {
  const [skills, setSkills] = useState<SharedSkill[]>([]);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [mcpConfig, setMcpConfig] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [skillsRes, membersRes, mcpRes] = await Promise.all([
        fetch("/api/shared-config/skills"),
        fetch("/api/shared-config/members"),
        fetch("/api/shared-config/mcp"),
      ]);

      if (skillsRes.ok) {
        const skillsData = await skillsRes.json();
        setSkills(skillsData.skills || []);
      }

      if (membersRes.ok) {
        const membersData = await membersRes.json();
        setMembers(membersData.members || []);
      }

      if (mcpRes.ok) {
        const mcpData = await mcpRes.json();
        setMcpConfig(JSON.stringify(mcpData, null, 2));
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
      setFeedback({ type: "error", message: "Failed to load data" });
    } finally {
      setLoading(false);
    }
  };

  const toggleSkill = async (skillName: string, enabled: boolean) => {
    try {
      const res = await fetch(`/api/shared-config/skills/${encodeURIComponent(skillName)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });

      if (res.ok) {
        setFeedback({ type: "success", message: `Skill ${enabled ? "enabled" : "disabled"}` });
        fetchData();
      } else {
        const data = await res.json();
        setFeedback({ type: "error", message: data.error || "Failed to update skill" });
      }
    } catch (error) {
      setFeedback({ type: "error", message: "Failed to update skill" });
    }
  };

  const deleteSkill = async (skillName: string) => {
    if (!confirm(`Are you sure you want to delete "${skillName}"?`)) return;

    try {
      const res = await fetch(
        `/api/shared-config/skills/${encodeURIComponent(skillName)}`,
        { method: "DELETE" }
      );

      if (res.ok) {
        setFeedback({ type: "success", message: "Skill deleted" });
        fetchData();
      } else {
        const data = await res.json();
        setFeedback({ type: "error", message: data.error || "Failed to delete skill" });
      }
    } catch (error) {
      setFeedback({ type: "error", message: "Failed to delete skill" });
    }
  };

  const saveMcpConfig = async () => {
    setSaving(true);
    setFeedback(null);

    try {
      JSON.parse(mcpConfig);
    } catch {
      setFeedback({ type: "error", message: "Invalid JSON format" });
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/shared-config/mcp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mcpServers: JSON.parse(mcpConfig) }),
      });

      if (res.ok) {
        setFeedback({ type: "success", message: "MCP config saved" });
      } else {
        const data = await res.json();
        setFeedback({ type: "error", message: data.error || "Failed to save MCP config" });
      }
    } catch (error) {
      setFeedback({ type: "error", message: "Failed to save MCP config" });
    } finally {
      setSaving(false);
    }
  };

  const applyConfigToMembers = async () => {
    if (members.length === 0) {
      setFeedback({ type: "error", message: "No members to apply config" });
      return;
    }

    try {
      const res = await fetch("/api/shared-config/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentNames: members.map((m) => m.name),
        }),
      });

      if (res.ok) {
        setFeedback({ type: "success", message: "Config applied to all members" });
      } else {
        const data = await res.json();
        setFeedback({ type: "error", message: data.error || "Failed to apply config" });
      }
    } catch (error) {
      setFeedback({ type: "error", message: "Failed to apply config" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-zinc-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <Breadcrumb items={[
        { label: "Dashboard", href: "/" },
        { label: "Manager Console" },
      ]} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Manager Console</h1>
          <p className="text-zinc-400">
            Manage shared skills and MCP configuration
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-lg text-sm ${
            feedback.type === "success"
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : "bg-red-500/10 text-red-400 border border-red-500/20"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <Tabs defaultValue="skills" className="space-y-4">
        <TabsList className="flex-wrap h-auto bg-zinc-800 border border-white/10 p-1 rounded-lg">
          <TabsTrigger
            value="skills"
            className="data-[state=active]:bg-orange-500 data-[state=active]:text-white rounded-md px-4 py-2.5 text-zinc-400 text-sm font-medium"
          >
            Shared Skills
          </TabsTrigger>
          <TabsTrigger
            value="mcp"
            className="data-[state=active]:bg-orange-500 data-[state=active]:text-white rounded-md px-4 py-2.5 text-zinc-400 text-sm font-medium"
          >
            MCP Config
          </TabsTrigger>
          <TabsTrigger
            value="members"
            className="data-[state=active]:bg-orange-500 data-[state=active]:text-white rounded-md px-4 py-2.5 text-zinc-400 text-sm font-medium"
          >
            Members ({members.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="skills">
          <Card className="glass-card border-0">
            <CardHeader>
              <CardTitle className="text-white">Shared Skills</CardTitle>
              <CardDescription className="text-zinc-400">
                These skills are shared with all member agents
              </CardDescription>
            </CardHeader>
            <CardContent>
              {skills.length === 0 ? (
                <div className="text-zinc-400 text-center py-8">
                  No shared skills configured. Add skills from this agent&apos;s workspace.
                </div>
              ) : (
                <div className="space-y-3">
                  {skills.map((skill) => (
                    <div
                      key={skill.path}
                      className="flex items-center justify-between p-4 rounded-lg bg-zinc-800/50 border border-white/10"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{skill.name}</span>
                          <Badge
                            variant={skill.enabled ? "default" : "secondary"}
                            className={
                              skill.enabled
                                ? "bg-green-500/20 text-green-400 border-green-500/30"
                                : "bg-zinc-700 text-zinc-400"
                            }
                          >
                            {skill.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                        </div>
                        {skill.description && (
                          <p className="text-sm text-zinc-400 mt-1 line-clamp-1">
                            {skill.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => toggleSkill(skill.path, !skill.enabled)}
                          className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
                        >
                          {skill.enabled ? "Disable" : "Enable"}
                        </button>
                        <button
                          onClick={() => deleteSkill(skill.path)}
                          className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors bg-red-500/20 hover:bg-red-500/30 text-red-400"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mcp">
          <JsonViewer
            value={mcpConfig}
            onChange={setMcpConfig}
            fileName="mcp.json"
            description="Configure MCP servers for all member agents"
            onSave={saveMcpConfig}
            saving={saving}
          />
        </TabsContent>

        <TabsContent value="members">
          <Card className="glass-card border-0">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-white">Linked Agents</CardTitle>
                  <CardDescription className="text-zinc-400">
                    {members.length} agent(s) with shared config access
                  </CardDescription>
                </div>
                <button
                  onClick={applyConfigToMembers}
                  disabled={members.length === 0}
                  className="px-4 py-2 rounded-lg btn-primary text-white font-medium disabled:opacity-50"
                >
                  Apply Config to All
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <div className="text-zinc-400 text-center py-8">
                  No linked agents configured yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {members.map((member) => (
                    <div
                      key={member.name}
                      className="flex items-center justify-between p-4 rounded-lg bg-zinc-800/50 border border-white/10"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-white">{member.name}</span>
                        <Badge
                          variant={member.status === "running" ? "default" : "secondary"}
                          className={
                            member.status === "running"
                              ? "bg-green-500/20 text-green-400 border-green-500/30"
                              : "bg-zinc-700 text-zinc-400"
                          }
                        >
                          {member.status}
                        </Badge>
                        <Badge
                          className={
                            member.role === "manager"
                              ? "bg-orange-500/20 text-orange-400 border-orange-500/30"
                              : "bg-blue-500/20 text-blue-400 border-blue-500/30"
                          }
                        >
                          {member.role === "manager" ? "Manager" : "Member"}
                        </Badge>
                      </div>
                      <a
                        href={`/agents/${member.name}`}
                        className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
                      >
                        View
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}