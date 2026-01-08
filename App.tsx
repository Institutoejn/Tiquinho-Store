
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ShoppingCart, 
  LogOut, 
  Plus, 
  Minus, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Package, 
  ArrowRight, 
  BarChart3, 
  PlusCircle, 
  Bell, 
  Trash2, 
  DollarSign, 
  TrendingUp, 
  LayoutGrid, 
  Image as ImageIcon, 
  Pencil, 
  Upload, 
  Info, 
  ChevronRight, 
  Settings, 
  MessageCircle, 
  QrCode, 
  Clock 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { USERS, INITIAL_PRODUCTS } from './constants';
import { Product, CartItem, Size, AppNotification, User as UserType, Order } from './types';

// --- COMPONENTES AUXILIARES ---

const Logo = ({ className = "w-10 h-10" }: { className?: string }) => (
  <div className={`${className} bg-rose-600 rounded-2xl flex items-center justify-center shadow-lg shadow-rose-600/20 select-none`}>
    <span className="text-2xl font-black text-white italic tracking-tighter -skew-x-6">T</span>
  </div>
);

const Toast = ({ message, type, onClose }: { message: string, type: 'success' | 'error', onClose: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-6 py-4 rounded-3xl shadow-2xl glass transition-all border-white/10 ${
        type === 'success' ? 'text-white' : 'bg-rose-600/90 text-white'
      }`}
    >
      {type === 'success' ? <CheckCircle2 size={20} className="text-rose-500" /> : <AlertCircle size={20} />}
      <span className="font-semibold text-sm tracking-tight">{message}</span>
    </motion.div>
  );
};

const ProductCard: React.FC<{ product: Product, onAddToCart: (p: Product, s: Size) => void }> = ({ product, onAddToCart }) => {
  const sizes: Size[] = (product.availableSizes && product.availableSizes.length > 0) 
    ? product.availableSizes 
    : [];
  
  const [selectedSize, setSelectedSize] = useState<Size | null>(null);

  return (
    <motion.div 
      whileHover={{ y: -8 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="bg-zinc-900/40 border border-white/5 rounded-[32px] overflow-hidden backdrop-blur-md flex flex-col group shadow-xl hover:shadow-rose-600/5 transition-all"
    >
      <div className="relative aspect-[4/5] bg-zinc-950 overflow-hidden">
        <motion.img 
          src={product.image} 
          alt={product.name} 
          className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-all duration-700"
          whileHover={{ scale: 1.05 }}
        />
        <div className="absolute top-5 left-5">
          <span className="bg-zinc-900/60 backdrop-blur-xl text-white text-[10px] font-extrabold px-3 py-1.5 rounded-full border border-white/10 uppercase tracking-[0.1em]">
            {product.category}
          </span>
        </div>
      </div>

      <div className="p-7 flex-1 flex flex-col">
        <div className="mb-5">
          <h3 className="text-lg font-bold text-white mb-1 tracking-tight group-hover:text-rose-500 transition-colors duration-300 line-clamp-2 min-h-[3.2rem]">
            {product.name}
          </h3>
          <p className="text-2xl font-black text-white/90">R$ {product.price.toFixed(2)}</p>
        </div>

        <div className="mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Grade de Tamanhos</p>
            {product.stock !== undefined && (
              <span className="text-[10px] font-black text-rose-500/80 uppercase tracking-widest">
                {product.stock} em estoque
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2.5">
            {sizes.length > 0 ? sizes.map(size => (
              <button
                key={size}
                onClick={() => setSelectedSize(size)}
                className={`px-3 py-2.5 min-w-[3rem] rounded-2xl text-xs font-bold transition-all border ${
                  selectedSize === size 
                    ? 'bg-rose-600 border-rose-600 text-white shadow-lg shadow-rose-600/20' 
                    : 'bg-zinc-800/50 border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                }`}
              >
                {size}
              </button>
            )) : (
              <p className="text-[10px] text-zinc-600 font-bold italic">Sem grade definida</p>
            )}
          </div>
        </div>

        <motion.button 
          whileTap={selectedSize ? { scale: 0.95 } : {}}
          disabled={!selectedSize}
          onClick={() => selectedSize && onAddToCart(product, selectedSize)}
          className={`w-full mt-auto font-bold py-4 rounded-2xl transition-all shadow-xl flex items-center justify-center gap-2 ${
            selectedSize 
            ? 'bg-white hover:bg-zinc-200 text-zinc-950 cursor-pointer' 
            : 'bg-zinc-800 text-zinc-600 cursor-not-allowed opacity-50'
          }`}
        >
          <Plus size={18} strokeWidth={3} /> <span className="uppercase tracking-tight">{selectedSize ? 'Adicionar' : 'Selecione o Tamanho'}</span>
        </motion.button>
      </div>
    </motion.div>
  );
};

