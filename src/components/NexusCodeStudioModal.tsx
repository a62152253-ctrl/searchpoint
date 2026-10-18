import React, { useState, useEffect, useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { 
  X, 
  Save, 
  Code2, 
  Copy, 
  Check, 
  Folder, 
  RotateCcw, 
  Sparkles, 
  HardDrive, 
  WrapText, 
  Maximize2, 
  Minimize2, 
  Layers, 
  CheckCircle2, 
  AlertCircle,
  Bot,
  Send,
  RefreshCw,
  CornerDownLeft,
  Wand2,
  FileCheck2,
  ShieldAlert,
  Zap,
  Play
} from 'lucide-react';
import { FileItem, formatBytesCompact, SystemInfo } from '../types';
import { readFileWithFSA, saveFileWithFSA } from '../utils/fileSystemAccessManager';
import { nexusApi } from '../utils/nexusAuth';

interface NexusCodeStudioModalProps {
  item: FileItem | null;
  onClose: () => void;
  onSaved?: (updatedItem: { path: string; size: number; mtime: string }) => void;
  onOpenInExplorer?: (path: string) => void;
}

const LANGUAGE_OPTIONS = [
  { value: 'javascript', label: 'JavaScript (.js, .cjs, .mjs)' },
  { value: 'typescript', label: 'TypeScript (.ts, .tsx)' },
  { value: 'json', label: 'JSON / Lockfile (.json, .lock)' },
  { value: 'html', label: 'HTML (.html, .htm)' },
  { value: 'css', label: 'CSS / SCSS (.css, .scss)' },
  { value: 'python', label: 'Python (.py)' },
  { value: 'rust', label: 'Rust (.rs)' },
  { value: 'go', label: 'Go (.go)' },
  { value: 'java', label: 'Java (.java)' },
  { value: 'csharp', label: 'C# (.cs)' },
  { value: 'cpp', label: 'C / C++ (.c, .cpp, .h)' },
  { value: 'sql', label: 'SQL (.sql)' },
  { value: 'markdown', label: 'Markdown (.md)' },
  { value: 'yaml', label: 'YAML (.yml, .yaml)' },
  { value: 'xml', label: 'XML / SVG (.xml, .svg)' },
  { value: 'shell', label: 'Shell / Bash (.sh, .bash)' },
  { value: 'bat', label: 'Batch / CMD (.bat, .cmd)' },
  { value: 'powershell', label: 'PowerShell (.ps1)' },
  { value: 'ini', label: 'Config / INI / ENV (.ini, .env, .toml)' },
  { value: 'plaintext', label: 'Zwykły tekst (.txt, .log)' },
];

export const NexusCodeStudioModal: React.FC<NexusCodeStudioModalProps> = ({
  item,
  onClose,
  onSaved,
  onOpenInExplorer
}) => {
  const [content, setContent] = useState<string>('');
  const [initialContent, setInitialContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<string>('plaintext');
  const [fileDetails, setFileDetails] = useState<{ size: number; mtime: string; lines: number } | null>(null);
  
  // Editor preferences
  const [wordWrap, setWordWrap] = useState<'on' | 'off'>('on');
  const [minimap, setMinimap] = useState<boolean>(true);
  const [fontSize, setFontSize] = useState<number>(14);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [cursorPos, setCursorPos] = useState<{ line: number; col: number }>({ line: 1, col: 1 });

  // AI Copilot state
  const [aiPanelOpen, setAiPanelOpen] = useState<boolean>(true);
  const [selectedModel, setSelectedModel] = useState<string>('qwen2.5-coder:3b');
  const [availableModels, setAvailableModels] = useState<string[]>([
    'qwen2.5-coder:3b',
    'qwen2.5:1.5b',
    'qwen2.5:0.5b',
    'llama3.2',
    'deepseek-coder'
  ]);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string; timestamp: number }>>([
    {
      role: 'assistant',
      text: 'Witaj w Nexus Code Studio! Wybierz model AI, zadaj pytanie o ten kod lub użyj szybkich akcji poniżej.',
      timestamp: Date.now()
    }
  ]);
  const [inputPrompt, setInputPrompt] = useState<string>('');
  const [isAiStreaming, setIsAiStreaming] = useState<boolean>(false);
  const [copiedSnippetIdx, setCopiedSnippetIdx] = useState<string | null>(null);

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const hasUnsavedChanges = content !== initialContent;

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isAiStreaming]);

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

  // Load content from FSA Handle or Backend
  useEffect(() => {
    if (!item) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    // 1. Try reading directly via File System Access API handle
    readFileWithFSA(item).then((fsaResult) => {
      if (!isMounted) return;
      if (fsaResult) {
        setContent(fsaResult.content);
        setInitialContent(fsaResult.content);
        const ext = (item.extension || '').toLowerCase();
        const found = LANGUAGE_OPTIONS.find(l => l.value === ext || l.label.includes(`.${ext}`));
        setLanguage(found ? found.value : (ext === 'lock' ? 'json' : 'plaintext'));
        setFileDetails({
          size: fsaResult.size,
          mtime: new Date(fsaResult.mtime).toISOString(),
          lines: fsaResult.content.split('\n').length
        });
        setLoading(false);
        return;
      }

      // 2. Fallback to server API
      nexusApi.get<{ content?: string; language?: string; size?: number; mtime?: string; totalLines?: number }>(
        `/api/file/content?path=${encodeURIComponent(item.path)}`
      )
        .then((data) => {
          if (!isMounted) return;
          setContent(data.content || '');
          setInitialContent(data.content || '');
          setLanguage(data.language || 'plaintext');
          setFileDetails({
            size: data.size || 0,
            mtime: data.mtime || '',
            lines: data.totalLines || (data.content ? data.content.split('\n').length : 1)
          });
          setLoading(false);
        })
        .catch((err: any) => {
          if (!isMounted) return;
          setError(err.message || 'Nie udało się odczytać pliku');
          setLoading(false);
        });
    });

    return () => {
      isMounted = false;
    };
  }, [item?.path]);

  // Handle Save (transactional disk write via FSA API or Server)
  const handleSave = async (saveAsCopy: boolean = false) => {
    if (!item || isSaving) return;

    setIsSaving(true);
    setSaveSuccessMsg(null);
    setError(null);

    try {
      if (!saveAsCopy && (item.fileHandle || item.path.startsWith('[FSA]'))) {
        // Native File System Access API direct write
        await saveFileWithFSA(item, content, false);
        setInitialContent(content);
        setSaveSuccessMsg('Zapisano natywnie przez File System Access API!');
        if (onSaved) {
          onSaved({
            path: item.path,
            size: content.length,
            mtime: new Date().toISOString()
          });
        }
      } else {
        // Server API transactional write
        const data = await nexusApi.post<{ name: string; size: number; path: string; mtime: string }>('/api/file/save', {
          path: item.path,
          content,
          createBackup: true,
          saveAsCopy
        });

        if (!saveAsCopy) {
          setInitialContent(content);
        }

        setSaveSuccessMsg(
          saveAsCopy 
            ? `Zapisano kopię: ${data.name}` 
            : `Zapisano na dysku (${(data.size / 1024).toFixed(1)} KB)`
        );

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
      setError(`Błąd zapisu: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Keyboard shortcut Ctrl+S / Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave(false);
      }
      if (e.key === 'Escape' && !hasUnsavedChanges) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [content, initialContent, item, isSaving, hasUnsavedChanges]);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Register Ctrl+S shortcut inside Monaco
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSave(false);
    });

    // Track cursor position
    editor.onDidChangeCursorPosition((e) => {
      setCursorPos({
        line: e.position.lineNumber,
        col: e.position.column
      });
    });

    // Focus editor
    editor.focus();
  };

  const handleFormatCode = () => {
    if (editorRef.current) {
      editorRef.current.getAction('editor.action.formatDocument')?.run();
    }
  };

  const handleCopyPath = () => {
    if (!item) return;
    navigator.clipboard.writeText(item.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCloseAttempt = () => {
    if (hasUnsavedChanges) {
      if (window.confirm('Masz niezapisane zmiany w pliku! Czy na pewno chcesz wyjść bez zapisywania?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  // ===============================
  // OLLAMA AI COPILOT FUNCTIONS
  // ===============================
  const handleSendPrompt = async (forcedPrompt?: string) => {
    const text = (forcedPrompt || inputPrompt).trim();
    if (!text || isAiStreaming) return;

    const userMsg = { role: 'user' as const, text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    if (!forcedPrompt) setInputPrompt('');
    setIsAiStreaming(true);

    try {
      const apiMessages = [...messages, userMsg].map(m => ({
        role: m.role,
        content: m.text
      }));

      const data = await nexusApi.post<{ success: boolean; reply?: string; error?: string }>('/api/ai/chat', {
        messages: apiMessages,
        model: selectedModel,
        workspacePath: item?.path ? item.path.substring(0, item.path.lastIndexOf('\\')) : undefined,
        attachedFile: {
          name: item?.name || 'file',
          path: item?.path || '',
          content: content.slice(0, 16000)
        }
      });

      if (!data.success) {
        throw new Error(data.error || 'Błąd odpowiedzi z lokalnego modelu AI');
      }

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: data.reply || 'Zakończono analizę kodu.',
          timestamp: Date.now()
        }
      ]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: `⚠️ Wystąpił błąd podczas komunikacji z modelem AI (${selectedModel}): ${err.message}.`,
          timestamp: Date.now()
        }
      ]);
    } finally {
      setIsAiStreaming(false);
    }
  };

  // Insert code snippet at current cursor position in Monaco
  const handleInsertAtCursor = (codeSnippet: string) => {
    if (!editorRef.current) return;
    const selection = editorRef.current.getSelection();
    editorRef.current.executeEdits('nexus-ai-copilot', [
      {
        range: selection,
        text: codeSnippet,
        forceMoveMarkers: true
      }
    ]);
    editorRef.current.focus();
    setSaveSuccessMsg('Wstawiono fragment kodu w miejscu kursora!');
    setTimeout(() => setSaveSuccessMsg(null), 2500);
  };

  // Replace entire editor contents with AI code snippet
  const handleReplaceEntireEditor = (codeSnippet: string) => {
    if (!editorRef.current) return;
    setContent(codeSnippet);
    editorRef.current.setValue(codeSnippet);
    editorRef.current.focus();
    setSaveSuccessMsg('Zastąpiono całą zawartość pliku kodem z AI Copilot!');
    setTimeout(() => setSaveSuccessMsg(null), 2500);
  };

  // Helper to extract fenced code blocks from markdown text
  const parseMessageContent = (text: string, msgIdx: number) => {
    const codeBlockRegex = /```([a-zA-Z0-9_\-+]*)\n([\s\S]*?)```/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let blockCount = 0;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      const precedingText = text.substring(lastIndex, match.index);
      if (precedingText) {
        parts.push(
          <div key={`text-${msgIdx}-${lastIndex}`} className="whitespace-pre-wrap leading-relaxed">
            {precedingText}
          </div>
        );
      }

      const lang = match[1] || 'code';
      const codeSnippet = match[2].trim();
      const snippetId = `${msgIdx}-${blockCount}`;
      blockCount++;

      parts.push(
        <div key={`block-${snippetId}`} className="my-2.5 rounded-xl bg-[#08080c] border border-white/10 overflow-hidden shadow-md">
          <div className="px-3 py-1.5 bg-[#14141a] border-b border-white/10 flex items-center justify-between text-[11px] font-mono text-purple-300">
            <span className="uppercase font-bold tracking-wider">{lang}</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(codeSnippet);
                  setCopiedSnippetIdx(snippetId);
                  setTimeout(() => setCopiedSnippetIdx(null), 2000);
                }}
                className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition flex items-center gap-1"
                title="Kopiuj do schowka"
              >
                {copiedSnippetIdx === snippetId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedSnippetIdx === snippetId ? 'Skopiowano' : 'Kopiuj'}</span>
              </button>
              <button
                onClick={() => handleInsertAtCursor(codeSnippet)}
                className="px-2 py-0.5 rounded bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 transition flex items-center gap-1"
                title="Wstaw w miejscu kursora w edytorze Monaco"
              >
                <CornerDownLeft className="w-3 h-3 text-purple-400" />
                <span>Wstaw</span>
              </button>
              <button
                onClick={() => handleReplaceEntireEditor(codeSnippet)}
                className="px-2 py-0.5 rounded bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-200 border border-cyan-500/30 transition flex items-center gap-1"
                title="Zastąp cały plik tym kodem"
              >
                <RefreshCw className="w-3 h-3 text-cyan-400" />
                <span>Zastąp plik</span>
              </button>
            </div>
          </div>
          <pre className="p-3 text-[11px] font-mono text-white/90 overflow-x-auto custom-scrollbar selection:bg-purple-500/40">
            <code>{codeSnippet}</code>
          </pre>
        </div>
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(
        <div key={`text-${msgIdx}-${lastIndex}`} className="whitespace-pre-wrap leading-relaxed">
          {text.substring(lastIndex)}
        </div>
      );
    }

    return parts;
  };

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-xl animate-fadeIn p-2 sm:p-4 md:p-6 overflow-hidden">
      <div 
        className={`bg-[#0d0d11] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
          isFullscreen 
            ? 'w-full h-full rounded-none' 
            : 'w-[98vw] max-w-7xl h-[94vh]'
        }`}
      >
        {/* 1. Header Toolbar */}
        <div className="p-3 bg-[#141418] border-b border-white/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
          
          {/* File identifier & path */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0 shadow-inner">
              <Code2 className="w-5 h-5" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm truncate font-mono">
                  {item.name}
                </span>
                {hasUnsavedChanges ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-mono font-medium animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                    Niezapisane (Ctrl+S)
                  </span>
                ) : (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono font-medium">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    Zsynchronizowany
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 text-[11px] text-[#71717a] font-mono truncate">
                <span className="truncate max-w-[340px]">{item.path}</span>
                <button
                  onClick={handleCopyPath}
                  className="hover:text-purple-400 transition cursor-pointer"
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

          {/* Quick Actions & Controls */}
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            
            {/* AI Copilot Toggle Button */}
            <button
              onClick={() => setAiPanelOpen(prev => !prev)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-mono transition cursor-pointer flex items-center gap-1.5 shadow-sm ${
                aiPanelOpen
                  ? 'bg-gradient-to-r from-purple-600/30 to-indigo-600/30 border-purple-500/60 text-purple-200 shadow-purple-500/20'
                  : 'bg-[#1f1f24] hover:bg-[#27272f] border-white/10 text-[#a1a1aa] hover:text-white'
              }`}
              title="Przełącz boczny panel AI Copilot"
            >
              <Bot className="w-3.5 h-3.5 text-purple-400" />
              <span className="font-bold">AI Copilot</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
            </button>

            {/* Language Selector */}
            <div className="relative">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="bg-[#1f1f24] hover:bg-[#27272f] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs font-mono text-purple-300 focus:outline-none focus:border-purple-500 transition cursor-pointer"
                title="Zmień język kolorowania składni"
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-[#18181b] text-white">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Word wrap toggle */}
            <button
              onClick={() => setWordWrap((prev) => (prev === 'on' ? 'off' : 'on'))}
              className={`p-1.5 rounded-xl border transition cursor-pointer text-xs font-mono flex items-center gap-1 ${
                wordWrap === 'on' 
                  ? 'bg-purple-600/30 border-purple-500/50 text-purple-200' 
                  : 'bg-[#1f1f24] border-white/10 text-[#a1a1aa] hover:text-white'
              }`}
              title="Zawijanie wierszy (Word Wrap)"
            >
              <WrapText className="w-4 h-4" />
            </button>

            {/* Minimap toggle */}
            <button
              onClick={() => setMinimap((prev) => !prev)}
              className={`p-1.5 rounded-xl border transition cursor-pointer text-xs font-mono flex items-center gap-1 ${
                minimap 
                  ? 'bg-purple-600/30 border-purple-500/50 text-purple-200' 
                  : 'bg-[#1f1f24] border-white/10 text-[#a1a1aa] hover:text-white'
              }`}
              title="Przełącz minimapę kodu"
            >
              <Layers className="w-4 h-4" />
            </button>

            {/* Format code */}
            <button
              onClick={handleFormatCode}
              className="px-2.5 py-1.5 rounded-xl bg-[#1f1f24] hover:bg-[#27272f] border border-white/10 text-[#d4d4d8] text-xs font-mono transition cursor-pointer flex items-center gap-1.5"
              title="Formatuj kod źródłowy"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">Formatuj</span>
            </button>

            {/* Revert / Reset */}
            {hasUnsavedChanges && (
              <button
                onClick={() => {
                  if (window.confirm('Cofnąć wszystkie niezapisane zmiany do stanu z dysku?')) {
                    setContent(initialContent);
                  }
                }}
                className="px-2.5 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/50 border border-red-500/40 text-red-300 text-xs font-mono transition cursor-pointer flex items-center gap-1"
                title="Cofnij zmiany do wersji z dysku"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cofnij</span>
              </button>
            )}

            {/* Save As Copy */}
            <button
              onClick={() => handleSave(true)}
              disabled={isSaving}
              className="px-3 py-1.5 rounded-xl bg-[#1f1f24] hover:bg-[#2a2a32] border border-white/10 text-white text-xs font-mono transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              title="Zapisz jako kopię (.edited)"
            >
              <span>Zapisz kopię</span>
            </button>

            {/* Main Save (Ctrl+S) */}
            <button
              onClick={() => handleSave(false)}
              disabled={isSaving || !hasUnsavedChanges}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold font-mono transition flex items-center gap-2 shadow-lg cursor-pointer ${
                hasUnsavedChanges
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-900/40 animate-pulse'
                  : 'bg-[#27272a] text-[#71717a] border border-white/5 cursor-default'
              }`}
            >
              <Save className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
              <span>{isSaving ? 'Zapisywanie...' : 'Zapisz (Ctrl+S)'}</span>
            </button>

            {/* Fullscreen toggle */}
            <button
              onClick={() => setIsFullscreen((prev) => !prev)}
              className="p-1.5 rounded-xl bg-[#1f1f24] hover:bg-[#27272f] border border-white/10 text-[#a1a1aa] hover:text-white transition cursor-pointer"
              title={isFullscreen ? 'Opuść pełny ekran' : 'Pełny ekran'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close button */}
            <button
              onClick={handleCloseAttempt}
              className="p-1.5 rounded-xl bg-[#1f1f24] hover:bg-red-950/60 hover:text-red-300 border border-white/10 text-[#a1a1aa] transition cursor-pointer ml-1"
              title="Zamknij studio kodu (Esc)"
            >
              <X className="w-4 h-4" />
            </button>

          </div>
        </div>

        {/* 2. Feedback Alert Toast */}
        {saveSuccessMsg && (
          <div className="bg-emerald-950/80 border-b border-emerald-500/40 px-4 py-2 text-xs font-mono text-emerald-300 flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{saveSuccessMsg}</span>
              <span className="text-emerald-500/70 text-[10px]">• Kopia zapasowa w .nexus_backups/</span>
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

        {/* 3. Editor & AI Copilot Workspace Body */}
        <div className="flex-1 min-h-0 flex flex-row relative overflow-hidden bg-[#09090b]">
          
          {/* Main Monaco Editor Container */}
          <div className="flex-1 min-h-0 h-full relative">
            {loading ? (
              <div className="w-full h-full flex flex-col items-center justify-center space-y-3 font-mono text-xs text-[#71717a]">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                <span>Ładowanie pliku z dysku ({item.name})...</span>
              </div>
            ) : (
              <Editor
                height="100%"
                theme="vs-dark"
                language={language}
                value={content}
                onChange={(value) => setContent(value || '')}
                onMount={handleEditorMount}
                options={{
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                  fontSize,
                  lineHeight: 22,
                  minimap: { enabled: minimap },
                  wordWrap,
                  scrollBeyondLastLine: false,
                  smoothScrolling: true,
                  cursorBlinking: 'smooth',
                  cursorSmoothCaretAnimation: 'on',
                  formatOnPaste: true,
                  formatOnType: true,
                  bracketPairColorization: { enabled: true },
                  guides: {
                    bracketPairs: true,
                    indentation: true
                  },
                  renderLineHighlight: 'all',
                  suggestOnTriggerCharacters: true,
                  acceptSuggestionOnEnter: 'on',
                  tabSize: 2,
                  automaticLayout: true,
                  padding: { top: 12, bottom: 12 }
                }}
              />
            )}
          </div>

          {/* AI Copilot Side Drawer */}
          {aiPanelOpen && (
            <div className="w-full sm:w-[380px] lg:w-[430px] h-full bg-[#0e0e13] border-l border-white/10 flex flex-col shrink-0 font-sans z-10 animate-slideLeft">
              
              {/* Copilot Header */}
              <div className="p-3 bg-[#15151c] border-b border-white/10 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-mono text-xs font-bold text-white">Monaco AI Copilot</span>
                </div>

                {/* Model Selector */}
                <div className="flex items-center gap-1.5">
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="bg-[#202029] border border-white/10 text-purple-300 text-[11px] font-mono rounded-lg px-2 py-1 focus:outline-none focus:border-purple-500"
                    title="Wybierz model Ollama do analizy kodu"
                  >
                    {availableModels.map(m => (
                      <option key={m} value={m} className="bg-[#18181f] text-white">
                        {m}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setAiPanelOpen(false)}
                    className="p-1 rounded-lg text-white/40 hover:text-white transition"
                    title="Zwiń panel AI"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Chat Messages List */}
              <div 
                ref={chatScrollRef}
                className="flex-1 p-3.5 space-y-3.5 overflow-y-auto custom-scrollbar font-sans text-xs"
              >
                {messages.map((m, idx) => (
                  <div 
                    key={idx} 
                    className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 text-[10px] font-mono text-white/40">
                      {m.role === 'user' ? (
                        <span>Ty</span>
                      ) : (
                        <span className="text-purple-400 font-bold flex items-center gap-1">
                          <Bot className="w-3 h-3" />
                          Ollama ({selectedModel})
                        </span>
                      )}
                    </div>
                    
                    <div 
                      className={`p-3 rounded-2xl max-w-[94%] ${
                        m.role === 'user'
                          ? 'bg-purple-600 text-white rounded-tr-none font-medium'
                          : 'bg-[#181822] text-white/90 border border-white/10 rounded-tl-none font-normal'
                      }`}
                    >
                      {parseMessageContent(m.text, idx)}
                    </div>
                  </div>
                ))}

                {isAiStreaming && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-[#181822] border border-purple-500/30 text-purple-300 font-mono text-xs animate-pulse">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
                    <span>Ollama ({selectedModel}) analizuje kod pliku...</span>
                  </div>
                )}
              </div>

              {/* Quick Actions Chips */}
              <div className="p-2 border-t border-white/8 bg-[#121218] flex flex-wrap gap-1.5">
                <button
                  disabled={isAiStreaming}
                  onClick={() => handleSendPrompt(`Wyjaśnij architekturę i działanie tego pliku (${item.name}). Wskaż kluczowe funkcje i przepływ danych.`)}
                  className="px-2 py-1 rounded-lg bg-white/5 hover:bg-purple-500/20 hover:text-purple-300 border border-white/10 text-[10px] font-mono text-white/70 transition disabled:opacity-40"
                >
                  💡 Wyjaśnij kod
                </button>
                <button
                  disabled={isAiStreaming}
                  onClick={() => handleSendPrompt(`Przeanalizuj ten plik pod kątem błędów, luk bezpieczeństwa, wycieków pamięci i złych praktyk. Zaproponuj poprawki w bloku kodu.`)}
                  className="px-2 py-1 rounded-lg bg-white/5 hover:bg-red-500/20 hover:text-red-300 border border-white/10 text-[10px] font-mono text-white/70 transition disabled:opacity-40"
                >
                  🔍 Znajdź błędy
                </button>
                <button
                  disabled={isAiStreaming}
                  onClick={() => handleSendPrompt(`Zoptymalizuj ten kod pod kątem wydajności algorytmicznej i czystości (Clean Code). Podaj zoptymalizowaną wersję gotową do podmiany.`)}
                  className="px-2 py-1 rounded-lg bg-white/5 hover:bg-yellow-500/20 hover:text-yellow-300 border border-white/10 text-[10px] font-mono text-white/70 transition disabled:opacity-40"
                >
                  ⚡ Zoptymalizuj
                </button>
                <button
                  disabled={isAiStreaming}
                  onClick={() => handleSendPrompt(`Napisz kompletne testy jednostkowe (Unit Tests) dla funkcji znajdujących się w tym pliku.`)}
                  className="px-2 py-1 rounded-lg bg-white/5 hover:bg-cyan-500/20 hover:text-cyan-300 border border-white/10 text-[10px] font-mono text-white/70 transition disabled:opacity-40"
                >
                  🧪 Napisz testy
                </button>
              </div>

              {/* Input Textarea & Send Button */}
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendPrompt();
                }}
                className="p-3 bg-[#15151c] border-t border-white/10 flex items-center gap-2"
              >
                <input
                  type="text"
                  value={inputPrompt}
                  onChange={(e) => setInputPrompt(e.target.value)}
                  placeholder="Zapytaj Ollamę lub poproś o modyfikację..."
                  disabled={isAiStreaming}
                  className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-purple-500 transition disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={isAiStreaming || !inputPrompt.trim()}
                  className="p-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition disabled:opacity-40 cursor-pointer shadow-lg shadow-purple-600/30"
                  title="Wyślij do Ollama"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>

            </div>
          )}

        </div>

        {/* 4. Footer Status Bar */}
        <div className="px-4 py-2 bg-[#121216] border-t border-white/8 flex flex-wrap items-center justify-between text-[11px] font-mono text-[#71717a] shrink-0 select-none">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-purple-300">
              <HardDrive className="w-3.5 h-3.5 text-purple-400" />
              <span>UTF-8 • {formatBytesCompact(fileDetails?.size || item.size)}</span>
            </div>
            <span>Wiersz: <b className="text-white">{cursorPos.line}</b>, Kol: <b className="text-white">{cursorPos.col}</b></span>
            <span>Łącznie: <b className="text-white">{content.split('\n').length}</b> wierszy</span>
            <span>Znaki: <b className="text-white">{content.length.toLocaleString()}</b></span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-md px-1.5 py-0.5">
              <button
                onClick={() => setFontSize(f => Math.max(11, f - 1))}
                className="px-1 text-slate-400 hover:text-white cursor-pointer"
                title="Zmniejsz czcionkę"
              >
                A-
              </button>
              <span className="text-[10px] text-white px-1">{fontSize}px</span>
              <button
                onClick={() => setFontSize(f => Math.min(24, f + 1))}
                className="px-1 text-slate-400 hover:text-white cursor-pointer"
                title="Powiększ czcionkę"
              >
                A+
              </button>
            </div>
            <span className="hidden sm:inline text-[#52525b]">Skróty: Ctrl+S (Zapisz), Shift+Alt+F (Format)</span>
            <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-white font-medium uppercase text-[10px]">
              {language}
            </span>
          </div>
        </div>

      </div>
    </div>
  );
};
