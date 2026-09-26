import React, { useRef } from "react";
import { Volume2, Camera, Sparkles, Film } from "lucide-react";
import { assetUrl } from "@/lib/api";
import { useLang, CAMERA_MOTIONS } from "@/i18n";

export const VideoPreview = ({ scene, index, total }) => {
  const { t, lang } = useLang();
  const audioRef = useRef(null);
  const img = assetUrl(scene?.image_asset_id);
  const audio = assetUrl(scene?.audio_asset_id);
  const motion = scene?.camera_motion || "zoom_in";
  const motionLabel = CAMERA_MOTIONS.find((m) => m.id === motion)?.[lang] || motion;

  return (
    <div className="space-y-3" data-testid="video-preview-panel">
      <div className="aspect-[9/16] max-w-[300px] mx-auto rounded-2xl overflow-hidden border-2 border-primary/30 shadow-2xl relative bg-black grain">
        {img ? (
          <img
            src={img}
            alt="scene"
            className={`w-full h-full object-cover kb kb-${motion}`}
            data-testid="preview-scene-image"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-3 bg-gradient-to-b from-[#131B2E] to-[#0B0F17]">
            <Film className="w-10 h-10 opacity-40" />
            <span className="text-xs px-6 text-center">{scene?.image_prompt || t("select_scene")}</span>
          </div>
        )}

        {/* top overlays */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
          <span className="px-2 py-1 rounded-md bg-black/50 backdrop-blur text-white text-[10px] font-mono">
            {typeof index === "number" ? `${index + 1}/${total}` : ""}
          </span>
          <span className="px-2 py-1 rounded-md bg-black/50 backdrop-blur text-white text-[10px] font-medium flex items-center gap-1">
            <Camera className="w-3 h-3" /> {motionLabel}
          </span>
        </div>

        {/* character tag */}
        {scene?.character_name && (
          <div className="absolute top-12 left-3">
            <span className="px-2 py-1 rounded-md bg-secondary/80 backdrop-blur text-white text-[10px] font-semibold">
              {scene.character_name}
            </span>
          </div>
        )}

        {/* subtitle */}
        {scene?.dialogue && (
          <div className="absolute bottom-6 left-4 right-4 flex justify-center">
            <span className="px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur text-white text-sm font-bold text-center leading-snug shadow-lg">
              {scene.dialogue}
            </span>
          </div>
        )}
      </div>

      {audio && (
        <div className="flex justify-center">
          <button
            data-testid="audio-preview-play-button"
            onClick={() => audioRef.current?.play()}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 text-accent border border-accent/20 text-xs font-semibold hover:bg-accent/20 transition-colors"
          >
            <Volume2 className="w-3.5 h-3.5" /> {t("play_audio")}
          </button>
          <audio ref={audioRef} src={audio} preload="none" />
        </div>
      )}

      {!img && scene?.image_prompt && (
        <p className="text-[11px] text-muted-foreground text-center flex items-center justify-center gap-1">
          <Sparkles className="w-3 h-3" /> {t("image_prompt")}
        </p>
      )}
    </div>
  );
};
