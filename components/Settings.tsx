
import React, { useState } from 'react';
import { AppSettings, UserRole, Manufacturer, ItemCategory, BCConfig } from '../types';

interface SettingsProps {
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  currentRole: UserRole;
}

const Settings: React.FC<SettingsProps> = ({ settings, onUpdateSettings, currentRole }) => {
  const [activeTab, setActiveTab] = useState<'manufacturers' | 'categories' | 'units' | 'roles' | 'api'>('manufacturers');
  const [newItem, setNewItem] = useState({ code: '', name: '', desc: '', unit: '' });
  
  const [bcForm, setBcForm] = useState<BCConfig>(settings.bcConfig || {
    tenantId: '',
    environment: 'production',
    companyId: '',
    clientId: '',
    clientSecret: '',
    isConnected: false
  });

  const isEditable = currentRole === UserRole.ADMIN;

  const handleTogglePermission = (role: UserRole, permission: 'canCreateProduct' | 'canManageMasterData') => {
    if (!isEditable) return;
    const newSettings = { ...settings };
    newSettings.permissions[role][permission] = !newSettings.permissions[role][permission];
    onUpdateSettings(newSettings);
  };

  const addItem = (type: 'manufacturer' | 'category' | 'unit') => {
    const newSettings = { ...settings };
    if (type === 'manufacturer' && newItem.code && newItem.name) {
      newSettings.manufacturers.push({ code: newItem.code.toUpperCase(), name: newItem.name.toUpperCase() });
    } else if (type === 'category' && newItem.code && newItem.desc) {
      newSettings.categories.push({ code: newItem.code.toUpperCase(), description: newItem.desc.toUpperCase() });
    } else if (type === 'unit' && newItem.unit) {
      newSettings.unitsOfMeasure.push(newItem.unit.toUpperCase());
    }
    onUpdateSettings(newSettings);
    setNewItem({ code: '', name: '', desc: '', unit: '' });
  };

  const removeItem = (type: 'manufacturer' | 'category' | 'unit', index: number) => {
    if (!isEditable) return;
    const newSettings = { ...settings };
    if (type === 'manufacturer') newSettings.manufacturers.splice(index, 1);
    if (type === 'category') newSettings.categories.splice(index, 1);
    if (type === 'unit') newSettings.unitsOfMeasure.splice(index, 1);
    onUpdateSettings(newSettings);
  };

  const saveBCConfig = () => {
    onUpdateSettings({ ...settings, bcConfig: bcForm });
    alert("Configuración de Business Central guardada correctamente.");
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 min-h-[550px] flex">
      {/* Sidebar de Configuración */}
      <div className="w-64 border-r border-gray-100 bg-gray-50 p-4 space-y-2">
        <button onClick={() => setActiveTab('manufacturers')} className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium ${activeTab === 'manufacturers' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-200'}`}>Fabricantes</button>
        <button onClick={() => setActiveTab('categories')} className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium ${activeTab === 'categories' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-200'}`}>Categorías</button>
        <button onClick={() => setActiveTab('units')} className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium ${activeTab === 'units' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-200'}`}>Unidades de Medida</button>
        {isEditable && (
          <>
            <button onClick={() => setActiveTab('api')} className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium ${activeTab === 'api' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-200'}`}>Conexión BC API</button>
            <button onClick={() => setActiveTab('roles')} className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium ${activeTab === 'roles' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-200'}`}>Permisos de Roles</button>
          </>
        )}
      </div>

      {/* Contenido Principal */}
      <div className="flex-1 p-8">
        {activeTab === 'manufacturers' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">Gestión de Fabricantes</h2>
            {isEditable && (
              <div className="flex gap-2">
                <input value={newItem.code} onChange={e => setNewItem({...newItem, code: e.target.value})} placeholder="Código" className="border p-2 rounded w-24 uppercase" />
                <input value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} placeholder="Nombre" className="border p-2 rounded flex-1 uppercase" />
                <button onClick={() => addItem('manufacturer')} className="bg-blue-600 text-white px-4 py-2 rounded">+</button>
              </div>
            )}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50"><tr><th className="p-3 text-left">Código</th><th className="p-3 text-left">Nombre</th><th className="p-3"></th></tr></thead>
                <tbody className="divide-y">
                  {settings.manufacturers.map((m, i) => (
                    <tr key={m.code}>
                      <td className="p-3 font-mono font-bold">{m.code}</td>
                      <td className="p-3">{m.name}</td>
                      <td className="p-3 text-right">
                        {isEditable && <button onClick={() => removeItem('manufacturer', i)} className="text-red-500 hover:bg-red-50 p-1 rounded">Eliminar</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'api' && isEditable && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold">Configuración de Business Central API</h2>
              <p className="text-sm text-gray-500">Configura las credenciales de Azure AD para sincronizar directamente con la Tabla 27 (Item).</p>
            </div>
            
            <div className="grid grid-cols-1 gap-4 max-w-lg">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Tenant ID</label>
                <input 
                  type="text" 
                  value={bcForm.tenantId} 
                  onChange={e => setBcForm({...bcForm, tenantId: e.target.value})} 
                  className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" 
                  placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Ambiente (Environment)</label>
                <select 
                  value={bcForm.environment} 
                  onChange={e => setBcForm({...bcForm, environment: e.target.value})} 
                  className="w-full p-2 border border-gray-300 rounded"
                >
                  <option value="production">Production</option>
                  <option value="Sandbox">Sandbox</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">ID de Empresa (Company ID)</label>
                <input 
                  type="text" 
                  value={bcForm.companyId} 
                  onChange={e => setBcForm({...bcForm, companyId: e.target.value})} 
                  className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" 
                  placeholder="ID de la empresa en Business Central"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Client ID (Azure AD)</label>
                <input 
                  type="text" 
                  value={bcForm.clientId} 
                  onChange={e => setBcForm({...bcForm, clientId: e.target.value})} 
                  className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" 
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Client Secret</label>
                <input 
                  type="password" 
                  value={bcForm.clientSecret} 
                  onChange={e => setBcForm({...bcForm, clientSecret: e.target.value})} 
                  className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" 
                />
              </div>
              
              <div className="pt-4 flex gap-3">
                <button 
                  onClick={saveBCConfig}
                  className="bg-blue-600 text-white px-6 py-2 rounded font-bold shadow-lg hover:bg-blue-700 transition-all"
                >
                  Guardar Configuración
                </button>
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-bold ${bcForm.tenantId ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                   {bcForm.tenantId ? '● Configurado' : '○ Sin configurar'}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'categories' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">Gestión de Categorías</h2>
            {isEditable && (
              <div className="flex gap-2">
                <input value={newItem.code} onChange={e => setNewItem({...newItem, code: e.target.value})} placeholder="Código" className="border p-2 rounded w-32 uppercase" />
                <input value={newItem.desc} onChange={e => setNewItem({...newItem, desc: e.target.value})} placeholder="Descripción" className="border p-2 rounded flex-1 uppercase" />
                <button onClick={() => addItem('category')} className="bg-blue-600 text-white px-4 py-2 rounded">+</button>
              </div>
            )}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50"><tr><th className="p-3 text-left">Código</th><th className="p-3 text-left">Descripción</th><th className="p-3"></th></tr></thead>
                <tbody className="divide-y">
                  {settings.categories.map((c, i) => (
                    <tr key={c.code}>
                      <td className="p-3 font-mono font-bold">{c.code}</td>
                      <td className="p-3">{c.description}</td>
                      <td className="p-3 text-right">
                        {isEditable && <button onClick={() => removeItem('category', i)} className="text-red-500 hover:bg-red-50 p-1 rounded">Eliminar</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'units' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">Unidades de Medida</h2>
            {isEditable && (
              <div className="flex gap-2">
                <input value={newItem.unit} onChange={e => setNewItem({...newItem, unit: e.target.value})} placeholder="Nueva Unidad (Ej: METRO)" className="border p-2 rounded flex-1 uppercase" />
                <button onClick={() => addItem('unit')} className="bg-blue-600 text-white px-4 py-2 rounded">+</button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {settings.unitsOfMeasure.map((u, i) => (
                <div key={u} className="flex items-center bg-gray-100 px-3 py-1 rounded-full border">
                  <span className="text-sm font-medium">{u}</span>
                  {isEditable && <button onClick={() => removeItem('unit', i)} className="ml-2 text-gray-400 hover:text-red-500">×</button>}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'roles' && isEditable && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">Permisos por Perfil</h2>
            <div className="space-y-8">
              {[UserRole.TECNICO, UserRole.COMPRAS].map(role => (
                <div key={role} className="border p-6 rounded-xl bg-gray-50">
                  <h3 className="text-lg font-bold text-blue-800 mb-4">{role}</h3>
                  <div className="space-y-4">
                    <label className="flex items-center gap-3 p-3 bg-white border rounded-lg cursor-pointer hover:bg-blue-50">
                      <input 
                        type="checkbox" 
                        className="w-5 h-5"
                        checked={settings.permissions[role].canCreateProduct}
                        onChange={() => handleTogglePermission(role, 'canCreateProduct')}
                      />
                      <div>
                        <span className="block font-bold">Creación de Productos</span>
                        <span className="text-xs text-gray-500">Permite usar el botón "+" y el formulario de alta.</span>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 bg-white border rounded-lg cursor-pointer hover:bg-blue-50">
                      <input 
                        type="checkbox" 
                        className="w-5 h-5"
                        checked={settings.permissions[role].canManageMasterData}
                        onChange={() => handleTogglePermission(role, 'canManageMasterData')}
                      />
                      <div>
                        <span className="block font-bold">Gestión de Datos Maestros</span>
                        <span className="text-xs text-gray-500">Permite entrar a esta sección y ver listas maestras.</span>
                      </div>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
