
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";
import { 
  Plus, 
  Minus,
  History, 
  Loader2,
  X,
  Map as MapIcon,
  Search,
  Settings,
  Briefcase,
  Palmtree,
  Car,
  Download,
  Users,
  BarChart3,
  MapPin,
  Sparkles,
  Zap,
  ChevronRight,
  RotateCcw,
  Calendar,
  Tag,
  Trash2,
  Menu,
  List,
  Globe,
  Edit2,
  Filter,
  FileText,
  TrendingUp,
  GripHorizontal,
  PieChart,
  ArrowUpRight,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { geoIdentity, geoPath } from 'd3-geo';
// @ts-ignore
import html2pdf from 'html2pdf.js';

// --- Tipos ---
type VisitPurpose = 'trabalho' | 'lazer' | 'passagem' | 'todos';
type ViewMode = 'map' | 'list';

interface CustomMarker {
  label: string;
  color: string;
}

interface VisitRecord {
  title: string;
  date: string;
  purpose: VisitPurpose;
  observations?: string;
  attendanceCount?: number;
}

interface ScheduledTrip {
  title: string;
  startDate: string;
  endDate: string;
}

interface MunicipalityData {
  id: string;
  name: string;
  visits: VisitRecord[];
  scheduledTrips: ScheduledTrip[];
  customMarkers: CustomMarker[];
}

interface HoverIconMenu {
  x: number;
  y: number;
  id: string;
  type: 'customMarkers' | 'scheduledTrips';
  index: number;
  label: string;
}

// --- Componentes de Gráfico Customizados ---

const BarChartComponent = ({ data }: { data: { name: string, value: number }[] }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="space-y-4">
      {data.map((d, i) => (
        <div key={i} className="space-y-1">
          <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
            <span>{d.name}</span>
            <span>{d.value.toLocaleString()}</span>
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }} 
              animate={{ width: `${(d.value / max) * 100}%` }} 
              className="h-full bg-green-500 rounded-full"
            />
          </div>
        </div>
      ))}
    </div>
  );
};

const DonutChartComponent = ({ stats }: { stats: Record<string, number> }) => {
  const total = Object.values(stats).reduce((a, b) => a + b, 0) || 1;
  const trabalhoPerc = (stats.trabalho / total) * 100;
  const lazerPerc = (stats.lazer / total) * 100;
  const passagemPerc = (stats.passagem / total) * 100;

  return (
    <div className="flex items-center gap-6">
      <div className="relative w-24 h-24 flex-shrink-0">
        <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
          <circle cx="18" cy="18" r="16" fill="none" stroke="#f1f5f9" strokeWidth="4" />
          <circle cx="18" cy="18" r="16" fill="none" stroke="#16a34a" strokeWidth="4" strokeDasharray={`${trabalhoPerc} 100`} />
          <circle cx="18" cy="18" r="16" fill="none" stroke="#3b82f6" strokeWidth="4" strokeDasharray={`${lazerPerc} 100`} strokeDashoffset={`-${trabalhoPerc}`} />
          <circle cx="18" cy="18" r="16" fill="none" stroke="#fb923c" strokeWidth="4" strokeDasharray={`${passagemPerc} 100`} strokeDashoffset={`-${trabalhoPerc + lazerPerc}`} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] font-black text-slate-900">{Math.round((stats.trabalho/total)*100)}%</span>
        </div>
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-[9px] font-bold uppercase text-slate-500">Missões ({stats.trabalho})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-[9px] font-bold uppercase text-slate-500">Lazer ({stats.lazer})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-orange-400" />
          <span className="text-[9px] font-bold uppercase text-slate-500">Passagem ({stats.passagem})</span>
        </div>
      </div>
    </div>
  );
};

// --- Configurações ---
const AM_GEOJSON_URL = "https://servicodados.ibge.gov.br/api/v3/malhas/estados/13?formato=application/vnd.geo+json&intrarregiao=municipio&qualidade=minima";
const AM_NAMES_URL = "https://servicodados.ibge.gov.br/api/v1/localidades/estados/13/municipios";
const STORAGE_KEY = "amazonas_travel_tracker_v22"; 

const COLOR_SCALE = ["#ffffff", "#dcfce7", "#bbf7d0", "#86efac", "#4ade80", "#16a34a"];
const PRESET_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#ca8a04", "#7c3aed", "#db2777", "#475569", "#0891b2"];

const PURPOSE_ICONS: Record<string, React.ReactNode> = {
  trabalho: <Briefcase className="w-3 h-3" />,
  lazer: <Palmtree className="w-3 h-3" />,
  passagem: <Car className="w-3 h-3" />,
  todos: <Globe className="w-3 h-3" />
};

