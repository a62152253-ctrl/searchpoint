import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  X,
  Send,
  Loader2,
  Paperclip,
  Sparkles,
  FileText,
  RotateCcw,
  Check,
  Copy,
  Cpu,
  ShieldCheck,
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import { FileItem } from '../types';
import { nexusApi } from '../utils/nexusAuth';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  attachedFile?: string;
  model?: string;
}

interface NexusOllamaChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  workspacePath?: string;
  items?: FileItem[];
  selectedItem: FileItem | null;
  onOpenFile?: (path: string) => void;
  aiStatus: any;
}

export const NexusOllamaChatDrawer: React.FC<NexusOllamaChatDrawerProps> = ({
  isOpen,
  onClose,
  workspacePath,
  items = [],
  selectedItem,
  onOpenFile,
  aiStatus
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Cześć! Jestem Twoim lokalnym asystentem AI w Nexusie. Mam bezpośredni dostęp do Twoich plików i struktury projektu. W czym mogę Ci pomóc?',
      timestamp: new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }),
      model: 'qwen2.5-coder:3b'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachedFile, setAttachedFile] = useState<FileItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Available models from Ollama daemon or fallback
  const modelsList: string[] = (aiStatus?.ollama?.models || []).map((m: any) => m.name || m);
  const defaultModel = modelsList.includes('qwen2.5-coder:3b')
    ? 'qwen2.5-coder:3b'
    : modelsList[0] || 'qwen2.5-coder:3b';
  const [selectedModel, setSelectedModel] = useState<string>(defaultModel);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Update selected model if status arrives later
  useEffect(() => {
    if (modelsList.length > 0 && !modelsList.includes(selectedModel)) {
      setSelectedModel(modelsList.includes('qwen2.5-coder:3b') ? 'qwen2.5-coder:3b' : modelsList[0]);
    }
  }, [modelsList.length]);

  // Scroll to bottom on new message
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Focus textarea when opened & listen for Escape
  useEffect(() => {
    if (!isOpen) return;
    setTimeout(() => textareaRef.current?.focus(), 150);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isLoading) return;

    const timeStr = new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: timeStr,
      attachedFile: attachedFile ? attachedFile.name : undefined
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Build conversation payload for backend
      const historyPayload = messages
        .filter(m => m.id !== 'welcome')
        .map(m => ({ role: m.role, content: m.content }));
      historyPayload.push({ role: 'user', content: text });

      const data = await nexusApi.post<{ success: boolean; message?: { content: string }; model?: string; error?: string }>('/api/ai/chat', {
        messages: historyPayload,
        model: selectedModel,
        workspacePath: workspacePath || '.',
        attachedFile: attachedFile ? { name: attachedFile.name, path: attachedFile.path } : undefined,
        clientItemsSample: items.slice(0, 100).map(i => ({ name: i.name, path: i.path, size: i.size, extension: i.extension, category: i.category })),
        totalClientFiles: items.length
      });
      if (data.success && data.message) {
        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: data.message.content || 'Otrzymano pustą odpowiedź.',
          timestamp: new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }),
          model: data.model || selectedModel
        };
        setMessages(prev => [...prev, aiMsg]);
      } else {
        const errorMsg: ChatMessage = {
          id: `ai-err-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ **Błąd**: ${data.error || 'Nie udało się połączyć z lokalnym silnikiem AI.'}\n\nUpewnij się, że lokalne AI działa w tle.`,
          timestamp: new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }),
          model: selectedModel
        };
        setMessages(prev => [...prev, errorMsg]);
      }
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `ai-err-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ **Błąd sieci**: ${err.message}`,
        timestamp: new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyText = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: 'Wyczyszczono historię rozmowy. Jestem gotowy do dalszej pracy z Twoimi plikami!',
        timestamp: new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }),
        model: selectedModel
      }
    ]);
  };

  const quickPrompts = [
    '📊 Przeanalizuj strukturę i pliki w tym projekcie',
    '🗄️ Wyjaśnij jak działa baza danych i przechowywanie stanu',
    '🔐 Gdzie w kodzie znajduje się logika autoryzacji / bezpieczeństwa?',
    '⚡ Wskaż kluczowe komponenty i architekturę aplikacji'
  ];

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[540px] md:w-[600px] bg-[#121118]/95 backdrop-blur-2xl border-l border-purple-500/30 shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col text-[#e6e5e3] font-sans animate-slideLeft select-none">
      
      {/* 1. TOP HEADER WITH STATUS & MODEL SELECTOR */}
      <div className="p-4 border-b border-white/8 bg-[#181622]/80 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-emerald-500 flex items-center justify-center text-white shadow-lg shadow-purple-900/30">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-white tracking-tight">Lokalny Asystent AI</h3>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Połączono
              </span>
            </div>
            <p className="text-[11px] text-[#a1a1aa] font-mono mt-0.5">
              Bezpośredni dostęp do plików workspace
            </p>
          </div>
        </div>

        {/* Model Selector & Close */}
        <div className="flex items-center gap-2">
          {modelsList.length > 0 && (
            <div className="relative">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="appearance-none bg-[#201d2c] hover:bg-[#282438] text-purple-200 border border-purple-500/30 hover:border-purple-400 px-3 py-1.5 pr-7 rounded-xl text-xs font-mono font-semibold cursor-pointer transition shadow-sm focus:outline-none focus:ring-1 focus:ring-purple-400"
              >
                {modelsList.map(m => (
                  <option key={m} value={m} className="bg-[#181622] text-white">
                    {m}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-purple-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-[#a1a1aa] hover:text-white transition cursor-pointer"
            title="Zamknij czat (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 2. CONTEXT RIBBON & ATTACHMENT CONTROLS */}
      <div className="px-4 py-2 bg-[#161420] border-b border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
        <div className="flex items-center gap-2 text-[#a1a1aa] truncate">
          <span className="text-purple-400 font-bold">Workspace:</span>
          <span className="text-white truncate max-w-[150px]" title={workspacePath || '.'}>
            {workspacePath ? workspacePath.split(/[\\/]/).pop() : 'Aktywny folder'}
          </span>
          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded font-mono">
            {items.length.toLocaleString('pl-PL')} plików
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick attach currently selected dashboard item */}
          {selectedItem && (!attachedFile || attachedFile.id !== selectedItem.id) && (
            <button
              onClick={() => setAttachedFile(selectedItem)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/25 border border-purple-500/30 text-purple-200 text-[11px] font-semibold transition cursor-pointer"
              title="Załącz aktualnie zaznaczony plik z listy"
            >
              <Paperclip className="w-3 h-3 text-purple-400" />
              <span>Załącz: {selectedItem.name.slice(0, 18)}</span>
            </button>
          )}

          {attachedFile && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-200 text-[11px]">
              <FileText className="w-3 h-3 text-indigo-400" />
              <span className="font-semibold truncate max-w-[120px]">{attachedFile.name}</span>
              <button
                onClick={() => setAttachedFile(null)}
                className="hover:text-white text-indigo-400 ml-1"
                title="Odłącz plik"
              >
                ✕
              </button>
            </span>
          )}

          <button
            onClick={handleClearHistory}
            className="p-1 text-[#71717a] hover:text-[#a1a1aa] transition cursor-pointer"
            title="Wyczyść historię rozmowy"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 3. MESSAGE THREAD */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-sans text-xs">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} space-y-1`}
          >
            <div className="flex items-center gap-2 px-1 text-[10px] font-mono text-[#71717a]">
              <span>{msg.role === 'user' ? 'Ty' : `AI (${msg.model || selectedModel})`}</span>
              <span>•</span>
              <span>{msg.timestamp}</span>
              {msg.attachedFile && (
                <span className="text-purple-400 font-semibold">📎 {msg.attachedFile}</span>
              )}
            </div>

            <div
              className={`relative group max-w-[90%] rounded-2xl p-3.5 leading-relaxed shadow-md ${
                msg.role === 'user'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-br-none'
                  : 'bg-[#1e1c28] border border-white/8 text-[#e0dfe4] rounded-bl-none'
              }`}
            >
              {/* Copy message button */}
              <button
                onClick={() => handleCopyText(msg.content, msg.id)}
                className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition p-1 rounded-md bg-black/40 hover:bg-black/70 text-[#a1a1aa] hover:text-white"
                title="Kopiuj treść"
              >
                {copiedId === msg.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>

              {/* Message Content with basic Markdown & Code styling */}
              <div className="whitespace-pre-wrap font-sans text-[13px] break-words">
                {msg.content}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex flex-col items-start space-y-1">
            <div className="flex items-center gap-2 px-1 text-[10px] font-mono text-[#71717a]">
              <span>AI myśli...</span>
            </div>
            <div className="bg-[#1e1c28] border border-white/8 rounded-2xl rounded-bl-none p-3.5 flex items-center gap-2.5 text-purple-300">
              <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
              <span className="text-xs font-mono">Przeszukiwanie i analiza plików...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 4. QUICK PROMPT CHIPS */}
      <div className="px-4 py-2 border-t border-white/5 bg-[#161420]/50 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
        <span className="text-[10px] font-mono text-[#71717a] shrink-0 mr-1">Sugestie:</span>
        {quickPrompts.map((q, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(q)}
            disabled={isLoading}
            className="px-2.5 py-1 rounded-lg bg-[#201d2c] hover:bg-purple-900/40 border border-white/8 hover:border-purple-500/40 text-purple-200 text-[11px] whitespace-nowrap transition cursor-pointer font-mono shrink-0 shadow-sm"
          >
            {q}
          </button>
        ))}
      </div>

      {/* 5. INPUT BOX & CONTROLS */}
      <div className="p-4 border-t border-white/8 bg-[#181622]/90 shrink-0 space-y-2">
        <div className="relative flex items-center">
          <textarea
            ref={textareaRef}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Zadaj pytanie o kod, strukturę lub zawartość plików (Enter wysyła)..."
            className="w-full pl-3 pr-24 py-2.5 rounded-xl bg-[#13121a] border border-white/10 focus:border-purple-500/60 focus:bg-[#161520] text-sm text-white placeholder-[#71717a] focus:outline-none resize-none font-sans transition-all"
          />

          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              onClick={() => handleSendMessage()}
              disabled={!input.trim() || isLoading}
              className="px-3 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-md cursor-pointer"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>Wyślij</span>
            </button>
          </div>
        </div>

        {/* Local Privacy & Security Assurance */}
        <div className="flex items-center justify-between text-[10px] font-mono text-[#71717a] px-1">
          <div className="flex items-center gap-1 text-emerald-400">
            <ShieldCheck className="w-3 h-3" />
            <span>Ollama: lokalny endpoint • Zakres przesyłanych danych zależy od konfiguracji</span>
          </div>
          <span>Shift+Enter = nowa linia</span>
        </div>
      </div>

    </div>
  );
};
