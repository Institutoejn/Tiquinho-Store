
export type Size = 'P' | 'M' | 'G' | 'GG' | 'XG' | 'Único';

export interface Product {
  id: string;
  name: string;
  price: number;
  image: string;
  networkTag: string; // 'drogaria-total', 'farmacia-abc', 'generica', etc.
  category: string;
  description?: string;
  minOrder: number;
  productionTime: string;
  availableSizes?: Size[];
}

export interface User {
  id: string;
  email: string;
  password?: string;
  networkName: string;
  networkTag: string;
  unitName: string;
  role: 'user' | 'admin';
}

export interface CartItem extends Product {
  selectedSize: Size;
  quantity: number;
}

export interface AppNotification {
  id: string;
  networkTag: string;
  message: string;
  createdAt: number;
}

export interface Order {
  id: string;
  unitName: string;
  networkName: string;
  total: number;
  items: CartItem[];
  status: 'Pago/Aguardando Produção' | 'Pendente';
  createdAt: number;
}
