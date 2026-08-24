
import React, { useState, useEffect } from 'react';
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

  // Validación de Referencia Duplicada
  const checkDuplicateRef = () => {
    if (formData.type !== ProductType.FABRICANTE || !manufacturerRef) return false;
    const searchStr = `REF. ${manufacturerRef.toUpperCase()}`;
    
    // Buscar en productos creados localmente
    const inExisting = existingProducts.some(p => 
      p.description.toUpperCase().includes(searchStr) || 
      (p.manufacturerRef && p.manufacturerRef.toUpperCase() === manufacturerRef.toUpperCase())
    );
    
    // Buscar en productos del maestro externo
    const inExternal = externalProducts.some(p => 
      p.description.toUpperCase().includes(searchStr)
    );

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
            <p className="text-[10px] text-blue-400 mt-1">Calculado sobre app + maestro externo BC</p>
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
            <input
              type="text"
              name="description"
              maxLength={100}
              value={formData.description || ''}
              onBlur={() => setDescriptionTouched(true)}
              onChange={handleInputChange}
              placeholder="DESCRIPCIÓN"
              className={`w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none uppercase ${descriptionTouched && !isDescriptionValid ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-600">Unidad medida base</label>
            <select name="baseUnitOfMeasure" value={formData.baseUnitOfMeasure} onChange={handleInputChange} className="w-full p-2 border border-gray-300 rounded">
              {units.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-600">
              Precio venta {!isAdmin && <span className="text-[10px] text-gray-400 font-normal ml-1">(Solo Admin)</span>}
            </label>
            <input 
              type="number" 
              name="unitPrice" 
              value={formData.unitPrice} 
              onChange={handleInputChange} 
              readOnly={!isAdmin}
              className={`w-full p-2 border rounded ${!isAdmin ? 'bg-gray-100 cursor-not-allowed border-gray-200 text-gray-400' : 'border-gray-300 focus:ring-2 focus:ring-blue-500'}`} 
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-600">Coste unitario</label>
            <input type="number" name="unitCost" value={formData.unitCost} onChange={handleInputChange} className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-600">Valoración existencias</label>
            <select name="costingMethod" value={formData.costingMethod} onChange={handleInputChange} className="w-full p-2 border border-gray-300 rounded">
              {Object.values(CostingMethod).map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          <div className="col-span-full bg-blue-50 p-4 rounded-lg border border-blue-100 mt-4 text-xs">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><span className="text-blue-400">Dimensión:</span><br/><strong>GASTOS</strong></div>
              <div><span className="text-blue-400">Inventario:</span><br/><strong>MERCADERÍA</strong></div>
              <div><span className="text-blue-400">IVA:</span><br/><strong>IVA21</strong></div>
            </div>
          </div>

          <div className="flex justify-between col-span-full mt-6 border-t pt-4">
            <button onClick={() => setStep(2)} className="px-6 py-2 border border-gray-300 rounded text-gray-600 hover:bg-gray-50">Atrás</button>
            <div className="space-x-4">
                <button onClick={onCancel} className="px-6 py-2 text-red-600 hover:bg-red-50 rounded">Cancelar</button>
                <button 
                  onClick={validateAndSave} 
                  disabled={!isDescriptionValid}
                  className="px-8 py-2 bg-blue-600 text-white font-bold rounded shadow-lg hover:bg-blue-700 disabled:opacity-50"
                >
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
