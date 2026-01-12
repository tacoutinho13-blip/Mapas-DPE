
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Plus, 
  Minus,
  History, 
  Loader2,
  X,
  Map as MapIcon,
  Search,
  BarChart3,
  MapPin,
  RotateCcw,
  Calendar,
  Trash2,
  Edit2,
  LayoutDashboard,
  Target,
  Layers,
  Eye,
  EyeOff,
  Check,
  Star,
  MessageSquare,
  Users,
  Save,
  Clock,
  Cloud,
  CloudOff,
  RefreshCw,
  Github,
  Key,
  Maximize,
  ArrowUpRight,
  TrendingUp,
  FileText,
  Filter,
  ArrowUpDown,
  Copy,
  ExternalLink,
  ShieldCheck,
  Printer,
  Info,
  Bookmark,
  Download,
  Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { geoIdentity, geoPath } from 'd3-geo';
import Papa from 'papaparse';

// --- Tipos ---
type VisitPurpose = 'trabalho' | 'lazer' | 'passagem' | 'todos';

interface CustomMarker {
  label: string;
  color: string;
  id: string;
}

interface VisitRecord {
  title: string;
  startDate: string;
  endDate: string;
  purpose: VisitPurpose;
  observations?: string;
  attendanceCount?: number;
}

interface ScheduledTrip {
  title: string;
  startDate: string;
  endDate: string;
  observations?: string;
  calendarSynced?: boolean;
}

interface MunicipalityData {
  id: string;
  name: string;
  visits: VisitRecord[];
  scheduledTrips: ScheduledTrip[];
  customMarkers: CustomMarker[];
}

interface MapTooltipState {
  x: number;
  y: number;
  title: string;
  subtitle?: string;
  observations?: string;
  color?: string;
  type?: 'marker' | 'schedule' | 'municipality';
  cityId: string;
  daysRemaining?: number | null;
}

interface LayersVisibility {
  scheduled: boolean;
  markers: boolean;
  visibleFavoriteLabels: string[];
}

