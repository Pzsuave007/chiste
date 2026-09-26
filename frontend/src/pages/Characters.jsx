import React, { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Plus, Users, Trash2, RefreshCw, Mic, Loader2, ImageOff } from "lucide-react";
import { api, assetUrl } from "@/lib/api";
import { useLang } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const COLORS = ["#FF5A36", "#6366F1", "#10B981", "#F59E0B", "#EC4899", "#38BDF8", "#A855F7", "#F43F5E"];

export default function Characters() {
  const { t } = useLang();
  const [chars, setChars] = useState([]);
  const [voices, setVoices] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenId, setRegenId] = useState(null);
  const [form, setForm] = useState({ name: "", description: "", color: COLORS[0], voice_id: "", voice_name: "", generate_image: true });

  const load = useCallback(() => {
    api.get("/characters").then((r) => setChars(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    api.get("/voices").then((r) => setVoices(r.data)).catch(() => {});
  }, [load]);

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api.post("/characters", form);
      toast.success(t("t_char_created"));
      setOpen(false);
      setForm({ name: "", description: "", color: COLORS[0], voice_id: "", voice_name: "", generate_image: true });
      load();
    } catch {
      toast.error(t("t_error"));
    } finally {
      setSaving(false);
    }
  };

  const regen = async (id) => {
    setRegenId(id);
    try {
      await api.post(`/characters/${id}/generate-image`);
      toast.success(t("t_image_ok"));
      load();
    } catch {
      toast.error(t("t_error"));
    } finally {
      setRegenId(null);
    }
  };

  const remove = async (id) => {
    await api.delete(`/characters/${id}`);
    load();
  };

  const pickVoice = (vid) => {
    const v = voices.find((x) => x.voice_id === vid);
    setForm({ ...form, voice_id: vid, voice_name: v?.name || "" });
  };

  return (
    <main className="max-w-[1700px] mx-auto px-4 sm:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-white flex items-center gap-3">
            <Users className="w-8 h-8 text-primary" /> {t("char_title")}
          </h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">{t("char_subtitle")}</p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="new-character-button" size="lg" className="gap-2 rounded-full font-semibold shadow-lg shadow-primary/30">
              <Plus className="w-5 h-5" /> {t("char_new")}
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#131B2E] border-white/10 max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="font-display text-2xl">{t("char_new")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t("char_name")}</Label>
                <Input data-testid="character-name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("char_name_ph")} className="mt-1.5 bg-[#0B0F17] border-white/10" />
              </div>
              <div>
                <Label>{t("char_desc")}</Label>
                <Textarea data-testid="character-description-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t("char_desc_ph")} rows={3} className="mt-1.5 bg-[#0B0F17] border-white/10" />
              </div>
              <div>
                <Label>{t("char_color")}</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      data-testid={`character-color-${c}`}
                      onClick={() => setForm({ ...form, color: c })}
                      className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${form.color === c ? "border-white scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <Label>{t("char_voice")}</Label>
                <Select value={form.voice_id} onValueChange={pickVoice}>
                  <SelectTrigger data-testid="character-voice-select" className="mt-1.5 bg-[#0B0F17] border-white/10"><SelectValue placeholder={t("no_voice")} /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {voices.map((v) => <SelectItem key={v.voice_id} value={v.voice_id}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox data-testid="character-generate-image-checkbox" checked={form.generate_image} onCheckedChange={(v) => setForm({ ...form, generate_image: !!v })} />
                <span className="text-sm">{t("char_gen_img")}</span>
              </label>
              <Button data-testid="save-character-button" onClick={save} disabled={saving || !form.name.trim()} className="w-full font-semibold">
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("generating")}</> : t("char_save")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {chars.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 p-14 text-center text-muted-foreground">{t("char_empty")}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {chars.map((c, i) => (
            <motion.div
              key={c.id}
              data-testid="character-card"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-2xl border border-white/10 bg-[#1A243B] overflow-hidden"
              style={{ borderTopColor: c.color, borderTopWidth: 3 }}
            >
              <div className="aspect-square bg-gradient-to-br from-[#131B2E] to-[#0B0F17] relative">
                {c.reference_image_asset_id ? (
                  <img src={assetUrl(c.reference_image_asset_id)} alt={c.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/20"><ImageOff className="w-8 h-8" /></div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color }} />
                  <h3 className="font-semibold text-white truncate">{c.name}</h3>
                </div>
                {c.voice_name && (
                  <div className="mt-1.5 inline-flex items-center gap-1 text-xs text-accent">
                    <Mic className="w-3 h-3" /> {c.voice_name}
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">{c.description}</p>
                <div className="flex gap-2 mt-3">
                  <Button data-testid="character-regen-image-button" size="sm" variant="outline" className="flex-1 gap-1 h-8 text-xs" onClick={() => regen(c.id)} disabled={regenId === c.id}>
                    {regenId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} {t("char_regen")}
                  </Button>
                  <Button data-testid="character-delete-button" size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-red-400" onClick={() => remove(c.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </main>
  );
}
