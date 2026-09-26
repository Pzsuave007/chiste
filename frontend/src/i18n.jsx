import React, { createContext, useContext, useState, useCallback } from "react";

const DICT = {
  es: {
    brand_tagline: "Estudio de comedia con IA",
    nav_projects: "Proyectos",
    nav_characters: "Personajes",
    nav_new_project: "Nuevo proyecto",
    cost_tracker: "Costos",
    voices_on: "Voces activas",
    voices_off: "Voces sin configurar",

    // Home
    home_title: "Crea videos de comedia en caricatura",
    home_subtitle: "Genera chistes con IA, dales voz, ilustra las escenas y exporta videos verticales 9:16 listos para TikTok, Reels y Shorts.",
    home_new: "Nuevo proyecto",
    home_empty: "Aún no tienes proyectos. ¡Crea el primero!",
    home_your_projects: "Tus proyectos",
    feat_jokes: "Chistes con IA",
    feat_voices: "Voces ElevenLabs",
    feat_images: "Escenas ilustradas",
    feat_render: "Render MP4 gratis",

    // New project dialog
    np_title: "Crear proyecto",
    np_name: "Nombre del proyecto",
    np_name_ph: "Ej: Chistes de oficina #1",
    np_language: "Idioma del video",
    np_topic: "Tema",
    np_duration: "Duración",
    np_create: "Crear proyecto",
    cancel: "Cancelar",
    delete: "Eliminar",
    open: "Abrir",

    // Studio tabs
    tab_joke: "1. Chiste",
    tab_script: "2. Guion y Storyboard",
    tab_export: "3. Aprobar y Exportar",
    back: "Volver",

    // Joke step
    joke_topic: "Tema del chiste",
    joke_duration: "Duración",
    joke_language: "Idioma",
    joke_generate: "Generar chiste con IA",
    joke_custom: "O escribe tu propio chiste",
    joke_custom_ph: "Escribe aquí tu chiste...",
    joke_result: "Chiste",
    joke_regen: "Regenerar",
    to_storyboard: "Crear storyboard →",
    generating: "Generando...",

    // Script / storyboard
    scenes: "Escenas",
    scene: "Escena",
    character: "Personaje",
    dialogue: "Diálogo",
    camera: "Cámara",
    sfx: "Efecto",
    image_prompt: "Descripción de imagen",
    gen_image: "Generar imagen",
    regen_image: "Regenerar imagen",
    gen_audio: "Generar voz",
    regen_audio: "Regenerar voz",
    voice: "Voz",
    no_voice: "Sin voz",
    approved: "Aprobada",
    approve: "Aprobar escena",
    preview: "Vista previa 9:16",
    add_scene: "Añadir escena",
    remove: "Quitar",
    save: "Guardar cambios",
    saved: "Guardado",
    select_scene: "Selecciona una escena para previsualizar",
    play_audio: "Reproducir voz",

    // Export
    approval_flow: "Flujo de aprobación",
    step_script: "Guion y diálogos listos",
    step_audio: "Voces sintetizadas",
    step_images: "Imágenes de escenas generadas",
    step_render: "Ensamblar y exportar MP4",
    gen_all: "Generar todo (imágenes + voces)",
    export_mp4: "Ensamblar y exportar MP4 (9:16)",
    rendering: "Renderizando video...",
    render_done: "¡Video listo!",
    download: "Descargar MP4",
    est_cost: "Costo estimado",
    render_free: "El render en el servidor es gratis (FFmpeg)",
    scenes_ready: "escenas con imagen",
    need_images: "Genera las imágenes de las escenas antes de exportar.",

    // Characters
    char_title: "Biblioteca de personajes",
    char_subtitle: "Crea personajes reutilizables con una referencia visual y una voz asignada para mantener consistencia.",
    char_new: "Nuevo personaje",
    char_name: "Nombre",
    char_name_ph: "Ej: Don Pepe",
    char_desc: "Descripción visual",
    char_desc_ph: "Ej: hombre bajito con bigote, camisa a cuadros, cara redonda...",
    char_color: "Color",
    char_voice: "Voz asignada",
    char_gen_img: "Generar referencia con IA",
    char_save: "Guardar personaje",
    char_empty: "Sin personajes todavía.",
    char_regen: "Regenerar imagen",

    // Cost tracker
    ct_title: "Seguimiento de costos y fallos",
    ct_total: "Gasto total del estudio",
    ct_breakdown: "Desglose por servicio",
    ct_recent: "Movimientos recientes",
    ct_failures: "Fallos de API y reintentos",
    ct_no_failures: "Sin fallos registrados. Todo funcionando.",
    ct_retry: "Reintentar",
    ct_resolve: "Marcar resuelto",
    kind_joke: "Chistes",
    kind_script: "Guiones",
    kind_image: "Imágenes",
    kind_tts: "Voces",
    kind_render: "Render",

    // toasts
    t_joke_ok: "Chiste generado",
    t_script_ok: "Storyboard creado",
    t_image_ok: "Imagen generada",
    t_audio_ok: "Voz generada",
    t_saved: "Proyecto guardado",
    t_error: "Ocurrió un error. Intenta de nuevo.",
    t_project_created: "Proyecto creado",
    t_char_created: "Personaje creado",
    t_render_started: "Render iniciado",
    t_need_joke: "Primero genera o escribe un chiste",
  },
  en: {
    brand_tagline: "AI comedy studio",
    nav_projects: "Projects",
    nav_characters: "Characters",
    nav_new_project: "New project",
    cost_tracker: "Costs",
    voices_on: "Voices active",
    voices_off: "Voices not configured",

    home_title: "Create cartoon comedy videos",
    home_subtitle: "Generate jokes with AI, give them a voice, illustrate the scenes and export vertical 9:16 videos ready for TikTok, Reels and Shorts.",
    home_new: "New project",
    home_empty: "You don't have projects yet. Create your first one!",
    home_your_projects: "Your projects",
    feat_jokes: "AI Jokes",
    feat_voices: "ElevenLabs Voices",
    feat_images: "Illustrated scenes",
    feat_render: "Free MP4 render",

    np_title: "Create project",
    np_name: "Project name",
    np_name_ph: "e.g. Office jokes #1",
    np_language: "Video language",
    np_topic: "Topic",
    np_duration: "Duration",
    np_create: "Create project",
    cancel: "Cancel",
    delete: "Delete",
    open: "Open",

    tab_joke: "1. Joke",
    tab_script: "2. Script & Storyboard",
    tab_export: "3. Approve & Export",
    back: "Back",

    joke_topic: "Joke topic",
    joke_duration: "Duration",
    joke_language: "Language",
    joke_generate: "Generate joke with AI",
    joke_custom: "Or write your own joke",
    joke_custom_ph: "Type your joke here...",
    joke_result: "Joke",
    joke_regen: "Regenerate",
    to_storyboard: "Build storyboard →",
    generating: "Generating...",

    scenes: "Scenes",
    scene: "Scene",
    character: "Character",
    dialogue: "Dialogue",
    camera: "Camera",
    sfx: "SFX",
    image_prompt: "Image description",
    gen_image: "Generate image",
    regen_image: "Regenerate image",
    gen_audio: "Generate voice",
    regen_audio: "Regenerate voice",
    voice: "Voice",
    no_voice: "No voice",
    approved: "Approved",
    approve: "Approve scene",
    preview: "9:16 Preview",
    add_scene: "Add scene",
    remove: "Remove",
    save: "Save changes",
    saved: "Saved",
    select_scene: "Select a scene to preview",
    play_audio: "Play voice",

    approval_flow: "Approval workflow",
    step_script: "Script & dialogue ready",
    step_audio: "Voices synthesized",
    step_images: "Scene images generated",
    step_render: "Assemble & export MP4",
    gen_all: "Generate all (images + voices)",
    export_mp4: "Assemble & export MP4 (9:16)",
    rendering: "Rendering video...",
    render_done: "Video ready!",
    download: "Download MP4",
    est_cost: "Estimated cost",
    render_free: "Server-side render is free (FFmpeg)",
    scenes_ready: "scenes with image",
    need_images: "Generate scene images before exporting.",

    char_title: "Character library",
    char_subtitle: "Create reusable characters with a visual reference and an assigned voice for consistency.",
    char_new: "New character",
    char_name: "Name",
    char_name_ph: "e.g. Uncle Joe",
    char_desc: "Visual description",
    char_desc_ph: "e.g. short man with a mustache, plaid shirt, round face...",
    char_color: "Color",
    char_voice: "Assigned voice",
    char_gen_img: "Generate AI reference",
    char_save: "Save character",
    char_empty: "No characters yet.",
    char_regen: "Regenerate image",

    ct_title: "Cost tracking & failures",
    ct_total: "Total studio spend",
    ct_breakdown: "Breakdown by service",
    ct_recent: "Recent activity",
    ct_failures: "API failures & retries",
    ct_no_failures: "No failures logged. All good.",
    ct_retry: "Retry",
    ct_resolve: "Mark resolved",
    kind_joke: "Jokes",
    kind_script: "Scripts",
    kind_image: "Images",
    kind_tts: "Voices",
    kind_render: "Render",

    t_joke_ok: "Joke generated",
    t_script_ok: "Storyboard created",
    t_image_ok: "Image generated",
    t_audio_ok: "Voice generated",
    t_saved: "Project saved",
    t_error: "Something went wrong. Try again.",
    t_project_created: "Project created",
    t_char_created: "Character created",
    t_render_started: "Render started",
    t_need_joke: "Generate or write a joke first",
  },
};

