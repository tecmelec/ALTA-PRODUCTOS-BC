
import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  ProductType, 
  CostingMethod, 
  Product,
  Manufacturer,
  ItemCategory,
  ExternalProduct
} from '../types';

interface ProductFormProps {
  onSave: (product: Product) => void;
  onCancel: () => void;
  existingProducts: Product[];
  externalProducts: ExternalProduct[];
  manufacturers: Manufacturer[];
  categories: ItemCategory[];
  units: string[];
  isAdmin: boolean;
}

interface GroundingSource {
  title: string;
  uri: string;
}

// Fixed: Removed local aistudio declaration to avoid conflict with global AIStudio type provided by the environment.
// We will use (window as any).aistudio for access as per guidelines.

const ProductForm: React.FC<ProductFormProps> = ({ 
  onSave, 
  onCancel, 
  existingProducts,
  externalProducts,
  manufacturers,
  categories,
  units,
  isAdmin
}) => {
  const [step, setStep] = useState(1);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [groundingSources, setGroundingSources] = useState<GroundingSource[]>([]);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  
  const [formData, setFormData] = useState<Partial<Product>>({
    type: ProductType.FABRICANTE,
    baseUnitOfMeasure: units[0] || 'UD',
    inventoryPostingGroup: 'MERCADERÍA', 
    genProdPostingGroup: 'MERCADERÍA',
    vatProdPostingGroup: 'IVA21',        
    costingMethod: CostingMethod.FIFO,
    unitPrice: 0,
    unitCost: 0,
    dimensionCode: 'GASTOS',            
    dimensionValueCode: 'MATERIAL',
    valuePosting: 'Mismo código',
    description: ''
  });

  const [manufacturerRef, setManufacturerRef] = useState('');
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [categoryTouched, setCategoryTouched] = useState(false);

  useEffect(() => {
    let prefix = '';
    if (formData.type === ProductType.FABRICANTE && formData.manufacturerCode) {
      prefix = formData.manufacturerCode.substring(0, 3).toUpperCase();
    } else if (formData.type === ProductType.GENERICO && formData.itemCategoryCode) {
      prefix = `G${formData.itemCategoryCode.substring(0, 3).toUpperCase()}`;
    }

    if (prefix) {
      const allExistingNumbers = [
        ...existingProducts.map(p => p.no),
        ...externalProducts.map(p => p.no)
      ];

      const matching = allExistingNumbers.filter(no => no.startsWith(prefix));
      let nextNumber = 1;

      if (matching.length > 0) {
        const numbers = matching.map(no => {
          const numPart = no.substring(prefix.length);
          return parseInt(numPart, 10) || 0;
        });
        nextNumber = Math.max(...numbers) + 1;
      }

      const formattedNumber = nextNumber.toString().padStart(4, '0');
      setFormData(prev => ({ ...prev, no: `${prefix}${formattedNumber}` }));
    } else {
      setFormData(prev => ({ ...prev, no: '' }));
    }
  }, [formData.type, formData.manufacturerCode, formData.itemCategoryCode, existingProducts, externalProducts]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let processedValue: any = value;
    if (name === 'description') processedValue = value.toUpperCase();
    if (name === 'unitPrice' || name === 'unitCost') processedValue = parseFloat(value) || 0;
    setFormData(prev => ({ ...prev, [name]: processedValue }));
  };

  const handleSuggestDescription = async () => {
    if (!manufacturerRef) return;
    
    const manufacturerName = manufacturers.find(m => m.code === formData.manufacturerCode)?.name || '';
    
    setIsSuggesting(true);
    setGroundingSources([]);
    setQuotaExceeded(false);

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      
      // En Vercel u otros entornos, si la variable no está configurada, puede llegar como 'undefined' o vacío
      if (!apiKey || apiKey === 'undefined') {
        const isVercel = window.location.hostname.includes('vercel.app');
        const errorMessage = isVercel 
          ? "La API Key de Gemini no está configurada en las variables de entorno de Vercel. Por favor, añada GEMINI_API_KEY en el panel de control de Vercel."
          : "Falta la clave API de Gemini. Por favor, configúrela para usar la sugerencia por IA.";
        alert(errorMessage);
        setIsSuggesting(false);
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Investiga en el portal especializado MATMAX (https://www.matmax.es) el producto del fabricante "${manufacturerName}" con referencia "${manufacturerRef}".

OBJETIVO: Obtener la descripción técnica real y adaptarla al formato ERP.
Ejemplo de referencia: 
Fabricante: Solera, Ref: 8004.
Búsqueda en Matmax -> "Base múltiple 4 tomas 16A blanca Ref. 8004"
Descripción sugerida final -> "BASE MÚLTIPLE 4 TOMAS 16A BLANCA"

REGLAS DE FORMATO ERP:
1. Empieza con el nombre del producto (sustantivo principal).
2. Incluye ESPECIFICACIONES TÉCNICAS (polos, amperaje, dimensiones, color, etc.).
3. TODO EN MAYÚSCULAS.
4. ELIMINA la referencia del fabricante ("REF. XXXX") si aparece al final de la descripción encontrada.
5. NO uses artículos (EL, LA, LOS) ni introducciones.
6. Devuelve ÚNICAMENTE el texto de la descripción.`,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });
      
      const suggestedText = response.text?.trim().toUpperCase();
      if (suggestedText) {
        setFormData(prev => ({ ...prev, description: suggestedText }));
      }

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks) {
        const sources: GroundingSource[] = chunks
          .filter(chunk => chunk.web)
          .map(chunk => ({
            title: chunk.web.title,
            uri: chunk.web.uri
          }));
        setGroundingSources(sources);
      }
    } catch (error: any) {
      console.error("DEBUG: Error suggesting description:", error);
      const errorMsg = error?.message || "";
      
      if (errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("RESOURCE_EXHAUSTED")) {
        setQuotaExceeded(true);
      } else if (errorMsg.includes("Requested entity was not found") || errorMsg.includes("API_KEY_INVALID")) {
        // Error de clave inválida o proyecto no encontrado
        alert("La clave API seleccionada no es válida. Por favor, asegúrese de que GEMINI_API_KEY sea correcta.");
        try {
          if ((window as any).aistudio?.openSelectKey) {
            await (window as any).aistudio.openSelectKey();
          }
        } catch (e) {
          console.warn("AI Studio select key is not available in this environment.");
        }
      } else {
        alert(`Error al consultar la IA: ${errorMsg || 'Error desconocido'}`);
      }
    } finally {
      setIsSuggesting(false);
    }
  };

  const validateAndSave = () => {
    const desc = formData.description?.trim();
    if (!desc) return;
    
    let finalDescription = desc;
    if (formData.type === ProductType.FABRICANTE && manufacturerRef) {
        const refSuffix = ` REF. ${manufacturerRef}`;
        if (!finalDescription.endsWith(refSuffix)) finalDescription = `${finalDescription}${refSuffix}`;
    }
    
    const completeProduct: Product = {
      ...formData as Product,
      description: finalDescription,
      manufacturerRef: manufacturerRef,
      inventoryPostingGroup: 'MERCADERÍA',
      vatProdPostingGroup: 'IVA21',
      dimensionCode: 'GASTOS'
    };
    
    onSave(completeProduct);
  };

  const checkDuplicateRef = () => {
    if (formData.type !== ProductType.FABRICANTE || !manufacturerRef) return false;
    const searchStr = `REF. ${manufacturerRef.toUpperCase()}`;
    const inExisting = existingProducts.some(p => 
      p.description.toUpperCase().includes(searchStr) || 
      (p.manufacturerRef && p.manufacturerRef.toUpperCase() === manufacturerRef.toUpperCase())
    );
    const inExternal = externalProducts.some(p => p.description.toUpperCase().includes(searchStr));
    return inExisting || inExternal;
  };

  const isDuplicateRef = checkDuplicateRef();
  const isDescriptionValid = formData.description && formData.description.trim().length > 0;
  const isCategoryValid = !!formData.itemCategoryCode;
  const isManufacturerValid = formData.type === ProductType.GENERICO || !!formData.manufacturerCode;
  const isRefValid = formData.type === ProductType.GENERICO || (!!manufacturerRef && !isDuplicateRef);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-8 px-4">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${step === s ? 'bg-blue-600 text-white' : step > s ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
              {s}
            </div>
            {s < 3 && <div className={`h-1 w-12 mx-2 ${step > s ? 'bg-green-500' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <h4 className="text-lg font-medium text-gray-700 text-center">Seleccione Tipo de Producto</h4>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => { setFormData({ ...formData, type: ProductType.FABRICANTE }); setStep(2); }}
              className={`p-6 border-2 rounded-xl text-left transition-all ${formData.type === ProductType.FABRICANTE ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
            >
              <div className="text-xl font-bold text-blue-700">Fabricante</div>
              <p className="text-sm text-gray-500 mt-1">Requiere referencia externa.</p>
            </button>
            <button
              onClick={() => { setFormData({ ...formData, type: ProductType.GENERICO }); setStep(2); }}
              className={`p-6 border-2 rounded-xl text-left transition-all ${formData.type === ProductType.GENERICO ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
            >
              <div className="text-xl font-bold text-blue-700">Genérico</div>
              <p className="text-sm text-gray-500 mt-1">Categoría general estándar.</p>
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-600">Fabricante (Tabla 5720) {formData.type === ProductType.FABRICANTE && <span className="text-red-500">*</span>}</label>
            <select
              name="manufacturerCode"
              value={formData.manufacturerCode || ''}
              onChange={handleInputChange}
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
              disabled={formData.type === ProductType.GENERICO}
            >
              <option value="">Seleccione fabricante...</option>
              {manufacturers.map(m => <option key={m.code} value={m.code}>{m.code} - {m.name}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-600">Categoría (Tabla 5722) <span className="text-red-500">*</span></label>
            <select
              name="itemCategoryCode"
              value={formData.itemCategoryCode || ''}
              onBlur={() => setCategoryTouched(true)}
              onChange={handleInputChange}
              className={`w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none ${categoryTouched && !isCategoryValid ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
              required
            >
              <option value="">Seleccione categoría...</option>
              {categories.map(c => <option key={c.code} value={c.code}>{c.code} - {c.description}</option>)}
            </select>
            {categoryTouched && !isCategoryValid && (
              <p className="text-[10px] text-red-500 font-bold">La selección de categoría es obligatoria.</p>
            )}
          </div>

          {formData.type === ProductType.FABRICANTE && (
            <div className="space-y-2 col-span-full">
              <label className="block text-sm font-semibold text-gray-600">Nro. de Referencia del Fabricante *</label>
              <input
                type="text"
                value={manufacturerRef}
                onChange={(e) => setManufacturerRef(e.target.value.toUpperCase())}
                placeholder="Ej: REF-12345"
                className={`w-full p-2 border rounded focus:ring-2 outline-none transition-colors ${isDuplicateRef ? 'border-red-500 bg-red-50 focus:ring-red-200' : 'border-gray-300 focus:ring-blue-500'}`}
                required
              />
              {isDuplicateRef && (
                <div className="bg-red-100 border-l-4 border-red-500 p-2 mt-2">
                  <p className="text-xs text-red-700 font-bold uppercase">
                    ¡ATENCIÓN! Ya existe un artículo con esta referencia en el maestro local o externo.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2 col-span-full">
            <label className="block text-sm font-semibold text-gray-600">No. (Código Correlativo Autogenerado)</label>
            <input
              type="text"
              readOnly
              value={formData.no || ''}
              className="w-full p-3 border border-blue-200 bg-blue-50 rounded text-blue-800 font-mono font-bold"
            />
          </div>

          <div className="flex justify-between col-span-full mt-4">
            <button onClick={() => setStep(1)} className="px-6 py-2 border border-gray-300 rounded text-gray-600 hover:bg-gray-50">Atrás</button>
            <button 
              onClick={() => setStep(3)} 
              disabled={!formData.no || !isCategoryValid || !isManufacturerValid || !isRefValid}
              className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-all font-bold"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2 col-span-full">
            <label className="block text-sm font-semibold text-gray-600">Descripción (MAYÚSCULAS) *</label>
            <div className="flex gap-2">
              <input
                type="text"
                name="description"
                maxLength={100}
                value={formData.description || ''}
                onBlur={() => setDescriptionTouched(true)}
                onChange={handleInputChange}
                placeholder="DESCRIPCIÓN"
                className={`flex-1 p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none uppercase ${descriptionTouched && !isDescriptionValid ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                required
              />
              {formData.type === ProductType.FABRICANTE && (
                <button
                  type="button"
                  onClick={handleSuggestDescription}
                  disabled={!manufacturerRef || isSuggesting}
                  className="bg-blue-50 text-blue-700 px-4 py-2 rounded border border-blue-200 font-bold text-xs hover:bg-blue-100 disabled:opacity-50 transition-all flex items-center gap-2"
                  title="Sugerir descripción usando IA"
                >
                  {isSuggesting ? (
                    <div className="w-4 h-4 border-2 border-blue-700 border-t-transparent rounded-full animate-spin" />
                  ) : '✨ Sugerir'}
                </button>
              )}
            </div>

            {/* Aviso de Cuota Excedida con solución */}
            {quotaExceeded && (
              <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-lg animate-in fade-in zoom-in duration-300">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-amber-800">Límite de cuota alcanzado</p>
                    <p className="text-xs text-amber-700 mt-1">Has excedido el uso gratuito compartido. Para continuar sugiriendo descripciones, puedes conectar tu propia cuenta de Google Cloud.</p>
                    <div className="mt-3 flex items-center gap-3">
                      <button
                        onClick={async () => {
                          // Fixed: Use (window as any).aistudio to call openSelectKey
                          await (window as any).aistudio.openSelectKey();
                          setQuotaExceeded(false);
                        }}
                        className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold py-1.5 px-3 rounded shadow-sm transition-colors"
                      >
                        Configurar mi propia API Key
                      </button>
                      <a 
                        href="https://ai.google.dev/gemini-api/docs/billing" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-[10px] text-amber-600 underline font-medium"
                      >
                        Sobre la facturación de Gemini
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Visualización de Grounding Sources */}
            {groundingSources.length > 0 && (
              <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1 mb-2">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Fuentes consultadas (Matmax / Portales técnicos):
                </span>
                <div className="flex flex-wrap gap-2">
                  {groundingSources.map((source, idx) => (
                    <a 
                      key={idx} 
                      href={source.uri} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[10px] bg-white border border-gray-200 px-2 py-1 rounded-md text-blue-600 hover:text-blue-800 hover:border-blue-300 transition-all flex items-center gap-1 max-w-[200px] truncate"
                    >
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      {source.title || "Ver fuente"}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-600">Unidad medida base</label>
            <select name="baseUnitOfMeasure" value={formData.baseUnitOfMeasure} onChange={handleInputChange} className="w-full p-2 border border-gray-300 rounded">
              {units.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-600">Coste unitario</label>
            <input 
              type="number" 
              name="unitCost" 
              value={formData.unitCost} 
              onChange={handleInputChange} 
              readOnly={!isAdmin} 
              className={`w-full p-2 border rounded ${!isAdmin ? 'bg-gray-100 cursor-not-allowed text-gray-400' : 'border-gray-300'}`} 
            />
          </div>

          <div className="flex justify-between col-span-full mt-6 border-t pt-4">
            <button onClick={() => setStep(2)} className="px-6 py-2 border border-gray-300 rounded text-gray-600 hover:bg-gray-50">Atrás</button>
            <div className="space-x-4">
                <button onClick={onCancel} className="px-6 py-2 text-red-600 hover:bg-red-50 rounded">Cancelar</button>
                <button onClick={validateAndSave} disabled={!isDescriptionValid} className="px-8 py-2 bg-blue-600 text-white font-bold rounded shadow-lg hover:bg-blue-700 disabled:opacity-50">
                  Crear Producto
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductForm;
