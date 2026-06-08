import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, addDoc, orderBy, getDocs, where, doc, getDoc } from 'firebase/firestore';
import { useBusiness } from '../context/BusinessContext';
import { ShoppingBag, ChevronRight, X, ChefHat, CheckCircle2, Clock, FileText, MessageCircle, Award, User, Phone, MapPin, Eye, History, Search } from 'lucide-react';
import { showToast } from '../utils/alert';
import { firestoreService } from '../services/firestoreService';

// Cookie Utility Functions
const setCookie = (name, value, days) => {
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax";
};

const getCookie = (name) => {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
};

const deleteCookie = (name) => {
    document.cookie = name + '=; Max-Age=-99999999; path=/; SameSite=Lax';
};

const ShopPage = () => {
    const business = useBusiness();
    const [products, setProducts] = useState([]);
    const [cart, setCart] = useState([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [loading, setLoading] = useState(true);
    const [cookingInstructions, setCookingInstructions] = useState('');
    const [orderStatus, setOrderStatus] = useState(null); // 'placing', 'success', 'error'
    const [lastOrderId, setLastOrderId] = useState(null); // To store the ID of the last placed order
    const [prescriptionFile, setPrescriptionFile] = useState(null);

    const urlTableId = new URLSearchParams(window.location.search).get('table');
    const [customerName, setCustomerName] = useState(''); // New state for customer name
    const [customerPhone, setCustomerPhone] = useState(''); // New state for customer phone
    const [currentTableId, setCurrentTableId] = useState(urlTableId || ''); // State for table ID

    // Order Tracking States
    const [showTrackOrder, setShowTrackOrder] = useState(false);
    const [trackOrderPhone, setTrackOrderPhone] = useState('');
    const [customerOrders, setCustomerOrders] = useState([]);
    const [trackOrderLoading, setTrackOrderLoading] = useState(false);
    const [trackOrderError, setTrackOrderError] = useState('');
    const [lastTrackedGuestOrder, setLastTrackedGuestOrder] = useState(null); // To store the single order from cookie

    const fetchCustomerOrders = async () => {
        if (!trackOrderPhone) {
            setTrackOrderError('Please enter a phone number.');
            setCustomerOrders([]);
            return;
        }
        setTrackOrderLoading(true);
        setTrackOrderError('');
        try {
            const q = query(collection(db, 'shop_orders'), where('customerPhone', '==', trackOrderPhone), orderBy('timestamp', 'desc'));
            const snapshot = await getDocs(q);
            if (snapshot.empty) {
                setTrackOrderError('No orders found for this phone number.');
                setCustomerOrders([]);
            } else {
                setCustomerOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            }
        } catch (error) {
            console.error("Error fetching customer orders:", error);
            setTrackOrderError('Failed to fetch orders. Please try again.');
            setCustomerOrders([]);
        } finally {
            setTrackOrderLoading(false);
        }
    };

    // New useEffect to handle cookie-based tracking
    useEffect(() => {
        const guestOrderId = getCookie('lastGuestOrderId');
        if (guestOrderId && !showTrackOrder) {
            // Automatically try to fetch this order
            const fetchGuestOrder = async () => {
                setTrackOrderLoading(true);
                setTrackOrderError('');
                try {
                    const docRef = doc(db, 'shop_orders', guestOrderId);
                    const docSnap = await getDoc(docRef); // You need to import getDoc
                    if (docSnap.exists()) {
                        setLastTrackedGuestOrder({ id: docSnap.id, ...docSnap.data() });
                        // Don't automatically show track order mode, just load the data
                        } else {
                        setTrackOrderError('Your last guest order was not found.');
                        deleteCookie('lastGuestOrderId');
                    }
                } catch (error) {
                    console.error("Error fetching guest order:", error);
                    setTrackOrderError('Failed to fetch your guest order.');
                    deleteCookie('lastGuestOrderId');
                } finally {
                    setTrackOrderLoading(false);
                }
            };
            fetchGuestOrder();
        }
    }, [showTrackOrder]); // Rerun if showTrackOrder changes

    const shopTitle = useMemo(() => {
        if (business.businessMode === 'restaurant') return currentTableId ? `Dining at Table ${currentTableId}` : 'Self Order Kiosk';
        if (business.businessMode === 'pharmacy') return 'Online Pharmacy';
        return 'Online Store';
    }, [currentTableId, business.businessMode]);

    const emptyMsg = useMemo(() => {
        return `No ${business.getTerm('products').toLowerCase()} found in this category.`;
    }, []);

    useEffect(() => {
        const q = query(collection(db, 'products'), orderBy('name'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Only show items with valid selling prices. 
            // If restaurant, ignore stock check (since menus are often 'infinite' stock).
            const validItems = items.filter(item => {
                const hasPrice = Number(item.sellingPrice) > 0;
                const hasStock = business.businessMode === 'restaurant' || Number(item.stock) > 0;
                if (!hasPrice) console.warn("Hidden item (no selling price):", item.name);
                else if (!hasStock) console.warn("Hidden item (out of stock):", item.name);
                return hasPrice && hasStock;
            });
            setProducts(validItems);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const categories = useMemo(() => {
        const cats = new Set(products.map(p => p.category || 'Uncategorized'));
        return ['All', ...Array.from(cats)];
    }, [products]);

    const filteredProducts = useMemo(() => {
        if (selectedCategory === 'All') return products;
        return products.filter(p => (p.category || 'Uncategorized') === selectedCategory);
    }, [products, selectedCategory]);

    const addToCart = (product) => {
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                return prev.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item);
            }
            return [...prev, { ...product, qty: 1 }];
        });
        showToast(`Added ${product.name}`, 'success');
    };

    const updateQuantity = (id, delta) => {
        setCart(prev => {
            return prev.map(item => {
                if (item.id === id) {
                    const newQty = item.qty + delta;
                    return newQty > 0 ? { ...item, qty: newQty } : null;
                }
                return item;
            }).filter(Boolean);
        });
    };

    const cartTotal = cart.reduce((sum, item) => sum + (Number(item.sellingPrice) * item.qty), 0);
    const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);
    const isRestaurant = business.businessMode === 'restaurant';
    const isPharmacy = business.businessMode === 'pharmacy';

    const handlePlaceOrder = async () => {
        if (cart.length === 0 && !prescriptionFile) return;
        setOrderStatus('placing');

        try {
            // 1. Add/Update Customer (if name or phone is provided)
            if (customerName || customerPhone) {
                const customerData = {
                    name: customerName || 'Guest',
                    phone: customerPhone || '',
                    lastVisit: new Date().toISOString()
                };

                let existingCustId = null;
                if (customerPhone) {
                    const qPhone = query(collection(db, 'customers'), where("phone", "==", customerPhone));
                    const snap = await getDocs(qPhone);
                    if (!snap.empty) existingCustId = snap.docs[0].id;
                } else if (customerName) {
                    const qName = query(collection(db, 'customers'), where("name", "==", customerName));
                    const snap = await getDocs(qName);
                    if (!snap.empty) existingCustId = snap.docs[0].id;
                }
                
                if (existingCustId) {
                    await firestoreService.updateCustomer(existingCustId, customerData);
                } else {
                    await firestoreService.addCustomer(customerData);
                }
            }

            const orderData = {
                items: cart.map(item => ({
                    id: item.id,
                    name: item.name,
                    qty: item.qty,
                    price: Number(item.sellingPrice),
                    total: Number(item.sellingPrice) * item.qty
                })),
                total: cartTotal,
                status: 'pending',
                source: tableId ? 'table_qr' : 'self_kiosk',
                tableId: tableId || 'Kiosk',
                cookingInstructions,
                hasPrescription: !!prescriptionFile,
                customerName: customerName || 'Guest',
                customerPhone: customerPhone || '',
                timestamp: Date.now(),
                tableId: currentTableId || null // Use currentTableId from state
                };

            const docRef = await addDoc(collection(db, 'shop_orders'), orderData);
            setLastOrderId(docRef.id);
            setCart([]);
            setPrescriptionFile(null);
            setOrderStatus('success');

            // If no customer phone was provided, store order ID in a cookie for tracking
            if (!customerPhone) {
                setCookie('lastGuestOrderId', docRef.id, 7); // Store for 7 days
            }


            setTimeout(() => {
                setOrderStatus(null);
            }, 5000);

        } catch (e) {
            console.error("Order failed", e);
            showToast("Failed to place order. Please try again.", "error");
            setOrderStatus('error');
        }
    };
// Module validation
if (!business.integrations?.includes('self_ordering')) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-4">
            <div className="text-center p-8 bg-[var(--surface)] rounded-3xl shadow-xl max-w-sm w-full border border-[var(--border)]">
                <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <X size={32} />
                </div>
                <h2 className="text-xl font-bold text-[var(--text-main)] mb-2">Self Ordering Disabled</h2>
                <p className="text-[var(--text-muted)] text-sm">This module has not been enabled for this business.</p>
            </div>
        </div>
    );
}

