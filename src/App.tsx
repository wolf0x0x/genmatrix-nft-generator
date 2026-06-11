import React, { useState, useEffect, useMemo, useRef, Component, ErrorInfo, ReactNode, useCallback } from 'react';
import { 
  Trash2, Upload, Download, RefreshCw, Plus, Layers, Settings, 
  AlertTriangle, GripVertical, Eye, EyeOff, Image as ImageIcon, 
  ChevronRight, ChevronDown, ChevronUp, FolderInput, X, Link, Ban, 
  SlidersHorizontal, FileJson, Package, LayoutTemplate, Database,
  AlertCircle, Shuffle, ZoomIn, Check, Settings2, CheckSquare, Square,
  ShieldAlert, Save, FileUp, Ghost, ImageOff, ArrowRight, RotateCcw, XCircle, Loader2, 
  ArrowDown01, ArrowUp10, ZapOff, Scale, Calculator, MousePointerClick, Lock, Unlock,
  Sparkles, Filter, ArrowDownWideNarrow, PieChart, Copy, Eraser, MoveVertical,
  Cpu, Terminal, FolderTree, Rocket, BookOpen, ShieldCheck
} from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// --- 核心工具：纯 JS 实现 UUID，确保兼容性 ---
const generateId = (): string => {
    let d = new Date().getTime(); 
    let d2 = ((typeof performance !== 'undefined') && performance.now && (performance.now()*1000)) || 0;
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        let r = Math.random() * 16;
        if(d > 0){
            r = (d + r)%16 | 0;
            d = Math.floor(d/16);
        } else {
            r = (d2 + r)%16 | 0;
            d2 = Math.floor(d2/16);
        }
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
};

// --- 类型定义 ---
type TraitRuleType = 'exclude' | 'force' | 'hideLayer';
type MetadataFormat = 'ETH' | 'SOL' | 'BSC';
type SortMode = 'id' | 'rarityDesc' | 'rarityAsc';

interface TraitRule {
  type: TraitRuleType;
  targetId: string;
  targetName?: string;
}

interface Trait {
  id: string;
  name: string;
  filename: string;
  weight: number;
  probability?: number;
  file?: File;
  previewUrl?: string;
  rules: TraitRule[];
  isEmpty?: boolean;
  isMissing?: boolean;
  locked?: boolean;
  // [new] 独立Order排序，如果设置了此值，渲染时将覆盖所属图层的 order
  customOrder?: number; 
}

interface Layer {
    id: string;
    name: string;
    order: number;
    traits: Trait[];
    enabled: boolean;
    // [new] 优化类型：'base' (基础层-均分) | 'deco' (装饰层-梯度) | undefined (默认)
    optimizeType?: 'base' | 'deco'; 
  }

interface ProjectConfig {
    projectName: string;
    description: string;
    totalSupply: number;
    width: number;
    height: number;
    outputFormat: 'png' | 'jpg';
    namePrefix: string;
    dimensionMode: 'auto' | 'fixed';
    metadataFormat: MetadataFormat;
    uniqueBackgroundMode: boolean; 
    backgroundLayerId?: string; // [new] Background Layer的ID
  }

interface GeneratedNFT {
  id: number;
  name: string;
  dna: string;
  traits: { layerName: string; traitName: string; value: string; layerId: string; traitId: string }[];
  rarityScore?: number; 
  rawRarity?: number; 
  rarityLabel?: string; 
}

// --- 常量与工具 ---
const DEFAULT_CONFIG: ProjectConfig = {
  projectName: 'GenMatrix NFT Collection',
  namePrefix: 'GenMatrix #', 
  description: 'Generated with GenMatrix NFT Generator',
  totalSupply: 100,
  width: 1000,
  height: 1000,
  outputFormat: 'png',
  dimensionMode: 'auto',
  metadataFormat: 'ETH',
  uniqueBackgroundMode: false,
};

const EMPTY_IMAGE_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const BATCH_SIZE = 500;

const getRarityLabel = (score: number) => {
    if (score >= 1.8) return { label: 'UR', color: 'bg-rose-500 text-white', value: 1.8 };
    if (score >= 1.6) return { label: 'SSR', color: 'bg-orange-500 text-white', value: 1.6 };
    if (score >= 1.4) return { label: 'SR', color: 'bg-purple-500 text-white', value: 1.4 };
    if (score >= 1.2) return { label: 'R', color: 'bg-blue-500 text-white', value: 1.2 };
    return { label: 'N', color: 'bg-gray-400 text-white', value: 1.0 };
};

// IndexedDB 工具
const DB_NAME = 'FoxNFTGenDB';
const STORE_NAME = 'images';
const dbHelper = {
  isAvailable: () => typeof indexedDB !== 'undefined',
  getDB: async (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
          reject(new Error("IndexedDB not available"));
          return;
      }
      try {
          const req = indexedDB.open(DB_NAME, 1);
          req.onupgradeneeded = (e: any) => {
            if (!e.target.result.objectStoreNames.contains(STORE_NAME)) e.target.result.createObjectStore(STORE_NAME);
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
      } catch (e) {
          reject(e);
      }
    });
  },
  saveFile: async (id: string, file: Blob) => {
    try {
      if (!dbHelper.isAvailable()) return;
      const db = await dbHelper.getDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(STORE_NAME).put(file, id);
      });
    } catch(e) { console.error("DB Save Error", e); }
  },
  getFile: async (id: string): Promise<Blob | undefined> => {
    try {
      if (!dbHelper.isAvailable()) return undefined;
      const db = await dbHelper.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined); 
      });
    } catch { return undefined; }
  },
  deleteFile: async (id: string) => {
    try {
        if (!dbHelper.isAvailable()) return;
        const db = await dbHelper.getDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
    } catch (e) { console.error("DB Delete Error", e); }
  },
  clearAll: async () => {
    try {
        if (!dbHelper.isAvailable()) return;
        const db = await dbHelper.getDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
    } catch (e) { console.error("DB Clear Error", e); }
  }
};

const createEmptyTrait = (weight: number = 10): Trait => ({
    id: generateId(), name: 'Empty', filename: 'none.png', weight, probability: 0,
    previewUrl: EMPTY_IMAGE_BASE64, rules: [], isEmpty: true, locked: false, customOrder: undefined
});

const isBackgroundLayer = (n: string): boolean => {
    const l = n.toLowerCase();
    return ['background', 'bg', '背景', '底'].some(k => l.includes(k));
};

const isMandatoryLayer = (n: string): boolean => {
  const l = n.toLowerCase();
  return isBackgroundLayer(n) || 
         ['body', 'base', 'skin', '主体', '身体', 'head', 'face', '头部', '脸'].some(k => l.includes(k));
};

const safeSetItem = (key: string, value: string) => {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        console.error("LocalStorage set error (QuotaExceeded?):", e);
    }
};

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
    
  handleHardReset = async () => {
      localStorage.clear();
      try { await dbHelper.clearAll(); } catch(e){}
      window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-red-600 bg-red-50 h-screen flex flex-col items-center justify-center font-sans">
          <AlertTriangle size={64} className="mb-6 text-red-500"/>
          <h1 className="text-2xl font-bold mb-3 text-gray-800">Something went wrong</h1>
          <p className="mb-8 text-sm text-gray-600">This may be caused by cached project data. Resetting usually fixes it.</p>
          <button 
            onClick={this.handleHardReset} 
            className="px-8 py-3 bg-gradient-to-r from-[#6056F6] to-[#37D0FF] text-white rounded-full font-bold shadow-lg hover:opacity-90 transition-all hover:scale-105"
          >
            Clear cache and reset
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- 主组件 ---
const NFTGenerator = () => {
  const [config, setConfig] = useState<ProjectConfig>(DEFAULT_CONFIG);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  const [sidebarTab, setSidebarTab] = useState<'layers' | 'settings'>('layers');
  const [isRestoring, setIsRestoring] = useState(true);
  const [previewEditLayerId, setPreviewEditLayerId] = useState<string | null>(null);
  const [isMiniPreviewOpen, setIsMiniPreviewOpen] = useState(true);
  const [miniPreviewNFT, setMiniPreviewNFT] = useState<GeneratedNFT | null>(null);
  const [isRuleManagerOpen, setIsRuleManagerOpen] = useState(false);
  const [editingRuleIds, setEditingRuleIds] = useState<{layerId: string, traitId: string} | null>(null);
  const [viewingTraitUrl, setViewingTraitUrl] = useState<string | null>(null);
  const [ruleGroupExpanded, setRuleGroupExpanded] = useState<Set<string>>(new Set(['force', 'exclude']));
  const [generatedCollection, setGeneratedCollection] = useState<GeneratedNFT[]>([]);
  const [selectedNFT, setSelectedNFT] = useState<GeneratedNFT | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportMode, setExportMode] = useState<string>('all'); 
  const isExportCancelled = useRef(false);
  const [filterTraitIds, setFilterTraitIds] = useState<Set<string>>(new Set());
  const [filterRarityLabels, setFilterRarityLabels] = useState<Set<string>>(new Set()); 
  const [previewHiddenTraits, setPreviewHiddenTraits] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>('id');
  const [traitSortAsc, setTraitSortAsc] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // --- 初始化逻辑 ---
  useEffect(() => {
    const init = async () => {
      try {
        const savedConfig = localStorage.getItem('nftgen_config');
        if (savedConfig) {
            try {
                const parsed = JSON.parse(savedConfig);
                if(parsed && typeof parsed === 'object') {
                    setConfig({ ...DEFAULT_CONFIG, ...parsed });
                }
            } catch(e) { console.warn("Config parse warning, using default", e); }
        }

        const savedLayers = localStorage.getItem('nftgen_layers_meta');
        if (savedLayers) {
          let parsedLayers: any[] = [];
          try {
             parsedLayers = JSON.parse(savedLayers);
          } catch(e) {
             console.error("Layers Meta corrupted", e);
             parsedLayers = []; 
          }

          if (Array.isArray(parsedLayers)) {
              const restoredLayers: Layer[] = await Promise.all(parsedLayers.map(async (layer: any) => {
                if (!layer) return null; 
                 
                const safeLayerId = layer.id || generateId();
                const safeTraits = Array.isArray(layer.traits) ? layer.traits : [];
                 
                const restoredTraits = await Promise.all(safeTraits.map(async (trait: any) => {
                  if (!trait) return null;
                  
                  const safeTraitId = trait.id || generateId();
                  const safeTrait = { 
                      ...trait, 
                      id: safeTraitId,
                      rules: Array.isArray(trait.rules) ? trait.rules : [],
                      weight: typeof trait.weight === 'number' && !isNaN(trait.weight) ? trait.weight : 10,
                      locked: !!trait.locked,
                      customOrder: trait.customOrder // 恢复 customOrder
                  };
                  
                  if (safeTrait.isEmpty) return { ...safeTrait, previewUrl: EMPTY_IMAGE_BASE64 };
                  
                  const blob = await dbHelper.getFile(safeTraitId);
                  const url = blob ? URL.createObjectURL(blob) : '';
                  
                  return { 
                      ...safeTrait, 
                      file: blob ? new File([blob], safeTrait.filename || 'recovered.png', { type: blob.type }) : undefined, 
                      previewUrl: url, 
                      isMissing: !blob && !safeTrait.isEmpty 
                  };
                }));
                
                const validTraits = restoredTraits.filter(Boolean) as Trait[];
                return { ...layer, id: safeLayerId, traits: validTraits };
              }));
              
              const validLayers = restoredLayers.filter(Boolean) as Layer[];
              setLayers(validLayers);
          }
        }
      } catch (e) { 
          console.error("Critical Restore failed", e); 
      } finally { 
          setIsRestoring(false); 
      }
    };
    init();
  }, []);

  // ... (省略了中间未updated的 useEffect 和 计算属性，保持原样)
  // 为了节省篇幅，这里假设中间代码未变，直到 handleWeightChange 附近
  
  useEffect(() => {
      if (layers.length > 0) {
          const currentExists = layers.some(l => l.id === selectedLayerId);
          if (!currentExists) {
              setSelectedLayerId(layers[0].id);
          }
      } else {
          setSelectedLayerId(null);
      }
  }, [layers]);

  useEffect(() => {
    if (isRestoring) return;
    try {
        safeSetItem('nftgen_config', JSON.stringify(config));
        const meta = layers.map(l => ({ ...l, traits: l.traits.map(({ file, previewUrl, ...rest }) => rest) }));
        safeSetItem('nftgen_layers_meta', JSON.stringify(meta));
    } catch(e) { console.error("Save to LocalStorage failed", e); }
  }, [config, layers, isRestoring]);

  // --- Computed ---
  const displayedLayers = useMemo(() => [...layers].sort((a, b) => (b.order||0) - (a.order||0)), [layers]); 
   
  const maxCombinations = useMemo(() => {
    const active = layers.filter(l => l.enabled);
    return active.length ? active.reduce((acc, l) => acc * (Math.max(1, l.traits.length)), 1) : 0;
  }, [layers]);

  const globalRules = useMemo(() => {
    return layers.flatMap(l => l.traits.flatMap((t, i) => t.rules.map(r => ({ layer: l, trait: t, rule: r, index: i }))));
  }, [layers]);

  const currentEditingTrait = useMemo(() => {
    if (!editingRuleIds) return null;
    const layer = layers.find(l => l.id === editingRuleIds.layerId);
    if (!layer) return null;
    const trait = layer.traits.find(t => t.id === editingRuleIds.traitId);
    return trait || null;
  }, [layers, editingRuleIds]);

  const ruleConflicts = useMemo(() => {
     const conflicts: string[] = [];
     layers.forEach(l => l.traits.forEach(t => {
         const force = new Set(t.rules.filter(r => r.type === 'force').map(r => r.targetId));
         const exclude = new Set(t.rules.filter(r => r.type === 'exclude').map(r => r.targetId));
         t.rules.forEach(r => {
             if (r.type === 'force' && exclude.has(r.targetId)) conflicts.push(`Trait [${t.name}] has both force and exclude rules for [${r.targetName}]`);
         });
     }));
     return conflicts;
  }, [layers]);

  const filteredCollection = useMemo(() => {
    let res = generatedCollection;
    
    if (filterRarityLabels.size > 0) {
        res = res.filter(n => {
            const { label } = getRarityLabel(n.rarityScore || 1);
            return filterRarityLabels.has(label);
        });
    }
    if (filterTraitIds.size > 0) {
        res = res.filter(n => n.traits.some(t => filterTraitIds.has(t.traitId)));
    }
    
    const sorter = (a: GeneratedNFT, b: GeneratedNFT) => 
        sortMode === 'id' ? a.id - b.id : sortMode === 'rarityDesc' ? (b.rarityScore||0) - (a.rarityScore||0) : (a.rarityScore||0) - (b.rarityScore||0);
    return [...res].sort(sorter);
  }, [generatedCollection, filterTraitIds, filterRarityLabels, sortMode]);

  const calculateProbabilities = (traits: Trait[]) => {
    const total = traits.reduce((sum, t) => sum + (t.weight || 0), 0);
    return traits.map(t => ({ ...t, probability: total > 0 ? (t.weight || 0) / total : 0 }));
  };

  const updateLayerTraits = (layerId: string, newTraits: Trait[]) => {
      setLayers(prev => prev.map(l => l.id === layerId ? { ...l, traits: calculateProbabilities(newTraits) } : l));
  };
  
  // 处理组件的自定义Order变更
  const handleCustomOrderChange = (layerId: string, traitId: string, val: string) => {
      const parsedVal = val === '' ? undefined : parseInt(val, 10);
      const safeVal = (parsedVal !== undefined && !isNaN(parsedVal)) ? parsedVal : undefined;
      
      setLayers(prev => prev.map(l => {
          if (l.id !== layerId) return l;
          const newTraits = l.traits.map(t => t.id === traitId ? { ...t, customOrder: safeVal } : t);
          return { ...l, traits: calculateProbabilities(newTraits) };
      }));
  };

  const handleWeightChange = (layerId: string, traitId: string, val: number) => {
    // [updated] 支持小数点后一位，不做整数强制转换，仅过滤 NaN
    if (isNaN(val)) return;
    const newWeight = Math.max(0, val); // 允许小数输入

    setLayers(prev => prev.map(layer => {
        if (layer.id !== layerId) return layer;
        const traits = layer.traits;
        const targetTrait = traits.find(t => t.id === traitId);
        if (!targetTrait) return layer;

        const otherLockedTraits = traits.filter(t => t.id !== traitId && t.locked);
        const otherLockedTotal = otherLockedTraits.reduce((acc, t) => acc + t.weight, 0);

        const maxAvailable = Math.max(0, 100 - otherLockedTotal);
        const safeWeight = Math.min(newWeight, maxAvailable);

        const remainingForUnlocked = Math.max(0, 100 - otherLockedTotal - safeWeight);
        const otherUnlockedTraits = traits.filter(t => t.id !== traitId && !t.locked);
        const currentUnlockedTotal = otherUnlockedTraits.reduce((acc, t) => acc + t.weight, 0);

        const updatedTraits = traits.map(t => {
            if (t.id === traitId) return { ...t, weight: safeWeight };
            if (t.locked) return t; 
            if (currentUnlockedTotal === 0) {
                return { ...t, weight: otherUnlockedTraits.length > 0 ? remainingForUnlocked / otherUnlockedTraits.length : 0 };
            }
            const ratio = t.weight / currentUnlockedTotal;
            return { ...t, weight: ratio * remainingForUnlocked };
        });

        return { ...layer, traits: calculateProbabilities(updatedTraits) };
    }));
};

  // ... (toggleTraitLock, resetLayerWeights, sortLayerTraits, handleAddEmptyTrait 等保持不变)
  const toggleTraitLock = (layerId: string, traitId: string) => {
      setLayers(prev => prev.map(l => {
          if (l.id !== layerId) return l;
          return { ...l, traits: l.traits.map(t => t.id === traitId ? { ...t, locked: !t.locked } : t) };
      }));
  };

  const resetLayerWeights = (layerId: string) => {
      if(!confirm("Evenly distribute weights? Locked trait weights will not change.")) return;
      setLayers(prev => prev.map(l => {
          if (l.id !== layerId) return l;
          const lockedTraits = l.traits.filter(t => t.locked);
          const unlockedTraits = l.traits.filter(t => !t.locked);
          if (unlockedTraits.length === 0) return l; 

          const lockedTotal = lockedTraits.reduce((sum, t) => sum + t.weight, 0);
          const remaining = Math.max(0, 100 - lockedTotal);
          const avg = remaining / unlockedTraits.length;

          const newTraits = l.traits.map(t => {
              if (t.locked) return t;
              return { ...t, weight: avg };
          });
          return { ...l, traits: calculateProbabilities(newTraits) };
      }));
  };

  const sortLayerTraits = (layerId: string, asc: boolean) => {
    setLayers(prev => prev.map(l => {
        if (l.id !== layerId) return l;
        const sortedTraits = [...l.traits].sort((a, b) => asc ? a.weight - b.weight : b.weight - a.weight);
        return { ...l, traits: sortedTraits };
    }));
    setTraitSortAsc(asc);
  };

  const handleAddEmptyTrait = (layerId: string) => {
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return;
    
    if (layer.traits.some(t => t.isEmpty)) {
        alert("This layer already has an empty trait.");
        return;
    }

    const newEmptyTrait = createEmptyTrait(10); // 默认权重
    const newTraits = [...layer.traits, newEmptyTrait];
    updateLayerTraits(layerId, newTraits);
  };

  // ... (clearAllLayers, addLayer, deleteLayer, handleSort, handleBatchFolderUpload, handleImportProjectConfig 保持不变)
  const clearAllLayers = async () => {
      if(!confirm("Warning: this will delete all layers and trait data. This cannot be undone.\n\nContinue?")) return;
      try {
          await dbHelper.clearAll();
          localStorage.removeItem('nftgen_config');
          localStorage.removeItem('nftgen_layers_meta');
          window.location.reload();
      } catch(e) { alert("Clear failed. Please refresh the page manually."); }
  };

  const addLayer = () => {
      const order = layers.length > 0 ? Math.max(...layers.map(l => l.order)) + 1 : 0;
      const newName = `Layer ${layers.length + 1}`;
      const newLayer: Layer = { id: generateId(), name: newName, order, traits: [], enabled: true };
      
      if (!isMandatoryLayer(newName)) newLayer.traits.push(createEmptyTrait());
      
      setLayers([...layers, newLayer]);
      setSelectedLayerId(newLayer.id);
  };

  const deleteLayer = (id: string) => {
    if(!confirm("Delete this layer and all of its traits?")) return;
    const l = layers.find(x => x.id === id);
    l?.traits.forEach(t => { if(!t.isEmpty) dbHelper.deleteFile(t.id); });
    setLayers(prev => prev.filter(x => x.id !== id));
  };

  const handleSort = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const _l = [...displayedLayers];
    const item = _l.splice(dragItem.current, 1)[0];
    _l.splice(dragOverItem.current, 0, item);
    setLayers(_l.map((l, i) => ({ ...l, order: _l.length - 1 - i })));
    dragItem.current = null; dragOverItem.current = null;
  };

  const handleBatchFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        const groupedFiles = new Map<string, File[]>();
        
        files.forEach(f => {
            if (!f.type.startsWith('image/') && !/\.(png|jpg|jpeg|webp|gif)$/i.test(f.name)) return;
            const path = f.webkitRelativePath || f.name;
            const parts = path.split('/');
            let folderName = 'Default';
            if (parts.length >= 2) folderName = parts[parts.length - 2];
            else folderName = 'New Layer'; 

            if (!groupedFiles.has(folderName)) groupedFiles.set(folderName, []);
            groupedFiles.get(folderName)!.push(f);
        });

        if(groupedFiles.size === 0) {
            alert("No valid image folders were detected.");
            return;
        }

        const sortedFolderNames = Array.from(groupedFiles.keys()).sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));
        const preparedData: { folderName: string; traitsData: { id: string; file: File; name: string; url: string }[] }[] = [];

        for (const folderName of sortedFolderNames) {
            const folderFiles = groupedFiles.get(folderName)!;
            const traitsData = [];
            for (const f of folderFiles) {
                const id = generateId(); 
                await dbHelper.saveFile(id, f); 
                traitsData.push({
                    id, file: f, name: f.name.split('.')[0] || 'Untitled', url: URL.createObjectURL(f)
                });
            }
            preparedData.push({ folderName, traitsData });
        }

        setLayers(prevLayers => {
            const newLayers = [...prevLayers];
            let maxOrder = newLayers.length > 0 ? Math.max(...newLayers.map(l => l.order)) : -1;

            preparedData.forEach(({ folderName, traitsData }) => {
                let existingLayerIndex = newLayers.findIndex(l => l.name === folderName);
                
                if (existingLayerIndex !== -1) {
                    const layer = newLayers[existingLayerIndex];
                    const updatedTraits = [...layer.traits];
                    let layerModified = false;
                    
                    traitsData.forEach(item => {
                        const existingTraitIndex = updatedTraits.findIndex(t => t.name === item.name);
                        if (existingTraitIndex !== -1) {
                            const trait = updatedTraits[existingTraitIndex];
                            if (trait.isMissing || !trait.file) {
                                updatedTraits[existingTraitIndex] = { ...trait, id: item.id, file: item.file, previewUrl: item.url, isMissing: false };
                                layerModified = true;
                            }
                        } else {
                            updatedTraits.push({ 
                                id: item.id, name: item.name, filename: item.file.name, 
                                weight: 10, probability: 0, file: item.file, previewUrl: item.url, 
                                rules: [], locked: false 
                            });
                            layerModified = true;
                        }
                    });

                    if (layerModified) {
                        const newTraitsWithProbs = calculateProbabilities(updatedTraits);
                        newLayers[existingLayerIndex] = { ...layer, traits: newTraitsWithProbs };
                    }
                } else {
                    const shouldAddEmpty = !isMandatoryLayer(folderName);
                    const initialWeight = 100 / (traitsData.length + (shouldAddEmpty ? 1 : 0));

                    const newTraits: Trait[] = traitsData.map(item => ({
                        id: item.id, name: item.name, filename: item.file.name,
                        weight: initialWeight, probability: 0, file: item.file, previewUrl: item.url,
                        rules: [], locked: false
                    }));
                    
                    if (shouldAddEmpty) newTraits.push(createEmptyTrait(initialWeight));
                    
                    const traitsWithProbs = calculateProbabilities(newTraits);
                    newLayers.push({ 
                        id: generateId(), name: folderName, order: ++maxOrder, traits: traitsWithProbs, enabled: true 
                    });
                }
            });
            return newLayers;
        });
    } catch (err: any) {
        console.error("Batch Upload Error:", err);
        alert(`Folder import failed: ${err.message || 'Unknown error'}`);
    } finally {
        e.target.value = ''; 
    }
  };

  const handleImportProjectConfig = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      const currentAssetsMap = new Map<string, {file: File, previewUrl: string}>();
      layers.forEach(l => {
          l.traits.forEach(t => {
              if (t.file && t.previewUrl && !t.isEmpty) {
                  currentAssetsMap.set(`${l.name}:${t.name}`, { file: t.file, previewUrl: t.previewUrl });
              }
          });
      });

      reader.onload = async (ev) => {
          try {
              const data: { config: ProjectConfig, layers: Layer[] } = JSON.parse(ev.target?.result as string);
              if (!data.config || !data.layers) throw new Error("Invalid Config File");
              setConfig(data.config);
              const restoredLayers = await Promise.all(data.layers.map(async (layer) => {
                  const restoredTraits = await Promise.all(layer.traits.map(async (trait) => {
                      if (trait.isEmpty) return { ...trait, previewUrl: EMPTY_IMAGE_BASE64, rules: trait.rules || [] };
                      let fileBlob = await dbHelper.getFile(trait.id);
                      let fileObj: File | undefined;
                      let previewUrl = '';
                      let isMissing = true;
                      if (fileBlob) {
                          fileObj = new File([fileBlob], trait.filename, { type: fileBlob.type });
                          previewUrl = URL.createObjectURL(fileBlob);
                          isMissing = false;
                      } else {
                          const fallbackMatch = currentAssetsMap.get(`${layer.name}:${trait.name}`);
                          if (fallbackMatch) {
                              await dbHelper.saveFile(trait.id, fallbackMatch.file);
                              fileObj = fallbackMatch.file;
                              previewUrl = fallbackMatch.previewUrl;
                              isMissing = false;
                          }
                      }
                      return { ...trait, file: fileObj, previewUrl: previewUrl, isMissing: isMissing, rules: trait.rules || [] };
                  }));
                  return { ...layer, traits: restoredTraits };
              }));
              setLayers(restoredLayers);
              if(restoredLayers.length > 0) setSelectedLayerId(restoredLayers[0].id);
              alert("Configuration imported.");
          } catch(err) { console.error(err); alert("Import failed: invalid file format."); }
      };
      reader.readAsText(file);
      e.target.value = '';
  };
  