const LangContext = createContext(null);

export const LanguageProvider = ({ children }) => {
  const [lang, setLang] = useState(() => localStorage.getItem("chiste_lang") || "es");
  const change = useCallback((l) => {
    setLang(l);
    localStorage.setItem("chiste_lang", l);
  }, []);
  const t = useCallback((key) => DICT[lang][key] ?? key, [lang]);
  return (
    <LangContext.Provider value={{ lang, setLang: change, t }}>
      {children}
    </LangContext.Provider>
  );
};

export const useLang = () => useContext(LangContext);

export const TOPICS = [
  { id: "standup", es: "Stand-up", en: "Stand-up" },
  { id: "oficina", es: "Oficina", en: "Office" },
  { id: "escuela", es: "Escuela y niños", en: "School & kids" },
  { id: "absurdo", es: "Absurdo / Cartoon", en: "Absurd / Cartoon" },
  { id: "sarcastico", es: "Sarcástico", en: "Sarcastic" },
  { id: "latam", es: "Chistes LatAm", en: "LatAm jokes" },
  { id: "tecnologia", es: "Tecnología", en: "Technology" },
  { id: "animales", es: "Animales", en: "Animals" },
];

export const DURATIONS = [
  { id: 15, label: "15s" },
  { id: 30, label: "30s" },
  { id: 60, label: "60s" },
];

export const CAMERA_MOTIONS = [
  { id: "zoom_in", es: "Zoom in", en: "Zoom in" },
  { id: "zoom_out", es: "Zoom out", en: "Zoom out" },
  { id: "pan_left", es: "Paneo izquierda", en: "Pan left" },
  { id: "pan_right", es: "Paneo derecha", en: "Pan right" },
  { id: "tilt_up", es: "Inclinación arriba", en: "Tilt up" },
  { id: "static", es: "Estática", en: "Static" },
];

export const SFX = [
  { id: "none", es: "Ninguno", en: "None" },
  { id: "laugh", es: "Risas", en: "Laugh" },
  { id: "drum", es: "Redoble", en: "Drum" },
  { id: "boing", es: "Boing", en: "Boing" },
  { id: "pop", es: "Pop", en: "Pop" },
  { id: "whoosh", es: "Whoosh", en: "Whoosh" },
  { id: "applause", es: "Aplausos", en: "Applause" },
  { id: "ding", es: "Ding", en: "Ding" },
];
