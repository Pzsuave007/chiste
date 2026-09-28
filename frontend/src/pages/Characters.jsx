import React, { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Plus, Users, Trash2, RefreshCw, Mic, Loader2, ImageOff, Fingerprint, Star, Upload } from "lucide-react";
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
  const [defaultCharId, setDefaultCharId] = useState(null);
  const [photoAsset, setPhotoAsset] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [cartoonizing, setCartoonizing] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", color: COLORS[0], voice_id: "", voice_name: "", generate_image: true });

  const load = useCallback(() => {
    api.get("/characters").then((r) => setChars(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    api.get("/voices").then((r) => setVoices(r.data)).catch(() => {});
    api.get("/settings").then((r) => setDefaultCharId(r.data?.default_character_id || null)).catch(() => {});
  }, [load]);

  const toggleDefault = async (id) => {
    const next = defaultCharId === id ? null : id;
    setDefaultCharId(next);
    try {
      await api.put("/settings", { default_character_id: next });
      toast.success(next ? t("t_channel_set") : t("t_channel_unset"));
    } catch {
      toast.error(t("t_error"));
    }
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api.post("/characters", {
        ...form,
        reference_image_asset_id: photoAsset,
        generate_image: photoAsset ? false : form.generate_image,
      });
      toast.success(t("t_char_created"));
      setOpen(false);
      setForm({ name: "", description: "", color: COLORS[0], voice_id: "", voice_name: "", generate_image: true });
      setPhotoAsset(null);
      setPhotoFile(null);
      load();
    } catch {
      toast.error(t("t_error"));
    } finally {
      setSaving(false);
    }
  };

  const cartoonize = async (file) => {
    if (!file) return;
    setPhotoFile(file);
    setCartoonizing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (form.name.trim()) fd.append("name", form.name.trim());
      const { data } = await api.post("/characters/cartoonize", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setPhotoAsset(data.asset_id);
      toast.success(t("t_cartoon_ok"));
    } catch {
      toast.error(t("t_cartoon_err"));
    } finally {
      setCartoonizing(false);
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
              <div>
                <Label>{t("char_photo")}</Label>
                <div className="mt-1.5 flex items-center gap-2">
                  <label data-testid="character-photo-upload" className="flex-1 cursor-pointer rounded-lg border border-dashed border-white/15 bg-[#0B0F17] px-3 py-2.5 text-xs text-muted-foreground hover:border-primary/50 transition-colors flex items-center gap-2 truncate">
                    <Upload className="w-4 h-4 shrink-0" /> <span className="truncate">{photoFile ? photoFile.name : t("char_photo_ph")}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => cartoonize(e.target.files?.[0])} />
                  </label>
                  {photoAsset && (
                    <Button data-testid="character-photo-regen" type="button" size="sm" variant="outline" className="h-9 gap-1 shrink-0" onClick={() => cartoonize(photoFile)} disabled={cartoonizing}>
                      {cartoonizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} {t("char_regen")}
                    </Button>
                  )}
                </div>
                {cartoonizing && (
                  <p className="mt-1.5 text-[11px] text-accent flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> {t("char_cartoonizing")}</p>
                )}
                {photoAsset && !cartoonizing && (
                  <div className="mt-2 flex items-center gap-3">
                    <img src={assetUrl(photoAsset)} alt="preview" data-testid="character-photo-preview" className="w-24 h-24 rounded-lg object-cover border border-primary/40" />
                    <p className="text-[11px] text-muted-foreground">{t("char_photo_ok")}</p>
                  </div>
                )}
              </div>
              {!photoAsset && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox data-testid="character-generate-image-checkbox" checked={form.generate_image} onCheckedChange={(v) => setForm({ ...form, generate_image: !!v })} />
                  <span className="text-sm">{t("char_gen_img")}</span>
                </label>
              )}
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
                <button
                  data-testid="channel-character-toggle"
                  onClick={() => toggleDefault(c.id)}
                  title={t("channel_char")}
                  className={`absolute top-2 right-2 w-9 h-9 rounded-full flex items-center justify-center backdrop-blur transition-all hover:scale-110 ${defaultCharId === c.id ? "bg-primary text-white shadow-lg shadow-primary/40" : "bg-black/50 text-white/70 hover:text-white"}`}
                >
                  <Star className="w-4 h-4" fill={defaultCharId === c.id ? "currentColor" : "none"} />
                </button>
                {defaultCharId === c.id && (
                  <div data-testid="channel-character-badge" className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-primary/90 text-white text-[10px] font-semibold px-2 py-1 backdrop-blur">
                    <Star className="w-3 h-3" fill="currentColor" /> {t("channel_char")}
                  </div>
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
                {c.visual_dna && (
                  <details className="mt-2 group/dna" data-testid="character-visual-dna">
                    <summary className="text-[10px] uppercase tracking-wide text-primary/80 cursor-pointer flex items-center gap-1 list-none">
                      <Fingerprint className="w-3 h-3" /> {t("char_dna")}
                    </summary>
                    <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed font-mono bg-[#0B0F17] rounded-lg p-2 border border-white/5">
                      {c.visual_dna}
                    </p>
                  </details>
                )}
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
