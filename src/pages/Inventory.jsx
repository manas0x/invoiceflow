import React, { useState, useEffect } from 'react'
import { Plus, Search, Filter, Edit2, Trash2, AlertTriangle, Download, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import { motion } from 'framer-motion'
import { firestoreService } from '../services/firestoreService'
import { showError, showConfirm } from '../utils/alert'
import { useBusiness } from '../context/BusinessContext'

const CATEGORY_SUGGESTIONS = {
    restaurant: ['Pizza', 'Burgers', 'Drinks', 'Desserts', 'Starters', 'Main Course', 'Chinese', 'Indian'],
    grocery: ['Rice', 'Pulses', 'Snacks', 'Beverages', 'Dairy', 'Personal Care', 'Cleaning', 'Oils'],
    pharmacy: ['Tablets', 'Capsules', 'Syrups', 'Injections', 'Creams', 'Equipment', 'Baby Care', 'Vitamins'],
    retail: ['Clothing', 'Electronics', 'Footwear', 'Home Decor', 'Toys', 'Accessories', 'Stationery']
};

const Inventory = ({ isStaff, showLowStock, setShowLowStock }) => {
    const business = useBusiness()
    const [products, setProducts] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingProduct, setEditingProduct] = useState(null)
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
    const [formError, setFormError] = useState('')

    const currentSuggestions = CATEGORY_SUGGESTIONS[business.businessMode] || CATEGORY_SUGGESTIONS.retail;

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768)
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    // Simplified Form State
    const [formData, setFormData] = useState({
        name: '',
        category: currentSuggestions[0] || 'General',
        unit: 'Bag',
        gst: 5,
        purchasePrice: '',
        stock: '',
        minStock: '10',
        isLoose: false,
        barcode: '',
        batchNumber: '',
        expiryDate: '',
        sellingPrice: ''
    })

    useEffect(() => {
        const unsubscribe = firestoreService.subscribeProducts((data) => {
            setProducts(data)
            setLoading(false)
        })
        return () => unsubscribe()
    }, [])

    const filteredProducts = products.filter(p => {
        const matchesSearch = (p.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
            (p.category?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
            (p.barcode || '').includes(searchTerm) ||
            (p.batchNumber || '').toLowerCase().includes(searchTerm.toLowerCase());

        if (showLowStock) {
            return matchesSearch && ((Number(p.stock) || 0) <= (Number(p.minStock) || 0));
        }
        return matchesSearch;
    })

    const handleSave = async (e) => {
        e.preventDefault()
        setFormError('')

        try {
            if (editingProduct) {
                // Calculate only changed fields to prevent overwriting concurrent updates (like stock)
                const updates = {};
                if (formData.name !== editingProduct.name) updates.name = formData.name;
                if (formData.category !== editingProduct.category) updates.category = formData.category;
                if (formData.unit !== editingProduct.unit) updates.unit = formData.unit;
                if (formData.isLoose !== editingProduct.isLoose) updates.isLoose = formData.isLoose;
                if (formData.barcode !== editingProduct.barcode) updates.barcode = formData.barcode;
                if (formData.batchNumber !== editingProduct.batchNumber) updates.batchNumber = formData.batchNumber;
                if (formData.expiryDate !== editingProduct.expiryDate) updates.expiryDate = formData.expiryDate;

                // Compare numeric fields safely
                if (Number(formData.stock) !== Number(editingProduct.stock)) updates.stock = Number(formData.stock);
                if (Number(formData.purchasePrice) !== Number(editingProduct.purchasePrice)) updates.purchasePrice = Number(formData.purchasePrice);
                if (Number(formData.sellingPrice) !== Number(editingProduct.sellingPrice)) updates.sellingPrice = Number(formData.sellingPrice);
                if (Number(formData.minStock) !== Number(editingProduct.minStock)) updates.minStock = Number(formData.minStock);
                if (Number(formData.gst) !== Number(editingProduct.gst)) updates.gst = Number(formData.gst);
                if (Number(formData.bagWeight) !== Number(editingProduct.bagWeight)) updates.bagWeight = Number(formData.bagWeight);

                if (Object.keys(updates).length > 0) {
                    await firestoreService.updateProduct(editingProduct.id, updates);
                }
            } else {
                const productData = {
                    ...formData,
                    stock: Number(formData.stock),
                    purchasePrice: Number(formData.purchasePrice),
                    sellingPrice: Number(formData.sellingPrice),
                    minStock: Number(formData.minStock),
                    gst: Number(formData.gst),
                    bagWeight: Number(formData.bagWeight || 50)
                }

                // Check for duplicate name
                if (products.some(p => p.name.toLowerCase() === formData.name.trim().toLowerCase())) {
                    setFormError("Product with this name already exists!");
                    return;
                }
                await firestoreService.addProduct(productData)
            }
            setIsModalOpen(false)
            resetForm()
        } catch (err) {
            setFormError("Error saving: " + err.message)
        }
    }

    const handleDelete = async (id) => {
        if (await showConfirm('Are you sure you want to delete this product?')) {
            try {
                await firestoreService.deleteProduct(id)
            } catch (err) {
                showError("Error deleting: " + err.message)
            }
        }
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const inputs = document.querySelectorAll('.form-group input, .form-group select');
            const index = Array.prototype.indexOf.call(inputs, e.target);
            if (index > -1 && inputs[index + 1]) {
                inputs[index + 1].focus();
            }
        }
    }

    const resetForm = () => {
        setFormData({
            name: '', category: currentSuggestions[0] || 'General', unit: 'Bag',
            gst: 5, purchasePrice: '', sellingPrice: '', stock: '', minStock: '10', isLoose: false,
            barcode: '', batchNumber: '', expiryDate: ''
        })
        setEditingProduct(null)
        setFormError('')
    }

    const getTagClass = (cat) => "tag";

    const exportToExcel = () => {
        const exportData = products.map(p => {
            const { purchasePrice, ...rest } = p;
            return isStaff ? rest : p;
        });
        const ws = XLSX.utils.json_to_sheet(exportData)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, "Inventory")
        XLSX.writeFile(wb, `${business.appName}_${business.getTerm('inventory')}.xlsx`)
    }

    return (
        <div className="inventory">
            {showLowStock && (
                <div className="flex items-center justify-between px-4 py-3 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-xl mb-6 border border-amber-200 dark:border-amber-800">
                    <div className="flex items-center gap-2 font-semibold">
                        <AlertTriangle size={18} />
                        <span>Showing Low {business.getTerm('inventory')} Items Only</span>
                    </div>
                    <button
                        onClick={() => setShowLowStock(false)}
                        className="flex items-center gap-1 bg-white dark:bg-black/20 border border-amber-200 dark:border-amber-800 px-3 py-1 rounded-lg text-xs font-medium cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
                    >
                        <X size={14} /> Clear Filter
                    </button>
                </div>
            )}
            <div className="flex flex-wrap justify-between mb-6 gap-4">
                <div className="relative flex-1 min-w-[300px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={18} style={{ color: 'var(--text-muted)' }} />
                    <input
                        id="inventory-search"
                        type="text"
                        placeholder={`Search ${business.getTerm('products').toLowerCase()}...`}
                        className="w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-opacity-20 transition-all font-medium"
                        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                    <button
                        onClick={exportToExcel}
                        className="flex-1 md:flex-none px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all border hover:bg-black/5"
                        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                    >
                        <Download size={18} /> Export
                    </button>
                    <button
                        onClick={() => { resetForm(); setIsModalOpen(true); }}
                        className="flex-1 md:flex-none px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/20 hover:opacity-90"
                        style={{ background: 'var(--primary)', color: 'white' }}
                    >
                        <Plus size={18} /> Add {business.getTerm('products').slice(0, -1)}
                    </button>
                </div>
            </div>

            <div className="card p-0 overflow-hidden shadow-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                {isMobile ? (
                    <div className="p-4 flex flex-col gap-4">
                        {filteredProducts.length > 0 ? filteredProducts.map((p) => {
                            const isLowStock = Number(p.stock) <= Number(p.minStock)
                            return (
                                <div key={p.id} className={`mobile-card ${isLowStock ? 'ring-1 ring-red-500/30' : ''}`}>
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="min-w-0">
                                            <div className="font-extrabold text-base truncate" style={{ color: 'var(--text-main)' }}>{p.name}</div>
                                            {(p.barcode || p.batchNumber) && (
                                                <div className="text-[10px] font-bold text-muted mt-0.5 flex gap-2">
                                                    {p.barcode && <span>Code: {p.barcode}</span>}
                                                    {p.batchNumber && <span>Batch: {p.batchNumber}</span>}
                                                </div>
                                            )}
                                            {p.expiryDate && (
                                                <div className={`text-[10px] font-bold mt-0.5 ${new Date(p.expiryDate) < new Date() ? 'text-red-500' : 'text-amber-500'}`}>
                                                    Exp: {p.expiryDate}
                                                </div>
                                            )}
                                        </div>
                                        <span className={getTagClass(p.category)}>
                                            {p.category}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 py-3 border-y" style={{ borderColor: 'var(--border)' }}>
                                        <div>
                                            <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">Current Stock</p>
                                            <div className="font-black text-lg" style={{ color: isLowStock ? 'var(--danger)' : 'var(--text-main)' }}>
                                                {p.isLoose ? (
                                                    (() => {
                                                        const bags = Math.floor(p.stock);
                                                        const remainder = p.stock - bags;
                                                        const weight = p.bagWeight || 50;
                                                        const kg = remainder * weight;
                                                        return (
                                                            <span>
                                                                {bags} <span className="text-xs font-bold opacity-60">BAGS</span>
                                                                {kg > 0.01 && <span className="text-xs ml-1 opacity-70">({kg.toFixed(2)} KG)</span>}
                                                            </span>
                                                        );
                                                    })()
                                                ) : (
                                                    `${Number(p.stock).toFixed(2).replace(/\.?0+$/, '')} ${p.unit}`
                                                )}
                                            </div>
                                        </div>
                                        {!isStaff && (
                                            <div className="text-right">
                                                <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">Purchase Price</p>
                                                <div className="font-black text-lg" style={{ color: 'var(--text-main)' }}>{business.currency}{Number(p.purchasePrice).toFixed(2)}</div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex justify-between items-center mt-3">
                                        <div>
                                            {isLowStock && (
                                                <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/10 text-red-500 text-[10px] font-black uppercase ring-1 ring-red-500/20">
                                                    <AlertTriangle size={10} /> Low {business.getTerm('inventory')}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => { setEditingProduct(p); setFormData(p); setIsModalOpen(true); }}
                                                className="p-2 rounded-lg transition-colors hover:bg-blue-100 dark:hover:bg-blue-900/30"
                                                style={{ color: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)' }}
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            {!isStaff && (
                                                <button
                                                    onClick={() => handleDelete(p.id)}
                                                    className="p-2 rounded-lg transition-colors hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                                                    style={{ background: 'rgba(239, 68, 68, 0.1)' }}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        }) : (
                            <div className="text-center py-20 text-muted italic font-bold">No {business.getTerm('products').toLowerCase()} found.</div>
                        )}
                    </div>
                ) : (
                    <div className="table-container">
                        <table className="w-full border-collapse min-w-[600px]">
                            <thead>
                                <tr className="text-left border-b" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
                                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{business.getTerm('products').slice(0, -1)} Name</th>
                                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Category</th>
                                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Stock</th>
                                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Selling Price</th>
                                    {!isStaff && <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Purchase Price</th>}
                                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-right" style={{ color: 'var(--text-muted)' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y" style={{ divideColor: 'var(--border)' }}>
                                {filteredProducts.map((p) => {
                                    const isLowStock = Number(p.stock) <= Number(p.minStock)
                                    return (
                                        <tr key={p.id} className="transition-colors hover:bg-black/5" style={{ background: 'var(--surface)' }}>
                                            <td className="px-4 py-4">
                                                <div className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>{p.name}</div>
                                                {(p.barcode || p.batchNumber) && (
                                                    <div className="text-[10px] font-bold text-muted mt-0.5 flex gap-2">
                                                        {p.barcode && <span>Code: {p.barcode}</span>}
                                                        {p.batchNumber && <span>Batch: {p.batchNumber}</span>}
                                                    </div>
                                                )}
                                                {p.expiryDate && (
                                                    <div className={`text-[10px] font-bold mt-0.5 ${new Date(p.expiryDate) < new Date() ? 'text-red-500' : 'text-amber-500'}`}>
                                                        Exp: {p.expiryDate}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className={getTagClass(p.category)}>{p.category}</span>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="font-medium" style={{ color: isLowStock ? 'var(--danger)' : 'var(--text-main)', fontWeight: isLowStock ? 700 : 500 }}>
                                                    {p.isLoose ? (
                                                        // loose enabled: show Bags + Kg
                                                        (() => {
                                                            const bags = Math.floor(p.stock);
                                                            const remainder = p.stock - bags;
                                                            const weight = p.bagWeight || 50;
                                                            const kg = remainder * weight;
                                                            return (
                                                                <span>
                                                                    {bags} Bags
                                                                    {kg > 0.01 && <span className="text-xs ml-1 opacity-70">({kg.toFixed(2).replace(/\.?0+$/, '')} Kg)</span>}
                                                                </span>
                                                            );
                                                        })()
                                                    ) : (
                                                        // Standard display
                                                        `${Number(p.stock).toFixed(3).replace(/\.?0+$/, '')} ${p.unit}`
                                                    )}
                                                </div>
                                                {isLowStock && <div className="text-[10px] font-bold mt-1" style={{ color: 'var(--danger)' }}>Low Stock Alert</div>}
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="font-bold text-[var(--primary)]">{business.currency}{Number(p.sellingPrice).toFixed(2)}</div>
                                            </td>
                                            {!isStaff && (
                                                <td className="px-4 py-4">
                                                    <div className="font-bold" style={{ color: 'var(--text-main)' }}>{business.currency}{Number(p.purchasePrice).toFixed(2)}</div>
                                                </td>
                                            )}
                                            <td className="px-4 py-4 text-right">
                                                <div className="flex gap-2 justify-end">
                                                    <button
                                                        onClick={() => { setEditingProduct(p); setFormData(p); setIsModalOpen(true); }}
                                                        className="p-2 rounded-lg transition-colors hover:bg-blue-100 dark:hover:bg-blue-900/30"
                                                        style={{ color: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)' }}
                                                        title="Edit"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    {!isStaff && (
                                                        <button
                                                            onClick={() => handleDelete(p.id)}
                                                            className="p-2 rounded-lg transition-colors hover:bg-red-100 dark:hover:bg-red-900/30"
                                                            style={{ color: 'var(--danger)', background: 'rgba(239, 68, 68, 0.1)' }}
                                                            title="Delete"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4 backdrop-blur-sm">
                    <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="card w-full max-w-[500px] max-h-[90vh] overflow-y-auto shadow-2xl rounded-2xl"
                        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                    >
                        <div className="flex justify-between items-center mb-6 sticky top-0 bg-inherit z-10 py-2">
                            <h2 className="text-xl font-bold" style={{ color: 'var(--text-main)' }}>{editingProduct ? `Edit ${business.getTerm('products').slice(0, -1)}` : `Add New ${business.getTerm('products').slice(0, -1)}`}</h2>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="p-2 rounded-full hover:bg-black/5 transition-colors"
                            >
                                <X size={20} style={{ color: 'var(--text-muted)' }} />
                            </button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div className="space-y-4">
                                <div className="form-group relative">
                                    <label style={{ color: 'var(--text-secondary)' }}>{business.getTerm('products').slice(0, -1)} Name</label>
                                    <input
                                        autoFocus
                                        required
                                        value={formData.name}
                                        onChange={e => { setFormData({ ...formData, name: e.target.value }); setFormError('') }}
                                        onKeyDown={handleKeyDown}
                                        type="text"
                                        placeholder={`e.g. ${business.businessMode === 'restaurant' ? 'Chicken Burger' : 'Product Name'}`}
                                        autoComplete="off"
                                        className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-opacity-20 transition-all font-medium"
                                        style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                                    />
                                    {!editingProduct && formData.name.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 rounded-xl shadow-xl z-10 max-h-[200px] overflow-y-auto border mt-1" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                                            {products.filter(p => p.name.toLowerCase().includes(formData.name.toLowerCase()) && p.name.toLowerCase() !== formData.name.trim().toLowerCase()).map(p => (
                                                <div
                                                    key={p.id}
                                                    onClick={() => {
                                                        setEditingProduct(p);
                                                        setFormData(p);
                                                        setFormError('');
                                                    }}
                                                    className="p-3 cursor-pointer border-b last:border-0 flex justify-between items-center hover:bg-black/5 transition-colors"
                                                    style={{ borderColor: 'var(--border)' }}
                                                >
                                                    <span className="font-medium" style={{ color: 'var(--text-main)' }}>{p.name}</span>
                                                    <span className="text-xs px-2 py-1 rounded-full font-bold bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">Edit</span>
                                                </div>
                                            ))}
                                            {products.some(p => p.name.toLowerCase() === formData.name.trim().toLowerCase()) && (
                                                <div className="p-3 font-bold text-sm flex items-center gap-2 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                                                    <AlertTriangle size={14} /> {business.getTerm('products').slice(0, -1)} already exists
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="form-group grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="form-group">
                                        <label style={{ color: 'var(--text-secondary)' }}>Category</label>
                                        <select
                                            value={formData.category}
                                            onChange={e => setFormData({ ...formData, category: e.target.value })}
                                            onKeyDown={handleKeyDown}
                                            className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-opacity-20 transition-all font-medium appearance-none bg-no-repeat bg-[right_1rem_center]"
                                            style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)', backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")` }}
                                        >
                                            {currentSuggestions.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                            <option value="General">General</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label style={{ color: 'var(--text-secondary)' }}>Unit</label>
                                        <select
                                            value={formData.unit}
                                            onChange={e => setFormData({ ...formData, unit: e.target.value })}
                                            onKeyDown={handleKeyDown}
                                            className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-opacity-20 transition-all font-medium appearance-none bg-no-repeat bg-[right_1rem_center]"
                                            style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)', backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")` }}
                                        >
                                            <option>Bag</option>
                                            <option>Litre</option>
                                            <option>Kg</option>
                                            <option>Bottle</option>
                                            <option>Packet</option>
                                            <option>Piece</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="form-group">
                                        <label style={{ color: 'var(--text-secondary)' }}>GST %</label>
                                        <select
                                            value={formData.gst}
                                            onChange={e => setFormData({ ...formData, gst: parseInt(e.target.value) })}
                                            onKeyDown={handleKeyDown}
                                            className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-opacity-20 transition-all font-medium appearance-none bg-no-repeat bg-[right_1rem_center]"
                                            style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)', backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")` }}
                                        >
                                            <option value="5">5%</option>
                                            <option value="12">12%</option>
                                            <option value="18">18%</option>
                                            <option value="0">0%</option>
                                        </select>
                                    </div>
                                    {business.businessMode !== 'restaurant' && (
                                        <div className="form-group">
                                            <label style={{ color: 'var(--text-secondary)' }}>Barcode / SKU</label>
                                            <input
                                                value={formData.barcode}
                                                onChange={e => setFormData({ ...formData, barcode: e.target.value })}
                                                onKeyDown={handleKeyDown}
                                                type="text"
                                                placeholder="Scan or type barcode"
                                                className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-opacity-20 transition-all font-medium"
                                                style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                                            />
                                        </div>
                                    )}
                                </div>
                                {business.businessMode === 'pharmacy' && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="form-group">
                                            <label style={{ color: 'var(--text-secondary)' }}>Batch Number</label>
                                            <input
                                                value={formData.batchNumber}
                                                onChange={e => setFormData({ ...formData, batchNumber: e.target.value })}
                                                onKeyDown={handleKeyDown}
                                                type="text"
                                                placeholder="e.g. B-102"
                                                className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-opacity-20 transition-all font-medium"
                                                style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label style={{ color: 'var(--text-secondary)' }}>Expiry Date</label>
                                            <input
                                                value={formData.expiryDate}
                                                onChange={e => setFormData({ ...formData, expiryDate: e.target.value })}
                                                onKeyDown={handleKeyDown}
                                                type="date"
                                                className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-opacity-20 transition-all font-medium"
                                                style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                                            />
                                        </div>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="form-group">
                                        <label style={{ color: 'var(--text-secondary)' }}>Selling Price ({business.currency})</label>
                                        <input
                                            required
                                            value={formData.sellingPrice}
                                            onChange={e => setFormData({ ...formData, sellingPrice: e.target.value })}
                                            onKeyDown={handleKeyDown}
                                            type="number"
                                            className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-opacity-20 transition-all font-medium"
                                            style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                                        />
                                    </div>
                                    {!isStaff && (
                                        <div className="form-group">
                                            <label style={{ color: 'var(--text-secondary)' }}>Purchase Price ({business.currency})</label>
                                            <input
                                                required
                                                value={formData.purchasePrice}
                                                onChange={e => setFormData({ ...formData, purchasePrice: e.target.value })}
                                                onKeyDown={handleKeyDown}
                                                type="number"
                                                className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-opacity-20 transition-all font-medium"
                                                style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                                            />
                                        </div>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="form-group">
                                        <label style={{ color: 'var(--text-secondary)' }}>Current Stock</label>
                                        <input
                                            required
                                            value={formData.stock}
                                            onChange={e => setFormData({ ...formData, stock: e.target.value })}
                                            onKeyDown={handleKeyDown}
                                            type="number"
                                            className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-opacity-20 transition-all font-medium"
                                            style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label style={{ color: 'var(--text-secondary)' }}>Min Stock Alert</label>
                                        <input
                                            required
                                            value={formData.minStock}
                                            onChange={e => setFormData({ ...formData, minStock: e.target.value })}
                                            onKeyDown={handleKeyDown}
                                            type="number"
                                            className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-opacity-20 transition-all font-medium"
                                            style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                                        />
                                    </div>
                                </div>
                            </div>
                            {formError && (
                                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm font-bold animate-in fade-in slide-in-from-top-1">
                                    {formError}
                                </div>
                            )}
                            <div className="mt-8 flex gap-3 justify-end">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-4 py-3 border rounded-xl font-bold transition-all hover:bg-black/5"
                                    style={{ background: 'transparent', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-3 rounded-xl font-bold text-white shadow-lg shadow-primary/20 hover:opacity-90 transition-all"
                                    style={{ background: 'var(--primary)' }}
                                >
                                    {editingProduct ? 'Update' : 'Add'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </div>
    )
}

export default Inventory
