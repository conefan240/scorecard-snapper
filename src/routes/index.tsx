import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { scanScorecard } from "@/lib/scan-scorecard.functions";
import { suggestCourses, type CourseSuggestion } from "@/lib/suggest-courses.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Camera, Plus, Loader2, Flag, Save, Trash2, Upload, Moon, Sun } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fairway — Golf Scorecard" },
      { name: "description", content: "Track your golf rounds and auto-fill scores by snapping a photo of your scorecard." },
      { property: "og:title", content: "Fairway — Golf Scorecard" },
      { property: "og:description", content: "Track your golf rounds and auto-fill scores by snapping a photo of your scorecard." },
    ],
  }),
  component: Index,
});

type Round = {
  id: string;
  holes: 9 | 18;
  courseName: string;
  startedAt: number;
  savedAt?: number;
  pars: (number | null)[];
  scores: (number | null)[];
};

const STORAGE_KEY = "fairway.round.v1";
const SAVED_KEY = "fairway.saved.v1";

function emptyRound(holes: 9 | 18): Round {
  return {
    id: crypto.randomUUID(),
    holes,
    courseName: "",
    startedAt: Date.now(),
    pars: Array(holes).fill(null),
    scores: Array(holes).fill(null),
  };
}

function Index() {
  const [round, setRound] = useState<Round | null>(null);
  const [saved, setSaved] = useState<Round[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanPromptForId, setScanPromptForId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dark, setDark] = useState(false);
  const showScanPrompt = !!round && scanPromptForId === round.id;

  // Init dark mode from storage / system
  useEffect(() => {
    const stored = localStorage.getItem("fairway.theme");
    const prefers = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const enable = stored ? stored === "dark" : !!prefers;
    setDark(enable);
    document.documentElement.classList.toggle("dark", enable);
  }, []);

  function toggleDark() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("fairway.theme", next ? "dark" : "light");
  }

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setRound(JSON.parse(raw));
      const savedRaw = localStorage.getItem(SAVED_KEY);
      if (savedRaw) setSaved(JSON.parse(savedRaw));
    } catch {}
  }, []);

  // Persist
  useEffect(() => {
    if (round) localStorage.setItem(STORAGE_KEY, JSON.stringify(round));
    else localStorage.removeItem(STORAGE_KEY);
  }, [round]);

  useEffect(() => {
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  }, [saved]);

  function saveRound() {
    if (!round) return;
    const toSave: Round = { ...round, savedAt: Date.now() };
    setSaved((prev) => [toSave, ...prev.filter((r) => r.id !== toSave.id)]);
    setRound(null);
    toast.success("Round saved");
  }

  function deleteSaved(id: string) {
    setSaved((prev) => prev.filter((r) => r.id !== id));
  }

  function openSaved(r: Round) {
    setRound(r);
  }

  const totals = useMemo(() => {
    if (!round) return { score: 0, par: 0, diff: 0, played: 0 };
    const score = round.scores.reduce<number>((a, b) => a + (b ?? 0), 0);
    const par = round.pars.reduce<number>((a, b) => a + (b ?? 0), 0);
    const played = round.scores.filter((s) => s != null).length;
    return { score, par, diff: score - par, played };
  }, [round]);

  function startRound(holes: 9 | 18, courseName = "", pars?: (number | null)[]) {
    const r = emptyRound(holes);
    r.courseName = courseName;
    if (pars && pars.length === holes) r.pars = pars.slice();
    setRound(r);
    setShowNew(false);
  }

  function updateScore(i: number, v: string) {
    if (!round) return;
    const n = v === "" ? null : Math.max(1, Math.min(20, parseInt(v, 10) || 0));
    const next = [...round.scores];
    next[i] = n;
    setRound({ ...round, scores: next });
  }
  function updatePar(i: number, v: string) {
    if (!round) return;
    const n = v === "" ? null : Math.max(3, Math.min(6, parseInt(v, 10) || 0));
    const next = [...round.pars];
    next[i] = n;
    setRound({ ...round, pars: next });
  }

  async function handleFile(file: File) {
    if (!round) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Image too large (max 8MB)");
      return;
    }
    setScanning(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error("read failed"));
        r.readAsDataURL(file);
      });
      const result = await scanScorecard({ data: { imageDataUrl: dataUrl, holes: round.holes } });
      setRound({
        ...round,
        courseName: result.courseName || round.courseName,
        pars: result.pars?.map((p, i) => p ?? round.pars[i]) ?? round.pars,
        scores: result.scores.map((s, i) => s ?? round.scores[i]),
      });
      toast.success("Scorecard scanned");
    } catch (e: any) {
      toast.error(e?.message || "Scan failed");
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-center" />
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Flag className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Fairway</h1>
              <p className="text-xs text-muted-foreground">Golf scorecard tracker</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleDark}
              aria-label="Toggle dark mode"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button onClick={() => setShowNew(true)} size="sm">
              <Plus className="mr-1 h-4 w-4" /> New round
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {!round ? (
          <Card className="flex flex-col items-center justify-center gap-4 p-10 text-center">
            <Flag className="h-12 w-12 text-muted-foreground" />
            <div>
              <h2 className="text-xl font-semibold">No round in progress</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Start a new round to begin tracking your scores.
              </p>
            </div>
            <Button onClick={() => setShowNew(true)}>
              <Plus className="mr-1 h-4 w-4" /> Start new round
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card className="p-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[180px]">
                  <label className="text-xs font-medium text-muted-foreground">Course</label>
                  <Input
                    value={round.courseName}
                    onChange={(e) => setRound({ ...round, courseName: e.target.value })}
                    placeholder="Course name"
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <Stat label="Holes" value={`${totals.played}/${round.holes}`} />
                  <Stat label="Score" value={totals.score || "—"} />
                  <Stat
                    label="vs Par"
                    value={totals.par ? (totals.diff > 0 ? `+${totals.diff}` : `${totals.diff}`) : "—"}
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
                <Button
                  variant="default"
                  onClick={() => cameraRef.current?.click()}
                  disabled={scanning}
                >
                  {scanning ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning…
                    </>
                  ) : (
                    <>
                      <Camera className="mr-2 h-4 w-4" /> Take photo
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={scanning}
                >
                  <Upload className="mr-2 h-4 w-4" /> Upload image
                </Button>
                <Button variant="secondary" onClick={saveRound}>
                  <Save className="mr-2 h-4 w-4" /> Save round
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (confirm("Clear all scores for this round?")) {
                      setRound({
                        ...round,
                        scores: Array(round.holes).fill(null),
                      });
                    }
                  }}
                >
                  Clear scores
                </Button>
              </div>
            </Card>

            <ScorecardTable round={round} updateScore={updateScore} updatePar={updatePar} />
          </div>
        )}

        {saved.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Saved rounds
            </h2>
            <div className="space-y-2">
              {saved.map((r) => {
                const score = r.scores.reduce<number>((a, b) => a + (b ?? 0), 0);
                const par = r.pars.reduce<number>((a, b) => a + (b ?? 0), 0);
                const diff = score - par;
                const date = new Date(r.savedAt ?? r.startedAt);
                const dateStr = date.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });
                return (
                  <Card
                    key={r.id}
                    className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-accent/40"
                  >
                    <button
                      onClick={() => openSaved(r)}
                      className="flex flex-1 items-center gap-3 text-left"
                    >
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
                        {r.holes}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          {r.courseName || "Unnamed course"}
                        </div>
                        <div className="text-xs text-muted-foreground">{dateStr}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-base font-semibold tabular-nums">{score || "—"}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {par ? (diff > 0 ? `+${diff}` : diff === 0 ? "E" : `${diff}`) : "—"}
                        </div>
                      </div>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm("Delete this saved round?")) deleteSaved(r.id);
                      }}
                      aria-label="Delete round"
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </Card>
                );
              })}
            </div>
          </section>
        )}
      </main>


      <NewRoundDialog
        open={showNew}
        onOpenChange={setShowNew}
        hasCurrentRound={!!round}
        onStart={startRound}
      />
    </div>
  );
}