const PURPOSE_COLORS: Record<string, string> = {
  trabalho: "bg-green-600",
  lazer: "bg-blue-500",
  passagem: "bg-orange-400",
  todos: "bg-slate-500"
};

const MapLoadingPlaceholder = () => (
  <div className="absolute inset-0 flex flex-col items-center justify-center p-12 overflow-hidden pointer-events-none bg-white">
    <div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(to_right,#000_1px,transparent_1px),linear-gradient(to_bottom,#000_1px,transparent_1px)] bg-[size:40px_40px]" />
    <div className="relative z-10 flex flex-col items-center max-w-md w-full">
      <div className="relative mb-12">
        <motion.div animate={{ scale: [1, 2], opacity: [0.5, 0] }} transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }} className="absolute inset-0 bg-green-500/20 rounded-full" />
        <div className="relative bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl border border-white/10">
          <Globe className="w-16 h-16 text-green-500 animate-pulse" />
        </div>
      </div>
      <h2 className="text-xl font-black uppercase tracking-tighter text-slate-800 leading-none">Sincronizando Malha</h2>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2">DPE Amazonas v2</p>
    </div>
  </div>
);

const App: React.FC = () => {
  const [geoData, setGeoData] = useState<any>(null);
  const [namesMap, setNamesMap] = useState<Record<string, string>>({});
  const [userStats, setUserStats] = useState<Record<string, MunicipalityData>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isLoadingMap, setIsLoadingMap] = useState(true);
  const [showReport, setShowReport] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [aiInfo, setAiInfo] = useState<{ text: string, loading: boolean }>({ text: "", loading: false });
  const [isAiInfoExpanded, setIsAiInfoExpanded] = useState(true);

  // Estados de Zoom e Pan
  const [viewBoxTransform, setViewBoxTransform] = useState({ x: 0, y: 0, k: 1 });
  const [isDraggingMap, setIsDraggingMap] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const dragOffsetStart = useRef({ x: 0, y: 0 });
  const hasMovedDuringDrag = useRef(false);

  // Formulários
  const [visitTitle, setVisitTitle] = useState("Atendimento Geral");
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0]);
  const [visitPurpose, setVisitPurpose] = useState<VisitPurpose>('trabalho');
  const [visitAttendanceCount, setVisitAttendanceCount] = useState<number>(0);
  const [scheduleTitle, setScheduleTitle] = useState("Missão Planejada");
  const [scheduleStart, setScheduleStart] = useState("");
  const [scheduleEnd, setScheduleEnd] = useState("");
  const [markerLabel, setMarkerLabel] = useState("");
  const [markerColor, setMarkerColor] = useState(PRESET_COLORS[0]);

  // Filtros de Relatório
  const [reportFilterSearch, setReportFilterSearch] = useState("");
  const [reportFilterPurpose, setReportFilterPurpose] = useState<VisitPurpose>('todos');
  const [reportFilterStart, setReportFilterStart] = useState("");
  const [reportFilterEnd, setReportFilterEnd] = useState("");

  const reportContentRef = useRef<HTMLDivElement>(null);

  const mapWidth = 900;
  const mapHeight = 700;

  const getFeatureId = useCallback((feature: any) => {
    const p = feature.properties || {};
    return (p.codarea || p.codmun || p.CD_MUN || feature.id || "").toString();
  }, []);

  const applyTransform = useCallback((x: number, y: number, k: number) => {
    setViewBoxTransform({ x, y, k });
  }, []);

  const resetMapTransform = () => applyTransform(0, 0, 1);

  const handleMapMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; 
    setIsDraggingMap(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragOffsetStart.current = { x: viewBoxTransform.x, y: viewBoxTransform.y };
    hasMovedDuringDrag.current = false;
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDraggingMap) return;
      const dx = e.clientX - dragStartPos.current.x;
      const dy = e.clientY - dragStartPos.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) hasMovedDuringDrag.current = true;
      applyTransform(dragOffsetStart.current.x + dx, dragOffsetStart.current.y + dy, viewBoxTransform.k);
    };
    const handleGlobalMouseUp = () => setIsDraggingMap(false);
    if (isDraggingMap) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDraggingMap, viewBoxTransform.k, applyTransform]);

  useEffect(() => {
    const savedStats = localStorage.getItem(STORAGE_KEY);
    if (savedStats) try { setUserStats(JSON.parse(savedStats)); } catch (e) {}

    const loadData = async () => {
      setIsLoadingMap(true);
      try {
        const nRes = await fetch(AM_NAMES_URL);
        if (nRes.ok) {
          const namesJson = await nRes.json();
          const mapping: Record<string, string> = {};
          namesJson.forEach((mun: any) => mapping[mun.id.toString()] = mun.nome);
          setNamesMap(mapping);
        }
        const gRes = await fetch(`${AM_GEOJSON_URL}&t=${Date.now()}`);
        if (gRes.ok) setGeoData(await gRes.json());
        setTimeout(() => setIsLoadingMap(false), 1200);
      } catch (err) { setIsLoadingMap(false); }
    };
    loadData();
  }, []);

  const generateMunicipalityInsights = async (id: string) => {
    const name = namesMap[id];
    if (!name || !process.env.API_KEY) return;
    setAiInfo({ text: "", loading: true });
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Como consultor DPE, dê um resumo de 2 frases sobre a importância estratégica de ${name}, Amazonas.`,
      });
      setAiInfo({ text: response.text || "Sem insights.", loading: false });
    } catch (e) { setAiInfo({ text: "Erro IA.", loading: false }); }
  };

  useEffect(() => { if (selectedId) generateMunicipalityInsights(selectedId); }, [selectedId]);

  const updateMunicipality = (id: string, update: Partial<MunicipalityData>) => {
    const updatedStats = { ...userStats };
    const current = updatedStats[id] || { id, name: namesMap[id], visits: [], scheduledTrips: [], customMarkers: [] };
    updatedStats[id] = { ...current, ...update };
    setUserStats(updatedStats);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedStats));
  };

  const addVisit = () => {
    if (!selectedId) return;
    const newVisit: VisitRecord = { 
      title: visitTitle, date: visitDate, purpose: visitPurpose, attendanceCount: visitPurpose === 'trabalho' ? Math.max(0, visitAttendanceCount) : undefined
    };
    const visits = [newVisit, ...(userStats[selectedId]?.visits || [])].sort((a,b) => b.date.localeCompare(a.date));
    updateMunicipality(selectedId, { visits });
    setVisitTitle("Atendimento Geral");
    setVisitAttendanceCount(0);
  };

  const addSchedule = () => {
    if (!selectedId || !scheduleStart) return;
    const newTrip: ScheduledTrip = { title: scheduleTitle, startDate: scheduleStart, endDate: scheduleEnd };
    const scheduledTrips = [newTrip, ...(userStats[selectedId]?.scheduledTrips || [])];
    updateMunicipality(selectedId, { scheduledTrips });
    setScheduleTitle("Missão Planejada");
    setScheduleStart("");
    setScheduleEnd("");
  };

  const addMarker = () => {
    if (!selectedId || !markerLabel) return;
    const newMarker: CustomMarker = { label: markerLabel, color: markerColor };
    const customMarkers = [newMarker, ...(userStats[selectedId]?.customMarkers || [])];
    updateMunicipality(selectedId, { customMarkers });
    setMarkerLabel("");
  };

  const deleteItem = (id: string, type: 'visits' | 'scheduledTrips' | 'customMarkers', index: number) => {
    const updatedStats = { ...userStats };
    if (!updatedStats[id]) return;
    updatedStats[id][type].splice(index, 1);
    setUserStats({ ...updatedStats });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedStats));
  };

  const projection = useMemo(() => geoData ? geoIdentity().reflectY(true).fitExtent([[50, 50], [mapWidth - 50, mapHeight - 70]], geoData) : null, [geoData]);
  const pathGenerator = useMemo(() => projection ? geoPath().projection(projection) : null, [projection]);
  
  const reportData = useMemo(() => {
    return Object.values(userStats)
      .map(m => {
        const filteredVisits = (m.visits || []).filter(v => {
          const matchesSearch = !reportFilterSearch || m.name.toLowerCase().includes(reportFilterSearch.toLowerCase());
          const matchesPurpose = reportFilterPurpose === 'todos' || v.purpose === reportFilterPurpose;
          const matchesStart = !reportFilterStart || v.date >= reportFilterStart;
          const matchesEnd = !reportFilterEnd || v.date <= reportFilterEnd;
          return matchesSearch && matchesPurpose && matchesStart && matchesEnd;
        });
        const attendance = filteredVisits.reduce((sum, v) => sum + (v.attendanceCount || 0), 0);
        return { ...m, filteredVisits, attendanceCount: attendance, visitCount: filteredVisits.length };
      })
      .filter(m => m.visitCount > 0)
      .sort((a, b) => b.attendanceCount - a.attendanceCount);
  }, [userStats, reportFilterSearch, reportFilterPurpose, reportFilterStart, reportFilterEnd]);

  const reportStats = useMemo(() => {
    const totalAttendance = reportData.reduce((acc, cur) => acc + cur.attendanceCount, 0);
    const totalVisits = reportData.reduce((acc, cur) => acc + cur.visitCount, 0);
    const purposeCounts = { trabalho: 0, lazer: 0, passagem: 0 };
    reportData.forEach(m => m.filteredVisits.forEach(v => { if (v.purpose in purposeCounts) purposeCounts[v.purpose as keyof typeof purposeCounts]++; }));
    
    const topMunicipalities = [...reportData].sort((a, b) => b.attendanceCount - a.attendanceCount).slice(0, 5).map(m => ({ name: m.name, value: m.attendanceCount }));

    return { totalAttendance, totalVisits, purposeCounts, topMunicipalities };
  }, [reportData]);

  const exportPDF = async () => {
    try {
      const element = reportContentRef.current;
      if (!element) return;
      
      // Robust detection of html2pdf library
      let h2p = (window as any).html2pdf || (html2pdf as any).default || html2pdf;
      
      // Some ESM loaders might nest it
      if (typeof h2p !== 'function' && h2p && typeof h2p.default === 'function') {
        h2p = h2p.default;
      }

      if (typeof h2p === 'function') {
        const opt = { 
          margin: 10, 
          filename: `Relatorio_Dashboard_DPE_${new Date().toISOString().split('T')[0]}.pdf`, 
          image: { type: 'jpeg', quality: 0.98 }, 
          html2canvas: { scale: 2, useCORS: true, logging: false }, 
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' } 
        };
        await h2p().from(element).set(opt).save();
      } else {
        throw new Error("Library html2pdf not found or not a function");
      }
    } catch (err) { 
      console.error("PDF Export failed:", err); 
      alert("Houve um erro ao gerar o PDF. Verifique se o navegador está bloqueando downloads ou tente novamente.");
    }
  };

  const getDynamicFontSize = (k: number) => (7 / Math.sqrt(k));
  const getDynamicIconScale = (k: number) => (0.65 / Math.sqrt(k));

  return (
    <div className={`h-screen bg-slate-50 text-slate-900 font-sans flex flex-col overflow-hidden select-none ${isDraggingMap ? 'cursor-grabbing' : ''}`}>
      {/* HEADER PRINCIPAL */}
      <header className="sticky top-0 z-[100] bg-slate-900 border-b-4 border-green-500 px-6 lg:px-8 py-5 flex items-center justify-between shadow-2xl shrink-0 text-white">
        <div className="flex items-center gap-5">
          <div className="bg-green-600 p-2.5 rounded-2xl shadow-lg shadow-green-600/20"><MapIcon className="w-7 h-7" /></div>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tighter leading-none">Defensoria Itinerante</h1>
            <p className="text-[11px] text-green-400 font-bold uppercase tracking-[0.4em] mt-1">
              {hoveredId ? namesMap[hoveredId] : (selectedId ? namesMap[selectedId] : "MAPA INTERATIVO DPE")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setShowReport(true)} className="bg-green-600 hover:bg-green-500 px-5 py-3 rounded-2xl text-[10px] font-black uppercase transition-all shadow-xl flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> <span className="hidden sm:inline">Dashboard Analítico</span>
          </button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden relative h-full">
        {/* SEÇÃO DO MAPA */}
        <section className={`relative flex flex-col bg-white overflow-hidden h-full transition-all duration-500 ease-in-out ${selectedId ? 'md:col-span-7 lg:col-span-8' : 'md:col-span-12'}`}>
          <div className="flex-1 relative overflow-hidden h-full">
            <AnimatePresence mode="wait">
              {isLoadingMap ? (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50"><MapLoadingPlaceholder /></motion.div>
              ) : (
                <motion.div 
                  key="map-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
                  className={`w-full h-full flex items-center justify-center bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:20px_20px] ${isDraggingMap ? 'cursor-grabbing' : 'cursor-grab'}`}
                  onMouseDown={handleMapMouseDown}
                >
                  <svg viewBox={`0 0 ${mapWidth} ${mapHeight}`} className="w-full h-full drop-shadow-3xl transition-transform duration-75 select-none touch-none">
                    <rect width={mapWidth} height={mapHeight} fill="transparent" />
                    <g transform={`translate(${viewBoxTransform.x}, ${viewBoxTransform.y}) scale(${viewBoxTransform.k})`}>
                      {geoData.features.map((f: any) => {
                        const id = getFeatureId(f);
                        const data = userStats[id];
                        const visitsCount = data?.visits.length || 0;
                        const isSelected = selectedId === id;
                        const isHovered = hoveredId === id;
                        const centroid = pathGenerator!.centroid(f);
                        const fillColor = visitsCount > 0 ? COLOR_SCALE[Math.min(visitsCount, 5)] : (isSelected ? "#f1f5f9" : "#ffffff");

                        return (
                          <g key={id}>
                            <path 
                              d={pathGenerator!(f)!} fill={fillColor} stroke={isSelected ? "#16a34a" : "#cbd5e1"} strokeWidth={(isSelected ? 1.8 : 0.6) / viewBoxTransform.k} 
                              onClick={(e) => { e.stopPropagation(); if (!hasMovedDuringDrag.current) setSelectedId(id); }} 
                              onMouseEnter={() => setHoveredId(id)} onMouseLeave={() => setHoveredId(null)} 
                              className="transition-all duration-300 hover:brightness-95 cursor-pointer outline-none pointer-events-auto" 
                            />
                            {!isNaN(centroid[0]) && (
                              <g className="pointer-events-none">
                                <text transform={`translate(${centroid[0]}, ${centroid[1] + (10 / viewBoxTransform.k)})`} textAnchor="middle" fontSize={getDynamicFontSize(viewBoxTransform.k)} fontWeight={isSelected || isHovered ? "900" : "500"} fill={isSelected || isHovered ? "#16a34a" : "#1e293b"} className={`uppercase transition-all duration-300 ${isSelected || isHovered ? 'opacity-100' : 'opacity-40'}`}>{namesMap[id]}</text>
                                {data?.customMarkers?.map((m, mi) => (
                                  <g key={`pin-${mi}`} transform={`translate(${centroid[0] + (mi * 8 / viewBoxTransform.k) - (4 / viewBoxTransform.k)}, ${centroid[1] - (14 / viewBoxTransform.k)}) scale(${getDynamicIconScale(viewBoxTransform.k)})`} className="pointer-events-auto">
                                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill={m.color} stroke="white" strokeWidth="1.5" />
                                  </g>
                                ))}
                                {data?.scheduledTrips?.length > 0 && (
                                  <g transform={`translate(${centroid[0] - (8 / viewBoxTransform.k)}, ${centroid[1] - (14 / viewBoxTransform.k)}) scale(${getDynamicIconScale(viewBoxTransform.k) * 0.8})`} className="pointer-events-auto">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" fill="#2563eb" />
                                  </g>
                                )}
                              </g>
                            )}
                          </g>
                        );
                      })}
                    </g>
                  </svg>

                  {/* LEGENDA DRAGGABLE */}
                  <motion.div drag dragMomentum={false} className="absolute bottom-10 left-10 z-[60] cursor-grab active:cursor-grabbing hidden md:block">
                    <div className="bg-white/60 backdrop-blur-xl border border-white/20 p-3 rounded-2xl shadow-2xl flex items-center gap-4 hover:bg-white/80 transition-all group">
                      <div className="bg-slate-900/10 p-2 rounded-xl group-hover:bg-slate-900 group-hover:text-white transition-colors"><GripHorizontal className="w-3 h-3" /></div>
                      <div>
                        <p className="text-[8px] font-black uppercase text-slate-500 tracking-[0.2em] mb-1">Impacto de Visitas</p>
                        <div className="flex gap-1 items-center">
                          {COLOR_SCALE.map((color, i) => (
                            <div key={color} className="flex flex-col items-center gap-1 group/i">
                              <div className="w-5 h-2.5 rounded-sm border border-black/5" style={{ backgroundColor: color }} />
                              <span className="text-[6px] font-bold text-slate-400 group-hover/i:text-slate-900 transition-colors">{i === 5 ? '5+' : i}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* CONTROLES ZOOM */}
          <motion.div className="flex absolute bottom-28 right-6 lg:bottom-10 lg:right-10 z-[60] flex-col gap-3 p-1.5 bg-white/30 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl">
             <button type="button" onClick={() => applyTransform(viewBoxTransform.x, viewBoxTransform.y, Math.min(20, viewBoxTransform.k * 1.15))} className="w-10 h-10 lg:w-12 lg:h-12 bg-white/90 rounded-xl flex items-center justify-center text-slate-800 hover:bg-slate-900 hover:text-white transition-all shadow-sm"><Plus className="w-5 h-5" /></button>
             <button type="button" onClick={() => applyTransform(viewBoxTransform.x, viewBoxTransform.y, Math.max(0.1, viewBoxTransform.k / 1.15))} className="w-10 h-10 lg:w-12 lg:h-12 bg-white/90 rounded-xl flex items-center justify-center text-slate-800 hover:bg-slate-900 hover:text-white transition-all shadow-sm"><Minus className="w-5 h-5" /></button>
             <div className="w-full h-[1px] bg-slate-900/10 my-1" />
             <button type="button" onClick={resetMapTransform} className="w-10 h-10 lg:w-12 lg:h-12 bg-green-600/90 rounded-xl flex items-center justify-center text-white hover:bg-green-700 transition-all shadow-md"><RotateCcw className="w-5 h-5" /></button>
          </motion.div>
        </section>

        {/* SIDEBAR DETALHADA */}
        <AnimatePresence>
          {selectedId && (
            <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} className="md:col-span-5 lg:col-span-4 bg-slate-50 overflow-y-auto custom-scrollbar border-l border-slate-200 shadow-4xl z-50 fixed inset-0 md:relative md:inset-auto h-full">
              <div className="flex flex-col min-h-full">
                <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-md p-8 lg:p-12 pb-6 border-b border-slate-200">
                  <div className="flex justify-between items-center mb-6">
                    <button type="button" onClick={() => setSelectedId(null)} className="p-4 bg-white border border-slate-200 rounded-2xl hover:bg-slate-100 transition-all shadow-sm"><X className="w-6 h-6" /></button>
                    <div className="bg-green-600/10 text-green-600 px-5 py-2.5 rounded-full text-[10px] font-black uppercase">Ficha Técnica</div>
                  </div>
                  <h2 className="text-4xl lg:text-5xl font-black uppercase tracking-tighter text-slate-900 leading-none">{namesMap[selectedId]}</h2>
                </div>

                <div className="p-8 lg:p-12 space-y-10">
                  {/* IA TERRITORIAL */}
                  <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl">
                    <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsAiInfoExpanded(!isAiInfoExpanded)}>
                      <h4 className="text-[11px] font-black uppercase text-green-400 flex items-center gap-3"><Sparkles className="w-4 h-4" /> Insight IA</h4>
                      <motion.div animate={{ rotate: isAiInfoExpanded ? 180 : 0 }}><ChevronRight className="w-4 h-4 text-green-400" /></motion.div>
                    </div>
                    {isAiInfoExpanded && (
                      <div className="mt-6">
                        {aiInfo.loading ? <Loader2 className="w-5 h-5 animate-spin text-green-400" /> : <p className="text-sm font-medium text-slate-300 italic leading-relaxed pl-5 border-l-2 border-green-500/50">{aiInfo.text}</p>}
                      </div>
                    )}
                  </div>

                  {/* FORMULÁRIOS */}
                  <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 lg:p-10 shadow-xl space-y-6">
                    <h4 className="text-[12px] font-black uppercase text-slate-800 flex items-center gap-3 mb-4"><History className="w-6 h-6 text-green-600" /> Registrar Missão</h4>
                    <input type="text" value={visitTitle} onChange={e => setVisitTitle(e.target.value)} placeholder="Descrição da Missão" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm font-bold focus:border-green-500 outline-none" />
                    <div className="grid grid-cols-2 gap-4">
                      <input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-xs font-bold outline-none" />
                      <select value={visitPurpose} onChange={e => setVisitPurpose(e.target.value as VisitPurpose)} className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-xs font-bold outline-none uppercase">
                        <option value="trabalho">Trabalho (Oficial)</option>
                        <option value="lazer">Lazer</option>
                        <option value="passagem">Passagem</option>
                      </select>
                    </div>
                    {visitPurpose === 'trabalho' && (
                      <input type="number" value={visitAttendanceCount} onChange={e => setVisitAttendanceCount(parseInt(e.target.value) || 0)} placeholder="Total de Atendimentos" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm font-bold focus:border-green-500 outline-none" />
                    )}
                    <button type="button" onClick={addVisit} className="w-full bg-green-600 hover:bg-green-700 py-5 rounded-2xl font-black uppercase text-xs text-white flex items-center justify-center gap-4 transition-all shadow-xl active:scale-95"><Download className="w-5 h-5" /> Salvar Visita</button>
                  </div>

                  <div className="bg-slate-100 border border-slate-200 rounded-[2.5rem] p-8 lg:p-10 space-y-6">
                    <h4 className="text-[12px] font-black uppercase text-slate-800 flex items-center gap-3 mb-2"><Calendar className="w-6 h-6 text-blue-600" /> Agendar Futuro</h4>
                    <input type="text" value={scheduleTitle} onChange={e => setScheduleTitle(e.target.value)} placeholder="Compromisso Futuro" className="w-full bg-white border border-slate-200 rounded-2xl px-6 py-4 text-sm font-bold outline-none" />
                    <div className="grid grid-cols-2 gap-4">
                      <input type="date" value={scheduleStart} onChange={e => setScheduleStart(e.target.value)} className="bg-white border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold" />
                      <input type="date" value={scheduleEnd} onChange={e => setScheduleEnd(e.target.value)} className="bg-white border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold" />
                    </div>
                    <button type="button" onClick={addSchedule} className="w-full bg-blue-600 hover:bg-blue-700 py-5 rounded-2xl font-black uppercase text-xs text-white active:scale-95 transition-all">Adicionar à Agenda</button>
                  </div>

                  {/* LISTAGEM HISTÓRICA */}
                  <div className="space-y-6 pb-24">
                    <h4 className="text-[12px] font-black uppercase text-slate-400 flex items-center gap-3 ml-2"><History className="w-6 h-6" /> Registros Históricos</h4>
                    {userStats[selectedId]?.visits?.map((v, idx) => (
                      <div key={idx} className="bg-white border border-slate-200 p-6 rounded-[2.5rem] border-l-8 group relative shadow-sm" style={{ borderLeftColor: v.purpose === 'trabalho' ? '#16a34a' : (v.purpose === 'lazer' ? '#3b82f6' : '#fb923c') }}>
                        <button onClick={() => deleteItem(selectedId, 'visits', idx)} className="absolute top-6 right-6 p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-4 h-4" /></button>
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{new Date(v.date).toLocaleDateString('pt-BR')}</span>
                          <div className={`px-4 py-1.5 rounded-full text-[9px] font-black text-white uppercase flex items-center gap-1.5 ${PURPOSE_COLORS[v.purpose]}`}>{PURPOSE_ICONS[v.purpose]} {v.purpose}</div>
                        </div>
                        <h5 className="text-md font-black uppercase text-slate-800 pr-8 leading-tight">{v.title}</h5>
                        {v.attendanceCount !== undefined && <p className="mt-3 text-[11px] font-black text-green-600 flex items-center gap-2 uppercase"><Users className="w-4 h-4" /> {v.attendanceCount.toLocaleString()} Atendimentos</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </main>

      {/* DASHBOARD ANALÍTICO (MODAL RELATÓRIO) */}
      <AnimatePresence>
        {showReport && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[150] bg-slate-950/95 backdrop-blur-3xl flex items-center justify-center p-4 lg:p-12" onClick={() => setShowReport(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-slate-50 w-full max-w-[95vw] h-full max-h-[95vh] rounded-[3rem] overflow-hidden flex flex-col shadow-4xl relative" onClick={(e) => e.stopPropagation()}>
              
              <header className="sticky top-0 z-[160] p-8 lg:p-10 border-b flex flex-col lg:flex-row justify-between items-center bg-slate-900 text-white gap-6 shadow-lg">
                <div className="flex items-center gap-6">
                  <div className="bg-green-600 p-5 rounded-3xl text-white shadow-xl shadow-green-600/20"><BarChart3 className="w-8 h-8" /></div>
                  <div>
                    <h2 className="text-3xl font-black uppercase tracking-tighter leading-none">Dashboard de Impacto</h2>
                    <p className="text-[11px] font-bold text-green-400 uppercase tracking-[0.3em] mt-2">DPE Amazonas • Monitoramento Estratégico</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <button type="button" onClick={(e) => { e.stopPropagation(); exportPDF(); }} className="bg-white/10 hover:bg-white/20 px-6 py-4 rounded-2xl text-[10px] font-black uppercase flex items-center gap-3 transition-all">
                    <Download className="w-4 h-4" /> Exportar Dashboard
                  </button>
                  <button type="button" onClick={() => setShowReport(false)} className="p-5 bg-white/5 rounded-2xl hover:bg-white/10 transition-all">
                    <X className="w-6 h-6 text-white" />
                  </button>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-12 space-y-12">
                {/* FILTROS DO DASHBOARD */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Pesquisar Município</label>
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="text" 
                        value={reportFilterSearch} 
                        onChange={e => setReportFilterSearch(e.target.value)} 
                        placeholder="Nome da cidade..." 
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-4 text-xs font-bold outline-none focus:border-green-500"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Categoria</label>
                    <select 
                      value={reportFilterPurpose} 
                      onChange={e => setReportFilterPurpose(e.target.value as VisitPurpose)} 
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-xs font-bold outline-none uppercase"
                    >
                      <option value="todos">Todas Categorias</option>
                      <option value="trabalho">Trabalho (Oficial)</option>
                      <option value="lazer">Lazer</option>
                      <option value="passagem">Passagem</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Início</label>
                    <input type="date" value={reportFilterStart} onChange={e => setReportFilterStart(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-xs font-bold outline-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Fim</label>
                    <input type="date" value={reportFilterEnd} onChange={e => setReportFilterEnd(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-xs font-bold outline-none" />
                  </div>
                </div>

                <div ref={reportContentRef} className="space-y-12">
                  {/* KPI CARDS */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm flex flex-col justify-between">
                      <div className="flex justify-between items-start">
                        <div className="bg-green-100 p-3 rounded-2xl text-green-600"><Users className="w-6 h-6" /></div>
                        <ArrowUpRight className="w-4 h-4 text-slate-300" />
                      </div>
                      <div className="mt-6">
                        <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Total de Atendimentos</p>
                        <p className="text-4xl font-black text-slate-900 leading-none">{reportStats.totalAttendance.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm flex flex-col justify-between">
                      <div className="flex justify-between items-start">
                        <div className="bg-blue-100 p-3 rounded-2xl text-blue-600"><Globe className="w-6 h-6" /></div>
                        <ArrowUpRight className="w-4 h-4 text-slate-300" />
                      </div>
                      <div className="mt-6">
                        <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Cidades Visitadas</p>
                        <p className="text-4xl font-black text-slate-900 leading-none">{reportData.length}</p>
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm flex flex-col justify-between">
                      <div className="flex justify-between items-start">
                        <div className="bg-orange-100 p-3 rounded-2xl text-orange-600"><Activity className="w-6 h-6" /></div>
                        <ArrowUpRight className="w-4 h-4 text-slate-300" />
                      </div>
                      <div className="mt-6">
                        <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Total de Missões</p>
                        <p className="text-4xl font-black text-slate-900 leading-none">{reportStats.totalVisits}</p>
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm flex flex-col justify-between">
                      <div className="flex justify-between items-start">
                        <div className="bg-slate-100 p-3 rounded-2xl text-slate-600"><TrendingUp className="w-6 h-6" /></div>
                        <ArrowUpRight className="w-4 h-4 text-slate-300" />
                      </div>
                      <div className="mt-6">
                        <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Média Atend/Missão</p>
                        <p className="text-4xl font-black text-slate-900 leading-none">
                          {reportStats.totalVisits > 0 ? Math.round(reportStats.totalAttendance / reportStats.totalVisits).toLocaleString() : 0}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* GRÁFICOS */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-white border border-slate-200 p-10 rounded-[3rem] shadow-sm">
                      <div className="flex items-center gap-4 mb-8">
                        <div className="bg-green-600 w-2 h-8 rounded-full" />
                        <h4 className="text-lg font-black uppercase tracking-tight text-slate-900">Top Impacto Territorial</h4>
                      </div>
                      <BarChartComponent data={reportStats.topMunicipalities} />
                    </div>
                    <div className="bg-white border border-slate-200 p-10 rounded-[3rem] shadow-sm">
                      <div className="flex items-center gap-4 mb-8">
                        <div className="bg-blue-600 w-2 h-8 rounded-full" />
                        <h4 className="text-lg font-black uppercase tracking-tight text-slate-900">Distribuição por Categoria</h4>
                      </div>
                      <DonutChartComponent stats={reportStats.purposeCounts} />
                    </div>
                  </div>

                  {/* TABELA DETALHADA */}
                  <div className="bg-white border border-slate-200 rounded-[3rem] overflow-hidden shadow-sm">
                    <div className="p-8 border-b bg-slate-50 flex justify-between items-center">
                       <h4 className="text-[12px] font-black uppercase text-slate-900 flex items-center gap-3">
                         <FileText className="w-5 h-5 text-green-600" /> Detalhamento por Município
                       </h4>
                       <span className="text-[10px] font-black uppercase text-slate-400">{reportData.length} resultados encontrados</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest border-b">
                            <th className="px-8 py-6">Município</th>
                            <th className="px-8 py-6">Atendimentos</th>
                            <th className="px-8 py-6">Total de Missões</th>
                            <th className="px-8 py-6">Última Visita</th>
                            <th className="px-8 py-6 text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {reportData.map((m) => (
                            <tr key={m.id} className="hover:bg-slate-50 transition-colors group">
                              <td className="px-8 py-6">
                                <span className="text-sm font-black text-slate-900 uppercase tracking-tight">{m.name}</span>
                              </td>
                              <td className="px-8 py-6">
                                <div className="flex items-center gap-2">
                                  <Users className="w-3.5 h-3.5 text-green-600" />
                                  <span className="text-sm font-bold text-slate-700">{m.attendanceCount.toLocaleString()}</span>
                                </div>
                              </td>
                              <td className="px-8 py-6">
                                <div className="flex items-center gap-2">
                                  <Activity className="w-3.5 h-3.5 text-blue-500" />
                                  <span className="text-sm font-bold text-slate-700">{m.visitCount}</span>
                                </div>
                              </td>
                              <td className="px-8 py-6">
                                <span className="text-xs font-bold text-slate-400">
                                  {m.visits.length > 0 ? new Date(m.visits[0].date).toLocaleDateString('pt-BR') : 'Sem registro'}
                                </span>
                              </td>
                              <td className="px-8 py-6 text-right">
                                <button 
                                  onClick={() => { setShowReport(false); setSelectedId(m.id); }}
                                  className="p-3 bg-slate-100 rounded-xl text-slate-400 hover:bg-green-600 hover:text-white transition-all"
                                >
                                  <ChevronRight className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-8 border-t bg-white flex justify-end gap-4">
                <button type="button" onClick={() => setShowReport(false)} className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs hover:bg-slate-800 transition-all shadow-lg active:scale-95">Fechar Painel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
