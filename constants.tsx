
import { Product, User } from './types';

export const USERS: User[] = [
  {
    id: '1',
    email: 'contato@drogariatotal.com',
    password: 'admin',
    networkName: 'Drogaria Total',
    networkTag: 'drogaria-total',
    unitName: 'Unidade Matriz',
    role: 'user'
  },
  {
    id: '2',
    email: 'franquia@drogariatotal.com',
    password: 'admin',
    networkName: 'Drogaria Total',
    networkTag: 'drogaria-total',
    unitName: 'Unidade Franqueada 01',
    role: 'user'
  },
  {
    id: '3',
    email: 'loja@generica.com',
    password: 'admin',
    networkName: 'Rede Genérica',
    networkTag: 'generica',
    unitName: 'Loja Padrão',
    role: 'user'
  },
  {
    id: 'admin-1',
    email: 'admin@tiquinho.com',
    password: 'admin',
    networkName: 'Tiquinho Uniformes',
    networkTag: 'admin',
    unitName: 'Escritório Central',
    role: 'admin'
  }
];

export const INITIAL_PRODUCTS: Product[] = [
  // Drogaria Total
  {
    id: 'dt-1',
    name: 'Polo Premium Bordada - Drogaria Total',
    price: 89.90,
    image: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&q=80&w=400&h=500',
    networkTag: 'drogaria-total',
    category: 'Masculino',
    minOrder: 10,
    productionTime: '15 dias úteis'
  },
  {
    id: 'dt-2',
    name: 'Baby Look Dry Fit - Drogaria Total',
    price: 75.00,
    image: 'https://images.unsplash.com/photo-1554568218-0f1715e72254?auto=format&fit=crop&q=80&w=400&h=500',
    networkTag: 'drogaria-total',
    category: 'Feminino',
    minOrder: 10,
    productionTime: '15 dias úteis'
  },
  {
    id: 'dt-3',
    name: 'Jaqueta Softshell - Drogaria Total',
    price: 199.00,
    image: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&q=80&w=400&h=500',
    networkTag: 'drogaria-total',
    category: 'Inverno',
    minOrder: 10,
    productionTime: '15 dias úteis'
  },
  {
    id: 'dt-4',
    name: 'Boné Bordado Ajustável',
    price: 45.00,
    image: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&q=80&w=400&h=500',
    networkTag: 'drogaria-total',
    category: 'Acessórios',
    minOrder: 10,
    productionTime: '15 dias úteis'
  },
  // Genérica
  {
    id: 'gen-1',
    name: 'Jaleco Branco Standard',
    price: 110.00,
    image: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&q=80&w=400&h=500',
    networkTag: 'generica',
    category: 'Operacional',
    minOrder: 10,
    productionTime: '15 dias úteis'
  },
  {
    id: 'gen-2',
    name: 'Camiseta Básica Preta',
    price: 39.90,
    image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80&w=400&h=500',
    networkTag: 'generica',
    category: 'Básico',
    minOrder: 10,
    productionTime: '15 dias úteis'
  }
];

export const TIQUINHO_RED = '#E11D48';