function NewRoundDialog({
  open,
  onOpenChange,
  hasCurrentRound,
  onStart,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  hasCurrentRound: boolean;
  onStart: (holes: 9 | 18, courseName?: string, pars?: (number | null)[]) => void;
}) {
  const [holes, setHoles] = useState<9 | 18>(18);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<CourseSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<CourseSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  // Reset when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setPicked(null);
      setSuggestions([]);
      setHoles(18);
    }
  }, [open]);

  // Debounced suggestions
  useEffect(() => {
    if (picked && picked.name === query) return;
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await suggestCourses({ data: { query: q, holes } });
        if (!cancelled) setSuggestions(res.suggestions);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, holes, picked]);

  function pick(s: CourseSuggestion) {
    setPicked(s);
    setQuery(s.name);
    setSuggestions([]);
  }

  function handleStart() {
    onStart(holes, picked?.name || query.trim(), picked?.pars);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start new round</DialogTitle>
          <DialogDescription>
            Pick your course and how many holes you're playing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Course</label>
            <div className="relative mt-1">
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPicked(null);
                }}
                placeholder="Start typing a course name…"
                autoFocus
              />
              {(loading || suggestions.length > 0) && !picked && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover shadow-md">
                  {loading && (
                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Searching courses…
                    </div>
                  )}
                  {suggestions.map((s, i) => {
                    const parSum = s.pars.reduce<number>((a, b) => a + (b ?? 0), 0);
                    return (
                      <button
                        key={i}
                        onClick={() => pick(s)}
                        className="flex w-full items-center justify-between gap-2 border-t px-3 py-2 text-left text-sm first:border-t-0 hover:bg-accent"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{s.name}</div>
                          {s.location && (
                            <div className="truncate text-xs text-muted-foreground">
                              {s.location}
                            </div>
                          )}
                        </div>
                        {parSum > 0 && (
                          <div className="text-xs text-muted-foreground tabular-nums">
                            Par {parSum}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {picked && (
              <p className="mt-1 text-xs text-muted-foreground">
                Pars preloaded from {picked.name}. You can edit them on the scorecard.
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Holes</label>
            <div className="mt-1 grid grid-cols-2 gap-3">
              {[9, 18].map((h) => (
                <button
                  key={h}
                  onClick={() => setHoles(h as 9 | 18)}
                  className={`rounded-lg border-2 p-4 text-center transition-colors ${
                    holes === h
                      ? "border-primary bg-accent"
                      : "border-border bg-card hover:border-primary/50"
                  }`}
                >
                  <div className="text-2xl font-bold">{h}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">holes</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {hasCurrentRound ? (
            <p className="text-xs text-muted-foreground">
              Starting a new round will replace your current round.
            </p>
          ) : (
            <span />
          )}
          <Button onClick={handleStart}>Start round</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md bg-muted px-3 py-2 min-w-[64px]">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ScorecardTable({
  round,
  updateScore,
  updatePar,
}: {
  round: Round;
  updateScore: (i: number, v: string) => void;
  updatePar: (i: number, v: string) => void;
}) {
  const groups: number[][] = round.holes === 9 ? [[...Array(9).keys()]] : [[...Array(9).keys()], [...Array(9).keys()].map((i) => i + 9)];

  return (
    <div className="space-y-4">
      {groups.map((idxs, gi) => {
        const parSum = idxs.reduce((a, i) => a + (round.pars[i] ?? 0), 0);
        const scoreSum = idxs.reduce((a, i) => a + (round.scores[i] ?? 0), 0);
        const label = round.holes === 9 ? "Holes" : gi === 0 ? "Front 9" : "Back 9";
        return (
          <Card key={gi} className="overflow-hidden">
            <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
              <h3 className="text-sm font-semibold">{label}</h3>
              <div className="text-xs text-muted-foreground">
                Par {parSum || "—"} · Score {scoreSum || "—"}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 text-muted-foreground">
                    <th className="px-3 py-2 text-left text-xs font-medium">Hole</th>
                    {idxs.map((i) => (
                      <th key={i} className="px-1 py-2 text-center text-xs font-medium w-12">
                        {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t">
                    <td className="px-3 py-2 text-xs font-medium text-muted-foreground">Par</td>
                    {idxs.map((i) => (
                      <td key={i} className="p-1">
                        <input
                          inputMode="numeric"
                          value={round.pars[i] ?? ""}
                          onChange={(e) => updatePar(i, e.target.value)}
                          className="h-9 w-full rounded-sm border border-input bg-background text-center text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t">
                    <td className="px-3 py-2 text-xs font-medium">Score</td>
                    {idxs.map((i) => {
                      const s = round.scores[i];
                      const p = round.pars[i];
                      const diff = s != null && p != null ? s - p : null;
                      const tone =
                        diff == null
                          ? ""
                          : diff < 0
                          ? "ring-2 ring-emerald-500/60"
                          : diff === 0
                          ? ""
                          : diff === 1
                          ? "ring-1 ring-amber-500/50"
                          : "ring-2 ring-rose-500/50";
                      return (
                        <td key={i} className="p-1">
                          <input
                            inputMode="numeric"
                            value={s ?? ""}
                            onChange={(e) => updateScore(i, e.target.value)}
                            className={`h-10 w-full rounded-sm border border-input bg-background text-center text-base font-semibold tabular-nums focus:outline-none focus:ring-1 focus:ring-ring ${tone}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
