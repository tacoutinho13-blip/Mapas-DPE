
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
  Key
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { geoIdentity, geoPath } from 'd3-geo';

// --- Tipos ---
type VisitPurpose = 'trabalho' | 'lazer' | 'passagem' | 'todos';

interface CustomMarker {
  label: string;
  color: string;
  id?: string;
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
const STORAGE_KEY = "amazonas_travel_tracker_v50"; 
const MANAUS_ID = "1302603";
const COLOR_SCALE = ["#ffffff", "#dcfce7", "#bbf7d0", "#86efac", "#4ade80", "#16a34a"];
const PRESET_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#ca8a04", "#7c3aed", "#db2777", "#475569", "#0891b2"];

const App: React.FC = () => {
  const [geoData, setGeoData] = useState<any>(null);
  const [namesMap, setNamesMap] = useState<Record<string, string>>({});
  const [userStats, setUserStats] = useState<Record<string, MunicipalityData>>({});
  const [markerLibrary, setMarkerLibrary] = useState<CustomMarker[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoadingMap, setIsLoadingMap] = useState(true);
  const [showReport, setShowReport] = useState(false);
  const [mapTooltip, setMapTooltip] = useState<MapTooltipState | null>(null);
  const [showLayers, setShowLayers] = useState(false);
  const tooltipTimerRef = useRef<number | null>(null);
  
  const [githubToken, setGithubToken] = useState<string>(localStorage.getItem('gh_token') || "");
  const [gistId, setGistId] = useState<string>(localStorage.getItem('gh_gist_id') || "");
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [showCloudConfig, setShowCloudConfig] = useState(false);

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

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      setUserStats(parsed.userStats || {});
      setMarkerLibrary(parsed.markerLibrary || []);
    }
    const loadData = async () => {
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
      } finally { setIsLoadingMap(false); }
    };
    loadData();
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ userStats, markerLibrary }));
  }, [userStats, markerLibrary]);

  const syncWithCloud = async () => {
    if (!githubToken) { setShowCloudConfig(true); return; }
    setSyncStatus('syncing');
    const dataToSync = { userStats, markerLibrary };
    const fileName = "dpe_amazonas_v50.json";
    try {
      let method = 'POST';
      let url = 'https://api.github.com/gists';
      const body: any = { description: "DPE Amazonas Itinerante - Backup", public: false, files: { [fileName]: { content: JSON.stringify(dataToSync) } } };
      if (gistId) { method = 'PATCH'; url = `https://api.github.com/gists/${gistId}`; }
      const response = await fetch(url, { method, headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (response.ok) {
        const json = await response.json() as any;
        setGistId(json.id);
        localStorage.setItem('gh_gist_id', json.id);
        setSyncStatus('success');
        setTimeout(() => setSyncStatus('idle'), 3000);
      } else { throw new Error('Erro na API'); }
    } catch (e) { setSyncStatus('error'); }
  };

  const loadFromCloud = async () => {
    if (!githubToken || !gistId) return;
    setSyncStatus('syncing');
    try {
      const response = await fetch(`https://api.github.com/gists/${gistId}`, { headers: { 'Authorization': `token ${githubToken}` } });
      if (response.ok) {
        const json = await response.json() as any;
        const content = JSON.parse((Object.values(json.files)[0] as any).content);
        setUserStats(content.userStats || {});
        setMarkerLibrary(content.markerLibrary || []);
        setSyncStatus('success');
        setTimeout(() => setSyncStatus('idle'), 3000);
      }
    } catch (e) { setSyncStatus('error'); }
  };

  const saveGithubConfig = () => { localStorage.setItem('gh_token', githubToken); setShowCloudConfig(false); if (githubToken) syncWithCloud(); };

  const onMouseDown = (e: React.MouseEvent) => { if (e.button !== 0) return; isDraggingMap.current = true; mapHasMoved.current = false; lastMousePos.current = { x: e.clientX, y: e.clientY }; };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingMap.current) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) { mapHasMoved.current = true; setViewBoxTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy })); lastMousePos.current = { x: e.clientX, y: e.clientY }; if (mapTooltip) hideTooltip(); }
  };
  const onMouseUp = () => { isDraggingMap.current = false; };

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

  const addMarker = (labelOverride?: string, colorOverride?: string) => {
    if (!selectedId) return;
    const label = labelOverride || markerLabel;
    const color = colorOverride || markerColor;
    if (!label.trim()) return;
    const newMarker: CustomMarker = { label, color, id: Date.now().toString() };
    const customMarkers = [newMarker, ...(userStats[selectedId]?.customMarkers || [])];
    updateMunicipality(selectedId, { customMarkers });
    if (!labelOverride) setMarkerLabel("");
  };

  const toggleFavoriteFilter = (label: string) => {
    setLayersVisibility(prev => {
      const current = prev.visibleFavoriteLabels;
      const next = current.includes(label) ? current.filter(l => l !== label) : [...current, label];
      return { ...prev, visibleFavoriteLabels: next };
    });
  };

  const saveToLibrary = () => {
    if (!markerLabel.trim()) return;
    const newTemplate: CustomMarker = { label: markerLabel, color: markerColor, id: Date.now().toString() };
    setMarkerLibrary(prev => [newTemplate, ...prev.filter(m => m.label !== newTemplate.label)]);
  };

  const deleteSubItem = (cityId: string, type: 'visits' | 'scheduledTrips' | 'customMarkers', index: number) => {
    const list = [...(userStats[cityId][type] || [])];
    list.splice(index, 1);
    updateMunicipality(cityId, { [type]: list });
    hideTooltip();
    if (type === 'visits') setEditingVisitIdx(null);
    if (type === 'scheduledTrips') setEditingScheduleIdx(null);
  };

  const projection = useMemo(() => geoData ? geoIdentity().reflectY(true).fitExtent([[50, 50], [mapWidth - 50, mapHeight - 70]], geoData) : null, [geoData]);
  const pathGenerator = useMemo(() => projection ? geoPath().projection(projection) : null, [projection]);
  const getFeatureId = useCallback((feature: any) => { const p = feature.properties || {}; return (p.codarea || p.codmun || p.CD_MUN || feature.id || "").toString(); }, []);
  const focusCity = (id: string) => {
    if (!geoData || !pathGenerator) return;
    const feature = geoData.features.find((f: any) => getFeatureId(f) === id);
    if (!feature) return;
    const centroid = pathGenerator.centroid(feature);
    setViewBoxTransform({ x: mapWidth / 2 - centroid[0] * 2.8, y: mapHeight / 2 - centroid[1] * 2.8, k: 2.8 });
    setSelectedId(id);
    setShowSearchList(false);
  };

  return (
    <div className="h-screen bg-slate-50 flex flex-col overflow-hidden">
      <header className="bg-slate-900 border-b-4 border-green-500 px-6 py-4 flex items-center justify-between shadow-2xl text-white shrink-0 no-print">
        <div className="flex items-center gap-4"><div className="bg-green-600 p-2 rounded-xl"><Target className="w-6 h-6" /></div><div><h1 className="text-xl font-black uppercase tracking-tighter">Defensoria Itinerante</h1><p className="text-[9px] font-bold text-green-400 tracking-[0.3em] uppercase opacity-80">Gestão Regional Amazonas</p></div></div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-800 rounded-xl p-1 gap-1">
             <button onClick={syncWithCloud} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${syncStatus === 'syncing' ? 'bg-yellow-600 text-white animate-pulse' : syncStatus === 'error' ? 'bg-red-600 text-white' : syncStatus === 'success' ? 'bg-green-600 text-white' : 'hover:bg-slate-700 text-slate-300'}`}>{syncStatus === 'syncing' ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Cloud className="w-4 h-4"/>} Nuvem</button>
             <button onClick={() => setShowCloudConfig(true)} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400"><Github className="w-4 h-4"/></button>
          </div>
          <button onClick={() => setShowReport(true)} className="bg-green-600 hover:bg-green-500 px-5 py-3 rounded-xl text-xs font-black uppercase flex items-center gap-3 transition-all active:scale-95 shadow-xl"><LayoutDashboard className="w-4 h-4"/> Dashboards</button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden relative">
        <section className={`relative flex flex-col bg-white overflow-hidden ${selectedId ? 'md:col-span-7 lg:col-span-8' : 'md:col-span-12'}`} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
          {/* Busca */}
          <div className="absolute top-8 left-8 z-[90] w-80 no-print">
            <div className="flex items-center bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden px-5 focus-within:border-green-500 transition-all"><Search className="w-5 h-5 text-slate-400" /><input type="text" value={searchQuery} onFocus={() => setShowSearchList(true)} onChange={e => setSearchQuery(e.target.value)} placeholder="Pesquisar Município..." className="w-full py-4 px-3 text-xs font-bold outline-none" /></div>
            {showSearchList && <motion.div className="mt-2 bg-white rounded-2xl shadow-4xl border border-slate-100 max-h-72 overflow-y-auto p-3 space-y-1">{Object.entries(namesMap).filter(([_, n]) => n.toLowerCase().includes(searchQuery.toLowerCase())).map(([id, n]) => (<button key={id} onClick={() => focusCity(id)} className="w-full text-left p-4 hover:bg-green-600 hover:text-white rounded-xl text-[11px] font-black uppercase text-slate-700 transition-all">{n}</button>))}</motion.div>}
          </div>

          {/* Botão de Visualização (Restore) */}
          <div className="absolute top-8 right-8 z-[90] no-print">
            <button onClick={() => setShowLayers(!showLayers)} className={`p-4 rounded-2xl shadow-2xl transition-all flex items-center gap-3 border ${showLayers ? 'bg-slate-900 text-white border-slate-800' : 'bg-white text-slate-900 border-slate-200'}`}>
              <Layers className="w-5 h-5" />
              <span className="text-[10px] font-black uppercase tracking-widest">Visualização</span>
            </button>
            <AnimatePresence>
              {showLayers && (
                <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} className="absolute right-0 mt-2 bg-white border border-slate-200 shadow-4xl rounded-3xl p-6 w-80 space-y-6 z-[100] custom-scrollbar max-h-[70vh] overflow-y-auto">
                  <div className="space-y-4">
                     <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest border-b pb-2">Camadas Base</p>
                     <button onClick={() => setLayersVisibility(v => ({ ...v, scheduled: !v.scheduled }))} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50">
                        <div className="flex items-center gap-3 text-[11px] font-bold uppercase"><Calendar className="w-4 h-4 text-blue-600"/> Agenda</div>
                        {layersVisibility.scheduled ? <Eye className="w-4 h-4 text-green-600"/> : <EyeOff className="w-4 h-4 text-slate-300"/>}
                     </button>
                     <button onClick={() => setLayersVisibility(v => ({ ...v, markers: !v.markers }))} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50">
                        <div className="flex items-center gap-3 text-[11px] font-bold uppercase"><MapPin className="w-4 h-4 text-orange-600"/> Marcadores</div>
                        {layersVisibility.markers ? <Eye className="w-4 h-4 text-green-600"/> : <EyeOff className="w-4 h-4 text-slate-300"/>}
                     </button>
                  </div>
                  {markerLibrary.length > 0 && layersVisibility.markers && (
                    <div className="space-y-3 pt-2">
                       <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest border-b pb-2">Filtrar Marcadores</p>
                       <div className="grid grid-cols-1 gap-1">
                          {markerLibrary.map(lib => (
                            <button key={lib.id} onClick={() => toggleFavoriteFilter(lib.label)} className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-slate-50">
                               <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full" style={{backgroundColor: lib.color}}/>
                                  <span className="text-[10px] font-bold uppercase truncate max-w-[140px]">{lib.label}</span>
                               </div>
                               {layersVisibility.visibleFavoriteLabels.length === 0 || layersVisibility.visibleFavoriteLabels.includes(lib.label) ? <Eye className="w-3 h-3 text-green-600"/> : <EyeOff className="w-3 h-3 text-slate-300"/>}
                            </button>
                          ))}
                       </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex-1 relative overflow-hidden bg-slate-50">
            {isLoadingMap ? <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="animate-spin text-green-600 w-12 h-12" /></div> : (
              <div className="w-full h-full flex items-center justify-center">
                <svg viewBox={`0 0 ${mapWidth} ${mapHeight}`} className="w-full h-full select-none" style={{ overflow: 'visible' }}>
                  <g transform={`translate(${viewBoxTransform.x}, ${viewBoxTransform.y}) scale(${viewBoxTransform.k})`}>
                    {geoData.features.map((f: any) => {
                      const id = getFeatureId(f);
                      const visitsCount = userStats[id]?.visits.length || 0;
                      let fillColor = visitsCount > 0 ? COLOR_SCALE[Math.min(visitsCount, 5)] : (selectedId === id ? "#f1f5f9" : "#fff");
                      if (id === MANAUS_ID) fillColor = "#2563eb"; 
                      return (<path key={`poly-${id}`} d={pathGenerator!(f)!} fill={fillColor} stroke={selectedId === id ? "#16a34a" : "#e2e8f0"} strokeWidth={selectedId === id ? 1.8 : 0.8} onClick={() => !mapHasMoved.current && setSelectedId(id)} onMouseEnter={(e) => { if (isDraggingMap.current) return; showTooltip({ x: e.clientX, y: e.clientY, title: namesMap[id], cityId: id, type: 'municipality' }); }} onMouseLeave={hideTooltip} className="cursor-pointer hover:brightness-95 transition-all outline-none" />);
                    })}
                    {geoData.features.map((f: any) => {
                       const id = getFeatureId(f);
                       const centroid = pathGenerator!.centroid(f);
                       return isNaN(centroid[0]) ? null : (<text key={`text-${id}`} transform={`translate(${centroid[0]}, ${centroid[1]})`} fontSize={5.5} textAnchor="middle" pointerEvents="none" className={`font-black uppercase tracking-tight select-none ${id === MANAUS_ID ? 'fill-white' : 'fill-slate-900 opacity-60'}`}>{namesMap[id]}</text>);
                    })}
                    {geoData.features.map((f: any) => {
                      const id = getFeatureId(f);
                      const d = userStats[id];
                      const centroid = pathGenerator!.centroid(f);
                      if (isNaN(centroid[0]) || !d) return null;
                      
                      const filteredMarkers = (d.customMarkers || []).filter(m => {
                        if (!layersVisibility.markers) return false;
                        if (layersVisibility.visibleFavoriteLabels.length === 0) return true;
                        return layersVisibility.visibleFavoriteLabels.includes(m.label);
                      });
                      
                      const allIcons = [...filteredMarkers.map(m => ({...m, type: 'marker' as const})), ...(layersVisibility.scheduled ? d.scheduledTrips || [] : []).map(s => ({...s, type: 'schedule' as const}))];
                      
                      return (<g key={`icons-${id}`} pointerEvents="none">{allIcons.map((item, idx) => {
                             const angle = (idx / Math.max(allIcons.length - 1, 1)) * Math.PI - Math.PI/2;
                             const ox = Math.cos(angle) * (allIcons.length > 1 ? 5 : 0);
                             const oy = Math.sin(angle) * (allIcons.length > 1 ? 5 : 0) - 10;
                             if (item.type === 'marker') {
                               return (<g key={`m-${idx}`} transform={`translate(${centroid[0] + ox}, ${centroid[1] + oy}) scale(1.1) translate(-12, -22)`} pointerEvents="auto" onMouseEnter={(e) => { e.stopPropagation(); showTooltip({ x: e.clientX, y: e.clientY, title: (item as any).label, color: (item as any).color, type: 'marker', cityId: id }); }} onMouseLeave={hideTooltip} className="cursor-help"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill={(item as any).color} stroke="white" strokeWidth="1.5" /><circle cx="12" cy="9" r="2.5" fill="white" /></g>);
                             } else {
                               return (<g key={`s-${idx}`} transform={`translate(${centroid[0] + ox - 8}, ${centroid[1] + oy - 8}) scale(0.9)`} pointerEvents="auto" onMouseEnter={(e) => { e.stopPropagation(); showTooltip({ x: e.clientX, y: e.clientY, title: (item as any).title, subtitle: `${(item as any).startDate} a ${(item as any).endDate}`, observations: (item as any).observations, type: 'schedule', cityId: id, daysRemaining: getDaysDiff((item as any).startDate) }); }} onMouseLeave={hideTooltip} className="cursor-help"><rect width="16" height="16" rx="3" fill="#2563eb" stroke="white" strokeWidth="1" /><rect x="3" y="2" width="2" height="3" rx="1" fill="white" /><rect x="11" y="2" width="2" height="3" rx="1" fill="white" /></g>);
                             }
                      })}</g>);
                    })}
                  </g>
                </svg>
              </div>
            )}
          </div>

          <AnimatePresence>{mapTooltip && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ top: mapTooltip.y - 80, left: mapTooltip.x - 60 }} className="fixed z-[400] bg-slate-900 text-white p-5 rounded-3xl shadow-4xl pointer-events-none border border-slate-700 min-w-[220px]">
                 <div className="space-y-3">
                    <div className="flex items-center gap-3">{mapTooltip.color ? <div className="w-3 h-3 rounded-full" style={{ backgroundColor: mapTooltip.color }} /> : (mapTooltip.type === 'schedule' ? <Calendar className="w-3 h-3 text-blue-400"/> : <MapIcon className="w-3 h-3 text-green-400"/>)}<p className="text-xs font-black uppercase tracking-tight">{mapTooltip.title}</p></div>
                    {mapTooltip.subtitle && <p className="text-[10px] font-bold text-slate-400 border-t border-white/5 pt-2">{mapTooltip.subtitle}</p>}
                    {mapTooltip.daysRemaining !== undefined && mapTooltip.daysRemaining !== null && (<div className="flex items-center gap-2 text-[10px] font-black uppercase text-blue-400"><Clock className="w-3 h-3"/>{mapTooltip.daysRemaining === 0 ? "É HOJE!" : (mapTooltip.daysRemaining > 0 ? `FALTAM ${mapTooltip.daysRemaining} DIAS` : `OCORREU HÁ ${Math.abs(mapTooltip.daysRemaining)} DIAS`)}</div>)}
                    {mapTooltip.type === 'municipality' && (<div className="flex gap-4 border-t border-white/5 pt-3"><div className="flex flex-col"><span className="text-[8px] font-black uppercase text-slate-500">Missões</span><span className="text-sm font-black text-green-400">{userStats[mapTooltip.cityId]?.visits.length || 0}</span></div><div className="flex flex-col"><span className="text-[8px] font-black uppercase text-slate-500">Assistidos</span><span className="text-sm font-black text-green-400">{userStats[mapTooltip.cityId]?.visits.reduce((acc, v) => acc + (v.attendanceCount || 0), 0).toLocaleString()}</span></div></div>)}
                 </div>
              </motion.div>
          )}</AnimatePresence>
        </section>

        <AnimatePresence>
          {selectedId && (
            <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} className="md:col-span-5 lg:col-span-4 bg-white border-l overflow-y-auto custom-scrollbar p-8 lg:p-12 space-y-10 z-[110] shadow-2xl no-print">
              <div className="flex justify-between items-start"><div><h2 className="text-4xl font-black uppercase tracking-tighter text-slate-900">{namesMap[selectedId]}</h2><p className="text-[10px] font-bold uppercase text-green-600 mt-2">Dossiê Estratégico</p></div><button onClick={() => { setSelectedId(null); setEditingVisitIdx(null); setEditingScheduleIdx(null); }} className="p-4 bg-slate-100 rounded-2xl hover:bg-slate-200"><X /></button></div>

              <div className="space-y-8">
                 {userStats[selectedId] ? (
                   <div className="space-y-10">
                      {userStats[selectedId].customMarkers?.length > 0 && (<div className="space-y-4"><p className="text-[9px] font-black text-orange-600 uppercase border-b pb-2 tracking-widest">Marcadores Fixados</p>{userStats[selectedId].customMarkers.map((m, i) => (<div key={i} className="flex items-center justify-between p-4 border rounded-2xl bg-white"><div className="flex items-center gap-3"><div className="w-3 h-3 rounded-full" style={{backgroundColor: m.color}}/><span className="text-[11px] font-bold uppercase text-slate-700">{m.label}</span></div><button onClick={() => deleteSubItem(selectedId, 'customMarkers', i)} className="text-red-300 hover:text-red-500"><Trash2 className="w-4 h-4"/></button></div>))}</div>)}
                      {userStats[selectedId].scheduledTrips?.length > 0 && (
                        <div className="space-y-4">
                           <p className="text-[9px] font-black text-blue-600 uppercase border-b pb-2 tracking-widest">Viagens Programadas (Próximas Visitas)</p>
                           {userStats[selectedId].scheduledTrips.map((s, i) => (
                             <div key={i} className={`p-6 rounded-[1.8rem] space-y-3 group border transition-all ${editingScheduleIdx === i ? 'bg-blue-50 border-blue-300' : 'bg-slate-50 border-slate-100'}`}>
                                <div className="flex justify-between items-start">
                                   <div><p className="text-xs font-black uppercase text-slate-800">{s.title}</p><p className="text-[9px] font-bold text-slate-500 uppercase mt-1">{s.startDate} até {s.endDate}</p></div>
                                   <div className="flex gap-2">
                                      <button onClick={() => startEditSchedule(i)} className="text-blue-400 hover:text-blue-600"><Edit2 className="w-4 h-4"/></button>
                                      <button onClick={() => deleteSubItem(selectedId, 'scheduledTrips', i)} className="text-red-300 hover:text-red-500"><Trash2 className="w-4 h-4"/></button>
                                   </div>
                                </div>
                                {s.observations && <p className="text-[10px] italic text-slate-400">{s.observations}</p>}
                             </div>
                           ))}
                        </div>
                      )}
                      {userStats[selectedId].visits?.length > 0 && (<div className="space-y-4"><p className="text-[9px] font-black text-green-600 uppercase border-b pb-2 tracking-widest">Missões Concluídas</p>{userStats[selectedId].visits.map((v, i) => (<div key={i} className={`p-6 rounded-[1.8rem] space-y-3 group border transition-all ${editingVisitIdx === i ? 'bg-green-50 border-green-300' : 'bg-slate-50 border-slate-100'}`}><div className="flex justify-between items-start"><div><p className="text-xs font-black uppercase text-slate-800">{v.title}</p><p className="text-[9px] font-bold text-slate-500 uppercase mt-1">{v.startDate} até {v.endDate}</p></div><div className="flex gap-2"><button onClick={() => startEditVisit(i)} className="text-blue-400 hover:text-blue-600"><Edit2 className="w-4 h-4"/></button><button onClick={() => deleteSubItem(selectedId, 'visits', i)} className="text-red-300 hover:text-red-500"><Trash2 className="w-4 h-4"/></button></div></div><div className="flex gap-4 pt-2"><div className="flex items-center gap-1 text-green-600 font-bold text-[10px]"><Users className="w-3 h-3"/> {v.attendanceCount}</div>{v.observations && <div className="flex items-center gap-1 text-slate-400 text-[10px] italic truncate max-w-[150px]"><MessageSquare className="w-3 h-3"/> {v.observations}</div>}</div></div>))}</div>)}
                   </div>
                 ) : <div className="text-center py-16 border-2 border-dashed rounded-[2.5rem] bg-slate-50"><p className="text-[10px] font-black uppercase text-slate-400">Sem registros disponíveis</p></div>}
              </div>

              <div className="space-y-10 pt-10 border-t">
                {/* Agendamento (Próximas Visitas) */}
                <div className="bg-blue-50/50 p-8 rounded-[2.5rem] space-y-6 border border-blue-100 relative">
                  <h4 className="text-[11px] font-black uppercase flex items-center gap-3 text-blue-800"><Calendar className="w-5 h-5 text-blue-600"/> {editingScheduleIdx !== null ? 'Editar Planejamento' : 'Planejar Viagem'}</h4>
                  <div className="space-y-4">
                    <input value={scheduleTitle} onChange={e => setScheduleTitle(e.target.value)} placeholder="Título da Viagem" className="w-full p-5 border rounded-2xl text-sm font-bold bg-white" />
                    <div className="grid grid-cols-2 gap-3">
                      <input type="date" value={scheduleStart} onChange={e => setScheduleStart(e.target.value)} className="w-full p-4 border rounded-2xl text-[10px] font-bold bg-white" />
                      <input type="date" value={scheduleEnd} onChange={e => setScheduleEnd(e.target.value)} className="w-full p-4 border rounded-2xl text-[10px] font-bold bg-white" />
                    </div>
                    <textarea value={scheduleObs} onChange={e => setScheduleObs(e.target.value)} placeholder="Objetivos e metas..." className="w-full p-5 border rounded-2xl text-xs font-medium bg-white h-24 resize-none" />
                    <button onClick={saveSchedule} className="w-full bg-blue-600 text-white p-5 rounded-[1.5rem] text-xs font-black uppercase hover:bg-blue-700 shadow-lg flex items-center justify-center gap-3"><Calendar className="w-4 h-4"/> {editingScheduleIdx !== null ? 'Salvar Alteração' : 'Agendar Viagem'}</button>
                  </div>
                </div>

                <div className="bg-green-50/30 p-8 rounded-[2.5rem] space-y-6 border border-green-100">
                  <h4 className="text-[11px] font-black uppercase flex items-center gap-3 text-green-800"><History className="w-5 h-5 text-green-600"/> Registrar Missão</h4>
                  <div className="space-y-4">
                    <input value={visitTitle} onChange={e => setVisitTitle(e.target.value)} placeholder="Título da Missão" className="w-full p-5 border rounded-2xl text-sm font-bold bg-white" />
                    <div className="grid grid-cols-2 gap-3"><input type="date" value={visitStart} onChange={e => setVisitStart(e.target.value)} className="w-full p-4 border rounded-2xl text-[10px] font-bold bg-white" /><input type="date" value={visitEnd} onChange={e => setVisitEnd(e.target.value)} className="w-full p-4 border rounded-2xl text-[10px] font-bold bg-white" /></div>
                    <div className="relative"><Users className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/><input type="number" value={visitAttendance} onChange={e => setVisitAttendance(Number(e.target.value))} placeholder="Total de Assistidos" className="w-full p-5 pl-12 border rounded-2xl text-sm font-bold bg-white" /></div>
                    <textarea value={visitObs} onChange={e => setVisitObs(e.target.value)} placeholder="Observações..." className="w-full p-5 border rounded-2xl text-xs font-medium bg-white h-24 resize-none" />
                    <button onClick={saveVisit} className="w-full bg-green-600 text-white p-5 rounded-[1.5rem] text-xs font-black uppercase hover:bg-green-700 shadow-lg flex items-center justify-center gap-3"><History className="w-4 h-4"/> Salvar Registro</button>
                  </div>
                </div>
                
                {/* Marcadores Estratégicos (Restauração da Biblioteca) */}
                <div className="bg-orange-50/50 p-8 rounded-[2.5rem] space-y-6 border border-orange-100">
                  <h4 className="text-[11px] font-black uppercase flex items-center gap-3 text-orange-800"><MapPin className="w-5 h-5 text-orange-600"/> Marcadores Estratégicos</h4>
                  <div className="space-y-4 pt-2">
                    <input value={markerLabel} onChange={e => setMarkerLabel(e.target.value)} placeholder="Nome do Marcador" className="w-full p-5 bg-white border rounded-2xl text-sm font-bold" />
                    
                    {/* Biblioteca de Favoritos */}
                    {markerLibrary.length > 0 && (
                      <div className="flex gap-2 flex-wrap p-3 bg-white/50 rounded-2xl border-dashed border-2 border-orange-200">
                         {markerLibrary.map(lib => (
                           <button key={lib.id} onClick={() => { setMarkerLabel(lib.label); setMarkerColor(lib.color); }} className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border shadow-sm hover:border-orange-400 transition-all">
                              <div className="w-2 h-2 rounded-full" style={{backgroundColor: lib.color}}/>
                              <span className="text-[9px] font-bold uppercase">{lib.label}</span>
                           </button>
                         ))}
                      </div>
                    )}

                    <div className="flex gap-2 flex-wrap p-3 bg-white rounded-2xl border">
                      {PRESET_COLORS.map(c => (
                        <button key={c} onClick={() => setMarkerColor(c)} className={`w-8 h-8 rounded-xl border-2 transition-all ${markerColor === c ? 'border-slate-900 scale-110' : 'border-transparent opacity-60 hover:opacity-100'}`} style={{backgroundColor: c}} />
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={saveToLibrary} className="flex items-center justify-center gap-2 bg-white border-2 border-orange-200 text-orange-600 p-4 rounded-2xl text-[10px] font-black uppercase hover:bg-orange-50 transition-all"><Star className="w-4 h-4"/> Favoritar</button>
                      <button onClick={() => addMarker()} className="bg-orange-600 text-white p-4 rounded-2xl text-[10px] font-black uppercase hover:bg-orange-700 shadow-lg">Fixar no Mapa</button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>{showCloudConfig && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[600] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6" onClick={() => setShowCloudConfig(false)}><motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-4xl" onClick={e => e.stopPropagation()}><header className="p-8 bg-slate-900 text-white flex justify-between items-center"><div className="flex items-center gap-4"><Github className="w-6 h-6 text-green-500"/><h2 className="text-xl font-black uppercase">Configurar Nuvem</h2></div><button onClick={() => setShowCloudConfig(false)} className="p-2 hover:bg-white/10 rounded-lg"><X/></button></header><div className="p-10 space-y-6"><div className="space-y-2"><label className="text-[10px] font-black uppercase text-slate-400 px-1 flex items-center gap-2"><Key className="w-3 h-3"/> GitHub Token (PAT)</label><input type="password" value={githubToken} onChange={e => setGithubToken(e.target.value)} placeholder="ghp_xxxxxxxxxxxx" className="w-full p-4 border rounded-xl text-xs font-bold outline-none" /><p className="text-[8px] text-slate-400">Crie um token com permissão 'Gist' para backup remoto.</p></div>{gistId && (<div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 px-1">ID do Backup</label><code className="block p-3 bg-slate-50 border rounded-xl text-[10px] text-slate-600 truncate">{gistId}</code></div>)}<div className="grid grid-cols-2 gap-3"><button onClick={loadFromCloud} disabled={!gistId} className="bg-slate-100 text-slate-600 p-4 rounded-xl text-[10px] font-black uppercase hover:bg-slate-200">Baixar</button><button onClick={saveGithubConfig} className="bg-green-600 text-white p-4 rounded-xl text-[10px] font-black uppercase">Salvar</button></div></div></motion.div></motion.div>
      )}</AnimatePresence>

      {/* Relatório */}
      <AnimatePresence>
        {showReport && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[500] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6" onClick={() => setShowReport(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white w-full max-w-5xl rounded-[3rem] overflow-hidden shadow-4xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
               <header className="p-10 bg-slate-900 text-white flex justify-between items-center">
                  <div className="flex items-center gap-4"><BarChart3 className="w-8 h-8 text-green-500"/><h2 className="text-2xl font-black uppercase">Consolidado Regional AM</h2></div>
                  <button onClick={() => setShowReport(false)} className="p-4 bg-white/5 rounded-2xl"><X/></button>
               </header>
               <div className="flex-1 overflow-y-auto p-12 bg-white custom-scrollbar">
                  <table className="w-full text-left">
                     <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400"><tr className="border-b"><th className="p-6">Município</th><th className="p-6">Missões</th><th className="p-6">Assistidos</th><th className="p-6 text-right">Ação</th></tr></thead>
                     <tbody className="divide-y divide-slate-100">
                        {Object.values(userStats).sort((a,b) => b.visits.length - a.visits.length).map(m => (
                          <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-6 font-black uppercase text-slate-800">{m.name}</td>
                            <td className="p-6 font-bold">{m.visits.length}</td>
                            <td className="p-6 font-black text-green-600 text-lg">{m.visits.reduce((acc, v) => acc + (v.attendanceCount || 0), 0).toLocaleString()}</td>
                            <td className="p-6 text-right"><button onClick={() => { setShowReport(false); focusCity(m.id); }} className="p-3 bg-slate-100 rounded-xl hover:bg-green-600 hover:text-white transition-all"><Target className="w-4 h-4"/></button></td>
                          </tr>
                        ))}
                     </tbody>
                  </table>
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
