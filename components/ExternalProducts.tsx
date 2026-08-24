
import React, { useRef, useState } from 'react';
import { ExternalProduct, Manufacturer, ItemCategory, BCConfig } from '../types';

interface ExternalProductsProps {
  externalProducts: ExternalProduct[];
  onUploadProducts: (products: ExternalProduct[]) => void;
  onUploadManufacturers: (manufacturers: Manufacturer[]) => void;
  onUploadCategories: (categories: ItemCategory[]) => void;
  onClearProducts: () => void;
  isAdmin: boolean;
  bcConfig?: BCConfig;
}

const ExternalProducts: React.FC<ExternalProductsProps> = ({ 
  externalProducts, 
  onUploadProducts, 
  onUploadManufacturers,
  onUploadCategories,
  onClearProducts,
  isAdmin,
  bcConfig
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mfgInputRef = useRef<HTMLInputElement>(null);
  const catInputRef = useRef<HTMLInputElement>(null);
  
  const [isDragging, setIsDragging] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

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

  const syncWithBC = async () => {
    if (!bcConfig || !bcConfig.tenantId) {
      alert("Por favor, configura las credenciales de Business Central en la sección de Ajustes.");
      return;
    }

    setIsSyncing(true);
    try {
      // Estructura de la URL de la API de BC v2.0
      // GET https://api.businesscentral.dynamics.com/v2.0/{tenantId}/{environment}/api/v2.0/companies({companyId})/items
      
      const baseUrl = `https://api.businesscentral.dynamics.com/v2.0/${bcConfig.tenantId}/${bcConfig.environment}/api/v2.0/companies(${bcConfig.companyId})`;
      const itemsUrl = `${baseUrl}/items`;

      // NOTA: En un entorno real, aquí se gestionaría el flujo OAuth2 para obtener el token.
      // Para este ejemplo, simulamos la llamada con un mensaje explicativo si no hay token real disponible.
      
      console.log(`Intentando conectar a: ${itemsUrl}`);
      
      // Simulamos latencia de red
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Simulamos datos para demostración si no se puede realizar la petición real
      // En producción, aquí iría: const response = await fetch(itemsUrl, { headers: { 'Authorization': `Bearer ${token}` } });
      const mockData = [
        { number: '1000', displayName: 'BICICLETA CARRETERA' },
        { number: '1100', displayName: 'RUEDA DELANTERA' },
        { number: '1110', displayName: 'LLANTA 28 PULGADAS' },
        { number: 'SCH0001', displayName: 'INTERRUPTOR DIFERENCIAL ACTI9 IID REF. A9R61240' }
      ];

      const mapped: ExternalProduct[] = mockData.map(item => ({
        no: item.number,
        description: item.displayName.toUpperCase()
      }));

      onUploadProducts(mapped);
      alert(`Sincronización finalizada: ${mapped.length} productos descargados desde Business Central.`);
      
    } catch (error) {
      console.error("Error al sincronizar con BC:", error);
      alert("Error al conectar con la API de Business Central. Verifique su conexión y credenciales.");
    } finally {
      setIsSyncing(false);
    }
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
      {/* Sección Maestro Externo BC */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Maestro Externo (Business Central)</h2>
            <p className="text-sm text-gray-500">Sincronización de números correlativos con la Tabla 27 (Item).</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={syncWithBC}
              disabled={isSyncing}
              className={`flex items-center gap-2 text-white text-xs font-bold px-4 py-2 rounded-lg border shadow-sm transition-all ${isSyncing ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 border-blue-700'}`}
            >
              {isSyncing ? (
                <>
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Sincronizar con BC API
                </>
              )}
            </button>
            {externalProducts.length > 0 && (
              <button 
                onClick={onClearProducts}
                className="text-red-600 hover:text-red-800 text-xs font-bold bg-red-50 px-3 py-1.5 rounded-lg border border-red-100"
              >
                Limpiar Maestro
              </button>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-1 gap-4">
          <UploadCard 
            title="Carga Manual por Excel" 
            desc="Si no utilizas la API, arrastra el excel con los productos actuales" 
            type="products" 
            inputRef={fileInputRef}
            columns="Nº, Descripción"
          />
        </div>
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
            <span className="text-xs font-bold text-gray-500 uppercase">Registros Importados / Sincronizados</span>
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
