import React, { useState, useEffect } from 'react'
import { Plus, Search, Trash2, Save, History, User, Pencil, X } from 'lucide-react'
import { firestoreService } from '../services/firestoreService'
import { generatePurchasePDF } from '../utils/pdfGenerator'
import { showError, showSuccess, showConfirm } from '../utils/alert'

const Purchases = ({ isStaff }) => {
    const [products, setProducts] = useState([])
    const [purchases, setPurchases] = useState([])
    const [suppliers, setSuppliers] = useState([])
    const [isViewHistory, setIsViewHistory] = useState(false)
    const [loading, setLoading] = useState(true)
    const [editingPurchase, setEditingPurchase] = useState(null)
    const [newProductModal, setNewProductModal] = useState({ open: false, name: '', category: 'Fertilizer', unit: 'Bag', gst: 5 })

    const [newPurchase, setNewPurchase] = useState({
        supplierName: '',
        invoiceNo: '',
        date: new Date().toISOString().split('T')[0],
        items: [],
        totalAmount: 0
    })

    const [searchTerm, setSearchTerm] = useState('')
    const [searchResults, setSearchResults] = useState([])
    const [supplierSearch, setSupplierSearch] = useState('')

    const [supplierResults, setSupplierResults] = useState([])

    // Financial Year Logic
    const getCurrentFY = () => {
        const today = new Date();
        const month = today.getMonth(); // 0-11
        const year = today.getFullYear();
        return month >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
    }
    const [selectedFY, setSelectedFY] = useState(getCurrentFY())

    useEffect(() => {
        const unsubProducts = firestoreService.subscribeProducts(setProducts)
        const unsubPurchases = firestoreService.subscribePurchases((data) => {
            setPurchases(data)
            setLoading(false)
        })
        const unsubSuppliers = firestoreService.subscribeSuppliers(setSuppliers)
        return () => {
            unsubProducts()
            unsubPurchases()
            unsubSuppliers()
        }
    }, [])

    const handleSupplierSearch = (val) => {
        setSupplierSearch(val)
        setNewPurchase({ ...newPurchase, supplierName: val })
        if (val.length > 0) {
            const filtered = suppliers.filter(s => (s.name || '').toLowerCase().includes(val.toLowerCase()))
            setSupplierResults(filtered)
        } else {
            setSupplierResults([])
        }
    }

    const selectSupplier = (s) => {
        setNewPurchase({ ...newPurchase, supplierName: s.name })
        setSupplierSearch(s.name)
        setSupplierResults([])
    }

    const handleEdit = (pur) => {
        setEditingPurchase(pur)
        setNewPurchase({
            ...pur,
            date: pur.date || new Date().toISOString().split('T')[0]
        })
        setSupplierSearch(pur.supplierName)
        setIsViewHistory(false)
    }

    const resetForm = () => {
        setNewPurchase({
            supplierName: '', invoiceNo: '', date: new Date().toISOString().split('T')[0], items: [], totalAmount: 0
        })
        setSupplierSearch('')
        setEditingPurchase(null)
    }

    const handleSearch = (val) => {
        setSearchTerm(val)
        if (val.length > 1) {
            const filtered = products.filter(p => (p.name || '').toLowerCase().includes(val.toLowerCase()))
            setSearchResults(filtered)
        } else {
            setSearchResults([])
        }
    }

    const addItem = (product) => {
        const existing = newPurchase.items.find(item => item.id === product.id)
        if (!existing) {
            setNewPurchase({
                ...newPurchase,
                items: [...newPurchase.items, {
                    id: product.id || null, // null for new items to be created
                    name: product.name,
                    quantity: 1,
                    // Assume stored purchasePrice is INCLUSIVE based on current app logic
                    rateIncl: product.purchasePrice || 0,
                    rateExcl: (product.purchasePrice || 0) / (1 + ((product.gst || 5) / 100)),
                    gst: product.gst || 5,
                    category: product.category || 'Fertilizer',
                    purchasePrice: product.purchasePrice || 0 // Keep consistent for DB save
                }]
            })
        }
        setSearchTerm('')
        setSearchResults([])
    }

    const removeItem = (id, name) => {
        setNewPurchase({
            ...newPurchase,
            items: newPurchase.items.filter(item => (item.id ? item.id !== id : item.name !== name))
        })
    }

    const updateItem = (itemId, itemName, field, value) => {
        setNewPurchase({
            ...newPurchase,
            items: newPurchase.items.map(item => {
                const isMatch = item.id ? item.id === itemId : item.name === itemName;
                if (!isMatch) return item;

                let newItem = { ...item };

                // 1. Handle String/Empty Inputs directly (no immediate number parsing for state)
                // This fixes the "cannot delete zero" and "decimal point" issues
                if (value === '') {
                    newItem[field] = '';
                    // If converting empty string to calculation, treat as 0 temporarily
                    // But we return early to keep the empty string in the UI
                    return newItem;
                }

                // 2. Parse for calculations (safe fallback)
                const numVal = parseFloat(value);
                if (isNaN(numVal)) {
                    newItem[field] = value; // Keep invalid input to allow correction
                    return newItem;
                }

                // Update the changed field
                newItem[field] = value; // Store raw value to preserve .0 or . endings

                // 3. Perform Calculations based on what changed
                const qty = parseFloat(field === 'quantity' ? numVal : newItem.quantity) || 0;
                const gst = parseFloat(field === 'gst' ? numVal : newItem.gst) || 0;

                if (field === 'quantity') {
                    // Qty changed -> Update Total, keep Rate constant
                    // Rate Incl is master
                    const rateIncl = parseFloat(newItem.rateIncl) || 0;
                    newItem.lineTotal = (rateIncl * qty).toFixed(2);
                }
                else if (field === 'gst') {
                    // GST changed -> Keep Rate Excl constant, update Rate Incl and Total
                    const rateExcl = parseFloat(newItem.rateExcl) || 0;
                    const newRateIncl = rateExcl * (1 + (numVal / 100));
                    newItem.rateIncl = newRateIncl.toFixed(2);
                    newItem.purchasePrice = newRateIncl;
                    newItem.lineTotal = (newRateIncl * qty).toFixed(2);
                    newItem.lineTotalExcl = (rateExcl * qty).toFixed(2);
                }
                else if (field === 'rateExcl') {
                    // Rate Excl changed -> Update Rate Incl and Total
                    const newRateIncl = numVal * (1 + (gst / 100));
                    newItem.rateIncl = newRateIncl.toFixed(2);
                    newItem.purchasePrice = newRateIncl;
                    newItem.lineTotal = (newRateIncl * qty).toFixed(2);
                    newItem.lineTotalExcl = (numVal * qty).toFixed(2);
                }
                else if (field === 'lineTotalExcl') {
                    // Amount (Excl) changed [Matches Invoice "Amount" column]
                    // Calculate Rate Excl
                    if (qty > 0) {
                        const newRateExcl = numVal / qty;
                        const newRateIncl = newRateExcl * (1 + (gst / 100));
                        newItem.rateExcl = newRateExcl.toFixed(2);
                        newItem.rateIncl = newRateIncl.toFixed(2);
                        newItem.purchasePrice = newRateIncl;
                        newItem.lineTotal = (newRateIncl * qty).toFixed(2);
                    }
                }
                else if (field === 'rateIncl') {
                    // Rate Incl changed -> Update Rate Excl and Total
                    const newRateExcl = numVal / (1 + (gst / 100));
                    newItem.rateExcl = newRateExcl.toFixed(2);
                    newItem.purchasePrice = numVal;
                    newItem.lineTotal = (numVal * qty).toFixed(2);
                    newItem.lineTotalExcl = (newRateExcl * qty).toFixed(2);
                }
                else if (field === 'lineTotal') {
                    // Total changed -> Calculate new Unit Rate (Incl & Excl)
                    if (qty > 0) {
                        const newRateIncl = numVal / qty;
                        const newRateExcl = newRateIncl / (1 + (gst / 100));
                        newItem.rateIncl = newRateIncl.toFixed(2);
                        newItem.purchasePrice = newRateIncl;
                        newItem.rateExcl = newRateExcl.toFixed(2);
                        newItem.lineTotalExcl = (newRateExcl * qty).toFixed(2);
                    }
                }

                return newItem;
            })
        })
    }

    const total = newPurchase.items.reduce((acc, item) => {
        // Use the explicitly calculated lineTotal if available, else calc on fly
        const t = parseFloat(item.lineTotal) || ((parseFloat(item.rateIncl || item.purchasePrice) || 0) * (parseFloat(item.quantity) || 0));
        return acc + t
    }, 0)

    const handleSave = async () => {
        if (!newPurchase.supplierName || newPurchase.items.length === 0) {
            showError("Please fill supplier and add items")
            return
        }

        try {
            if (editingPurchase) {
                await firestoreService.updatePurchase(editingPurchase.docId || editingPurchase.id, {
                    ...newPurchase,
                    totalAmount: total
                })
                showSuccess("Purchase Updated Successfully!")
            } else {
                const purchaseId = `PUR-${Date.now().toString().slice(-6)}`
                const purchaseData = {
                    ...newPurchase,
                    totalAmount: total,
                    id: purchaseId
                }
                await firestoreService.addPurchase(purchaseData)
                showSuccess("Purchase Entry Saved & PDF Generated!")
            }

            resetForm()
        } catch (err) {
            showError("Error: " + err.message)
        }
    }

    const handleSearchKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (searchResults.length > 0) {
                addItem(searchResults[0]);
            } else if (searchTerm.trim().length > 1) {
                // Open new product modal instead of adding directly
                setNewProductModal({
                    open: true,
                    name: searchTerm.trim(),
                    category: 'Fertilizer',
                    unit: 'Bag',
                    gst: 5
                });
            }
        }
    }

    const handleNewProductSubmit = (e) => {
        e.preventDefault();

        const trimmedName = newProductModal.name.trim();
        const existingProduct = products.find(p => p.name.toLowerCase() === trimmedName.toLowerCase());

        if (existingProduct) {
            addItem(existingProduct);
            showSuccess("Selected existing product: " + existingProduct.name);
        } else {
            addItem({
                name: trimmedName,
                category: newProductModal.category,
                unit: newProductModal.unit,
                gst: parseFloat(newProductModal.gst),
                purchasePrice: 0, // Will be set in the main table
                stock: 0
            });
        }
        setNewProductModal({ open: false, name: '', category: 'Fertilizer', unit: 'Bag', gst: 5 });
    }

    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768)
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    return (
        <div className="purchases space-y-6">
            <div className="flex gap-3 mb-6 overflow-x-auto pb-2 scrollbar-hide">
                <button
                    onClick={() => { setIsViewHistory(false); resetForm(); }}
                    className={`flex-1 md:flex-none px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all border ${!isViewHistory ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'bg-white text-gray-600 border-gray-200 hover:border-primary/30'}`}
                >
                    <Plus size={18} /> {editingPurchase ? 'Edit Mode' : 'New Entry'}
                </button>
                <button
                    onClick={() => setIsViewHistory(true)}
                    className={`flex-1 md:flex-none px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all border ${isViewHistory ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'bg-white text-gray-600 border-gray-200 hover:border-primary/30'}`}
                >
                    <History size={18} /> History
                </button>
            </div>

            {!isViewHistory ? (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    <div className="lg:col-span-3 space-y-6">
                        <div className="card p-5 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-800 mb-5 flex items-center justify-between">
                                <span className="flex items-center gap-2"><User size={20} className="text-primary" /> Supplier Information</span>
                                {editingPurchase && <button onClick={resetForm} className="text-xs bg-red-50 text-red-500 px-2 py-1 rounded-lg flex items-center gap-1"><X size={12} /> Cancel Edit</button>}
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                <div className="space-y-1 relative">
                                    <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest pl-1">Agency Name</label>
                                    <input
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all font-medium"
                                        value={newPurchase.supplierName}
                                        onChange={e => handleSupplierSearch(e.target.value)}
                                        type="text" placeholder="e.g. IFFCO Agency"
                                        autoComplete="off"
                                    />
                                    {supplierResults.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 bg-white rounded-xl shadow-2xl z-20 border border-gray-100 mt-2 max-h-[200px] overflow-y-auto divide-y divide-gray-50">
                                            {supplierResults.map(s => (
                                                <div key={s.id} onClick={() => selectSupplier(s)} className="p-3 cursor-pointer hover:bg-primary/5 transition-colors font-medium text-sm">
                                                    {s.name}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest pl-1">Invoice No</label>
                                    <input className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all font-medium" value={newPurchase.invoiceNo} onChange={e => setNewPurchase({ ...newPurchase, invoiceNo: e.target.value })} type="text" placeholder="Inv-123" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest pl-1">Purchase Date</label>
                                    <input className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all font-medium" value={newPurchase.date} onChange={e => setNewPurchase({ ...newPurchase, date: e.target.value })} type="date" />
                                </div>
                            </div>
                        </div>

                        <div className="card p-5 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-800 mb-5">Product List</h3>
                            <div className="relative mb-6">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    id="purchase-search"
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all font-medium"
                                    type="text"
                                    placeholder="Search or type new product name..."
                                    value={searchTerm}
                                    onChange={(e) => handleSearch(e.target.value)}
                                    onKeyDown={handleSearchKeyDown}
                                />
                                {searchTerm.length > 1 && (
                                    <div className="absolute top-[54px] left-0 right-0 bg-white rounded-xl shadow-2xl z-10 border border-gray-100 max-h-[250px] overflow-y-auto divide-y divide-gray-50">
                                        {searchResults.map(p => (
                                            <div key={p.id} onClick={() => addItem(p)} className="p-4 cursor-pointer hover:bg-primary/5 transition-colors font-bold text-gray-700">
                                                {p.name}
                                            </div>
                                        ))}
                                        {!searchResults.find(p => p.name.toLowerCase() === searchTerm.toLowerCase()) && (
                                            <div
                                                onClick={() => setNewProductModal({
                                                    open: true,
                                                    name: searchTerm.trim(),
                                                    category: 'Fertilizer',
                                                    unit: 'Bag',
                                                    gst: 5
                                                })}
                                                className="p-4 cursor-pointer bg-green-50 hover:bg-green-100 text-green-700 font-black flex items-center gap-2"
                                            >
                                                <Plus size={18} />
                                                Create New Item: "{searchTerm}"
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="overflow-x-auto -mx-5 px-5">
                                <table className="w-full min-w-[600px] border-collapse">
                                    <thead>
                                        <tr className="text-left bg-gray-50 border-b border-gray-100">
                                            <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-widest">Product</th>
                                            <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-widest w-20">Rate (Excl)</th>
                                            <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-widest w-16">GST %</th>
                                            <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-widest w-20">Rate (Incl)</th>
                                            <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-widest w-16">Qty</th>
                                            <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-widest w-28 text-right">Amount</th>
                                            <th className="px-4 py-3 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {newPurchase.items.map(item => (
                                            <tr key={item.id || item.name} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-4 py-4">
                                                    <div className="font-bold text-gray-800 leading-tight">{item.name}</div>
                                                    {!item.id && <div className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded mt-1 inline-block uppercase">New Product</div>}
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="relative">
                                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                                                        <input
                                                            className="pl-5 pr-2 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-700 focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
                                                            type="number"
                                                            style={{ width: `${Math.max(6, (item.rateExcl?.toString().length || 0) + 2)}ch`, minWidth: '80px' }}
                                                            value={item.rateExcl !== undefined ? item.rateExcl : (parseFloat(item.purchasePrice || 0) / (1 + (item.gst || 5) / 100)).toFixed(2)}
                                                            onChange={e => updateItem(item.id, item.name, 'rateExcl', e.target.value)}
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <input
                                                        className="px-2 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-700 focus:border-primary focus:ring-1 focus:ring-primary text-center shadow-sm"
                                                        type="number"
                                                        style={{ width: `${Math.max(4, (item.gst?.toString().length || 0) + 1)}ch`, minWidth: '50px' }}
                                                        value={item.gst}
                                                        onChange={e => updateItem(item.id, item.name, 'gst', e.target.value)}
                                                    />
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="relative">
                                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                                                        <input
                                                            className="pl-5 pr-2 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-700 focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
                                                            type="number"
                                                            style={{ width: `${Math.max(6, (item.rateIncl?.toString().length || 0) + 2)}ch`, minWidth: '80px' }}
                                                            value={item.rateIncl !== undefined ? item.rateIncl : item.purchasePrice}
                                                            onChange={e => updateItem(item.id, item.name, 'rateIncl', e.target.value)}
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <input
                                                        className="px-2 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-700 focus:border-primary focus:ring-1 focus:ring-primary text-center shadow-sm"
                                                        type="number"
                                                        style={{ width: `${Math.max(4, (item.quantity?.toString().length || 0) + 1)}ch`, minWidth: '60px' }}
                                                        value={item.quantity}
                                                        onChange={e => updateItem(item.id, item.name, 'quantity', e.target.value)}
                                                    />
                                                </td>
                                                <td className="px-4 py-4 text-right">
                                                    <div className="relative">
                                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                                                        <input
                                                            className="pl-5 pr-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-extrabold text-gray-900 focus:border-primary focus:ring-1 focus:ring-primary text-right shadow-sm"
                                                            type="number"
                                                            style={{ width: `${Math.max(7, (item.lineTotalExcl?.toString().length || 0) + 2)}ch`, minWidth: '100px' }}
                                                            placeholder="Amount"
                                                            value={item.lineTotalExcl !== undefined ? item.lineTotalExcl : ((parseFloat(item.rateExcl !== undefined ? item.rateExcl : (parseFloat(item.purchasePrice || 0) / (1 + (item.gst || 5) / 100))) || 0) * (parseFloat(item.quantity) || 0)).toFixed(2)}
                                                            onChange={e => updateItem(item.id, item.name, 'lineTotalExcl', e.target.value)}
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 text-right">
                                                    <button
                                                        onClick={() => removeItem(item.id, item.name)}
                                                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {newPurchase.items.length === 0 && (
                                            <tr>
                                                <td colSpan="6" className="px-5 py-12 text-center text-gray-400 font-medium italic">Your purchase list is empty. Search products above to add them!</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-1">
                        <div className="card p-6 shadow-xl border-t-4 border-primary sticky top-[86px]">
                            <h3 className="text-xl font-bold text-gray-800 mb-6">Full Summary</h3>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500 font-medium tracking-tight">Total Unique Items</span>
                                    <span className="font-bold text-gray-700">{newPurchase.items.length}</span>
                                </div>
                                <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
                                    <div className="text-[10px] font-extrabold text-primary uppercase tracking-widest pl-1 mb-1">Total Payable Amount</div>
                                    <div className="text-3xl font-black text-primary tracking-tighter leading-none">₹{total.toFixed(2)}</div>
                                </div>
                                <button
                                    onClick={handleSave}
                                    className="w-full py-4 bg-primary hover:bg-primary-dark text-white rounded-2xl font-black text-lg shadow-lg shadow-primary/20 flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-95"
                                >
                                    <Save size={20} /> {editingPurchase ? 'UPDATE ENTRY' : 'SAVE ENTRY'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                        <h3 className="font-bold text-gray-700 flex items-center gap-2">
                            <History size={18} /> Purchase History
                        </h3>
                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Purchase</div>
                                <div className="text-lg font-bold text-primary">
                                    ₹{purchases.filter(p => {
                                        const d = new Date(p.date || new Date());
                                        const y = d.getFullYear();
                                        const fy = d.getMonth() >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
                                        return fy === selectedFY;
                                    }).reduce((acc, curr) => acc + (parseFloat(curr.totalAmount) || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                            <div className="h-8 w-px bg-gray-200"></div>
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Financial Year</span>
                                <select
                                    value={selectedFY}
                                    onChange={(e) => setSelectedFY(e.target.value)}
                                    className="px-2 py-1 bg-white border border-gray-200 rounded-md text-sm font-bold text-gray-700 focus:border-primary outline-none shadow-sm cursor-pointer"
                                >
                                    {Array.from(new Set([...purchases.map(p => {
                                        const d = new Date(p.date || new Date());
                                        const y = d.getFullYear();
                                        return d.getMonth() >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
                                    }), getCurrentFY()])).sort().reverse().map(fy => (
                                        <option key={fy} value={fy}>{fy}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className="table-container">
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', background: '#f8fafc' }}>
                                    <th style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>Date</th>
                                    <th style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>ID</th>
                                    <th style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>Supplier</th>
                                    <th style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>Inv #</th>
                                    <th style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>Items</th>
                                    <th style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'right' }}>Total</th>
                                    <th style={{ padding: '16px', width: '50px' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {purchases.filter(p => {
                                    const d = new Date(p.date);
                                    const y = d.getFullYear();
                                    const fy = d.getMonth() >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
                                    return fy === selectedFY;
                                }).slice().reverse().map(pur => (
                                    <tr key={pur.id} style={{ borderBottom: '1px solid #f1f5f9' }} className="table-row">
                                        <td style={{ padding: '16px' }}>{pur.date}</td>
                                        <td style={{ padding: '16px', fontWeight: 600 }}>#{pur.id?.slice(-6)}</td>
                                        <td style={{ padding: '16px' }}>{pur.supplierName}</td>
                                        <td style={{ padding: '16px' }}>{pur.invoiceNo || 'N/A'}</td>
                                        <td style={{ padding: '16px' }}>{pur.items?.length} items</td>
                                        <td style={{ padding: '16px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>₹{Number(pur.totalAmount).toFixed(2)}</td>
                                        <td style={{ padding: '16px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                            <button
                                                onClick={async () => {
                                                    if (await showConfirm("Confirm Return?", "Stock will be reversed.")) {
                                                        firestoreService.deletePurchase(pur.docId || pur.id).catch(err => showError(err.message));
                                                    }
                                                }}
                                                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Return / Delete"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleEdit(pur)}
                                                className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="Edit Purchase"
                                            >
                                                <Pencil size={18} />
                                            </button>
                                            <button
                                                onClick={() => generatePurchasePDF(pur)}
                                                className="p-2 text-gray-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                                title="Download PDF"
                                            >
                                                <Save size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {purchases.length === 0 && (
                                    <tr>
                                        <td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No purchase history found</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}


            {/* New Product Modal */}
            {newProductModal.open && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="text-lg font-bold text-gray-800">Add New Product</h3>
                            <button onClick={() => setNewProductModal({ ...newProductModal, open: false })} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleNewProductSubmit} className="p-6 space-y-4">
                            <div className="relative">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Product Name</label>
                                <input
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                                    value={newProductModal.name}
                                    onChange={e => setNewProductModal({ ...newProductModal, name: e.target.value })}
                                    autoFocus
                                    required
                                    placeholder="Enter product name"
                                    autoComplete="off"
                                />
                                {newProductModal.name.length > 1 && (
                                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-xl z-20 overflow-hidden max-h-40 overflow-y-auto">
                                        {products.filter(p => p.name.toLowerCase().includes(newProductModal.name.toLowerCase()) && p.name.toLowerCase() !== newProductModal.name.toLowerCase()).map(p => (
                                            <div
                                                key={p.id}
                                                onClick={() => {
                                                    addItem(p);
                                                    setNewProductModal({ ...newProductModal, open: false });
                                                }}
                                                className="p-3 text-sm text-gray-600 hover:bg-primary/5 cursor-pointer flex justify-between items-center border-b border-gray-50 last:border-0"
                                            >
                                                <span className="font-medium">{p.name}</span>
                                                <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Use Existing</span>
                                            </div>
                                        ))}
                                        {products.some(p => p.name.toLowerCase() === newProductModal.name.toLowerCase()) && (
                                            <div className="p-3 text-sm text-red-500 bg-red-50 font-bold flex items-center gap-2">
                                                <span>⚠️ Product already exists!</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Category</label>
                                    <select
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                                        value={newProductModal.category}
                                        onChange={e => setNewProductModal({ ...newProductModal, category: e.target.value })}
                                    >
                                        <option value="Fertilizer">Fertilizer</option>
                                        <option value="Pesticide">Pesticide</option>
                                        <option value="Seeds">Seeds</option>
                                        <option value="Bio">Bio</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Unit</label>
                                    <select
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                                        value={newProductModal.unit}
                                        onChange={e => setNewProductModal({ ...newProductModal, unit: e.target.value })}
                                    >
                                        <option value="Bag">Bag</option>
                                        <option value="Bottle">Bottle</option>
                                        <option value="Packet">Packet</option>
                                        <option value="Kg">Kg</option>
                                        <option value="Ltr">Ltr</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">GST %</label>
                                <select
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                                    value={newProductModal.gst}
                                    onChange={e => setNewProductModal({ ...newProductModal, gst: e.target.value })}
                                >
                                    <option value="0">0%</option>
                                    <option value="5">5%</option>
                                    <option value="12">12%</option>
                                    <option value="18">18%</option>
                                    <option value="28">28%</option>
                                </select>
                            </div>
                            <div className="pt-2 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setNewProductModal({ ...newProductModal, open: false })}
                                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition-colors"
                                >
                                    Cancel
                                </button>
                                {products.some(p => p.name.toLowerCase() === newProductModal.name.trim().toLowerCase()) ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const existing = products.find(p => p.name.toLowerCase() === newProductModal.name.trim().toLowerCase());
                                            if (existing) addItem(existing);
                                            setNewProductModal({ ...newProductModal, open: false });
                                        }}
                                        className="flex-1 py-3 bg-primary hover:bg-primary-dark text-white rounded-xl font-bold shadow-lg shadow-primary/20 transition-all transform active:scale-95"
                                    >
                                        Use Existing
                                    </button>
                                ) : (
                                    <button
                                        type="submit"
                                        className="flex-1 py-3 bg-primary hover:bg-primary-dark text-white rounded-xl font-bold shadow-lg shadow-primary/20 transition-all transform active:scale-95"
                                    >
                                        Add Product
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}

export default Purchases
