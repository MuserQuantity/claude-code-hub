import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Plus, MessageSquare, Trash2, Settings, LogOut, Terminal, PenLine, Check, X } from "lucide-react";
import type { Session } from "@/lib/api";

interface SidebarProps {
  sessions: Session[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  username: string;
}

export default function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  onOpenSettings,
  onLogout,
  username,
}: SidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const startRename = (session: Session) => {
    setEditingId(session.id);
    setEditTitle(session.title);
  };

  const confirmRename = () => {
    if (editingId && editTitle.trim()) {
      onRenameSession(editingId, editTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-r border-zinc-800 w-64">
      {/* Header */}
      <div className="p-4 flex items-center gap-2">
        <Terminal className="h-5 w-5 text-orange-500" />
        <span className="font-semibold text-zinc-100 text-sm">Claude Code Hub</span>
      </div>

      <div className="px-3">
        <Button
          onClick={onNewSession}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white justify-start gap-2"
          size="sm"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      <Separator className="my-3 bg-zinc-800" />

      {/* Sessions list */}
      <ScrollArea className="flex-1 px-2">
        <div className="space-y-1">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`group flex items-center rounded-md text-sm cursor-pointer ${
                activeSessionId === session.id
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              {editingId === session.id ? (
                <div className="flex items-center gap-1 w-full p-1">
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmRename();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="h-7 text-xs bg-zinc-800 border-zinc-700 text-zinc-100"
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={confirmRename}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => setEditingId(null)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <>
                  <button
                    className="flex items-center gap-2 flex-1 p-2 text-left min-w-0"
                    onClick={() => onSelectSession(session.id)}
                  >
                    <MessageSquare className="h-4 w-4 shrink-0" />
                    <span className="truncate">{session.title}</span>
                  </button>
                  <div className="hidden group-hover:flex items-center pr-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-zinc-500 hover:text-zinc-300"
                      onClick={(e) => { e.stopPropagation(); startRename(session); }}
                    >
                      <PenLine className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-zinc-500 hover:text-red-400"
                      onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id); }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
          {sessions.length === 0 && (
            <p className="text-xs text-zinc-600 text-center py-8">No conversations yet</p>
          )}
        </div>
      </ScrollArea>

      <Separator className="bg-zinc-800" />

      {/* Footer */}
      <div className="p-3 space-y-1">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-zinc-400 hover:text-zinc-200"
          onClick={onOpenSettings}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-zinc-400 hover:text-zinc-200"
          onClick={onLogout}
        >
          <LogOut className="h-4 w-4" />
          <span className="truncate">{username}</span>
        </Button>
      </div>
    </div>
  );
}
