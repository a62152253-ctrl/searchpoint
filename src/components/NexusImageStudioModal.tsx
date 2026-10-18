import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, 
  Save, 
  RotateCw, 
  RotateCcw, 
  FlipHorizontal, 
  FlipVertical, 
  Crop, 
  Sliders, 
  Sparkles, 
  Copy, 
  Check, 
  Folder, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Minimize2, 
  CheckCircle2, 
  AlertCircle,
  Pencil,
  Undo2,
  Trash2,
  Image as ImageIcon,
  Palette,
  HardDrive,
  Bot,
  Send,
  RefreshCw,
  Wand2
} from 'lucide-react';
import { FileItem, formatBytesCompact, SystemInfo } from '../types';
import { saveFileWithFSA } from '../utils/fileSystemAccessManager';
import { nexusApi } from '../utils/nexusAuth';

interface NexusImageStudioModalProps {
  item: FileItem | null;
  onClose: () => void;
  onSaved?: (updatedItem: { path: string; size: number; mtime: string }) => void;
  onOpenInExplorer?: (path: string) => void;
}

interface FilterState {
  brightness: number; // -100 to 100 (0 = normal)
  contrast: number;   // -100 to 100 (0 = normal)
  saturation: number; // 0 to 200 (100 = normal)
  blur: number;       // 0 to 20 px
  grayscale: number;  // 0 to 100 %
  sepia: number;      // 0 to 100 %
  invert: boolean;
}

const DEFAULT_FILTERS: FilterState = {
  brightness: 0,
  contrast: 0,
  saturation: 100,
  blur: 0,
  grayscale: 0,
  sepia: 0,
  invert: false
};

const BRUSH_COLORS = [
  { name: 'Neon Green', color: '#22c55e' },
  { name: 'Electric Purple', color: '#a855f7' },
  { name: 'Cyber Cyan', color: '#06b6d4' },
  { name: 'Hot Pink', color: '#ec4899' },
  { name: 'Alert Red', color: '#ef4444' },
  { name: 'Golden Yellow', color: '#eab308' },
  { name: 'Pure White', color: '#ffffff' },
  { name: 'Obsidian Black', color: '#000000' }
];

