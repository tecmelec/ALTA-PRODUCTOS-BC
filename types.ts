
export enum ProductType {
  FABRICANTE = 'Fabricante',
  GENERICO = 'Genérico'
}

export enum CostingMethod {
  FIFO = 'FIFO',
  LIFO = 'LIFO',
  AVERAGE = 'Media',
  SPECIFIC = 'Específico',
  STANDARD = 'Estándar'
}

export interface ItemCategory {
  code: string;
  description: string;
}

export interface Manufacturer {
  code: string;
  name: string;
}

export interface ExternalProduct {
  no: string;
  description: string;
}

export interface BCConfig {
  tenantId: string;
  environment: string;
  companyId: string;
  clientId: string;
  clientSecret: string;
  isConnected: boolean;
}

export interface Product {
  no: string;
  description: string;
  baseUnitOfMeasure: string;
  type: ProductType;
  inventoryPostingGroup: string;
  unitPrice: number;
  costingMethod: CostingMethod;
  unitCost: number;
  genProdPostingGroup: string;
  vatProdPostingGroup: string;
  manufacturerCode: string;
  itemCategoryCode: string;
  dimensionCode: string;
  dimensionValueCode: string;
  valuePosting: string;
  manufacturerRef?: string;
}

export enum UserRole {
  ADMIN = 'Administrador',
  TECNICO = 'Técnico',
  COMPRAS = 'Compras'
}

export interface RolePermissions {
  canCreateProduct: boolean;
  canManageMasterData: boolean;
}

export interface AppSettings {
  manufacturers: Manufacturer[];
  categories: ItemCategory[];
  unitsOfMeasure: string[];
  permissions: Record<UserRole, RolePermissions>;
  bcConfig?: BCConfig;
}
