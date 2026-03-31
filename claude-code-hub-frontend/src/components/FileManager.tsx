import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Folder,
  FileText,
  Upload,
  Download,
  ChevronLeft,
  RefreshCw,
  X,
} from "lucide-react";
import { listFiles, uploadFile, getDownloadUrl, type FileEntry } from "@/lib/api";

interface FileManagerProps {
  open: boolean;
  onClose: () => void;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileManager({ open, onClose }: FileManagerProps) {
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = async (path: string = "") => {
    setLoading(true);
    setError("");
    try {
      const data = await listFiles(path);
      setEntries(data.entries);
      setCurrentPath(data.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadFiles(currentPath);
    }
  }, [open]);

  const navigateToDir = (path: string) => {
    loadFiles(path);
  };

  const navigateUp = () => {
    if (currentPath === "." || currentPath === "") {
      return;
    }
    const parent = currentPath.split("/").slice(0, -1).join("/");
    loadFiles(parent || "");
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError("");
    try {
      for (let i = 0; i < files.length; i++) {
        await uploadFile(files[i], currentPath === "." ? "" : currentPath);
      }
      await loadFiles(currentPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDownload = (path: string) => {
    const url = getDownloadUrl(path);
    window.open(url, "_blank");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl w-full max-w-2xl max-h-96 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Folder className="h-4 w-4 text-orange-500" />
            <h3 className="font-semibold text-zinc-100 text-sm">File Manager</h3>
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-zinc-400" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-zinc-400 hover:text-zinc-200"
            onClick={navigateUp}
            disabled={currentPath === "." || currentPath === ""}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-zinc-400 font-mono flex-1 truncate">
            /{currentPath === "." ? "" : currentPath}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-zinc-400 hover:text-zinc-200"
            onClick={() => loadFiles(currentPath)}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="h-3.5 w-3.5 mr-1" />
            {uploading ? "Uploading..." : "Upload"}
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-2 text-xs text-red-400 bg-red-900/20 border-b border-zinc-800">
            {error}
          </div>
        )}

        {/* File list */}
        <ScrollArea className="flex-1">
          <div className="divide-y divide-zinc-800">
            {entries.length === 0 && !loading && (
              <div className="px-4 py-8 text-center text-xs text-zinc-600">
                Empty directory. Upload files to get started.
              </div>
            )}
            {entries.map((entry) => (
              <div
                key={entry.path}
                className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/50 cursor-pointer text-sm"
                onClick={() => entry.is_dir && navigateToDir(entry.path)}
              >
                {entry.is_dir ? (
                  <Folder className="h-4 w-4 text-orange-400 shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 text-zinc-500 shrink-0" />
                )}
                <span className={`flex-1 truncate ${entry.is_dir ? "text-zinc-200" : "text-zinc-400"}`}>
                  {entry.name}
                </span>
                <span className="text-xs text-zinc-600 shrink-0">{formatSize(entry.size)}</span>
                {!entry.is_dir && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-zinc-500 hover:text-zinc-300 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(entry.path);
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
