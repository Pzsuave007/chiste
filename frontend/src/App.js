import React, { useEffect, useState } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { LanguageProvider } from "@/i18n";
import { Header } from "@/components/Header";
import { CostTracker } from "@/components/CostTracker";
import { api } from "@/lib/api";
import Home from "@/pages/Home";
import Characters from "@/pages/Characters";
import Studio from "@/pages/Studio";

const Layout = () => {
  const [config, setConfig] = useState(null);
  const [costsOpen, setCostsOpen] = useState(false);

  useEffect(() => {
    api.get("/config").then((r) => setConfig(r.data)).catch(() => {});
  }, []);

  return (
    <div className="App min-h-screen">
      <Header config={config} onOpenCosts={() => setCostsOpen(true)} />
      <CostTracker open={costsOpen} onOpenChange={setCostsOpen} />
      <Outlet context={{ config }} />
      <Toaster position="top-center" theme="dark" richColors />
    </div>
  );
};

function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/characters" element={<Characters />} />
            <Route path="/studio/:id" element={<Studio />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  );
}

export default App;
