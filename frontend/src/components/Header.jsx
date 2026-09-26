import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Clapperboard, Languages, Users, LayoutGrid, DollarSign } from "lucide-react";
import { useLang } from "@/i18n";
import { Button } from "@/components/ui/button";

const STATUS_STYLES = {
  draft: "bg-slate-800 text-slate-300 border-slate-700",
  scripted: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  generating: "bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse",
  approved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  rendering: "bg-purple-500/10 text-purple-300 border-purple-500/30 animate-pulse",
  completed: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  failed: "bg-red-500/10 text-red-400 border-red-500/20",
};

export const StatusPill = ({ status }) => (
  <span
    data-testid={`status-pill-${status}`}
    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border font-mono uppercase tracking-wide ${STATUS_STYLES[status] || STATUS_STYLES.draft}`}
  >
    {status}
  </span>
);

export const Header = ({ config, onOpenCosts }) => {
  const { lang, setLang, t } = useLang();
  const loc = useLocation();
  const active = (p) => loc.pathname === p;

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#0B0F17]/85 border-b border-white/10">
      <div className="max-w-[1700px] mx-auto px-4 sm:px-8 py-3 flex items-center gap-4">
        <Link to="/" data-testid="brand-home-link" className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
            <Clapperboard className="w-5 h-5 text-white" />
          </div>
          <div className="hidden sm:block leading-tight">
            <div className="font-display font-bold text-lg text-white">Chiste Studio AI</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("brand_tagline")}</div>
          </div>
        </Link>

        <nav className="flex items-center gap-1 ml-2">
          <Link to="/" data-testid="nav-projects-link">
            <Button variant={active("/") ? "secondary" : "ghost"} size="sm" className="gap-2">
              <LayoutGrid className="w-4 h-4" /> <span className="hidden md:inline">{t("nav_projects")}</span>
            </Button>
          </Link>
          <Link to="/characters" data-testid="nav-characters-link">
            <Button variant={active("/characters") ? "secondary" : "ghost"} size="sm" className="gap-2">
              <Users className="w-4 h-4" /> <span className="hidden md:inline">{t("nav_characters")}</span>
            </Button>
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span
            className={`hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
              config?.elevenlabs_enabled
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-amber-500/10 text-amber-400 border-amber-500/20"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${config?.elevenlabs_enabled ? "bg-emerald-400" : "bg-amber-400"}`} />
            {config?.elevenlabs_enabled ? t("voices_on") : t("voices_off")}
          </span>

          <Button
            data-testid="cost-tracker-details-button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
            onClick={onOpenCosts}
          >
            <DollarSign className="w-4 h-4" /> <span className="hidden md:inline">{t("cost_tracker")}</span>
          </Button>

          <div className="flex items-center rounded-full border border-white/10 overflow-hidden">
            <button
              data-testid="language-toggle-button"
              onClick={() => setLang(lang === "es" ? "en" : "es")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/5 transition-colors"
            >
              <Languages className="w-3.5 h-3.5" />
              {lang === "es" ? "ES" : "EN"}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