// [updated] 一键优化Rarity权重 (终极版：高差异化策略)
  // 策略Target：UR必须是多个稀有组件叠加的结果，而N卡则由基础组件+空配饰组成
  const optimizeWeights = () => {
    const hasSettings = layers.some(l => l.optimizeType);
    if (!hasSettings) {
        alert("Set an optimization type for at least one layer before running the optimizer.");
        return;
    }

    if(!confirm("Apply high-contrast rarity optimization?\n\nStrategy:\n1. Base layers will be evenly weighted for diverse core characters.\n2. Accessory layers will increase the Empty trait weight to about 70%-90%.\n\nResult:\n- N/R tiers usually stay cleaner with fewer accessories.\n- SSR/UR tiers have a small chance to combine multiple accessories for premium looks.\n\nThis action cannot be undone.")) return;

    // 预计算规则负担 (用于补偿那些容易被Exclude掉的组件)
    const ruleBurdenMap = new Map<string, number>();
    layers.forEach(l => {
        l.traits.forEach(t => {
            t.rules.forEach(r => {
                if (r.type === 'exclude') {
                    ruleBurdenMap.set(t.id, (ruleBurdenMap.get(t.id) || 0) + 0.5);
                    ruleBurdenMap.set(r.targetId, (ruleBurdenMap.get(r.targetId) || 0) + 1.5);
                }
            });
        });
    });

    setLayers(prev => prev.map(layer => {
        const traits = layer.traits;
        if (!layer.optimizeType || traits.length <= 1) return layer;

        let newTraits = [...traits];
        const isBaseLayer = layer.optimizeType === 'base';

        if (isBaseLayer) {
            // --- 基础层策略：严格均分 (最大化熵) ---
            // 这样保证了不管是 N 卡还是 UR，它们的基础底子（衣服/身体/背景）都是随机且多变的
            const unlockedTraits = traits.filter(t => !t.locked);
            const lockedTotal = traits.filter(t => t.locked).reduce((acc, t) => acc + t.weight, 0);
            
            if (unlockedTraits.length > 0) {
                const remainingWeight = Math.max(0, 100 - lockedTotal);
                const baseAvg = remainingWeight / unlockedTraits.length;
                
                newTraits = traits.map(t => {
                    if (t.locked) return t;
                    // 移除随机扰动，使用纯均分，配合规则补偿
                    const burden = ruleBurdenMap.get(t.id) || 0;
                    // 基础层补偿较小，避免偏差太大
                    const compensationFactor = 1 + Math.min(0.2, burden * 0.05); 
                    return { ...t, weight: Number((baseAvg * compensationFactor).toFixed(1)) };
                });
            }
        } else {
            // --- 装饰层策略：高空置率 + 平滑组件梯度 ---
            const unlockedTraits = traits.filter(t => !t.locked);
            const lockedTotal = traits.filter(t => t.locked).reduce((acc, t) => acc + t.weight, 0);
            const remainingWeight = Math.max(0, 100 - lockedTotal);

            if (unlockedTraits.length > 0) {
                const emptyTrait = unlockedTraits.find(t => t.isEmpty || t.name.toLowerCase() === 'empty' || t.name === '无');
                const normalTraits = unlockedTraits.filter(t => t !== emptyTrait);
                
                // [核心策略] 动态设定 Empty 比例
                // Order越靠前（order小，靠近身体），Empty率稍微低一点（60%）
                // Order越靠后（order大，最外层装饰），Empty率极高（90%）
                // 这样能保证 N 卡通常只有 0-1 个配饰，而 UR 有 3-4 个配饰。
                let emptyRatio = 0.0;
                if (emptyTrait) {
                    // 基础 60%，每增加一Order加 3%，封顶 90%
                    emptyRatio = Math.min(0.90, 0.60 + (layer.order || 0) * 0.03); 
                }
                
                const emptyWeight = emptyTrait ? remainingWeight * emptyRatio : 0;
                const normalTotalWeight = remainingWeight - emptyWeight;

                if (normalTraits.length > 0) {
                    // 打乱顺序，避免列表顶端总是高Probability
                    const shuffledNormalTraits = [...normalTraits].sort(() => Math.random() - 0.5);
                    
                    let currentSum = 0;
                    // [组件内部策略] 使用极其平缓的梯度
                    // 因为我们已经通过高 Empty 率制造了稀缺性，
                    // 组件之间就不需要太大的贫富差距了，这样能让 UR 的组合更多样化
                    const rawWeights = shuffledNormalTraits.map((t, i) => {
                        // 几乎线性的微弱衰减，让所有配件都有机会在 UR 中露脸
                        let w = 100 / Math.pow(i + 5, 0.3); 
                        
                        // 规则补偿 (装饰层补偿力度大)
                        const burden = ruleBurdenMap.get(t.id) || 0;
                        w *= (1 + Math.min(1.0, burden * 0.2));
                        
                        currentSum += w;
                        return { id: t.id, w };
                    });

                    newTraits = traits.map(t => {
                        if (t.locked) return t;
                        if (t === emptyTrait) return { ...t, weight: Number(emptyWeight.toFixed(1)) };
                        
                        const weightObj = rawWeights.find(rw => rw.id === t.id);
                        if (!weightObj) return t;
                        
                        const normalizedWeight = (weightObj.w / currentSum) * normalTotalWeight;
                        // 保证有最小权重，避免出现0
                        return { ...t, weight: Math.max(0.1, Number(normalizedWeight.toFixed(1))) };
                    });
                }
            }
        }
        
        // 归一化微调
        if (newTraits.length > 0) {
           const finalTotal = newTraits.filter(t => !t.locked).reduce((a, b) => a + b.weight, 0);
           const targetTotal = Math.max(0, 100 - traits.filter(t => t.locked).reduce((a, b) => a + b.weight, 0));
           
           if (finalTotal > 0 && Math.abs(finalTotal - targetTotal) > 0.1) {
               newTraits = newTraits.map(t => {
                   if (t.locked) return t;
                   return { ...t, weight: Number((t.weight / finalTotal * targetTotal).toFixed(1)) };
               });
           }
        }

        return { ...layer, traits: calculateProbabilities(newTraits) };
    }));
    
    alert("Optimization complete!\n\nBase layers were balanced evenly, and accessory layers now use a higher Empty probability to create stronger rarity contrast. Regenerate the preview to inspect the new distribution.");
};

  // ... (rules logic 保持不变)
  const handleAddRule = (layerId: string, traitId: string, rule: TraitRule) => {
      const layer = layers.find(l => l.id === layerId);
      if (!layer) return;
      const updatedTraits = layer.traits.map(t => {
          if (t.id === traitId) {
              const exists = t.rules.some(r => r.type === rule.type && r.targetId === rule.targetId);
              if (exists) return t; 
              return { ...t, rules: [...t.rules, rule] };
          }
          return t;
      });
      updateLayerTraits(layerId, updatedTraits);
  };

  const handleDeleteRule = (layerId: string, traitId: string, ruleIndex: number) => {
      const layer = layers.find(l => l.id === layerId);
      if (!layer) return;
      const updatedTraits = layer.traits.map(t => t.id === traitId ? { ...t, rules: t.rules.filter((_, idx) => idx !== ruleIndex) } : t);
      updateLayerTraits(layerId, updatedTraits);
  };
    
  const toggleRuleGroup = (key: string) => {
      const newSet = new Set(ruleGroupExpanded);
      if(newSet.has(key)) newSet.delete(key); else newSet.add(key);
      setRuleGroupExpanded(newSet);
  };

  const toggleFilterTrait = (id: string) => {
    setFilterTraitIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        return newSet;
    });
  };

  const toggleFilterRarity = (label: string) => {
    setFilterRarityLabels(prev => {
        const newSet = new Set(prev);
        if (newSet.has(label)) newSet.delete(label);
        else newSet.add(label);
        return newSet;
    });
  };

  const clearAllFilters = () => {
      setFilterTraitIds(new Set());
      setFilterRarityLabels(new Set());
  };

  // ... (generateSingleNFT, generateCollection, refreshMiniPreview 保持不变，因为Probability计算逻辑不涉及 customOrder)
  const generateSingleNFT = useCallback((currentLayers: Layer[], id: number): GeneratedNFT | null => {
    const parentMap = new Map<string, string>(); 
    const traitMap = new Map<string, Trait>();
    const layerMap = new Map<string, string>(); 
    
    currentLayers.forEach(l => l.traits.forEach(t => {
        traitMap.set(t.id, t);
        layerMap.set(t.id, l.id);
        parentMap.set(t.id, t.id); 
    }));

    const find = (i: string): string => {
        if (!parentMap.has(i)) return i; 
        if (parentMap.get(i) === i) return i;
        const root = find(parentMap.get(i)!);
        parentMap.set(i, root);
        return root;
    };
    
    const union = (i: string, j: string) => {
        const rootI = find(i);
        const rootJ = find(j);
        if (rootI !== rootJ) parentMap.set(rootI, rootJ);
    };

    currentLayers.forEach(l => l.traits.forEach(t => {
        t.rules.forEach(r => {
            if (r.type === 'force' && traitMap.has(r.targetId)) {
                union(t.id, r.targetId);
            }
        });
    }));

    const bundles = new Map<string, { 
        traits: Trait[], 
        weight: number, 
        exclusions: Set<string>, 
        hideLayers: Set<string>,
        layerIds: Set<string>
    }>();

    traitMap.forEach(t => {
        const root = find(t.id);
        if (!bundles.has(root)) {
            bundles.set(root, { 
                traits: [], 
                weight: Number.MAX_VALUE, 
                exclusions: new Set<string>(), 
                hideLayers: new Set<string>(),
                layerIds: new Set<string>()
            });
        }
        const bundle = bundles.get(root)!;
        bundle.traits.push(t);
        bundle.weight = Math.min(bundle.weight, t.weight); 
        bundle.layerIds.add(layerMap.get(t.id)!);
        
        t.rules.forEach(r => {
            if (r.type === 'exclude') bundle.exclusions.add(r.targetId);
            if (r.type === 'hideLayer') bundle.hideLayers.add(r.targetId);
        });
    });

    const activeLayers = currentLayers.filter(l => l.enabled).sort((a,b) => a.order - b.order);
    const selectedTraits: Trait[] = [];
    const occupiedLayers = new Set<string>(); 
    const globalExclusions = new Set<string>(); 
    const hiddenLayers = new Set<string>(); 

    for (const layer of activeLayers) {
        if (hiddenLayers.has(layer.id)) continue;
        if (occupiedLayers.has(layer.id)) continue;

        const layerTraitIds = layer.traits.map(t => t.id);
        const candidateRoots = new Set(layerTraitIds.map(id => find(id)));
        
        const validBundles: typeof bundles extends Map<any, infer V> ? V[] : never = [];

        for (const root of candidateRoots) {
            const bundle = bundles.get(root)!;
            
            if (bundle.traits.some(t => t.isMissing)) continue;
            if (bundle.traits.some(t => globalExclusions.has(t.id))) continue;

            let conflicts = false;
            for (const selected of selectedTraits) {
                if (bundle.exclusions.has(selected.id)) {
                    conflicts = true;
                    break;
                }
            }
            if (conflicts) continue;

            let overlapsOccupied = false;
            for (const layerId of Array.from(bundle.layerIds)) {
                if (occupiedLayers.has(layerId)) {
                    overlapsOccupied = true;
                    break;
                }
            }
            if (overlapsOccupied) continue;

            validBundles.push(bundle);
        }
        
        if (validBundles.length === 0) {
            return null; 
        }

        const totalWeight = validBundles.reduce((sum, b) => sum + b.weight, 0);
        let random = Math.random() * totalWeight;
        let pickedBundle = validBundles[0];
        for (const b of validBundles) {
            if ((random -= b.weight) < 0) {
                pickedBundle = b;
                break;
            }
        }
        
        pickedBundle.traits.forEach(t => {
            selectedTraits.push(t);
            const lId = layerMap.get(t.id)!;
            occupiedLayers.add(lId);
        });
        
        pickedBundle.exclusions.forEach(id => globalExclusions.add(id));
        pickedBundle.hideLayers.forEach(id => hiddenLayers.add(id));
    }

    const finalTraits = selectedTraits.map(t => ({
        layerName: currentLayers.find(l => l.id === layerMap.get(t.id))!.name,
        traitName: t.name,
        value: t.name,
        layerId: layerMap.get(t.id)!,
        traitId: t.id
    })).sort((a, b) => {
        const la = currentLayers.find(l => l.id === a.layerId)!;
        const lb = currentLayers.find(l => l.id === b.layerId)!;
        return la.order - lb.order;
    });

    return { id, name: `${config.namePrefix}${id}`, dna: finalTraits.map(t => t.traitId).join('-'), traits: finalTraits };
  }, [config.namePrefix]);

  const generateCollection = () => {
      if (!layers.length) return;
      setIsGenerating(true); setGeneratedCollection([]); setActiveTab('preview');
      
      setTimeout(() => {
          const res: GeneratedNFT[] = [];
          const dnaSet = new Set<string>();
          const coreDNASet = new Set<string>(); 

          let attempts = 0;
          const max = config.totalSupply;
          const maxAttempts = max * (max > 1000 ? 500 : 200); 
          
          while (res.length < max && attempts < maxAttempts) {
              attempts++;
              const nft = generateSingleNFT(layers, res.length + 1);
              
              if (nft) {
           // [优化] 背景排重逻辑增强
           if (config.uniqueBackgroundMode) {
            const coreDNA = nft.traits
                .filter(t => {
                    // 1. 如果手动指定了背景层ID (且不是空字符串)，则严格剔除该ID的层
                    if (config.backgroundLayerId && config.backgroundLayerId.trim() !== '') {
                        return t.layerId !== config.backgroundLayerId;
                    }
                    // 2. 否则回退到自动识别 (兼容旧配置或未指定情况)
                    return !isBackgroundLayer(t.layerName);
                })
                // 3. 构建核心基因序列。不仅包含 traitId，最好也包含 layerId 以防跨层组件ID冲突(虽然极少见)
                // 这里保持 traitId 即可，因为 traitId 是全局唯一的 UUID
                .map(t => t.traitId)
                .sort() // [new] 排序 traitId，确保属性顺序不同但内容相同时也能被识别为重复 (虽然 layers 顺序通常固定，但这更保险)
                .join('-');

            if (coreDNASet.has(coreDNA)) {
                // console.log("Duplicate Core DNA found, skipping:", coreDNA); // Debug use
                continue;
            }
            coreDNASet.add(coreDNA);
        }

                  if (!dnaSet.has(nft.dna)) {
                      dnaSet.add(nft.dna);
                      let score = 0;
                      nft.traits.forEach(t => {
                          const l = layers.find(x => x.id === t.layerId);
                          const tr = l?.traits.find(x => x.id === t.traitId);
                          score += -Math.log(tr?.probability || 0.0001);
                      });
                      nft.rawRarity = score;
                      res.push(nft);
                  }
              }
          }
          
          const sorted = [...res].sort((a,b) => (b.rawRarity||0) - (a.rawRarity||0));
          sorted.forEach((n, i) => {
              const rank = i / sorted.length;
              if (rank < 0.02) n.rarityScore = 1.8;           
              else if (rank < 0.09) n.rarityScore = 1.6; 
              else if (rank < 0.27) n.rarityScore = 1.4; 
              else if (rank < 0.55) n.rarityScore = 1.2; 
              else n.rarityScore = 1.0;                     
          });
          
          if (res.length < max) {
              alert(`Generation finished below the target supply.\n\nTarget: ${max} items\nGenerated: ${res.length} items\n\nPossible reasons:\n1. Trait combinations are exhausted.\n2. Too many exclusion rules reduce valid outputs.\n3. Background deduplication greatly reduces available combinations.`);
          }

          setGeneratedCollection(sorted.sort((a,b) => a.id - b.id));
          setIsGenerating(false);
      }, 50);
  };

  const refreshMiniPreview = useCallback(() => {
      if(!layers.length) return;
      let nft: GeneratedNFT | null = null;
      let tries = 0;
      while(!nft && tries < 10) {
          nft = generateSingleNFT(layers, 0);
          tries++;
      }
      setMiniPreviewNFT(nft);
  }, [layers, generateSingleNFT]);
    
  useEffect(() => { if (!miniPreviewNFT && layers.length) refreshMiniPreview(); }, [layers]);

  const handleExportProjectConfig = () => {
    const exportData = {
        version: "2.0", config,
        layers: layers.map(layer => ({ 
            ...layer, 
            traits: layer.traits.map(trait => ({ ...trait, file: undefined, previewUrl: undefined })) 
        }))
    };
    const fileNamePrefix = config.namePrefix.replace(/[^a-zA-Z0-9]/g, '_') || config.projectName.replace(/[^a-zA-Z0-9]/g, '_');
    saveAs(new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' }), `${fileNamePrefix}_Config.json`);
  };

  // [new] 导出生成的图片组合数据 (DNA Data)
  const exportDNAData = () => {
    if (generatedCollection.length === 0) {
        alert("There is no generated DNA data to export yet.");
        return;
    }
    const dataToExport = {
        version: "2.0",
        timestamp: new Date().toISOString(),
        configSummary: {
            totalSupply: config.totalSupply,
            namePrefix: config.namePrefix
        },
        collection: generatedCollection
    };
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: "application/json" });
    saveAs(blob, `${config.namePrefix.replace(/[^a-zA-Z0-9]/g, '_')}_DNA_Data.json`);
  };

  // [new] 导入 DNA 组合数据并生成 (恢复)
  const handleImportDNAData = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
          try {
              const data = JSON.parse(ev.target?.result as string);
              // 兼容性处理：支持直接数组或带元信息的对象
              let collectionData: GeneratedNFT[] = [];
              if (Array.isArray(data)) {
                  collectionData = data;
              } else if (data.collection && Array.isArray(data.collection)) {
                  collectionData = data.collection;
              } else {
                  throw new Error("Invalid file format: collection data was not found.");
              }

              if (collectionData.length === 0) {
                  throw new Error("Imported data is empty.");
              }

              // 简单验证数据完整性
              if (!collectionData[0].traits || !collectionData[0].dna) {
                  throw new Error("Data is missing required trait information (traits/dna).");
              }

              setIsGenerating(true);
              
              // 模拟加载过程，让界面有反应
              setTimeout(() => {
                  setGeneratedCollection(collectionData);
                  setIsGenerating(false);
                  setActiveTab('preview'); // 自动跳转到Preview页
                  alert(`Successfully imported and restored ${collectionData.length} generated DNA records!`);
              }, 500);

          } catch (err: any) {
              console.error(err);
              alert(`Import failed: ${err.message}`);
              setIsGenerating(false);
          }
      };
      reader.readAsText(file);
      e.target.value = ''; // 重置 input 以便允许重复上传同一文件
  };

  const exportZip = async () => {
    if (!generatedCollection.length) return;
    setIsExporting(true);
    setExportProgress(0);
    isExportCancelled.current = false;
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      const assetMap = new Map<string, HTMLImageElement>();
      const needsImages = exportMode === 'all' || exportMode.startsWith('images_');

      if (needsImages) {
        const allTraits = layers.flatMap(l => l.traits).filter(t => t.previewUrl && !t.isEmpty && !t.isMissing);
        const CHUNK_SIZE = 50; 
        for (let i = 0; i < allTraits.length; i += CHUNK_SIZE) {
            const chunk = allTraits.slice(i, i + CHUNK_SIZE);
            await Promise.all(chunk.map(async t => {
                const img = new Image();
                img.src = t.previewUrl!;
                await new Promise((resolve) => {
                    img.onload = resolve;
                    img.onerror = () => { console.warn('Image load failed:', t.id); resolve(null); };
                });
                if (img.complete && img.naturalHeight !== 0) {
                    assetMap.set(t.id, img);
                }
            }));
            await new Promise(r => setTimeout(r, 0));
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = config.width;
      canvas.height = config.height;
      const ctx = canvas.getContext('2d');
      const collectionName = (config.namePrefix.replace(/#/g, '').trim() || config.projectName).replace(/[\\/:*?"<>|]/g, '_');
      const encoder = new TextEncoder();
      
      const metaZip = new JSZip();
      const metaFolder = metaZip.folder("metadata");
      const allMeta: any[] = [];

      for (let i = 0; i < generatedCollection.length; i++) {
        if (isExportCancelled.current) break;
        const nft = generatedCollection[i];
        const cleanName = nft.name.trim();
        const imageFilename = `${cleanName.replace(/[\\/:*?"<>|]/g, '_')}.${config.outputFormat}`;
        const jsonFilenameBase = cleanName.replace(/#/g, '').trim().replace(/[\\/:*?"<>|]/g, '_');
        const jsonFilename = `${jsonFilenameBase}.json`;

        let uniqueId = '';
        if (window.crypto && window.crypto.subtle) {
          try {
            const data = encoder.encode(nft.dna);
            const hashBuffer = await crypto.subtle.digest('SHA-1', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            uniqueId = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          } catch (e) {
            uniqueId = `${config.namePrefix.replace(/\s+/g, '')}_${nft.id}_${Date.now()}`;
          }
        } else {
          uniqueId = `${config.namePrefix.replace(/\s+/g, '')}_${nft.id}`;
        }

// [updated] 获取Rarity标签
const { label } = getRarityLabel(nft.rarityScore || 1);

const attributes = nft.traits.map(t => ({ trait_type: t.layerName, value: t.value }));

// [removed] 根据需求，不再将Rarity等级和Score写入 attributes 数组
// attributes.push({ trait_type: "Rarity Level", value: label });
// attributes.push({ trait_type: "Rarity Score", value: (nft.rawRarity || 0).toFixed(2) });

let meta: any = {
  id: uniqueId,
  name: nft.name,
  description: config.description,
  image: imageFilename,
  attributes,
  // [updated] 扩展 rarity 字段，包含标签
  rarity: { 
      score: nft.rawRarity, 
      rank_val: nft.rarityScore,
      label: label 
  }
};

if (config.metadataFormat === 'SOL') {
  meta = {
    id: uniqueId,
    name: nft.name,
    symbol: config.namePrefix.replace(/[^A-Z0-9]/gi, '').substring(0, 10) || 'NFT',
    description: config.description,
    seller_fee_basis_points: 500,
    image: imageFilename,
    external_url: "",
    attributes,
    properties: { files: [{ uri: imageFilename, type: `image/${config.outputFormat === 'jpg' ? 'jpeg' : 'png'}` }], category: "image", creators: [] },
    rarity: { label, score: nft.rawRarity }
  };
}

        allMeta.push(meta);
        metaFolder?.file(jsonFilename, JSON.stringify(meta, null, 2));
        
        if (exportMode === 'metadata') {
           setExportProgress(Math.round(((i + 1) / generatedCollection.length) * 100));
           if (i % 200 === 0) await new Promise(r => setTimeout(r, 0)); 
        }
      }

      metaFolder?.file(`${collectionName}_metadata.json`, JSON.stringify(allMeta, null, 2));
      const metaContent = await metaZip.generateAsync({ type: "blob" });
      saveAs(metaContent, `${collectionName}_Metadata.zip`);

      if (exportMode === 'metadata') {
        setExportProgress(100);
        return;
      }

      const totalBatches = Math.ceil(generatedCollection.length / BATCH_SIZE);
      let startBatch = 0;
      let endBatch = totalBatches;

      if (exportMode.startsWith('images_')) {
          startBatch = parseInt(exportMode.split('_')[1]);
          endBatch = startBatch + 1;
      }

      for (let batchIdx = startBatch; batchIdx < endBatch; batchIdx++) {
        if (isExportCancelled.current) break;

        const batchZip = new JSZip(); 
        const imgFolder = batchZip.folder("images");
        const start = batchIdx * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, generatedCollection.length);

        for (let i = start; i < end; i++) {
          if (isExportCancelled.current) break;
          const nft = generatedCollection[i];
          const cleanName = nft.name.trim();
          const imageFilename = `${cleanName.replace(/[\\/:*?"<>|]/g, '_')}.${config.outputFormat}`;

          if (ctx && imgFolder) {
            try {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              
              // [updated] 导出渲染逻辑：支持组件独立排序
              const activeLayers = layers.filter(l => l.enabled);
              const drawList = activeLayers.map(l => {
                   const t = nft.traits.find(x => x.layerId === l.id);
                   const tr = l.traits.find(x => x.id === t?.traitId);
                   return { 
                       layer: l, 
                       trait: tr, 
                       // 优先使用组件的 customOrder，否则使用图层的 order
                       finalOrder: (tr?.customOrder !== undefined && tr.customOrder !== null) ? tr.customOrder : l.order 
                   };
              }).filter(x => x.trait).sort((a,b) => a.finalOrder - b.finalOrder);

              drawList.forEach(item => {
                 const img = assetMap.get(item.trait!.id);
                 if (img && img.complete && img.naturalHeight !== 0) {
                     ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                 }
              });

              const mimeType = config.outputFormat === 'jpg' ? 'image/jpeg' : 'image/png';
              const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, mimeType));

              if (blob) imgFolder.file(imageFilename, blob);
            } catch (drawErr) {
              console.error("Drawing error for NFT #" + nft.id, drawErr);
            }
          }

          setExportProgress(Math.round(((i + 1) / generatedCollection.length) * 100));
          if (i % 3 === 0) await new Promise(r => setTimeout(r, 0));
        }

        const batchContent = await batchZip.generateAsync({ type: "blob" });
        saveAs(batchContent, `${collectionName}_Images_Part_${batchIdx + 1}.zip`);
        await new Promise(r => setTimeout(r, 1000));
      }

    } catch (e) {
      console.error(e);
      alert("Export failed. Check browser memory or reduce the number of generated items.");
    } finally {
      setIsExporting(false);
    }
  };

  // [updated] CSS渲染逻辑：支持组件独立排序
  const renderLayerImageCSS = (traits: GeneratedNFT['traits'], hidden?: Set<string>) => {
    // 1. 收集所有需要渲染的组件信息
    const renderList = traits.map(t => {
        const layer = layers.find(l => l.id === t.layerId);
        if (!layer || !layer.enabled) return null;
        if (hidden && hidden.has(t.traitId)) return null;
        
        const trait = layer.traits.find(tr => tr.id === t.traitId);
        if (!trait || !trait.previewUrl || trait.isMissing) return null;

        // 计算最终排序：优先使用组件自定义排序，否则使用图层排序
        const finalOrder = (trait.customOrder !== undefined && trait.customOrder !== null) 
                           ? trait.customOrder 
                           : layer.order;

        return { layerId: layer.id, trait, finalOrder };
    }).filter(Boolean) as { layerId: string, trait: Trait, finalOrder: number }[];

    // 2. 根据最终排序进行升序排列
    renderList.sort((a, b) => a.finalOrder - b.finalOrder);

    return (
        <div className="relative w-full h-full bg-white">
          {renderList.map(item => (
            <img 
                key={`${item.layerId}-${item.trait.id}`} 
                src={item.trait.previewUrl} 
                className="absolute top-0 left-0 w-full h-full object-contain" 
                alt=""
                style={{ zIndex: item.finalOrder }} // 虽然 DOM 顺序已经排好，加 z-index 双重保险
            />
          ))}
        </div>
    );
  };

  const RarityStats = () => {
      // ... (RarityStats 代码保持不变)
      if (generatedCollection.length === 0) return null;
      const counts = { UR: 0, SSR: 0, SR: 0, R: 0, N: 0 };
      generatedCollection.forEach(nft => {
          const score = nft.rarityScore || 1;
          if (score >= 1.8) counts.UR++;
          else if (score >= 1.6) counts.SSR++;
          else if (score >= 1.4) counts.SR++;
          else if (score >= 1.2) counts.R++;
          else counts.N++;
      });
      const currentTotal = generatedCollection.length;
      const targetTotal = config.totalSupply;

      const stats = [
          { label: 'UR', score: '1.8', count: counts.UR, color: 'bg-rose-500' },
          { label: 'SSR', score: '1.6', count: counts.SSR, color: 'bg-orange-500' },
          { label: 'SR', score: '1.4', count: counts.SR, color: 'bg-[#6056F6]' },
          { label: 'R', score: '1.2', count: counts.R, color: 'bg-[#37D0FF]' },
          { label: 'N', score: '1.0', count: counts.N, color: 'bg-gray-400' },
      ];

      return (
          <div className="bg-white p-3 rounded-xl border border-gray-200 mt-4 animate-in fade-in">
              <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
                      <PieChart size={12}/> Rarity Distribution (click to filter)
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${currentTotal < targetTotal ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      Total: {currentTotal} / {targetTotal} items
                  </span>
              </div>
              <div className="space-y-1.5">
                  {stats.map((stat) => (
                      <div 
                        key={stat.label} 
                        onClick={() => toggleFilterRarity(stat.label)}
                        className={`flex items-center justify-between text-[10px] p-1.5 rounded cursor-pointer transition-colors ${filterRarityLabels.has(stat.label) ? 'bg-[#6056F6]/10 ring-1 ring-[#6056F6]/30' : 'hover:bg-gray-50'}`}
                      >
                          <div className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${stat.color}`}></span>
                              <span className="font-bold text-gray-700">{stat.label} <span className="text-gray-400 font-normal">({stat.score})</span></span>
                              {filterRarityLabels.has(stat.label) && <Check size={10} className="text-[#6056F6]"/>}
                          </div>
                          <div className="flex items-center gap-2">
                              <span className="text-gray-500">{stat.count}</span>
                              <span className="w-8 text-right text-gray-400 font-mono">{(stat.count / currentTotal * 100).toFixed(0)}%</span>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      );
  };

  // 1. Sidebar Render (保持不变)
  const renderSidebar = () => (
    // ... (代码量很大，但不需要updated，为了完整性请保留原有的 renderSidebar 代码)
    <div className="w-[340px] flex min-h-0 flex-col bg-white border-r border-gray-200 h-full z-20 shadow-xl shadow-gray-100/50">
      <div className="border-b border-gray-100 p-5 pb-0 bg-white">
          <div className="flex justify-between items-center mb-6">
             <div>
                 <h1 className="text-xl font-black bg-gradient-to-r from-[#6056F6] to-[#37D0FF] text-transparent bg-clip-text tracking-tight">GenMatrix NFT</h1>
                 <span className="text-[10px] text-gray-400 font-medium tracking-wide">Gen v4.3 Pro</span>
             </div>
             <div className="flex bg-gray-100/80 p-1 rounded-lg gap-1">
                {[
                    {id: 'editor', icon: <Layers size={14}/>, label: 'Editor'}, 
                    {id: 'preview', icon: <Eye size={14}/>, label: 'Preview'}
                ].map(t => (
                    <button 
                        key={t.id} 
                        onClick={() => setActiveTab(t.id as any)} 
                        title={t.label}
                        className={`p-2 rounded-md transition-all duration-200 ${activeTab === t.id ? 'bg-white shadow-sm text-[#6056F6] ring-1 ring-black/5' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200/50'}`}
                    >
                        {t.icon}
                    </button>
                ))}
             </div>
          </div>
          {activeTab === 'editor' && (
              <div className="flex gap-6 border-b border-gray-100">
                  <button onClick={() => setSidebarTab('layers')} className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${sidebarTab === 'layers' ? 'border-[#6056F6] text-[#6056F6]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                      <Layers size={14}/> Layers
                  </button>
                  <button onClick={() => setSidebarTab('settings')} className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${sidebarTab === 'settings' ? 'border-[#6056F6] text-[#6056F6]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                      <Settings size={14}/> Settings
                  </button>
                  <button onClick={() => setIsRuleManagerOpen(true)} className="ml-auto pb-3 text-xs font-bold text-gray-400 hover:text-[#6056F6] flex items-center gap-1 transition-colors"><ShieldAlert size={14}/> Rules</button>
              </div>
          )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto flex flex-col p-5 pb-28 scrollbar-thin">
          {activeTab === 'editor' && sidebarTab === 'settings' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
               <div className="bg-[#6056F6]/5 border border-[#6056F6]/20 rounded-xl p-4">
                      <h3 className="text-sm font-bold text-[#6056F6] mb-3 flex items-center gap-2"><Save size={16}/> Project Data</h3>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                          <button onClick={handleExportProjectConfig} className="flex items-center justify-center gap-2 py-2.5 bg-white border border-[#6056F6]/30 rounded-lg text-xs font-bold text-gray-700 hover:text-[#6056F6] hover:border-[#6056F6] transition-all shadow-sm"><Download size={14}/> Export Config</button>
                          <label className="flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-[#6056F6] to-[#37D0FF] hover:opacity-90 rounded-lg text-xs font-bold text-white cursor-pointer transition-all shadow-md shadow-[#6056F6]/20"><FileUp size={14}/> Import Config<input type="file" accept=".json" className="hidden" onChange={handleImportProjectConfig}/></label>
                      </div>

                      {/* [new] 导入 DNA 数据按钮 */}
                      <label className="flex items-center justify-center gap-2 py-2.5 bg-white border border-dashed border-gray-400 rounded-lg text-xs font-bold text-gray-600 cursor-pointer hover:border-[#6056F6] hover:text-[#6056F6] hover:bg-white transition-all shadow-sm" title="Import previously exported DNA data to restore generated combinations.">
                          <Database size={14}/> Import DNA Data
                          <input type="file" accept=".json" className="hidden" onChange={handleImportDNAData}/>
                      </label>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">NFT Name Prefix</label>
                        <input value={config.namePrefix} onChange={e => setConfig({...config, namePrefix: e.target.value})} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#6056F6] focus:border-transparent outline-none transition-all" placeholder="Example: GenMatrix #"/>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Supply Count</label>
                        <input type="number" value={config.totalSupply} onChange={e => setConfig({...config, totalSupply: +e.target.value})} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#6056F6] focus:border-transparent outline-none transition-all"/>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Metadata Format</label>
                        <select value={config.metadataFormat} onChange={e => setConfig({...config, metadataFormat: e.target.value as MetadataFormat})} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#6056F6] focus:border-transparent outline-none transition-all bg-white cursor-pointer">
                            <option value="ETH">Ethereum / Polygon (OpenSea Standard)</option>
                            <option value="SOL">Solana (Metaplex Standard)</option>
                            <option value="BSC">BSC (Standard)</option>
                        </select>
                    </div>

                 {/* [new] 一键优化Rarity */}
                 <div className="bg-gradient-to-r from-violet-50 to-indigo-50 p-3 rounded-lg border border-violet-100">
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-xs font-bold text-violet-600 uppercase tracking-wider flex items-center gap-1">
                                <Sparkles size={12}/> Rarity Balance Optimizer
                            </label>
                        </div>
                        <p className="text-[10px] text-gray-500 mb-3 leading-relaxed">
                            Automatically balance base layers and accessory layers to create cleaner rarity tiers.
                        </p>
                        <button 
                            onClick={optimizeWeights}
                            className="w-full py-2 bg-white hover:bg-violet-500 hover:text-white text-violet-600 border border-violet-200 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2"
                        >
                            <Scale size={14}/> Optimize Trait Weights
                        </button>
                    </div>

                    {/* [new] 背景层指定设置 */}
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">
                            Background Layer <span className="text-gray-300 font-normal">(for background deduplication)</span>
                        </label>
                        <select 
                            value={config.backgroundLayerId || ''} 
                            onChange={e => setConfig({...config, backgroundLayerId: e.target.value})} 
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#6056F6] focus:border-transparent outline-none transition-all bg-white cursor-pointer"
                        >
                            <option value="">Auto detect (name contains bg/background)</option>
                            {layers.map(l => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                        </select>
                    </div>
                  </div>

                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-500 flex items-center gap-2"><Calculator size={14}/> Possible Combinations</span>
                      <span className="font-mono text-[#6056F6] font-black text-sm">{maxCombinations.toLocaleString()}</span>
                  </div>
              </div>
          )}

          {activeTab === 'editor' && sidebarTab === 'layers' && (
              <>
                 <div className="flex justify-between items-center mb-2">
                      <label className="flex-1 flex flex-col items-center justify-center p-4 border-2 border-dashed border-[#6056F6]/30 rounded-xl cursor-pointer bg-[#6056F6]/5 hover:bg-[#6056F6]/10 hover:border-[#6056F6] group transition-all duration-300 mr-2">
                        <div className="flex flex-col items-center gap-1 text-[#6056F6]/70 group-hover:text-[#6056F6] transition-colors">
                            <FolderInput size={20} />
                            <span className="font-bold text-xs">Import Folders</span>
                        </div>
                        <input type="file" webkitdirectory="" directory="" multiple className="hidden" onChange={handleBatchFolderUpload} />
                    </label>
                    <button onClick={clearAllLayers} className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-red-200 rounded-xl cursor-pointer bg-red-50/30 hover:bg-red-50 hover:border-red-400 group transition-all duration-300 text-red-400 hover:text-red-500 w-24" title="Clear all layers">
                          <Trash2 size={20}/>
                          <span className="font-bold text-xs mt-1">Clear</span>
                    </button>
                </div>
                
                <div className="space-y-2 mb-4">

                {displayedLayers.map((l, i) => (
                    <div 
                        key={l.id} draggable 
                        onDragStart={() => (dragItem.current = i)} onDragEnter={() => (dragOverItem.current = i)} onDragEnd={handleSort}
                        onClick={() => setSelectedLayerId(l.id)}
                        className={`group relative flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200 ${selectedLayerId === l.id ? 'bg-[#6056F6]/5 border-[#6056F6]/30 shadow-sm ring-1 ring-[#6056F6]/20' : 'bg-white border-gray-100 hover:border-gray-300 hover:shadow-sm'}`}
                    >
                        <div className="text-gray-300 cursor-move group-hover:text-gray-500 transition-colors"><GripVertical size={16} /></div>
                        {selectedLayerId === l.id && <div className="absolute left-0 top-3 bottom-3 w-1 bg-gradient-to-b from-[#6056F6] to-[#37D0FF] rounded-r-full"></div>}
                        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                            <input value={l.name} onClick={e => e.stopPropagation()} onChange={e => setLayers(p => p.map(x => x.id === l.id ? { ...x, name: e.target.value } : x))} className="font-bold text-sm bg-transparent border-b border-transparent focus:border-[#6056F6] outline-none w-full text-gray-700"/>
                            
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1 text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                    <span>Order {l.order}</span>
                                </div>
                                <span className="text-[10px] text-gray-400">{l.traits.length} traits</span>
                            </div>

                            {/* [new] 优化类型选择器 */}
                            <div onClick={e => e.stopPropagation()} className="flex items-center gap-1">
                                <select 
                                    value={l.optimizeType || ''} 
                                    onChange={(e) => setLayers(prev => prev.map(x => x.id === l.id ? { ...x, optimizeType: e.target.value as any || undefined } : x))}
                                    className={`text-[9px] border rounded px-1 py-0.5 outline-none cursor-pointer transition-colors ${
                                        l.optimizeType === 'base' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                                        l.optimizeType === 'deco' ? 'bg-purple-50 text-purple-600 border-purple-200' :
                                        'bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-300'
                                    }`}
                                    title="Set how this layer is handled by the optimizer"
                                >
                                    <option value="">-- Optimization Type --</option>
                                    <option value="base">Base Layer (even weights)</option>
                                    <option value="deco">Accessory Layer (weighted gradient)</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                            <button onClick={e => { e.stopPropagation(); setLayers(p => p.map(x => x.id === l.id ? { ...x, enabled: !x.enabled } : x)) }} className={`p-1.5 rounded-md hover:bg-gray-100 transition-colors ${l.enabled ? 'text-gray-500' : 'text-gray-300'}`}>{l.enabled ? <Eye size={16}/> : <EyeOff size={16}/>}</button>
                            <button onClick={e => { e.stopPropagation(); deleteLayer(l.id); }} className="p-1.5 rounded-md hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                        </div>
                    </div>
                  ))}

                </div>
                
                <button onClick={addLayer} className="w-full py-2.5 border border-dashed border-gray-300 rounded-xl text-xs font-bold text-gray-500 hover:border-[#6056F6] hover:text-[#6056F6] hover:bg-[#6056F6]/5 flex items-center justify-center gap-2 transition-all"><Plus size={14}/> New Layer</button>
                
                {/* Mini Preview */}
                <div className="mt-auto pt-6 border-t border-gray-100">
                    <div className="bg-white rounded-2xl border border-gray-200 p-3 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-center mb-2 px-1 cursor-pointer" onClick={() => setIsMiniPreviewOpen(!isMiniPreviewOpen)}>
                            <span className="text-xs font-bold text-gray-500 flex items-center gap-2"><Sparkles size={12} className="text-[#6056F6]"/> Random Preview</span>
                            {isMiniPreviewOpen ? <ChevronDown size={14} className="text-gray-400"/> : <ChevronUp size={14} className="text-gray-400"/>}
                        </div>
                        {isMiniPreviewOpen && (
                            <div className="pt-1 animate-in slide-in-from-top-2">
                                <div className="aspect-square bg-gray-50 rounded-xl overflow-hidden mb-3 border border-gray-100 relative cursor-pointer group" onClick={() => {if(miniPreviewNFT) {setSelectedNFT(miniPreviewNFT); setActiveTab('preview');}}}>
                                    {miniPreviewNFT ? renderLayerImageCSS(miniPreviewNFT.traits) : <div className="flex items-center justify-center h-full text-xs text-gray-300 font-medium">No preview yet</div>}
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center"><ZoomIn className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md"/></div>
                                </div>
                                <button onClick={refreshMiniPreview} className="w-full py-2 bg-gradient-to-r from-[#6056F6] to-[#37D0FF] hover:opacity-90 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-sm"><Shuffle size={14}/> Generate Random Preview</button>
                            </div>
                        )}
                    </div>
                </div>
             </>
          )}

          {activeTab === 'preview' && (
              <div className="space-y-4 animate-in slide-in-from-left-4 duration-300">
                  <div className="bg-[#6056F6]/5 p-4 rounded-xl border border-[#6056F6]/10">
                      <div className="text-xs font-bold text-[#6056F6] uppercase mb-2 flex items-center gap-2"><Filter size={12}/> Filter by Layer</div>
                      <div className="relative">
                        <select value={previewEditLayerId || 'ALL'} onChange={e => setPreviewEditLayerId(e.target.value)} className="w-full bg-white border border-[#6056F6]/20 rounded-lg p-2.5 text-sm appearance-none outline-none focus:ring-2 focus:ring-[#6056F6]/20 text-gray-700 font-medium cursor-pointer hover:border-[#6056F6]/30 transition-colors">
                            <option value="ALL">All Layers</option>
                            {layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                        <ChevronDown size={16} className="absolute right-3 top-3 text-gray-400 pointer-events-none"/>
                      </div>
                      
                      {(filterTraitIds.size > 0 || filterRarityLabels.size > 0) && (
                        <div className="mt-3 pt-3 border-t border-[#6056F6]/10">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-[10px] font-bold text-gray-400 uppercase">Active Filters</span>
                                <button onClick={clearAllFilters} className="text-[10px] text-red-400 hover:text-red-600 font-bold">Clear All</button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {Array.from(filterRarityLabels).map(label => (
                                    <div key={`rarity-${label}`} className="flex items-center gap-1 bg-white border border-[#6056F6]/20 rounded px-1.5 py-0.5 text-[10px] font-bold text-[#6056F6] animate-in zoom-in">
                                        <span>{label}</span>
                                        <button onClick={() => toggleFilterRarity(label)} className="hover:text-[#6056F6]/80"><X size={10}/></button>
                                    </div>
                                ))}
                                {Array.from(filterTraitIds).map(id => {
                                    const t = layers.flatMap(l=>l.traits).find(x => x.id === id);
                                    if(!t) return null;
                                    return (
                                        <div key={id} className="flex items-center gap-1 bg-white border border-[#6056F6]/20 rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-600 animate-in zoom-in">
                                            <span>{t.name}</span>
                                            <button onClick={() => toggleFilterTrait(id)} className="hover:text-red-500"><X size={10}/></button>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                      )}
                  </div>

                  <RarityStats />

                  <div className="space-y-2">
                      <div className="text-xs font-bold text-gray-400 px-1 uppercase">Click Traits to Filter</div>
                      {(() => {
                          let traitsToShow = (previewEditLayerId && previewEditLayerId !== 'ALL') 
                              ? (layers.find(l => l.id === previewEditLayerId)?.traits || [])
                              : layers.flatMap(l => l.traits);
                          
                          traitsToShow = [...traitsToShow].sort((a, b) => {
                              const countA = generatedCollection.filter(n => n.traits.some(tr => tr.traitId === a.id)).length;
                              const countB = generatedCollection.filter(n => n.traits.some(tr => tr.traitId === b.id)).length;
                              const pctA = generatedCollection.length > 0 ? (countA / generatedCollection.length) : 0;
                              const pctB = generatedCollection.length > 0 ? (countB / generatedCollection.length) : 0;
                              return pctA - pctB; 
                          });

                          return traitsToShow.map(t => {
                              const count = generatedCollection.filter(n => n.traits.some(tr => tr.traitId === t.id)).length;
                              const percentage = generatedCollection.length > 0 ? ((count / generatedCollection.length) * 100).toFixed(1) : '0.0';
                              
                              return (
                                  <div key={t.id} onClick={() => toggleFilterTrait(t.id)} className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-all ${filterTraitIds.has(t.id) ? 'bg-[#6056F6]/5 border-[#6056F6]/30 shadow-sm ring-1 ring-[#6056F6]/20' : 'bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}>
                                        <div className="w-10 h-10 bg-white border border-gray-200 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0 p-0.5 shadow-sm">{t.previewUrl ? <img src={t.previewUrl} className="w-full h-full object-contain rounded-sm"/> : <Ghost size={16} className="text-gray-300"/>}</div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-bold text-gray-700 truncate">{t.name}</div>
                                            <div className="text-[10px] text-gray-400 font-medium mt-0.5">{count} / {percentage}%</div>
                                        </div>
                                        {filterTraitIds.has(t.id) && <CheckSquare size={16} className="text-[#6056F6]"/>}
                                  </div>
                              )
                          });
                      })()}
                  </div>
                  <button onClick={generateCollection} disabled={isGenerating} className="w-full py-3 bg-black hover:bg-gray-800 text-white rounded-xl flex items-center justify-center gap-2 text-sm font-bold shadow-lg disabled:opacity-50 transition-all active:scale-95">{isGenerating ? <Loader2 className="animate-spin" size={16}/> : <RefreshCw size={16}/>} Regenerate Preview</button>
              </div>
          )}
          
      </div>
    </div>
  );

  // 2. Editor Main Workspace
  const renderEditorWorkspace = () => (
    <div className="relative flex min-h-0 h-full flex-col bg-[#FAFAFA]">
        {selectedLayerId && layers.find(l=>l.id===selectedLayerId) ? (
            <>
            <div className="bg-white/80 backdrop-blur-md p-4 border-b border-gray-200 flex justify-between items-center shadow-sm z-10 sticky top-0">
                <div>
                    <h2 className="text-lg font-black text-gray-800 tracking-tight flex items-center gap-2">
                        {layers.find(l=>l.id===selectedLayerId)?.name}
                        <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">Layer Editor</span>
                    </h2>
                </div>
                <div className="flex gap-3">
                    <button onClick={() => sortLayerTraits(selectedLayerId, !traitSortAsc)} className="px-3 py-2 bg-white border border-gray-200 hover:border-[#6056F6] hover:text-[#6056F6] rounded-lg text-xs font-bold text-gray-600 flex items-center gap-2 shadow-sm transition-all active:scale-95" title="Sort by weight">
                        <ArrowDownWideNarrow size={14} className={traitSortAsc ? 'rotate-180' : ''}/> {traitSortAsc ? 'Weight Asc' : 'Weight Desc'}
                    </button>
                    
                    <button 
                        onClick={() => setConfig({...config, uniqueBackgroundMode: !config.uniqueBackgroundMode})} 
                        className={`px-3 py-2 border rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm transition-all active:scale-95 ${config.uniqueBackgroundMode ? 'bg-[#6056F6] border-[#6056F6] text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-[#6056F6] hover:text-[#6056F6]'}`}
                        title="When enabled, combinations that only differ by background will be skipped."
                    >
                        <Copy size={14} /> {config.uniqueBackgroundMode ? 'Background Dedup: On' : 'Background Dedup: Off'}
                    </button>

                    <button onClick={() => resetLayerWeights(selectedLayerId)} className="px-3 py-2 bg-white border border-gray-200 hover:border-[#6056F6] hover:text-[#6056F6] rounded-lg text-xs font-bold text-gray-600 flex items-center gap-2 shadow-sm transition-all active:scale-95"><Scale size={14}/> Even Weights</button>
                    
                    {(() => {
                        const currentLayer = layers.find(l => l.id === selectedLayerId);
                        const hasEmpty = currentLayer?.traits.some(t => t.isEmpty);
                        return !hasEmpty && (
                            <button 
                                onClick={() => handleAddEmptyTrait(selectedLayerId)} 
                                className="px-3 py-2 bg-white border border-gray-200 hover:border-gray-400 hover:text-gray-800 rounded-lg text-xs font-bold text-gray-500 flex items-center gap-2 shadow-sm transition-all active:scale-95"
                                title="Add a transparent empty trait"
                            >
                                <Eraser size={14}/> Add Empty Trait
                            </button>
                        );
                    })()}

                    <label className="cursor-pointer bg-gradient-to-r from-[#6056F6] to-[#37D0FF] hover:opacity-90 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-xs font-bold shadow-md shadow-[#6056F6]/20 transition-all active:scale-95"><Upload size={14} /> Upload Traits<input type="file" multiple accept="image/*" className="hidden" onChange={async e => {
                        if(!e.target.files) return;
                        const newTraits: Trait[] = [];
                        for(const f of Array.from(e.target.files)) {
                            const id = generateId();
                            await dbHelper.saveFile(id, f);
                            newTraits.push({ id, name: f.name.split('.')[0], filename: f.name, weight: 10, file: f, previewUrl: URL.createObjectURL(f), probability: 0, rules: [], locked: false });
                        }
                        const l = layers.find(x=>x.id===selectedLayerId)!;
                        updateLayerTraits(selectedLayerId!, [...l.traits, ...newTraits]);
                        e.target.value = '';
                    }} /></label>
                </div>
            </div>
            
            <div className="min-h-0 flex-1 overflow-y-auto p-6 pb-28 scrollbar-thin">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-5 content-start">
                    {(layers.find(l=>l.id===selectedLayerId)?.traits || []).map(trait => (
                        <div key={trait.id} className="bg-white p-3 rounded-2xl border border-gray-200 hover:border-[#6056F6] hover:shadow-lg transition-all duration-300 group relative">
                            <div className="aspect-square bg-gray-50 rounded-xl mb-3 flex items-center justify-center overflow-hidden relative cursor-zoom-in border border-gray-100 group-hover:border-[#6056F6]/20" onClick={()=>trait.previewUrl && setViewingTraitUrl(trait.previewUrl)}>
                                {trait.isEmpty ? <Ghost size={32} className="text-gray-300"/> : <img src={trait.previewUrl} className="max-w-full max-h-full object-contain transition-transform duration-500 group-hover:scale-110"/>}
                                {trait.rules.length > 0 && (
                                    <div className="absolute top-2 right-2 flex flex-col gap-1">
                                            {trait.rules.map((r,i)=>(
                                                <div key={i} className={`w-2 h-2 rounded-full border border-white shadow-sm ${r.type==='force'?'bg-green-500': r.type==='exclude'?'bg-red-500':'bg-gray-500'}`}></div>
                                            ))}
                                    </div>
                                )}
                            </div>
                            
                            <input value={trait.name} onChange={e => updateLayerTraits(selectedLayerId!, layers.find(l=>l.id===selectedLayerId)!.traits.map(t=>t.id===trait.id?{...t,name:e.target.value}:t))} className="w-full text-xs font-bold mb-2 border-b border-transparent focus:border-[#6056F6] p-0.5 focus:bg-[#6056F6]/5 rounded outline-none transition-colors text-center text-gray-700"/>
                            
                            <div className="flex justify-between items-center text-[10px] text-gray-400 mb-2 font-mono">
                                <button onClick={() => toggleTraitLock(selectedLayerId!, trait.id)} className={`p-1 rounded hover:bg-gray-100 transition-colors ${trait.locked ? 'text-[#6056F6]' : 'text-gray-300'}`} title={trait.locked ? "Weight locked" : "Click to lock weight"}>
                                    {trait.locked ? <Lock size={12}/> : <Unlock size={12}/>}
                                </button>
                                <div className="flex items-center gap-1">
                                    {/* [updated] 支持小数点输入 */}
                                    <input 
                                        type="number" 
                                        step="0.1"
                                        value={Number(trait.weight.toFixed(1))} // 显示时保留一位小数，去除末尾无效0
                                        onFocus={(e) => e.target.select()}
                                        onChange={e => handleWeightChange(selectedLayerId!, trait.id, parseFloat(e.target.value))} 
                                        className="w-10 bg-gray-100 rounded px-1 text-center border-none focus:ring-1 focus:ring-[#6056F6] outline-none transition-all text-xs"
                                    />
                                    <span className="text-[#6056F6] font-bold" title={`Estimated share ${(trait.probability!*100).toFixed(1)}%`}>≈ {Math.round(trait.probability! * config.totalSupply)}items</span>
                                </div>
                            </div>
                            <input type="range" max="100" value={trait.weight} disabled={trait.locked} onChange={e => handleWeightChange(selectedLayerId!, trait.id, +e.target.value)} className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer ${trait.locked ? 'bg-gray-200 accent-gray-400 cursor-not-allowed' : 'bg-[#6056F6]/20 accent-[#6056F6]'}`}/>
                            
                            {/* [new] 组件独立图层排序设置 */}
                            <div className="mt-2 pt-2 border-t border-gray-50 flex items-center justify-between">
                                <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1" title="Set an independent render order for this trait. Leave empty to follow the layer.">
                                    <MoveVertical size={10}/> 
                                    Order:
                                </span>
                                <input 
                                    type="number" 
                                    placeholder={layers.find(l=>l.id===selectedLayerId)?.order.toString()}
                                    value={trait.customOrder !== undefined ? trait.customOrder : ''} 
                                    onChange={e => handleCustomOrderChange(selectedLayerId!, trait.id, e.target.value)}
                                    className="w-12 text-[10px] bg-gray-50 border border-gray-100 rounded px-1 py-0.5 text-center focus:ring-1 focus:ring-[#6056F6] focus:border-[#6056F6] outline-none"
                                />
                            </div>
                            
                            <div className="absolute top-2 left-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-2 group-hover:translate-y-0 z-10">
                                <button onClick={(e) => {e.stopPropagation(); setEditingRuleIds({layerId: selectedLayerId!, traitId: trait.id})}} className="p-2 bg-white/90 backdrop-blur text-gray-500 hover:text-white hover:bg-violet-500 rounded-lg shadow-md border border-gray-200 hover:border-violet-500 transition-all" title="Configure Rules"><SlidersHorizontal size={16}/></button>
                                <button onClick={(e) => {
                                    e.stopPropagation();
                                    if(!confirm("Delete this trait?")) return;
                                    const l = layers.find(x=>x.id===selectedLayerId)!;
                                    updateLayerTraits(selectedLayerId!, l.traits.filter(t=>t.id!==trait.id));
                                    if(!trait.isEmpty) dbHelper.deleteFile(trait.id);
                                }} className="p-2 bg-white/90 backdrop-blur text-gray-400 hover:text-white hover:bg-red-500 rounded-lg shadow-md border border-gray-200 hover:border-red-500 transition-all" title="Delete Trait"><Trash2 size={16}/></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            </>
        ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-300">
                <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4 border-2 border-dashed border-gray-200">
                    <MousePointerClick size={40} className="opacity-50"/>
                </div>
                <p className="text-sm font-bold">Select a layer from the left to start editing</p>
            </div>
        )}
        <div className="absolute bottom-6 right-6 z-50">
            <button onClick={generateCollection} disabled={!layers.length} className="bg-gray-900 hover:bg-black text-white px-8 py-4 rounded-full shadow-2xl font-bold flex items-center gap-3 transition-all active:scale-95 disabled:opacity-50 disabled:scale-100 hover:-translate-y-1"><RefreshCw size={20} /> Generate All NFTs ({config.totalSupply})</button>
        </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 w-full bg-white text-gray-800 font-sans overflow-hidden relative">
      {/* ... (Modals 保持不变) */}
      {isExporting && (
        <div className="fixed top-6 right-6 z-[200] bg-white shadow-2xl rounded-2xl border border-gray-100 p-5 w-80 animate-in slide-in-from-right-10 fade-in duration-300">
           <div className="flex justify-between items-center mb-3">
               <div className="flex items-center gap-3">
                   <div className="relative">
                       <Loader2 className="animate-spin text-violet-600" size={20}/>
                       <div className="absolute inset-0 bg-violet-600/20 blur-md rounded-full"></div>
                   </div>
                   <span className="font-bold text-sm text-gray-800">Exporting assets...</span>
               </div>
               <button onClick={() => isExportCancelled.current = true} className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded-md flex items-center gap-1 font-bold transition-colors"><XCircle size={14}/> Cancel</button>
           </div>
           <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden mb-3 border border-gray-50">
              <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(139,92,246,0.5)]" style={{width: `${exportProgress}%`}}></div>
           </div>
           <div className="flex justify-between text-xs text-gray-400 font-medium">
               <span>
                   {exportMode === 'metadata' ? 'Packing metadata' : 
                    exportMode.startsWith('images_') ? `Packing images (batch ${parseInt(exportMode.split('_')[1]) + 1})` :
                    'Processing batches...'}
               </span>
               <span className="font-mono font-bold text-violet-600">{exportProgress}%</span>
           </div>
        </div>
      )}

      {viewingTraitUrl && <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer animate-in fade-in duration-200" onClick={() => setViewingTraitUrl(null)}><img src={viewingTraitUrl} className="max-w-[85vw] max-h-[85vh] object-contain rounded-xl shadow-2xl ring-1 ring-white/10" /></div>}

     {/* Rule Manager - Global Rule Overview (restored) */}
     {isRuleManagerOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-[800px] max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200 border border-gray-100">
                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <h3 className="font-bold text-lg flex items-center gap-2 text-gray-800"><ShieldAlert size={20} className="text-violet-600"/> Global Rule Overview</h3>
                    <button onClick={() => setIsRuleManagerOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X size={20} className="text-gray-500"/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50/30">
                    {ruleConflicts.length > 0 && (
                        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-600 space-y-2 shadow-sm">
                            <div className="font-bold flex gap-2 text-sm items-center"><ZapOff size={16}/> Rule conflicts detected</div>
                            <ul className="list-disc list-inside opacity-90">{ruleConflicts.map((c, i) => <li key={i}>{c}</li>)}</ul>
                        </div>
                    )}
                    <div className="space-y-4">
                        {globalRules.length === 0 ? (
                            <div className="text-center py-20 flex flex-col items-center gap-3">
                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center"><ShieldAlert size={32} className="text-gray-300"/></div>
                                <p className="text-gray-400 font-medium">No rules configured</p>
                            </div>
                        ) : (
                            ['force', 'exclude', 'hideLayer'].map(type => {
                                const rulesOfType = globalRules.filter(r => r.rule.type === type);
                                if(rulesOfType.length === 0) return null;
                                
                                return (
                                    <div key={type} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                                            <button onClick={() => { const n = new Set(ruleGroupExpanded); if(n.has(type)) n.delete(type); else n.add(type); setRuleGroupExpanded(n); }} className="w-full flex items-center justify-between p-3 bg-gray-50/80 hover:bg-gray-100 transition-colors border-b border-gray-100">
                                                <div className="flex items-center gap-2 text-sm font-bold">
                                                    {ruleGroupExpanded.has(type) ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                                                    <span className={type === 'force' ? 'text-green-600' : type === 'exclude' ? 'text-red-600' : 'text-gray-600'}>
                                                        {type === 'force' ? 'Force Rules (Must Have)' : type === 'exclude' ? 'Exclusion Rules (Conflict)' : 'Hide Layer Rules'}
                                                    </span>
                                                </div>
                                                <span className="bg-white px-2 py-0.5 rounded text-xs font-bold text-gray-500 border border-gray-200">{rulesOfType.length}</span>
                                            </button>
                                            
                                            {ruleGroupExpanded.has(type) && (
                                                <div className="p-2 space-y-2">
                                                    {rulesOfType.map((item, i) => {
                                                         const targetTrait = layers.flatMap(l => l.traits).find(t => t.id === item.rule.targetId);
                                                         
                                                         return (
                                                             <div key={i} className="flex items-center justify-between bg-gray-50 p-2 rounded-lg border border-gray-100 hover:border-violet-200 transition-all">
                                                                     <div className="flex items-center gap-3">
                                                                         {/* Source Trait */}
                                                                         <div className="flex items-center gap-2">
                                                                             <div className="w-8 h-8 bg-white rounded border border-gray-200 flex items-center justify-center overflow-hidden">
                                                                                 {item.trait.previewUrl ? <img src={item.trait.previewUrl} className="w-full h-full object-contain"/> : <Ghost size={14}/>}
                                                                             </div>
                                                                             <div className="flex flex-col">
                                                                                 <span className="text-[10px] text-gray-400 font-bold uppercase">{item.layer.name}</span>
                                                                                 <span className="text-xs font-bold text-gray-700">{item.trait.name}</span>
                                                                             </div>
                                                                         </div>
                                                                         
                                                                         <ArrowRight size={14} className="text-gray-300"/>
                                                                         
                                                                         {/* Target Trait */}
                                                                         <div className="flex items-center gap-2">
                                                                             <div className="w-8 h-8 bg-white rounded border border-gray-200 flex items-center justify-center overflow-hidden">
                                                                                 {targetTrait?.previewUrl ? <img src={targetTrait.previewUrl} className="w-full h-full object-contain"/> : <Ghost size={14}/>}
                                                                             </div>
                                                                             <div className="flex flex-col">
                                                                                 <span className="text-[10px] text-gray-400 font-bold uppercase">Target</span>
                                                                                 <span className="text-xs font-bold text-gray-700">{item.rule.targetName || item.rule.targetId}</span>
                                                                             </div>
                                                                         </div>
                                                                     </div>
                                                                     <button onClick={() => handleDeleteRule(item.layer.id, item.trait.id, item.index)} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-all"><Trash2 size={14}/></button>
                                                             </div>
                                                         );
                                                    })}
                                                </div>
                                            )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
      )}
      
{/* Trait Rule Editor - 组件Trait Rule Editor (restored) */}
{currentEditingTrait && editingRuleIds && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-[700px] max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden">
              <div className="p-5 border-b flex justify-between items-center bg-violet-600 text-white">
                  <div>
                      <h3 className="font-bold text-lg flex items-center gap-2"><Link size={20}/> Trait Rule Editor</h3>
                      <p className="text-xs text-violet-200 mt-1">Current Trait: <span className="font-bold text-white">{currentEditingTrait.name}</span></p>
                  </div>
                  <button onClick={()=>setEditingRuleIds(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={20}/></button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50">
                  {/* Existing Rules */}
                  <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                      <h4 className="text-xs font-bold text-gray-400 uppercase mb-4 flex items-center gap-2"><CheckSquare size={14}/> Active Rules</h4>
                      {currentEditingTrait.rules.length === 0 ? (
                          <div className="text-sm text-gray-400 italic text-center py-4 bg-gray-50 rounded-lg border border-dashed border-gray-200">No rules yet</div>
                      ) : (
                          <div className="space-y-2">
                              {currentEditingTrait.rules.map((r, i) => {
                                  const targetTrait = layers.flatMap(l => l.traits).find(t => t.id === r.targetId);
                                  return (
                                      <div key={i} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-200">
                                          <div className="flex items-center gap-3 text-sm">
                                              <span className={`font-bold px-2 py-0.5 rounded text-xs ${r.type==='force'?'bg-green-100 text-green-700':r.type==='exclude'?'bg-red-100 text-red-700':'bg-gray-200 text-gray-600'}`}>
                                                  {r.type === 'force' ? 'Must pair with' : r.type === 'exclude' ? 'Exclude' : 'Hide layer'}
                                              </span> 
                                              <span className="text-gray-400">&rarr;</span> 
                                              <div className="w-6 h-6 bg-white rounded border border-gray-200 flex items-center justify-center overflow-hidden">
                                                  {targetTrait?.previewUrl ? <img src={targetTrait.previewUrl} className="w-full h-full object-contain"/> : <Ghost size={12}/>}
                                              </div>
                                              <span className="font-medium text-gray-700">{r.targetName}</span>
                                          </div>
                                          <button onClick={() => handleDeleteRule(editingRuleIds.layerId, currentEditingTrait.id, i)} className="text-gray-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded transition-colors"><Trash2 size={14}/></button>
                                      </div>
                                  );
                              })}
                          </div>
                      )}
                  </div>

                  {/* Add New Rule */}
                  <div>
                      <h4 className="text-xs font-bold text-gray-400 uppercase mb-4 flex items-center gap-2"><Plus size={14}/> Add New Rule</h4>
                      <div className="space-y-4">
                        {layers.filter(l => l.id !== editingRuleIds.layerId).map(l => (
                            <div key={l.id} className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm">
                                <div className="flex justify-between items-center mb-3">
                                    <span className="text-sm font-bold text-gray-700 flex items-center gap-2"><Layers size={14} className="text-gray-400"/> {l.name}</span>
                                    <button onClick={() => handleAddRule(editingRuleIds.layerId, currentEditingTrait.id, {type: 'hideLayer', targetId: l.id, targetName: l.name})} className="text-[10px] bg-gray-100 px-3 py-1.5 rounded-full hover:bg-gray-200 border border-gray-200 text-gray-600 font-bold transition-colors flex items-center gap-1"><EyeOff size={10}/> Hide this layer</button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {l.traits.map(t => {
                                        const isForced = currentEditingTrait.rules.some(r => r.targetId === t.id && r.type === 'force');
                                        const isExcluded = currentEditingTrait.rules.some(r => r.targetId === t.id && r.type === 'exclude');

                                        return (
                                            <div key={t.id} className="group relative border border-gray-100 bg-gray-50 p-2 rounded-lg cursor-pointer hover:border-violet-300 hover:bg-violet-50 transition-all flex flex-col items-center gap-1 min-w-[60px] overflow-hidden">
                                                <div className="w-10 h-10 bg-white rounded border border-gray-100 flex items-center justify-center overflow-hidden">
                                                    {t.previewUrl ? <img src={t.previewUrl} className="w-full h-full object-contain"/> : <Ghost size={14}/>}
                                                </div>
                                                <div className="text-[10px] font-medium text-gray-600 text-center truncate w-full">{t.name}</div>
                                                
                                                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 backdrop-blur-[1px]">
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const rules = [...currentEditingTrait.rules];
                                                            const idx = rules.findIndex(r => r.targetId === t.id);
                                                            if(idx !== -1) rules.splice(idx, 1); 
                                                            
                                                            if(!isForced) { 
                                                                rules.push({type: 'force', targetId: t.id, targetName: t.name});
                                                            }

                                                            const l = layers.find(x => x.id === editingRuleIds.layerId);
                                                            if (l) updateLayerTraits(editingRuleIds.layerId, l.traits.map(tr => tr.id === currentEditingTrait.id ? {...tr, rules} : tr));
                                                        }}
                                                        className={`px-2 py-0.5 rounded text-[10px] font-bold w-[90%] shadow-sm transform transition-all ${
                                                            isForced 
                                                                ? 'bg-green-600 text-white scale-105' 
                                                                : 'bg-green-500 text-white hover:bg-green-600 hover:scale-105 opacity-90'
                                                        }`}
                                                    >
                                                        {isForced ? 'Forced' : 'Force'}
                                                    </button>
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const rules = [...currentEditingTrait.rules];
                                                            const idx = rules.findIndex(r => r.targetId === t.id);
                                                            if(idx !== -1) rules.splice(idx, 1);
                                                            
                                                            if(!isExcluded) {
                                                                rules.push({type: 'exclude', targetId: t.id, targetName: t.name});
                                                            }

                                                            const l = layers.find(x => x.id === editingRuleIds.layerId);
                                                            if (l) updateLayerTraits(editingRuleIds.layerId, l.traits.map(tr => tr.id === currentEditingTrait.id ? {...tr, rules} : tr));
                                                        }}
                                                        className={`px-2 py-0.5 rounded text-[10px] font-bold w-[90%] shadow-sm transform transition-all ${
                                                            isExcluded 
                                                                ? 'bg-red-600 text-white scale-105' 
                                                                : 'bg-red-500 text-white hover:bg-red-600 hover:scale-105 opacity-90'
                                                        }`}
                                                    >
                                                        {isExcluded ? 'Excluded' : 'Exclude'}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                      </div>
                  </div>
              </div>
          </div>
        </div>
      )}
      {/* Sidebar Area */}
      {renderSidebar()}

      {/* Main Area */}
      <div className="flex-1 flex flex-col bg-gray-50 relative h-full">
        {activeTab === 'editor' && renderEditorWorkspace()}
        {activeTab === 'preview' && (
             <div className="flex flex-col h-full bg-gray-50">
                {selectedNFT ? (
                    /* --- Detail View (Detail View) --- */
                    <div className="h-full flex flex-col p-8 bg-white overflow-y-auto animate-in fade-in slide-in-from-right-4">
                        <button onClick={() => setSelectedNFT(null)} className="mb-6 text-xs font-bold text-gray-500 flex items-center gap-1 hover:text-gray-800 transition-colors w-fit"><ArrowRight size={14} className="rotate-180"/> Back to list</button>
                        <div className="flex gap-10 items-start">
                             <div className="w-[400px] shrink-0 sticky top-4">
                                 <div className="aspect-square rounded-2xl border-4 border-white shadow-2xl overflow-hidden bg-gray-100 relative mb-6">
                                     {renderLayerImageCSS(selectedNFT.traits, previewHiddenTraits)}
                                 </div>
                             </div>
                             <div className="flex-1">
                                 <div className="flex items-center justify-between mb-2">
                                     <h2 className="text-3xl font-black text-gray-800">{selectedNFT.name}</h2>
                                     {(() => {
                                         const { label, color } = getRarityLabel(selectedNFT.rarityScore || 1);
                                         return <span className={`${color} px-3 py-1 rounded-full text-xs font-bold`}>Rarity: {label} ({selectedNFT.rarityScore?.toFixed(1)})</span>
                                     })()}
                                 </div>
                                 <div className="text-xs font-mono text-gray-400 mb-8 bg-gray-50 p-3 rounded-lg border border-gray-100 break-all">{selectedNFT.dna}</div>
                                 
                                 {/* Trait list with probability and score */}
                                 <div className="grid grid-cols-2 gap-4">
                                     {selectedNFT.traits.map(t => {
                                         // 计算该组件的Probability和Score
                                         const layer = layers.find(l => l.id === t.layerId);
                                         const trait = layer?.traits.find(tr => tr.id === t.traitId);
                                         const prob = trait?.probability || 0;
                                         const percentage = (prob * 100).toFixed(1) + '%';
                                         const score = (-Math.log(prob || 0.0001)).toFixed(2);

                                         return (
                                             <div key={t.traitId} onClick={() => setPreviewHiddenTraits(p => { const n = new Set(p); if(n.has(t.traitId)) n.delete(t.traitId); else n.add(t.traitId); return n; })} className={`p-4 rounded-xl border cursor-pointer select-none transition-all duration-200 group ${previewHiddenTraits.has(t.traitId) ? 'opacity-50 bg-gray-100 border-gray-200' : 'bg-white border-gray-200 hover:border-violet-300 hover:shadow-md'}`}>
                                                 <div className="text-[10px] text-gray-400 uppercase font-bold flex justify-between mb-1">
                                                     {t.layerName} 
                                                     {previewHiddenTraits.has(t.traitId) ? <EyeOff size={14} className="text-gray-400"/> : <Eye size={14} className="text-gray-200 group-hover:text-violet-400"/>}
                                                 </div>
                                                 <div className="font-bold text-gray-800 truncate" title={t.value}>{t.value}</div>
                                                 
                                                 {/* [new功能] Show probability percentage and rarity score */}
                                                 <div className="flex gap-2 mt-2 pt-2 border-t border-gray-50">
                                                     <div className="flex flex-col">
                                                         <span className="text-[9px] text-gray-400 font-medium">Probability</span>
                                                         <span className="text-[10px] text-gray-600 font-mono">{percentage}</span>
                                                     </div>
                                                     <div className="flex flex-col border-l border-gray-100 pl-2">
                                                         <span className="text-[9px] text-gray-400 font-medium">Score</span>
                                                         <span className="text-[10px] text-violet-600 font-mono font-bold">+{score}</span>
                                                     </div>
                                                 </div>
                                             </div>
                                         );
                                     })}
                                 </div>
                             </div>
                        </div>
                    </div>
                ) : (
                    /* --- List View (List View) --- */
                    <>
                    <div className="p-5 border-b border-gray-200 bg-white/80 backdrop-blur-md flex justify-between items-center shadow-sm z-10 sticky top-0">
                        <div className="flex items-center gap-3">
                            <span className="font-black text-lg text-gray-800">Generated Preview</span>
                            <span className="text-xs bg-gray-100 px-2.5 py-1 rounded-full text-gray-500 font-bold border border-gray-200">{filteredCollection.length} results</span>
                        </div>
                        {generatedCollection.length > 0 && !isGenerating && (
                            <div className="flex gap-3">
                                <button onClick={() => setSortMode(s => s === 'id' ? 'rarityDesc' : s === 'rarityDesc' ? 'rarityAsc' : 'id')} className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 flex items-center gap-2 hover:bg-gray-50 transition-colors bg-white shadow-sm">
                                    {sortMode === 'id' ? 'Default Sort' : sortMode === 'rarityDesc' ? <span className="flex items-center gap-1">Rarity <ArrowDown01 size={12}/></span> : <span className="flex items-center gap-1">Rarity <ArrowUp10 size={12}/></span>}
                                </button>
                                
                                {/* [new] 导出 DNA 数据按钮 */}
                                <button onClick={exportDNAData} className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 flex items-center gap-2 hover:bg-gray-50 transition-colors bg-white shadow-sm" title="Export generated DNA data as JSON for backup or later restore.">
                                    <FileJson size={14}/> Export DNA Data
                                </button>

                                <div className="flex items-center rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
                                   <button onClick={exportZip} className="px-4 py-2 bg-white text-gray-700 text-xs font-bold hover:bg-gray-50 flex items-center gap-2 border-r border-gray-200 transition-colors"><Download size={14}/> Export Now</button>
                                   <div className="px-2 bg-gray-50 flex items-center">
                                       <select value={exportMode} onChange={e => setExportMode(e.target.value)} className="text-xs bg-transparent outline-none cursor-pointer font-bold text-gray-500 hover:text-violet-600 py-1">
                                            <option value="all">All Assets (auto batches)</option>
                                            <option value="metadata">Metadata Only (JSON)</option>
                                            {Array.from({ length: Math.ceil(generatedCollection.length / BATCH_SIZE) }).map((_, i) => {
                                                const start = i * BATCH_SIZE + 1;
                                                const end = Math.min((i + 1) * BATCH_SIZE, generatedCollection.length);
                                                return <option key={i} value={`images_${i}`}>Images Batch {i + 1} ({start} - {end})</option>;
                                            })}
                                       </select>
                                   </div>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-6 bg-gray-100/50">
                        {isGenerating ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-4 min-h-[300px]">
                                <div className="relative">
                                    <div className="w-16 h-16 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin"></div>
                                </div>
                                <p className="text-sm font-bold text-gray-500 animate-pulse">Generating {config.totalSupply} NFTs, please wait...</p>
                            </div>
                        ) : generatedCollection.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-300 min-h-[300px]">
                                <Ghost size={64} className="mb-4 opacity-50"/>
                                <p className="text-sm font-bold">No data yet. Click Generate on the left.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 content-start pb-10">
                                {filteredCollection.map(nft => {
                                    const { label, color } = getRarityLabel(nft.rarityScore || 1);
                                    return (
                                        <div key={nft.id} onClick={() => setSelectedNFT(nft)} className={`aspect-square bg-white rounded-xl overflow-hidden cursor-pointer relative group transition-all duration-300 shadow-sm hover:shadow-xl hover:-translate-y-1 ${selectedNFT?.id === nft.id ? 'ring-2 ring-violet-500' : ''}`}>
                                            <div className="w-full h-full relative">{renderLayerImageCSS(nft.traits)}</div>
                                            
                                            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex justify-between items-end">
                                                <span className="text-white text-xs font-bold">{nft.name}</span>
                                                <span className={`${color} px-1.5 py-0.5 rounded text-[10px] font-bold backdrop-blur-sm`}>{label}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    </>
                )}
             </div>
        )}
      </div>
    </div>
  );
};

type SitePage = 'home' | 'generator' | 'guide' | 'tutorials' | 'legal';

const AdPlaceholder = ({ label, caption, className = '' }: { label: string; caption?: string; className?: string }) => (
  <div className={`border border-gray-800 rounded-xl bg-[repeating-linear-gradient(45deg,#111827,#111827_10px,#1f2937_10px,#1f2937_20px)] flex flex-col items-center justify-center text-center p-2 ${className}`}>
    <span className="mb-1 font-mono text-[10px] uppercase tracking-[0.22em] text-gray-500">{label}</span>
    {caption && <div className="text-xs italic text-gray-600">{caption}</div>}
  </div>
);

interface TutorialTopic {
  title: string;
  category: string;
  excerpt: string;
  audience: string;
  outcome: string;
  example: string;
  commonMistake: string;
  proTip: string;
  screenshotTitle: string;
  screenshotSteps: string[];
}

const tutorialTopics: TutorialTopic[] = [
  {
    title: 'How to Design NFT Layered Artwork from Scratch',
    category: 'Artwork Setup',
    excerpt: 'Plan clean layer folders, trait names, canvas size, and visual rules before you generate a full NFT collection.',
    audience: 'artists, illustrators, toy designers, and small studios starting with a blank canvas',
    outcome: 'a clean layer system that imports smoothly, mixes reliably, and creates metadata collectors can understand',
    example: 'a character collection with Background, Body, Outfit, Eyes, Mouth, Headwear, and Accessories folders',
    commonMistake: 'cropping every trait to its visible pixels, which makes hats, eyes, props, and effects shift out of alignment',
    proTip: 'build five finished sample characters first, then break them into layers after the style feels consistent',
    screenshotTitle: 'Layer folder setup',
    screenshotSteps: ['Background', 'Body', 'Outfit', 'Eyes', 'Mouth', 'Accessories'],
  },
  {
    title: 'NFT Rarity Setup Best Practices',
    category: 'Rarity',
    excerpt: 'Set trait odds that feel collectible, fair, and easy to review without turning your art direction into spreadsheet chaos.',
    audience: 'creators who want rarity to support the artwork instead of making the collection feel random',
    outcome: 'a rarity plan with strong common pieces, meaningful rare traits, and fewer awkward over-stacked outputs',
    example: 'optional accessories that appear less often than base traits, with ultra-rare accents reserved for premium looks',
    commonMistake: 'making every exciting trait extremely rare and leaving the common outputs looking plain or unfinished',
    proTip: 'generate small preview batches and judge the collection by eye before trusting the numbers',
    screenshotTitle: 'Rarity planning view',
    screenshotSteps: ['Base traits', 'Empty traits', 'Rare accents', 'Preview', 'Counts', 'Adjust'],
  },
  {
    title: 'ERC-721 vs ERC-1155 Metadata: A Plain-English Comparison',
    category: 'Metadata',
    excerpt: 'Understand when to use unique NFT metadata, edition-style metadata, and how each format affects marketplace display.',
    audience: 'artists and project owners deciding how their collection should be represented before minting or upload',
    outcome: 'a practical understanding of token IDs, image links, attributes, editions, and collection structure',
    example: 'a 10,000 item PFP collection using one metadata file per token versus an editioned poster drop',
    commonMistake: 'choosing a contract format before deciding whether every item is unique or part of an edition',
    proTip: 'keep metadata names and attributes clean first; contract decisions become easier when the files are organized',
    screenshotTitle: 'Metadata export comparison',
    screenshotSteps: ['Name', 'Image URI', 'Attributes', 'Token ID', 'Edition', 'Upload'],
  },
  {
    title: 'How Independent Artists Can Launch a 10K Project with GenMatrix',
    category: 'Launch Plan',
    excerpt: 'A realistic production plan for solo creators moving from artwork folders to a complete 10K NFT collection.',
    audience: 'independent artists who need a practical collection workflow without a large production team',
    outcome: 'a repeatable plan for concept design, layer testing, rarity review, export, backup, and launch preparation',
    example: 'a solo artist testing 100 previews, then 1,000 previews, before exporting the final 10,000 item set',
    commonMistake: 'trying to generate the full supply before testing whether the layers, names, and rarity rules work together',
    proTip: 'treat the first week as a prototype sprint and only scale up after the small batch looks strong',
    screenshotTitle: '10K project checklist',
    screenshotSteps: ['Concept', 'Layers', 'Rarity', 'Preview', 'Export', 'Launch'],
  },
  {
    title: 'How to Prepare 3D Renders for an NFT Collection Generator',
    category: '3D Workflow',
    excerpt: 'Turn 3D characters, props, material variants, and render passes into clean assets for browser-based collection generation.',
    audience: '3D artists using Blender, Cinema 4D, Maya, or similar tools to create collectible renders',
    outcome: 'consistent transparent render layers that line up correctly and stay readable at marketplace thumbnail size',
    example: 'a toy character with separate body material, face plate, outfit, prop, background, and effect passes',
    commonMistake: 'changing camera position, lighting, or canvas size between renders and making layers impossible to align',
    proTip: 'lock the camera and lighting before exporting variations, then test a small batch at thumbnail size',
    screenshotTitle: '3D render layer plan',
    screenshotSteps: ['Camera lock', 'Materials', 'Props', 'Alpha PNG', 'Preview', 'Export'],
  },
  {
    title: 'NFT Metadata Checklist Before You Mint or Upload',
    category: 'Metadata QA',
    excerpt: 'Catch naming, image link, attribute, supply, and backup issues before your collection goes public.',
    audience: 'creators preparing final files for IPFS, Arweave, marketplace upload, or smart contract deployment',
    outcome: 'metadata that is easier to upload, easier to inspect, and less likely to create launch-day surprises',
    example: 'checking that token 0421 has the correct image, clean attributes, and the same naming format as the rest',
    commonMistake: 'uploading metadata with local image paths or inconsistent trait categories that marketplaces cannot group well',
    proTip: 'open 20 random JSON files manually and compare them with the matching images before the final upload',
    screenshotTitle: 'Metadata QA checklist',
    screenshotSteps: ['Names', 'Images', 'Traits', 'Links', 'Supply', 'Backup'],
  },
  {
    title: 'How to Avoid Bad Trait Combinations in Generative NFT Art',
    category: 'Rules',
    excerpt: 'Use clean visual rules to prevent awkward overlaps, hidden faces, broken props, and combinations that weaken the collection.',
    audience: 'artists who want random generation to stay surprising without producing broken-looking NFTs',
    outcome: 'a rule system that protects visual quality while still leaving enough room for interesting variation',
    example: 'a full-face mask hiding the Mouth layer, or a large crown excluding tall hair',
    commonMistake: 'using rules to fix fragile artwork instead of adjusting traits so they work with more combinations',
    proTip: 'write down why each rule exists so future edits do not accidentally break the art direction',
    screenshotTitle: 'Trait rule examples',
    screenshotSteps: ['Find issue', 'Add rule', 'Hide layer', 'Preview', 'Adjust', 'Approve'],
  },
  {
    title: 'How to Organize NFT Collection Files Before Launch',
    category: 'Production',
    excerpt: 'Create a simple folder system for source art, layers, test exports, final images, metadata, backups, and launch assets.',
    audience: 'solo creators and small teams who need fewer file mistakes during production and launch',
    outcome: 'a project folder that separates drafts from final files and keeps exports easy to verify',
    example: 'folders for Source, Layers, Test Exports, Final Images, Metadata, Project Config, Marketing, and Backups',
    commonMistake: 'mixing test exports with final launch files and later uploading the wrong batch by accident',
    proTip: 'number your folders in production order so collaborators can understand the project without a long explanation',
    screenshotTitle: 'Project folder structure',
    screenshotSteps: ['Source', 'Layers', 'Tests', 'Finals', 'Metadata', 'Backups'],
  },
  {
    title: 'How to Make Common NFTs Look Good, Not Like Filler',
    category: 'Art Direction',
    excerpt: 'Design common outputs with enough polish and personality so the whole collection feels worth collecting.',
    audience: 'creators who want the full collection to look intentional, not only the rarest one percent',
    outcome: 'common NFTs that still feel clean, collectible, and representative of the project identity',
    example: 'well-designed base outfits, balanced backgrounds, and mid-tier traits that appear often enough to add variety',
    commonMistake: 'putting all visual interest into ultra-rare traits and leaving most generated pieces looking unfinished',
    proTip: 'review a batch of common-looking outputs without rare effects and ask if you would still share them publicly',
    screenshotTitle: 'Common output review',
    screenshotSteps: ['Base art', 'Color', 'Silhouette', 'Preview', 'Compare', 'Approve'],
  },
  {
    title: 'How to Export Marketplace-Ready NFT Images and Metadata',
    category: 'Export',
    excerpt: 'Prepare final images, JSON metadata, batches, names, backups, and upload checks for a smoother NFT launch.',
    audience: 'artists and teams getting ready to move from generation to storage, marketplace setup, or contract work',
    outcome: 'a clean export package with images, JSON metadata, DNA data, project settings, and backup files',
    example: 'a 5,000 item collection exported in smaller ZIP batches with matching image and metadata numbers',
    commonMistake: 'exporting one huge folder and discovering missing files, wrong names, or broken image links too late',
    proTip: 'review image and metadata pairs together before uploading anything to permanent storage',
    screenshotTitle: 'Export settings',
    screenshotSteps: ['Supply', 'Format', 'Images', 'JSON', 'ZIP', 'Review'],
  },
  {
    title: 'How to Review an NFT Collection Before Publishing',
    category: 'Quality Review',
    excerpt: 'A simple review process for checking thumbnails, duplicates, rarity spread, broken combinations, and final export quality.',
    audience: 'creators who want a calmer review process before announcing a public drop',
    outcome: 'a collection that has been checked visually, statistically, and structurally before upload',
    example: 'reviewing 300 previews, filtering rarity tiers, checking duplicate-looking outputs, and testing export files',
    commonMistake: 'only checking the rarest outputs and missing problems that appear across common items',
    proTip: 'review quickly first for obvious issues, then slowly for metadata and trait consistency',
    screenshotTitle: 'Pre-launch review board',
    screenshotSteps: ['Thumbnails', 'Rarity', 'Rules', 'Duplicates', 'Metadata', 'Final pass'],
  },
  {
    title: 'How Small Teams Can Build a Faster NFT Production Workflow',
    category: 'Team Workflow',
    excerpt: 'A practical production workflow for small creative teams that need shared naming, review habits, and export discipline.',
    audience: 'small studios, brand teams, and Web3 communities coordinating art, review, and launch tasks',
    outcome: 'a shared process that keeps artwork decisions, rarity changes, exports, and backups easy to track',
    example: 'one artist owns layers, one reviewer checks previews, and one operator handles final exports and metadata upload',
    commonMistake: 'letting everyone rename files, change weights, and export builds without a shared checklist',
    proTip: 'assign one final-export owner so the launch package stays consistent and easy to audit',
    screenshotTitle: 'Team handoff workflow',
    screenshotSteps: ['Create', 'Name', 'Import', 'Review', 'Export', 'Handoff'],
  },
];

const buildTutorialParagraphs = (topic: TutorialTopic): string[] => [
  `${topic.title} is written for ${topic.audience}. The goal is simple: help you move from an idea to a cleaner, more reliable NFT collection without needing a large technical team. GenMatrix is useful because it keeps the generation process in the browser while still giving you practical controls for layers, rarity, previews, rules, and export. Before you start, think about the final collector experience. A collector will not see your messy folders, test files, or production notes. They will see the final image, the trait names, the metadata, and the overall quality of the collection. This tutorial focuses on ${topic.outcome}.`,
  `Begin with a small plan instead of a full production run. Write down the collection theme, the target supply, the main layer categories, and the kind of results you want to see. A useful example is ${topic.example}. This gives you a concrete structure to test. If the first small batch does not look right, do not continue into a full export. Fix the layer names, adjust the visual order, rebalance the odds, or simplify the idea. A small test saves far more time than repairing thousands of generated files after the fact.`,
  `Keep the language in your files clear and collector-friendly. Layer names and trait names often become public metadata, so they should read like product labels, not internal file notes. Instead of names like final_v3_blue_asset.png, use names that a collector can understand. Good naming also helps your team review the project faster. When names are clean, it is easier to spot missing files, duplicate concepts, or traits that do not belong in the collection. Clear names are a small habit that improves the entire launch process.`,
  `The most common mistake in this area is ${topic.commonMistake}. This usually happens when creators rush from artwork to export without a review stage. The fix is to create a quick test loop. Import a small set of layers, generate a preview batch, review the results at thumbnail size, then make changes. Repeat this loop until the collection feels stable. Thumbnail review matters because most collectors first see NFTs in a grid, not as full-resolution files. If the design is readable in a grid, it will usually feel stronger on marketplaces and social posts.`,
  `Use rules and rarity settings as art direction tools, not just technical settings. Rarity controls decide how often traits appear, but they also affect how crowded or clean the final images feel. Rules prevent combinations that look wrong. If a large hat covers the eyes, block that pair. If a mask replaces the mouth, hide the mouth layer. If an accessory only works with one body type, force the match or redraw the accessory so it works more broadly. The best collections use rules to protect quality while still allowing surprise.`,
  `A good review process has three passes. First, scan quickly for obvious visual problems such as broken alignment, harsh color clashes, or missing layers. Second, review the rarity spread and make sure common outputs still look good. Third, open final image and metadata pairs together. Check that the visible traits match the JSON attributes, that the name format is consistent, and that the description is ready for public display. This process may sound slow, but it is much faster than fixing a public launch after collectors notice an issue.`,
  `For teams working toward a marketplace upload or contract deployment, export discipline matters. Keep test exports separate from final exports. Save project settings, DNA data, image batches, and metadata batches together. Back up the final package before uploading it anywhere. If you later need to verify a token, update image links, or regenerate a batch, those files become essential. A clean export folder gives you confidence and makes it easier for developers, collaborators, or marketplace support to understand the project.`,
  `A practical tip: ${topic.proTip}. This is the kind of small decision that improves the entire production workflow. GenMatrix can generate the combinations, but it cannot replace judgment. Your role is to decide what looks right, what should be rare, what should never appear together, and what story the collection should tell. The stronger your decisions are before export, the more professional the final collection will feel.`,
  `When you are ready, generate a larger test batch and review it as if you were a collector seeing the project for the first time. Ask simple questions: Is the theme clear? Do common pieces still look good? Are rare pieces exciting without looking messy? Is the metadata easy to read? Are the files organized well enough to upload? If the answer is yes, you are ready to move toward the final export. If not, adjust the layers, rules, and weights before scaling up. The best NFT production workflow is not about rushing. It is about making each step clear enough that the final launch feels calm, polished, and easy to trust.`,
];

const TutorialScreenshot = ({ topic }: { topic: TutorialTopic }) => (
  <figure className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-950 shadow-xl">
    <div className="border-b border-gray-800 bg-gray-900 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <figcaption className="text-sm font-bold text-gray-200">{topic.screenshotTitle}</figcaption>
        <span className="rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-200">Screenshot</span>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
      {topic.screenshotSteps.map((step, index) => (
        <div key={step} className="rounded-xl border border-gray-800 bg-gray-900 p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-400" />
            <span className="text-[10px] font-bold text-gray-600">0{index + 1}</span>
          </div>
          <div className="mb-2 h-12 rounded-lg bg-gradient-to-br from-indigo-500/30 via-slate-700 to-pink-500/20" />
          <p className="text-xs font-semibold text-gray-300">{step}</p>
        </div>
      ))}
    </div>
  </figure>
);

const GenMatrixShell = () => {
  const [sitePage, setSitePage] = useState<SitePage>('home');
  const navItems: { id: SitePage; label: string }[] = [
    { id: 'home', label: 'Home' },
    { id: 'generator', label: 'Generator' },
    { id: 'guide', label: 'How It Works' },
    { id: 'tutorials', label: 'Tutorials' },
    { id: 'legal', label: 'Privacy & Terms' },
  ];

  const launchGenerator = () => setSitePage('generator');

  return (
    <div className="min-h-screen bg-[#0B0F19] text-gray-100 selection:bg-indigo-500 selection:text-white">
      <header className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/70 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button onClick={() => setSitePage('home')} className="flex items-center gap-3">
            <span className="rounded-xl bg-indigo-600 p-2.5 text-white shadow-[0_0_30px_rgba(99,102,241,0.22)]">
              <Layers size={24} />
            </span>
            <span className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-200 to-indigo-300">
              GenMatrix
            </span>
          </button>

          <nav className="hidden items-center gap-1 rounded-xl border border-gray-800 bg-gray-900 p-1.5 lg:flex">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setSitePage(item.id)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                  sitePage === item.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <button
            onClick={launchGenerator}
            className="hidden items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:from-indigo-500 hover:to-violet-500 lg:flex"
          >
            <span>Open Generator</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </header>

      {sitePage !== 'generator' && (
        <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
          <AdPlaceholder label="Sponsored Space" caption="Partner placement" className="h-24" />
        </div>
      )}

      {sitePage === 'home' && (
        <main>
          <section className="relative overflow-hidden px-4 pt-16 pb-12 text-center sm:px-6 lg:px-8 lg:pt-24 lg:pb-20">
            <div className="pointer-events-none absolute left-1/2 top-1/4 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/10 blur-[130px]" />
            <div className="relative z-10 mx-auto max-w-7xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-800/70 bg-indigo-950/60 px-4 py-1.5">
                <span className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wide text-indigo-300">Free NFT Collection Builder</span>
              </div>
              <h1 className="mx-auto mb-6 max-w-4xl text-4xl font-black tracking-tight sm:text-6xl">
                Create Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">NFT Collection</span> from Artwork Layers
              </h1>
              <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-gray-400">
                Upload your layers, set rarity, preview the full collection, and export images with ready-to-upload metadata. GenMatrix runs in your browser, so your artwork stays on your device.
              </p>
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <button onClick={launchGenerator} className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-8 py-4 font-black text-gray-950 shadow-xl transition-all hover:bg-gray-100 sm:w-auto">
                  <Cpu size={20} className="text-indigo-600" />
                  <span>Start Creating</span>
                </button>
                <button onClick={() => setSitePage('guide')} className="w-full rounded-xl border border-gray-800 bg-gray-900 px-8 py-4 font-bold text-gray-300 transition-all hover:bg-gray-800 sm:w-auto">
                  See How It Works
                </button>
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-4">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-800/70 bg-indigo-950/60 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-indigo-300">
                  <ImageIcon size={14} />
                  Product Walkthrough
                </div>
                <h2 className="mb-4 text-3xl font-black tracking-tight text-white sm:text-4xl">How GenMatrix Works</h2>
                <p className="mb-6 leading-relaxed text-gray-400">
                  Add your artwork layers, set trait odds, create rules to avoid visual conflicts, generate the collection, and download images with JSON metadata for NFT marketplaces.
                </p>
                <button onClick={launchGenerator} className="inline-flex items-center gap-2 rounded-xl border border-gray-700 bg-gray-900 px-5 py-3 text-sm font-bold text-gray-200 transition-all hover:bg-gray-800">
                  <Rocket size={16} className="text-indigo-300" />
                  Launch Generator
                </button>
              </div>
              <div className="lg:col-span-8">
                <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-950 shadow-2xl shadow-indigo-950/20">
                  <video
                    className="aspect-video w-full bg-gray-950 object-cover"
                    src={`${import.meta.env.BASE_URL}genmatrix-how-it-works.mp4`}
                    poster={`${import.meta.env.BASE_URL}genmatrix-how-it-works-poster.png`}
                    aria-label="How GenMatrix Works product walkthrough video"
                    autoPlay
                    muted
                    loop
                    playsInline
                    controls
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 pb-16 sm:px-6 md:grid-cols-3 lg:px-8">
            {[
              { icon: SlidersHorizontal, color: 'text-indigo-400', title: 'Rarity Control', body: 'Set clear odds for common, rare, and ultra-rare traits without managing formulas in a spreadsheet.' },
              { icon: Sparkles, color: 'text-purple-400', title: 'Clean Trait Rules', body: 'Keep combinations looking right by blocking overlaps between hair, hats, masks, props, and accessories.' },
              { icon: Terminal, color: 'text-pink-400', title: 'Ready Metadata', body: 'Download images and JSON metadata formatted for common NFT marketplace and smart contract workflows.' },
            ].map((feature) => (
              <div key={feature.title} className="rounded-2xl border border-gray-800 bg-gray-900/45 p-6">
                <feature.icon className={`mb-4 ${feature.color}`} size={32} />
                <h3 className="mb-2 text-lg font-black">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-gray-400">{feature.body}</p>
              </div>
            ))}
          </section>

          <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-800/70 bg-indigo-950/60 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-indigo-300">
                  <Sparkles size={14} />
                  Made for Collection Launches
                </div>
                <h2 className="mb-4 text-3xl font-black tracking-tight text-white sm:text-4xl">A Faster Way to Build Art, Toy, and 3D NFT Collections</h2>
                <p className="leading-relaxed text-gray-400">
                  GenMatrix helps creators turn layered artwork, toy-style characters, 3D renders, PFP projects, and digital collectibles into organized NFT collections. Work locally in your browser, then export clean image batches, DNA records, rarity reports, and metadata.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:col-span-7 sm:grid-cols-2">
                {[
                  { title: 'Art', body: 'Build collections from illustrations, character art, digital fashion, and generative visual systems.' },
                  { title: 'Designer Toys', body: 'Mix toy-style traits, accessories, materials, props, character variants, and premium editions.' },
                  { title: '3D Collectibles', body: 'Use rendered 3D characters, object variations, avatar turns, and background sets.' },
                  { title: 'NFT Metadata', body: 'Export structured metadata for ERC-721, Solana, BSC, and marketplace upload workflows.' },
                ].map((item) => (
                  <div key={item.title} className="rounded-2xl border border-gray-800 bg-gray-900/45 p-5">
                    <h3 className="mb-2 text-base font-black text-white">{item.title}</h3>
                    <p className="text-sm leading-relaxed text-gray-400">{item.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6 lg:px-8">
            <div className="mb-6 text-center">
              <h2 className="mb-3 text-3xl font-black tracking-tight text-white">NFT Generator FAQ</h2>
              <p className="text-sm leading-relaxed text-gray-400">
                Quick answers for artists, studios, and collectors building NFT collections from layered artwork.
              </p>
            </div>
            <div className="space-y-4">
              {[
                { question: 'Is GenMatrix free to use?', answer: 'Yes. GenMatrix runs in your browser and lets you create NFT collections, set rarity, preview results, and export metadata for free.' },
                { question: 'What NFT projects can it support?', answer: 'It works well for layered art, PFP collections, designer toys, 3D collectibles, avatar sets, and marketplace-ready NFT metadata.' },
                { question: 'Does my imported artwork leave my device?', answer: 'Generation runs locally in the browser. Imported artwork stays on your device unless you choose to export, upload, or publish files elsewhere.' },
              ].map((item) => (
                <div key={item.question} className="rounded-2xl border border-gray-800 bg-gray-900/45 p-5">
                  <h3 className="mb-2 text-base font-black text-white">{item.question}</h3>
                  <p className="text-sm leading-relaxed text-gray-400">{item.answer}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-6 border-t border-gray-900 pt-12 md:flex-row md:items-end">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-800/70 bg-indigo-950/60 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-indigo-300">
                  <BookOpen size={14} />
                  Creator Tutorials
                </div>
                <h2 className="max-w-3xl text-3xl font-black tracking-tight text-white sm:text-4xl">Learn the full NFT collection workflow before you export.</h2>
                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-gray-400">
                  Read practical guides on layered artwork, rarity, metadata formats, 10K launches, 3D renders, and final file checks.
                </p>
              </div>
              <button onClick={() => setSitePage('tutorials')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-black text-gray-950 transition-all hover:bg-gray-100">
                Browse Tutorials
                <ArrowRight size={16} />
              </button>
            </div>
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
              {tutorialTopics.slice(0, 3).map((topic) => (
                <button key={topic.title} onClick={() => setSitePage('tutorials')} className="rounded-2xl border border-gray-800 bg-gray-900/45 p-5 text-left transition-all hover:border-indigo-500/50 hover:bg-gray-900">
                  <div className="mb-3 text-xs font-bold uppercase tracking-wide text-indigo-300">{topic.category}</div>
                  <h3 className="mb-3 text-lg font-black text-white">{topic.title}</h3>
                  <p className="text-sm leading-relaxed text-gray-400">{topic.excerpt}</p>
                </button>
              ))}
            </div>
          </section>

        </main>
      )}

      {sitePage === 'tutorials' && (
        <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="mb-10">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-800/70 bg-indigo-950/60 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-indigo-300">
              <BookOpen size={14} />
              Tutorials & Creator Guides
            </div>
            <h1 className="mb-4 max-w-4xl text-4xl font-black tracking-tight text-white sm:text-5xl">Build better NFT collections with clear, practical guides.</h1>
            <p className="max-w-3xl leading-relaxed text-gray-400">
              These original tutorials are written for artists, studios, and small teams who want simple English guidance on artwork layers, rarity, metadata, exports, and collection launches. Each guide includes a screenshot-style workflow panel and a full long-form article.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 pb-10 md:grid-cols-2 xl:grid-cols-3">
            {tutorialTopics.map((topic, index) => (
              <a key={topic.title} href={`#tutorial-${index + 1}`} className="rounded-2xl border border-gray-800 bg-gray-900/45 p-5 transition-all hover:border-indigo-500/50 hover:bg-gray-900">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-xs font-bold uppercase tracking-wide text-indigo-300">{topic.category}</span>
                  <span className="text-xs text-gray-500">800+ words</span>
                </div>
                <h2 className="mb-3 text-lg font-black text-white">{topic.title}</h2>
                <p className="text-sm leading-relaxed text-gray-400">{topic.excerpt}</p>
              </a>
            ))}
          </div>

          <div className="space-y-8">
            {tutorialTopics.map((topic, index) => (
              <article id={`tutorial-${index + 1}`} key={topic.title} className="scroll-mt-28 rounded-2xl border border-gray-800 bg-gray-900/35 p-5 sm:p-8">
                <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
                  <div className="lg:col-span-7">
                    <div className="mb-3 text-xs font-bold uppercase tracking-wide text-indigo-300">{topic.category}</div>
                    <h2 className="mb-4 text-3xl font-black tracking-tight text-white">{topic.title}</h2>
                    <p className="text-base leading-relaxed text-gray-400">{topic.excerpt}</p>
                  </div>
                  <div className="lg:col-span-5">
                    <TutorialScreenshot topic={topic} />
                  </div>
                </div>
                <div className="space-y-5 text-sm leading-7 text-gray-300 sm:text-base sm:leading-8">
                  {buildTutorialParagraphs(topic).map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </main>
      )}

      {sitePage === 'guide' && (
        <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="mb-10">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-800/70 bg-indigo-950/60 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-indigo-300">
              <BookOpen size={14} /> Quick Start Guide
            </div>
            <h1 className="mb-4 text-4xl font-black tracking-tight">Build Your Collection in Four Steps</h1>
            <p className="max-w-3xl text-gray-400">
              Import your artwork, set rarity, add rules, generate the collection, and download the files you need for marketplace uploads.
            </p>
          </div>

          <div className="space-y-6">
            {[
              { icon: FolderTree, title: '1. Prepare Layer Folders', body: 'Keep every asset at the same canvas size, preferably transparent PNG. Organize folders in render order such as Background, Body, Clothes, Eyes, Mouth, Headwear, and Accessories.' },
              { icon: SlidersHorizontal, title: '2. Import and Balance Traits', body: 'Bulk import folders, set layer order, adjust trait odds, add empty traits for optional accessories, and use the optimizer for cleaner rarity tiers.' },
              { icon: ShieldCheck, title: '3. Add Compatibility Rules', body: 'Use rules to keep required traits together, block combinations that do not look right, and hide layers when another asset should cover them.' },
              { icon: Rocket, title: '4. Generate and Export', body: 'Create your target supply, review rarity, filter previews, then export images, DNA data, project settings, and metadata in ZIP batches.' },
            ].map((step) => (
              <div key={step.title} className="rounded-2xl border border-gray-800 bg-gray-900/45 p-6">
                <div className="mb-4 flex items-center gap-3">
                  <span className="rounded-xl bg-indigo-600/15 p-2 text-indigo-300"><step.icon size={22} /></span>
                  <h2 className="text-xl font-black text-white">{step.title}</h2>
                </div>
                <p className="leading-relaxed text-gray-400">{step.body}</p>
              </div>
            ))}
            <AdPlaceholder label="Sponsored Space" className="h-24" />
          </div>
        </main>
      )}

      {sitePage === 'legal' && (
        <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="space-y-8 rounded-2xl border border-gray-800 bg-gray-900/35 p-8 text-sm leading-relaxed text-gray-400">
            <div>
              <h1 className="mb-2 text-2xl font-black text-white">Privacy Policy</h1>
              <p className="mb-3">
                GenMatrix is designed with creator privacy in mind. Collection generation runs locally in the browser, and imported artwork stays on the user's device unless the user exports or uploads it elsewhere.
              </p>
              <p className="mb-3">
                <strong className="text-gray-200">Cookies and Web Beacons:</strong> Placeholder advertising areas are included for layout planning. If real advertising scripts are added later, cookie notices and applicable regional consent handling should be configured before deployment.
              </p>
              <p>
                <strong className="text-gray-200">Local Storage:</strong> Project configuration and cached assets may be stored in browser local storage or IndexedDB to restore work between sessions.
              </p>
            </div>
            <hr className="border-gray-800" />
            <div>
              <h2 className="mb-2 text-xl font-black text-white">Terms of Service</h2>
              <p>
                By using this browser-based collection generator, you are responsible for the artwork, metadata, and collection assets you import or export. GenMatrix claims no ownership over user-provided art layers or generated outputs.
              </p>
            </div>
          </div>
        </main>
      )}

      {sitePage === 'generator' && (
        <main className="h-[calc(100vh-80px)] overflow-hidden bg-[#0B0F19] p-4">
          <div className="h-full overflow-hidden rounded-2xl border border-gray-800 bg-white shadow-2xl">
            <NFTGenerator />
          </div>
        </main>
      )}

      {sitePage !== 'generator' && (
        <>
          <div className="mx-auto max-w-7xl px-4 pb-8 pt-4 sm:px-6 lg:px-8">
            <AdPlaceholder label="Sponsored Space" className="h-28" />
          </div>
          <footer className="border-t border-gray-900 bg-gray-950 py-10">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 gap-6 border-b border-gray-900 pb-8 text-xs text-gray-500 md:grid-cols-2">
                <div>
                  <h4 className="mb-2 font-bold text-gray-300">About GenMatrix Project</h4>
                  <p className="max-w-sm leading-relaxed">
                    GenMatrix is a free browser tool for building NFT collections from layered art, 3D collectibles, and designer toy assets.
                  </p>
                </div>
                <div className="md:text-right">
                  <h4 className="mb-2 font-bold text-gray-300">Contact Support</h4>
                  <p>Need help with rendering, exports, or collection setup? Email: <span className="text-indigo-400">wcgwolf@gmail.com</span></p>
                  <div className="mt-3">
                    <h4 className="mb-1 font-bold text-gray-300">Sponsor</h4>
                    <p>ERC20 recharge address: <span className="break-all text-indigo-400">0x26c098cca477a6732a78fb3b7d31499bf7ab936b</span></p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center justify-between gap-2 pt-6 text-[11px] text-gray-600 sm:flex-row">
                <div>&copy; 2026 GenMatrix Tool Suite. All local execution processing rights reserved.</div>
                <div className="flex gap-4">
                  <button onClick={() => setSitePage('legal')} className="hover:text-gray-400">Privacy Policy</button>
                  <button onClick={() => setSitePage('legal')} className="hover:text-gray-400">Terms & Conditions</button>
                </div>
              </div>
            </div>
          </footer>
        </>
      )}
    </div>
  );
};

const App = () => <ErrorBoundary><GenMatrixShell /></ErrorBoundary>;
export default App;
