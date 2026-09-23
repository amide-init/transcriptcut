import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type ApiError = { success: false; error: { code: string; message: string } };

export function SetupRoute() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data: { success: true; hasApiKey: boolean }) => {
        if (!cancelled) {
          setHasApiKey(data.hasApiKey);
          setChecking(false);
        }
      })
      .catch(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    if (!keyDraft.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openaiApiKey: keyDraft.trim() }),
      });
      const data: { success: true } | ApiError = await res.json();
      if (!data.success) {
        setError(data.error.message);
        setSaving(false);
        return;
      }
      navigate("/");
    } catch {
      setError("Could not reach the server. Try again.");
      setSaving(false);
    }
  };

  if (checking) {
    return <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1.5">
          <h1 className="text-xl font-medium">{hasApiKey ? "Replace API key" : "Welcome"}</h1>
          <p className="text-[0.9rem] leading-relaxed text-muted-foreground">
            {hasApiKey
              ? "Enter a new OpenAI API key to replace the one currently configured."
              : "This app uses your own OpenAI API key for transcription and AI features -- it's stored only on this machine, never sent anywhere but OpenAI."}
          </p>
        </div>

        <div className="space-y-3">
          <Input
            type="password"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder="sk-..."
            disabled={saving}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSave();
            }}
          />
          <Button onClick={() => void handleSave()} disabled={saving || !keyDraft.trim()} className="w-full">
            {saving ? "Checking key…" : "Save"}
          </Button>
          {hasApiKey && (
            <Button variant="ghost" onClick={() => navigate("/")} disabled={saving} className="w-full">
              Cancel
            </Button>
          )}
        </div>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <p className="font-mono text-xs text-muted-foreground">
            platform.openai.com/api-keys
          </p>
        )}
      </div>
    </div>
  );
}
