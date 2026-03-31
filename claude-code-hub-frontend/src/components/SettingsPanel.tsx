import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { X, Save, Key, Bot, Globe, FileText } from "lucide-react";
import { updateMe } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { user, refreshUser } = useAuth();
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user) {
      setBaseUrl(user.base_url || "");
      setModel(user.model || "claude-sonnet-4-20250514");
      setSystemPrompt(user.system_prompt || "");
      setDisplayName(user.display_name || "");
      setApiKey("");
    }
  }, [user]);

  if (!open) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const data: Record<string, string> = {};
      if (apiKey) data.api_key = apiKey;
      if (baseUrl !== (user?.base_url || "")) data.base_url = baseUrl;
      if (model !== user?.model) data.model = model;
      if (systemPrompt !== user?.system_prompt) data.system_prompt = systemPrompt;
      if (displayName !== user?.display_name) data.display_name = displayName;

      if (Object.keys(data).length > 0) {
        await updateMe(data);
        await refreshUser();
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // handle error silently
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg w-full max-w-lg max-h-screen overflow-auto">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-100">Settings</h2>
          <Button size="icon" variant="ghost" onClick={onClose} className="text-zinc-400 hover:text-zinc-200">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 space-y-5">
          {/* Display Name */}
          <div className="space-y-2">
            <Label className="text-zinc-300 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Display Name
            </Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your display name"
              className="bg-zinc-800 border-zinc-700 text-zinc-100"
            />
          </div>

          <Separator className="bg-zinc-800" />

          {/* Base URL */}
          <div className="space-y-2">
            <Label className="text-zinc-300 flex items-center gap-2">
              <Globe className="h-4 w-4" />
              API Base URL
            </Label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.anthropic.com (default)"
              className="bg-zinc-800 border-zinc-700 text-zinc-100"
            />
            <p className="text-xs text-zinc-500">
              Custom API endpoint. Leave empty for default Anthropic API. Supports OpenAI-compatible endpoints.
            </p>
          </div>

          <Separator className="bg-zinc-800" />

          {/* API Key */}
          <div className="space-y-2">
            <Label className="text-zinc-300 flex items-center gap-2">
              <Key className="h-4 w-4" />
              API Key
            </Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={user?.has_api_key ? "••••••••• (already set, enter to change)" : "Enter your API key"}
              className="bg-zinc-800 border-zinc-700 text-zinc-100"
            />
            <p className="text-xs text-zinc-500">
              Your API key is stored securely and never exposed.
            </p>
          </div>

          <Separator className="bg-zinc-800" />

          {/* Model */}
          <div className="space-y-2">
            <Label className="text-zinc-300 flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Model Name
            </Label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="claude-sonnet-4-20250514"
              className="bg-zinc-800 border-zinc-700 text-zinc-100"
            />
            <p className="text-xs text-zinc-500">
              The model identifier to use. Examples: claude-sonnet-4-20250514, gpt-4o, deepseek-chat
            </p>
          </div>

          <Separator className="bg-zinc-800" />

          {/* System Prompt */}
          <div className="space-y-2">
            <Label className="text-zinc-300">System Prompt (optional)</Label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Custom instructions for Claude..."
              className="bg-zinc-800 border-zinc-700 text-zinc-100 min-h-24"
              rows={4}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-zinc-800">
          <Button variant="ghost" onClick={onClose} className="text-zinc-400">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="bg-orange-600 hover:bg-orange-700 text-white gap-2"
            disabled={saving}
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
          </Button>
        </div>
      </div>
    </div>
  );
}
