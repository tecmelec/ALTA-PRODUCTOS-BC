
import { ItemCategory, Manufacturer } from './types';

export const ITEM_CATEGORIES: ItemCategory[] = [
  { code: '1GG', description: 'GASTOS GENERALES' },
  { code: '62000002', description: 'Carburante' },
  { code: '62100001', description: 'Alquiler de maquinaria' },
  { code: '62100002', description: 'Alquiler miguel unamuno' },
  { code: '62200002', description: 'Mant. repar. - vehiculos' },
  { code: '62300001', description: 'Servicios profesionales indep.' },
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
