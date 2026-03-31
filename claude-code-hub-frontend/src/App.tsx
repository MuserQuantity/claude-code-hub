import { useState, useEffect, useCallback } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import LoginPage from "@/pages/LoginPage";
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";
import SettingsPanel from "@/components/SettingsPanel";
import {
  listSessions,
  createSession,
  deleteSession,
  updateSession,
  getMessages,
  type Session,
  type Message,
} from "@/lib/api";

function MainApp() {
  const { user, loading, logout } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const data = await listSessions();
      setSessions(data);
    } catch {
      // ignore
    }
  }, []);

  const loadMessages = useCallback(async (sessionId: string) => {
    try {
      const data = await getMessages(sessionId);
      setMessages(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadSessions();
    }
  }, [user, loadSessions]);

  useEffect(() => {
    if (activeSessionId) {
      loadMessages(activeSessionId);
    } else {
      setMessages([]);
    }
  }, [activeSessionId, loadMessages]);

  // Show settings on first login if no API key
  useEffect(() => {
    if (user && !user.has_api_key) {
      setSettingsOpen(true);
    }
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const handleNewSession = async () => {
    try {
      const session = await createSession();
      await loadSessions();
      setActiveSessionId(session.id);
    } catch {
      // ignore
    }
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await deleteSession(id);
      if (activeSessionId === id) {
        setActiveSessionId(null);
        setMessages([]);
      }
      await loadSessions();
    } catch {
      // ignore
    }
  };

  const handleRenameSession = async (id: string, title: string) => {
    try {
      await updateSession(id, title);
      await loadSessions();
    } catch {
      // ignore
    }
  };

  const handleMessageSent = () => {
    if (activeSessionId) {
      loadMessages(activeSessionId);
      loadSessions();
    }
  };

  return (
    <div className="h-screen flex bg-zinc-950 text-zinc-100">
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        onOpenSettings={() => setSettingsOpen(true)}
        onLogout={logout}
        username={user.display_name || user.username}
      />
      <ChatArea
        sessionId={activeSessionId}
        messages={messages}
        onMessageSent={handleMessageSent}
        hasApiKey={user.has_api_key}
      />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
