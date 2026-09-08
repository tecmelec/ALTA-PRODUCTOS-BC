
import { ItemCategory, Manufacturer } from './types';

// Códigos de categoría de gastos generales / contables que no deben
// mostrarse en la app (no son categorías de producto de cara al usuario).
// Nota: cuando la app está conectada a Business Central, el filtrado real
// ocurre en backend-vercel/api/categories.ts; esta lista se usa además
// aquí como respaldo (modo offline/demo y datos ya guardados en el navegador).
export const HIDDEN_CATEGORY_CODES: string[] = [
  '1GG',
  '62000002',
  '62100001',
  '62100002',
  '62100003',
  '62100006',
  '62100008',
  '62200002',
  '62200004',
  '62200006',
  '62200007',
  '62300001',
  '62300003',
  '62300005',
  '62300007',
  '62300008',
  '62700001',
  '62700002',
  '62800001',
  '62800003',
  '62900002',
  '62900003',
  '62900004',
  '62900005',
  '62900006',
  '62900007',
  '62900009',
  '62900010',
  '62900011',
  '62900012',
  '62900013',
  '62900014',
  '62900015',
  '62900016',
  '62000000',
  '62000001',
];

// Filtra cualquier lista de categorías para excluir las categorías ocultas.
export const filterHiddenCategories = (categories: ItemCategory[]): ItemCategory[] =>
  categories.filter(c => !HIDDEN_CATEGORY_CODES.includes(c.code));

export const ITEM_CATEGORIES: ItemCategory[] = [
  { code: 'AAI', description: 'APARAMENTA PANEL DE AISLAMIENTO' },
  { code: 'APA', description: 'APARAMENTA' },
  { code: 'AUV', description: 'AUDIO VISUAL' },
  { code: 'CAB', description: 'CABLE' },
  { code: 'CAJ', description: 'CAJAS' },
  { code: 'CAN', description: 'CANALIZACIÓN' },
  { code: 'ELE', description: 'ELECTRICIDAD' },
  { code: 'FER', description: 'FERRETERIA' },
  { code: 'GAS', description: 'GAS' },
  { code: 'GEN', description: 'GENERICO' },
  { code: 'HER', description: 'HERRAMIENTAS' },
  { code: 'ILU', description: 'ILUMINACIÓN' },
  { code: 'MOB', description: 'MOBILIARIO' },
  { code: 'PIS', description: 'PISCINAS' },
  { code: 'SAI', description: 'SAI' },
  { code: 'SEG', description: 'SEGURIDAD' },
];

export const MANUFACTURERS: Manufacturer[] = [
  { code: '1GG', name: 'GASTOS GENERALES OFICINA' },
  { code: '2N', name: '2N' },
  { code: '3MT', name: '3M TELECOM' },
  { code: 'ABB', name: 'ABB' },
  { code: 'ACB', name: 'ACB' },
  { code: 'ADA', name: 'ADAM HALL' },
  { code: 'AEG', name: 'AEG BAJA TENSION' },
  { code: 'AEN', name: 'ASTROENERGY' },
  { code: 'AER', name: 'AERLUX' },
  { code: 'APP', name: 'APPLE' },
  { code: 'ASU', name: 'ASUS' },
  { code: 'BOS', name: 'BOSCH' },
  { code: 'CIS', name: 'CISCO' },
  { code: 'DAI', name: 'DAISALUX' },
  { code: 'DLL', name: 'DELL' },
  { code: 'LEG', name: 'LEGRAND' },
  { code: 'PHO', name: 'PHOENIX' },
  { code: 'SAM', name: 'SAMSUNG' },
  { code: 'SCH', name: 'SCHNEIDER ELECTRIC' },
  { code: 'SIE', name: 'SIEMENS' },
  { code: 'ZEN', name: 'ZENNIO' }
];

export const UNITS_OF_MEASURE = ['UD', 'METRO', 'KG', 'LITRO', 'CAJA'];
export const POSTING_GROUPS = ['MERCADERÍA', 'MAT. PRIMA', 'SERVICIO'];
export const VAT_GROUPS = ['IVA21', 'IVA10', 'IVA4', 'EXENTO'];
export const DIMENSION_CODES = ['PROYECTO', 'DEPARTAMENTO', 'CLIENTE'];
