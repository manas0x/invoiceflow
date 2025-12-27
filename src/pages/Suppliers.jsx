import React, { useState, useEffect } from 'react'
import { Plus, Search, MapPin, Phone, Edit2, Trash2, X, ShoppingBag, User } from 'lucide-react'
import { firestoreService } from '../services/firestoreService'
import { showError, showConfirm } from '../utils/alert'

const Suppliers = () => {
    const [suppliers, setSuppliers] = useState([])
    const [purchases, setPurchases] = useState([])
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedSupplier, setSelectedSupplier] = useState(null)
    const [isFormOpen, setIsFormOpen] = useState(false)
    const [loading, setLoading] = useState(true)

    const [formData, setFormData] = useState({
        id: null,
        name: '',
        phone: '',
        address: ''
    })

    useEffect(() => {
        const unsubSuppliers = firestoreService.subscribeSuppliers(setSuppliers)
        const unsubPurchases = firestoreService.subscribePurchases(setPurchases)
        setLoading(false)
        return () => {
            unsubSuppliers()
            unsubPurchases()
        }
    }, [])

    const handleSave = async (e) => {
        e.preventDefault()
        if (!formData.name) return showError("Name is required")

        try {
            if (formData.id) {
                await firestoreService.updateSupplier(formData.id, formData)
            } else {
                await firestoreService.addSupplier(formData)
            }
            setIsFormOpen(false)
            setFormData({ id: null, name: '', phone: '', address: '' })
        } catch (err) {
            showError("Error: " + err.message)
        }
    }

    const handleEdit = (supplier) => {
        setFormData(supplier)
        setIsFormOpen(true)
    }

    const handleDelete = async (id) => {
        if (await showConfirm("Are you sure?", "This cannot be undone.")) {
            try {
                await firestoreService.deleteSupplier(id)
                if (selectedSupplier?.id === id) setSelectedSupplier(null)
            } catch (err) {
                showError("Error deleting: " + err.message)
            }
        }
    }

    const filteredSuppliers = suppliers.filter(s =>
        (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.phone || '').includes(searchTerm)
    )

    const supplierPurchases = selectedSupplier
        ? purchases.filter(p => p.supplierName === selectedSupplier.name).sort((a, b) => new Date(b.date) - new Date(a.date))
        : []

    const totalPurchasedAmount = supplierPurchases.reduce((acc, curr) => acc + (Number(curr.totalAmount) || 0), 0)

    return (
        <div className="suppliers-page h-[calc(100vh-100px)] flex flex-col md:flex-row gap-6">
            {/* Left Panel: Supplier List */}
            <div className={`flex-1 flex flex-col gap-4 ${selectedSupplier ? 'hidden md:flex' : 'flex'}`}>
                <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <User className="text-primary" /> Suppliers
                    </h2>
                    <button
                        onClick={() => { setFormData({ id: null, name: '', phone: '', address: '' }); setIsFormOpen(true) }}
                        className="bg-primary hover:bg-primary-dark text-white p-2 rounded-lg transition-colors shadow-lg shadow-primary/20"
                    >
                        <Plus size={20} />
                    </button>
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Search suppliers..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all shadow-sm"
                    />
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin scrollbar-thumb-gray-200">
                    {filteredSuppliers.map(supplier => (
                        <div
                            key={supplier.id}
                            onClick={() => setSelectedSupplier(supplier)}
                            className={`p-4 rounded-xl border cursor-pointer transition-all group hover:shadow-md ${selectedSupplier?.id === supplier.id ? 'bg-primary/5 border-primary ring-1 ring-primary' : 'bg-white border-gray-100 hover:border-primary/30'}`}
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-bold text-gray-800 text-lg group-hover:text-primary transition-colors">{supplier.name}</h3>
                                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                                        {supplier.phone && <span className="flex items-center gap-1"><Phone size={12} /> {supplier.phone}</span>}
                                        {supplier.address && <span className="flex items-center gap-1"><MapPin size={12} /> {supplier.address}</span>}
                                    </div>
                                </div>
                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleEdit(supplier) }}
                                        className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(supplier.id) }}
                                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                    {filteredSuppliers.length === 0 && (
                        <div className="text-center py-10 text-gray-400 italic">No suppliers found</div>
                    )}
                </div>
            </div>

            {/* Right Panel: Details & History */}
            <div className={`flex-[2] bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col overflow-hidden ${!selectedSupplier ? 'hidden md:flex items-center justify-center bg-gray-50' : 'flex'}`}>
                {selectedSupplier ? (
                    <>
                        <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-gray-50/50">
                            <div>
                                <button onClick={() => setSelectedSupplier(null)} className="md:hidden mb-4 text-gray-500 hover:text-gray-800 flex items-center gap-1 text-sm font-bold"><X size={16} /> Back to List</button>
                                <h1 className="text-2xl font-black text-gray-900">{selectedSupplier.name}</h1>
                                <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600 font-medium">
                                    {selectedSupplier.phone && <span className="flex items-center gap-1.5 bg-white px-3 py-1 rounded-full border border-gray-200"><Phone size={14} className="text-primary" /> {selectedSupplier.phone}</span>}
                                    {selectedSupplier.address && <span className="flex items-center gap-1.5 bg-white px-3 py-1 rounded-full border border-gray-200"><MapPin size={14} className="text-primary" /> {selectedSupplier.address}</span>}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Total Purchases</div>
                                <div className="text-2xl font-black text-primary">₹{totalPurchasedAmount.toLocaleString()}</div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/30">
                            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-lg">
                                <ShoppingBag className="text-primary" size={20} /> Purchase History
                            </h3>

                            <div className="space-y-4">
                                {supplierPurchases.map(purchase => (
                                    <div key={purchase.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex justify-between items-center mb-3">
                                            <div>
                                                <div className="text-xs font-bold text-gray-400 uppercase">{purchase.date}</div>
                                                <div className="font-bold text-gray-800 text-sm mt-0.5">Inv: {purchase.invoiceNo || 'N/A'}</div>
                                            </div>
                                            <div className="font-black text-lg text-primary">₹{Number(purchase.totalAmount).toFixed(2)}</div>
                                        </div>
                                        <div className="bg-gray-50 rounded-lg p-2 overflow-x-auto">
                                            <table className="w-full text-sm min-w-[200px]">
                                                <thead>
                                                    <tr className="text-left text-xs text-gray-400 uppercase">
                                                        <th className="font-bold pb-2 pl-1">Item</th>
                                                        <th className="font-bold pb-2 text-right">Qty</th>
                                                        <th className="font-bold pb-2 text-right pr-2">Price</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {purchase.items?.map((item, idx) => (
                                                        <tr key={idx}>
                                                            <td className="py-2 font-medium text-gray-700 pl-1">{item.name}</td>
                                                            <td className="py-2 text-right text-gray-600">{item.quantity} {item.unit}</td>
                                                            <td className="py-2 text-right text-gray-600 pr-2">₹{Number(item.purchasePrice).toFixed(2)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ))}
                                {supplierPurchases.length === 0 && (
                                    <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
                                        <ShoppingBag size={48} className="mx-auto mb-3 opacity-20" />
                                        <p>No purchase records found for this supplier.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="text-center text-gray-400 p-10">
                        <User size={64} className="mx-auto mb-4 opacity-10" />
                        <h3 className="text-lg font-bold text-gray-500">Select a Supplier</h3>
                        <p className="text-sm mt-2 max-w-xs mx-auto">Click on a supplier from the list to view their details and purchase history.</p>
                    </div>
                )}
            </div>

            {/* Modal for Add/Edit */}
            {isFormOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="text-lg font-bold text-gray-800">{formData.id ? 'Edit Supplier' : 'Add New Supplier'}</h3>
                            <button onClick={() => setIsFormOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Agency / Supplier Name</label>
                                <input
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                                    placeholder="e.g. IFFCO Center"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone Number</label>
                                <input
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                                    placeholder="Contact number..."
                                    value={formData.phone}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Address / Location</label>
                                <textarea
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium resize-none h-24"
                                    placeholder="Full address..."
                                    value={formData.address}
                                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                                />
                            </div>
                            <button className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95 mt-4">
                                {formData.id ? 'Update Changes' : 'Create Supplier'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}

export default Suppliers
