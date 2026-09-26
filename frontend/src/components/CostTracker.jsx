import React, { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useLang } from "@/i18n";
import { AlertTriangle, CheckCircle2, RotateCw, DollarSign, Mic, Image, FileText, Smile, Film } from "lucide-react";

const KIND_META = {
  joke: { icon: Smile, key: "kind_joke", color: "text-primary" },
  script: { icon: FileText, key: "kind_script", color: "text-secondary" },
  image: { icon: Image, key: "kind_image", color: "text-pink-400" },
  tts: { icon: Mic, key: "kind_tts", color: "text-accent" },
  render: { icon: Film, key: "kind_render", color: "text-purple-400" },
};

export const CostTracker = ({ open, onOpenChange }) => {
  const { t } = useLang();
  const [summary, setSummary] = useState(null);
  const [failures, setFailures] = useState([]);

  const load = useCallback(async () => {
    const [s, f] = await Promise.all([
      api.get("/costs/summary").then((r) => r.data),
      api.get("/failures").then((r) => r.data),
    ]);
    setSummary(s);
    setFailures(f);
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const resolve = async (id) => {
    await api.post(`/failures/${id}/resolve`);
    load();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-[#131B2E] border-white/10">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-amber-400" /> {t("ct_title")}
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 text-center">
          <div className="text-xs uppercase tracking-widest text-amber-400/80">{t("ct_total")}</div>
          <div className="font-mono text-4xl font-bold text-amber-400 mt-1" data-testid="cost-total">
            ${summary ? summary.total.toFixed(2) : "0.00"}
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-2">{t("ct_breakdown")}</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(KIND_META).map(([kind, meta]) => {
              const Icon = meta.icon;
              const data = summary?.by_kind?.[kind];
              return (
                <div key={kind} className="rounded-lg border border-white/10 bg-[#1A243B] p-3">
                  <div className={`flex items-center gap-1.5 text-xs ${meta.color}`}>
                    <Icon className="w-3.5 h-3.5" /> {t(meta.key)}
                  </div>
                  <div className="font-mono text-lg font-bold text-white mt-1">
                    ${data ? data.amount.toFixed(2) : "0.00"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{data?.count || 0}×</div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> {t("ct_failures")}
          </h4>
          {failures.length === 0 ? (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> {t("ct_no_failures")}
            </div>
          ) : (
            <div className="space-y-2">
              {failures.map((f) => (
                <div
                  key={f.id}
                  data-testid="failure-log-item"
                  className={`rounded-lg border p-3 flex items-start justify-between gap-3 ${
                    f.resolved ? "border-white/10 bg-white/[0.02] opacity-60" : "border-red-500/20 bg-red-500/5"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-mono font-semibold text-red-400">
                      [{f.service}] {f.endpoint}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">{f.error}</div>
                  </div>
                  {!f.resolved && (
                    <Button
                      data-testid="retry-failed-api-button"
                      size="sm"
                      variant="outline"
                      className="shrink-0 gap-1 h-7 text-xs"
                      onClick={() => resolve(f.id)}
                    >
                      <RotateCw className="w-3 h-3" /> {t("ct_resolve")}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
