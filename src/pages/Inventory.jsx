import React, { useState, useEffect } from 'react'
import { Plus, Search, Filter, Edit2, Trash2, AlertTriangle, Download, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import { motion } from 'framer-motion'
import { firestoreService } from '../services/firestoreService'
import { showError, showConfirm } from '../utils/alert'
import { getCachedStoreName } from '../config/storeConfig'

const Inventory = ({ isStaff, showLowStock, setShowLowStock }) => {
    const [products, setProducts] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingProduct, setEditingProduct] = useState(null)
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
    const [formError, setFormError] = useState('')
    const [viewingBatchesProduct, setViewingBatchesProduct] = useState(null)

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768)
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    // Simplified Form State
    const [formData, setFormData] = useState({
        name: '',
        category: 'General',
        unit: 'Piece',
        gst: 5,
        purchasePrice: '',
        stock: '',
        minStock: '10',
        isLoose: false
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
            (p.category?.toLowerCase() || '').includes(searchTerm.toLowerCase());

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

                // Compare numeric fields safely
                if (Number(formData.stock) !== Number(editingProduct.stock)) updates.stock = Number(formData.stock);
                if (Number(formData.purchasePrice) !== Number(editingProduct.purchasePrice)) updates.purchasePrice = Number(formData.purchasePrice);
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
            name: '', category: 'General', unit: 'Piece',
            gst: 5, purchasePrice: '', stock: '', minStock: '10', isLoose: false
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
        const fileName = getCachedStoreName().replace(/[^a-z0-9]+/gi, '_')
        XLSX.writeFile(wb, `${fileName}_Inventory.xlsx`)
    }

    return (
        <div className="inventory">
            {showLowStock && (
                <div className="flex items-center justify-between px-4 py-3 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-xl mb-6 border border-amber-200 dark:border-amber-800">
                    <div className="flex items-center gap-2 font-semibold">
                        <AlertTriangle size={18} />
                        <span>Showing Low Stock Items Only</span>
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
                        placeholder="Search products..."
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
                        <Plus size={18} /> Add Product
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
                                        </div>
                                        <span className={getTagClass(p.category)}>
                                            {p.category}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 py-3 border-y" style={{ borderColor: 'var(--border)' }}>
                                        <div>
                                            <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">Current Stock</p>
                                            <div 
                                                className={`font-black text-lg ${!isStaff ? 'cursor-pointer hover:opacity-70 text-blue-500' : ''}`}
                                                style={{ color: !isStaff ? 'var(--primary)' : (isLowStock ? 'var(--danger)' : 'var(--text-main)') }}
                                                onClick={() => !isStaff && setViewingBatchesProduct(p)}
                                            >
                                                {p.isLoose ? (
                                                    (() => {
                                                        const bags = Math.floor(p.stock);
                                                        const remainder = p.stock - bags;
                                                        const weight = p.bagWeight || 50;
                                                        const kg = remainder * weight;
                                                        return (
                                                            <span>
                                                                {bags} <span className="text-xs font-bold opacity-60">UNITS</span>
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
                                                <div className="font-black text-lg" style={{ color: 'var(--text-main)' }}>Rs.{Number(p.purchasePrice).toFixed(2)}</div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex justify-between items-center mt-3">
                                        <div>
                                            {isLowStock && (
                                                <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/10 text-red-500 text-[10px] font-black uppercase ring-1 ring-red-500/20">
                                                    <AlertTriangle size={10} /> Low Stock
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
                            <div className="text-center py-20 text-muted italic font-bold">No products found.</div>
                        )}
                    </div>
                ) : (
                    <div className="table-container">
                        <table className="w-full border-collapse min-w-[600px]">
                            <thead>
                                <tr className="text-left border-b" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
                                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Product Name</th>
                                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Category</th>
                                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Stock</th>
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
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className={getTagClass(p.category)}>{p.category}</span>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div 
                                                    className={`font-medium ${!isStaff ? 'cursor-pointer hover:underline text-blue-500' : ''}`}
                                                    style={isStaff ? { color: isLowStock ? 'var(--danger)' : 'var(--text-main)', fontWeight: isLowStock ? 700 : 500 } : { color: 'var(--primary)', fontWeight: 700 }}
                                                    onClick={() => !isStaff && setViewingBatchesProduct(p)}
                                                    title={!isStaff ? "Click to view batches" : ""}
                                                >
                                                    {p.isLoose ? (
                                                        (() => {
                                                            const bags = Math.floor(p.stock);
                                                            const remainder = p.stock - bags;
                                                            const weight = p.bagWeight || 50;
                                                            const kg = remainder * weight;
                                                            return (
                                                                <span>
                                                                    {bags} Units
                                                                    {kg > 0.01 && <span className="text-xs ml-1 opacity-70">({kg.toFixed(2).replace(/\.?0+$/, '')} Kg)</span>}
                                                                </span>
                                                            );
                                                        })()
                                                    ) : (
                                                        `${Number(p.stock).toFixed(3).replace(/\.?0+$/, '')} ${p.unit}`
                                                    )}
                                                </div>
                                                {isLowStock && <div className="text-[10px] font-bold mt-1" style={{ color: 'var(--danger)' }}>Low Stock Alert</div>}
                                            </td>
                                            {!isStaff && (
                                                <td className="px-4 py-4">
                                                    <div className="font-bold" style={{ color: 'var(--text-main)' }}>Rs.{Number(p.purchasePrice).toFixed(2)}</div>
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
                            <h2 className="text-xl font-bold" style={{ color: 'var(--text-main)' }}>{editingProduct ? 'Edit Product' : 'Add New Product'}</h2>
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
                                    <label style={{ color: 'var(--text-secondary)' }}>Product Name</label>
                                    <input
                                        autoFocus
                                        required
                                        value={formData.name}
                                        onChange={e => { setFormData({ ...formData, name: e.target.value }); setFormError('') }}
                                        onKeyDown={handleKeyDown}
                                        type="text"
                                        placeholder="e.g. Product name"
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
                                                    <AlertTriangle size={14} /> Product already exists
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
                                            <option>General</option>
                                            <option>Grocery</option>
                                            <option>Electronics</option>
                                            <option>Clothing</option>
                                            <option>Services</option>
                                            <option>Other</option>
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
                                            <option>Piece</option>
                                            <option>Box</option>
                                            <option>Pack</option>
                                            <option>Kg</option>
                                            <option>Litre</option>
                                            <option>Hour</option>
                                            <option>Other</option>
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
                                    {!isStaff && (
                                        <div className="form-group">
                                            <label style={{ color: 'var(--text-secondary)' }}>Purchase Price (Rs.)</label>
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
                                <div className="form-group flex items-center gap-3 mt-2 select-none">
                                    <input
                                        type="checkbox"
                                        id="enableLoose"
                                        checked={formData.isLoose || false}
                                        onChange={e => setFormData({ ...formData, isLoose: e.target.checked })}
                                        className="w-5 h-5 rounded text-primary focus:ring-primary"
                                        style={{ accentColor: 'var(--primary)' }}
                                    />
                                    <label htmlFor="enableLoose" className="font-semibold cursor-pointer mb-0" style={{ color: 'var(--text-main)' }}>
                                        Enable Bulk Selling
                                    </label>
                                </div>
                                {formData.isLoose && (
                                    <div className="form-group ml-8 mt-2 animate-in slide-in-from-top-2 fade-in">
                                        <label style={{ color: 'var(--text-secondary)' }}>Package Weight (kg) <span style={{ color: 'var(--danger)' }}>*</span></label>
                                        <input
                                            required
                                            type="number"
                                            min="0.1"
                                            step="0.01"
                                            placeholder="e.g. 50"
                                            value={formData.bagWeight || ''}
                                            onChange={e => setFormData({ ...formData, bagWeight: e.target.value })}
                                            onKeyDown={handleKeyDown}
                                            className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-opacity-20 transition-all font-medium"
                                            style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                                        />
                                        <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                                            Required to calculate price per KG and valid stock reduction.
                                        </div>
                                    </div>
                                )}
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

            {viewingBatchesProduct && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4 backdrop-blur-sm">
                    <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="card w-full max-w-[500px] shadow-2xl rounded-2xl"
                        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                    >
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-xl font-bold" style={{ color: 'var(--text-main)' }}>Inventory Batches</h2>
                                <p className="text-sm text-muted">{viewingBatchesProduct.name}</p>
                            </div>
                            <button
                                onClick={() => setViewingBatchesProduct(null)}
                                className="p-2 rounded-full hover:bg-black/5 transition-colors"
                            >
                                <X size={20} style={{ color: 'var(--text-muted)' }} />
                            </button>
                        </div>
                        
                        {(!viewingBatchesProduct.batches || viewingBatchesProduct.batches.length === 0) ? (
                            <div className="text-center py-8 text-muted font-medium">
                                No specific batches found for this product.<br/>
                                <span className="text-xs mt-2 opacity-70">Legacy stock might be combined into a single batch on next purchase/sale.</span>
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                                {viewingBatchesProduct.batches.map((batch, index) => (
                                    <div key={index} className="flex justify-between items-center p-4 border rounded-xl" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
                                        <div>
                                            <div className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Batch {index + 1}</div>
                                            <div className="font-bold text-lg" style={{ color: 'var(--text-main)' }}>
                                                {Number(batch.qty).toFixed(2).replace(/\.?0+$/, '')} {viewingBatchesProduct.unit}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Purchase Cost</div>
                                            <div className="font-black text-lg" style={{ color: 'var(--primary)' }}>
                                                Rs.{Number(batch.purchasePrice).toFixed(2)}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        
                        <div className="mt-6 flex justify-between items-center pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                            <span className="font-bold text-muted">Total Stock</span>
                            <span className="font-black text-xl" style={{ color: 'var(--text-main)' }}>
                                {Number(viewingBatchesProduct.stock).toFixed(2).replace(/\.?0+$/, '')} {viewingBatchesProduct.unit}
                            </span>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    )
}

export default Inventory
