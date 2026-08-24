
import React, { useState, useEffect } from 'react';
import { Product, UserRole, AppSettings, ExternalProduct, Manufacturer, ItemCategory, BCConfig } from './types';
import Modal from './components/Modal';
import ProductForm from './components/ProductForm';
import Settings from './components/Settings';
import ExternalProducts from './components/ExternalProducts';
import ReferenceInspection from './components/ReferenceInspection';
import { ITEM_CATEGORIES, MANUFACTURERS, UNITS_OF_MEASURE } from './constants';

const DEFAULT_BC_CONFIG: BCConfig = {
  tenantId: '',
  environment: 'production',
  companyId: '',
  clientId: '',
  clientSecret: '',
  isConnected: false
};

const DEFAULT_SETTINGS: AppSettings = {
  manufacturers: MANUFACTURERS,
  categories: ITEM_CATEGORIES,
  unitsOfMeasure: UNITS_OF_MEASURE,
  permissions: {
    [UserRole.ADMIN]: { canCreateProduct: true, canManageMasterData: true },
    [UserRole.TECNICO]: { canCreateProduct: true, canManageMasterData: false },
    [UserRole.COMPRAS]: { canCreateProduct: false, canManageMasterData: false },
  },
  bcConfig: DEFAULT_BC_CONFIG
};

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<'products' | 'bc' | 'inspection' | 'settings'>('products');
  const [currentUser, setCurrentUser] = useState<UserRole>(UserRole.ADMIN);
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('bc_products');
    return saved ? JSON.parse(saved) : [];
  });
  const [externalProducts, setExternalProducts] = useState<ExternalProduct[]>(() => {
    const saved = localStorage.getItem('bc_external_products');
    return saved ? JSON.parse(saved) : [];
  });
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('bc_settings');
    const parsed = saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    if (!parsed.bcConfig) parsed.bcConfig = DEFAULT_BC_CONFIG;
    return parsed;
  });
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('bc_products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('bc_external_products', JSON.stringify(externalProducts));
  }, [externalProducts]);

  useEffect(() => {
    localStorage.setItem('bc_settings', JSON.stringify(settings));
  }, [settings]);

  const userPerms = settings.permissions[currentUser];

  const handleAddProduct = (newProduct: Product) => {
    setProducts(prev => [newProduct, ...prev]);
    setIsModalOpen(false);
  };

  const handleBulkManufacturers = (newManufacturers: Manufacturer[]) => {
    setSettings(prev => ({ ...prev, manufacturers: newManufacturers }));
    alert(`${newManufacturers.length} fabricantes cargados correctamente.`);
  };

  const handleBulkCategories = (newCategories: ItemCategory[]) => {
    setSettings(prev => ({ ...prev, categories: newCategories }));
    alert(`${newCategories.length} categorías cargadas correctamente.`);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans">
      <div className="bg-gray-800 text-white text-[10px] py-1 px-4 flex justify-between items-center uppercase tracking-widest font-bold">
        <span>SISTEMA DE GESTIÓN DE PRODUCTOS BC</span>
        <div className="flex items-center gap-3">
          <span>PERFIL ACTUAL:</span>
          <select 
            value={currentUser} 
            onChange={(e) => {
              const role = e.target.value as UserRole;
              setCurrentUser(role);
              if (!settings.permissions[role].canManageMasterData && activeView === 'settings') setActiveView('products');
            }}
            className="bg-gray-700 text-white border-none text-[10px] rounded focus:ring-0"
          >
            {Object.values(UserRole).map(role => <option key={role} value={role}>{role}</option>)}
          </select>
        </div>
      </div>

      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div>
              <h1 className="text-xl font-black text-green-600 leading-none">TECMELEC</h1>
              <span className="text-xs text-gray-400 font-bold uppercase">Alta de productos</span>
            </div>
            
            <nav className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              <button onClick={() => setActiveView('products')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeView === 'products' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Productos</button>
              <button onClick={() => setActiveView('bc')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeView === 'bc' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Productos BC</button>
              <button onClick={() => setActiveView('inspection')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeView === 'inspection' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Inspección</button>
              {userPerms.canManageMasterData && (
                <button onClick={() => setActiveView('settings')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeView === 'settings' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Configuración</button>
              )}
            </nav>
          </div>

          {activeView === 'products' && userPerms.canCreateProduct && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-bold shadow-lg shadow-blue-200 flex items-center gap-2 transform active:scale-95 transition-all"
            >
              <span className="text-lg">+</span> Nuevo producto
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8">
        {activeView === 'products' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">No.</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Descripción</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Tipo</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Categoría</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Fabricante</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">U.M.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {products.length === 0 ? (
                      <tr><td colSpan={6} className="px-6 py-20 text-center text-gray-400">No hay productos registrados.</td></tr>
                    ) : (
                      products.map((p, idx) => (
                        <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                          <td className="px-6 py-4 font-mono text-sm text-blue-700 font-bold">{p.no}</td>
                          <td className="px-6 py-4 text-sm text-gray-800 uppercase font-medium">{p.description}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${p.type === 'Fabricante' ? 'bg-indigo-100 text-indigo-700' : 'bg-green-100 text-green-700'}`}>
                              {p.type}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500 font-bold uppercase">{p.itemCategoryCode || '-'}</td>
                          <td className="px-6 py-4 text-sm text-gray-500 font-bold">{p.manufacturerCode || '-'}</td>
                          <td className="px-6 py-4 text-sm text-gray-500">{p.baseUnitOfMeasure}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeView === 'bc' && (
          <ExternalProducts 
            externalProducts={externalProducts} 
            onUploadProducts={setExternalProducts}
            onUploadManufacturers={handleBulkManufacturers}
            onUploadCategories={handleBulkCategories}
            onClearProducts={() => setExternalProducts([])}
            isAdmin={currentUser === UserRole.ADMIN}
            bcConfig={settings.bcConfig}
          />
        )}

        {activeView === 'inspection' && <ReferenceInspection products={products} externalProducts={externalProducts} />}

        {activeView === 'settings' && <Settings settings={settings} onUpdateSettings={setSettings} currentRole={currentUser} />}
      </main>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Alta de Producto">
        <ProductForm 
          onSave={handleAddProduct}
          onCancel={() => setIsModalOpen(false)}
          existingProducts={products}
          externalProducts={externalProducts}
          manufacturers={settings.manufacturers}
          categories={settings.categories}
          units={settings.unitsOfMeasure}
          isAdmin={currentUser === UserRole.ADMIN}
        />
      </Modal>
    </div>
  );
};

export default App;
