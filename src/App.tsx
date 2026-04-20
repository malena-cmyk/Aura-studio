import React, { useState, useCallback } from "react";
import { 
  Download, 
  Search, 
  Globe, 
  Mail, 
  Phone, 
  MapPin, 
  Instagram, 
  Linkedin, 
  AlertCircle,
  Loader2,
  Trash2,
  Plus,
  ShieldCheck,
  Zap,
  Bot,
  Type,
  AlignLeft,
  LayoutGrid
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import * as XLSX from "xlsx";
import { GoogleGenAI, Type as GeminiType } from "@google/genai";
import { ScraperResult } from "./types";

// Initialize Gemini for Parsing
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function App() {
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [parsingProgress, setParsingProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<ScraperResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleParseText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText || inputText.trim().length < 10) {
      setError("Por favor, pegue un texto con mayor contenido para procesar.");
      return;
    }

    if (inputText.length > 100000) {
      setError("El texto es demasiado largo (máximo 100,000 caracteres).");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      // High-precision sliding window
      const CHUNK_SIZE = 8000; // Smaller chunks for higher extraction accuracy
      const OVERLAP = 2000;
      const textToProcess = inputText.trim();
      const chunks: string[] = [];
      
      let currentPos = 0;
      while (currentPos < textToProcess.length) {
        const endPos = Math.min(currentPos + CHUNK_SIZE, textToProcess.length);
        chunks.push(textToProcess.slice(currentPos, endPos));
        if (endPos === textToProcess.length) break;
        currentPos += (CHUNK_SIZE - OVERLAP);
      }

      setParsingProgress({ current: 0, total: chunks.length });
      const rawEntries: ScraperResult[] = [];

      for (const [index, chunk] of chunks.entries()) {
        setParsingProgress(prev => ({ ...prev, current: index + 1 }));
        const prompt = `
          ACTÚA COMO UN EXPERTO EN EXTRACCIÓN DE DATOS FORENSE.
          Tu tarea es extraer TODOS los registros de negocios de este texto (Parte ${index + 1} de ${chunks.length}).
          
          REGLAS CRÍTICAS PARA TELÉFONOS:
          - Escanea cada línea en busca de patrones numéricos (ej: 011..., 4371..., 15..., +54...).
          - Los teléfonos suelen estar al final de una dirección o cerca de links.
          - Si ves algo como "011 4444-5555" o "(011) 15-2222-3333", ES UN TELÉFONO.
          - IMPORTANTE: No te saltes ningún número. Extrae el número tal cual aparece.
          
          REGLAS GENERALES:
          1. Extrae: "name", "address", "phone", "website", "email", "instagram", "linkedin".
          2. Si no hay sitio web oficial, deja "website" vacío, no pongas redes sociales ahí.
          3. Las redes sociales van en sus campos respectivos.
          4. No agregues "Sin nombre" si puedes deducir el nombre del contexto.
          
          Texto a procesar:
          ${chunk}
        `;

        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: GeminiType.ARRAY,
              items: {
                type: GeminiType.OBJECT,
                properties: {
                  name: { type: GeminiType.STRING },
                  address: { type: GeminiType.STRING },
                  phone: { type: GeminiType.STRING },
                  website: { type: GeminiType.STRING },
                  email: { type: GeminiType.STRING },
                  instagram: { type: GeminiType.STRING },
                  linkedin: { type: GeminiType.STRING }
                },
                required: ["name"]
              }
            }
          }
        });

        const parsedData: any[] = JSON.parse(response.text || "[]");
        
        parsedData.forEach(item => {
          const clean = (val: any) => {
            const s = String(val || "").trim();
            return (s.toLowerCase() === "null" || s.toLowerCase() === "undefined") ? "" : s;
          };

          rawEntries.push({
            name: clean(item.name || "Negocio detectado"),
            address: clean(item.address),
            phone: clean(item.phone),
            website: clean(item.website),
            email: clean(item.email),
            instagram: clean(item.instagram),
            linkedin: clean(item.linkedin),
            extractedAt: new Date().toISOString()
          });
        });
      }

      // Smart Merging Strategy
      // 1. Group by Name
      const nameGroups = new Map<string, ScraperResult[]>();
      rawEntries.forEach(entry => {
        const key = entry.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (key.length < 3) return;
        if (!nameGroups.has(key)) nameGroups.set(key, []);
        nameGroups.get(key)!.push(entry);
      });

      const finalEntries: ScraperResult[] = [];

      nameGroups.forEach((group) => {
        // Merge entries in the same name group
        const merged = group.reduce((acc, curr) => ({
          ...acc,
          address: acc.address || curr.address,
          phone: acc.phone || curr.phone,
          website: acc.website || curr.website,
          email: acc.email || curr.email,
          instagram: acc.instagram || curr.instagram,
          linkedin: acc.linkedin || curr.linkedin
        }));

        finalEntries.push(merged);
      });

      setResults((prev) => [...finalEntries, ...prev]);
      setInputText("");
    } catch (err: any) {
      console.error("Parsing failed:", err);
      setError("Error al procesar el texto. Asegúrate de que el contenido sea legible.");
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = useCallback(() => {
    // Column mapping for clean export
    const exportData = results.map(r => ({
      "EMPRESA": r.name,
      "TELEFONO": r.phone || "",
      "EMAIL": r.email || "",
      "INSTAGRAM": r.instagram || "",
      "LINKEDIN": r.linkedin || "",
      "SITIO WEB": r.website || "",
      "DIRECCION": r.address || ""
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Negocios");
    XLSX.writeFile(workbook, `Negocios_Extraidos_${new Date().getTime()}.xlsx`);
  }, [results]);

  const clearResults = () => setResults([]);

  return (
    <div className="flex min-h-screen relative overflow-hidden">
      {/* Organic Blobs Decor */}
      <div className="blob w-[500px] h-[500px] bg-blue-400/20 top-[-200px] left-[-100px]" />
      <div className="blob w-[400px] h-[400px] bg-purple-400/20 bottom-[-100px] right-[-100px]" />
      <div className="blob w-[300px] h-[300px] bg-sky-300/20 top-[40%] right-[10%] rotate-45" />

      {/* Sidebar */}
      <aside className="w-[300px] glass-sidebar flex flex-col shrink-0 z-30 p-8">
        <div className="font-black text-3xl text-zinc-900 tracking-tighter flex items-center gap-3 mb-10">
          <div className="w-11 h-11 bg-gradient-to-br from-[#0066ff] to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/20">
            <LayoutGrid className="w-6 h-6 text-white" />
          </div>
          AuraStudio
        </div>

        <div className="space-y-1 flex-grow">
          <div className="text-[10px] uppercase tracking-[0.2em] font-black text-zinc-400 mb-4 px-4">Workspace</div>
          <button className="w-full sidebar-link sidebar-link-active group">
            <Zap className="w-4 h-4" />
            Extracción IA
          </button>
          <button className="w-full sidebar-link group">
            <Search className="w-4 h-4" />
            Explorar Leads
          </button>
          <button className="w-full sidebar-link group">
            <ShieldCheck className="w-4 h-4" />
            Privacidad
          </button>
        </div>

        <div className="mt-auto space-y-6">
          <div className="p-5 bg-white/40 border border-white/60 rounded-3xl">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Cuota de Proceso</span>
              <span className="text-[10px] font-black text-[#0066ff] bg-blue-50 px-2 py-0.5 rounded-full">PRO</span>
            </div>
            <div className="h-2 w-full bg-zinc-200/50 rounded-full overflow-hidden mb-2">
              <motion.div initial={{ width: 0 }} animate={{ width: "72%" }} className="h-full bg-[#0066ff]" />
            </div>
            <div className="text-[11px] font-bold text-zinc-500">72% de créditos restantes</div>
          </div>

          <div className="flex items-center gap-4 bg-white/60 p-4 rounded-3xl border border-white/60">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-black italic shadow-lg">MA</div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-zinc-800">Malena Aura</span>
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-tighter">Admin Account</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-grow flex flex-col z-20 overflow-hidden">
        {/* Header / Hero */}
        <header className="px-12 py-12 shrink-0 max-w-7xl mx-auto w-full">
          <div className="flex flex-col gap-10">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h1 className="text-4xl font-black text-zinc-900 tracking-tight">Parser de Leads Premium</h1>
                <p className="text-zinc-500 font-medium italic">Convierta ráfagas de texto en inteligencia comercial estructurada.</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex -space-x-3 overflow-hidden p-1">
                   {[1,2,3,4].map(i => (
                     <img key={i} className="inline-block h-8 w-8 rounded-xl ring-4 ring-white" src={`https://picsum.photos/seed/user${i}/100/100`} alt="" referrerPolicy="no-referrer" />
                   ))}
                </div>
                <div className="text-[11px] font-bold text-zinc-400 text-right">
                  Usado por <span className="text-zinc-800 font-black">+2,400</span><br/>profesionales activos
                </div>
              </div>
            </div>

            <form onSubmit={handleParseText} className="space-y-6">
              <div className="input-glow-container shadow-2xl shadow-blue-500/10">
                <textarea 
                  required
                  rows={inputText ? 6 : 3}
                  placeholder="Pegue aquí el texto copiado de Google Maps, LinkedIn u otros sitios..." 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  maxLength={100000}
                  className="premium-input resize-none"
                />
                <div className="absolute top-6 right-6 flex items-center gap-3">
                  <div className="px-3 py-1 bg-white/80 rounded-full border border-zinc-100 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    {inputText.length.toLocaleString()} / 100,000 chars
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-orange-100 flex items-center justify-center text-orange-600">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Protección</span>
                      <span className="text-[11px] font-bold text-zinc-700">Privacidad Validada</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-blue-100 flex items-center justify-center text-[#0066ff]">
                      <Bot className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Motor</span>
                      <span className="text-[11px] font-bold text-zinc-700">Gemini Flash 3.0</span>
                    </div>
                  </div>
                </div>
                
                <button 
                  type="submit"
                  disabled={loading || inputText.length < 10}
                  className="premium-button min-w-[240px]"
                >
                  {loading ? (
                    <div className="flex items-center justify-center gap-3">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>
                        {parsingProgress.total > 1 
                          ? `Procesando parte ${parsingProgress.current} de ${parsingProgress.total}...`
                          : "Analizando ráfaga..."}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-3">
                      <Zap className="w-5 h-5 fill-white" />
                      <span>Procesar leads</span>
                    </div>
                  )}
                </button>
              </div>
            </form>
          </div>
        </header>

        {/* Workspace Bottom */}
        <div className="flex-grow px-12 pb-12 overflow-hidden flex flex-col gap-8 max-w-7xl mx-auto w-full">
          <div className="glass-card flex-grow flex flex-col overflow-hidden">
            <div className="px-10 py-8 border-b border-zinc-100 flex items-center justify-between bg-white/40 shrink-0 backdrop-blur-2xl">
              <div className="flex items-center gap-6">
                <div>
                  <h2 className="text-xl font-black text-zinc-900 tracking-tight">Dataset Estructurado</h2>
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">{results.length} registros detectados</p>
                </div>
                <div className="h-8 w-[1px] bg-zinc-200" />
                <div className="flex items-center gap-2 px-3 py-1 bg-green-50 rounded-full border border-green-100">
                   <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                   <span className="text-[10px] font-black text-green-700 uppercase tracking-widest">Listo para exportar</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={clearResults}
                  disabled={results.length === 0}
                  className="p-3 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all disabled:opacity-0"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
                <button 
                  onClick={exportToExcel}
                  disabled={results.length === 0}
                  className="bg-white border border-zinc-200 px-6 py-3 rounded-2xl text-xs font-bold text-zinc-700 hover:shadow-xl hover:border-zinc-300 transition-all flex items-center gap-2 group disabled:opacity-20"
                >
                  <Download className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  Exportar Dataset
                </button>
              </div>
            </div>

            <div className="flex-grow overflow-auto">
              <table className="w-full text-left border-collapse min-w-[1200px]">
                <thead className="sticky top-0 bg-white/80 backdrop-blur-3xl z-10">
                  <tr>
                    <th className="p-8 text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-50">Empresa / IQ</th>
                    <th className="p-8 text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-50">Contacto</th>
                    <th className="p-8 text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-50">Redes Sociales</th>
                    <th className="p-8 text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-50">Sitios Web</th>
                    <th className="p-8 text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-50">Dirección</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50/50">
                  <AnimatePresence>
                    {results.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-32 text-center">
                          <div className="flex flex-col items-center gap-6 opacity-40">
                             <div className="w-24 h-24 rounded-[3rem] bg-gradient-to-tr from-zinc-100 to-white flex items-center justify-center shadow-inner border border-zinc-50">
                               <AlignLeft className="w-10 h-10 text-zinc-300" />
                             </div>
                             <div className="space-y-2">
                               <div className="text-lg font-black text-zinc-800">Workspace Vacío</div>
                               <p className="text-sm font-medium text-zinc-500 max-w-[280px] mx-auto leading-relaxed">Pegue sus resultados arriba y AuraStudio los procesará en una base de datos dinámica en segundos.</p>
                             </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      results.map((item, idx) => {
                        const filled = [item.phone, item.email, item.website, item.instagram, item.linkedin].filter(Boolean).length;
                        const score = (filled / 5) * 100;

                        return (
                          <motion.tr 
                            key={item.extractedAt + idx}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="bg-white/10 hover:bg-white/60 transition-all group cursor-default"
                          >
                            <td className="p-8">
                              <div className="max-w-[280px]">
                                <div className="font-black text-zinc-900 text-[15px] mb-2 uppercase tracking-tight truncate group-hover:text-[#0066ff] transition-colors">{item.name}</div>
                                <div className="flex items-center gap-3">
                                  <div className="flex-grow h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                                    <div className={`h-full ${score > 70 ? 'bg-green-500' : score > 30 ? 'bg-orange-400' : 'bg-red-400'} transition-all`} style={{ width: `${score}%` }} />
                                  </div>
                                  <span className="text-[11px] font-black text-zinc-400">{score.toFixed(0)}% <span className="text-[9px] opacity-70">IQ</span></span>
                                </div>
                              </div>
                            </td>
                            <td className="p-8">
                              <div className="flex flex-col gap-2">
                                {item.phone ? (
                                  <div className="flex items-center gap-3 bg-zinc-50/50 p-2 py-1.5 rounded-xl border border-white/40 group-hover:bg-white transition-all w-fit">
                                    <Phone className="w-3.5 h-3.5 text-[#0066ff]" />
                                    <span className="font-mono text-xs font-black text-zinc-600 tracking-tighter">{item.phone}</span>
                                  </div>
                                ) : <span className="text-[10px] font-bold text-zinc-300 uppercase italic">Sin Teléfono</span>}
                                {item.email ? (
                                  <div className="flex items-center gap-3 bg-blue-50/30 p-2 py-1.5 rounded-xl border border-white/40 group-hover:bg-white transition-all w-fit">
                                    <Mail className="w-3.5 h-3.5 text-blue-500" />
                                    <span className="font-mono text-xs font-black text-blue-600/70 tracking-tighter">{item.email}</span>
                                  </div>
                                ) : null}
                              </div>
                            </td>
                            <td className="p-8 text-center">
                              <div className="flex gap-4">
                                {item.instagram ? (
                                  <a href={item.instagram.includes('instagram.com') ? (item.instagram.startsWith('http') ? item.instagram : `https://${item.instagram}`) : `https://instagram.com/${item.instagram}`} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-2xl bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-[#E4405F] hover:bg-rose-50 hover:scale-110 hover:-rotate-6 transition-all border border-transparent hover:border-rose-100">
                                    <Instagram className="w-5 h-5" />
                                  </a>
                                ) : <Instagram className="w-5 h-5 text-zinc-100" />}
                                {item.linkedin ? (
                                  <a href={item.linkedin.includes('linkedin.com') ? (item.linkedin.startsWith('http') ? item.linkedin : `https://${item.linkedin}`) : `https://linkedin.com/in/${item.linkedin}`} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-2xl bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-[#0077B5] hover:bg-sky-50 hover:scale-110 hover:rotate-6 transition-all border border-transparent hover:border-sky-100">
                                    <Linkedin className="w-5 h-5" />
                                  </a>
                                ) : <Linkedin className="w-5 h-5 text-zinc-100" />}
                              </div>
                            </td>
                            <td className="p-8">
                              {item.website ? (
                                <a href={item.website.startsWith('http') ? item.website : `https://${item.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3 bg-white border border-zinc-100 rounded-2xl shadow-sm hover:shadow-xl hover:border-blue-200 transition-all group/web w-fit">
                                  <Globe className="w-4 h-4 text-zinc-300 group-hover/web:text-[#0066ff] group-hover/web:rotate-12 transition-all" />
                                  <span className="text-[11px] font-black text-zinc-500 group-hover/web:text-zinc-800">Ver Plataforma</span>
                                </a>
                              ) : <span className="text-[10px] font-bold text-zinc-200 uppercase">Sin sitio web</span>}
                            </td>
                            <td className="p-8">
                               <div className="max-w-[200px] text-[11px] font-semibold text-zinc-400 leading-relaxed italic group-hover:text-zinc-600 transition-colors">
                                 {item.address || "Localización no disponible"}
                               </div>
                            </td>
                          </motion.tr>
                        );
                      })
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <footer className="px-12 py-5 bg-white/40 backdrop-blur-3xl border-t border-white/60 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-zinc-400">
          <div className="flex gap-10">
            <span className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Sincronización Cloud Activa
            </span>
            <span className="flex items-center gap-2">
              <Bot className="w-3.5 h-3.5 text-[#0066ff]" />
              LLM Engine: V3-PRO
            </span>
          </div>
          <div>AuraScraper Studio © 2026 - Premium Edition</div>
        </footer>
      </main>

      {error && (
        <div className="fixed bottom-12 right-12 z-50">
           <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="p-4 bg-white border border-red-200 rounded-xl shadow-2xl flex items-center gap-3 text-red-600 max-w-sm"
          >
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div className="text-sm">
              <div className="font-bold">Error de Procesamiento</div>
              <div className="opacity-70 text-[10px] uppercase font-bold tracking-wider">{error}</div>
            </div>
            <button onClick={() => setError(null)} className="ml-2 hover:text-black">
              <Plus className="rotate-45 w-4 h-4" />
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
