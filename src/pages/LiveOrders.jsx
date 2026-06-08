import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ChefHat, Check, Trash2, Clock, MapPin, Phone, User, ShoppingBag } from 'lucide-react';
import { showSuccess, showError } from '../utils/alert';
import { useBusiness } from '../context/BusinessContext'

export default function LiveOrders() {
    const business = useBusiness()
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(collection(db, 'shop_orders'), orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setOrders(fetched);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const updateStatus = async (id, status) => {
        try {
            await updateDoc(doc(db, 'shop_orders', id), { status });
            showSuccess(`Order marked as ${status}`);
        } catch (error) {
            showError('Failed to update status');
        }
    };

    const deleteOrder = async (id) => {
        if (!await showConfirm("Delete Order?", "This action cannot be undone.")) return;
        try {
            await deleteDoc(doc(db, 'shop_orders', id));
            showSuccess('Order deleted');
        } catch (error) {
            showError('Failed to delete order');
        }
    };

    const simulateOrder = async (source) => {
        try {
            const mockOrder = {
                customerName: source === 'swiggy' ? 'Rahul Kumar' : 'Sneha Sharma',
                customerPhone: '9876543210',
                address: '123, Maple Street, Sector 5',
                items: [
                    { name: 'Paneer Butter Masala', qty: 1, price: 250 },
                    { name: 'Garlic Naan', qty: 2, price: 40 }
                ],
                totalAmount: 330,
                status: 'pending',
                source: source,
                type: 'delivery',
                date: new Date().toISOString()
            };
            await addDoc(collection(db, 'shop_orders'), mockOrder);
            showSuccess(`Mock ${source} order injected!`);
        } catch (err) {
            showError("Simulation failed");
        }
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full"></div>
            </div>
        );
    }

    const pendingOrders = orders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status) || !o.status);
    const completedOrders = orders.filter(o => o.status === 'completed');

    const getStatusInfo = (status) => {
        switch(status) {
            case 'preparing': return { label: 'Preparing', color: 'bg-amber-500', next: 'ready', nextLabel: 'Mark Ready' };
            case 'ready': return { label: 'Ready', color: 'bg-green-500', next: 'completed', nextLabel: 'Mark Delivered' };
            default: return { label: 'Pending', color: 'bg-red-500', next: 'preparing', nextLabel: 'Start Preparing' };
        }
    };

    const getSourceTag = (source) => {
        if (source === 'swiggy') return <span className="bg-[#fc8019] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase">Swiggy</span>;
        if (source === 'zomato') return <span className="bg-[#cb202d] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase">Zomato</span>;
        return null;
    };

    return (
        <div className="p-4 md:p-8 animate-fade-in">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-2">
                        <ChefHat size={28} className="text-primary" /> {business.getTerm('kitchen')} (Live {business.getTerm('orders')})
                    </h1>
                    <p className="text-[var(--text-muted)] text-sm mt-1">Real-time table orders and online requests</p>
                </div>
                <div className="flex items-center gap-3">
                    {business.integrations?.includes('zomato_swiggy') && (
                        <div className="hidden md:flex gap-2 mr-4 border-r pr-4 border-[var(--border)]">
                            <button onClick={() => simulateOrder('swiggy')} className="text-[10px] font-black bg-[#fc8019] text-white px-3 py-1.5 rounded-lg hover:opacity-90">MOCK SWIGGY</button>
                            <button onClick={() => simulateOrder('zomato')} className="text-[10px] font-black bg-[#cb202d] text-white px-3 py-1.5 rounded-lg hover:opacity-90">MOCK ZOMATO</button>
                        </div>
                    )}
                    <div className="bg-primary/10 text-primary px-4 py-2 rounded-xl font-bold text-sm">
                        {pendingOrders.length} Active Orders
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {pendingOrders.map(order => {
                    const statusInfo = getStatusInfo(order.status);
                    return (
                        <div key={order.id} className="bg-[var(--surface)] border border-primary/30 shadow-lg shadow-primary/5 rounded-2xl p-5 relative overflow-hidden flex flex-col min-h-[400px]">
                            <div className={`absolute top-0 right-0 ${statusInfo.color} text-white text-[10px] font-black px-3 py-1 rounded-bl-xl shadow-sm uppercase tracking-widest`}>
                                {statusInfo.label}
                            </div>
                            
                            <div className="flex justify-between items-start mb-4 border-b border-[var(--border)] pb-3">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="font-bold text-lg text-[var(--text-main)]">
                                            {order.type === 'table_order' ? `Table ${order.tableId}` : (order.source || 'Takeaway')}
                                        </h3>
                                        {getSourceTag(order.source)}
                                    </div>
                                    <p className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                                        <Clock size={12} /> {new Date(order.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </p>
                                </div>
                                <span className="text-xl font-black text-primary">{business.currency}{order.totalAmount}</span>
                            </div>

                            {order.type !== 'table_order' && (
                                <div className="mb-4 space-y-1">
                                    <p className="text-sm font-semibold flex items-center gap-2 text-[var(--text-main)]"><User size={14}/> {order.customerName}</p>
                                    <p className="text-sm flex items-center gap-2 text-[var(--text-muted)]"><Phone size={14}/> {order.customerPhone}</p>
                                    {order.address && <p className="text-sm flex items-start gap-2 text-[var(--text-muted)]"><MapPin size={14} className="mt-1 flex-shrink-0"/> <span className="line-clamp-2">{order.address}</span></p>}
                                </div>
                            )}
                            
                            {order.note && (
                                <div className="bg-orange-50 text-orange-800 text-xs p-2 rounded-lg mb-4 border border-orange-200">
                                    <strong>Note:</strong> {order.note}
                                </div>
                            )}

                            <div className="bg-[var(--background)] rounded-xl p-3 mb-5 border border-[var(--border)] flex-1">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2 flex items-center gap-1">
                                    <ShoppingBag size={12}/> Order Items
                                </h4>
                                <ul className="space-y-2">
                                    {order.items.map((item, i) => (
                                        <li key={i} className="flex justify-between text-sm items-center">
                                            <span className="font-bold text-[var(--text-main)]">{item.qty}x <span className="font-normal">{item.name}</span></span>
                                            <span className="text-[var(--text-muted)] text-xs">{business.currency}{item.price}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="flex gap-2 mt-auto pt-4 border-t border-dashed border-[var(--border)]">
                                <button 
                                    onClick={() => updateStatus(order.id, statusInfo.next)}
                                    className={`flex-1 ${statusInfo.color} text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-md`}
                                >
                                    <Check size={18} /> {statusInfo.nextLabel}
                                </button>
                                <button 
                                    onClick={() => deleteOrder(order.id)}
                                    className="px-4 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    );
                })}
                
                {pendingOrders.length === 0 && (
                    <div className="col-span-full py-12 flex flex-col items-center justify-center text-[var(--text-muted)] bg-[var(--surface)] border border-dashed border-[var(--border)] rounded-2xl">
                        <ChefHat size={48} className="mb-4 opacity-20" />
                        <p className="text-lg font-bold">No Active Orders</p>
                        <p className="text-sm">New orders will appear here instantly</p>
                    </div>
                )}
            </div>

            {/* Completed Orders Section (Collapsible or just a simple list below) */}
            {completedOrders.length > 0 && (
                <div className="mt-12 opacity-70">
                    <h2 className="text-lg font-bold mb-4 text-[var(--text-main)] flex items-center gap-2">
                        <Check size={20} className="text-green-500"/> Recently Completed
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {completedOrders.slice(0, 8).map(order => (
                            <div key={order.id} className="bg-[var(--surface)] p-3 rounded-xl border border-[var(--border)] flex justify-between items-center shadow-sm">
                                <div>
                                    <p className="font-bold text-sm text-[var(--text-main)]">{order.type === 'table_order' ? `Table ${order.tableId}` : order.customerName}</p>
                                    <p className="text-xs text-[var(--text-muted)]">{new Date(order.date).toLocaleTimeString()}</p>
                                </div>
                                <span className="font-bold text-primary">{business.currency}{order.totalAmount}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
