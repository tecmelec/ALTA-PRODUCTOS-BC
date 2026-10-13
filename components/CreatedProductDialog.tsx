import React, { useEffect, useRef, useState } from 'react';

export interface CreatedProductInfo {
  no: string;
  description: string;
  warning?: string;
}

interface Props {
  product: CreatedProductInfo | null;
  onClose: () => void;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Alternativa para navegadores que bloquean la API del portapapeles.
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

/** Aviso tras dar de alta un producto: muestra el código asignado y permite copiarlo. */
const CreatedProductDialog: React.FC<Props> = ({ product, onClose }) => {
  const [copied, setCopied] = useState<'idle' | 'ok' | 'error'>('idle');
  const copyButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!product) return;
    setCopied('idle');
    copyButtonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [product, onClose]);

  if (!product) return null;

  const handleCopy = async () => {
    const ok = await copyText(product.no);
    setCopied(ok ? 'ok' : 'error');
    if (ok) setTimeout(() => setCopied('idle'), 2000);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-labelledby="created-title">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl p-6">
        <h3 id="created-title" className="text-lg font-bold text-gray-800">Producto creado en Business Central</h3>
        <p className="text-sm text-gray-500 mt-1">Código asignado:</p>

        <div className="mt-3 flex items-stretch gap-2">
          <div className="flex-1 flex items-center px-4 py-3 rounded-lg bg-blue-50 border border-blue-100 font-mono text-2xl font-bold text-blue-700 select-all">
            {product.no}
          </div>
          <button
            ref={copyButtonRef}
            onClick={handleCopy}
            className={`px-4 rounded-lg font-bold text-sm min-w-[110px] focus:outline-none focus:ring-2 focus:ring-blue-300 ${
              copied === 'ok' ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {copied === 'ok' ? 'Copiado ✓' : 'Copiar código'}
          </button>
        </div>
        {copied === 'error' && (
          <p className="text-xs text-red-600 mt-2">No se pudo copiar automáticamente. Selecciona el código y pulsa Ctrl+C.</p>
        )}

        <p className="text-sm text-gray-700 uppercase mt-4">{product.description}</p>

        {product.warning && (
          <div className="mt-4 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-3 py-2">
            {product.warning} Revísalo manualmente en Business Central.
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 rounded-lg border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreatedProductDialog;
