
import React, { useState } from 'react';
import { Product, ExternalProduct } from '../types';

interface ReferenceInspectionProps {
  products: Product[];
  externalProducts: ExternalProduct[];
}

interface InspectionResult {
  reference: string;
  exists: boolean;
  matchNo?: string;
  matchDescription?: string;
}

const ReferenceInspection: React.FC<ReferenceInspectionProps> = ({ products, externalProducts }) => {
  const [inputText, setInputText] = useState('');
  const [results, setResults] = useState<InspectionResult[]>([]);
  const [isInspected, setIsInspected] = useState(false);

  const handleInspect = () => {
    const lines = inputText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const inspectionResults: InspectionResult[] = lines.map(ref => {
      const upperRef = ref.toUpperCase();
      const searchStr = `REF. ${upperRef}`;

      // Buscar en locales
      const localMatch = products.find(p => 
        p.description.toUpperCase().includes(searchStr) || 
        p.description.toUpperCase().includes(upperRef) ||
        (p.manufacturerRef && p.manufacturerRef.toUpperCase() === upperRef)
      );

      if (localMatch) {
        return {
          reference: ref,
          exists: true,
          matchNo: localMatch.no,
          matchDescription: localMatch.description
        };
      }

      // Buscar en externos
      const externalMatch = externalProducts.find(p => 
        p.description.toUpperCase().includes(searchStr) ||
        p.description.toUpperCase().includes(upperRef)
      );

      if (externalMatch) {
        return {
          reference: ref,
          exists: true,
          matchNo: externalMatch.no,
          matchDescription: externalMatch.description
        };
      }

      return {
        reference: ref,
        exists: false
      };
    });

    setResults(inspectionResults);
    setIsInspected(true);
  };

  const foundCount = results.filter(r => r.exists).length;
  const notFoundCount = results.length - foundCount;

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold text-gray-800 mb-2">Inspección de Referencias</h2>
        <p className="text-sm text-gray-500 mb-4">Pegue aquí el listado de referencias a verificar (una por cada línea).</p>
        
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Ejemplo:&#10;REF12345&#10;67890-AB&#10;..."
          className="w-full h-48 p-4 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm bg-gray-50"
        />
        
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleInspect}
            disabled={!inputText.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-lg font-bold shadow-lg transition-all disabled:opacity-50"
          >
            Verificar Listado
          </button>
        </div>
      </div>

      {isInspected && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Dashboard de resultados */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm text-center">
              <span className="text-xs font-bold text-gray-400 uppercase">Total Procesadas</span>
              <p className="text-2xl font-black text-gray-800">{results.length}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-xl border border-green-100 shadow-sm text-center">
              <span className="text-xs font-bold text-green-400 uppercase">Existentes</span>
              <p className="text-2xl font-black text-green-700">{foundCount}</p>
            </div>
            <div className="bg-red-50 p-4 rounded-xl border border-red-100 shadow-sm text-center">
              <span className="text-xs font-bold text-red-400 uppercase">No Encontradas</span>
              <p className="text-2xl font-black text-red-700">{notFoundCount}</p>
            </div>
          </div>

          {/* Tabla de resultados */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase">Estado</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase">Referencia</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase">Coincidencia en BC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map((res, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      {res.exists ? (
                        <span className="bg-green-100 text-green-700 text-[10px] font-black px-2 py-1 rounded-full uppercase">Existente</span>
                      ) : (
                        <span className="bg-red-100 text-red-700 text-[10px] font-black px-2 py-1 rounded-full uppercase">No Encontrado</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-sm font-bold text-gray-700 uppercase">
                      {res.reference}
                    </td>
                    <td className="px-6 py-4">
                      {res.exists ? (
                        <div>
                          <p className="text-blue-600 font-bold text-xs">{res.matchNo}</p>
                          <p className="text-[10px] text-gray-500 uppercase truncate max-w-xs">{res.matchDescription}</p>
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
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

export default ReferenceInspection;
