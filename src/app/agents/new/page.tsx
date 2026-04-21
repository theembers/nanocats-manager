"use client";

import { AgentForm } from "@/components/agent-form";
import { Breadcrumb } from "@/components/breadcrumb";

export default function NewAgentPage() {
  return (
    <div className="animate-fade-in-up">
      <Breadcrumb items={[
        { label: "Dashboard", href: "/" },
        { label: "New Agent" }
      ]} />

      <h1 className="text-3xl font-bold text-white">Create New Agent</h1>
      <p className="text-zinc-400 mt-1">
        Configure and launch a new nanobot agent instance
      </p>

      <div className="glass-card rounded-lg p-6 mt-6">
        <AgentForm />
      </div>
    </div>
  );
}