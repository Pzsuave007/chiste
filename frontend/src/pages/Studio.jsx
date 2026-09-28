import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  ArrowLeft, Sparkles, Loader2, Wand2, Image as ImageIcon, Mic, RefreshCw,
  Check, Film, Download, PlayCircle, Plus, Trash2, ClipboardList, Rocket, CheckCircle2, Circle, Volume2, Music,
} from "lucide-react";
import { api, assetUrl } from "@/lib/api";
import { useLang, TOPICS, DURATIONS, CAMERA_MOTIONS, SFX } from "@/i18n";
import { StatusPill } from "@/components/Header";
import { VideoPreview } from "@/components/VideoPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const emptyScene = (index) => ({
  index, character_name: "", character_id: null, dialogue: "", is_narration: false,
  camera_motion: "zoom_in", sfx: "none", image_prompt: "", image_asset_id: null,
  audio_asset_id: null, voice_id: null, approved: false,
});

export default function Studio() {
  const { id } = useParams();
  const nav = useNavigate();
  const { t, lang } = useLang();

  const [project, setProject] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [voices, setVoices] = useState([]);
  const [tab, setTab] = useState("joke");
  const [scenes, setScenes] = useState([]);
  const [joke, setJoke] = useState("");
  const [defaultVoice, setDefaultVoice] = useState("");
  const [musicVolume, setMusicVolume] = useState(20);
  const [laughIntensity, setLaughIntensity] = useState("medium");
  const [hasMusic, setHasMusic] = useState(false);
  const [uploadingMusic, setUploadingMusic] = useState(false);
  const [musicAssetId, setMusicAssetId] = useState(null);
  const [musicPreset, setMusicPreset] = useState("");
  const [musicLibrary, setMusicLibrary] = useState([]);
  const [loadingPreset, setLoadingPreset] = useState(false);
  const [jokeForm, setJokeForm] = useState({ topic: "standup", duration: 30, custom_joke: "" });
  const [channelCharId, setChannelCharId] = useState("__ai__");
  const [selected, setSelected] = useState(0);

  const [busy, setBusy] = useState({ joke: false, script: false, all: false, render: false });
  const [genImg, setGenImg] = useState(null);
  const [genAud, setGenAud] = useState(null);
  const [progress, setProgress] = useState(0);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    const { data } = await api.get(`/projects/${id}`);
    setProject(data);
    setScenes(data.scenes || []);
    setJoke(data.joke || "");
    setDefaultVoice(data.default_voice_id || "");
    setMusicVolume(data.music_volume ?? 20);
    setLaughIntensity(data.laugh_intensity || "medium");
    setHasMusic(!!data.music_asset_id);
    setMusicAssetId(data.music_asset_id || null);
    setMusicPreset(data.music_preset || "");
    setJokeForm((f) => ({ ...f, topic: data.topic, duration: data.duration }));
    if (data.scenes?.length) setTab(data.status === "draft" ? "joke" : "script");
  }, [id]);

  useEffect(() => {
    load();
    api.get("/characters").then((r) => setCharacters(r.data)).catch(() => {});
    api.get("/voices").then((r) => setVoices(r.data)).catch(() => {});
    api.get("/music/library").then((r) => setMusicLibrary(r.data)).catch(() => {});
    api.get("/settings").then((r) => {
      if (r.data?.default_character_id) setChannelCharId(r.data.default_character_id);
    }).catch(() => {});
    return () => clearInterval(pollRef.current);
  }, [load]);

  const patchProject = async (patch) => {
    const { data } = await api.put(`/projects/${id}`, patch);
    setProject(data);
    return data;
  };

  const changeDefaultVoice = (v) => {
    setDefaultVoice(v);
    patchProject({ default_voice_id: v });
  };

  const changeLaugh = (v) => {
    setLaughIntensity(v);
    patchProject({ laugh_intensity: v });
  };

  const commitMusicVolume = (v) => patchProject({ music_volume: v });

  const chooseMusicPreset = async (pid) => {
    setLoadingPreset(true);
    try {
      const { data } = await api.post(`/projects/${id}/music/preset`, { preset_id: pid });
      setMusicAssetId(data.music_asset_id);
      setMusicPreset(pid);
      setHasMusic(true);
      toast.success(t("music_added"));
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("t_error"));
    } finally {
      setLoadingPreset(false);
    }
  };

  const uploadMusic = async (file) => {
    if (!file) return;
    setUploadingMusic(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post(`/projects/${id}/music`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setMusicAssetId(data.music_asset_id);
      setMusicPreset("");
      setHasMusic(true);
      toast.success(t("music_added"));
    } catch {
      toast.error(t("t_error"));
    } finally {
      setUploadingMusic(false);
    }
  };

  const removeMusic = async () => {
    await api.delete(`/projects/${id}/music`);
    setHasMusic(false);
    setMusicAssetId(null);
    setMusicPreset("");
  };

  const saveScenes = async (newScenes) => {
    setScenes(newScenes);
    await patchProject({ scenes: newScenes });
  };

  // ---------- Joke ----------
  const generateJoke = async () => {
    setBusy((b) => ({ ...b, joke: true }));
    try {
      const { data } = await api.post("/jokes/generate", {
        topic: jokeForm.topic, language: project.language, duration: jokeForm.duration,
        custom_joke: jokeForm.custom_joke || null,
      });
      setJoke(data.joke);
      toast.success(t("t_joke_ok"));
    } catch {
      toast.error(t("t_error"));
    } finally {
      setBusy((b) => ({ ...b, joke: false }));
    }
  };

  const buildStoryboard = async () => {
    if (!joke.trim()) { toast.error(t("t_need_joke")); return; }
    setBusy((b) => ({ ...b, script: true }));
    try {
      await patchProject({ joke });
      const chosen = characters.find((c) => c.id === channelCharId);
      const charPayload = chosen
        ? { name: chosen.name, description: chosen.visual_dna || chosen.description }
        : null;
      const { data } = await api.post("/scripts/generate", {
        joke, language: project.language, duration: jokeForm.duration,
        topic: jokeForm.topic,
        characters: characters.map((c) => ({ name: c.name, description: c.description })),
        comedian: jokeForm.topic === "standup" ? charPayload : null,
        protagonist: jokeForm.topic !== "standup" ? charPayload : null,
      });
      // attach character voices by name match
      const enriched = data.scenes.map((s, i) => {
        const match = characters.find((c) => c.name.toLowerCase() === (s.character_name || "").toLowerCase());
        return { ...emptyScene(i), ...s, index: i, character_id: match?.id || null, voice_id: match?.voice_id || null };
      });
      await api.put(`/projects/${id}`, { scenes: enriched, status: "scripted" });
      setScenes(enriched);
      setProject((p) => ({ ...p, status: "scripted" }));
      setSelected(0);
      setTab("script");
      toast.success(t("t_script_ok"));
    } catch {
      toast.error(t("t_error"));
    } finally {
      setBusy((b) => ({ ...b, script: false }));
    }
  };

  // ---------- Scene editing ----------
  const updateScene = (index, patch) => {
    setScenes((prev) => prev.map((s) => {
      if (s.index !== index) return s;
      const ns = { ...s, ...patch };
      // editing the dialogue invalidates the old voice so it re-syncs on the next export
      if ("dialogue" in patch && patch.dialogue !== s.dialogue) ns.audio_asset_id = null;
      return ns;
    }));
  };

  const resetExport = async () => {
    const { data } = await api.post(`/projects/${id}/reset-export`);
    setProject(data);
    setScenes(data.scenes || []);
    setTab("export");
    toast.success(t("re_edit_done"));
  };

  const assignCharacter = (index, name) => {
    const match = characters.find((c) => c.name === name);
    updateScene(index, { character_name: name, character_id: match?.id || null, voice_id: match?.voice_id || scenes.find(s=>s.index===index)?.voice_id || null });
  };

  const addScene = async () => {
    const ns = [...scenes, emptyScene(scenes.length)];
    await saveScenes(ns);
    setSelected(ns.length - 1);
  };

  const removeScene = async (index) => {
    const ns = scenes.filter((s) => s.index !== index).map((s, i) => ({ ...s, index: i }));
    await saveScenes(ns);
    setSelected(0);
  };

  const generateImage = async (index) => {
    setGenImg(index);
    try {
      await saveScenes(scenes);
      const scene = scenes.find((s) => s.index === index);
      const { data } = await api.post(`/projects/${id}/scenes/${index}/generate-image`, {
        scene, characters: characters.map((c) => ({ name: c.name, description: c.description })), language: project.language,
      });
      updateScene(index, { image_asset_id: data.asset_id });
      toast.success(t("t_image_ok"));
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("t_error"));
    } finally {
      setGenImg(null);
    }
  };

  const generateAudio = async (index) => {
    setGenAud(index);
    try {
      await saveScenes(scenes);
      const scene = scenes.find((s) => s.index === index);
      const { data } = await api.post(`/projects/${id}/scenes/${index}/generate-audio`, {
        scene, characters: characters.map((c) => ({ name: c.name, voice_id: c.voice_id })), language: project.language,
      });
      updateScene(index, { audio_asset_id: data.asset_id });
      toast.success(t("t_audio_ok"));
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("t_error"));
    } finally {
      setGenAud(null);
    }
  };

  // ---------- Generate all + render ----------
  const generateAll = async () => {
    setBusy((b) => ({ ...b, all: true }));
    setProgress(0);
    try {
      await saveScenes(scenes);
      let current = [...scenes];
      const steps = current.length;
      for (let i = 0; i < current.length; i++) {
        const idx = current[i].index;
        if (!current[i].image_asset_id) {
          const { data } = await api.post(`/projects/${id}/scenes/${idx}/generate-image`, {
            scene: current[i], characters: characters.map((c) => ({ name: c.name, description: c.description })), language: project.language,
          });
          current[i] = { ...current[i], image_asset_id: data.asset_id };
          setScenes([...current]);
        }
        const vid = current[i].voice_id || characters.find((c) => c.name === current[i].character_name)?.voice_id;
        if (!current[i].audio_asset_id && current[i].dialogue && vid) {
          try {
            const { data } = await api.post(`/projects/${id}/scenes/${idx}/generate-audio`, {
              scene: { ...current[i], voice_id: vid }, characters: characters.map((c) => ({ name: c.name, voice_id: c.voice_id })), language: project.language,
            });
            current[i] = { ...current[i], audio_asset_id: data.asset_id, voice_id: vid };
            setScenes([...current]);
          } catch { /* keep going */ }
        }
        setProgress(Math.round(((i + 1) / steps) * 100));
      }
      toast.success(t("t_image_ok"));
    } catch {
      toast.error(t("t_error"));
    } finally {
      setBusy((b) => ({ ...b, all: false }));
    }
  };

  const approveAll = () => {
    const ns = scenes.map((s) => (s.image_asset_id ? { ...s, approved: true } : s));
    saveScenes(ns);
  };

  const startRender = async () => {
    setBusy((b) => ({ ...b, render: true }));
    try {
      await saveScenes(scenes);
      await api.post(`/projects/${id}/render`);
      setProject((p) => ({ ...p, status: "rendering", video_url: null }));
      toast.success(t("t_render_started"));
      pollRef.current = setInterval(async () => {
        const { data } = await api.get(`/projects/${id}/render-status`);
        if (data.status === "completed" || data.status === "failed") {
          clearInterval(pollRef.current);
          setProject((p) => ({ ...p, status: data.status, video_url: data.video_url }));
          setBusy((b) => ({ ...b, render: false }));
          if (data.status === "completed") toast.success(t("render_done"));
          else toast.error(t("t_error"));
        }
      }, 3000);
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("t_error"));
      setBusy((b) => ({ ...b, render: false }));
    }
  };

  if (!project) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const scene = scenes.find((s) => s.index === selected) || scenes[0];
  const imagesReady = scenes.length > 0 && scenes.every((s) => s.image_asset_id);
  const allApproved = scenes.length > 0 && scenes.every((s) => s.image_asset_id && s.approved);
  const audioReady = scenes.length > 0 && scenes.filter((s) => s.dialogue).every((s) => s.audio_asset_id);
  const imgCount = scenes.filter((s) => s.image_asset_id).length;
  const estCost = (scenes.filter((s) => !s.image_asset_id).length * 0.04) +
    (scenes.filter((s) => !s.audio_asset_id).reduce((a, s) => a + (s.dialogue?.length || 0), 0) * 0.00018);

  return (
    <main className="max-w-[1700px] mx-auto px-4 sm:px-8 py-6">
      {/* header row */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => nav("/")} className="gap-1.5" data-testid="studio-back-button">
          <ArrowLeft className="w-4 h-4" /> {t("back")}
        </Button>
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-white truncate">{project.title}</h1>
          <StatusPill status={project.status} />
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground font-mono">
          {project.language.toUpperCase()} · {project.duration}s
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-[#131B2E] border border-white/10 mb-6">
          <TabsTrigger value="joke" data-testid="tab-joke">{t("tab_joke")}</TabsTrigger>
          <TabsTrigger value="script" data-testid="tab-script" disabled={scenes.length === 0}>{t("tab_script")}</TabsTrigger>
          <TabsTrigger value="export" data-testid="tab-export" disabled={scenes.length === 0}>{t("tab_export")}</TabsTrigger>
        </TabsList>

        {/* ---------------- JOKE ---------------- */}
        <TabsContent value="joke">
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="rounded-2xl border border-white/10 bg-[#131B2E] p-6 sm:p-8 space-y-5">
              <h2 className="font-display text-2xl font-bold text-white flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-primary" /> {t("joke_generate")}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>{t("joke_topic")}</Label>
                  <Select value={jokeForm.topic} onValueChange={(v) => setJokeForm({ ...jokeForm, topic: v })}>
                    <SelectTrigger data-testid="joke-topic-select" className="mt-1.5 bg-[#0B0F17] border-white/10"><SelectValue /></SelectTrigger>
                    <SelectContent>{TOPICS.map((tp) => <SelectItem key={tp.id} value={tp.id}>{tp[lang]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("joke_duration")}</Label>
                  <Select value={String(jokeForm.duration)} onValueChange={(v) => setJokeForm({ ...jokeForm, duration: Number(v) })}>
                    <SelectTrigger data-testid="joke-duration-select" className="mt-1.5 bg-[#0B0F17] border-white/10"><SelectValue /></SelectTrigger>
                    <SelectContent>{DURATIONS.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>{jokeForm.topic === "standup" ? t("standup_comedian") : t("main_character")}</Label>
                <Select value={channelCharId} onValueChange={setChannelCharId}>
                  <SelectTrigger data-testid="channel-character-select" className="mt-1.5 bg-[#0B0F17] border-white/10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ai__">{t("standup_ai")}</SelectItem>
                    {characters.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {jokeForm.topic === "standup" ? t("standup_hint") : t("protagonist_hint")}
                </p>
              </div>
              <Button data-testid="joke-generator-trigger" onClick={generateJoke} disabled={busy.joke} className="gap-2 font-semibold">
                {busy.joke ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                {busy.joke ? t("generating") : t("joke_generate")}
              </Button>

              <div className="pt-2">
                <Label>{t("joke_custom")}</Label>
                <Textarea
                  data-testid="custom-joke-textarea"
                  value={jokeForm.custom_joke}
                  onChange={(e) => setJokeForm({ ...jokeForm, custom_joke: e.target.value })}
                  placeholder={t("joke_custom_ph")} rows={2}
                  className="mt-1.5 bg-[#0B0F17] border-white/10"
                />
                {jokeForm.custom_joke.trim() && (
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => setJoke(jokeForm.custom_joke)}>
                    {t("joke_result")} →
                  </Button>
                )}
              </div>
            </div>

            {joke && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-primary/30 bg-primary/5 p-6">
                <div className="text-xs uppercase tracking-widest text-primary mb-2">{t("joke_result")}</div>
                <Textarea data-testid="joke-result-text" value={joke} onChange={(e) => setJoke(e.target.value)} rows={4} className="bg-[#0B0F17] border-white/10 text-lg leading-relaxed" />
                <div className="flex gap-3 mt-4">
                  <Button variant="outline" onClick={generateJoke} disabled={busy.joke} className="gap-1.5"><RefreshCw className="w-4 h-4" /> {t("joke_regen")}</Button>
                  <Button data-testid="generate-script-button" onClick={buildStoryboard} disabled={busy.script} className="gap-1.5 font-semibold ml-auto">
                    {busy.script ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
                    {busy.script ? t("generating") : t("to_storyboard")}
                  </Button>
                </div>
              </motion.div>
            )}
          </div>
        </TabsContent>

        {/* ---------------- SCRIPT / STORYBOARD ---------------- */}
        <TabsContent value="script">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl font-bold text-white">{t("scenes")} ({scenes.length})</h3>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={addScene} className="gap-1.5" data-testid="add-scene-button"><Plus className="w-4 h-4" /> {t("add_scene")}</Button>
                  <Button size="sm" onClick={() => saveScenes(scenes).then(() => toast.success(t("t_saved")))} className="gap-1.5" data-testid="save-scenes-button"><Check className="w-4 h-4" /> {t("save")}</Button>
                </div>
              </div>

              {scenes.map((s) => (
                <SceneCard
                  key={s.index} s={s} t={t} lang={lang} voices={voices} characters={characters}
                  selected={selected === s.index} onSelect={() => setSelected(s.index)}
                  onChange={(patch) => updateScene(s.index, patch)}
                  onAssignCharacter={(name) => assignCharacter(s.index, name)}
                  onGenImage={() => generateImage(s.index)} onGenAudio={() => generateAudio(s.index)}
                  genImg={genImg === s.index} genAud={genAud === s.index}
                  onRemove={() => removeScene(s.index)}
                />
              ))}
            </div>

            <div className="lg:col-span-5">
              <div className="sticky top-20 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-[#131B2E] p-5">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3 text-center">{t("preview")}</div>
                  <VideoPreview scene={scene} index={selected} total={scenes.length} />
                </div>
                <Button onClick={() => setTab("export")} className="w-full gap-2 font-semibold" data-testid="go-to-export-button">
                  <Rocket className="w-4 h-4" /> {t("tab_export")}
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ---------------- REVIEW & APPROVE ---------------- */}
        <TabsContent value="export">
          {project.video_url ? (
            <div className="max-w-md mx-auto rounded-2xl border border-emerald-500/30 bg-[#131B2E] p-6 space-y-4">
              <div className="text-center text-emerald-400 font-semibold flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5" /> {t("render_done")}
              </div>
              <video
                data-testid="result-video-player"
                src={assetUrl(project.render_id) || project.video_url}
                controls
                className="w-full aspect-[9/16] max-w-[300px] mx-auto rounded-2xl border-2 border-emerald-500/40 bg-black"
              />
              <a href={assetUrl(project.render_id) || project.video_url} download={`${project.title}.mp4`}>
                <Button data-testid="project-card-download-button" className="w-full gap-2 font-semibold"><Download className="w-4 h-4" /> {t("download")}</Button>
              </a>
              <Button variant="outline" className="w-full gap-2" onClick={resetExport} data-testid="new-render-button">
                <RefreshCw className="w-4 h-4" /> {t("re_edit")}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* review storyboard */}
              <div className="lg:col-span-8 space-y-4">
                <div>
                  <h3 className="font-display text-xl font-bold text-white flex items-center gap-2">
                    <ClipboardList className="w-5 h-5 text-secondary" /> {t("review_title")}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">{t("review_sub")}</p>
                </div>

                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={generateAll} disabled={busy.all} className="gap-1.5" data-testid="generate-all-button">
                    {busy.all ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    {busy.all ? `${t("generating")} ${progress}%` : t("gen_all")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={approveAll} className="gap-1.5" data-testid="approve-all-button">
                    <Check className="w-4 h-4" /> {t("approve_all")}
                  </Button>
                </div>
                {busy.all && <Progress value={progress} className="h-2" />}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {scenes.map((s) => (
                    <ReviewCard
                      key={s.index} s={s} t={t} total={scenes.length}
                      onChange={(patch) => updateScene(s.index, patch)}
                      onGenImage={() => generateImage(s.index)} onGenAudio={() => generateAudio(s.index)}
                      genImg={genImg === s.index} genAud={genAud === s.index}
                      onSaveLine={() => saveScenes(scenes)}
                    />
                  ))}
                </div>
              </div>

              {/* produce panel */}
              <div className="lg:col-span-4">
                <div className="sticky top-20 space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-[#131B2E] p-5 space-y-4">
                    <div className="space-y-3">
                      <ApprovalStep done={scenes.length > 0} label={t("step_script")} />
                      <ApprovalStep done={imagesReady} label={t("step_images")} />
                      <ApprovalStep done={allApproved} label={t("step_approved")} />
                      <ApprovalStep done={project.status === "completed"} label={t("step_render")} />
                    </div>

                    <div className="pt-4 border-t border-white/10">
                      <Label className="text-xs flex items-center gap-1.5"><Mic className="w-3.5 h-3.5 text-accent" /> {t("default_voice")}</Label>
                      <Select value={defaultVoice} onValueChange={changeDefaultVoice}>
                        <SelectTrigger data-testid="default-voice-select" className="mt-1.5 bg-[#0B0F17] border-white/10 text-sm"><SelectValue placeholder={t("no_voice")} /></SelectTrigger>
                        <SelectContent className="max-h-56">{voices.map((v) => <SelectItem key={v.voice_id} value={v.voice_id}>{v.name}</SelectItem>)}</SelectContent>
                      </Select>
                      <p className="mt-2 text-[11px] text-accent/80 flex items-center gap-1"><Volume2 className="w-3 h-3" /> {t("voice_auto")}</p>
                    </div>

                    <div className="pt-4 border-t border-white/10 space-y-3">
                      <div>
                        <Label className="text-xs flex items-center gap-1.5"><Music className="w-3.5 h-3.5 text-secondary" /> {t("bg_music")}</Label>
                        <Select value={musicPreset} onValueChange={chooseMusicPreset} disabled={loadingPreset}>
                          <SelectTrigger data-testid="music-preset-select" className="mt-1.5 bg-[#0B0F17] border-white/10 text-sm">
                            <SelectValue placeholder={loadingPreset ? t("generating_music") : t("choose_music")} />
                          </SelectTrigger>
                          <SelectContent className="max-h-56">
                            {musicLibrary.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[11px] text-muted-foreground">{t("or_upload")}</span>
                          <input id="music-upload" type="file" accept="audio/*" className="hidden"
                            data-testid="music-upload-input"
                            onChange={(e) => uploadMusic(e.target.files?.[0])} />
                          <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" data-testid="music-upload-button"
                            onClick={() => document.getElementById("music-upload").click()} disabled={uploadingMusic}>
                            {uploadingMusic ? <Loader2 className="w-3 h-3 animate-spin" /> : <Music className="w-3 h-3" />}
                            {t("upload_music")}
                          </Button>
                        </div>
                        {hasMusic && (
                          <div className="mt-2 space-y-2">
                            <div className="flex items-center gap-2">
                              {musicAssetId && (
                                <audio data-testid="music-preview-audio" src={assetUrl(musicAssetId)} controls className="h-8 flex-1" style={{ maxWidth: "180px" }} />
                              )}
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-red-400" onClick={removeMusic} data-testid="music-remove-button">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                            <div>
                              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                <span>{t("music_volume")}</span><span className="font-mono">{musicVolume}%</span>
                              </div>
                              <Slider data-testid="music-volume-slider" value={[musicVolume]} min={0} max={60} step={5}
                                onValueChange={(v) => setMusicVolume(v[0])} onValueCommit={(v) => commitMusicVolume(v[0])} className="mt-1" />
                            </div>
                          </div>
                        )}
                      </div>

                      <div>
                        <Label className="text-xs">{t("laugh_intensity")}</Label>
                        <Select value={laughIntensity} onValueChange={changeLaugh}>
                          <SelectTrigger data-testid="laugh-intensity-select" className="mt-1.5 bg-[#0B0F17] border-white/10 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="soft">{t("laugh_soft")}</SelectItem>
                            <SelectItem value="medium">{t("laugh_medium")}</SelectItem>
                            <SelectItem value="loud">{t("laugh_loud")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm pt-2">
                      <span className="text-muted-foreground">{imgCount} / {scenes.length} {t("scenes_ready")}</span>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {t("est_cost")}: ${estCost.toFixed(2)}
                      </span>
                    </div>

                    <Button
                      data-testid="export-video-creatomate-button"
                      onClick={startRender}
                      disabled={busy.render || !allApproved || project.status === "rendering"}
                      className="w-full gap-2 font-semibold text-base h-12 shadow-lg shadow-primary/30"
                    >
                      {busy.render || project.status === "rendering"
                        ? <><Loader2 className="w-5 h-5 animate-spin" /> {t("rendering")}</>
                        : <><Film className="w-5 h-5" /> {t("produce_final")}</>}
                    </Button>
                    {!allApproved && <p className="text-xs text-amber-400/80 text-center">{t("need_approve")}</p>}
                    <p className="text-[11px] text-emerald-400/80 text-center flex items-center justify-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> {t("render_free")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </main>
  );
}

const ApprovalStep = ({ done, label }) => (
  <div className="flex items-center gap-3">
    {done ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" /> : <Circle className="w-5 h-5 text-muted-foreground/40 shrink-0" />}
    <span className={done ? "text-white font-medium" : "text-muted-foreground"}>{label}</span>
  </div>
);

const ReviewCard = ({ s, t, total, onChange, onGenImage, onGenAudio, genImg, genAud, onSaveLine }) => (
  <div data-testid={`review-card-${s.index}`} className={`rounded-2xl border bg-[#1A243B] p-3 ${s.approved ? "border-emerald-500/40" : "border-white/10"}`}>
    <VideoPreview scene={s} index={s.index} total={total} />
    <div className="mt-3">
      <Label className="text-xs">{t("edit_line")} · {t("scene")} {s.index + 1}</Label>
      <Textarea
        data-testid={`review-line-input-${s.index}`}
        value={s.dialogue}
        onChange={(e) => onChange({ dialogue: e.target.value })}
        onBlur={onSaveLine}
        rows={2}
        className="mt-1 bg-[#0B0F17] border-white/10 text-sm"
      />
    </div>
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <Button data-testid={`review-regen-image-${s.index}`} size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={onGenImage} disabled={genImg}>
        {genImg ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />} {t("regen_image")}
      </Button>
      <Button data-testid={`review-gen-audio-${s.index}`} size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={onGenAudio} disabled={genAud || !s.dialogue}>
        {genAud ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mic className="w-3 h-3" />} {t("gen_audio")}
      </Button>
      <label className="flex items-center gap-1.5 ml-auto cursor-pointer text-xs font-medium">
        <Checkbox data-testid={`review-approve-${s.index}`} checked={s.approved} onCheckedChange={(v) => onChange({ approved: !!v })} disabled={!s.image_asset_id} />
        {t("approve")}
      </label>
    </div>
  </div>
);

const SceneCard = ({ s, t, lang, voices, characters, selected, onSelect, onChange, onAssignCharacter, onGenImage, onGenAudio, genImg, genAud, onRemove }) => {
  return (
    <div
      data-testid={`scene-card-${s.index}`}
      onClick={onSelect}
      className={`rounded-xl border bg-[#1A243B] p-4 cursor-pointer transition-all ${selected ? "border-primary/60 ring-1 ring-primary/30" : "border-white/10 hover:border-white/20"}`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono font-bold text-primary">{t("scene")} {s.index + 1}</span>
        <div className="flex items-center gap-2">
          {s.image_asset_id && <ImageIcon className="w-3.5 h-3.5 text-pink-400" />}
          {s.audio_asset_id && <Mic className="w-3.5 h-3.5 text-accent" />}
          <button data-testid={`remove-scene-${s.index}`} onClick={(e) => { e.stopPropagation(); onRemove(); }} className="text-muted-foreground hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">{t("character")}</Label>
          <Input
            data-testid={`scene-character-input-${s.index}`}
            list={`chars-${s.index}`}
            value={s.character_name}
            onChange={(e) => { onAssignCharacter(e.target.value); }}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 h-9 bg-[#0B0F17] border-white/10 text-sm"
          />
          <datalist id={`chars-${s.index}`}>
            {characters.map((c) => <option key={c.id} value={c.name} />)}
          </datalist>
        </div>
        <div>
          <Label className="text-xs">{t("voice")}</Label>
          <Select value={s.voice_id || ""} onValueChange={(v) => onChange({ voice_id: v })}>
            <SelectTrigger data-testid={`scene-voice-select-${s.index}`} onClick={(e) => e.stopPropagation()} className="mt-1 h-9 bg-[#0B0F17] border-white/10 text-sm"><SelectValue placeholder={t("no_voice")} /></SelectTrigger>
            <SelectContent className="max-h-56">{voices.map((v) => <SelectItem key={v.voice_id} value={v.voice_id}>{v.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-3">
        <Label className="text-xs">{t("dialogue")}</Label>
        <Textarea
          data-testid={`script-scene-line-input-${s.index}`}
          value={s.dialogue}
          onChange={(e) => onChange({ dialogue: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          rows={2} className="mt-1 bg-[#0B0F17] border-white/10 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <div>
          <Label className="text-xs">{t("camera")}</Label>
          <Select value={s.camera_motion} onValueChange={(v) => onChange({ camera_motion: v })}>
            <SelectTrigger data-testid={`scene-camera-motion-select-${s.index}`} onClick={(e) => e.stopPropagation()} className="mt-1 h-9 bg-[#0B0F17] border-white/10 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{CAMERA_MOTIONS.map((m) => <SelectItem key={m.id} value={m.id}>{m[lang]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{t("sfx")}</Label>
          <Select value={s.sfx} onValueChange={(v) => onChange({ sfx: v })}>
            <SelectTrigger data-testid={`scene-sfx-select-${s.index}`} onClick={(e) => e.stopPropagation()} className="mt-1 h-9 bg-[#0B0F17] border-white/10 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{SFX.map((f) => <SelectItem key={f.id} value={f.id}>{f[lang]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-3">
        <Label className="text-xs">{t("image_prompt")}</Label>
        <Textarea
          data-testid={`scene-image-prompt-${s.index}`}
          value={s.image_prompt}
          onChange={(e) => onChange({ image_prompt: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          rows={2} className="mt-1 bg-[#0B0F17] border-white/10 text-xs font-mono"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
        <Button data-testid={`regenerate-scene-image-button-${s.index}`} size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={onGenImage} disabled={genImg}>
          {genImg ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
          {s.image_asset_id ? t("regen_image") : t("gen_image")}
        </Button>
        <Button data-testid={`generate-scene-audio-button-${s.index}`} size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={onGenAudio} disabled={genAud || !s.dialogue}>
          {genAud ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mic className="w-3 h-3" />}
          {s.audio_asset_id ? t("regen_audio") : t("gen_audio")}
        </Button>
        <label className="flex items-center gap-1.5 ml-auto cursor-pointer text-xs">
          <Checkbox data-testid={`scene-approval-checkbox-${s.index}`} checked={s.approved} onCheckedChange={(v) => onChange({ approved: !!v })} />
          {t("approved")}
        </label>
      </div>
    </div>
  );
};