// --- Funções Utilitárias ---
const getDaysDiff = (dateStr: string) => {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = target.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// --- Configurações ---
const AM_GEOJSON_URL = "https://servicodados.ibge.gov.br/api/v3/malhas/estados/13?formato=application/vnd.geo+json&intrarregiao=municipio&qualidade=minima";
const AM_NAMES_URL = "https://servicodados.ibge.gov.br/api/v1/localidades/estados/13/municipios";
const STORAGE_KEY = "amazonas_travel_tracker_v51"; 
const MANAUS_ID = "1302603";
const COLOR_SCALE = ["#ffffff", "#dcfce7", "#bbf7d0", "#86efac", "#4ade80", "#16a34a"];
const PRESET_COLORS = [
  "#2563eb", "#60a5fa", "#1e3a8a", // Azuis
  "#dc2626", "#f87171", "#7f1d1d", // Vermelhos
  "#16a34a", "#4ade80", "#064e3b", // Verdes
  "#ca8a04", "#facc15", "#713f12", // Amarelos/Dourados
  "#7c3aed", "#a78bfa", "#4c1d95", // Roxos
  "#db2777", "#f472b6", "#831843", // Rosas
  "#475569", "#94a3b8", "#1e293b"  // Slates
];

const App: React.FC = () => {
  const [geoData, setGeoData] = useState<any>(null);
  const [namesMap, setNamesMap] = useState<Record<string, string>>({});
  const [userStats, setUserStats] = useState<Record<string, MunicipalityData>>({});
  const [markerLibrary, setMarkerLibrary] = useState<CustomMarker[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoadingMap, setIsLoadingMap] = useState(true);
  const [showReport, setShowReport] = useState(false);
  const [showImportExport, setShowImportExport] = useState(false);
  const [mapTooltip, setMapTooltip] = useState<MapTooltipState | null>(null);
  const [showLayers, setShowLayers] = useState(false);
  const tooltipTimerRef = useRef<number | null>(null);
  
  const [githubToken, setGithubToken] = useState<string>(localStorage.getItem('gh_token') || "");
  const [gistId, setGistId] = useState<string>(localStorage.getItem('gh_gist_id') || "");
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [showCloudConfig, setShowCloudConfig] = useState(false);
  const [identityInput, setIdentityInput] = useState("");
  
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoad = useRef(true);

  const [reportSearch, setReportSearch] = useState("");
  const [reportSort, setReportSort] = useState<{key: 'name' | 'visits' | 'attendees', desc: boolean}>({key: 'visits', desc: true});

  const [layersVisibility, setLayersVisibility] = useState<LayersVisibility>({
    scheduled: true,
    markers: true,
    visibleFavoriteLabels: [] 
  });

  const [viewBoxTransform, setViewBoxTransform] = useState({ x: 0, y: 0, k: 1 });
  const isDraggingMap = useRef(false);
  const mapHasMoved = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchList, setShowSearchList] = useState(false);

  const [editingVisitIdx, setEditingVisitIdx] = useState<number | null>(null);
  const [editingScheduleIdx, setEditingScheduleIdx] = useState<number | null>(null);

  const [visitTitle, setVisitTitle] = useState("Missão Concluída");
  const [visitStart, setVisitStart] = useState(new Date().toISOString().split('T')[0]);
  const [visitEnd, setVisitEnd] = useState(new Date().toISOString().split('T')[0]);
  const [visitAttendance, setVisitAttendance] = useState<number>(0);
  const [visitObs, setVisitObs] = useState("");
  const [scheduleTitle, setScheduleTitle] = useState("Missão Planejada");
  const [scheduleStart, setScheduleStart] = useState("");
  const [scheduleEnd, setScheduleEnd] = useState("");
  const [scheduleObs, setScheduleObs] = useState("");
  const [markerLabel, setMarkerLabel] = useState("");
  const [markerColor, setMarkerColor] = useState(PRESET_COLORS[0]);

  const mapWidth = 900;
  const mapHeight = 700;

  // --- Funções de Sincronização ---
  const copyIdentity = () => {
    const identity = JSON.stringify({ token: githubToken, gistId: gistId });
    const encoded = btoa(identity);
    navigator.clipboard.writeText(encoded);
    alert("Identidade de Sincronização copiada!");
  };

  const importIdentity = () => {
    try {
      const decoded = atob(identityInput);
      const parsed = JSON.parse(decoded);
      if (parsed.token) {
        setGithubToken(parsed.token);
        localStorage.setItem('gh_token', parsed.token);
      }
      if (parsed.gistId) {
        setGistId(parsed.gistId);
        localStorage.setItem('gh_gist_id', parsed.gistId);
      }
      setIdentityInput("");
      alert("Dispositivo vinculado com sucesso!");
      loadFromCloud();
    } catch (e) {
      alert("Código de identidade inválido.");
    }
  };

  const syncWithCloud = async (dataOverride?: { userStats: any, markerLibrary: any }) => {
    const token = localStorage.getItem('gh_token');
    const gId = localStorage.getItem('gh_gist_id');
    if (!token) return;
    setSyncStatus('syncing');
    const dataToSync = dataOverride || { userStats, markerLibrary };
    try {
      let method = 'POST', url = 'https://api.github.com/gists';
      const body: any = { description: "DPE AM Itinerante - Backup", public: false, files: { "dpe_amazonas_v50.json": { content: JSON.stringify(dataToSync) } } };
      if (gId) { method = 'PATCH'; url = `https://api.github.com/gists/${gId}`; }
      const response = await fetch(url, { method, headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (response.ok) {
        const json = await response.json();
        if (!gId) { setGistId(json.id); localStorage.setItem('gh_gist_id', json.id); }
        setSyncStatus('success');
        setTimeout(() => setSyncStatus('idle'), 2000);
      }
    } catch (e) { setSyncStatus('error'); }
  };

  const loadFromCloud = async () => {
    const token = localStorage.getItem('gh_token');
    const gId = localStorage.getItem('gh_gist_id');
    if (!token || !gId) return;
    setSyncStatus('syncing');
    try {
      const response = await fetch(`https://api.github.com/gists/${gId}`, { headers: { 'Authorization': `token ${token}`, 'Cache-Control': 'no-cache' } });
      if (response.ok) {
        const json = await response.json();
        const content = JSON.parse((Object.values(json.files)[0] as any).content);
        isInitialLoad.current = true;
        setUserStats(content.userStats || {});
        setMarkerLibrary(content.markerLibrary || []);
        setSyncStatus('success');
        setTimeout(() => { setSyncStatus('idle'); isInitialLoad.current = false; }, 1000);
        return true;
      }
    } catch (e) { setSyncStatus('error'); }
    return false;
  };

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      setUserStats(parsed.userStats || {});
      setMarkerLibrary(parsed.markerLibrary || []);
    }
    const bootstrap = async () => {
      setIsLoadingMap(true);
      try {
        const [nRes, gRes] = await Promise.all([fetch(AM_NAMES_URL), fetch(AM_GEOJSON_URL)]);
        if (nRes.ok) {
          const namesJson = await nRes.json();
          const mapping: Record<string, string> = {};
          namesJson.forEach((mun: any) => mapping[mun.id.toString()] = mun.nome);
          setNamesMap(mapping);
        }
        if (gRes.ok) setGeoData(await gRes.json());
        await loadFromCloud();
      } finally { setIsLoadingMap(false); }
    };
    bootstrap();
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ userStats, markerLibrary }));
    if (!isInitialLoad.current && githubToken) {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => syncWithCloud(), 1500);
    }
    return () => { if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current); };
  }, [userStats, markerLibrary, githubToken]);

  const saveGithubConfig = () => { localStorage.setItem('gh_token', githubToken); setShowCloudConfig(false); if (githubToken) syncWithCloud(); };

  // --- Handlers ---
  const onMouseDown = (e: React.MouseEvent) => { if (e.button !== 0) return; isDraggingMap.current = true; mapHasMoved.current = false; lastMousePos.current = { x: e.clientX, y: e.clientY }; };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingMap.current) return;
    const dx = e.clientX - lastMousePos.current.x, dy = e.clientY - lastMousePos.current.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      mapHasMoved.current = true; setViewBoxTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      lastMousePos.current = { x: e.clientX, y: e.clientY }; if (mapTooltip) hideTooltip();
    }
  };
  const onMouseUp = () => { isDraggingMap.current = false; };
  const handleWheel = (e: React.WheelEvent) => {
    const zoomIntensity = 0.1, delta = -e.deltaY, factor = Math.pow(1 + zoomIntensity, delta / 100), rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
    setViewBoxTransform(prev => {
      const newK = Math.min(Math.max(prev.k * factor, 0.5), 25);
      return { x: mouseX - (mouseX - prev.x) * (newK / prev.k), y: mouseY - (mouseY - prev.y) * (newK / prev.k), k: newK };
    });
  };
  const handleZoomButtons = (direction: 'in' | 'out') => {
    const factor = direction === 'in' ? 1.4 : 1 / 1.4;
    setViewBoxTransform(prev => {
      const newK = Math.min(Math.max(prev.k * factor, 0.5), 25);
      const centerX = (selectedId ? (window.innerWidth * 0.35) : window.innerWidth / 2), centerY = window.innerHeight / 2;
      return { x: centerX - (centerX - prev.x) * (newK / prev.k), y: centerY - (centerY - prev.y) * (newK / prev.k), k: newK };
    });
  };
  const resetZoom = () => setViewBoxTransform({ x: 0, y: 0, k: 1 });
  const showTooltip = (data: MapTooltipState) => { if (tooltipTimerRef.current) window.clearTimeout(tooltipTimerRef.current); setMapTooltip(data); tooltipTimerRef.current = window.setTimeout(() => setMapTooltip(null), 2000); };
  const hideTooltip = () => { if (tooltipTimerRef.current) window.clearTimeout(tooltipTimerRef.current); setMapTooltip(null); };

  const updateMunicipality = (id: string, update: Partial<MunicipalityData>) => {
    setUserStats(prev => {
      const current = prev[id] || { id, name: namesMap[id], visits: [], scheduledTrips: [], customMarkers: [] };
      return { ...prev, [id]: { ...current, ...update } };
    });
  };

  const saveVisit = () => {
    if (!selectedId) return;
    const newVisit: VisitRecord = { title: visitTitle, startDate: visitStart, endDate: visitEnd, purpose: 'trabalho', attendanceCount: visitAttendance, observations: visitObs };
    let visits = [...(userStats[selectedId]?.visits || [])];
    if (editingVisitIdx !== null) { visits[editingVisitIdx] = newVisit; setEditingVisitIdx(null); }
    else { visits = [newVisit, ...visits]; }
    visits.sort((a,b) => b.startDate.localeCompare(a.startDate));
    updateMunicipality(selectedId, { visits });
    setVisitTitle("Missão Concluída"); setVisitAttendance(0); setVisitObs("");
  };

  const saveSchedule = () => {
    if (!selectedId) return;
    const newTrip: ScheduledTrip = { title: scheduleTitle, startDate: scheduleStart, endDate: scheduleEnd, observations: scheduleObs };
    let scheduledTrips = [...(userStats[selectedId]?.scheduledTrips || [])];
    if (editingScheduleIdx !== null) { scheduledTrips[editingScheduleIdx] = newTrip; setEditingScheduleIdx(null); }
    else { scheduledTrips = [newTrip, ...scheduledTrips]; }
    updateMunicipality(selectedId, { scheduledTrips });
    setScheduleTitle("Missão Planejada"); setScheduleStart(""); setScheduleEnd(""); setScheduleObs("");
  };

  const startEditVisit = (idx: number) => {
    const v = userStats[selectedId!]!.visits[idx];
    setVisitTitle(v.title); setVisitStart(v.startDate); setVisitEnd(v.endDate); setVisitAttendance(v.attendanceCount || 0); setVisitObs(v.observations || "");
    setEditingVisitIdx(idx);
  };

  const startEditSchedule = (idx: number) => {
    const s = userStats[selectedId!]!.scheduledTrips[idx];
    setScheduleTitle(s.title); setScheduleStart(s.startDate); setScheduleEnd(s.endDate); setScheduleObs(s.observations || "");
    setEditingScheduleIdx(idx);
  };

  const saveToMarkerLibrary = () => {
    if (!markerLabel.trim()) return;
    const newMarker = { label: markerLabel, color: markerColor, id: Date.now().toString() };
    setMarkerLibrary(prev => [newMarker, ...prev]);
  };

  const addMarker = (labelOverride?: string, colorOverride?: string) => {
    if (!selectedId) return;
    const label = labelOverride || markerLabel, color = colorOverride || markerColor;
    if (!label.trim()) return;
    const customMarkers = [{ label, color, id: Date.now().toString() }, ...(userStats[selectedId]?.customMarkers || [])];
    updateMunicipality(selectedId, { customMarkers });
    if (!labelOverride) setMarkerLabel("");
  };

  const deleteSubItem = (cityId: string, type: 'visits' | 'scheduledTrips' | 'customMarkers', index: number) => {
    const list = [...(userStats[cityId][type] || [])];
    list.splice(index, 1);
    updateMunicipality(cityId, { [type]: list });
    hideTooltip();
  };

  const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

  const toggleFavoriteFilter = (label: string) => {
    setLayersVisibility(prev => {
      const alreadyVisible = prev.visibleFavoriteLabels.includes(label);
      return {
        ...prev,
        visibleFavoriteLabels: alreadyVisible 
          ? prev.visibleFavoriteLabels.filter(l => l !== label)
          : [...prev.visibleFavoriteLabels, label]
      };
    });
  };

  // --- Módulo de Importação/Exportação ---
  const downloadTemplate = () => {
    const csvContent = "Município,Título,Início (AAAA-MM-DD),Fim (AAAA-MM-DD),Tipo (Realizada ou Planejada),Assistidos,Observações\nManaus,Missão de Teste,2024-01-01,2024-01-05,Realizada,150,Observação teste aqui\nParintins,Ação Futura,2024-12-25,2024-12-30,Planejada,0,Exemplo de agendamento";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", "modelo_importacao_itinerante.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as any[];
        let importedCount = 0;
        let errors = 0;

        const newUserStats = { ...userStats };
        const normalizedNamesMap: Record<string, string> = {};
        
        // Criar um mapa reverso de nomes normalizados para IDs
        Object.entries(namesMap).forEach(([id, name]) => {
          normalizedNamesMap[normalize(name)] = id;
        });

        data.forEach(row => {
          const rawCityName = row['Município'] || "";
          const cityId = normalizedNamesMap[normalize(rawCityName)];

          if (cityId) {
            const type = (row['Tipo (Realizada ou Planejada)'] || "").toLowerCase();
            const title = row['Título'] || "Sem Título";
            const start = row['Início (AAAA-MM-DD)'] || new Date().toISOString().split('T')[0];
            const end = row['Fim (AAAA-MM-DD)'] || start;
            const obs = row['Observações'] || "";
            const count = parseInt(row['Assistidos']) || 0;

            if (!newUserStats[cityId]) {
              newUserStats[cityId] = { id: cityId, name: namesMap[cityId], visits: [], scheduledTrips: [], customMarkers: [] };
            }

            if (type.includes("realizada")) {
              newUserStats[cityId].visits.push({ title, startDate: start, endDate: end, purpose: 'trabalho', attendanceCount: count, observations: obs });
            } else if (type.includes("planejada")) {
              newUserStats[cityId].scheduledTrips.push({ title, startDate: start, endDate: end, observations: obs });
            }
            importedCount++;
          } else {
            errors++;
          }
        });

        setUserStats(newUserStats);
        alert(`Importação concluída!\nRegistros salvos: ${importedCount}\nMunicípios não reconhecidos: ${errors}`);
        setShowImportExport(false);
      }
    });
  };

  const projection = useMemo(() => geoData ? geoIdentity().reflectY(true).fitExtent([[50, 50], [mapWidth - 50, mapHeight - 70]], geoData) : null, [geoData]);
  const pathGenerator = useMemo(() => projection ? geoPath().projection(projection) : null, [projection]);
  const getFeatureId = useCallback((feature: any) => { const p = feature.properties || {}; return (p.codarea || p.codmun || p.CD_MUN || feature.id || "").toString(); }, []);

  const focusCity = (id: string) => {
    if (!geoData || !pathGenerator) return;
    const feature = geoData.features.find((f: any) => getFeatureId(f) === id);
    if (!feature) return;
    const centroid = pathGenerator.centroid(feature);
    setViewBoxTransform({ x: (selectedId ? (window.innerWidth * 0.35) : window.innerWidth / 2) - centroid[0] * 4, y: (window.innerHeight / 2) - centroid[1] * 4, k: 4 });
    setSelectedId(id); setShowSearchList(false);
  };

  const dashboardStats = useMemo(() => {
    const statsArray = Object.values(userStats) as MunicipalityData[];
    const totalMissions = statsArray.reduce((acc, curr) => acc + curr.visits.length, 0);
    const totalAttendees = statsArray.reduce((acc, curr) => acc + curr.visits.reduce((vAcc, v) => vAcc + (v.attendanceCount || 0), 0), 0);
    const totalSchedules = statsArray.reduce((acc, curr) => acc + curr.scheduledTrips.length, 0);
    const visitedCount = statsArray.filter(m => m.visits.length > 0).length;
    const coveragePercent = Math.round((visitedCount / 62) * 100);
    const sortedByMissions = [...statsArray].sort((a,b) => b.visits.length - a.visits.length).slice(0, 5);
    let tableData = statsArray.filter(m => m.name.toLowerCase().includes(reportSearch.toLowerCase()));
    tableData.sort((a, b) => {
      let valA, valB;
      if (reportSort.key === 'name') { valA = a.name; valB = b.name; }
      else if (reportSort.key === 'visits') { valA = a.visits.length; valB = b.visits.length; }
      else { valA = a.visits.reduce((acc, v) => acc + (v.attendanceCount || 0), 0); valB = b.visits.reduce((acc, v) => acc + (v.attendanceCount || 0), 0); }
      if (typeof valA === 'string') return reportSort.desc ? valB.toString().localeCompare(valA) : valA.localeCompare(valB.toString());
      return reportSort.desc ? (valB as number) - (valA as number) : (valA as number) - (valB as number);
    });
    return { totalMissions, totalAttendees, totalSchedules, visitedCount, coveragePercent, topCities: sortedByMissions, maxMissions: sortedByMissions[0]?.visits.length || 1, tableData };
  }, [userStats, reportSearch, reportSort]);

  const uniqueMarkerLabels = useMemo(() => {
    const labels = markerLibrary.map(m => m.label);
    return Array.from(new Set(labels));
  }, [markerLibrary]);

  return (
    <div className="h-screen bg-slate-50 flex flex-col overflow-hidden">
      <header className="bg-slate-900 border-b-4 border-green-500 px-6 py-4 flex items-center justify-between shadow-2xl text-white shrink-0 no-print">
        <div className="flex items-center gap-4"><div className="bg-green-600 p-2 rounded-xl"><Target className="w-6 h-6" /></div><div><h1 className="text-xl font-black uppercase tracking-tighter">Defensoria Itinerante</h1><p className="text-[9px] font-bold text-green-400 tracking-[0.3em] uppercase opacity-80">Gestão Regional Amazonas</p></div></div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-800 rounded-xl p-1 gap-1">
             <button onClick={() => setShowImportExport(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase text-slate-300 hover:bg-slate-700 transition-all"><Upload className="w-4 h-4"/> Importar/Exportar</button>
             <button onClick={() => { syncWithCloud(); }} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${syncStatus === 'syncing' ? 'bg-yellow-600 text-white animate-pulse' : syncStatus === 'error' ? 'bg-red-600 text-white' : syncStatus === 'success' ? 'bg-green-600 text-white' : 'hover:bg-slate-700 text-slate-300'}`}>{syncStatus === 'syncing' ? <RefreshCw className="w-4 h-4 animate-spin"/> : syncStatus === 'success' ? <ShieldCheck className="w-4 h-4"/> : <Cloud className="w-4 h-4"/>} {syncStatus === 'syncing' ? 'Salvando...' : syncStatus === 'success' ? 'Conectado' : 'Nuvem'}</button>
             <button onClick={() => setShowCloudConfig(true)} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400"><Github className="w-4 h-4"/></button>
          </div>
          <button onClick={() => setShowReport(true)} className="bg-green-600 hover:bg-green-500 px-5 py-3 rounded-xl text-xs font-black uppercase flex items-center gap-3 transition-all active:scale-95 shadow-xl"><LayoutDashboard className="w-4 h-4"/> Dashboards</button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden relative no-print">
        <section className={`relative flex flex-col bg-white overflow-hidden ${selectedId ? 'md:col-span-7 lg:col-span-8' : 'md:col-span-12'}`} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onWheel={handleWheel}>
          <div className="absolute top-8 left-8 z-[90] w-80"><div className="flex items-center bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden px-5 focus-within:border-green-500 transition-all"><Search className="w-5 h-5 text-slate-400" /><input type="text" value={searchQuery} onFocus={() => setShowSearchList(true)} onChange={e => setSearchQuery(e.target.value)} placeholder="Pesquisar Município..." className="w-full py-4 px-3 text-xs font-bold outline-none" /></div>{showSearchList && <motion.div className="mt-2 bg-white rounded-2xl shadow-4xl border border-slate-100 max-h-72 overflow-y-auto p-3 space-y-1">{(Object.entries(namesMap) as [string, string][]).filter(([_, n]) => n.toLowerCase().includes(searchQuery.toLowerCase())).map(([id, n]) => (<button key={id} onClick={() => focusCity(id)} className="w-full text-left p-4 hover:bg-green-600 hover:text-white rounded-xl text-[11px] font-black uppercase text-slate-700 transition-all">{n}</button>))}</motion.div>}</div>
          
          <div className="absolute bottom-8 right-8 z-[90] bg-white/90 backdrop-blur p-4 rounded-2xl shadow-2xl border border-slate-200 flex flex-col gap-2 items-center">
            <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Missões Concluídas</p>
            <div className="flex items-center gap-1">
              {COLOR_SCALE.map((color, i) => (
                <div key={i} className="flex flex-col items-center">
                  <div className="w-4 h-2 rounded-sm border border-slate-100" style={{ backgroundColor: color }} />
                  <span className="text-[7px] font-bold text-slate-400 mt-1">{i === 5 ? '5+' : i}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="absolute top-8 right-8 z-[90] flex gap-2">
            <button onClick={() => setShowLayers(!showLayers)} className={`p-4 rounded-2xl shadow-2xl transition-all flex items-center gap-3 border ${showLayers ? 'bg-slate-900 text-white border-slate-800' : 'bg-white text-slate-900 border-slate-200'}`}><Layers className="w-5 h-5" /><span className="text-[10px] font-black uppercase tracking-widest">Camadas</span></button>
          </div>

          <AnimatePresence>{showLayers && (
                <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} className="absolute right-8 top-24 bg-white border border-slate-200 shadow-4xl rounded-3xl p-6 w-80 space-y-6 z-[100] custom-scrollbar max-h-[70vh] overflow-y-auto">
                  <div className="space-y-4"><p className="text-[10px] font-black uppercase text-slate-400 tracking-widest border-b pb-2">Visibilidade Geral</p>
                    <button onClick={() => setLayersVisibility(v => ({ ...v, scheduled: !v.scheduled }))} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50"><div className="flex items-center gap-3 text-[11px] font-bold uppercase"><Calendar className="w-4 h-4 text-blue-600"/> Agenda</div>{layersVisibility.scheduled ? <Eye className="w-4 h-4 text-green-600"/> : <EyeOff className="w-4 h-4 text-slate-300"/>}</button>
                    <button onClick={() => setLayersVisibility(v => ({ ...v, markers: !v.markers }))} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50"><div className="flex items-center gap-3 text-[11px] font-bold uppercase"><MapPin className="w-4 h-4 text-orange-600"/> Marcadores</div>{layersVisibility.markers ? <Eye className="w-4 h-4 text-green-600"/> : <EyeOff className="w-4 h-4 text-slate-300"/>}</button>
                  </div>
                  
                  {uniqueMarkerLabels.length > 0 && layersVisibility.markers && (
                    <div className="space-y-4 pt-4 border-t border-slate-100">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest border-b pb-2">Filtrar por Favoritos</p>
                      <div className="space-y-1">
                        {uniqueMarkerLabels.map(label => {
                          const isActive = layersVisibility.visibleFavoriteLabels.includes(label);
                          const color = markerLibrary.find(m => m.label === label)?.color || "#cbd5e1";
                          
                          return (
                            <button 
                              key={label} 
                              onClick={() => toggleFavoriteFilter(label)} 
                              className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${isActive ? 'bg-orange-50 border border-orange-100' : 'hover:bg-slate-50 border border-transparent'}`}
                            >
                              <div className="flex items-center gap-3 text-[11px] font-bold uppercase truncate">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                {label}
                              </div>
                              {isActive ? <Eye className="w-3.5 h-3.5 text-orange-600"/> : <EyeOff className="w-3.5 h-3.5 text-slate-300"/>}
                            </button>
                          );
                        })}
                        {layersVisibility.visibleFavoriteLabels.length > 0 && (
                           <button 
                             onClick={() => setLayersVisibility(prev => ({ ...prev, visibleFavoriteLabels: [] }))} 
                             className="w-full text-center py-2 mt-2 text-[8px] font-black uppercase text-slate-400 hover:text-slate-600"
                           >
                             Limpar Filtros (Ver Todos)
                           </button>
                        )}
                      </div>
                    </div>
                  )}
                </motion.div>
          )}</AnimatePresence>

          <div className="absolute bottom-10 left-8 z-[90] flex flex-col gap-2"><button onClick={() => handleZoomButtons('in')} className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xl hover:bg-slate-50 text-slate-900"><Plus className="w-5 h-5"/></button><button onClick={() => handleZoomButtons('out')} className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xl hover:bg-slate-50 text-slate-900"><Minus className="w-5 h-5"/></button><button onClick={resetZoom} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl hover:bg-slate-800 text-white mt-2"><Maximize className="w-5 h-5"/></button></div>
          <div className="flex-1 relative overflow-hidden bg-slate-50">{isLoadingMap ? <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="animate-spin text-green-600 w-12 h-12" /></div> : (<div className="w-full h-full flex items-center justify-center"><svg viewBox={`0 0 ${mapWidth} ${mapHeight}`} className="w-full h-full select-none" style={{ overflow: 'visible' }}><g transform={`translate(${viewBoxTransform.x}, ${viewBoxTransform.y}) scale(${viewBoxTransform.k})`}>{geoData.features.map((f: any) => { const id = getFeatureId(f); const visitsCount = userStats[id]?.visits.length || 0; let fillColor = visitsCount > 0 ? COLOR_SCALE[Math.min(visitsCount, 5)] : (selectedId === id ? "#f1f5f9" : "#fff"); if (id === MANAUS_ID) fillColor = "#2563eb"; return (<path key={`poly-${id}`} d={pathGenerator!(f)!} fill={fillColor} stroke={selectedId === id ? "#16a34a" : "#e2e8f0"} strokeWidth={selectedId === id ? 1.8 : 0.8} onClick={() => !mapHasMoved.current && setSelectedId(id)} onMouseEnter={(e) => { if (isDraggingMap.current) return; showTooltip({ x: e.clientX, y: e.clientY, title: namesMap[id], cityId: id, type: 'municipality' }); }} onMouseLeave={hideTooltip} className="cursor-pointer hover:brightness-95 transition-all outline-none" />);})}{geoData.features.map((f: any) => { 
                    const id = getFeatureId(f); 
                    const centroid = pathGenerator!.centroid(f); 
                    if (isNaN(centroid[0])) return null;
                    
                    const normalizedName = normalize(namesMap[id] || "");
                    let dx = 0;
                    let dy = 0;
                    
                    if (["SILVES", "BARREIRINHA", "MANAQUIRI", "TAPAUA", "COARI", "NOVO AIRAO"].includes(normalizedName)) dy = 6;
                    if (["NOVO AIRAO", "BORBA", "MANICORE", "PARINTINS", "MARAA", "FONTE BOA", "SANTA ISABEL DO RIO NEGRO"].includes(normalizedName)) dx = 5;
                    if (normalizedName === "MANAUS") dy = 9;
                    
                    return (<text key={`text-${id}`} transform={`translate(${centroid[0] + dx}, ${centroid[1] + dy})`} fontSize={5.5} textAnchor="middle" pointerEvents="none" className={`font-black uppercase tracking-tight select-none ${id === MANAUS_ID ? 'fill-white' : 'fill-slate-900 opacity-60'}`}>{namesMap[id]}</text>);
                  })}{geoData.features.map((f: any) => { 
                    const id = getFeatureId(f); 
                    const d = userStats[id]; 
                    const centroid = pathGenerator!.centroid(f); 
                    if (isNaN(centroid[0]) || !d) return null; 

                    const normalizedName = normalize(namesMap[id] || "");
                    let nameDx = 0;
                    let nameDy = 0;
                    if (["SILVES", "BARREIRINHA", "MANAQUIRI", "TAPAUA", "COARI", "NOVO AIRAO"].includes(normalizedName)) nameDy = 6;
                    if (["NOVO AIRAO", "BORBA", "MANICORE", "PARINTINS", "MARAA", "FONTE BOA", "SANTA ISABEL DO RIO NEGRO"].includes(normalizedName)) nameDx = 5;
                    if (normalizedName === "MANAUS") nameDy = 9;

                    let iconDy = 0;
                    if (["SILVES", "CAREIRO", "MANAQUIRI", "MANACAPURU", "AUTAZES", "NOVA OLINDA DO NORTE", "ANORI", "ALVARES", "ALVARAES", "ITACOATIARA"].includes(normalizedName)) iconDy = 8;

                    const filteredMarkers = (d.customMarkers || []).filter(m => {
                      if (!layersVisibility.markers) return false;
                      if (layersVisibility.visibleFavoriteLabels.length > 0) {
                        return layersVisibility.visibleFavoriteLabels.includes(m.label);
                      }
                      return true;
                    });

                    const allIcons = [...filteredMarkers.map(m => ({...m, type: 'marker' as const})), ...(layersVisibility.scheduled ? d.scheduledTrips || [] : []).map(s => ({...s, type: 'schedule' as const}))]; 
                    
                    return (<g key={`icons-${id}`} pointerEvents="none">{allIcons.map((item, idx) => { 
                      const angle = (idx / Math.max(allIcons.length - 1, 1)) * Math.PI - Math.PI/2, ox = Math.cos(angle) * (allIcons.length > 1 ? 5 : 0), oy = Math.sin(angle) * (allIcons.length > 1 ? 5 : 0) - 10; 
                      const finalX = centroid[0] + ox + nameDx;
                      const finalY = centroid[1] + oy + nameDy + iconDy;

                      if (item.type === 'marker') { 
                        return (<g key={`m-${idx}`} transform={`translate(${finalX}, ${finalY}) scale(1.1) translate(-12, -22)`} pointerEvents="auto" onMouseEnter={(e) => { e.stopPropagation(); showTooltip({ x: e.clientX, y: e.clientY, title: (item as any).label, color: (item as any).color, type: 'marker', cityId: id }); }} onMouseLeave={hideTooltip} className="cursor-help"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill={(item as any).color} stroke="white" strokeWidth="1.5" /><circle cx="12" cy="9" r="2.5" fill="white" /></g>); 
                      } else { 
                        return (<g key={`s-${idx}`} transform={`translate(${finalX - 8}, ${finalY - 8}) scale(0.9)`} pointerEvents="auto" onMouseEnter={(e) => { e.stopPropagation(); showTooltip({ x: e.clientX, y: e.clientY, title: (item as any).title, subtitle: `${(item as any).startDate} a ${(item as any).endDate}`, observations: (item as any).observations, type: 'schedule', cityId: id, daysRemaining: getDaysDiff((item as any).startDate) }); }} onMouseLeave={hideTooltip} className="cursor-help"><rect width="16" height="16" rx="3" fill="#2563eb" stroke="white" strokeWidth="1" /><rect x="3" y="2" width="2" height="3" rx="1" fill="white" /><rect x="11" y="2" width="2" height="3" rx="1" fill="white" /></g>); 
                      } 
                    })}</g>); 
                  })}</g></svg></div>)}</div>
          <AnimatePresence>{mapTooltip && (<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ top: mapTooltip.y - 80, left: mapTooltip.x - 60 }} className="fixed z-[400] bg-slate-900 text-white p-5 rounded-3xl shadow-4xl pointer-events-none border border-slate-700 min-w-[220px]"><div className="space-y-3"><div className="flex items-center gap-3">{mapTooltip.color ? <div className="w-3 h-3 rounded-full" style={{ backgroundColor: mapTooltip.color }} /> : (mapTooltip.type === 'schedule' ? <Calendar className="w-3 h-3 text-blue-400"/> : <MapIcon className="w-3 h-3 text-green-400"/>)}<p className="text-xs font-black uppercase tracking-tight">{mapTooltip.title}</p></div>{mapTooltip.subtitle && <p className="text-[10px] font-bold text-slate-400 border-t border-white/5 pt-2">{mapTooltip.subtitle}</p>}{mapTooltip.observations && <p className="text-[9px] text-slate-500 italic">"{mapTooltip.observations.slice(0, 50)}..."</p>}{mapTooltip.daysRemaining !== undefined && mapTooltip.daysRemaining !== null && (<div className="flex items-center gap-2 text-[10px] font-black uppercase text-blue-400"><Clock className="w-3 h-3"/>{mapTooltip.daysRemaining === 0 ? "É HOJE!" : (mapTooltip.daysRemaining > 0 ? `FALTAM ${mapTooltip.daysRemaining} DIAS` : `OCORREU HÁ ${Math.abs(mapTooltip.daysRemaining)} DIAS`)}</div>)}</motion.div>)}</AnimatePresence>
        </section>

        <AnimatePresence>{selectedId && (
            <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} className="md:col-span-5 lg:col-span-4 bg-white border-l overflow-y-auto custom-scrollbar p-8 lg:p-12 space-y-10 z-[110] shadow-2xl no-print">
              <div className="flex justify-between items-start"><div><h2 className="text-4xl font-black uppercase tracking-tighter text-slate-900">{namesMap[selectedId]}</h2><p className="text-[10px] font-bold uppercase text-green-600 mt-2">Dossiê Estratégico</p></div><button onClick={() => { setSelectedId(null); }} className="p-4 bg-slate-100 rounded-2xl hover:bg-slate-200"><X /></button></div>
              <div className="space-y-8">
                 {userStats[selectedId] ? (
                   <div className="space-y-10">
                      {(userStats[selectedId].customMarkers?.length > 0) && (<div className="space-y-4"><p className="text-[9px] font-black text-orange-600 uppercase border-b pb-2 tracking-widest">Fixados</p>{userStats[selectedId].customMarkers.map((m, i) => (<div key={i} className="flex items-center justify-between p-4 border rounded-2xl bg-white"><div className="flex items-center gap-3"><div className="w-3 h-3 rounded-full" style={{backgroundColor: m.color}}/><span className="text-[11px] font-bold uppercase text-slate-700">{m.label}</span></div><button onClick={() => deleteSubItem(selectedId, 'customMarkers', i)} className="text-red-300 hover:text-red-500"><Trash2 className="w-4 h-4"/></button></div>))}</div>)}
                      {userStats[selectedId].scheduledTrips?.length > 0 && (
                        <div className="space-y-4"><p className="text-[9px] font-black text-blue-600 uppercase border-b pb-2 tracking-widest">Programados</p>
                           {userStats[selectedId].scheduledTrips.map((s, i) => (<div key={i} className={`p-6 rounded-[1.8rem] space-y-3 group border transition-all ${editingScheduleIdx === i ? 'bg-blue-50 border-blue-300' : 'bg-slate-50 border-slate-100'}`}><div className="flex justify-between items-start"><div><p className="text-xs font-black uppercase text-slate-800">{s.title}</p><p className="text-[9px] font-bold text-slate-500 uppercase mt-1">{s.startDate} até {s.endDate}</p></div><div className="flex gap-2"><button onClick={() => startEditSchedule(i)} className="text-blue-400 hover:text-blue-600"><Edit2 className="w-4 h-4"/></button><button onClick={() => deleteSubItem(selectedId, 'scheduledTrips', i)} className="text-red-300 hover:text-red-500"><Trash2 className="w-4 h-4"/></button></div></div>{s.observations && <p className="text-[10px] italic text-slate-500 bg-white/50 p-3 rounded-xl border border-blue-100/50">{s.observations}</p>}</div>))}
                        </div>
                      )}
                      {userStats[selectedId].visits?.length > 0 && (<div className="space-y-4"><p className="text-[9px] font-black text-green-600 uppercase border-b pb-2 tracking-widest">Concluídos</p>{userStats[selectedId].visits.map((v, i) => (<div key={i} className={`p-6 rounded-[1.8rem] space-y-3 group border transition-all ${editingVisitIdx === i ? 'bg-green-50 border-green-300' : 'bg-slate-50 border-slate-100'}`}><div className="flex justify-between items-start"><div><p className="text-xs font-black uppercase text-slate-800">{v.title}</p><p className="text-[9px] font-bold text-slate-500 uppercase mt-1">{v.startDate} até {v.endDate}</p></div><div className="flex gap-2"><button onClick={() => startEditVisit(i)} className="text-blue-400 hover:text-blue-600"><Edit2 className="w-4 h-4"/></button><button onClick={() => deleteSubItem(selectedId, 'visits', i)} className="text-red-300 hover:text-red-500"><Trash2 className="w-4 h-4"/></button></div></div>{v.observations && <p className="text-[10px] italic text-slate-500 bg-white/50 p-3 rounded-xl border border-green-100/50">{v.observations}</p>}<div className="flex gap-4 pt-2"><div className="flex items-center gap-1 text-green-600 font-bold text-[10px]"><Users className="w-3 h-3"/> {v.attendanceCount} Assistidos</div></div></div>))}</div>)}
                   </div>
                 ) : <div className="text-center py-16 border-2 border-dashed rounded-[2.5rem] bg-slate-50"><p className="text-[10px] font-black uppercase text-slate-400">Sem registros</p></div>}
              </div>
              <div className="space-y-10 pt-10 border-t">
                <div className="bg-blue-50/50 p-8 rounded-[2.5rem] space-y-6 border border-blue-100"><h4 className="text-[11px] font-black uppercase flex items-center gap-3 text-blue-800"><Calendar className="w-5 h-5 text-blue-600"/> Planejar</h4><input value={scheduleTitle} onChange={e => setScheduleTitle(e.target.value)} placeholder="Título da Ação" className="w-full p-5 border rounded-2xl text-sm font-bold bg-white outline-none focus:ring-2 ring-blue-500/20" /><div className="grid grid-cols-2 gap-3"><input type="date" value={scheduleStart} onChange={e => setScheduleStart(e.target.value)} className="w-full p-4 border rounded-2xl text-[10px] font-bold bg-white" /><input type="date" value={scheduleEnd} onChange={e => setScheduleEnd(e.target.value)} className="w-full p-4 border rounded-2xl text-[10px] font-bold bg-white" /></div><textarea value={scheduleObs} onChange={e => setScheduleObs(e.target.value)} placeholder="Observações e detalhes..." className="w-full p-5 border rounded-2xl text-xs font-bold bg-white h-24 resize-none outline-none focus:ring-2 ring-blue-500/20" /><button onClick={saveSchedule} className="w-full bg-blue-600 text-white p-5 rounded-[1.5rem] text-xs font-black uppercase shadow-lg shadow-blue-500/30">Salvar Agendamento</button></div>
                
                <div className="bg-green-50/30 p-8 rounded-[2.5rem] space-y-6 border border-green-100"><h4 className="text-[11px] font-black uppercase flex items-center gap-3 text-green-800"><History className="w-5 h-5 text-green-600"/> Registrar</h4><input value={visitTitle} onChange={e => setVisitTitle(e.target.value)} placeholder="Título da Missão" className="w-full p-5 border rounded-2xl text-sm font-bold bg-white" /><div className="grid grid-cols-2 gap-3"><input type="date" value={visitStart} onChange={e => setVisitStart(e.target.value)} className="w-full p-4 border rounded-2xl text-[10px] font-bold bg-white" /><input type="date" value={visitEnd} onChange={e => setVisitEnd(e.target.value)} className="w-full p-4 border rounded-2xl text-[10px] font-bold bg-white" /></div><input type="number" value={visitAttendance} onChange={(e) => setVisitAttendance(Number(e.target.value) || 0)} placeholder="Total de Assistidos" className="w-full p-5 border rounded-2xl text-sm font-bold bg-white" /><textarea value={visitObs} onChange={e => setVisitObs(e.target.value)} placeholder="Principais ocorrências..." className="w-full p-5 border rounded-2xl text-xs font-bold bg-white h-24 resize-none" /><button onClick={saveVisit} className="w-full bg-green-600 text-white p-5 rounded-[1.5rem] text-xs font-black uppercase shadow-lg shadow-green-500/30">Registrar Missão</button></div>
                
                <div className="bg-orange-50/50 p-8 rounded-[2.5rem] space-y-6 border border-orange-100">
                  <h4 className="text-[11px] font-black uppercase flex items-center gap-3 text-orange-800"><MapPin className="w-5 h-5 text-orange-600"/> Novo Marcador</h4>
                  <div className="flex gap-2">
                    <input value={markerLabel} onChange={e => setMarkerLabel(e.target.value)} placeholder="Ex: Sede, Base, Porto..." className="flex-1 p-5 border rounded-2xl text-sm font-bold bg-white" />
                    <button onClick={saveToMarkerLibrary} className="p-4 bg-white border border-orange-200 rounded-2xl hover:bg-orange-100 transition-all text-orange-600" title="Salvar na Biblioteca"><Bookmark className="w-5 h-5"/></button>
                  </div>
                  <div className="flex gap-2 flex-wrap max-h-32 overflow-y-auto custom-scrollbar p-1">
                    {PRESET_COLORS.map(c => (<button key={c} onClick={() => setMarkerColor(c)} className={`w-8 h-8 rounded-xl border-2 transition-transform active:scale-90 ${markerColor === c ? 'border-slate-900 scale-110' : 'border-transparent opacity-60'}`} style={{backgroundColor: c}} />))}
                  </div>
                  
                  {markerLibrary.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Meus Marcadores Salvos</p>
                      <div className="flex gap-2 flex-wrap">
                        {markerLibrary.map((lib, idx) => (
                          <button 
                            key={lib.id} 
                            onClick={() => { setMarkerLabel(lib.label); setMarkerColor(lib.color); }}
                            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-[9px] font-bold uppercase flex items-center gap-2 hover:border-orange-400 transition-all"
                          >
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: lib.color }} />
                            {lib.label}
                            <Trash2 onClick={(e) => { e.stopPropagation(); setMarkerLibrary(prev => prev.filter(m => m.id !== lib.id)); }} className="w-3 h-3 text-slate-300 hover:text-red-500 ml-1" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <button onClick={() => addMarker()} className="w-full bg-orange-600 text-white p-5 rounded-[1.5rem] text-xs font-black uppercase shadow-lg shadow-orange-500/30">Fixar no Mapa</button>
                </div>
              </div>
            </motion.aside>
          )}</AnimatePresence>
      </main>

      <AnimatePresence>{showImportExport && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[600] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6" onClick={() => setShowImportExport(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-4xl" onClick={e => e.stopPropagation()}>
              <header className="p-8 bg-slate-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-4"><Upload className="w-6 h-6 text-green-500"/><h2 className="text-xl font-black uppercase">Importar Planilha</h2></div>
                <button onClick={() => setShowImportExport(false)} className="p-2 hover:bg-white/10 rounded-full transition-all"><X/></button>
              </header>
              <div className="p-10 space-y-8 text-center">
                <div className="p-8 border-2 border-dashed border-slate-200 rounded-[2rem] bg-slate-50 space-y-4">
                  <p className="text-xs font-bold text-slate-600">Arraste seu arquivo CSV ou clique abaixo para selecionar</p>
                  <label className="inline-block px-6 py-3 bg-green-600 text-white rounded-xl text-[10px] font-black uppercase cursor-pointer hover:bg-green-500 transition-all">
                    Selecionar Arquivo
                    <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>
                <div className="space-y-4">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Não tem a planilha?</p>
                  <button onClick={downloadTemplate} className="w-full p-4 bg-slate-100 border border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-700 hover:bg-slate-200 flex items-center justify-center gap-3 transition-all"><Download className="w-4 h-4"/> Baixar Modelo de Planilha</button>
                </div>
                <div className="p-5 bg-blue-50 rounded-2xl border border-blue-100 flex gap-4 items-start text-left">
                  <Info className="w-5 h-5 text-blue-600 shrink-0 mt-1"/>
                  <p className="text-[10px] font-bold text-blue-800 leading-relaxed uppercase">O sistema reconhecerá automaticamente o nome do município e distribuirá as informações entre ações realizadas e agendadas.</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
      )}</AnimatePresence>

      <AnimatePresence>{showCloudConfig && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[600] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6" onClick={() => setShowCloudConfig(false)}><motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-4xl" onClick={e => e.stopPropagation()}><header className="p-8 bg-slate-900 text-white flex justify-between items-center"><div className="flex items-center gap-4"><Github className="w-6 h-6 text-green-500"/><h2 className="text-xl font-black uppercase">Vincular Dispositivos</h2></div><button onClick={() => setShowCloudConfig(false)} className="p-2"><X/></button></header><div className="p-10 space-y-8"><div className="p-6 bg-slate-50 border rounded-2xl space-y-4"><p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">Sua Chave Atual</p><button onClick={copyIdentity} className="w-full bg-slate-900 text-white p-4 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2"><Copy className="w-4 h-4"/> Copiar Chave de Acesso</button></div><div className="space-y-4"><p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">Vincular Nova Chave</p><div className="flex gap-2"><input type="text" value={identityInput} onChange={e => setIdentityInput(e.target.value)} placeholder="Cole o código aqui..." className="flex-1 p-4 border rounded-xl text-xs font-bold outline-none bg-slate-50" /><button onClick={importIdentity} className="bg-green-600 text-white px-6 rounded-xl text-[10px] font-black uppercase">Vincular</button></div></div><div className="border-t pt-6 space-y-4"><p className="text-[10px] font-black uppercase text-slate-400">Manual (GitHub PAT)</p><input type="password" value={githubToken} onChange={e => setGithubToken(e.target.value)} placeholder="ghp_xxxxxxxxxxxx" className="w-full p-4 border rounded-xl text-xs font-bold" /><button onClick={saveGithubConfig} className="w-full bg-slate-900 text-white p-4 rounded-xl text-[10px] font-black uppercase">Salvar Manualmente</button></div></div></motion.div></motion.div>
      )}</AnimatePresence>

      <AnimatePresence>
        {showReport && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[500] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 no-print" onClick={() => setShowReport(false)}>
            <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="bg-white w-full max-w-6xl rounded-[3rem] overflow-hidden shadow-4xl flex flex-col h-[90vh] print-expand" onClick={e => e.stopPropagation()}>
               <header className="p-8 lg:p-10 bg-slate-900 text-white flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-4">
                    <div className="bg-green-600 p-3 rounded-2xl"><BarChart3 className="w-8 h-8 text-white"/></div>
                    <div>
                      <h2 className="text-2xl font-black uppercase tracking-tight leading-tight">Painel de Impacto Regional</h2>
                      <p className="text-[10px] font-bold text-green-400 uppercase tracking-widest opacity-80">Relatório Estratégico AM Itinerante</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 no-print">
                    <button onClick={() => window.print()} className="px-5 py-3 bg-green-600 hover:bg-green-500 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 transition-all"><Printer className="w-4 h-4"/> Imprimir Dossiê</button>
                    <button onClick={() => setShowReport(false)} className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all"><X/></button>
                  </div>
               </header>
               <div className="flex-1 overflow-y-auto bg-white p-8 lg:p-12 space-y-12 custom-scrollbar">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 print-shadow-none space-y-3 relative overflow-hidden">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Cobertura Estadual</p>
                      <div className="flex items-baseline gap-2"><h3 className="text-4xl font-black text-slate-900">{dashboardStats.coveragePercent}%</h3><span className="text-xs font-bold text-green-600">({dashboardStats.visitedCount}/62)</span></div>
                    </div>
                    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 print-shadow-none space-y-3 relative overflow-hidden">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Assistidos Totais</p>
                      <h3 className="text-4xl font-black text-slate-900">{dashboardStats.totalAttendees.toLocaleString()}</h3>
                    </div>
                    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 print-shadow-none space-y-3 relative overflow-hidden">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Missões Realizadas</p>
                      <h3 className="text-4xl font-black text-slate-900">{dashboardStats.totalMissions}</h3>
                    </div>
                    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 print-shadow-none space-y-3 relative overflow-hidden">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ações em Agenda</p>
                      <h3 className="text-4xl font-black text-slate-900">{dashboardStats.totalSchedules}</h3>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 break-inside-avoid">
                    <div className="bg-white p-10 rounded-[3rem] border border-slate-200 print-shadow-none space-y-8">
                      <h4 className="text-sm font-black uppercase text-slate-800 tracking-tight">Top 5: Municípios de Atuação</h4>
                      <div className="space-y-6">
                        {dashboardStats.topCities.map((city, i) => {
                          const percent = Math.max(10, (city.visits.length / dashboardStats.maxMissions) * 100);
                          return (
                            <div key={city.id} className="space-y-2">
                              <div className="flex justify-between items-end"><span className="text-[10px] font-black uppercase text-slate-600">{city.name}</span><span className="text-xs font-black text-slate-900">{city.visits.length} Missões</span></div>
                              <div className="w-full h-3 bg-slate-50 rounded-full overflow-hidden border"><div style={{width: `${percent}%`}} className={`h-full ${i === 0 ? 'bg-green-600' : 'bg-slate-700'}`} /></div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="bg-white p-10 rounded-[3rem] border border-slate-200 print-shadow-none flex flex-col items-center justify-center text-center space-y-6">
                        <h4 className="text-sm font-black uppercase text-slate-800 tracking-tight">Status Operacional Global</h4>
                        <div className="relative w-40 h-40">
                           <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                             <circle cx="50" cy="50" r="45" fill="none" stroke="#f1f5f9" strokeWidth="10"/>
                             <circle cx="50" cy="50" r="45" fill="none" stroke="#16a34a" strokeWidth="10" strokeDasharray={`${dashboardStats.coveragePercent * 2.82} 283`} strokeLinecap="round" />
                           </svg>
                           <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-3xl font-black text-slate-900">{dashboardStats.coveragePercent}%</span></div>
                        </div>
                    </div>
                  </div>
                  <div className="bg-white rounded-[3rem] border border-slate-200 print-shadow-none overflow-hidden flex flex-col break-inside-avoid">
                    <div className="p-8 border-b flex justify-between items-center no-print"><h4 className="text-sm font-black uppercase text-slate-800">Detalhamento Regional</h4><div className="relative w-80"><Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/><input type="text" placeholder="Filtrar..." value={reportSearch} onChange={e => setReportSearch(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-slate-50 border rounded-2xl text-xs font-bold outline-none" /></div></div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-slate-900 text-[10px] font-black uppercase text-slate-400">
                          <tr><th className="p-6">Município</th><th className="p-6">Missões</th><th className="p-6">Assistidos</th><th className="p-6 text-right no-print">Ação</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {dashboardStats.tableData.map(m => (
                            <tr key={m.id} className="hover:bg-green-50/50 transition-colors">
                              <td className="p-6 font-black uppercase text-slate-800 text-xs">{m.name}</td>
                              <td className="p-6 font-black text-slate-600">{m.visits.length}</td>
                              <td className="p-6 font-black text-slate-900">{m.visits.reduce((acc, v) => acc + (v.attendanceCount || 0), 0).toLocaleString()}</td>
                              <td className="p-6 text-right no-print"><button onClick={() => { setShowReport(false); focusCity(m.id); }} className="p-3 bg-slate-100 hover:bg-green-600 hover:text-white rounded-xl transition-all"><Target className="w-4 h-4"/></button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
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
