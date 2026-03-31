import { useState, useRef, useEffect, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Square, AlertCircle } from "lucide-react";
import MessageBubble from "./MessageBubble";
import { createChatWebSocket, type Message } from "@/lib/api";

interface StreamingToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface StreamingToolResult {
  tool_id: string;
  tool_name: string;
  output: string;
}

interface ChatAreaProps {
  sessionId: string | null;
  messages: Message[];
  onMessageSent: () => void;
  hasApiKey: boolean;
}

export default function ChatArea({ sessionId, messages, onMessageSent, hasApiKey }: ChatAreaProps) {
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingToolCalls, setStreamingToolCalls] = useState<StreamingToolCall[]>([]);
  const [streamingToolResults, setStreamingToolResults] = useState<StreamingToolResult[]>([]);
  const [streamingThinking, setStreamingThinking] = useState("");
  const [error, setError] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText, streamingToolCalls, streamingToolResults]);

  // Focus textarea when session changes
  useEffect(() => {
    textareaRef.current?.focus();
  }, [sessionId]);

  const stopStreaming = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !sessionId || isStreaming) return;
    if (!hasApiKey) {
      setError("Please configure your API key in Settings first.");
      return;
    }

    const content = input.trim();
    setInput("");
    setError("");
    setIsStreaming(true);
    setStreamingText("");
    setStreamingToolCalls([]);
    setStreamingToolResults([]);
    setStreamingThinking("");

    const token = localStorage.getItem("token");
    if (!token) {
      setError("Not authenticated");
      setIsStreaming(false);
      return;
    }

    try {
      const ws = createChatWebSocket(sessionId);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ token, content }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case "text_delta":
              setStreamingText((prev) => prev + data.content);
              break;
            case "thinking":
              setStreamingThinking((prev) => prev + data.content);
              break;
            case "tool_use_start":
              setStreamingToolCalls((prev) => [
                ...prev,
                { id: data.tool_id, name: data.tool_name, input: data.input },
              ]);
              break;
            case "tool_result":
              setStreamingToolResults((prev) => [
                ...prev,
                { tool_id: data.tool_id, tool_name: data.tool_name, output: data.output },
              ]);
              break;
            case "error":
              setError(data.content);
              break;
            case "done":
              ws.close();
              wsRef.current = null;
              setIsStreaming(false);
              setStreamingText("");
              setStreamingToolCalls([]);
              setStreamingToolResults([]);
              setStreamingThinking("");
              onMessageSent();
              break;
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => {
        setError("WebSocket connection failed");
        setIsStreaming(false);
      };

      ws.onclose = () => {
        if (isStreaming) {
          setIsStreaming(false);
          onMessageSent();
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
      setIsStreaming(false);
    }
  }, [input, sessionId, isStreaming, hasApiKey, onMessageSent]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!sessionId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-950">
        <div className="text-center">
          <p className="text-zinc-500 text-lg">Select or create a conversation to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-zinc-950">
      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="max-w-3xl mx-auto py-4">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
              toolCalls={msg.tool_calls}
              toolResults={msg.tool_results}
              thinking={msg.thinking}
            />
          ))}

          {/* Streaming message */}
          {isStreaming && (
            <MessageBubble
              role="assistant"
              content={streamingText}
              toolCalls={streamingToolCalls}
              toolResults={streamingToolResults}
              thinking={streamingThinking}
              isStreaming
            />
          )}

          {messages.length === 0 && !isStreaming && (
            <div className="text-center py-20">
              <p className="text-zinc-600 text-sm">Send a message to start the conversation</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Error bar */}
      {error && (
        <div className="px-4 py-2 bg-red-900/30 border-t border-red-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <p className="text-sm text-red-300 flex-1">{error}</p>
          <Button size="sm" variant="ghost" className="text-red-400 h-6" onClick={() => setError("")}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-zinc-800 p-4">
        <div className="max-w-3xl mx-auto flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message... (Shift+Enter for new line)"
            className="min-h-10 max-h-40 resize-none bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
            rows={1}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <Button
              onClick={stopStreaming}
              size="icon"
              className="shrink-0 bg-red-600 hover:bg-red-700"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={sendMessage}
              size="icon"
              className="shrink-0 bg-orange-600 hover:bg-orange-700"
              disabled={!input.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
