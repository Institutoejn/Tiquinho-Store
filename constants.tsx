
import { Product, User } from './types';

export const USERS: User[] = [
  {
    id: '1',
    email: 'contato@drogariatotal.com',
    password: 'admin',
    // Corrigido: network_tag e unit_name para seguir a interface User, e removido networkName
    network_tag: 'drogaria-total',
    unit_name: 'Unidade Matriz',
    role: 'user'
  },
  {
    id: '2',
    email: 'franquia@drogariatotal.com',
    password: 'admin',
    // Corrigido: network_tag e unit_name para seguir a interface User, e removido networkName
    network_tag: 'drogaria-total',
    unit_name: 'Unidade Franqueada 01',
    role: 'user'
  },
  {
    id: '3',
    email: 'loja@generica.com',
    password: 'admin',
    // Corrigido: network_tag e unit_name para seguir a interface User, e removido networkName
    network_tag: 'generica',
    unit_name: 'Loja Padrão',
    role: 'user'
  },
  {
    id: 'admin-1',
    email: 'admin@tiquinho.com',
    password: 'admin',
    // Corrigido: network_tag e unit_name para seguir a interface User, e removido networkName
    network_tag: 'admin',
    unit_name: 'Escritório Central',
    role: 'admin'
  }
];

export const INITIAL_PRODUCTS: Product[] = [
  // Drogaria Total
  {
    id: 'dt-1',
    name: 'Polo Premium Bordada - Drogaria Total',
    price: 89.90,
    // Corrigido: image_url, network_tag, min_order e production_days para seguir a interface Product
    image_url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&q=80&w=400&h=500',
    network_tag: 'drogaria-total',
    category: 'Masculino',
    min_order: 10,
    production_days: 15
  },
  {
    id: 'dt-2',
    name: 'Baby Look Dry Fit - Drogaria Total',
    price: 75.00,
    // Corrigido: image_url, network_tag, min_order e production_days para seguir a interface Product
    image_url: 'https://images.unsplash.com/photo-1554568218-0f1715e72254?auto=format&fit=crop&q=80&w=400&h=500',
    network_tag: 'drogaria-total',
    category: 'Feminino',
    min_order: 10,
    production_days: 15
  },
  {
    id: 'dt-3',
    name: 'Jaqueta Softshell - Drogaria Total',
    price: 199.00,
    // Corrigido: image_url, network_tag, min_order e production_days para seguir a interface Product
    image_url: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&q=80&w=400&h=500',
    network_tag: 'drogaria-total',
    category: 'Inverno',
    min_order: 10,
    production_days: 15
  },
  {
    id: 'dt-4',
    name: 'Boné Bordado Ajustável',
    price: 45.00,
    // Corrigido: image_url, network_tag, min_order e production_days para seguir a interface Product
    image_url: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&q=80&w=400&h=500',
    network_tag: 'drogaria-total',
    category: 'Acessórios',
    min_order: 10,
    production_days: 15
  },
  // Genérica
  {
    id: 'gen-1',
    name: 'Jaleco Branco Standard',
    price: 110.00,
    // Corrigido: image_url, network_tag, min_order e production_days para seguir a interface Product
    image_url: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&q=80&w=400&h=500',
    network_tag: 'generica',
    category: 'Operacional',
    min_order: 10,
    production_days: 15
  },
  {
    id: 'gen-2',
    name: 'Camiseta Básica Preta',
    price: 39.90,
    // Corrigido: image_url, network_tag, min_order e production_days para seguir a interface Product
    image_url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80&w=400&h=500',
    network_tag: 'generica',
    category: 'Básico',
    min_order: 10,
    production_days: 15
  }
];

export const TIQUINHO_RED = '#E11D48';
