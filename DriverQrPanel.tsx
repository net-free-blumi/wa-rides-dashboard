import React, { useEffect, useRef, useState } from 'react';
import { QrCode, RefreshCw, CheckCircle2, XCircle, Loader2, Square } from 'lucide-react';
import { fetchDriverQr, disconnectDriverApi, DriverQrState } from '../services/api.ts';

interface DriverQrPanelProps {
  phone: string;
  onConnected?: () => void;
}

const POLL_MS = 3000;

const STATUS_TEXT: Record<string, string> = {
  none: 'מתחיל סשן...',
  pairing_required: 'מכין חיבור ומחכה לקוד QR...',
  qr_ready: 'סרוק את הקוד עכשיו (מתרענן אוטומטית)',
  pairing_ready: 'סרוק את הקוד עכשיו (מתרענן אוטומטית)',
  connecting: 'מתחבר לוואטסאפ... (רגע לפני סיום)',
  connected: 'הוואטסאפ של הנהג מחובר בהצלחה!',
  disconnected: 'החיבור נותק. נסה להתחיל מחדש.',
};

export const DriverQrPanel: React.FC<DriverQrPanelProps> = ({ phone, onConnected }) => {
  const [active, setActive] = useState(false);
  const [state, setState] = useState<DriverQrState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const lastQrRef = useRef<string | null>(null);
  const connectedRef = useRef(false);

  // Polling: מתחיל רק אחרי לחיצה, נעצר אוטומטית בחיבור / סגירת המסך / החלפת מספר
  useEffect(() => {
    if (!active || !phone.trim()) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const res = await fetchDriverQr(phone.trim());
        if (cancelled) return;
        setError(null);
        setState(res);

        if (res.connected || res.status === 'connected') {
          if (!connectedRef.current) {
            connectedRef.current = true;
            onConnected?.();
          }
          setActive(false);
          return;
        }

        if (res.qr && res.qr !== lastQrRef.current) {
          lastQrRef.current = res.qr;
          setRefreshCount((c) => c + 1);
          if (res.qrImage) {
            setImageUrl(res.qrImage);
          } else {
            try {
              const mod: any = await import('qrcode');
              const toDataURL = mod.toDataURL || mod.default?.toDataURL;
              const url: string = await toDataURL(res.qr, { margin: 1, width: 320 });
              if (!cancelled) setImageUrl(url);
            } catch {
              if (!cancelled) setError('לא ניתן לצייר את ה-QR (חסרה חבילת qrcode באתר)');
            }
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'שגיאה בקבלת ה-QR מהשרת');
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, phone]);

  // החלפת מספר באמצע = איפוס תצוגה
  useEffect(() => {
    setActive(false);
    setState(null);
    setImageUrl(null);
    setError(null);
    setRefreshCount(0);
    lastQrRef.current = null;
    connectedRef.current = false;
  }, [phone]);

  const start = () => {
    setState(null);
    setImageUrl(null);
    setError(null);
    setRefreshCount(0);
    lastQrRef.current = null;
    connectedRef.current = false;
    setActive(true);
  };

  const stop = async () => {
    setActive(false);
    setImageUrl(null);
    try {
      await disconnectDriverApi(phone.trim());
    } catch {
      /* לא קריטי */
    }
  };

  const status = state?.status || (active ? 'none' : '');
  const connected = Boolean(state?.connected) || status === 'connected';

  return (
    <div className="space-y-3">
      {!phone.trim() && (
        <p className="text-amber-300 text-[11px]">הזן קודם את מספר הטלפון של הנהג למעלה.</p>
      )}

      {!active && !connected && (
        <button
          type="button"
          onClick={start}
          disabled={!phone.trim()}
          className="px-4 py-2 rounded-xl bg-teal-400 hover:bg-teal-300 disabled:opacity-40 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
        >
          <QrCode className="w-3.5 h-3.5" />
          הצג קוד QR לסריקה
        </button>
      )}

      {(active || state) && (
        <div className="p-4 rounded-xl bg-teal-950/30 border border-teal-500/30 text-center space-y-3">
          {connected ? (
            <div className="flex flex-col items-center gap-2 text-emerald-300 font-bold">
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              {STATUS_TEXT.connected}
            </div>
          ) : (
            <>
              <div className="mx-auto w-[240px] h-[240px] sm:w-[280px] sm:h-[280px] rounded-xl bg-white flex items-center justify-center p-2">
                {imageUrl ? (
                  <img src={imageUrl} alt="WhatsApp QR" className="w-full h-full" />
                ) : (
                  <Loader2 className="w-8 h-8 text-slate-500 animate-spin" />
                )}
              </div>
              <div className="text-[11px] text-teal-200 flex items-center justify-center gap-1.5">
                <RefreshCw className="w-3 h-3 animate-spin" />
                {STATUS_TEXT[status] || status}
                {refreshCount > 1 && <span className="text-slate-400">· התחדש {refreshCount - 1} פעמים</span>}
              </div>
              {state?.lastDisconnectReason && (
                <div className="text-[10px] text-slate-400 font-mono" dir="ltr">
                  last disconnect: {state.lastDisconnectReason}
                </div>
              )}
              <button
                type="button"
                onClick={stop}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Square className="w-3 h-3" />
                בטל וסגור סשן
              </button>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-200 text-[11px] flex items-start gap-2">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
          {error}
        </div>
      )}

      <ol className="list-decimal list-inside space-y-1 text-slate-400 text-[11px] leading-relaxed">
        <li>בטלפון של הנהג: וואטסאפ ⬅️ <strong>הגדרות</strong> ⬅️ <strong>מכשירים מקושרים</strong> ⬅️ <strong>קישור מכשיר</strong>.</li>
        <li>סרוק את הקוד שמוצג כאן (הוא מתחלף לבד כל ~20 שניות, אין צורך ללחוץ שוב).</li>
        <li>המתן להודעת "מחובר בהצלחה".</li>
      </ol>
    </div>
  );
};
