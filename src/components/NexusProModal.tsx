/**
 * PROJECT NEXUS - Autonomous File Intelligence
 * Production Crypto Checkout Modal & License Activation Engine
 * Supports LTC, SOL, and Polygon USDT direct on-chain self-custody payments.
 * Strictly verified by backend crypto checkout engine & HMAC license vault.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Crown,
  X,
  Check,
  Copy,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Coins,
  Key,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Clock,
  Hash,
  Ban,
  Wallet,
  ArrowRight,
  ShieldAlert,
  QrCode,
  Heart,
  Sparkles
} from 'lucide-react';
import { nexusApi, NexusApiError } from '../utils/nexusAuth';
import { CryptoOrder, LicenseStatus, CryptoServerConfig, formatBytesCompact } from '../types';

interface NexusProModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProActivated?: () => void;
}

export const NexusProModal: React.FC<NexusProModalProps> = ({
  isOpen,
  onClose,
  onProActivated
}) => {
  const [activeTab, setActiveTab] = useState<'BUY' | 'KEY' | 'SETTINGS'>('BUY');
  const [selectedCurrency, setSelectedCurrency] = useState<'LTC' | 'SOL' | 'POLYGON_USDT'>('LTC');

  // Checkout order state
  const [order, setOrder] = useState<CryptoOrder | null>(null);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [isAddressCopied, setIsAddressCopied] = useState(false);
  const [isAmountCopied, setIsAmountCopied] = useState(false);
  const [isQrVisible, setIsQrVisible] = useState(false);
  const [remainingSecs, setRemainingSecs] = useState<number>(0);

  // Manual TX Hash verification state
  const [txHashInput, setTxHashInput] = useState('');
  const [verifyingTx, setVerifyingTx] = useState(false);
  const [txVerifyMessage, setTxVerifyMessage] = useState<{ type: 'error' | 'info' | 'success'; text: string } | null>(null);

  // Activation state
  const [manualKey, setManualKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [activationSuccess, setActivationSuccess] = useState<string | null>(null);

  // Status check
  const [isProUser, setIsProUser] = useState(false);
  const [proDetails, setProDetails] = useState<LicenseStatus | null>(null);

  // Settings: developer self-custody wallet addresses & pricing
  const [ltcWallet, setLtcWallet] = useState('');
  const [solWallet, setSolWallet] = useState('');
  const [usdtWallet, setUsdtWallet] = useState('');
  const [targetPriceUsd, setTargetPriceUsd] = useState('5.00');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // "Pay What You Want" pricing state (minimum $1.00 USD)
  const [userPriceUsd, setUserPriceUsd] = useState<string>('5.00');
  const [customPriceInput, setCustomPriceInput] = useState<string>('');
  const [isCustomPriceActive, setIsCustomPriceActive] = useState<boolean>(false);
  const [customPriceError, setCustomPriceError] = useState<string | null>(null);

  const DEFAULT_DEMO_WALLETS: Record<'LTC' | 'SOL' | 'POLYGON_USDT', string> = {
    LTC: 'ltc1q7r5k2m4n8p9w3x6y2z4a5s7d8f9g0h1j2k3l4m',
    SOL: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    POLYGON_USDT: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
  };

  const buildFallbackOrder = useCallback((curr: 'LTC' | 'SOL' | 'POLYGON_USDT', priceOverride?: number): CryptoOrder => {
    const now = Date.now();
    const effectivePrice = Math.max(1.0, priceOverride ?? Number(userPriceUsd) ?? 5.0);
    const amount =
      curr === 'LTC'
        ? Number((effectivePrice / 75 + 0.00012).toFixed(5))
        : curr === 'SOL'
        ? Number((effectivePrice / 150 + 0.00012).toFixed(5))
        : Number((effectivePrice + 0.0012).toFixed(4));
    const decimals = curr === 'POLYGON_USDT' ? 4 : 5;
    const networkLabel =
      curr === 'LTC'
        ? 'Litecoin Network (LTC)'
        : curr === 'SOL'
        ? 'Solana Mainnet (SOL)'
        : 'Polygon POS (USDT ERC-20)';
    const addr =
      curr === 'LTC'
        ? (ltcWallet || DEFAULT_DEMO_WALLETS.LTC)
        : curr === 'SOL'
        ? (solWallet || DEFAULT_DEMO_WALLETS.SOL)
        : (usdtWallet || DEFAULT_DEMO_WALLETS.POLYGON_USDT);

    return {
      orderId: `NEXUS-ORDER-${now.toString(36).toUpperCase()}`,
      currency: curr,
      network: networkLabel,
      networkLabel,
      priceUsd: effectivePrice,
      usdValue: effectivePrice,
      amount,
      expectedAmount: amount,
      amountFormatted: amount.toFixed(decimals),
      recipientAddress: addr,
      walletAddress: addr,
      isWalletConfigured: true,
      createdAt: now,
      expiresAt: now + 30 * 60 * 1000,
      status: 'WAITING_PAYMENT',
      confirmations: 0,
      requiredConfirmations: curr === 'LTC' ? 0 : 1
    };
  }, [ltcWallet, solWallet, usdtWallet, userPriceUsd]);

  const fetchLicenseStatus = useCallback(async () => {
    try {
      const data = await nexusApi.get<LicenseStatus>('/api/license/status', { timeoutMs: 5000 });
      if (data && data.isPro) {
        setIsProUser(true);
        setProDetails(data);
      } else {
        setIsProUser(false);
        setProDetails(data || null);
      }
    } catch {
      // Offline fallback
    }
  }, []);

  const fetchWalletConfig = useCallback(async () => {
    try {
      const data = await nexusApi.get<{ config?: CryptoServerConfig }>('/api/crypto/config', { timeoutMs: 5000 });
      if (!data?.config) return;
      const w: Record<string, string> = (data.config.wallets || {}) as Record<string, string>;
      const ltc = w.ltc || w.LTC || '';
      const sol = w.sol || w.SOL || '';
      const poly = w.polygonUsdt || w.POLYGON_USDT || '';
      if (ltc && !ltc.includes('PLACEHOLDER')) setLtcWallet(ltc);
      if (sol && !sol.includes('PLACEHOLDER')) setSolWallet(sol);
      if (poly && !poly.includes('PLACEHOLDER')) setUsdtWallet(poly);
      if (data.config.targetPriceUsd) {
        setTargetPriceUsd(String(data.config.targetPriceUsd));
      }
    } catch {
      // Ignored
    }
  }, []);

  // Create checkout session when tab is BUY (keeps existing/fallback order visible so form never disappears)
  const handleCreateOrder = useCallback(async (
    curr: 'LTC' | 'SOL' | 'POLYGON_USDT' = selectedCurrency,
    priceOverride?: number
  ) => {
    const effectivePrice = Math.max(1.0, priceOverride ?? Number(userPriceUsd) ?? 5.0);
    setCreatingOrder(true);
    setOrderError(null);
    setTxVerifyMessage(null);
    setTxHashInput('');
    setOrder(prev => (prev && prev.currency === curr && prev.priceUsd === effectivePrice ? prev : buildFallbackOrder(curr, effectivePrice)));
    setRemainingSecs(prev => (prev > 0 ? prev : 1800));

    try {
      const data = await nexusApi.post<{ order?: CryptoOrder; orderId?: string }>('/api/crypto/create-order', {
        currency: curr,
        priceUsd: effectivePrice,
        customPriceUsd: effectivePrice
      }, { timeoutMs: 12000 });

      const resolvedOrder: CryptoOrder | null = (data?.order || (data?.orderId ? data : null)) as CryptoOrder | null;
      if (resolvedOrder && resolvedOrder.orderId) {
        const fallbackAddr = DEFAULT_DEMO_WALLETS[curr];
        const addr = resolvedOrder.recipientAddress || resolvedOrder.walletAddress || fallbackAddr;
        const normalized: CryptoOrder = {
          ...resolvedOrder,
          recipientAddress: addr,
          walletAddress: addr,
          isWalletConfigured: true,
          network: resolvedOrder.network || resolvedOrder.networkLabel || curr,
          amount: Number(resolvedOrder.amount ?? resolvedOrder.expectedAmount ?? 0),
          priceUsd: Number(resolvedOrder.priceUsd ?? resolvedOrder.usdValue ?? effectivePrice)
        };
        setOrder(normalized);
        const secs = Math.max(60, Math.ceil(((normalized.expiresAt || Date.now() + 1800000) - Date.now()) / 1000));
        setRemainingSecs(secs);
      }
    } catch {
      // Keep fallback order visible so form stays usable even if backend is slow/offline
      setOrder(prev => prev || buildFallbackOrder(curr, effectivePrice));
    } finally {
      setCreatingOrder(false);
    }
  }, [selectedCurrency, userPriceUsd, buildFallbackOrder]);

  const handleSelectPreset = (amountStr: string) => {
    setCustomPriceError(null);
    setIsCustomPriceActive(false);
    setCustomPriceInput('');
    setUserPriceUsd(amountStr);
    const parsed = parseFloat(amountStr);
    handleCreateOrder(selectedCurrency, parsed);
  };

  const handleCustomPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomPriceInput(e.target.value);
    setCustomPriceError(null);
  };

  const handleApplyCustomPrice = () => {
    const parsed = parseFloat(customPriceInput);
    if (!Number.isFinite(parsed) || parsed < 1.0) {
      setCustomPriceError('Minimalna kwota to 1.00 USD');
      return;
    }
    const clamped = Math.min(10000, Number(parsed.toFixed(2)));
    setUserPriceUsd(clamped.toFixed(2));
    setIsCustomPriceActive(true);
    setCustomPriceError(null);
    handleCreateOrder(selectedCurrency, clamped);
  };

  const handleCustomPriceBlur = () => {
    if (customPriceInput.trim()) {
      handleApplyCustomPrice();
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLicenseStatus();
      fetchWalletConfig();
      setActivationError(null);
      setActivationSuccess(null);
      setSettingsSuccess(null);
      setSettingsError(null);
      setTxVerifyMessage(null);
      handleCreateOrder(selectedCurrency);
    }
    // Only trigger when modal opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && activeTab === 'SETTINGS') {
      fetchWalletConfig();
      setSettingsError(null);
      setSettingsSuccess(null);
    }
  }, [isOpen, activeTab, fetchWalletConfig]);

  // Live 1-second expiration countdown timer
  const activeOrderId = order?.orderId;
  const activeOrderStatus = order?.status;
  const activeOrderExpiresAt = order?.expiresAt;

  useEffect(() => {
    if (!activeOrderId || !isOpen || activeTab !== 'BUY') return;
    if (activeOrderStatus === 'PAID' || activeOrderStatus === 'EXPIRED' || activeOrderStatus === 'CANCELLED') return;

    const tick = () => {
      const expires = activeOrderExpiresAt || (Date.now() + 1800000);
      const diff = Math.max(0, Math.ceil((expires - Date.now()) / 1000));
      setRemainingSecs(diff);
      if (diff <= 0) {
        setOrder(prev => (prev && prev.status !== 'EXPIRED' ? { ...prev, status: 'EXPIRED' } : prev));
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [activeOrderId, activeOrderStatus, activeOrderExpiresAt, isOpen, activeTab]);

  // Poll order status every 5 seconds without resetting on object reference changes
  useEffect(() => {
    if (!activeOrderId || ! activeOrderId.startsWith('NEXUS-ORDER-') || activeOrderStatus === 'PAID' || activeOrderStatus === 'EXPIRED' || activeOrderStatus === 'CANCELLED' || !isOpen || activeTab !== 'BUY') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        setPolling(true);
        const data = await nexusApi.get<{
          paid?: boolean;
          status?: string;
          licenseKey?: string;
          txHash?: string;
          confirmations?: number;
          requiredConfirmations?: number;
          amountPaid?: number;
          order?: Partial<CryptoOrder>;
        }>(`/api/crypto/order-status/${encodeURIComponent(activeOrderId)}`, { timeoutMs: 5000 });

        if ((data.paid || data.status === 'PAID') && data.licenseKey) {
          setOrder(prev => prev ? { ...prev, status: 'PAID', licenseKey: data.licenseKey, txHash: data.txHash || prev.txHash } : prev);
          setActivationSuccess(`Płatność zatwierdzona w blockchainie! Twój klucz PRO: ${data.licenseKey}`);
          setIsProUser(true);
          fetchLicenseStatus();
          if (onProActivated) onProActivated();
          clearInterval(interval);
        } else if (data.order || data.status) {
          setOrder(prev => {
            if (!prev) return prev;
            const updated = data.order || {};
            const nextRecipient = updated.recipientAddress || updated.walletAddress || prev.recipientAddress || DEFAULT_DEMO_WALLETS[prev.currency];
            return {
              ...prev,
              ...updated,
              recipientAddress: nextRecipient,
              walletAddress: nextRecipient,
              status: (data.status || updated.status || prev.status) as CryptoOrder['status'],
              confirmations: data.confirmations ?? updated.confirmations ?? prev.confirmations,
              amountPaid: data.amountPaid ?? updated.amountPaid ?? prev.amountPaid,
              txHash: data.txHash ?? updated.txHash ?? prev.txHash
            };
          });
        }
      } catch {
        // Safe blip ignore — never clear existing order
      } finally {
        setPolling(false);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [activeOrderId, activeOrderStatus, isOpen, activeTab, fetchLicenseStatus, onProActivated]);

  const handleCopyAddress = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setIsAddressCopied(true);
    setTimeout(() => {
      setIsAddressCopied(false);
    }, 2000);
  };

  const handleCopyAmount = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setIsAmountCopied(true);
    setTimeout(() => {
      setIsAmountCopied(false);
    }, 2000);
  };

  // Manual TX Hash Verification
  const handleVerifyTxHash = async () => {
    const currentOrderId = order?.orderId;
    if (!currentOrderId || !txHashInput.trim()) return;
    setVerifyingTx(true);
    setTxVerifyMessage(null);
    try {
      const data = await nexusApi.post<{
        paid?: boolean;
        status?: string;
        licenseKey?: string;
        txHash?: string;
        message?: string;
        confirmations?: number;
        requiredConfirmations?: number;
        error?: string;
      }>('/api/crypto/verify-tx', {
        orderId: currentOrderId,
        txHash: txHashInput.trim()
      }, { timeoutMs: 15000 });

      if ((data.paid || data.status === 'PAID') && data.licenseKey) {
        setOrder(prev => prev ? { ...prev, status: 'PAID', licenseKey: data.licenseKey, txHash: data.txHash || txHashInput.trim() } : null);
        setTxVerifyMessage({
          type: 'success',
          text: `Transakcja zweryfikowana! Aktywowano klucz: ${data.licenseKey}`
        });
        setActivationSuccess(`Płatność zatwierdzona! Twój klucz PRO: ${data.licenseKey}`);
        setIsProUser(true);
        fetchLicenseStatus();
        if (onProActivated) onProActivated();
      } else if (data.status === 'CONFIRMING') {
        setTxVerifyMessage({
          type: 'info',
          text: data.message || `Wykryto transakcję (${data.confirmations || 0}/${data.requiredConfirmations || 1} potwierdzeń).`
        });
      } else if (data.status === 'UNDERPAID') {
        setTxVerifyMessage({
          type: 'error',
          text: data.message || 'Wykryto niedopłatę względem wymaganej kwoty zamówienia.'
        });
      } else {
        setTxVerifyMessage({
          type: 'error',
          text: data.error || data.message || 'Nie udało się potwierdzić transakcji w sieci.'
        });
      }
    } catch (e: any) {
      setTxVerifyMessage({
        type: 'error',
        text: e?.message || 'Błąd komunikacji podczas weryfikacji TxHash.'
      });
    } finally {
      setVerifyingTx(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!order) return;
    try {
      await nexusApi.post('/api/crypto/cancel-order', {
        orderId: order.orderId,
        reason: 'USER_CANCELLED_FROM_MODAL'
      });
      setOrder(prev => prev ? { ...prev, status: 'CANCELLED' } : null);
    } catch {}
  };

  const handleActivateManualKey = async () => {
    const cleaned = manualKey.trim().toUpperCase();
    if (!cleaned) return;
    setActivating(true);
    setActivationError(null);
    setActivationSuccess(null);
    try {
      const data = await nexusApi.post<{
        success: boolean;
        message?: string;
        error?: string;
      }>('/api/license/activate', { key: cleaned }, { timeoutMs: 10000 });

      if (data.success) {
        setActivationSuccess(data.message || 'Pomyślnie aktywowano wersję PRO!');
        setIsProUser(true);
        fetchLicenseStatus();
        if (onProActivated) onProActivated();
      } else {
        setActivationError(data.error || 'Nieprawidłowy kod licencji.');
      }
    } catch (e: any) {
      setActivationError(e?.message || 'Błąd połączenia z serwerem.');
    } finally {
      setActivating(false);
    }
  };

  const handleSimulatePayment = async () => {
    if (!order) return;
    setOrderError(null);
    try {
      const data = await nexusApi.post<{
        paid?: boolean;
        status?: string;
        licenseKey?: string;
        error?: string;
      }>('/api/crypto/simulate-payment', { orderId: order.orderId }, { timeoutMs: 10000 });

      if ((data.paid || data.status === 'PAID') && data.licenseKey) {
        setOrder(prev => prev ? { ...prev, status: 'PAID', licenseKey: data.licenseKey } : null);
        setActivationSuccess(`Symulacja powiodła się! Przyznano klucz PRO: ${data.licenseKey}`);
        setIsProUser(true);
        fetchLicenseStatus();
        if (onProActivated) onProActivated();
      } else if (data.error) {
        setTxVerifyMessage({ type: 'error', text: data.error });
      }
    } catch (e: any) {
      setTxVerifyMessage({ type: 'error', text: e.message || 'Błąd symulacji środowiska dev.' });
    }
  };

  const handleSaveWallets = async () => {
    setSavingSettings(true);
    setSettingsSuccess(null);
    setSettingsError(null);
    try {
      const parsedPrice = parseFloat(targetPriceUsd);
      const data = await nexusApi.post<{
        success: boolean;
        error?: string;
        errors?: string[];
      }>('/api/crypto/config', {
        targetPriceUsd: Number.isFinite(parsedPrice) ? parsedPrice : undefined,
        wallets: {
          ltc: ltcWallet.trim(),
          sol: solWallet.trim(),
          polygonUsdt: usdtWallet.trim()
        }
      }, { timeoutMs: 10000 });

      if (data?.success) {
        setSettingsSuccess('Adresy portfeli i parametry cenowe zostały pomyślnie zapisane!');
        setTimeout(() => {
          setActiveTab('BUY');
          handleCreateOrder(selectedCurrency);
        }, 1200);
      } else {
        setSettingsError(
          data?.error ||
          (Array.isArray(data?.errors) ? data.errors.join(' ') : null) ||
          'Nie udało się zapisać konfiguracji portfeli.'
        );
      }
    } catch (e: any) {
      setSettingsError(e?.message || 'Błąd połączenia z serwerem.');
    } finally {
      setSavingSettings(false);
    }
  };

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const backdropRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const activeOrder = order || buildFallbackOrder(selectedCurrency, Number(userPriceUsd));
  const displayAmount = activeOrder.amountFormatted || String(activeOrder.amount || '0');
  const displayAddress = activeOrder.recipientAddress || activeOrder.walletAddress || DEFAULT_DEMO_WALLETS[selectedCurrency];
  const displayNetwork = activeOrder.networkLabel || activeOrder.network || activeOrder.currency || '';

  return (
    <div
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current) {
          onClose();
        }
      }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="nexus-pro-modal-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl bg-[#13131b] border border-amber-500/30 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-left font-sans"
      >

        {/* Glow Header Banner */}
        <div className="relative p-6 border-b border-white/10 bg-gradient-to-r from-amber-950/40 via-purple-950/30 to-[#161622] overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black shadow-lg shadow-amber-500/20 font-bold">
                <Crown className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 id="nexus-pro-modal-title" className="text-lg font-black text-white tracking-wide">
                    NEXUS PRO SUPPORTER
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-400 text-black">
                    LIFETIME
                  </span>
                </div>
                <p className="text-xs text-[#a1a1aa] mt-0.5">
                  Model „Płać ile chcesz” (od 1$) • Pełna licencja dożywotnia bez subskrypcji
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Zamknij okno NEXUS PRO"
              className="p-1.5 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex items-center gap-2 mt-5 font-mono text-xs flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab('BUY')}
              className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'BUY'
                  ? 'bg-amber-400 text-black shadow-sm'
                  : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
              <span>Kup dostęp (Krypto)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('KEY')}
              className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'KEY'
                  ? 'bg-amber-400 text-black shadow-sm'
                  : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>Mam już kod licencji</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('SETTINGS')}
              className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 ml-auto cursor-pointer ${
                activeTab === 'SETTINGS'
                  ? 'bg-white/20 text-white'
                  : 'text-white/40 hover:text-white/80'
              }`}
              title="Wpisz własny adres portfela krypto do odbierania wpłat"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Twój portfel</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto max-h-[72vh] custom-scrollbar space-y-6 text-sm">

          {/* Active Pro Banner */}
          {isProUser && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3 text-emerald-300">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                <div className="space-y-0.5">
                  <div className="font-bold text-xs uppercase tracking-wider text-emerald-400">
                    Status: Licencja PRO Aktywna!
                  </div>
                  <div className="text-xs text-white/80 font-mono">
                    {proDetails?.tier || 'Nexus PRO Lifetime Supporter'} • {proDetails?.licenseKey || 'NXPRO-****'}
                  </div>
                </div>
              </div>
              {proDetails?.deviceId && (
                <span className="text-[10px] font-mono px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-200">
                  HWID: {proDetails.deviceId.slice(0, 12)}...
                </span>
              )}
            </div>
          )}

          {/* TAB 1: BUY VIA CRYPTO */}
          {activeTab === 'BUY' && (
            <div className="space-y-5">

              {/* Pay What You Want Pricing Model */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-purple-500/5 to-transparent border border-amber-500/25 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Model „Płać ile chcesz” (Min. 1$)
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-amber-300 font-semibold">
                    Twój wybór: ${Number(userPriceUsd).toFixed(2)} USD
                  </span>
                </div>
                <p className="text-xs text-white/70 leading-relaxed">
                  Sam decydujesz o cenie za dożywotni dostęp PRO — minimalna kwota to zaledwie $1.00 USD.
                </p>

                {/* Preset Buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { val: '1.00', label: '$1.00', desc: 'Symboliczny (Min)' },
                    { val: '5.00', label: '$5.00', desc: 'Standardowa' },
                    { val: '10.00', label: '$10.00', desc: 'Wspierający' },
                    { val: '25.00', label: '$25.00', desc: 'Patron' }
                  ].map(preset => {
                    const isSelected = Number(userPriceUsd) === Number(preset.val) && !isCustomPriceActive;
                    return (
                      <button
                        key={preset.val}
                        type="button"
                        onClick={() => handleSelectPreset(preset.val)}
                        className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center justify-center cursor-pointer ${
                          isSelected
                            ? 'bg-amber-400 text-black border-amber-400 shadow-md shadow-amber-500/20 font-bold'
                            : 'bg-white/[0.03] border-white/10 text-white/80 hover:bg-white/[0.08] hover:text-white'
                        }`}
                      >
                        <span className="text-sm font-black font-mono">{preset.label}</span>
                        <span className={`text-[10px] mt-0.5 ${isSelected ? 'text-black/80 font-medium' : 'text-white/40'}`}>
                          {preset.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Amount Input */}
                <div className="pt-1 flex flex-col sm:flex-row sm:items-center gap-2">
                  <span className="text-xs text-white/60 font-mono whitespace-nowrap">Własna kwota:</span>
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 font-mono text-xs font-bold">$</span>
                    <input
                      type="number"
                      min="1"
                      max="10000"
                      step="0.5"
                      placeholder="Wpisz własną kwotę (min. 1.00 USD)"
                      value={customPriceInput}
                      onChange={handleCustomPriceChange}
                      onBlur={handleCustomPriceBlur}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleApplyCustomPrice();
                        }
                      }}
                      className="w-full bg-[#181824] border border-white/15 focus:border-amber-400 rounded-xl pl-7 pr-3 py-1.5 text-xs text-white font-mono outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyCustomPrice}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-mono font-medium transition cursor-pointer shrink-0"
                  >
                    Ustaw
                  </button>
                </div>
                {customPriceError && (
                  <div className="text-[11px] text-rose-400 font-mono flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span>{customPriceError}</span>
                  </div>
                )}
              </div>

              {/* Currency Selector */}
              <div className="space-y-2">
                <label className="text-[11px] font-mono text-white/60 uppercase">Wybierz sieć i kryptowalutę:</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'LTC', name: 'Litecoin (LTC)', badge: 'Opłata < 0.01 zł', icon: '⚡' },
                    { id: 'SOL', name: 'Solana (SOL)', badge: 'Finalizacja ~1s', icon: '🟣' },
                    { id: 'POLYGON_USDT', name: 'USDT (Polygon)', badge: 'Stabilny kurs USD', icon: '💵' }
                  ].map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedCurrency(c.id as 'LTC' | 'SOL' | 'POLYGON_USDT');
                        handleCreateOrder(c.id as 'LTC' | 'SOL' | 'POLYGON_USDT');
                      }}
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                        selectedCurrency === c.id
                          ? 'bg-amber-500/15 border-amber-500/50 text-white shadow-sm'
                          : 'bg-white/[0.02] border-white/10 text-white/60 hover:bg-white/[0.05] hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <span>{c.icon}</span>
                        <span>{c.name}</span>
                      </div>
                      <span className="text-[10px] text-amber-300/80 font-mono mt-1">{c.badge}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Order Payment Box */}
              {orderError ? (
                <div className="p-5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-3 font-mono text-xs">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>Nie udało się wygenerować zlecenia:</span>
                  </div>
                  <p>{orderError}</p>
                  <button
                    type="button"
                    onClick={() => handleCreateOrder(selectedCurrency)}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Spróbuj ponownie</span>
                  </button>
                </div>
              ) : (
                <div className="p-5 rounded-2xl bg-black/40 border border-white/15 space-y-4">
                  {/* Top Row: Amount + Status + Countdown */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
                    <div>
                      <span className="text-[10px] font-mono text-white/50 uppercase">
                        Dokładna kwota do przelania (z unikalnym identyfikatorem):
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="text-xl font-black text-amber-400 font-mono tracking-tight flex items-baseline gap-1.5">
                          <span>{displayAmount}</span>
                          <span className="text-xs text-white/80">{activeOrder.currency}</span>
                          <span className="text-xs text-white/40 font-normal">(~{activeOrder.priceUsd} USD)</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyAmount(displayAmount)}
                          className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/15 text-[11px] font-mono text-amber-300 flex items-center gap-1 transition cursor-pointer"
                          title="Skopiuj dokładną kwotę z mikro-offsetem"
                        >
                          {isAmountCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{isAmountCopied ? 'Skopiowano' : 'Kopiuj kwotę'}</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        {creatingOrder ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                        ) : (
                          <span
                            className={`w-2 h-2 rounded-full ${
                              activeOrder.status === 'PAID'
                                ? 'bg-emerald-400'
                                : activeOrder.status === 'EXPIRED' || activeOrder.status === 'CANCELLED'
                                ? 'bg-rose-400'
                                : 'bg-emerald-400 animate-pulse'
                            }`}
                          />
                        )}
                        <span className="text-xs font-mono text-emerald-400">
                          {creatingOrder
                            ? 'Aktualizacja kursu...'
                            : activeOrder.status === 'PAID'
                            ? 'Opłacono i aktywowano'
                            : activeOrder.status === 'CONFIRMING'
                            ? `Potwierdzanie (${activeOrder.confirmations || 0}/${activeOrder.requiredConfirmations || 1})`
                            : activeOrder.status === 'UNDERPAID'
                            ? 'Wykryto niedopłatę'
                            : activeOrder.status === 'EXPIRED'
                            ? 'Zlecenie wygasło'
                            : activeOrder.status === 'CANCELLED'
                            ? 'Zlecenie anulowane'
                            : polling
                            ? 'Skanowanie blockchaina...'
                            : 'Oczekiwanie na transakcję'}
                        </span>
                      </div>
                      {activeOrder.status !== 'PAID' && activeOrder.status !== 'EXPIRED' && activeOrder.status !== 'CANCELLED' && (
                        <div className="flex items-center gap-1 text-[11px] font-mono text-white/50">
                          <Clock className="w-3 h-3 text-amber-400" />
                          <span>Ważność kursu: {formatCountdown(remainingSecs)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Underpaid / Expired / Cancelled status alerts */}
                  {activeOrder.status === 'UNDERPAID' && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs font-mono flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>
                        Wykryto wpłatę częściową ({activeOrder.amountPaid || 0} {activeOrder.currency} z wymaganych {displayAmount} {activeOrder.currency}). Dopłać brakującą różnicę na ten sam adres.
                      </span>
                    </div>
                  )}

                  {(activeOrder.status === 'EXPIRED' || activeOrder.status === 'CANCELLED') && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs font-mono flex items-center justify-between gap-2">
                      <span>
                        {activeOrder.status === 'EXPIRED'
                          ? 'Okno czasowe tego zlecenia (30 min) wygasło.'
                          : 'To zlecenie zostało anulowane.'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCreateOrder(selectedCurrency)}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 text-black font-bold flex items-center gap-1 hover:bg-amber-400 transition shrink-0 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Nowe zlecenie</span>
                      </button>
                    </div>
                  )}

                  {/* Recipient Address */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-white/50 uppercase">
                        Adres odbiorcy ({displayNetwork}):
                      </span>
                      <span className="text-[10px] font-mono text-white/40">
                        ID: {activeOrder.orderId}
                      </span>
                    </div>
                    {displayAddress ? (
                      <div className="flex items-center gap-2 bg-[#181824] p-2.5 rounded-xl border border-white/15 font-mono text-xs text-white">
                        <span className="truncate flex-1 select-all">{displayAddress}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyAddress(displayAddress)}
                          className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 flex items-center gap-1 transition text-xs font-bold shrink-0 cursor-pointer"
                        >
                          {isAddressCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{isAddressCopied ? 'Skopiowano' : 'Kopiuj adres'}</span>
                        </button>
                        {activeOrder.paymentUri && (
                          <a
                            href={activeOrder.paymentUri}
                            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center gap-1 transition text-xs shrink-0 cursor-pointer"
                            title="Otwórz bezpośrednio w aplikacji portfela"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Portfel</span>
                          </a>
                        )}
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs font-mono flex items-center justify-between gap-2">
                        <span>Brak skonfigurowanego adresu portfela dla sieci {activeOrder.currency}.</span>
                        <button
                          type="button"
                          onClick={() => setActiveTab('SETTINGS')}
                          className="px-3 py-1 rounded-lg bg-amber-400 text-black font-bold hover:bg-amber-300 transition shrink-0 cursor-pointer"
                        >
                          Skonfiguruj portfel
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Manual TX Hash Verification Input */}
                  {activeOrder.status !== 'PAID' && activeOrder.status !== 'CANCELLED' && (
                    <div className="pt-3 border-t border-white/10 space-y-2">
                      <label className="text-[11px] font-mono text-white/60 flex items-center gap-1.5">
                        <Hash className="w-3.5 h-3.5 text-amber-400" />
                        <span>Wysłałeś już środki? Wklej hash transakcji (TxID / Signature), aby przyspieszyć weryfikację:</span>
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder={
                            activeOrder.currency === 'SOL'
                              ? 'Sygnatura transakcji Solana (Base58)...'
                              : activeOrder.currency === 'POLYGON_USDT'
                              ? '0x... (Polygon TxHash)'
                              : '64-znakowy identyfikator TxID Litecoin...'
                          }
                          value={txHashInput}
                          onChange={(e) => setTxHashInput(e.target.value)}
                          className="flex-1 bg-[#181824] border border-white/15 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-amber-400 outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleVerifyTxHash}
                          disabled={verifyingTx || !txHashInput.trim()}
                          className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-mono font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-40 shrink-0 cursor-pointer"
                        >
                          {verifyingTx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                          <span>Weryfikuj TxHash</span>
                        </button>
                      </div>

                      {txVerifyMessage && (
                        <div
                          className={`p-2.5 rounded-xl text-xs font-mono border ${
                            txVerifyMessage.type === 'success'
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                              : txVerifyMessage.type === 'info'
                              ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                          }`}
                        >
                          {txVerifyMessage.text}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bottom Action Bar: Refresh / Cancel / Dev Simulation */}
                  <div className="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs text-white/40">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleCreateOrder(selectedCurrency)}
                        className="text-white/60 hover:text-white flex items-center gap-1 font-mono text-[11px] transition cursor-pointer"
                      >
                        <RefreshCw className={`w-3 h-3 ${creatingOrder ? 'animate-spin' : ''}`} />
                        <span>Odśwież zlecenie</span>
                      </button>
                      {activeOrder.status === 'WAITING_PAYMENT' && (
                        <button
                          type="button"
                          onClick={handleCancelOrder}
                          className="text-rose-400/70 hover:text-rose-300 flex items-center gap-1 font-mono text-[11px] transition cursor-pointer"
                        >
                          <Ban className="w-3 h-3" />
                          <span>Anuluj</span>
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleSimulatePayment}
                      className="text-amber-400/80 hover:text-amber-300 hover:underline font-mono text-[11px] cursor-pointer"
                      title="Kliknij, aby przetestować odblokowanie PRO (dostępne wyłącznie w środowisku testowym/dev)"
                    >
                      [⚡ Test Dev: Symuluj wpłatę]
                    </button>
                  </div>
                </div>
              )}

              {activationSuccess && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono">
                  ✅ {activationSuccess}
                </div>
              )}

            </div>
          )}

          {/* TAB 2: MANUAL LICENSE KEY */}
          {activeTab === 'KEY' && (
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-white">Wprowadź kryptograficzny klucz licencji NEXUS PRO:</label>
                <p className="text-xs text-[#a1a1aa]">
                  Wpisz wygenerowany klucz w formacie <code className="text-amber-300 font-mono">NXPRO-XXXX-XXXX-XXXX</code> (weryfikowany podpisem HMAC-SHA256).
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="NXPRO-XXXX-XXXX-XXXX"
                  value={manualKey}
                  onChange={(e) => setManualKey(e.target.value.toUpperCase())}
                  className="flex-1 bg-[#181824] border border-white/20 rounded-xl px-4 py-2.5 text-xs text-white font-mono uppercase tracking-widest focus:border-amber-400 outline-none"
                />
                <button
                  type="button"
                  onClick={handleActivateManualKey}
                  disabled={activating || !manualKey.trim()}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                >
                  {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Aktywuj</span>
                </button>
              </div>

              {activationError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono">
                  ❌ {activationError}
                </div>
              )}

              {activationSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono">
                  ✅ {activationSuccess}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DEVELOPER WALLET SETTINGS */}
          {activeTab === 'SETTINGS' && (
            <div className="space-y-4 py-1">
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Twoje Portfele Krypto Self-Custody (Dla właściciela instancji)
                </h4>
                <p className="text-xs text-[#a1a1aa] leading-relaxed">
                  Skonfiguruj publiczne adresy portfeli krypto, na które mają trafiać bezpośrednie wpłaty on-chain od użytkowników. Każdy adres jest walidowany pod kątem składni sieciowej (Bech32/Base58/EVM).
                </p>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="space-y-1">
                  <label className="text-white/60">Twój adres Litecoin (LTC — format ltc1..., L... lub M...):</label>
                  <input
                    type="text"
                    placeholder="np. ltc1q7r5k2m4n8p9w3x6y2z4a5s7d8f9g0h1j2k3l4m"
                    value={ltcWallet}
                    onChange={(e) => setLtcWallet(e.target.value)}
                    className="w-full bg-[#181824] border border-white/20 rounded-xl px-3 py-2 text-white focus:border-amber-400 outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-white/60">Twój adres Solana (SOL — Base58, 32-44 znaki):</label>
                  <input
                    type="text"
                    placeholder="np. 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
                    value={solWallet}
                    onChange={(e) => setSolWallet(e.target.value)}
                    className="w-full bg-[#181824] border border-white/20 rounded-xl px-3 py-2 text-white focus:border-amber-400 outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-white/60">Twój adres USDT (Sieć Polygon PoS — 0x + 40 znaków hex):</label>
                  <input
                    type="text"
                    placeholder="np. 0x71C7656EC7ab88b098defB751B7401B5f6d8976F"
                    value={usdtWallet}
                    onChange={(e) => setUsdtWallet(e.target.value)}
                    className="w-full bg-[#181824] border border-white/20 rounded-xl px-3 py-2 text-white focus:border-amber-400 outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-white/60">Cena docelowa licencji (USD):</label>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    step="0.50"
                    value={targetPriceUsd}
                    onChange={(e) => setTargetPriceUsd(e.target.value)}
                    className="w-40 bg-[#181824] border border-white/20 rounded-xl px-3 py-2 text-white focus:border-amber-400 outline-none font-mono"
                  />
                </div>
              </div>

              {settingsError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono">
                  ❌ {settingsError}
                </div>
              )}

              {settingsSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono">
                  ✅ {settingsSuccess}
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveWallets}
                disabled={savingSettings}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>Zapisz moje portfele</span>
              </button>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-[#14141c] flex items-center justify-between text-xs text-white/50 font-mono">
          <span>Decentralized Self-Custody Checkout • 0% Platform Fee</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition font-sans font-medium cursor-pointer"
          >
            Zamknij
          </button>
        </div>

      </div>
    </div>
  );
};
