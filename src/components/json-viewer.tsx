"use client";

import { useState, useCallback } from "react";
import JsonView from "@uiw/react-json-view";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface JsonViewerProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  collapsed?: boolean;
  fileName?: string;
  description?: string;
  onSave?: () => void;
  saving?: boolean;
}

export function JsonViewer({
  value,
  onChange,
  readOnly = false,
  collapsed = false,
  fileName,
  description,
  onSave,
  saving = false,
}: JsonViewerProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const parsed = (() => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  })();

  const handleFormat = useCallback(() => {
    setError(null);
    setFeedback(null);
    if (!onChange) return;
    try {
      const parsed = JSON.parse(value);
      onChange(JSON.stringify(parsed, null, 2));
      setFeedback({ type: "success", message: "JSON formatted successfully" });
    } catch {
      setError("Invalid JSON format");
    }
  }, [value, onChange]);

  const handleValidate = useCallback(() => {
    setError(null);
    setFeedback(null);
    try {
      JSON.parse(value);
      return true;
    } catch {
      setError("Invalid JSON format");
      return false;
    }
  }, [value]);

  const darkTheme = {
    "--w-rjv-background-color": "transparent",
    "--w-rjv-color": "#ffffff",
    "--w-rjv-key-number": "#A7AB9C",
    "--w-rjv-key-string": "#EDD7AD",
    "--w-rjv-type-string-color": "#EDD7AD",
    "--w-rjv-type-int-color": "#A7AB9C",
    "--w-rjv-type-float-color": "#A7AB9C",
    "--w-rjv-type-bigint-color": "#A7AB9C",
    "--w-rjv-type-boolean-color": "#EDD7AD",
    "--w-rjv-quotes-color": "#EDD7AD",
    "--w-rjv-quotes-string-color": "#EDD7AD",
  };

  const renderViewMode = () => (
    <div className="rounded-lg bg-[#464740]/50 p-4 overflow-auto max-h-[700px]">
      {parsed !== null ? (
        <JsonView
          value={parsed}
          collapsed={collapsed}
          displayDataTypes={false}
          style={darkTheme as React.CSSProperties}
        />
      ) : (
        <pre className="text-destructive text-sm whitespace-pre-wrap">{value}</pre>
      )}
    </div>
  );

  const renderEditMode = () => (
    <textarea
      value={value}
      onChange={(e) => {
        onChange?.(e.target.value);
        setError(null);
      }}
      className="w-full min-h-[700px] p-4 rounded-lg bg-[#464740] border border-white/10 text-zinc-200 font-mono text-sm resize-none focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      }}
    />
  );

  if (readOnly) {
    return (
      <Card className="glass-card border-0">
        {(fileName || description) && (
          <CardHeader>
            <CardTitle className="text-white">{fileName}</CardTitle>
            {description && <CardDescription className="text-zinc-400">{description}</CardDescription>}
          </CardHeader>
        )}
        <CardContent>
          {error && (
            <div className="mb-4 p-3 rounded-md text-sm bg-primary/10 text-primary border border-primary/20">
              {error}
            </div>
          )}
          {renderViewMode()}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card border-0">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            {fileName && <CardTitle className="text-white">{fileName}</CardTitle>}
            {description && <CardDescription className="text-zinc-400">{description}</CardDescription>}
          </div>
          <div className="flex items-center gap-2">
            {!isEditMode && (
              <button
                onClick={() => setIsEditMode(true)}
                className="px-3 py-1.5 rounded-lg glass-button text-sm text-zinc-300"
              >
                Edit
              </button>
            )}
            {isEditMode && (
              <>
                <button
                  onClick={handleFormat}
                  className="px-3 py-1.5 rounded-lg glass-button text-sm text-zinc-300"
                >
                  Format
                </button>
                <button
                  onClick={() => {
                    if (handleValidate()) {
                      setIsEditMode(false);
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg glass-button text-sm text-zinc-300"
                >
                  Validate
                </button>
                <button
                  onClick={() => {
                    if (handleValidate()) {
                      setIsEditMode(false);
                    }
                  }}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg btn-primary text-sm text-white font-medium disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Done"}
                </button>
              </>
            )}
            {!isEditMode && onSave && (
              <button
                onClick={() => {
                  if (handleValidate()) {
                    onSave();
                  }
                }}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg btn-primary text-sm text-white font-medium disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {feedback && (
          <div
            className={`mb-4 p-3 rounded-md text-sm ${
              feedback.type === "success"
                ? "bg-[#EDD7AD]/10 text-[#EDD7AD] border border-[#EDD7AD]/20"
                : "bg-primary/10 text-primary border border-primary/20"
            }`}
          >
            {feedback.message}
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 rounded-md text-sm bg-primary/10 text-primary border border-primary/20">
            {error}
          </div>
        )}
        {isEditMode ? renderEditMode() : renderViewMode()}
      </CardContent>
    </Card>
  );
}