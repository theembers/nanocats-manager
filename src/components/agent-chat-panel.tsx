"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { createAvatar } from '@dicebear/core';
import { botttsNeutral } from '@dicebear/collection';
import { AgentInstance } from "@/lib/types";
import { cn } from "@/lib/utils";

interface WebchatConfig {
  enabled: boolean;
  webchatUrl: string;
}

interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

interface ToolExecuting {
  id: string;
  name: string;
  hint: string;
}

interface ToolResult {
  toolCallId: string;
  name: string;
  content: string | { type: string; text: string } | unknown;
}

interface Message {
  id: string;
  type: "user" | "bot" | "tool";
  content: string;
  timestamp?: string;
  isStreaming?: boolean;
  thinkContent?: string;
  toolCalls?: ToolCall[];
  toolResult?: ToolResult;
  toolExecuting?: ToolExecuting[];
  attachments?: { name: string; type: string; preview?: string }[];
}

interface AgentChatPanelProps {
  agent: AgentInstance;
  onClose: () => void;
}

export function AgentChatPanel({ agent, onClose }: AgentChatPanelProps) {
  const [webchatConfig, setWebchatConfig] = useState<WebchatConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<{ id: string; name: string; type: string; preview?: string }[]>([]);
  const [pendingFiles, setPendingFiles] = useState(0);
  const [showConfig, setShowConfig] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string>("");

  // Initialize session ID only on client to avoid hydration mismatch
  useEffect(() => {
    sessionIdRef.current = `web_${agent.name}`;
  }, [agent.name]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Generate DiceBear avatar SVG
  const avatarSvg = (() => {
    const avatar = createAvatar(botttsNeutral, {
      seed: agent.name,
      size: 32,
    });
    return avatar.toString();
  })();

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchWebchatConfig(), fetchChatHistory()]);
      setLoading(false);
    };
    init();
  }, [agent.name]);

  useEffect(() => {
    if (webchatConfig?.enabled && wsRef.current === null && !isConnecting) {
      connectWebSocket();
    }
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [webchatConfig?.enabled]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [inputValue]);

  const fetchWebchatConfig = async () => {
    try {
      const res = await fetch(`/api/agents/${agent.name}/webchat`);
      if (res.ok) {
        const data = await res.json();
        setWebchatConfig(data);
      }
    } catch (error) {
      console.error("Failed to fetch webchat config:", error);
    }
  };

  const fetchChatHistory = async () => {
    try {
      const res = await fetch(`/api/agents/${agent.name}/chat-history`);
      if (res.ok) {
        const data = await res.json();
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages.map((msg: Message) => ({ ...msg, isHistory: true })));
        }
      }
    } catch (error) {
      console.error("Failed to fetch chat history:", error);
    }
  };

  const handleFileSelect = (files: FileList | File[]) => {
    const maxAttachments = 5;
    const maxFileSize = 10 * 1024 * 1024;
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'txt', 'doc', 'docx', 'zip'];

    const fileArray = Array.from(files);

    if (attachments.length + fileArray.length > maxAttachments) {
      alert(`最多只能上传 ${maxAttachments} 个附件`);
      return;
    }

    const validFiles: File[] = [];
    for (const file of fileArray) {
      if (file.size > maxFileSize) {
        alert(`文件 "${file.name}" 超过 10MB 限制`);
        continue;
      }

      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      if (!allowedExtensions.includes(extension)) {
        alert(`不支持的文件类型: "${file.name}"`);
        continue;
      }

      validFiles.push(file);
    }

    setPendingFiles(prev => prev + validFiles.length);

    for (const file of validFiles) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;

        const newAttachment = {
          id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          type: file.type,
          preview: dataUrl,
        };

        setAttachments(prev => [...prev, newAttachment]);
        setPendingFiles(prev => prev - 1);
      };
      reader.onerror = () => {
        setPendingFiles(prev => prev - 1);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      e.preventDefault();
      handleFileSelect(files);
    }
  };

  const connectWebSocket = () => {
    if (!webchatConfig?.webchatUrl || wsRef.current || isConnecting) return;
    setIsConnecting(true);
    const wsUrl = webchatConfig.webchatUrl.replace("http://", "ws://").replace("https://", "wss://");
    const ws = new WebSocket(`${wsUrl}/ws?session_id=${sessionIdRef.current}`);

    ws.onopen = () => { setIsConnected(true); setIsConnecting(false); };
    ws.onmessage = (event) => { try { handleWebSocketMessage(JSON.parse(event.data)); } catch {} };
    ws.onclose = () => { setIsConnected(false); setIsConnecting(false); wsRef.current = null; };
    ws.onerror = () => { setIsConnected(false); setIsConnecting(false); wsRef.current = null; };
    wsRef.current = ws;
  };

  const handleWebSocketMessage = (data: any) => {
    switch (data.type) {
      case "typing": setIsAgentTyping(data.is_typing); break;
      case "think_content":
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.type === "bot" && last.isStreaming) {
            const updated = [...prev];
            updated[updated.length - 1] = { ...last, thinkContent: (last.thinkContent || "") + data.content };
            return updated;
          }
          return [...prev, { id: crypto.randomUUID(), type: "bot", content: "", thinkContent: data.content, isStreaming: true }];
        });
        break;
      case "tool_call":
        const hints = data.content.split(",").map((h: string) => h.trim()).filter(Boolean);
        const tools: ToolExecuting[] = hints.map((hint: string, i: number) => ({ id: `t_${Date.now()}_${i}`, name: hint.split("(")[0], hint }));
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.type === "bot" && last.isStreaming) {
            const updated = [...prev];
            updated[updated.length - 1] = { ...last, toolExecuting: [...(last.toolExecuting || []), ...tools] };
            return updated;
          }
          return [...prev, { id: crypto.randomUUID(), type: "bot", content: "", toolExecuting: tools, isStreaming: true }];
        });
        break;
      case "delta":
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.type === "bot" && last.isStreaming) {
            const updated = [...prev];
            updated[updated.length - 1] = { ...last, content: data.content || last.content, toolExecuting: data.is_end && !last.toolExecuting?.length ? [] : last.toolExecuting, isStreaming: !data.is_end };
            if (data.is_end) setIsAgentTyping(false);
            return updated;
          }
          return [...prev, { id: crypto.randomUUID(), type: "bot", content: data.content, isStreaming: !data.is_end }];
        });
        break;
      case "message":
        setIsAgentTyping(false);
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.type === "bot" && last.isStreaming) {
            const updated = [...prev];
            updated[updated.length - 1] = { ...last, content: data.content || last.toolExecuting?.map(t => t.hint).join(", ") || "", thinkContent: undefined, toolExecuting: undefined, isStreaming: false };
            return updated;
          }
          return [...prev, { id: crypto.randomUUID(), type: "bot", content: data.content }];
        });
        break;
    }
  };

  const handleEnableWebchat = async () => {
    setEnabling(true);
    try {
      const res = await fetch(`/api/agents/${agent.name}/webchat`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: true }) });
      if (res.ok) {
        const data = await res.json();
        setWebchatConfig(prev => prev ? { ...prev, enabled: true, webchatUrl: data.webchatUrl } : null);
        setTimeout(connectWebSocket, 500);
      }
    } catch (error) {
      console.error("Failed to enable webchat:", error);
    } finally {
      setEnabling(false);
    }
  };

  const handleSendMessage = async () => {
    const text = inputValue.trim();
    const hasAttachments = attachments.length > 0;
    if ((!text && !hasAttachments) || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || pendingFiles > 0) {
      return;
    }

    setInputValue("");

    let messageAttachments: { name: string; type: string; preview?: string }[] | undefined;
    let wsMedia: { data: string; filename: string }[] | undefined;

    if (hasAttachments) {
      try {
        const uploadRes = await fetch(`/api/agents/${agent.name}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: attachments.map(a => ({
              data: a.preview || "",
              filename: a.name,
            })),
          }),
        });

        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          messageAttachments = attachments.map((a, i) => ({
            name: a.name,
            type: a.type,
            preview: uploadData.files?.[i]?.url || a.preview,
          }));
        } else {
          messageAttachments = attachments.map(a => ({
            name: a.name,
            type: a.type,
            preview: a.preview,
          }));
        }
      } catch {
        messageAttachments = attachments.map(a => ({
          name: a.name,
          type: a.type,
          preview: a.preview,
        }));
      }

      wsMedia = attachments.map(a => ({
        data: a.preview || "",
        filename: a.name,
      }));
    }

    const newMessage: Message = {
      id: crypto.randomUUID(),
      type: "user",
      content: text,
      timestamp: new Date().toISOString(),
      attachments: messageAttachments,
    };

    setMessages(prev => [...prev, newMessage]);

    const wsPayload: Record<string, unknown> = { text: text || "" };
    if (wsMedia) {
      wsPayload.media = wsMedia;
    }
    wsRef.current.send(JSON.stringify(wsPayload));

    setAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      // 当输入法处于组合状态时，不触发发送（防止中文输入法按回车时提前发送）
      if (e.nativeEvent.isComposing || e.keyCode === 229) {
        return;
      }
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (loading) {
    return (
      <div className="glass-card rounded-xl flex flex-col overflow-hidden">
        <PanelHeader agent={agent} onClose={onClose} avatarSvg={avatarSvg} showConfig={showConfig} onToggleConfig={() => setShowConfig(!showConfig)} />
        <div className="flex-1 flex items-center justify-center"><span className="text-zinc-400">Loading...</span></div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl flex flex-col overflow-hidden">
      <PanelHeader agent={agent} onClose={onClose} avatarSvg={avatarSvg} showConfig={showConfig} onToggleConfig={() => setShowConfig(!showConfig)} />

      {showConfig ? (
        <div className="flex-1 overflow-y-auto p-4">
          <AgentConfigDetail agent={agent} />
        </div>
      ) : agent.status !== "running" ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-4"><p className="text-zinc-400 text-sm mb-2">Agent is not running</p><p className="text-zinc-500 text-xs">Start the agent to chat</p></div>
        </div>
      ) : !webchatConfig?.enabled ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-4"><p className="text-zinc-400 text-sm mb-3">Webchat is not enabled</p>
            <button onClick={handleEnableWebchat} disabled={enabling} className="px-4 py-2 rounded-lg btn-success text-sm font-medium disabled:opacity-50">{enabling ? "Enabling..." : "Enable Webchat"}</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                <BotIcon className="w-10 h-10 mb-3 opacity-50" />
                <p className="text-sm">Start a conversation</p>
              </div>
            ) : (
              messages.map((msg) => <MessageBubble key={msg.id} msg={msg} onImagePreview={setPreviewImage} />)
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-2 border-t border-white/5">
            {attachments.length > 0 && (
              <div className="flex gap-2 overflow-x-auto mb-2 pb-1">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="relative flex-shrink-0 bg-zinc-800 border border-zinc-700 overflow-hidden"
                  >
                    {attachment.type.startsWith('image/') ? (
                      <div className="w-16 h-16">
                        <img
                          src={attachment.preview}
                          alt={attachment.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-16 flex flex-col items-center justify-center p-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
                          <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
                        </svg>
                        <span className="text-zinc-400 text-[10px] mt-1 truncate max-w-[56px]">{attachment.name}</span>
                      </div>
                    )}
                    <button
                      onClick={() => removeAttachment(attachment.id)}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs transition-colors"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-3">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                multiple
                accept="image/*,.pdf,.txt,.doc,.docx,.zip"
                onChange={(e) => {
                  if (e.target.files) {
                    handleFileSelect(e.target.files);
                    e.target.value = '';
                  }
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!isConnected || attachments.length >= 5}
                className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-orange-400 disabled:text-zinc-600 disabled:hover:text-zinc-600 transition-colors"
                title="Attach file"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder={isConnected ? "Type a message..." : "Connecting..."}
                  disabled={!isConnected}
                  rows={1}
                  className="w-full bg-zinc-800 border border-zinc-700 px-3 text-xs placeholder-zinc-500 focus:outline-none resize-none"
                  style={{
                    height: "32px",
                    lineHeight: "32px",
                    maxHeight: "120px",
                    overflowY: "auto"
                  }}
                />
              <button
                onClick={() => {
                  if (!isConnected || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || pendingFiles > 0) return;
                  const newMessage: Message = {
                    id: crypto.randomUUID(),
                    type: "user",
                    content: "/new",
                    timestamp: new Date().toISOString(),
                  };
                  setMessages(prev => [...prev, newMessage]);
                  wsRef.current.send(JSON.stringify({ text: "/new" }));
                }}
                disabled={!isConnected || pendingFiles > 0}
                className="px-3 h-8 bg-orange-500/20 hover:bg-orange-500/30 disabled:bg-zinc-700/20 disabled:opacity-50 text-orange-400 disabled:text-zinc-500 font-medium transition-colors border border-orange-500/30 hover:border-orange-500/50 flex items-center justify-center text-sm"
                title="New conversation (/new)"
              >
                /new
              </button>
              <button
                onClick={handleSendMessage}
                disabled={!isConnected || (!inputValue.trim() && attachments.length === 0) || pendingFiles > 0 || isAgentTyping}
                className={cn(
                  "px-3 min-w-[64px] h-8 font-medium transition-all duration-200 flex items-center justify-center text-sm",
                  isAgentTyping
                    ? "bg-green-500/20 border border-green-500/30 text-green-400 cursor-wait"
                    : "bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-400 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:hover:scale-100"
                )}
              >
                {isAgentTyping ? (
                  <span className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                  </span>
                ) : (
                  <span>Send</span>
                )}
              </button>
            </div>
          </div>
        </>
      )}

      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setPreviewImage(null)}>
          <img src={previewImage} alt="Preview" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}

function PanelHeader({ agent, onClose, avatarSvg, showConfig, onToggleConfig }: {
  agent: AgentInstance;
  onClose: () => void;
  avatarSvg: string;
  showConfig: boolean;
  onToggleConfig: () => void;
}) {
  const statusDotColor = {
    running: "bg-green-500",
    stopped: "bg-zinc-500",
    error: "bg-red-500",
  }[agent.status] || "bg-zinc-500";

  return (
    <div className="flex items-center gap-2.5 p-2 border-b border-white/5">
      <div className="relative">
        <div
          className="w-8 h-8 rounded-full overflow-hidden bg-zinc-700 cursor-pointer"
          dangerouslySetInnerHTML={{ __html: avatarSvg }}
        />
        <button
          onClick={onToggleConfig}
          className={cn(
            "absolute inset-0 rounded-full flex items-center justify-center transition-all duration-200",
            showConfig ? "bg-orange-500/70" : "bg-transparent hover:bg-black/50"
          )}
          title="Agent Config"
        >
          <ConfigIcon className={cn("w-4 h-4", showConfig ? "text-white" : "text-white/80 opacity-0 hover:opacity-100")} />
        </button>
      </div>
      <h3 className="font-heading font-semibold text-white text-sm uppercase flex items-center gap-1.5">
        {agent.name}
        <span className={cn("w-2 h-2 rounded-full", statusDotColor)} />
      </h3>
      <div className="flex-1" />
      <button onClick={onClose} className="p-1 text-zinc-500 hover:text-zinc-300"><CloseIcon className="w-4 h-4" /></button>
    </div>
  );
}

function MessageBubble({ msg, onImagePreview: _onImagePreview }: { msg: Message; onImagePreview: (img: string | null) => void }) {
  const hasBotContent = msg.type === "bot" && (msg.content || msg.isStreaming || msg.toolCalls?.length || msg.toolExecuting?.length || msg.thinkContent || msg.attachments?.length);

  if (msg.type === "tool" && msg.toolResult) {
    return (
      <div className="flex justify-start gap-2">
        <div className="w-7 h-7 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center flex-shrink-0">
          <ToolIcon className="w-3.5 h-3.5 text-green-400" />
        </div>
        <div className="max-w-[80%] flex flex-col items-start">
          <ToolResultBlock toolResult={msg.toolResult} />
          <MessageMeta timestamp={msg.timestamp} alignRight={false} />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex", msg.type === "user" ? "justify-end" : "justify-start", "gap-2")}>
      {msg.type === "bot" && hasBotContent && (
        <div className="w-7 h-7 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center flex-shrink-0">
          <BotIcon className="w-3.5 h-3.5 text-orange-400" />
        </div>
      )}
      <div className={cn("max-w-[80%] flex flex-col", msg.type === "user" ? "items-end" : "items-start")}>
        {hasBotContent && (
          <div className="px-3 py-2 rounded-2xl bg-zinc-800 text-zinc-200 rounded-bl-md border border-zinc-700/50 space-y-2">
            {msg.thinkContent && <ThinkBlock content={msg.thinkContent} isStreaming={msg.isStreaming} />}
            {msg.toolExecuting && msg.toolExecuting.length > 0 && <ToolExecutingBlock tools={msg.toolExecuting} isExecuting={msg.isStreaming && !msg.content} />}
            {msg.content && (
              <div className={msg.isStreaming ? "border-l-4 border-l-orange-400 pl-3" : ""}>
                <MemoizedMarkdown content={msg.content} />
                {msg.isStreaming && <StreamingIndicator />}
              </div>
            )}
          </div>
        )}
        {msg.type === "user" && (
          <div className="px-3 py-2 rounded-2xl bg-orange-500/20 text-white rounded-br-md text-sm">
            <CollapsibleUserContent content={msg.content} />
          </div>
        )}
        <MessageMeta timestamp={msg.timestamp} alignRight={msg.type === "user"} />
      </div>
      {msg.type === "user" && (
        <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
          <UserIcon className="w-3.5 h-3.5 text-blue-400" />
        </div>
      )}
    </div>
  );
}

function ThinkBlock({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(isStreaming ?? false);

  useEffect(() => { if (isStreaming) setIsExpanded(true); }, [isStreaming]);

  return (
    <div className="mb-2 rounded-lg border border-purple-500/30 bg-purple-500/10 overflow-hidden">
      <button onClick={() => setIsExpanded(!isExpanded)} className="w-full flex items-center gap-2 px-3 py-1.5 text-purple-400 text-xs font-medium hover:bg-purple-500/20">
        <ThinkIcon className="w-3.5 h-3.5" />
        <span>Thinking</span>
        {isStreaming && <StreamingDots />}
        <ChevronDownIcon className={cn("w-3.5 h-3.5 ml-auto transition-transform", isExpanded && "rotate-180")} />
      </button>
      {isExpanded && <div className="px-3 py-1.5 border-t border-purple-500/30 text-xs text-purple-300/80 whitespace-pre-wrap">{content}</div>}
    </div>
  );
}

function ToolExecutingBlock({ tools, isExecuting }: { tools: ToolExecuting[]; isExecuting?: boolean }) {
  return (
    <div className="mb-2 space-y-1.5">
      {tools.map((tool) => (
        <div key={tool.id} className="rounded-lg border border-blue-500/30 bg-blue-500/10 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 text-blue-400 text-xs font-medium">
            <div className="relative">
              <ToolIcon className="w-3.5 h-3.5" />
              {isExecuting && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5"><span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75 animate-ping" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" /></span>}
            </div>
            <span className="font-mono text-blue-300">{tool.hint}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function getDisplayText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'text' in value) return String((value as any).text);
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
}

function ToolResultBlock({ toolResult }: { toolResult: ToolResult }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentStr = getDisplayText(toolResult.content);

  return (
    <div className="rounded-lg border border-green-500/30 bg-green-500/10 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-green-400 text-xs font-medium hover:bg-green-500/20"
      >
        <ToolIcon className="w-3.5 h-3.5" />
        <span className="font-mono">{toolResult.name}</span>
        <ChevronDownIcon className={cn("w-3.5 h-3.5 ml-auto transition-transform", isExpanded && "rotate-180")} />
      </button>
      {isExpanded && (
        <div className="px-3 py-1.5 border-t border-green-500/30">
          <pre className="text-xs text-green-300/80 whitespace-pre-wrap break-all">{contentStr}</pre>
        </div>
      )}
    </div>
  );
}

function MessageMeta({ timestamp, alignRight }: { timestamp?: string; alignRight?: boolean }) {
  const formatTime = (ts: string) => new Date(ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
  return timestamp ? <span className={cn("text-[10px] text-zinc-500 mt-1", alignRight && "mr-2")}>{formatTime(timestamp)}</span> : null;
}

function CollapsibleUserContent({ content }: { content: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  if (!content) return null;
  const isLong = content.length > 300;
  const displayContent = isLong && !isExpanded ? content.slice(0, 300) + "..." : content;
  return (
    <div>
      <span className="whitespace-pre-wrap">{displayContent}</span>
      {isLong && <button onClick={() => setIsExpanded(!isExpanded)} className="text-xs text-orange-400 hover:text-orange-300 mt-1 block">{isExpanded ? "Show less" : "Show more"}</button>}
    </div>
  );
}

function MemoizedMarkdown({ content }: { content: string }) {
  if (!content) return null;
  return (
    <div className="markdown-content text-sm">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="text-zinc-300">{children}</li>,
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match;
            return isInline ? (
              <code className="bg-zinc-700/50 px-1.5 py-0.5 rounded text-orange-300 text-xs font-mono" {...props}>{children}</code>
            ) : (
              <code className={cn(className, "block bg-zinc-900 p-3 rounded-lg overflow-x-auto text-xs font-mono border border-zinc-700/50 mb-2")} {...props}>{children}</code>
            );
          },
          pre: ({ children }) => <>{children}</>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300 underline">{children}</a>,
          strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          h1: ({ children }) => <h1 className="text-xl font-bold text-white mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-lg font-bold text-white mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-base font-semibold text-white mb-1">{children}</h3>,
          blockquote: ({ children }) => <blockquote className="border-l-4 border-zinc-600 pl-4 italic text-zinc-400 mb-2">{children}</blockquote>,
          hr: () => <hr className="border-zinc-700 my-4" />,
        }}
      >{content}</ReactMarkdown>
    </div>
  );
}

function StreamingIndicator() {
  return (
    <div className="flex gap-1 mt-2">
      <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" />
      <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
      <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
    </div>
  );
}

function StreamingDots() {
  return (
    <span className="flex gap-1 ml-1">
      <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce" />
      <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
      <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
    </span>
  );
}

function BotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
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

function ThinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
    </svg>
  );
}

function ToolIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CrownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/>
    </svg>
  );
}

function ConfigIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

type DetailSection = "main" | "config" | "workspace" | "skills" | "cron" | "memory" | "env" | "logs";

function AgentConfigDetail({ agent }: { agent: AgentInstance }) {
  const [selectedSection, setSelectedSection] = useState<DetailSection>("main");

  if (selectedSection !== "main") {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-2 mb-3 flex-shrink-0">
          <button
            onClick={() => setSelectedSection("main")}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
          >
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
          <span className="text-sm text-zinc-400 uppercase tracking-wider">
            {selectedSection === "config" && "Edit Config"}
            {selectedSection === "workspace" && "Workspace"}
            {selectedSection === "skills" && "Skills"}
            {selectedSection === "cron" && "Cron Jobs"}
            {selectedSection === "memory" && "Memory"}
            {selectedSection === "env" && "Environment"}
            {selectedSection === "logs" && "View Logs"}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {selectedSection === "config" && <InlineConfigEditor agent={agent} />}
          {selectedSection === "workspace" && <InlineWorkspaceEditor agent={agent} />}
          {selectedSection === "skills" && <InlineSkillsPanel agent={agent} />}
          {selectedSection === "cron" && <InlineCronPanel agent={agent} />}
          {selectedSection === "memory" && <InlineMemoryPanel agent={agent} />}
          {selectedSection === "env" && <InlineEnvPanel agent={agent} />}
          {selectedSection === "logs" && <InlineLogsPanel agent={agent} />}
        </div>
      </div>
    );
  }

  const daysRunning = Math.floor((Date.now() - new Date(agent.createdAt).getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/30">
          <div className="flex items-center gap-2 mb-1">
            <GlobeIcon className="w-4 h-4 text-zinc-500" />
            <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Port</span>
          </div>
          <p className="text-lg font-bold text-white font-mono">{agent.port}</p>
        </div>
        <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/30">
          <div className="flex items-center gap-2 mb-1">
            <HashIcon className="w-4 h-4 text-zinc-500" />
            <span className="text-zinc-500 uppercase tracking-wider text-[10px]">PID</span>
          </div>
          <p className="text-lg font-bold text-white font-mono">{agent.pid || "N/A"}</p>
        </div>
        <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/30">
          <div className="flex items-center gap-2 mb-1">
            <CalendarIcon className="w-4 h-4 text-zinc-500" />
            <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Days</span>
          </div>
          <p className="text-lg font-bold text-orange-400 font-mono">{daysRunning}</p>
        </div>
      </div>

      <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/30 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <FileIcon className="w-4 h-4 text-zinc-500" />
          <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Config Path</span>
        </div>
        <p className="text-xs font-mono text-zinc-300 break-all">{agent.configPath}</p>
      </div>

      <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/30 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <FolderIcon className="w-4 h-4 text-zinc-500" />
          <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Workspace</span>
        </div>
        <p className="text-xs font-mono text-zinc-300 break-all">{agent.workspacePath}</p>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-auto">
        <button
          onClick={() => setSelectedSection("config")}
          className="p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/30 hover:bg-zinc-700/50 transition-colors text-center"
        >
          <SettingsIcon className="w-4 h-4 text-zinc-400 mx-auto mb-1" />
          <span className="text-[10px] text-zinc-400">Config</span>
        </button>
        <button
          onClick={() => setSelectedSection("workspace")}
          className="p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/30 hover:bg-zinc-700/50 transition-colors text-center"
        >
          <FolderIcon className="w-4 h-4 text-zinc-400 mx-auto mb-1" />
          <span className="text-[10px] text-zinc-400">Workspace</span>
        </button>
        <button
          onClick={() => setSelectedSection("skills")}
          className="p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/30 hover:bg-zinc-700/50 transition-colors text-center"
        >
          <ZapIcon className="w-4 h-4 text-zinc-400 mx-auto mb-1" />
          <span className="text-[10px] text-zinc-400">Skills</span>
        </button>
        <button
          onClick={() => setSelectedSection("cron")}
          className="p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/30 hover:bg-zinc-700/50 transition-colors text-center"
        >
          <ClockIcon className="w-4 h-4 text-zinc-400 mx-auto mb-1" />
          <span className="text-[10px] text-zinc-400">Cron</span>
        </button>
        <button
          onClick={() => setSelectedSection("memory")}
          className="p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/30 hover:bg-zinc-700/50 transition-colors text-center"
        >
          <BrainIcon className="w-4 h-4 text-zinc-400 mx-auto mb-1" />
          <span className="text-[10px] text-zinc-400">Memory</span>
        </button>
        <button
          onClick={() => setSelectedSection("env")}
          className="p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/30 hover:bg-zinc-700/50 transition-colors text-center"
        >
          <TerminalIcon className="w-4 h-4 text-zinc-400 mx-auto mb-1" />
          <span className="text-[10px] text-zinc-400">Env</span>
        </button>
        <button
          onClick={() => setSelectedSection("logs")}
          className="p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/30 hover:bg-zinc-700/50 transition-colors text-center col-span-3"
        >
          <FileTextIcon className="w-4 h-4 text-zinc-400 mx-auto mb-1" />
          <span className="text-[10px] text-zinc-400">View Logs</span>
        </button>
      </div>
    </div>
  );
}

function InlineConfigEditor({ agent }: { agent: AgentInstance }) {
  const [config, setConfig] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch(`/api/agents/${agent.name}/config`);
        if (res.ok) {
          const data = await res.json();
          const content = data.content || "";
          try {
            const parsed = JSON.parse(content);
            setConfig(JSON.stringify(parsed, null, 2));
          } catch {
            setConfig(content);
          }
        }
      } catch {
        setError("Failed to load config");
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, [agent.name]);

  const handleSave = async () => {
    setError(null);
    setFeedback(null);
    try {
      JSON.parse(config);
    } catch {
      setError("Invalid JSON format");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${agent.name}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: config }),
      });
      if (res.ok) {
        setFeedback({ type: "success", message: "Saved successfully" });
      } else {
        setError("Failed to save");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleFormat = () => {
    try {
      setConfig(JSON.stringify(JSON.parse(config), null, 2));
      setError(null);
    } catch {
      setError("Invalid JSON");
    }
  };

  if (loading) return <div className="text-zinc-400 text-sm p-4">Loading...</div>;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-end gap-2 mb-2 flex-shrink-0">
        <button onClick={handleFormat} className="px-3 py-1.5 rounded-lg glass-button text-xs text-zinc-300">
          Format
        </button>
        <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 rounded-lg btn-success text-xs disabled:opacity-50">
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      {error && <div className="mb-2 p-2 rounded bg-red-500/10 text-red-400 text-xs border border-red-500/20">{error}</div>}
      {feedback && <div className="mb-2 p-2 rounded bg-green-500/10 text-green-400 text-xs border border-green-500/20">{feedback.message}</div>}
      <textarea
        value={config}
        onChange={(e) => { setConfig(e.target.value); setError(null); }}
        className="flex-1 w-full p-3 rounded-lg bg-zinc-900 border border-white/10 text-zinc-200 font-mono text-xs resize-none focus:outline-none focus:border-orange-500/50"
      />
    </div>
  );
}

const WORKSPACE_FILES = [
  { id: "agents", name: "AGENTS.md", path: "AGENTS.md", description: "Agent personality and behavior" },
  { id: "soul", name: "SOUL.md", path: "SOUL.md", description: "Core identity and values" },
  { id: "user", name: "USER.md", path: "USER.md", description: "User preferences and context" },
  { id: "tools", name: "TOOLS.md", path: "TOOLS.md", description: "Available tools and capabilities" },
  { id: "heartbeat", name: "HEARTBEAT.md", path: "HEARTBEAT.md", description: "Health check configuration" },
];

function InlineWorkspaceEditor({ agent }: { agent: AgentInstance }) {
  const [activeTab, setActiveTab] = useState("agents");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const currentFile = WORKSPACE_FILES.find(f => f.id === activeTab)!;

  useEffect(() => {
    fetchContent();
  }, [activeTab, agent.name]);

  const fetchContent = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${agent.name}/workspace?path=${encodeURIComponent(currentFile.path)}`);
      if (res.ok) {
        const data = await res.json();
        setContent(data.content || "");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/agents/${agent.name}/workspace?path=${encodeURIComponent(currentFile.path)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        setFeedback({ type: "success", message: "Saved" });
      } else {
        setFeedback({ type: "error", message: "Failed to save" });
      }
    } catch {
      setFeedback({ type: "error", message: "Network error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex gap-1 mb-2 flex-shrink-0 overflow-x-auto pb-1">
        {WORKSPACE_FILES.map(file => (
          <button
            key={file.id}
            onClick={() => setActiveTab(file.id)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
              activeTab === file.id ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" : "bg-zinc-800 text-zinc-400 border border-transparent hover:text-zinc-200"
            )}
          >
            {file.name}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <span className="text-xs text-zinc-500">{currentFile.description}</span>
        <button onClick={handleSave} disabled={saving} className="px-3 py-1 rounded-lg btn-success text-xs disabled:opacity-50">
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      {feedback && (
        <div className={cn("mb-2 p-2 rounded text-xs", feedback.type === "success" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400")}>
          {feedback.message}
        </div>
      )}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="flex-1 w-full p-3 rounded-lg bg-zinc-900 border border-white/10 text-zinc-200 font-mono text-xs resize-none focus:outline-none focus:border-orange-500/50"
        placeholder={`Edit ${currentFile.name}...`}
      />
    </div>
  );
}

interface Skill {
  name: string;
  path: string;
  description?: string;
}

function InlineSkillsPanel({ agent }: { agent: AgentInstance }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [skillContent, setSkillContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSkills();
  }, [agent.name]);

  const fetchSkills = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${agent.name}/skills`);
      if (res.ok) {
        const data = await res.json();
        setSkills(data.skills || []);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchSkillContent = async (skill: Skill) => {
    try {
      const res = await fetch(`/api/agents/${agent.name}/workspace?path=${encodeURIComponent(`skills/${skill.path}/SKILL.md`)}`);
      if (res.ok) {
        const data = await res.json();
        setSkillContent(data.content || "");
      }
    } catch {}
  };

  const handleSelectSkill = (skill: Skill) => {
    setSelectedSkill(skill);
    fetchSkillContent(skill);
  };

  const handleSaveSkill = async () => {
    if (!selectedSkill) return;
    setSaving(true);
    try {
      await fetch(`/api/agents/${agent.name}/workspace?path=${encodeURIComponent(`skills/${selectedSkill.path}/SKILL.md`)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: skillContent }),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-zinc-400 text-sm p-4">Loading...</div>;

  if (selectedSkill) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-2 flex-shrink-0">
          <button onClick={() => setSelectedSkill(null)} className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white">
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
          <span className="text-xs text-zinc-400">Editing: {selectedSkill.name}</span>
          <button onClick={handleSaveSkill} disabled={saving} className="px-3 py-1 rounded-lg btn-success text-xs">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
        <textarea
          value={skillContent}
          onChange={(e) => setSkillContent(e.target.value)}
          className="flex-1 w-full p-3 rounded-lg bg-zinc-900 border border-white/10 text-zinc-200 font-mono text-xs resize-none focus:outline-none focus:border-orange-500/50"
        />
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className="text-zinc-500 text-sm text-center py-8">
        No skills found
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {skills.map(skill => (
        <div
          key={skill.path}
          className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/30 hover:bg-zinc-800 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white font-medium">{skill.name}</p>
              {skill.description && <p className="text-xs text-zinc-500 mt-0.5">{skill.description}</p>}
            </div>
            <button
              onClick={() => handleSelectSkill(skill)}
              className="px-3 py-1 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs"
            >
              Edit
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

interface SessionRecord {
  role?: string;
  content?: string;
  timestamp?: string;
  tool_calls?: { id: string; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  name?: string;
}

interface SessionFile {
  filename: string;
  createdAt: string;
  records: SessionRecord[];
}

function InlineCronPanel({ agent }: { agent: AgentInstance }) {
  const [activeTab, setActiveTab] = useState<"config" | "records">("config");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState<SessionFile[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === "config") {
      fetchConfig();
    } else {
      fetchRecords();
    }
  }, [activeTab, agent.name]);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${agent.name}/workspace?path=cron/jobs.json`);
      if (res.ok) {
        const data = await res.json();
        try {
          setContent(JSON.stringify(JSON.parse(data.content || "{}"), null, 2));
        } catch {
          setContent(data.content || "{}");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchRecords = async () => {
    setRecordsLoading(true);
    try {
      const res = await fetch(`/api/agents/${agent.name}/cron/core-logs`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.files || []);
      }
    } finally {
      setRecordsLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/agents/${agent.name}/workspace?path=cron/jobs.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const parseThinkContent = (content: string) => {
    const match = content.match(/<think>([\s\S]*?)<\/think>/);
    if (match) return { think: match[1].trim(), rest: content.replace(/<think>[\s\S]*?<\/think>/, "").trim() };
    return { think: null, rest: content };
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex gap-1 mb-3 flex-shrink-0">
        <button
          onClick={() => setActiveTab("config")}
          className={cn("px-3 py-1.5 rounded-lg text-xs font-medium", activeTab === "config" ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" : "bg-zinc-800 text-zinc-400")}
        >
          Config
        </button>
        <button
          onClick={() => setActiveTab("records")}
          className={cn("px-3 py-1.5 rounded-lg text-xs font-medium", activeTab === "records" ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" : "bg-zinc-800 text-zinc-400")}
        >
          Records
        </button>
      </div>

      {activeTab === "config" ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2 flex-shrink-0">
            <span className="text-xs text-zinc-500">jobs.json</span>
            <button onClick={handleSave} disabled={saving} className="px-3 py-1 rounded-lg btn-success text-xs">
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1 w-full p-3 rounded-lg bg-zinc-900 border border-white/10 text-zinc-200 font-mono text-xs resize-none focus:outline-none focus:border-orange-500/50"
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {recordsLoading ? (
            <div className="text-zinc-400 text-sm text-center py-4">Loading...</div>
          ) : records.length === 0 ? (
            <div className="text-zinc-500 text-sm text-center py-8">No records found</div>
          ) : (
            records.map(file => (
              <div key={file.filename} className="rounded-lg border border-zinc-700/50 bg-zinc-800/30">
                <button
                  onClick={() => setExpandedFile(expandedFile === file.filename ? null : file.filename)}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-zinc-800/50 transition-colors"
                >
                  <FileIcon className="w-4 h-4 text-orange-400 flex-shrink-0" />
                  <span className="text-xs font-mono text-zinc-300 flex-1 text-left truncate">{file.filename}</span>
                  <span className="text-xs text-zinc-600 flex-shrink-0">{formatTime(file.createdAt)}</span>
                  <ChevronDownIcon className={cn("w-4 h-4 text-zinc-400 transition-transform flex-shrink-0", expandedFile === file.filename && "rotate-180")} />
                </button>
                {expandedFile === file.filename && (
                  <div className="px-3 pb-3 space-y-3">
                    {file.records.map((record, idx) => {
                      const { think, rest } = parseThinkContent(record.content || "");
                      const isUser = record.role === "user";
                      return (
                        <div key={idx} className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
                          {!isUser && <div className="w-6 h-6 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center flex-shrink-0"><BotIcon className="w-3 h-3 text-orange-400" /></div>}
                          <div className={cn("max-w-[80%] rounded-lg px-3 py-2 text-xs", isUser ? "bg-zinc-700 text-zinc-100" : "bg-zinc-800 text-zinc-200")}>
                            {!isUser && think && <div className="text-purple-400 mb-1 border-b border-purple-500/30 pb-1 mb-1">{think}</div>}
                            <div>{rest}</div>
                            <div className="text-zinc-500 mt-1 text-[10px]">{formatTime(record.timestamp || "")}</div>
                          </div>
                          {isUser && <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0"><UserIcon className="w-3 h-3 text-blue-400" /></div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function InlineMemoryPanel({ agent }: { agent: AgentInstance }) {
  const [activeTab, setActiveTab] = useState<"memory" | "history">("memory");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchContent();
  }, [activeTab, agent.name]);

  const fetchContent = async () => {
    setLoading(true);
    const path = activeTab === "memory" ? "memory/MEMORY.md" : "memory/history.jsonl";
    try {
      const res = await fetch(`/api/agents/${agent.name}/workspace?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const data = await res.json();
        setContent(data.content || "");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const path = activeTab === "memory" ? "memory/MEMORY.md" : "memory/history.jsonl";
    try {
      await fetch(`/api/agents/${agent.name}/workspace?path=${encodeURIComponent(path)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex gap-1 mb-3 flex-shrink-0">
        <button
          onClick={() => setActiveTab("memory")}
          className={cn("px-3 py-1.5 rounded-lg text-xs font-medium", activeTab === "memory" ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" : "bg-zinc-800 text-zinc-400")}
        >
          MEMORY.md
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={cn("px-3 py-1.5 rounded-lg text-xs font-medium", activeTab === "history" ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" : "bg-zinc-800 text-zinc-400")}
        >
          history.jsonl
        </button>
      </div>
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <span className="text-xs text-zinc-500">{activeTab === "memory" ? "Long-term memory" : "Conversation history"}</span>
        <button onClick={handleSave} disabled={saving} className="px-3 py-1 rounded-lg btn-success text-xs">
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="flex-1 w-full p-3 rounded-lg bg-zinc-900 border border-white/10 text-zinc-200 font-mono text-xs resize-none focus:outline-none focus:border-orange-500/50"
      />
    </div>
  );
}

function InlineEnvPanel({ agent }: { agent: AgentInstance }) {
  const [envContent, setEnvContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    const fetchEnv = async () => {
      try {
        const res = await fetch(`/api/agents/${agent.name}/env`);
        if (res.ok) {
          const data = await res.json();
          setEnvContent(data.content || "");
        }
      } finally {
        setLoading(false);
      }
    };
    fetchEnv();
  }, [agent.name]);

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/agents/${agent.name}/env`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: envContent }),
      });
      if (res.ok) {
        setFeedback({ type: "success", message: "Saved successfully" });
      } else {
        setFeedback({ type: "error", message: "Failed to save" });
      }
    } catch {
      setFeedback({ type: "error", message: "Network error" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-zinc-400 text-sm p-4">Loading...</div>;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <span className="text-xs text-zinc-500">.env file</span>
        <button onClick={handleSave} disabled={saving} className="px-3 py-1 rounded-lg btn-success text-xs">
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      {feedback && (
        <div className={cn("mb-2 p-2 rounded text-xs", feedback.type === "success" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400")}>
          {feedback.message}
        </div>
      )}
      <textarea
        value={envContent}
        onChange={(e) => setEnvContent(e.target.value)}
        className="flex-1 w-full p-3 rounded-lg bg-zinc-900 border border-white/10 text-zinc-200 font-mono text-xs resize-none focus:outline-none focus:border-orange-500/50"
        placeholder="# Environment variables&#10;API_KEY=your-key&#10DEBUG=true"
      />
    </div>
  );
}

function InlineLogsPanel({ agent }: { agent: AgentInstance }) {
  const [logs, setLogs] = useState<{ timestamp: string; stream: string; content: string }[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const eventSource = new EventSource(`/api/agents/${agent.name}/logs`);

    eventSource.onopen = () => setIsConnected(true);
    eventSource.onmessage = (event) => {
      try {
        const log = JSON.parse(event.data);
        setLogs(prev => {
          const newLogs = [...prev, log];
          if (newLogs.length > 200) return newLogs.slice(-200);
          return newLogs;
        });
      } catch {}
    };
    eventSource.onerror = () => setIsConnected(false);

    return () => eventSource.close();
  }, [agent.name]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  const formatTime = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const getLogStyle = (content: string) => {
    const lower = content.toLowerCase();
    if (/\b(error|exception|fatal)\b/.test(lower)) return "text-red-400";
    if (/\b(warn|warning)\b/.test(lower)) return "text-amber-400";
    if (/\b(debug|trace)\b/.test(lower)) return "text-zinc-600";
    if (/\b(info)\b/.test(lower)) return "text-blue-400";
    return "text-zinc-300";
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", isConnected ? "bg-green-400 animate-status-pulse" : "bg-red-400")} />
          <span className="text-xs text-zinc-400">{isConnected ? "Connected" : "Disconnected"}</span>
        </div>
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className="px-2 py-1 rounded text-xs text-zinc-400 hover:text-zinc-200"
        >
          {autoScroll ? "Pause" : "Resume"}
        </button>
      </div>
      <div ref={containerRef} className="flex-1 overflow-y-auto bg-zinc-950 rounded-lg p-2 space-y-0.5 min-h-0">
        {logs.length === 0 ? (
          <div className="text-zinc-600 text-xs text-center py-4">Waiting for logs...</div>
        ) : (
          logs.map((log, idx) => (
            <div key={idx} className="flex gap-2 text-xs font-mono hover:bg-zinc-900/50 px-1 py-0.5 rounded">
              <span className="text-zinc-600 flex-shrink-0">{formatTime(log.timestamp)}</span>
              <span className={cn("flex-1 truncate", getLogStyle(log.content), log.stream === "stderr" && "text-zinc-400")}>
                {log.content}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
      <path d="M2 12h20"/>
    </svg>
  );
}

function HashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" x2="20" y1="9" y2="9"/>
      <line x1="4" x2="20" y1="15" y2="15"/>
      <line x1="10" x2="8" y1="3" y2="21"/>
      <line x1="16" x2="14" y1="3" y2="21"/>
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" x2="16" y1="2" y2="6"/>
      <line x1="8" x2="8" y1="2" y2="6"/>
      <line x1="3" x2="21" y1="10" y2="10"/>
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
      <polyline points="14 2 14 8 20 8"/>
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

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6"/>
    </svg>
  );
}

function ZapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}

function BrainIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/>
      <path d="M8.5 8.5v.01"/>
      <path d="M16 15.5v.01"/>
      <path d="M12 12v.01"/>
      <path d="M11 17v.01"/>
      <path d="M7 14v.01"/>
    </svg>
  );
}

function TerminalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5"/>
      <line x1="12" x2="20" y1="19" y2="19"/>
    </svg>
  );
}

function FileTextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" x2="8" y1="13" y2="13"/>
      <line x1="16" x2="8" y1="17" y2="17"/>
      <line x1="10" x2="8" y1="9" y2="9"/>
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

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
      <line x1="12" x2="12" y1="11" y2="17"/>
      <line x1="9" x2="15" y1="14" y2="14"/>
    </svg>
  );
}