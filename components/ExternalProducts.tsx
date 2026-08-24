
import React, { useRef, useState } from 'react';
import { ExternalProduct, Manufacturer, ItemCategory } from '../types';

interface ExternalProductsProps {
  externalProducts: ExternalProduct[];
  onUploadProducts: (products: ExternalProduct[]) => void;
  onUploadManufacturers: (manufacturers: Manufacturer[]) => void;
  onUploadCategories: (categories: ItemCategory[]) => void;
  onClearProducts: () => void;
  isAdmin: boolean;
}

const ExternalProducts: React.FC<ExternalProductsProps> = ({ 
  externalProducts, 
  onUploadProducts, 
  onUploadManufacturers,
  onUploadCategories,
  onClearProducts,
  isAdmin 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mfgInputRef = useRef<HTMLInputElement>(null);
  const catInputRef = useRef<HTMLInputElement>(null);
  
  const [isDragging, setIsDragging] = useState<string | null>(null);

  const processFile = (file: File, type: 'products' | 'manufacturers' | 'categories') => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      const workbook = (window as any).XLSX.read(data, { type: 'binary' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json = (window as any).XLSX.utils.sheet_to_json(worksheet);

      if (type === 'products') {
        const mapped: ExternalProduct[] = json.map((row: any) => ({
          no: String(row['Nº'] || row['No.'] || row['nº'] || row['no'] || '').trim(),
          description: String(row['Descripción'] || row['Descripcion'] || row['description'] || '').trim()
        })).filter((p: any) => p.no && p.description);
        onUploadProducts(mapped);
      } else if (type === 'manufacturers') {
        const mapped: Manufacturer[] = json.map((row: any) => ({
          code: String(row['Código'] || row['Codigo'] || row['code'] || '').trim().toUpperCase(),
          name: String(row['Nombre'] || row['name'] || '').trim().toUpperCase()
        })).filter((m: any) => m.code && m.name);
        onUploadManufacturers(mapped);
      } else if (type === 'categories') {
        const mapped: ItemCategory[] = json.map((row: any) => ({
          code: String(row['Código'] || row['Codigo'] || row['code'] || '').trim().toUpperCase(),
          description: String(row['Descripción'] || row['Descripcion'] || row['description'] || '').trim().toUpperCase()
        })).filter((c: any) => c.code && c.description);
        onUploadCategories(mapped);
      }
    };
    reader.readAsBinaryString(file);
  };

  const UploadCard = ({ 
    title, 
    desc, 
    type, 
    inputRef, 
    columns 
  }: { 
    title: string, 
    desc: string, 
    type: 'products' | 'manufacturers' | 'categories', 
    inputRef: React.RefObject<HTMLInputElement>,
    columns: string 
  }) => (
    <div 
      onDragOver={(e) => { e.preventDefault(); setIsDragging(type); }}
      onDragLeave={() => setIsDragging(null)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(null);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0], type);
      }}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all ${
        isDragging === type ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-gray-50'
      }`}
    >
      <input 
        type="file" 
        ref={inputRef} 
        onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0], type)} 
        accept=".xlsx, .xls, .csv" 
        className="hidden" 
      />
      <svg className={`w-8 h-8 mb-2 ${isDragging === type ? 'text-blue-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
      <h3 className="font-bold text-gray-700 text-sm">{title}</h3>
      <p className="text-[11px] text-gray-500 text-center mt-1">{desc}</p>
      <p className="text-[10px] text-blue-500 font-mono mt-2 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 uppercase">{columns}</p>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Sección Maestro Externo BC (Siempre visible) */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Maestro Externo (Business Central)</h2>
            <p className="text-sm text-gray-500">Sincronización de números correlativos.</p>
          </div>
          {externalProducts.length > 0 && (
            <button 
              onClick={onClearProducts}
              className="text-red-600 hover:text-red-800 text-xs font-bold bg-red-50 px-3 py-1.5 rounded-lg border border-red-100"
            >
              Limpiar Maestro
            </button>
          )}
        </div>
        <UploadCard 
          title="Carga de Productos BC" 
          desc="Arrastra el excel con los productos actuales de BC" 
          type="products" 
          inputRef={fileInputRef}
          columns="Nº, Descripción"
        />
      </div>

      {/* Secciones de Datos Maestros (Solo Administrador) */}
      {isAdmin && (
        <div className="pt-6 border-t border-gray-200">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-green-700">Gestión Masiva de Datos Maestros</h2>
            <p className="text-sm text-gray-500">Solo visible para el perfil Administrador.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UploadCard 
              title="Importar Fabricantes" 
              desc="Actualiza la Tabla 5720 de BC" 
              type="manufacturers" 
              inputRef={mfgInputRef}
              columns="Código, Nombre"
            />
            <UploadCard 
              title="Importar Categorías" 
              desc="Actualiza la Tabla 5722 de BC" 
              type="categories" 
              inputRef={catInputRef}
              columns="Código, Descripción"
            />
          </div>
        </div>
      )}

      {/* Listado de Productos Cargados */}
      {externalProducts.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-gray-50 px-6 py-3 border-b border-gray-100 flex justify-between items-center">
            <span className="text-xs font-bold text-gray-500 uppercase">Registros Importados</span>
            <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded-full">{externalProducts.length} productos</span>
          </div>
          <div className="max-h-72 overflow-y-auto overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-6 py-3 font-bold text-gray-500">Nº</th>
                  <th className="px-6 py-3 font-bold text-gray-500">Descripción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {externalProducts.map((p, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-mono text-blue-600 font-bold">{p.no}</td>
                    <td className="px-6 py-3 text-gray-700 uppercase">{p.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExternalProducts;
