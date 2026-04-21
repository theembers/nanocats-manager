"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AgentForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    basePath: "~/nanocats-space/agents/",
    port: 0,
    model: "MiniMax-M2.7",
    provider: "minimax",
    apiKey: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "port" ? parseInt(value) || 0 : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError("Agent name is required");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          basePath: formData.basePath || undefined,
          port: formData.port || undefined,
          model: formData.model || undefined,
          provider: formData.provider || undefined,
          apiKey: formData.apiKey || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create agent");
      }

      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="name" className="block text-sm font-medium text-zinc-300">
          Agent Name <span className="text-orange-400">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          value={formData.name}
          onChange={handleChange}
          placeholder="my-agent"
          required
          className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="basePath" className="block text-sm font-medium text-zinc-300">
          Base Path
        </label>
        <input
          id="basePath"
          name="basePath"
          type="text"
          value={formData.basePath}
          readOnly
          className="w-full px-4 py-2.5 rounded-lg bg-zinc-900 border border-white/5 text-zinc-500 cursor-not-allowed"
        />
        <p className="text-sm text-zinc-500">
          Directory where agent workspace will be created (fixed to ~/agents/)
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="port" className="block text-sm font-medium text-zinc-300">
          Gateway Port <span className="text-zinc-500 text-xs">(auto-generated if empty)</span>
        </label>
        <input
          id="port"
          name="port"
          type="number"
          value={formData.port || ""}
          onChange={handleChange}
          placeholder="18790"
          className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all"
        />
        <p className="text-sm text-zinc-500">
          Leave empty to auto-generate next available port
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="model" className="block text-sm font-medium text-zinc-300">
          Model Name
        </label>
        <input
          id="model"
          name="model"
          type="text"
          value={formData.model}
          onChange={handleChange}
          className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="provider" className="block text-sm font-medium text-zinc-300">
          Provider
        </label>
        <input
          id="provider"
          name="provider"
          type="text"
          value={formData.provider}
          onChange={handleChange}
          className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="apiKey" className="block text-sm font-medium text-zinc-300">
          API Key <span className="text-zinc-500 text-xs">(optional, used for provider and MCP)</span>
        </label>
        <input
          id="apiKey"
          name="apiKey"
          type="password"
          value={formData.apiKey}
          onChange={handleChange}
          placeholder="sk-..."
          className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all"
        />
        <p className="text-sm text-zinc-500">
          Used for both provider API key and MCP MiniMax API key
        </p>
      </div>

      <div className="flex gap-4 pt-4">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2.5 rounded-lg bg-orange-500/20 border border-orange-500/50 text-orange-300 hover:bg-orange-500/30 hover:border-orange-400 font-medium disabled:opacity-50 flex items-center gap-2 transition-all"
        >
          {loading ? (
            <>
              <LoaderIcon className="w-4 h-4 animate-spin" />
              Creating...
            </>
          ) : (
            "Create Agent"
          )}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-2.5 rounded-lg glass-button text-zinc-300 font-medium"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function LoaderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
