import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Plus, Sparkles, Mic, Image as ImageIcon, Film, Trash2, ArrowRight, Clock, Languages } from "lucide-react";
import { api, assetUrl } from "@/lib/api";
import { useLang, TOPICS, DURATIONS } from "@/i18n";
import { StatusPill } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FEATURES = [
  { icon: Sparkles, key: "feat_jokes", color: "text-primary bg-primary/10" },
  { icon: Mic, key: "feat_voices", color: "text-accent bg-accent/10" },
  { icon: ImageIcon, key: "feat_images", color: "text-pink-400 bg-pink-400/10" },
  { icon: Film, key: "feat_render", color: "text-secondary bg-secondary/10" },
];

export default function Home() {
  const { t, lang } = useLang();
  const nav = useNavigate();
  const [projects, setProjects] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", language: lang, topic: "standup", duration: 30, art_style: "comic" });
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api.get("/projects").then((r) => setProjects(r.data)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.title.trim()) return;
    setCreating(true);
    try {
      const { data } = await api.post("/projects", form);
      toast.success(t("t_project_created"));
      nav(`/studio/${data.id}`);
    } catch {
      toast.error(t("t_error"));
    } finally {
      setCreating(false);
    }
  };

  const remove = async (e, id) => {
    e.stopPropagation();
    await api.delete(`/projects/${id}`);
    load();
  };

  return (
    <main className="max-w-[1700px] mx-auto px-4 sm:px-8 py-8">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative rounded-3xl border border-white/10 bg-[#131B2E] overflow-hidden p-8 sm:p-12 grain"
      >
        <div className="relative z-10 max-w-3xl">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-semibold border border-primary/20 mb-5">
            <Sparkles className="w-3.5 h-3.5" /> TikTok · Reels · Shorts · 9:16
          </span>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.05]">
            {t("home_title")}
          </h1>
          <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl">
            {t("home_subtitle")}
          </p>
          <div className="mt-7">
            <NewProjectDialog
              open={open} setOpen={setOpen} form={form} setForm={setForm}
              creating={creating} create={create} lang={lang} t={t}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-10 relative z-10 max-w-3xl">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.key}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.08 }}
                className="rounded-xl border border-white/10 bg-[#1A243B]/60 p-4"
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${f.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="text-sm font-semibold text-white">{t(f.key)}</div>
              </motion.div>
            );
          })}
        </div>
      </motion.section>

      {/* Projects */}
      <section className="mt-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">{t("home_your_projects")}</h2>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 p-14 text-center text-muted-foreground">
            {t("home_empty")}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {projects.map((p) => {
              const cover = p.scenes?.find((s) => s.image_asset_id);
              return (
                <motion.div
                  key={p.id}
                  data-testid="project-card"
                  onClick={() => nav(`/studio/${p.id}`)}
                  whileHover={{ y: -4 }}
                  className="group cursor-pointer rounded-2xl border border-white/10 bg-[#1A243B] overflow-hidden hover:border-primary/40 transition-colors"
                >
                  <div className="aspect-video bg-gradient-to-br from-[#131B2E] to-[#0B0F17] relative overflow-hidden">
                    {cover ? (
                      <img src={assetUrl(cover.image_asset_id)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Film className="w-8 h-8 text-white/20" />
                      </div>
                    )}
                    <div className="absolute top-2 left-2"><StatusPill status={p.status} /></div>
                    <button
                      data-testid="project-delete-button"
                      onClick={(e) => remove(e, p.id)}
                      className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/50 backdrop-blur flex items-center justify-center text-white/70 hover:text-red-400 hover:bg-black/70 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-white truncate">{p.title}</h3>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Languages className="w-3 h-3" />{p.language.toUpperCase()}</span>
                      <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{p.duration}s</span>
                      <span className="inline-flex items-center gap-1"><Film className="w-3 h-3" />{p.scenes?.length || 0}</span>
                    </div>
                    <div className="mt-3 flex items-center text-primary text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                      {t("open")} <ArrowRight className="w-4 h-4 ml-1" />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

const NewProjectDialog = ({ open, setOpen, form, setForm, creating, create, lang, t }) => (
  <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>
      <Button data-testid="new-project-button" size="lg" className="gap-2 rounded-full font-semibold shadow-lg shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-transform">
        <Plus className="w-5 h-5" /> {t("home_new")}
      </Button>
    </DialogTrigger>
    <DialogContent className="bg-[#131B2E] border-white/10">
      <DialogHeader><DialogTitle className="font-display text-2xl">{t("np_title")}</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div>
          <Label>{t("np_name")}</Label>
          <Input
            data-testid="project-title-input"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder={t("np_name_ph")}
            className="mt-1.5 bg-[#0B0F17] border-white/10"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("np_language")}</Label>
            <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v })}>
              <SelectTrigger data-testid="project-language-select" className="mt-1.5 bg-[#0B0F17] border-white/10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="es">Español</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("np_duration")}</Label>
            <Select value={String(form.duration)} onValueChange={(v) => setForm({ ...form, duration: Number(v) })}>
              <SelectTrigger data-testid="project-duration-select" className="mt-1.5 bg-[#0B0F17] border-white/10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DURATIONS.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>{t("np_topic")}</Label>
          <Select value={form.topic} onValueChange={(v) => setForm({ ...form, topic: v })}>
            <SelectTrigger data-testid="project-topic-select" className="mt-1.5 bg-[#0B0F17] border-white/10"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TOPICS.map((tp) => <SelectItem key={tp.id} value={tp.id}>{tp[lang]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t("np_style")}</Label>
          <Select value={form.art_style} onValueChange={(v) => setForm({ ...form, art_style: v })}>
            <SelectTrigger data-testid="project-style-select" className="mt-1.5 bg-[#0B0F17] border-white/10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="comic">{t("style_comic")}</SelectItem>
              <SelectItem value="illustration">{t("style_illustration")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button data-testid="create-project-confirm-button" onClick={create} disabled={creating || !form.title.trim()} className="w-full font-semibold">
          {creating ? t("generating") : t("np_create")}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);