export const NexusImageStudioModal: React.FC<NexusImageStudioModalProps> = ({
  item,
  onClose,
  onSaved,
  onOpenInExplorer
}) => {
  // Main states
  const [activeTab, setActiveTab] = useState<'FILTERS' | 'PRESETS' | 'TRANSFORM' | 'CROP' | 'BRUSH' | 'AI_COPILOT'>('FILTERS');
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [rotation, setRotation] = useState<number>(0); // 0, 90, 180, 270
  const [flipH, setFlipH] = useState<boolean>(false);
  const [flipV, setFlipV] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // AI Copilot state
  const [selectedModel, setSelectedModel] = useState<string>('qwen2.5-coder:3b');
  const [availableModels, setAvailableModels] = useState<string[]>([
    'qwen2.5-coder:3b',
    'qwen2.5:1.5b',
    'qwen2.5:0.5b',
    'llama3.2',
    'deepseek-coder'
  ]);
  const [aiPromptInput, setAiPromptInput] = useState<string>('');
  const [isAiExecuting, setIsAiExecuting] = useState<boolean>(false);
  const [lastExecutedToolBadge, setLastExecutedToolBadge] = useState<string | null>(null);
  const [aiChatHistory, setAiChatHistory] = useState<Array<{
    role: 'user' | 'assistant';
    text: string;
    executedTool?: string;
  }>>([
    {
      role: 'assistant',
      text: 'Witaj w AI Image Studio! Wydawaj polecenia po polsku, a ja wykonam precyzyjne narzędzia graficzne na Twoim obrazie.'
    }
  ]);

  // Image source state
  const [imageSrc, setImageSrc] = useState<string>('');
  const [originalDimensions, setOriginalDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Brush / Annotation state
  const [brushMode, setBrushMode] = useState<boolean>(false);
  const [brushColor, setBrushColor] = useState<string>('#22c55e');
  const [brushSize, setBrushSize] = useState<number>(4);
  const [strokes, setStrokes] = useState<Array<{ color: string; size: number; points: Array<{ x: number; y: number }> }>>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);

  // Crop tool state
  const [cropMode, setCropMode] = useState<boolean>(false);
  const [cropRatio, setCropRatio] = useState<'FREE' | '1:1' | '16:9' | '4:3' | '9:16'>('FREE');
  const [cropBox, setCropBox] = useState<{ x: number; y: number; width: number; height: number }>({ x: 10, y: 10, width: 80, height: 80 });

  // Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const annotationCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageElementRef = useRef<HTMLImageElement | null>(null);

  // Load image
  useEffect(() => {
    if (!item) return;
    const url = item.blobUrl || `/api/file/preview?path=${encodeURIComponent(item.path)}&t=${Date.now()}`;
    setImageSrc(url);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    img.onload = () => {
      imageElementRef.current = img;
      setOriginalDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
  }, [item?.path, item?.blobUrl]);

  // Fetch installed Ollama models
  useEffect(() => {
    nexusApi.get<SystemInfo>('/api/system-info')
      .then(data => {
        if (data?.installedModels && Array.isArray(data.installedModels) && data.installedModels.length > 0) {
          setAvailableModels(data.installedModels);
          if (!data.installedModels.includes(selectedModel)) {
            setSelectedModel(data.installedModels[0]);
          }
        }
      })
      .catch(() => {});
  }, []);

  // Tool Execution Engine for canvas filter and geometric adjustments
  const executeImageStudioTool = (action: string, params: any) => {
    let summary = '';
    if (action === 'adjust_filters') {
      setFilters(prev => {
        const next = { ...prev };
        if (typeof params.brightness === 'number') next.brightness = Math.max(-100, Math.min(100, params.brightness));
        if (typeof params.contrast === 'number') next.contrast = Math.max(-100, Math.min(100, params.contrast));
        if (typeof params.saturation === 'number') next.saturation = Math.max(0, Math.min(200, params.saturation));
        if (typeof params.blur === 'number') next.blur = Math.max(0, Math.min(20, params.blur));
        if (typeof params.grayscale === 'number') next.grayscale = Math.max(0, Math.min(100, params.grayscale));
        if (typeof params.sepia === 'number') next.sepia = Math.max(0, Math.min(100, params.sepia));
        if (typeof params.invert === 'boolean') next.invert = params.invert;
        return next;
      });
      summary = `adjust_filters: jasność=${params.brightness ?? 'b/z'}, kontrast=${params.contrast ?? 'b/z'}, nasycenie=${params.saturation ?? 'b/z'}`;
    } else if (action === 'apply_preset') {
      applyPreset(params.preset || 'ORIGINAL');
      summary = `apply_preset: ${params.preset}`;
    } else if (action === 'transform') {
      if (typeof params.rotation === 'number') setRotation(params.rotation % 360);
      if (typeof params.flipH === 'boolean') setFlipH(params.flipH);
      if (typeof params.flipV === 'boolean') setFlipV(params.flipV);
      summary = `transform: obrót=${params.rotation ?? 0}°, flipH=${params.flipH ?? false}`;
    } else if (action === 'reset') {
      setFilters(DEFAULT_FILTERS);
      setRotation(0);
      setFlipH(false);
      setFlipV(false);
      setStrokes([]);
      summary = `reset: przywrócono stan początkowy`;
    }
    setLastExecutedToolBadge(summary);
    setTimeout(() => setLastExecutedToolBadge(null), 3500);
    return summary;
  };

  // Deterministic local keyword & tool evaluator
  const parseAndExecuteUserCommand = (cmd: string): { action: string; params: any; explanation: string } => {
    const lower = cmd.toLowerCase();

    if (lower.includes('reset') || lower.includes('wyczyść') || lower.includes('początkow')) {
      const tool = { action: 'reset', params: {} };
      executeImageStudioTool(tool.action, tool.params);
      return { ...tool, explanation: 'Zresetowano wszystkie filtry i obroty do stanu początkowego.' };
    }

    if (lower.includes('noir') || lower.includes('czarno-biał') || lower.includes('czarno bia')) {
      const tool = { action: 'apply_preset', params: { preset: 'NOIR' } };
      executeImageStudioTool(tool.action, tool.params);
      return { ...tool, explanation: 'Zastosowano preset Noir (monochromatyczny kontrast).' };
    }
    if (lower.includes('cyberpunk') || lower.includes('neon')) {
      const tool = { action: 'apply_preset', params: { preset: 'CYBERPUNK' } };
      executeImageStudioTool(tool.action, tool.params);
      return { ...tool, explanation: 'Zastosowano preset Cyberpunk (podwyższone nasycenie, neonowa sepia).' };
    }
    if (lower.includes('vintage') || lower.includes('retro') || lower.includes('stare zdjęci')) {
      const tool = { action: 'apply_preset', params: { preset: 'VINTAGE' } };
      executeImageStudioTool(tool.action, tool.params);
      return { ...tool, explanation: 'Zastosowano preset Vintage z ciepłą sepią i klasycznym nasyceniem.' };
    }
    if (lower.includes('xray') || lower.includes('rentgen')) {
      const tool = { action: 'apply_preset', params: { preset: 'XRAY' } };
      executeImageStudioTool(tool.action, tool.params);
      return { ...tool, explanation: 'Zastosowano preset Rentgen (odwrócone kanały kolorów).' };
    }
    if (lower.includes('vivid') || lower.includes('żywe')) {
      const tool = { action: 'apply_preset', params: { preset: 'VIVID' } };
      executeImageStudioTool(tool.action, tool.params);
      return { ...tool, explanation: 'Zastosowano preset Vivid (podbite barwy i kontrast).' };
    }

    if (lower.includes('obróć') || lower.includes('obroc') || lower.includes('rotate')) {
      const degMatch = lower.match(/(?:o|o\s+)?(90|180|270)/);
      const deg = degMatch ? parseInt(degMatch[1], 10) : 90;
      const newRot = (rotation + deg) % 360;
      const tool = { action: 'transform', params: { rotation: newRot } };
      executeImageStudioTool(tool.action, tool.params);
      return { ...tool, explanation: `Obrócono obraz o ${deg}° (aktualny kąt: ${newRot}°).` };
    }

    if (lower.includes('odwróć kolor') || lower.includes('odwroc kolor') || lower.includes('negatyw')) {
      const tool = { action: 'adjust_filters', params: { invert: !filters.invert } };
      executeImageStudioTool(tool.action, tool.params);
      return { ...tool, explanation: `Przełączono negatyw (odwrócenie kolorów: ${!filters.invert ? 'włączone' : 'wyłączone'}).` };
    }

    const params: any = {};
    const bMatch = lower.match(/(?:rozjaśnij|jasnoś|zwiększ jasność|podnieś jasność|brightness)[^\d-]*(-?\d+)/);
    const darkMatch = lower.match(/(?:przyciemnij|zmniejsz jasność)[^\d-]*(\d+)/);
    if (bMatch) params.brightness = Math.min(100, Math.max(-100, parseInt(bMatch[1], 10)));
    else if (darkMatch) params.brightness = -Math.min(100, Math.abs(parseInt(darkMatch[1], 10)));

    const cMatch = lower.match(/(?:kontrast|contrast)[^\d-]*(-?\d+)/);
    if (cMatch) params.contrast = Math.min(100, Math.max(-100, parseInt(cMatch[1], 10)));

    const sMatch = lower.match(/(?:nasyceni|saturation)[^\d-]*(\d+)/);
    if (sMatch) params.saturation = Math.min(200, Math.max(0, parseInt(sMatch[1], 10)));

    const sepiaMatch = lower.match(/(?:sepia)[^\d-]*(\d+)?/);
    if (sepiaMatch) params.sepia = sepiaMatch[1] ? Math.min(100, parseInt(sepiaMatch[1], 10)) : 50;

    const blurMatch = lower.match(/(?:rozmyj|rozmyci|blur)[^\d-]*(\d+)/);
    if (blurMatch) params.blur = Math.min(20, Math.max(0, parseInt(blurMatch[1], 10)));

    if (Object.keys(params).length > 0) {
      const tool = { action: 'adjust_filters', params };
      executeImageStudioTool(tool.action, tool.params);
      return {
        ...tool,
        explanation: `Dostosowano parametry: ${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(', ')}.`
      };
    }

    const defaultEnhance = { brightness: 20, contrast: 25 };
    executeImageStudioTool('adjust_filters', defaultEnhance);
    return {
      action: 'adjust_filters',
      params: defaultEnhance,
      explanation: 'Wykonano zbalansowane podbicie parametrów (jasność +20%, kontrast +25%).'
    };
  };

  const handleSendAiPrompt = async (forcedPrompt?: string) => {
    const text = (forcedPrompt || aiPromptInput).trim();
    if (!text || isAiExecuting) return;

    const userMsg = { role: 'user' as const, text };
    setAiChatHistory(prev => [...prev, userMsg]);
    if (!forcedPrompt) setAiPromptInput('');
    setIsAiExecuting(true);

    try {
      const localExec = parseAndExecuteUserCommand(text);

      const data = await nexusApi.post<{ reply?: string }>('/api/ai/chat', {
        messages: [
          {
            role: 'system',
            content: `Jesteś asystentem obróbki grafiki w Project Nexus. Użytkownik zlecił: "${text}". Wyjaśnij krótko w 1 zdaniu efekt wizualny na zdjęciu.`
          },
          {
            role: 'user',
            content: text
          }
        ],
        model: selectedModel,
        workspacePath: item?.path ? item.path.substring(0, item.path.lastIndexOf('\\')) : undefined
      }).catch(() => null);

      const replyText = data?.reply || localExec.explanation;

      setAiChatHistory(prev => [
        ...prev,
        {
          role: 'assistant',
          text: replyText,
          executedTool: `${localExec.action}(${JSON.stringify(localExec.params)})`
        }
      ]);
    } catch (err: any) {
      setAiChatHistory(prev => [
        ...prev,
        {
          role: 'assistant',
          text: `Wykonano modyfikację narzędziem Image Studio. (Status AI: ${err.message})`,
          executedTool: 'tool_execution'
        }
      ]);
    } finally {
      setIsAiExecuting(false);
    }
  };

  // CSS Filter String
  const getFilterStyleString = useCallback(() => {
    const b = 100 + filters.brightness;
    const c = 100 + filters.contrast;
    const s = filters.saturation;
    const g = filters.grayscale;
    const sep = filters.sepia;
    const inv = filters.invert ? 100 : 0;
    const bl = filters.blur;

    return `brightness(${b}%) contrast(${c}%) saturate(${s}%) grayscale(${g}%) sepia(${sep}%) invert(${inv}%) blur(${bl}px)`;
  }, [filters]);

  // Apply Presets
  const applyPreset = (presetName: string) => {
    switch (presetName) {
      case 'ORIGINAL':
        setFilters(DEFAULT_FILTERS);
        break;
      case 'CYBERPUNK':
        setFilters({
          brightness: 10,
          contrast: 30,
          saturation: 160,
          blur: 0,
          grayscale: 0,
          sepia: 15,
          invert: false
        });
        break;
      case 'NOIR':
        setFilters({
          brightness: -5,
          contrast: 40,
          saturation: 0,
          blur: 0,
          grayscale: 100,
          sepia: 0,
          invert: false
        });
        break;
      case 'VIVID':
        setFilters({
          brightness: 5,
          contrast: 20,
          saturation: 140,
          blur: 0,
          grayscale: 0,
          sepia: 0,
          invert: false
        });
        break;
      case 'VINTAGE':
        setFilters({
          brightness: -5,
          contrast: 10,
          saturation: 85,
          blur: 0,
          grayscale: 0,
          sepia: 55,
          invert: false
        });
        break;
      case 'XRAY':
        setFilters({
          brightness: 15,
          contrast: 35,
          saturation: 100,
          blur: 0,
          grayscale: 0,
          sepia: 0,
          invert: true
        });
        break;
      case 'COOL_FROST':
        setFilters({
          brightness: 8,
          contrast: 15,
          saturation: 120,
          blur: 0,
          grayscale: 10,
          sepia: 0,
          invert: false
        });
        break;
    }
  };

  // Redraw annotations on overlay canvas
  useEffect(() => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.moveTo(stroke.points[0].x * canvas.width, stroke.points[0].y * canvas.height);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * canvas.width, stroke.points[i].y * canvas.height);
      }
      ctx.stroke();
    }
  }, [strokes]);

  // Drawing event handlers
  const handleStartDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!brushMode) return;
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    setIsDrawing(true);
    setStrokes((prev) => [
      ...prev,
      { color: brushColor, size: brushSize, points: [{ x, y }] }
    ]);
  };

  const handleDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !brushMode) return;
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const updatedLast = {
        ...last,
        points: [...last.points, { x, y }]
      };
      return [...prev.slice(0, prev.length - 1), updatedLast];
    });
  };

  const handleEndDraw = () => {
    setIsDrawing(false);
  };

  // Perform Final Render to Offscreen Canvas and Export Base64
  const renderCompositeCanvas = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = imageElementRef.current;
      if (!img) return reject(new Error('Image not loaded'));

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Cannot create 2D canvas context'));

      // 1. Dimensions considering rotation
      const isSideways = rotation === 90 || rotation === 270;
      const targetWidth = isSideways ? img.naturalHeight : img.naturalWidth;
      const targetHeight = isSideways ? img.naturalWidth : img.naturalHeight;

      canvas.width = targetWidth;
      canvas.height = targetHeight;

      // 2. Set Canvas filters
      ctx.filter = getFilterStyleString();

      // 3. Coordinate translation for rotation and flips
      ctx.save();
      ctx.translate(targetWidth / 2, targetHeight / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);

      // Draw base image centered
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      ctx.restore();

      // Reset filter for annotations
      ctx.filter = 'none';

      // 4. Draw annotations scaled to output resolution
      if (strokes.length > 0) {
        for (const stroke of strokes) {
          if (stroke.points.length < 2) continue;
          ctx.beginPath();
          ctx.strokeStyle = stroke.color;
          ctx.lineWidth = stroke.size * (targetWidth / 800);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          ctx.moveTo(stroke.points[0].x * targetWidth, stroke.points[0].y * targetHeight);
          for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x * targetWidth, stroke.points[i].y * targetHeight);
          }
          ctx.stroke();
        }
      }

      // 5. If Crop Mode is active, crop to selection
      if (cropMode) {
        const croppedCanvas = document.createElement('canvas');
        const cCtx = croppedCanvas.getContext('2d');
        if (!cCtx) return reject(new Error('Cannot create crop context'));

        const cropX = Math.round((cropBox.x / 100) * targetWidth);
        const cropY = Math.round((cropBox.y / 100) * targetHeight);
        const cropW = Math.round((cropBox.width / 100) * targetWidth);
        const cropH = Math.round((cropBox.height / 100) * targetHeight);

        croppedCanvas.width = Math.max(1, cropW);
        croppedCanvas.height = Math.max(1, cropH);

        cCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        return resolve(croppedCanvas.toDataURL('image/png', 0.95));
      }

      resolve(canvas.toDataURL('image/png', 0.95));
    });
  };

  // Save to Disk (via File System Access API or Server)
  const handleSave = async (saveAsCopy: boolean = false) => {
    if (!item || isSaving) return;

    setIsSaving(true);
    setSaveSuccessMsg(null);
    setError(null);

    try {
      const dataUrl = await renderCompositeCanvas();

      if (!saveAsCopy && (item.fileHandle || item.path.startsWith('[FSA]'))) {
        // Native Chromium File System Access API direct write
        await saveFileWithFSA(item, dataUrl, true);
        setImageSrc(dataUrl);
        setSaveSuccessMsg('Zapisano grafikę natywnie przez File System Access API!');
        if (onSaved) {
          onSaved({
            path: item.path,
            size: dataUrl.length,
            mtime: new Date().toISOString()
          });
        }
      } else {
        // Server API transactional write
        const data = await nexusApi.post<{ name: string; size: number; path: string; mtime: string }>('/api/file/save', {
          path: item.path,
          content: dataUrl,
          isBase64: true,
          createBackup: true,
          saveAsCopy
        });

        setSaveSuccessMsg(
          saveAsCopy 
            ? `Zapisano kopię obrazu: ${data.name}` 
            : `Zapisano i zastąpiono oryginał (${(data.size / 1024).toFixed(1)} KB)`
        );

        // Refresh loaded preview
        setImageSrc(`/api/file/preview?path=${encodeURIComponent(data.path)}&t=${Date.now()}`);

        if (onSaved) {
          onSaved({
            path: data.path,
            size: data.size,
            mtime: data.mtime
          });
        }
      }

      setTimeout(() => setSaveSuccessMsg(null), 3500);
    } catch (err: any) {
      setError(`Błąd eksportu: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Keyboard shortcut Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave(false);
      }
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, isSaving, filters, rotation, flipH, flipV, strokes, cropMode, cropBox]);

  const handleCopyPath = () => {
    if (!item) return;
    navigator.clipboard.writeText(item.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-2xl animate-fadeIn p-4 sm:p-6 overflow-hidden">
      <div 
        className={`bg-[#0c0c10] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
          isFullscreen 
            ? 'w-full h-full rounded-none' 
            : 'w-[96vw] max-w-7xl h-[92vh]'
        }`}
      >
        
        {/* 1. Header Toolbar */}
        <div className="p-3.5 bg-[#141418] border-b border-white/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
          
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-pink-500/15 border border-pink-500/30 flex items-center justify-center text-pink-400 shrink-0 shadow-inner">
              <Palette className="w-5 h-5" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm truncate font-mono">
                  {item.name}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-pink-500/15 border border-pink-500/30 text-pink-300 text-[10px] font-mono font-medium">
                  {originalDimensions.width > 0 ? `${originalDimensions.width} × ${originalDimensions.height} px` : 'Obraz'}
                </span>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-[#71717a] font-mono truncate">
                <span className="truncate max-w-[340px]">{item.path}</span>
                <button
                  onClick={handleCopyPath}
                  className="hover:text-pink-400 transition cursor-pointer"
                  title="Kopiuj pełną ścieżkę"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
                {onOpenInExplorer && (
                  <button
                    onClick={() => onOpenInExplorer(item.path)}
                    className="hover:text-yellow-400 transition cursor-pointer flex items-center gap-0.5"
                    title="Pokaż w eksploratorze"
                  >
                    <Folder className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Top Actions */}
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            
            {/* Zoom Controls */}
            <div className="flex items-center rounded-xl bg-[#1f1f24] border border-white/10 p-0.5 font-mono text-xs">
              <button 
                onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
                className="p-1 text-[#a1a1aa] hover:text-white transition cursor-pointer"
                title="Oddal"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 text-[11px] text-white select-none">
                {Math.round(zoom * 100)}%
              </span>
              <button 
                onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                className="p-1 text-[#a1a1aa] hover:text-white transition cursor-pointer"
                title="Przybliż"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Reset All */}
            <button
              onClick={() => {
                setFilters(DEFAULT_FILTERS);
                setRotation(0);
                setFlipH(false);
                setFlipV(false);
                setStrokes([]);
                setCropMode(false);
                setZoom(1);
              }}
              className="px-2.5 py-1.5 rounded-xl bg-[#1f1f24] hover:bg-[#2a2a32] border border-white/10 text-white text-xs font-mono transition cursor-pointer"
              title="Resetuj wszystkie edycje do oryginału"
            >
              Resetuj
            </button>

            {/* Save Copy */}
            <button
              onClick={() => handleSave(true)}
              disabled={isSaving}
              className="px-3 py-1.5 rounded-xl bg-[#1f1f24] hover:bg-[#2a2a32] border border-white/10 text-white text-xs font-mono transition cursor-pointer disabled:opacity-50"
            >
              Zapisz kopię
            </button>

            {/* Save & Replace (Ctrl+S) */}
            <button
              onClick={() => handleSave(false)}
              disabled={isSaving}
              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white text-xs font-bold font-mono transition flex items-center gap-2 shadow-lg shadow-pink-900/30 cursor-pointer disabled:opacity-50"
            >
              <Save className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
              <span>{isSaving ? 'Zapisywanie...' : 'Zapisz (Ctrl+S)'}</span>
            </button>

            {/* Fullscreen toggle */}
            <button
              onClick={() => setIsFullscreen((prev) => !prev)}
              className="p-1.5 rounded-xl bg-[#1f1f24] hover:bg-[#27272f] border border-white/10 text-[#a1a1aa] hover:text-white transition cursor-pointer"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-[#1f1f24] hover:bg-red-950/60 hover:text-red-300 border border-white/10 text-[#a1a1aa] transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

          </div>
        </div>

        {/* Feedback Alert Toast */}
        {saveSuccessMsg && (
          <div className="bg-emerald-950/80 border-b border-emerald-500/40 px-4 py-2 text-xs font-mono text-emerald-300 flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{saveSuccessMsg}</span>
              <span className="text-emerald-500/70 text-[10px]">• Kopia bezpieczeństwa w .nexus_backups/</span>
            </div>
            <button onClick={() => setSaveSuccessMsg(null)} className="text-emerald-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-950/80 border-b border-red-500/40 px-4 py-2 text-xs font-mono text-red-300 flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 2. Workspace: Studio Canvas + Sidebar Controls */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          
          {/* Main Visual Canvas Area */}
          <div className="flex-1 bg-[#070709] relative flex items-center justify-center p-6 overflow-auto custom-scrollbar select-none">
            
            {/* Visual Grid Backdrop */}
            <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]"></div>

            {/* Floating Tool Execution Toast */}
            {lastExecutedToolBadge && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-xl bg-purple-950/90 border border-purple-500/60 text-purple-200 text-xs font-mono shadow-2xl flex items-center gap-2 animate-bounce backdrop-blur-md">
                <Wand2 className="w-4 h-4 text-purple-400" />
                <span>🛠️ Wykonano: <b>{lastExecutedToolBadge}</b></span>
              </div>
            )}

            {/* Container for Image & Annotations */}
            <div 
              className="relative transition-transform duration-150 inline-block shadow-2xl rounded-lg border border-white/10 overflow-hidden"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                transformOrigin: 'center center'
              }}
            >
              {/* Base Image with Hardware Accelerated Filters */}
              {imageSrc && (
                <img
                  ref={imageElementRef}
                  src={imageSrc}
                  alt={item.name}
                  className="max-h-[68vh] max-w-full object-contain pointer-events-none block"
                  style={{
                    filter: getFilterStyleString()
                  }}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (annotationCanvasRef.current) {
                      annotationCanvasRef.current.width = img.clientWidth || img.naturalWidth;
                      annotationCanvasRef.current.height = img.clientHeight || img.naturalHeight;
                    }
                  }}
                />
              )}

              {/* Freehand Annotation Canvas Layer */}
              <canvas
                ref={annotationCanvasRef}
                onMouseDown={handleStartDraw}
                onMouseMove={handleDraw}
                onMouseUp={handleEndDraw}
                onMouseLeave={handleEndDraw}
                className={`absolute inset-0 w-full h-full ${
                  brushMode ? 'cursor-crosshair' : 'pointer-events-none'
                }`}
              />

              {/* Crop Overlay Selection Box */}
              {cropMode && (
                <div 
                  className="absolute inset-0 pointer-events-none border-2 border-dashed border-pink-400/80 bg-pink-500/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)]"
                  style={{
                    left: `${cropBox.x}%`,
                    top: `${cropBox.y}%`,
                    width: `${cropBox.width}%`,
                    height: `${cropBox.height}%`
                  }}
                >
                  <div className="absolute -top-3 left-2 px-1.5 py-0.5 rounded bg-pink-500 text-[10px] font-mono text-white font-bold">
                    Kadr {cropRatio}
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Right Control Panel */}
          <div className="w-full md:w-84 bg-[#111115] border-t md:border-t-0 md:border-l border-white/10 flex flex-col shrink-0 font-sans text-xs">
            
            {/* Tab navigation */}
            <div className="flex items-center p-2 border-b border-white/8 bg-[#16161b] gap-1 font-mono text-[11px]">
              <button
                onClick={() => { setActiveTab('FILTERS'); setBrushMode(false); setCropMode(false); }}
                className={`flex-1 py-1.5 rounded-lg transition font-medium cursor-pointer ${
                  activeTab === 'FILTERS' ? 'bg-pink-600/30 text-pink-300 border border-pink-500/40' : 'text-[#71717a] hover:text-white'
                }`}
              >
                Filtry
              </button>
              <button
                onClick={() => { setActiveTab('PRESETS'); setBrushMode(false); setCropMode(false); }}
                className={`flex-1 py-1.5 rounded-lg transition font-medium cursor-pointer ${
                  activeTab === 'PRESETS' ? 'bg-pink-600/30 text-pink-300 border border-pink-500/40' : 'text-[#71717a] hover:text-white'
                }`}
              >
                Presety
              </button>
              <button
                onClick={() => { setActiveTab('TRANSFORM'); setBrushMode(false); setCropMode(false); }}
                className={`flex-1 py-1.5 rounded-lg transition font-medium cursor-pointer ${
                  activeTab === 'TRANSFORM' ? 'bg-pink-600/30 text-pink-300 border border-pink-500/40' : 'text-[#71717a] hover:text-white'
                }`}
              >
                Obrót
              </button>
              <button
                onClick={() => { setActiveTab('CROP'); setBrushMode(false); setCropMode(true); }}
                className={`flex-1 py-1.5 rounded-lg transition font-medium cursor-pointer ${
                  activeTab === 'CROP' ? 'bg-pink-600/30 text-pink-300 border border-pink-500/40' : 'text-[#71717a] hover:text-white'
                }`}
              >
                Kadr
              </button>
              <button
                onClick={() => { setActiveTab('BRUSH'); setBrushMode(true); setCropMode(false); }}
                className={`flex-1 py-1.5 rounded-lg transition font-medium cursor-pointer ${
                  activeTab === 'BRUSH' ? 'bg-pink-600/30 text-pink-300 border border-pink-500/40' : 'text-[#71717a] hover:text-white'
                }`}
              >
                Pędzel
              </button>
              <button
                onClick={() => { setActiveTab('AI_COPILOT'); setBrushMode(false); setCropMode(false); }}
                className={`flex-1 py-1.5 rounded-lg transition font-medium cursor-pointer flex items-center justify-center gap-1 ${
                  activeTab === 'AI_COPILOT' ? 'bg-purple-600/40 text-purple-200 border border-purple-500/50 shadow-sm' : 'text-purple-400 hover:text-white'
                }`}
                title="Steruj edycją obrazu za pomocą lokalnego modelu AI"
              >
                <Bot className="w-3.5 h-3.5 text-purple-400" />
                <span>AI Tool</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </button>
            </div>

            {/* Tab Body */}
            <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar flex-1">
              
              {/* TAB 1: FILTERS */}
              {activeTab === 'FILTERS' && (
                <div className="space-y-4 animate-fadeIn">
                  
                  {/* Jasność */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[#a1a1aa] font-mono text-[11px]">
                      <span>Jasność (Brightness)</span>
                      <span className="text-white font-bold">{filters.brightness}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="-100" 
                      max="100" 
                      value={filters.brightness} 
                      onChange={(e) => setFilters({ ...filters, brightness: Number(e.target.value) })}
                      className="w-full accent-pink-500 cursor-pointer"
                    />
                  </div>

                  {/* Kontrast */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[#a1a1aa] font-mono text-[11px]">
                      <span>Kontrast (Contrast)</span>
                      <span className="text-white font-bold">{filters.contrast}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="-100" 
                      max="100" 
                      value={filters.contrast} 
                      onChange={(e) => setFilters({ ...filters, contrast: Number(e.target.value) })}
                      className="w-full accent-pink-500 cursor-pointer"
                    />
                  </div>

                  {/* Nasycenie */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[#a1a1aa] font-mono text-[11px]">
                      <span>Nasycenie (Saturation)</span>
                      <span className="text-white font-bold">{filters.saturation}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="200" 
                      value={filters.saturation} 
                      onChange={(e) => setFilters({ ...filters, saturation: Number(e.target.value) })}
                      className="w-full accent-pink-500 cursor-pointer"
                    />
                  </div>

                  {/* Rozmycie */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[#a1a1aa] font-mono text-[11px]">
                      <span>Rozmycie (Blur)</span>
                      <span className="text-white font-bold">{filters.blur} px</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="15" 
                      value={filters.blur} 
                      onChange={(e) => setFilters({ ...filters, blur: Number(e.target.value) })}
                      className="w-full accent-pink-500 cursor-pointer"
                    />
                  </div>

                  {/* Skala szarości */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[#a1a1aa] font-mono text-[11px]">
                      <span>Skala szarości (Grayscale)</span>
                      <span className="text-white font-bold">{filters.grayscale}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={filters.grayscale} 
                      onChange={(e) => setFilters({ ...filters, grayscale: Number(e.target.value) })}
                      className="w-full accent-pink-500 cursor-pointer"
                    />
                  </div>

                  {/* Sepia */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[#a1a1aa] font-mono text-[11px]">
                      <span>Sepia / Retro</span>
                      <span className="text-white font-bold">{filters.sepia}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={filters.sepia} 
                      onChange={(e) => setFilters({ ...filters, sepia: Number(e.target.value) })}
                      className="w-full accent-pink-500 cursor-pointer"
                    />
                  </div>

                  {/* Negatyw */}
                  <div className="flex items-center justify-between pt-2 border-t border-white/6 font-mono text-[11px]">
                    <span className="text-[#a1a1aa]">Negatyw / Invert</span>
                    <button
                      onClick={() => setFilters({ ...filters, invert: !filters.invert })}
                      className={`px-3 py-1 rounded-lg border text-xs font-mono transition cursor-pointer ${
                        filters.invert 
                          ? 'bg-pink-600 border-pink-400 text-white' 
                          : 'bg-[#1f1f24] border-white/10 text-[#71717a]'
                      }`}
                    >
                      {filters.invert ? 'WŁĄCZONY' : 'WYŁĄCZONY'}
                    </button>
                  </div>

                </div>
              )}

              {/* TAB 2: PRESETS */}
              {activeTab === 'PRESETS' && (
                <div className="space-y-2.5 animate-fadeIn">
                  <div className="text-[10px] uppercase font-mono text-[#71717a] font-bold">
                    Profile 1-Kliknięciem
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => applyPreset('ORIGINAL')}
                      className="p-2.5 rounded-xl bg-[#1c1c22] hover:bg-[#25252e] border border-white/8 text-left transition cursor-pointer"
                    >
                      <div className="font-bold text-white">Oryginał</div>
                      <div className="text-[10px] text-[#71717a]">Bez modyfikacji</div>
                    </button>

                    <button
                      onClick={() => applyPreset('CYBERPUNK')}
                      className="p-2.5 rounded-xl bg-[#20152b] hover:bg-[#2d1e3d] border border-purple-500/30 text-left transition cursor-pointer"
                    >
                      <div className="font-bold text-purple-300">Cyberpunk</div>
                      <div className="text-[10px] text-purple-400/80">Neon + Kontrast</div>
                    </button>

                    <button
                      onClick={() => applyPreset('NOIR')}
                      className="p-2.5 rounded-xl bg-[#18181b] hover:bg-[#242428] border border-white/10 text-left transition cursor-pointer"
                    >
                      <div className="font-bold text-white">Film Noir</div>
                      <div className="text-[10px] text-[#71717a]">Głęboka czerń B&W</div>
                    </button>

                    <button
                      onClick={() => applyPreset('VIVID')}
                      className="p-2.5 rounded-xl bg-[#2a1720] hover:bg-[#381f2b] border border-pink-500/30 text-left transition cursor-pointer"
                    >
                      <div className="font-bold text-pink-300">Vivid HDR</div>
                      <div className="text-[10px] text-pink-400/80">Soczyste kolory</div>
                    </button>

                    <button
                      onClick={() => applyPreset('VINTAGE')}
                      className="p-2.5 rounded-xl bg-[#241c14] hover:bg-[#33281d] border border-amber-500/30 text-left transition cursor-pointer"
                    >
                      <div className="font-bold text-amber-300">Vintage Warm</div>
                      <div className="text-[10px] text-amber-400/80">Ciepły klimat retro</div>
                    </button>

                    <button
                      onClick={() => applyPreset('XRAY')}
                      className="p-2.5 rounded-xl bg-[#12222b] hover:bg-[#1a2f3a] border border-cyan-500/30 text-left transition cursor-pointer"
                    >
                      <div className="font-bold text-cyan-300">X-Ray Rentgen</div>
                      <div className="text-[10px] text-cyan-400/80">Odwrócona matryca</div>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 3: TRANSFORM */}
              {activeTab === 'TRANSFORM' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="space-y-2">
                    <div className="text-[10px] uppercase font-mono text-[#71717a] font-bold">
                      Obrót o 90 stopni
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setRotation((r) => (r + 90) % 360)}
                        className="py-2.5 px-3 rounded-xl bg-[#1f1f24] hover:bg-[#27272f] border border-white/10 text-white flex items-center justify-center gap-2 transition cursor-pointer font-mono"
                      >
                        <RotateCw className="w-4 h-4 text-pink-400" />
                        <span>W prawo (+90°)</span>
                      </button>
                      <button
                        onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
                        className="py-2.5 px-3 rounded-xl bg-[#1f1f24] hover:bg-[#27272f] border border-white/10 text-white flex items-center justify-center gap-2 transition cursor-pointer font-mono"
                      >
                        <RotateCcw className="w-4 h-4 text-purple-400" />
                        <span>W lewo (-90°)</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-white/6">
                    <div className="text-[10px] uppercase font-mono text-[#71717a] font-bold">
                      Odbicie lustrzane
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setFlipH((f) => !f)}
                        className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 transition cursor-pointer font-mono ${
                          flipH ? 'bg-pink-600/30 border-pink-500 text-pink-200' : 'bg-[#1f1f24] border-white/10 text-white'
                        }`}
                      >
                        <FlipHorizontal className="w-4 h-4" />
                        <span>Lustro poziome</span>
                      </button>
                      <button
                        onClick={() => setFlipV((f) => !f)}
                        className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 transition cursor-pointer font-mono ${
                          flipV ? 'bg-pink-600/30 border-pink-500 text-pink-200' : 'bg-[#1f1f24] border-white/10 text-white'
                        }`}
                      >
                        <FlipVertical className="w-4 h-4" />
                        <span>Lustro pionowe</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: CROP */}
              {activeTab === 'CROP' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="p-3 rounded-xl bg-pink-500/10 border border-pink-500/20 text-[11px] text-pink-200 font-mono">
                    Narzędzie kadrowania jest aktywne. Wybierz proporcje kadru:
                  </div>

                  <div className="space-y-2">
                    <div className="text-[10px] uppercase font-mono text-[#71717a] font-bold">
                      Formaty Kadru
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'FREE', label: 'Dowolny (80%)', box: { x: 10, y: 10, width: 80, height: 80 } },
                        { id: '1:1', label: 'Kwadrat (1:1)', box: { x: 15, y: 15, width: 70, height: 70 } },
                        { id: '16:9', label: 'Panorama (16:9)', box: { x: 5, y: 25, width: 90, height: 50 } },
                        { id: '4:3', label: 'Klasyczny (4:3)', box: { x: 10, y: 20, width: 80, height: 60 } },
                        { id: '9:16', label: 'Pionowy (9:16)', box: { x: 25, y: 5, width: 50, height: 90 } }
                      ].map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => {
                            setCropRatio(preset.id as any);
                            setCropBox(preset.box);
                          }}
                          className={`p-2 rounded-xl text-xs font-mono border text-center transition cursor-pointer ${
                            cropRatio === preset.id
                              ? 'bg-pink-600 border-pink-400 text-white'
                              : 'bg-[#1f1f24] border-white/10 text-[#a1a1aa] hover:text-white'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: BRUSH */}
              {activeTab === 'BRUSH' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="text-[10px] uppercase font-mono text-[#71717a] font-bold">
                    Kolor Pisaka / Pędzla
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {BRUSH_COLORS.map((b) => (
                      <button
                        key={b.color}
                        onClick={() => setBrushColor(b.color)}
                        className={`h-9 rounded-xl border flex items-center justify-center transition cursor-pointer shadow-sm ${
                          brushColor === b.color ? 'border-white scale-105 shadow-md' : 'border-transparent opacity-80 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: b.color }}
                        title={b.name}
                      >
                        {brushColor === b.color && (
                          <Check className={`w-4 h-4 ${b.color === '#ffffff' ? 'text-black' : 'text-white'}`} />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Brush Size */}
                  <div className="space-y-1 pt-2 border-t border-white/6">
                    <div className="flex justify-between text-[#a1a1aa] font-mono text-[11px]">
                      <span>Grubość pędzla</span>
                      <span className="text-white font-bold">{brushSize} px</span>
                    </div>
                    <input 
                      type="range" 
                      min="2" 
                      max="24" 
                      value={brushSize} 
                      onChange={(e) => setBrushSize(Number(e.target.value))}
                      className="w-full accent-pink-500 cursor-pointer"
                    />
                  </div>

                  {/* Undo & Clear */}
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <button
                      onClick={() => setStrokes((prev) => prev.slice(0, prev.length - 1))}
                      disabled={strokes.length === 0}
                      className="py-2 px-3 rounded-xl bg-[#1f1f24] hover:bg-[#27272f] border border-white/10 text-white flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-40 font-mono text-xs"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>Cofnij</span>
                    </button>
                    <button
                      onClick={() => setStrokes([])}
                      disabled={strokes.length === 0}
                      className="py-2 px-3 rounded-xl bg-red-950/40 hover:bg-red-900/50 border border-red-500/30 text-red-300 flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-40 font-mono text-xs"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Wyczyść</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 6: AI COPILOT TOOL STUDIO */}
              {activeTab === 'AI_COPILOT' && (
                <div className="space-y-3.5 animate-fadeIn font-sans text-xs flex flex-col h-full">
                  {/* Ollama Model Selector */}
                  <div className="p-2.5 rounded-xl bg-purple-950/30 border border-purple-500/30 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-purple-300 font-mono text-[11px]">
                      <Bot className="w-3.5 h-3.5 text-purple-400" />
                      <span className="font-bold">Model AI:</span>
                    </div>
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="bg-[#181822] border border-purple-500/30 text-purple-200 text-[11px] font-mono rounded-lg px-2 py-1 focus:outline-none focus:border-purple-400"
                    >
                      {availableModels.map(m => (
                        <option key={m} value={m} className="bg-[#121218] text-white">
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Chat messages */}
                  <div className="p-2.5 rounded-xl bg-[#09090e] border border-white/10 space-y-2.5 max-h-[220px] overflow-y-auto custom-scrollbar font-mono text-[11px]">
                    {aiChatHistory.map((msg, i) => (
                      <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className="text-[10px] text-white/40 mb-0.5">
                          {msg.role === 'user' ? 'Polecenie:' : `AI (${selectedModel}):`}
                        </div>
                        <div 
                          className={`p-2.5 rounded-xl max-w-[95%] leading-relaxed ${
                            msg.role === 'user'
                              ? 'bg-purple-600 text-white font-medium'
                              : 'bg-[#181824] text-white/90 border border-white/10 font-normal'
                          }`}
                        >
                          {msg.text}
                          {msg.executedTool && (
                            <div className="mt-1 pt-1 border-t border-purple-500/30 text-[10px] text-purple-300 flex items-center gap-1 font-mono">
                              <Wand2 className="w-3 h-3 text-purple-400" />
                              <span>{msg.executedTool}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {isAiExecuting && (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-purple-950/40 text-purple-300 text-[11px] animate-pulse">
                        <RefreshCw className="w-3 h-3 animate-spin text-purple-400" />
                        <span>Wykonywanie narzędzia graficznego...</span>
                      </div>
                    )}
                  </div>

                  {/* Quick Action Chips */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono text-white/50 block">Szybkie narzędzia AI:</span>
                    <div className="flex flex-wrap gap-1">
                      <button
                        onClick={() => handleSendAiPrompt('Rozjaśnij o 30% i zwiększ kontrast o 25%')}
                        className="px-2 py-1 rounded-lg bg-white/5 hover:bg-purple-500/20 hover:text-purple-300 border border-white/10 text-[10px] font-mono text-white/70 transition"
                      >
                        ⚡ Rozjaśnij +30% & Kontrast
                      </button>
                      <button
                        onClick={() => handleSendAiPrompt('Zastosuj styl Noir (czarno-biały)')}
                        className="px-2 py-1 rounded-lg bg-white/5 hover:bg-purple-500/20 hover:text-purple-300 border border-white/10 text-[10px] font-mono text-white/70 transition"
                      >
                        🎬 Styl Noir
                      </button>
                      <button
                        onClick={() => handleSendAiPrompt('Zastosuj styl Cyberpunk')}
                        className="px-2 py-1 rounded-lg bg-white/5 hover:bg-purple-500/20 hover:text-purple-300 border border-white/10 text-[10px] font-mono text-white/70 transition"
                      >
                        🌆 Cyberpunk
                      </button>
                      <button
                        onClick={() => handleSendAiPrompt('Obróć o 90 stopni')}
                        className="px-2 py-1 rounded-lg bg-white/5 hover:bg-purple-500/20 hover:text-purple-300 border border-white/10 text-[10px] font-mono text-white/70 transition"
                      >
                        🔄 Obróć o 90°
                      </button>
                      <button
                        onClick={() => handleSendAiPrompt('Odwróć kolory (negatyw)')}
                        className="px-2 py-1 rounded-lg bg-white/5 hover:bg-purple-500/20 hover:text-purple-300 border border-white/10 text-[10px] font-mono text-white/70 transition"
                      >
                        🧪 Negatyw
                      </button>
                      <button
                        onClick={() => handleSendAiPrompt('Zresetuj wszystkie filtry')}
                        className="px-2 py-1 rounded-lg bg-white/5 hover:bg-red-500/20 hover:text-red-300 border border-white/10 text-[10px] font-mono text-white/70 transition"
                      >
                        🧹 Reset
                      </button>
                    </div>
                  </div>

                  {/* Prompt Form */}
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendAiPrompt();
                    }}
                    className="flex items-center gap-1.5 pt-1"
                  >
                    <input
                      type="text"
                      value={aiPromptInput}
                      onChange={(e) => setAiPromptInput(e.target.value)}
                      placeholder="np. 'rozjaśnij o 40%', 'styl vintage'..."
                      disabled={isAiExecuting}
                      className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-purple-500 transition disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={isAiExecuting || !aiPromptInput.trim()}
                      className="p-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition disabled:opacity-40 cursor-pointer shadow-lg shadow-purple-600/30"
                      title="Wyślij polecenie narzędziowe do AI"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              )}

            </div>

            {/* Panel Footer */}
            <div className="p-3 border-t border-white/8 bg-[#16161b] flex items-center justify-between text-[11px] font-mono text-[#71717a]">
              <span>
                {originalDimensions.width > 0 ? `${originalDimensions.width}×${originalDimensions.height}px • ` : ''}
                {formatBytesCompact(item.size)}
              </span>
              <span className="text-emerald-400 flex items-center gap-1">
                <Check className="w-3 h-3" /> Silnik Canvas 2D
              </span>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