if (loading) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
            <div className="animate-spin w-8 h-8 border-4 border-[var(--primary)] border-t-transparent rounded-full"></div>
        </div>
    );
}

if (orderStatus === 'success') {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--background)] p-6">
            <div className="w-24 h-24 bg-green-100 text-green-500 rounded-full flex items-center justify-center mb-6 animate-bounce">
                <CheckCircle2 size={48} />
            </div>
            <h1 className="text-3xl font-extrabold text-[var(--text-main)] mb-2">Order Placed!</h1>
            <p className="text-[var(--text-muted)] text-center mb-8 max-w-xs">Your order has been sent directly to the kitchen. {tableId && `It will be served at Table ${tableId}.`}</p>
            <button
                onClick={() => setOrderStatus(null)}
                className="px-8 py-3 bg-[var(--primary)] text-white font-bold rounded-2xl shadow-lg hover:opacity-90 active:scale-95 transition-all"
            >
                Order More {business.getTerm('products')}
            </button>
        </div>
    );
}

return (
    <div className="min-h-screen pb-24 font-sans bg-[var(--background)]">
        {/* Zomato-style Header */}
        <header className="sticky top-0 z-10 shadow-sm px-4 py-4 rounded-b-3xl bg-[var(--surface)] border-b border-[var(--border)]">
            <div className="flex justify-between items-center mb-4">
                <div>
                    <p className="text-xs font-bold text-[var(--primary)] uppercase tracking-wider mb-1">
                        {showTrackOrder ? "Track Your Order" : (currentTableId ? `Dining at Table ${currentTableId}` : shopTitle)}
                    </p>
                    <h1 className="text-2xl font-black text-[var(--text-main)]">{business.appName}</h1>
                </div>
                <div className="flex gap-2 items-center">
                    {lastTrackedGuestOrder && !showTrackOrder && (
                        <button
                            onClick={() => setShowTrackOrder(true)}
                            className="px-4 py-2 bg-[var(--background)] text-[var(--primary)] rounded-full text-xs font-bold flex items-center gap-1 border border-[var(--border)]"
                        >
                            <Eye size={14} /> View My Last Order
                        </button>
                    )}
                    <button
                        onClick={() => setShowTrackOrder(prev => !prev)}
                        className="px-4 py-2 bg-[var(--background)] text-[var(--primary)] rounded-full text-xs font-bold flex items-center gap-1 border border-[var(--border)]"
                    >
                        {showTrackOrder ? <X size={14} /> : <History size={14} />} {showTrackOrder ? 'Close' : 'Track Order'}
                    </button>
                </div>
            </div>

            {/* Categories */}
            {!showTrackOrder && (
                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-5 py-2.5 rounded-full whitespace-nowrap text-sm font-bold transition-all ${selectedCategory === cat ? 'bg-[var(--primary)] text-white shadow-md' : 'bg-[var(--background)] text-[var(--text-muted)] border border-[var(--border)]'}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            )}
        </header>

        {/* Menu Items */}
        {showTrackOrder ? (
            <main className="p-4">
                <div className="bg-[var(--surface)] p-5 rounded-3xl shadow-sm border border-[var(--border)] mb-6">
                    <h2 className="text-xl font-bold text-[var(--text-main)] mb-4">Track Your Orders</h2>
                    <p className="text-[var(--text-muted)] text-sm mb-4">Enter your phone number to see your past orders and their current status.</p>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <input
                            type="tel"
                            placeholder="Your Phone Number"
                            value={trackOrderPhone}
                            onChange={e => setTrackOrderPhone(e.target.value)}
                            className="flex-1 rounded-xl p-3 text-sm focus:ring-2 focus:ring-[var(--primary)] outline-none bg-[var(--background)] border border-[var(--border)] text-[var(--text-main)] placeholder-[var(--text-muted)]"
                        />
                        <button
                            onClick={fetchCustomerOrders}
                            disabled={trackOrderLoading}
                            className="px-6 py-3 bg-[var(--primary)] text-white font-bold rounded-xl shadow-lg hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            {trackOrderLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Search size={18} />} Find Orders
                        </button>
                    </div>
                    {trackOrderError && <p className="text-red-500 text-sm mt-3">{trackOrderError}</p>}
                </div>

                {lastTrackedGuestOrder && (
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold text-[var(--text-main)]">Your Last Guest Order</h3>
                        <div key={lastTrackedGuestOrder.id} className="bg-[var(--surface)] p-4 rounded-3xl shadow-sm border border-[var(--border)]">
                            <div className="flex justify-between items-center mb-2">
                                <div>
                                    <p className="font-bold text-sm text-[var(--text-main)]">Order #{lastTrackedGuestOrder.id.slice(-6)}</p>
                                    <p className="text-xs text-[var(--text-muted)]">{new Date(lastTrackedGuestOrder.timestamp).toLocaleString()}</p>
                                </div>
                                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${lastTrackedGuestOrder.status === 'pending' ? 'bg-amber-100 text-amber-800' : lastTrackedGuestOrder.status === 'preparing' ? 'bg-blue-100 text-blue-800' : lastTrackedGuestOrder.status === 'ready' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                    {lastTrackedGuestOrder.status || 'Pending'}
                                </span>
                            </div>
                            {lastTrackedGuestOrder.customerName && <p className="text-sm text-[var(--text-muted)]">Customer: {lastTrackedGuestOrder.customerName}</p>}
                            {lastTrackedGuestOrder.customerPhone && <p className="text-sm text-[var(--text-muted)]">Phone: {lastTrackedGuestOrder.customerPhone}</p>}
                            <p className="text-[var(--text-main)] font-black text-lg mb-2">{business.currency}{lastTrackedGuestOrder.total.toFixed(2)}</p>
                            <div className="space-y-1 text-sm text-[var(--text-muted)]">
                                {lastTrackedGuestOrder.items.map((item, i) => (
                                    <p key={i}>{item.qty}x {item.name}</p>
                                ))}
                            </div>
                            <button 
                                onClick={() => deleteCookie('lastGuestOrderId')} // Option to clear cookie
                                className="mt-4 text-xs text-red-500 hover:underline"
                            >
                                Clear this order from my device
                            </button>
                        </div>
                    </div>
                )}

                {customerOrders.length > 0 && !lastTrackedGuestOrder && (
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold text-[var(--text-main)]">Your Orders ({customerOrders.length})</h3>
                        {customerOrders.map(order => (
                            <div key={order.id} className="bg-[var(--surface)] p-4 rounded-3xl shadow-sm border border-[var(--border)]">
                                <div className="flex justify-between items-center mb-2">
                                    <div>
                                        <p className="font-bold text-sm text-[var(--text-main)]">Order #{order.id.slice(-6)}</p>
                                        <p className="text-xs text-[var(--text-muted)]">{new Date(order.timestamp).toLocaleString()}</p>
                                    </div>
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${order.status === 'pending' ? 'bg-amber-100 text-amber-800' : order.status === 'preparing' ? 'bg-blue-100 text-blue-800' : order.status === 'ready' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                        {order.status || 'Pending'}
                                    </span>
                                </div>
                                <p className="text-[var(--text-main)] font-black text-lg mb-2">{business.currency}{order.total.toFixed(2)}</p>
                                <div className="space-y-1 text-sm text-[var(--text-muted)]">
                                    {order.items.map((item, i) => (
                                        <p key={i}>{item.qty}x {item.name}</p>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        ) : (
            <main className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {filteredProducts.map(product => {
                    const cartItem = cart.find(i => i.id === product.id);
                    return (
                        <div key={product.id} className="p-4 rounded-3xl shadow-sm border border-[var(--border)] flex gap-4 bg-[var(--surface)]">
                            <div className="w-24 h-24 rounded-2xl flex items-center justify-center shrink-0 bg-[var(--background)] border border-[var(--border)]">
                                {/* Use an emoji placeholder if no real image to prevent 429s */}
                                <span className="text-4xl">🍽️</span>
                            </div>
                            <div className="flex-1 flex flex-col justify-between">
                                <div>
                                    <h3 className="font-bold leading-tight mb-1 text-[var(--text-main)]">{product.name}</h3>
                                    <p className="font-bold text-[var(--primary)]">{business.currency}{Number(product.sellingPrice).toFixed(2)}</p>
                                </div>

                                {cartItem ? (
                                    <div className="flex items-center gap-3 bg-[var(--primary)]/10 rounded-xl p-1 w-max">
                                        <button onClick={() => updateQuantity(product.id, -1)} className="w-8 h-8 rounded-lg bg-[var(--surface)] text-[var(--primary)] font-bold shadow-sm flex items-center justify-center border border-[var(--border)]">-</button>
                                        <span className="font-bold text-[var(--primary)] min-w-[20px] text-center">{cartItem.qty}</span>
                                        <button onClick={() => updateQuantity(product.id, 1)} className="w-8 h-8 rounded-lg bg-[var(--primary)] text-white font-bold shadow-sm flex items-center justify-center">+</button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => addToCart(product)}
                                        className="font-bold px-4 py-2 rounded-xl text-sm self-start active:scale-95 transition-transform bg-[var(--background)] text-[var(--primary)] border border-[var(--border)]"
                                    >
                                        Add +
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
                {filteredProducts.length === 0 && (
                    <div className="col-span-full py-12 text-center font-medium text-[var(--text-muted)]">
                        No items found in this category.
                    </div>
                )}
            </main>
        )}

        {/* Sticky Bottom Cart Bar */}
        {cartCount > 0 && (
            <div className="fixed bottom-0 left-0 right-0 p-4 z-20 animate-fade-in pointer-events-none">
                <div className="max-w-md mx-auto pointer-events-auto">
                    <button
                        onClick={() => setIsCartOpen(true)}
                        className="w-full bg-[var(--primary)] text-white p-4 rounded-2xl shadow-xl flex justify-between items-center active:scale-[0.98] transition-all"
                    >
                        <div className="flex items-center gap-3">
                            <div className="bg-white/20 w-10 h-10 rounded-xl flex items-center justify-center font-bold">
                                {cartCount}
                            </div>
                            <div className="text-left">
                                <p className="text-xs text-white/80 font-medium mb-0.5">Total Amount</p>
                                <p className="font-black leading-none text-lg">{business.currency}{cartTotal.toFixed(2)}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 font-bold">
                            View Cart <ChevronRight size={20} />
                        </div>
                    </button>
                </div>
            </div>
        )}

        {/* Slide-Up Cart Modal */}
        {isCartOpen && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/60 backdrop-blur-sm">
                <div className="w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl h-[85vh] sm:h-auto sm:max-h-[85vh] flex flex-col animate-fade-in shadow-2xl overflow-hidden bg-[var(--surface)] border border-[var(--border)]">

                    <div className="p-5 border-b border-[var(--border)] flex justify-between items-center bg-[var(--background)]">
                        <h2 className="text-lg font-black flex items-center gap-2 text-[var(--text-main)]">
                            <ShoppingBag size={20} className="text-[var(--primary)]" /> Your Order
                        </h2>
                        <button onClick={() => setIsCartOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)]">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5">
                        <div className="space-y-4 mb-6">
                            {cart.map(item => (
                                <div key={item.id} className="flex justify-between items-center">
                                    <div className="flex gap-3 items-center">
                                        <div className="w-6 h-6 bg-green-500/10 rounded flex items-center justify-center border border-green-500/20">
                                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm text-[var(--text-main)]">{item.name}</p>
                                            <p className="text-xs font-medium text-[var(--text-muted)]">{business.currency}{Number(item.sellingPrice).toFixed(2)}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 rounded-lg p-1 bg-[var(--background)] border border-[var(--border)]">
                                        <button onClick={() => updateQuantity(item.id, -1)} className="w-7 h-7 flex items-center justify-center font-bold text-[var(--text-muted)]">-</button>
                                        <span className="font-bold text-sm w-4 text-center text-[var(--text-main)]">{item.qty}</span>
                                        <button onClick={() => updateQuantity(item.id, 1)} className="w-7 h-7 flex items-center justify-center font-bold text-[var(--primary)]">+</button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="rounded-2xl p-4 mb-6 bg-[var(--background)] border border-[var(--border)]">
                            <label className="flex items-center gap-2 text-sm font-bold mb-2 text-[var(--text-main)]">
                                <ChefHat size={16} className="text-[var(--primary)]" /> Cooking Instructions
                            </label>
                            <textarea
                                value={cookingInstructions}
                                onChange={e => setCookingInstructions(e.target.value)}
                                placeholder="Any specific requests (e.g. less spicy)..."
                                className="w-full rounded-xl p-3 text-sm focus:ring-2 focus:ring-[var(--primary)] outline-none resize-none bg-[var(--surface)] border border-[var(--border)] text-[var(--text-main)] placeholder-[var(--text-muted)]"
                                rows="2"
                            ></textarea>
                        </div>

                        <div className="rounded-2xl p-4 mb-4 flex items-start gap-3 bg-[var(--primary)]/10 border border-[var(--primary)]/20">
                            <Clock size={20} className="text-[var(--primary)] shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-bold mb-1 text-[var(--primary)]">{isRestaurant ? 'Direct to Kitchen' : 'Instant Order'}</p>
                                <p className="text-xs leading-relaxed text-[var(--primary)]/80">
                                    {isRestaurant
                                        ? "Your order will be sent immediately to the kitchen display system for preparation."
                                        : `Your order will be received immediately by the ${business.appName} team for processing.`
                                    }
                                </p>
                            </div>
                        </div>

                        {/* Customer Info (Optional) */}
                        <div className="rounded-2xl p-4 mb-6 bg-[var(--background)] border border-[var(--border)]">
                            <label className="flex items-center gap-2 text-sm font-bold mb-2 text-[var(--text-main)]">
                                <User size={16} className="text-[var(--primary)]" /> Your Contact Info (Optional)
                            </label>
                            <input
                                type="text"
                                placeholder="Your Name"
                                value={customerName}
                                onChange={e => setCustomerName(e.target.value)}
                                className="w-full rounded-xl p-3 mb-2 text-sm focus:ring-2 focus:ring-[var(--primary)] outline-none bg-[var(--surface)] border border-[var(--border)] text-[var(--text-main)] placeholder-[var(--text-muted)]"
                            />
                            <input
                                type="tel"
                                placeholder="Your Phone Number"
                                value={customerPhone}
                                onChange={e => setCustomerPhone(e.target.value)}
                                className="w-full rounded-xl p-3 text-sm focus:ring-2 focus:ring-[var(--primary)] outline-none bg-[var(--surface)] border border-[var(--border)] text-[var(--text-main)] placeholder-[var(--text-muted)]"
                            />
                            <p className="mt-2 text-[10px] text-[var(--text-muted)] leading-tight italic">
                                We'll use this to contact you about your order.
                            </p>
                        </div>

                        <div className="border-t-2 border-dashed border-[var(--border)] pt-4 mb-4">
                            <div className="flex justify-between items-center text-lg">
                                <span className="font-bold text-[var(--text-muted)]">Total to pay</span>
                                <span className="font-black text-[var(--text-main)]">{business.currency}{cartTotal.toFixed(2)}</span>
                            </div>
                        </div>
                        </div>

                    <div className="p-4 border-t bg-[var(--surface)] border-[var(--border)]">
                        <button
                            onClick={handlePlaceOrder}
                            disabled={orderStatus === 'placing' || (cart.length === 0 && !prescriptionFile)}
                            className="w-full text-white font-bold py-4 rounded-2xl flex justify-center items-center gap-2 text-lg active:scale-[0.98] transition-transform shadow-lg disabled:opacity-70 bg-[var(--primary)] hover:opacity-90"
                        >
                            {orderStatus === 'placing' ? (
                                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <>{isRestaurant ? (tableId ? "Send Order to Kitchen" : "Place Order") : (cart.length === 0 ? "Send Prescription" : "Place Order")} — {business.currency}{cartTotal.toFixed(2)}</>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
);
};

export default ShopPage;
