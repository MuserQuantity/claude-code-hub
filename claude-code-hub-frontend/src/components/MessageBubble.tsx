import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Terminal, FileText, Copy, Check, User, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ToolCall {
  id?: string;
  name: string;
  input: Record<string, unknown>;
}

interface ToolResult {
  tool_id?: string;
  tool_name: string;
  output: string;
}

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[] | string | null;
  toolResults?: ToolResult[] | string | null;
  toolOutputs?: Record<string, string>;
  thinking?: string | null;
  isStreaming?: boolean;
}

function TerminalOutput({ output }: { output: string }) {
  const scrollRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output]);

  const display = output.length > 3000 ? output.slice(0, 3000) + "\n... (truncated)" : output;

  // Color exit codes
  const lines = display.split("\n");
  return (
    <pre
      ref={scrollRef}
      className="px-3 py-2 text-xs font-mono whitespace-pre-wrap max-h-64 overflow-auto bg-zinc-950"
    >
      {lines.map((line, i) => {
        let className = "text-zinc-300";
        if (line.startsWith("STDERR:")) className = "text-red-400";
        else if (line.startsWith("Exit code: 0")) className = "text-green-400";
        else if (line.match(/^Exit code: \d+/)) className = "text-red-400";
        else if (line.startsWith("Error:")) className = "text-red-400";
        else if (line.startsWith("Successfully")) className = "text-green-400";
        return (
          <span key={i} className={className}>
            {line}
            {i < lines.length - 1 ? "\n" : ""}
          </span>
        );
      })}
    </pre>
  );
}

function ToolCallBlock({ call, result, streamingOutput, autoExpand }: { call: ToolCall; result?: ToolResult; streamingOutput?: string; autoExpand?: boolean }) {
  const [expanded, setExpanded] = useState(autoExpand || false);

  // Auto-expand when streaming (autoExpand changes)
  useEffect(() => {
    if (autoExpand) setExpanded(true);
  }, [autoExpand]);
  const [copied, setCopied] = useState(false);

  const toolIcon = call.name === "bash" ? (
    <Terminal className="h-3.5 w-3.5" />
  ) : (
    <FileText className="h-3.5 w-3.5" />
  );

  const summary = call.name === "bash"
    ? `$ ${String(call.input.command || "").slice(0, 80)}`
    : call.name === "file_read"
    ? `Read ${call.input.path}`
    : call.name === "file_write"
    ? `Write ${call.input.path}`
    : call.name === "file_edit"
    ? `Edit ${call.input.path}`
    : call.name === "glob"
    ? `Glob ${call.input.pattern}`
    : call.name === "grep"
    ? `Search "${call.input.pattern}"`
    : `${call.name}`;

  const copyOutput = () => {
    if (result?.output) {
      navigator.clipboard.writeText(result.output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="my-2 rounded-md border border-zinc-700 bg-zinc-900 overflow-hidden">
      <button
        className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs hover:bg-zinc-800 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-3 w-3 text-zinc-500" /> : <ChevronRight className="h-3 w-3 text-zinc-500" />}
        {toolIcon}
        <Badge variant="outline" className="text-xs px-1.5 py-0 border-zinc-600 text-zinc-400">
          {call.name}
        </Badge>
        <span className="text-zinc-300 truncate font-mono">{summary}</span>
      </button>
      {expanded && (
        <div className="border-t border-zinc-800">
          {call.name === "bash" && call.input.command != null && (
            <div className="px-3 py-2 bg-zinc-950">
              <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">$ {String(call.input.command)}</pre>
            </div>
          )}
          {result?.output && (
            <div className="relative">
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-1 right-1 h-6 w-6 text-zinc-500 hover:text-zinc-300"
                onClick={copyOutput}
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
              <TerminalOutput output={result.output} />
            </div>
          )}
          {!result && streamingOutput && (
            <div className="relative">
              <TerminalOutput output={streamingOutput} />
              <div className="px-3 py-1 text-xs text-zinc-500 flex items-center gap-2 border-t border-zinc-800">
                <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse" />
                Running...
              </div>
            </div>
          )}
          {!result && !streamingOutput && (
            <div className="px-3 py-2 text-xs text-zinc-500 flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse" />
              Running...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MessageBubble({ role, content, toolCalls, toolResults, toolOutputs, thinking, isStreaming }: MessageBubbleProps) {
  const [showThinking, setShowThinking] = useState(false);

  const parsedToolCalls: ToolCall[] = toolCalls
    ? (typeof toolCalls === "string" ? JSON.parse(toolCalls) : toolCalls)
    : [];
  const parsedToolResults: ToolResult[] = toolResults
    ? (typeof toolResults === "string" ? JSON.parse(toolResults) : toolResults)
    : [];

  return (
    <div className={`flex gap-3 px-4 py-3 ${role === "user" ? "bg-zinc-900/50" : ""}`}>
      <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
        role === "user" ? "bg-blue-600" : "bg-orange-600"
      }`}>
        {role === "user" ? <User className="h-4 w-4 text-white" /> : <Bot className="h-4 w-4 text-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-zinc-500 mb-1">
          {role === "user" ? "You" : "Claude"}
        </p>

        {thinking && (
          <button
            className="flex items-center gap-1 text-xs text-zinc-500 mb-2 hover:text-zinc-400"
            onClick={() => setShowThinking(!showThinking)}
          >
            {showThinking ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Thinking...
          </button>
        )}
        {showThinking && thinking && (
          <div className="mb-2 p-2 rounded bg-zinc-900 border border-zinc-800 text-xs text-zinc-500 italic whitespace-pre-wrap">
            {thinking}
          </div>
        )}

        {/* Tool calls */}
        {parsedToolCalls.length > 0 && (
          <div className="mb-2">
            {parsedToolCalls.map((tc, i) => (
              <ToolCallBlock
                key={tc.id || i}
                call={tc}
                result={parsedToolResults.find(
                  (tr) => tr.tool_id === tc.id || tr.tool_name === tc.name
                )}
                streamingOutput={tc.id && toolOutputs ? toolOutputs[tc.id] : undefined}
                autoExpand={isStreaming}
              />
            ))}
          </div>
        )}

        {/* Message content */}
        {content && (
          <div className="prose prose-invert prose-sm max-w-none text-zinc-200">
            <ReactMarkdown
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const isInline = !match;
                  return isInline ? (
                    <code className="px-1 py-0.5 rounded bg-zinc-800 text-orange-300 text-xs" {...props}>
                      {children}
                    </code>
                  ) : (
                    <SyntaxHighlighter
                      style={oneDark}
                      language={match[1]}
                      PreTag="div"
                      className="rounded-md text-xs"
                    >
                      {String(children).replace(/\n$/, "")}
                    </SyntaxHighlighter>
                  );
                },
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}

        {isStreaming && !content && parsedToolCalls.length === 0 && (
          <div className="flex gap-1 py-2">
            <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        )}
      </div>
    </div>
  );
}