// --- APP PRINCIPAL ---

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isPixModalOpen, setIsPixModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('tiquinho_products');
    const base = saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
    return base.map((p: Product) => ({
      ...p,
      availableSizes: p.availableSizes || ['P', 'M', 'G', 'GG'],
      stock: p.stock ?? 10 // Valor padrão se não existir
    }));
  });
  
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    const saved = localStorage.getItem('tiquinho_notifications');
    return saved ? JSON.parse(saved) : [];
  });

  const [orders, setOrders] = useState<Order[]>(() => {
    const saved = localStorage.getItem('tiquinho_orders');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState({ 
    name: '', 
    price: '', 
    image: '', 
    networkTag: 'drogaria-total', 
    category: 'Masculino',
    description: '',
    stock: '',
    availableSizes: [] as Size[]
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sizeOptions: Size[] = ['P', 'M', 'G', 'GG', 'XG', 'Único'];

  useEffect(() => {
    localStorage.setItem('tiquinho_products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('tiquinho_notifications', JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem('tiquinho_orders', JSON.stringify(orders));
  }, [orders]);

  const filteredProducts = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'admin') return products;
    return products.filter(p => p.networkTag === currentUser.networkTag || p.networkTag === 'generica');
  }, [currentUser, products]);

  const stats = useMemo(() => {
    const totalStock = products.reduce((acc, p) => acc + (p.stock || 0), 0);
    const confirmedSales = orders.reduce((acc, o) => acc + (o.status === 'Pago/Aguardando Produção' ? o.total : 0), 0);
    
    const networks = products.map(p => p.networkTag);
    const mostFrequent = networks.length > 0 ? [...networks].sort((a,b) =>
          networks.filter(v => v===a).length
        - networks.filter(v => v===b).length
    ).pop() : null;
    
    const networkNameMap: Record<string, string> = {
      'drogaria-total': 'Drogaria Total',
      'farmacia-abc': 'Farmácia ABC',
      'generica': 'Uso Geral'
    };

    return {
      stock: totalStock,
      revenue: confirmedSales,
      activeNetwork: networkNameMap[mostFrequent || ''] || 'N/A'
    };
  }, [products, orders]);

  const userNotifications = useMemo(() => {
    if (!currentUser) return [];
    return notifications.filter(n => n.networkTag === currentUser.networkTag || n.networkTag === 'generica');
  }, [currentUser, notifications]);

  const cartTotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  }, [cart]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const user = USERS.find(u => u.email === loginEmail && u.password === loginPassword);
    if (user) {
      setCurrentUser(user);
      showToast(`Bem-vindo, ${user.unitName}!`);
    } else {
      showToast('E-mail ou senha inválidos.', 'error');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCart([]);
    setIsCartOpen(false);
    setIsNotificationsOpen(false);
    setIsPixModalOpen(false);
    setLoginEmail('');
    setLoginPassword('');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewProduct(prev => ({ ...prev, image: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleSizeSelection = (size: Size) => {
    setNewProduct(prev => ({
      ...prev,
      availableSizes: prev.availableSizes.includes(size)
        ? prev.availableSizes.filter(s => s !== size)
        : [...prev.availableSizes, size]
    }));
  };

  const handleAddProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.networkTag || !newProduct.stock) {
      showToast('Preencha os campos obrigatórios.', 'error');
      return;
    }
    if (newProduct.availableSizes.length === 0) {
      showToast('Defina a grade de tamanhos.', 'error');
      return;
    }

    if (editingId) {
      setProducts(prev => prev.map(p => p.id === editingId ? {
        ...p,
        name: newProduct.name,
        price: parseFloat(newProduct.price),
        image: newProduct.image || p.image,
        networkTag: newProduct.networkTag,
        category: newProduct.category,
        description: newProduct.description,
        stock: parseInt(newProduct.stock),
        availableSizes: newProduct.availableSizes
      } : p));
      showToast('Uniforme atualizado!');
      setEditingId(null);
    } else {
      const id = `new-${Date.now()}`;
      const product: Product = {
        id,
        name: newProduct.name,
        price: parseFloat(newProduct.price) || 0,
        image: newProduct.image || 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&q=80&w=400&h=500',
        networkTag: newProduct.networkTag,
        category: newProduct.category,
        description: newProduct.description,
        stock: parseInt(newProduct.stock) || 0,
        availableSizes: newProduct.availableSizes
      };
      setProducts(prev => [product, ...prev]);
      const notification: AppNotification = {
        id: `notif-${Date.now()}`,
        networkTag: newProduct.networkTag,
        message: `Novo uniforme para sua rede: ${product.name}`,
        createdAt: Date.now()
      };
      setNotifications(prev => [notification, ...prev]);
      showToast('Publicado com sucesso!');
    }
    setNewProduct({ name: '', price: '', image: '', networkTag: 'drogaria-total', category: 'Masculino', description: '', stock: '', availableSizes: [] });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const startEdit = (p: Product) => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setEditingId(p.id);
    setNewProduct({
      name: p.name,
      price: p.price.toString(),
      image: p.image,
      networkTag: p.networkTag,
      category: p.category,
      description: p.description || '',
      stock: p.stock?.toString() || '0',
      availableSizes: p.availableSizes || []
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setNewProduct({ name: '', price: '', image: '', networkTag: 'drogaria-total', category: 'Masculino', description: '', stock: '', availableSizes: [] });
  };

  const deleteProduct = (id: string) => {
    if (confirm('Tem certeza que deseja remover este produto?')) {
      setProducts(prev => prev.filter(p => p.id !== id));
      showToast('Produto removido');
    }
  };

  const addToCart = (product: Product, size: Size) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id && item.selectedSize === size);
      if (existing) {
        return prev.map(item => 
          (item.id === product.id && item.selectedSize === size) 
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      }
      return [...prev, { ...product, selectedSize: size, quantity: 1 }];
    });
    showToast('Adicionado ao carrinho');
  };

  const updateQuantity = (id: string, size: Size, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id && item.selectedSize === size) {
        return { ...item, quantity: Math.max(1, item.quantity + delta) };
      }
      return item;
    }));
  };

  const removeFromCart = (id: string, size: Size) => {
    setCart(prev => prev.filter(item => !(item.id === id && item.selectedSize === size)));
  };

  const handleSupportClick = () => {
    if (!currentUser) return;
    const message = `Olá, sou da unidade ${currentUser.unitName} (${currentUser.networkName}) e preciso de suporte com os uniformes da minha unidade.`;
    window.open(`https://wa.me/5517992198086?text=${encodeURIComponent(message)}`, '_blank');
  };

  const confirmPixPayment = () => {
    if (!currentUser) return;
    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      unitName: currentUser.unitName,
      networkName: currentUser.networkName,
      total: cartTotal,
      items: [...cart],
      status: 'Pago/Aguardando Produção',
      createdAt: Date.now()
    };
    // Reduzir estoque real ao confirmar PIX
    setProducts(prev => prev.map(p => {
      const cartItem = cart.find(ci => ci.id === p.id);
      if (cartItem) {
        return { ...p, stock: Math.max(0, (p.stock || 0) - cartItem.quantity) };
      }
      return p;
    }));
    setOrders(prev => [newOrder, ...prev]);
    setCart([]);
    setIsPixModalOpen(false);
    setIsCartOpen(false);
    showToast('Pedido enviado para produção!', 'success');
  };

  const handleCheckoutWhatsApp = () => {
    if (!currentUser || cart.length === 0) return;
    let message = `*ORÇAMENTO - TIQUINHO CORPORATE*\n\n`;
    message += `*Unidade:* ${currentUser.unitName}\n`;
    message += `*Rede:* ${currentUser.networkName}\n\n`;
    message += `*ÍTENS:*\n`;
    cart.forEach(item => {
      message += `• ${item.name} (${item.selectedSize}) x${item.quantity} - R$ ${(item.price * item.quantity).toFixed(2)}\n`;
    });
    message += `\n*TOTAL: R$ ${cartTotal.toFixed(2)}*`;
    window.open(`https://wa.me/5517992198086?text=${encodeURIComponent(message)}`, '_blank');
  };

  // TELA DE LOGIN
  if (!currentUser) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center p-6 relative overflow-hidden"
      >
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-rose-600/10 rounded-full blur-[120px]" />
        
        <AnimatePresence>
          {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </AnimatePresence>
        
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="w-full max-w-md z-10"
        >
          <div className="flex flex-col items-center mb-10 text-center">
            <motion.div 
              whileHover={{ scale: 1.05, rotate: -5 }}
              className="mb-8"
            >
              <Logo className="w-24 h-24" />
            </motion.div>
            <p className="text-zinc-500 text-sm mt-2 font-semibold uppercase tracking-widest">Tiquinho Uniformes</p>
          </div>

          <div className="glass p-10 rounded-[40px] shadow-2xl">
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-1">E-mail Corporativo</label>
                <input 
                  type="email" 
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="ex: contato@tiquinho.com"
                  className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white focus:outline-none focus:ring-2 focus:ring-rose-600/50 transition-all font-medium"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-1">Senha de Acesso</label>
                <input 
                  type="password" 
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-zinc-900/50 border border-white/5 p-4 rounded-2xl text-white focus:outline-none focus:ring-2 focus:ring-rose-600/50 transition-all font-medium"
                  required
                />
              </div>
              <motion.button 
                whileTap={{ scale: 0.98 }}
                type="submit"
                className="w-full bg-rose-600 hover:bg-rose-500 text-white font-black py-5 rounded-2xl transition-all shadow-xl shadow-rose-600/20 flex items-center justify-center gap-3 uppercase tracking-tight text-sm"
              >
                Entrar no Sistema <ChevronRight size={18} strokeWidth={3} />
              </motion.button>
            </form>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  // --- DASHBOARD ADMIN ---
  if (currentUser.role === 'admin') {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen bg-[#09090b] text-zinc-100 pb-20"
      >
        <AnimatePresence>
          {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </AnimatePresence>
        
        <header className="sticky top-0 z-50 glass px-6 py-4 border-b border-white/5">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-5">
              <Logo className="w-10 h-10" />
              <div>
                <h2 className="text-sm font-extrabold text-white tracking-tight leading-none uppercase">Central de Gestão</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
                  <p className="text-[10px] text-rose-500 font-black uppercase tracking-widest">Painel Administrativo</p>
                </div>
              </div>
            </div>
            <button 
              onClick={handleLogout} 
              className="p-2.5 bg-zinc-800/50 text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-2xl transition-all border border-white/5"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 pt-10 space-y-16">
          <section>
            <div className="flex items-center gap-3 mb-8">
              <BarChart3 className="text-rose-600" size={24} strokeWidth={3} />
              <h2 className="text-2xl font-black text-white tracking-tighter uppercase">Performance Global</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { label: 'Unidades em Estoque', val: stats.stock.toLocaleString(), icon: Package, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                { label: 'Receita Confirmada (PIX)', val: `R$ ${stats.revenue.toLocaleString()}`, icon: DollarSign, color: 'text-green-500', bg: 'bg-green-500/10' },
                { label: 'Rede mais Ativa', val: stats.activeNetwork, icon: TrendingUp, color: 'text-rose-500', bg: 'bg-rose-500/10' },
              ].map((stat, i) => (
                <div key={i} className="bg-zinc-900/50 p-8 rounded-[32px] border border-white/5 shadow-2xl overflow-hidden relative group">
                  <div className={`p-4 w-fit rounded-2xl mb-6 ${stat.bg} ${stat.color}`}>
                    <stat.icon size={24} strokeWidth={3} />
                  </div>
                  <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mb-2">{stat.label}</p>
                  <p className="text-3xl font-black text-white tracking-tighter leading-tight">{stat.val}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Histórico Recente */}
          <section>
            <div className="flex items-center gap-3 mb-8">
              <Clock className="text-rose-600" size={24} strokeWidth={3} />
              <h2 className="text-2xl font-black text-white tracking-tighter uppercase">Histórico de Pagamentos</h2>
            </div>
            <div className="bg-zinc-900/30 border border-white/5 rounded-[40px] overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-zinc-950/50 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                      <th className="px-8 py-5">Unidade / Rede</th>
                      <th className="px-8 py-5">Valor Total</th>
                      <th className="px-8 py-5">Status</th>
                      <th className="px-8 py-5">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {orders.length === 0 ? (
                      <tr><td colSpan={4} className="px-8 py-10 text-center text-zinc-600 font-bold uppercase tracking-widest text-xs">Nenhum pagamento registrado</td></tr>
                    ) : orders.map(o => (
                      <tr key={o.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-8 py-6">
                          <p className="text-sm font-bold text-white tracking-tight">{o.unitName}</p>
                          <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">{o.networkName}</p>
                        </td>
                        <td className="px-8 py-6 text-sm font-black text-rose-500">R$ {o.total.toFixed(2)}</td>
                        <td className="px-8 py-6">
                          <span className="bg-green-500/10 text-green-500 text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border border-green-500/20">{o.status}</span>
                        </td>
                        <td className="px-8 py-6 text-zinc-500 text-[10px] font-bold">{new Date(o.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Cadastro de Uniforme */}
          <section className="bg-zinc-900/30 border border-white/5 rounded-[40px] p-10 shadow-3xl relative">
            <div className="absolute top-0 left-0 w-2 bg-rose-600 h-full opacity-50" />
            <div className="flex items-center gap-4 mb-10">
              <div className="p-3 bg-rose-600/10 rounded-2xl">
                {editingId ? <Pencil className="text-rose-600" size={28} /> : <PlusCircle className="text-rose-600" size={28} />}
              </div>
              <h2 className="text-3xl font-black text-white tracking-tighter">
                {editingId ? 'Editar Uniforme' : 'Publicar Novo Modelo'}
              </h2>
            </div>

            <form onSubmit={handleAddProduct} className="space-y-10">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                <div className="space-y-5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-1 block">Fotografia do Produto</label>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="relative aspect-square rounded-[32px] bg-zinc-950 border-2 border-dashed border-white/10 hover:border-rose-600/50 transition-all cursor-pointer flex flex-col items-center justify-center group overflow-hidden"
                  >
                    {newProduct.image ? (
                      <img src={newProduct.image} className="w-full h-full object-cover" alt="Preview" />
                    ) : (
                      <div className="flex flex-col items-center text-zinc-700">
                        <ImageIcon size={64} strokeWidth={1} className="mb-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Upload de Imagem</span>
                      </div>
                    )}
                  </div>
                  <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
                </div>

                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-1">Título do Uniforme *</label>
                      <input 
                        type="text" value={newProduct.name}
                        onChange={e => setNewProduct({...newProduct, name: e.target.value})}
                        className="w-full bg-zinc-950/50 border border-white/5 p-5 rounded-2xl text-white font-bold"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-1">Preço (R$)</label>
                        <input type="number" step="0.01" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} className="w-full bg-zinc-950/50 border border-white/5 p-5 rounded-2xl text-white font-bold" required />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-1">Estoque Inicial</label>
                        <input type="number" value={newProduct.stock} onChange={e => setNewProduct({...newProduct, stock: e.target.value})} className="w-full bg-zinc-950/50 border border-white/5 p-5 rounded-2xl text-white font-bold" required />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-1">Grade de Tamanhos Disponíveis *</label>
                      <div className="flex flex-wrap gap-2.5">
                        {sizeOptions.map(size => (
                          <button
                            key={size} type="button"
                            onClick={() => toggleSizeSelection(size)}
                            className={`flex-1 min-w-[3.5rem] py-3.5 rounded-2xl text-xs font-black transition-all border ${
                              newProduct.availableSizes.includes(size)
                                ? 'bg-rose-600 border-rose-400 text-white shadow-lg'
                                : 'bg-zinc-950/50 border-white/5 text-zinc-500 hover:text-zinc-300'
                            }`}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-1">Rede Franqueada *</label>
                      <select value={newProduct.networkTag} onChange={e => setNewProduct({...newProduct, networkTag: e.target.value})} className="w-full bg-zinc-950/50 border border-white/5 p-5 rounded-2xl text-white font-bold appearance-none">
                        <option value="drogaria-total">Drogaria Total</option>
                        <option value="farmacia-abc">Farmácia ABC</option>
                        <option value="generica">Uso Geral</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                {editingId && (
                  <button type="button" onClick={cancelEdit} className="px-8 bg-zinc-800 text-white font-black rounded-3xl uppercase tracking-tight">Cancelar</button>
                )}
                <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} type="submit" className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-black py-5 rounded-3xl shadow-2xl flex items-center justify-center gap-3 uppercase tracking-tight">
                  <CheckCircle2 size={22} strokeWidth={3} /> {editingId ? 'Salvar Alterações' : 'Publicar e Notificar Rede'}
                </motion.button>
              </div>
            </form>
          </section>

          {/* Controle de Catálogo */}
          <section>
            <div className="flex items-center gap-3 mb-8">
              <LayoutGrid className="text-rose-600" size={24} strokeWidth={3} />
              <h2 className="text-2xl font-black text-white tracking-tighter uppercase">Controle de Catálogo</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map(p => (
                <div key={p.id} className="bg-zinc-900/50 border border-white/5 rounded-[32px] p-6 flex flex-col gap-4 backdrop-blur-md shadow-2xl relative overflow-hidden group">
                  <div className="flex gap-5">
                    <img src={p.image} className="w-20 h-20 object-cover rounded-2xl shadow-lg group-hover:scale-105 transition-transform duration-500" alt="" />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-white line-clamp-1 group-hover:text-rose-500 transition-colors">{p.name}</h4>
                      <p className="text-[10px] text-zinc-500 font-black uppercase tracking-wider mb-2">{p.networkTag}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-rose-500 font-black text-sm">R$ {p.price.toFixed(2)}</span>
                        <div className="bg-white/5 px-2.5 py-1 rounded-full border border-white/5 flex items-center gap-1.5">
                          <Package size={10} className="text-zinc-500" />
                          <span className="text-[10px] text-zinc-300 font-black uppercase">Estoque: {p.stock} un</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => startEdit(p)} 
                      className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-black uppercase py-3 rounded-2xl transition-all border border-white/5 flex items-center justify-center gap-2"
                    >
                      <Pencil size={12} /> Editar
                    </button>
                    <button 
                      onClick={() => deleteProduct(p.id)} 
                      className="p-3 bg-rose-600/10 text-rose-500 hover:bg-rose-600 hover:text-white rounded-2xl transition-all border border-rose-500/10"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
      </motion.div>
    );
  }

  // --- DASHBOARD USUÁRIO (LOJA) ---
  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="min-h-screen bg-[#09090b] text-zinc-100 pb-20 selection:bg-rose-600/30"
    >
      <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>

      <header className="sticky top-0 z-50 glass px-6 py-4 border-b border-white/5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-5">
            <Logo className="w-10 h-10" />
            <div className="hidden sm:block">
              <h2 className="text-base font-extrabold text-white tracking-tighter leading-none uppercase">Portal Tiquinho</h2>
              <p className="text-[10px] text-rose-500 font-black uppercase tracking-[0.2em] mt-1">Corporate Edition</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => setIsNotificationsOpen(true)} className="relative p-3 text-zinc-400 hover:text-white bg-zinc-900/50 rounded-2xl border border-white/5">
              <Bell size={20} strokeWidth={2.5} />
              {userNotifications.length > 0 && <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-rose-600 rounded-full border-2 border-[#09090b] shadow-xl" />}
            </motion.button>
            
            <div className="bg-zinc-900/50 border border-white/5 px-5 py-2.5 rounded-2xl hidden md:flex items-center gap-3 text-xs font-bold text-white/80">
              <div className="w-2 h-2 bg-green-500 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
              {currentUser.networkName} <span className="text-zinc-600 mx-1">/</span> {currentUser.unitName}
            </div>
            
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => setIsCartOpen(true)} className="relative p-3 bg-zinc-900/50 text-zinc-300 border border-white/5 rounded-2xl">
              <ShoppingCart size={20} strokeWidth={2.5} />
              {cart.length > 0 && <span className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-full border-2 border-[#09090b] shadow-xl">{cart.reduce((a, b) => a + b.quantity, 0)}</span>}
            </motion.button>
            
            <button onClick={handleLogout} className="p-3 text-zinc-500 hover:text-rose-500 rounded-2xl transition-all"><LogOut size={20} strokeWidth={2.5} /></button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-12">
          <h1 className="text-5xl font-black text-white tracking-tighter mb-4 leading-none">Uniformes Oficiais</h1>
          <p className="text-zinc-500 font-medium text-lg max-w-2xl leading-relaxed">
            Catálogo exclusivo produzido para a rede <span className="text-white font-bold">{currentUser.networkName}</span>.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-10">
          {filteredProducts.map((p, idx) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
              <ProductCard product={p} onAddToCart={addToCart} />
            </motion.div>
          ))}
        </div>
      </main>

      {/* Botão de Suporte WhatsApp */}
      <motion.button
        whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
        onClick={handleSupportClick}
        className="fixed bottom-8 right-8 z-[90] w-16 h-16 bg-zinc-900 border border-white/10 text-emerald-500 rounded-full shadow-2xl flex items-center justify-center group backdrop-blur-xl"
      >
        <MessageCircle size={32} strokeWidth={2.5} />
      </motion.button>

      {/* Drawer Carrinho */}
      <AnimatePresence>
        {isCartOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm" onClick={() => setIsCartOpen(false)} />
            <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25 }} className="fixed right-4 top-4 bottom-4 z-[110] w-full max-w-md glass rounded-[40px] shadow-3xl flex flex-col border border-white/10 overflow-hidden">
              <div className="p-8 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-rose-600/10 rounded-2xl"><ShoppingCart className="text-rose-600" size={24} strokeWidth={3} /></div>
                  <h2 className="text-2xl font-black text-white tracking-tighter">Minha Lista</h2>
                </div>
                <button onClick={() => setIsCartOpen(false)} className="p-2 text-zinc-500 hover:text-white transition-colors"><X size={24} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-600 opacity-40"><Package size={80} strokeWidth={1} className="mb-6" /><p className="text-[10px] font-black uppercase tracking-[0.3em]">Lista vazia</p></div>
                ) : cart.map(item => (
                  <div key={`${item.id}-${item.selectedSize}`} className="flex gap-5 p-5 bg-zinc-950/40 rounded-[32px] border border-white/5">
                    <img src={item.image} className="w-20 h-20 object-cover rounded-2xl" alt="" />
                    <div className="flex-1 flex flex-col justify-between">
                      <div className="flex justify-between items-start"><h4 className="text-sm font-black text-white tracking-tight line-clamp-1">{item.name}</h4><button onClick={() => removeFromCart(item.id, item.selectedSize)}><X size={16} className="text-zinc-700" /></button></div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[9px] bg-zinc-900 px-2 py-1 rounded-md text-zinc-400 font-black uppercase">Tamanho: {item.selectedSize}</span>
                        <p className="text-sm font-black text-white">R$ {(item.price * item.quantity).toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-4 mt-3 bg-zinc-900/80 w-fit px-3 py-1.5 rounded-xl">
                        <button onClick={() => updateQuantity(item.id, item.selectedSize, -1)}><Minus size={12} /></button>
                        <span className="text-xs font-black">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, item.selectedSize, 1)}><Plus size={12} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {cart.length > 0 && (
                <div className="p-8 border-t border-white/5 bg-zinc-950/80 backdrop-blur-2xl space-y-4">
                  <div className="flex items-center justify-between text-white font-black text-2xl"><span className="text-[10px] text-zinc-500 uppercase tracking-widest">Total Estimado</span><span className="text-rose-500">R$ {cartTotal.toFixed(2)}</span></div>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setIsPixModalOpen(true)} className="bg-white text-zinc-950 font-black py-4 rounded-2xl flex items-center justify-center gap-2 uppercase text-[10px] tracking-tight shadow-xl"><QrCode size={18} /> Gerar PIX</button>
                    <button onClick={handleCheckoutWhatsApp} className="bg-zinc-800 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 uppercase text-[10px] tracking-tight border border-white/5"><MessageCircle size={18} /> Orçar</button>
                  </div>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* PIX Modal */}
      <AnimatePresence>
        {isPixModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={() => setIsPixModalOpen(false)} />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-sm glass p-10 rounded-[48px] border border-white/10 text-center flex flex-col items-center">
              <div className="p-4 bg-emerald-500/10 rounded-3xl mb-8"><QrCode size={40} className="text-emerald-500" /></div>
              <h3 className="text-2xl font-black text-white tracking-tighter mb-8 uppercase">Pagamento Instantâneo</h3>
              <div className="bg-white p-6 rounded-[40px] shadow-2xl mb-8">
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=PIX-TIQUINHO-${cartTotal}`} className="w-44 h-44" alt="" />
              </div>
              <div className="mb-8"><p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-1">Total a Pagar</p><p className="text-4xl font-black text-white">R$ {cartTotal.toFixed(2)}</p></div>
              <button onClick={confirmPixPayment} className="w-full bg-rose-600 text-white font-black py-5 rounded-3xl shadow-2xl uppercase tracking-tight text-sm">Confirmar Pagamento</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
