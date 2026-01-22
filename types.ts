
export type Size = 'PP' | 'P' | 'M' | 'G' | 'GG' | 'XG' | 'G1' | 'G2' | 'Único';

export interface Product {
  id: string;
  name: string;
  price: number;
  image_url: string; 
  additional_images?: string[]; // Novas fotos extras (até 3)
  network_tag: string; 
  category: string;
  description?: string;
  min_order: number;
  production_days: number;
  available_sizes?: Size[];
}

export interface User {
  id: string;
  email: string;
  network_tag: string;
  unit_name: string;
  role: 'user' | 'admin';
  // Novos campos corporativos opcionais (pois admin pode não ter)
  cnpj?: string;
  phone?: string;
  contact_name?: string;
  address?: string;
}

export interface CartItem extends Product {
  selectedSize: Size;
  quantity: number;
}

export interface Order {
  id: string;
  user_email: string;
  unit_name: string;
  order_details: any;
  total_price: number;
  status: 'Pago/Aguardando Produção' | 'Pendente';
  created_at: string;
}