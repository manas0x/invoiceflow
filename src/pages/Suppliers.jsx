import React, { useState, useEffect } from 'react'
import { Plus, Search, MapPin, Phone, Edit2, Trash2, X, ShoppingBag, User, Wallet } from 'lucide-react'
import { firestoreService } from '../services/firestoreService'
import { showError, showConfirm, showSuccess } from '../utils/alert'
import { useBusiness } from '../context/BusinessContext'

const Suppliers = () => {
    const business = useBusiness()
    const [suppliers, setSuppliers] = useState([])
    const [purchases, setPurchases] = useState([])
    const [payments, setPayments] = useState([])
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedSupplier, setSelectedSupplier] = useState(null)
    const [isFormOpen, setIsFormOpen] = useState(false)
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
    const [loading, setLoading] = useState(true)

    // Form data for Supplier Create/Edit
    const [formData, setFormData] = useState({
        id: null,
        name: '',
        phone: '',
        address: '',
        gstin: ''
    })

    // Form data for Payment
    const [paymentData, setPaymentData] = useState({
        amount: '',
        date: new Date().toISOString().split('T')[0],
        mode: 'Cash',
        note: ''
    })

    useEffect(() => {
        const unsubSuppliers = firestoreService.subscribeSuppliers(setSuppliers)
        const unsubPurchases = firestoreService.subscribePurchases(setPurchases)
        const unsubPayments = firestoreService.subscribeSupplierPayments(setPayments)
        setLoading(false)
        return () => {
            unsubSuppliers()
            unsubPurchases()
            unsubPayments()
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
            setFormData({ id: null, name: '', phone: '', address: '', gstin: '' })
        } catch (err) {
            showError("Error: " + err.message)
        }
    }

    const handlePaymentSave = async (e) => {
        e.preventDefault()
        if (!paymentData.amount || !selectedSupplier) return showError("Amount required")

        try {
            await firestoreService.addSupplierPayment({
                ...paymentData,
                supplierId: selectedSupplier.id,
                supplierName: selectedSupplier.name, // Redundant but useful for reporting
                amount: parseFloat(paymentData.amount)
            })
            showSuccess("Payment Recorded!")
            setIsPaymentModalOpen(false)
            setPaymentData({ amount: '', date: new Date().toISOString().split('T')[0], mode: 'Cash', note: '', gstin: '' })
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

    const handleDeletePayment = async (id) => {
        if (await showConfirm("Delete Payment?", "Balance will be reverted.")) {
            try {
                await firestoreService.deleteSupplierPayment(id)
            } catch (err) {
                showError("Error: " + err.message)
            }
        }
    }

    const filteredSuppliers = suppliers.filter(s =>
        (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.phone || '').includes(searchTerm)
    )

    // --- Ledger Logic ---
    const getSupplierLedger = () => {
        if (!selectedSupplier) return { transactions: [], totals: { purchase: 0, paid: 0, due: 0 } }

        // 1. Get Purchases
        const suppPurchases = purchases
            .filter(p => p.supplierName === selectedSupplier.name)
            .map(p => ({
                id: p.id,
                dbId: p.docId,
                date: (p.date || '').split('T')[0],
                type: 'PURCHASE',
                description: `Inv: ${p.invoiceNo || 'N/A'}`,
                amount: Number(p.totalAmount) || 0,
                // Add items summary for note
                note: p.items ? `${p.items.length} items` : '',
                items: p.items // for tooltip or details if needed later
            }))

        // 2. Get Payments
        const suppPayments = payments
            .filter(p => p.supplierId === selectedSupplier.id || p.supplierName === selectedSupplier.name)
            .map(p => ({
                id: p.id,
                dbId: p.id,
                date: (p.date || '').split('T')[0],
                type: 'PAYMENT',
                description: `Paid via ${p.mode}`,
                amount: Number(p.amount) || 0,
                note: p.note
            }))

        // 3. Merge & Sort (Oldest first for accurate running balance)
        const allTrans = [...suppPurchases, ...suppPayments].sort((a, b) => new Date(a.date) - new Date(b.date))

        // 4. Calculate Running Balance
        let balance = 0
        const transactionsWithBalance = allTrans.map(t => {
            if (t.type === 'PURCHASE') {
                balance += t.amount // We owe more
            } else {
                balance -= t.amount // We owe less
            }
            return { ...t, balance }
        })

        // 5. Totals
        const totalPurchase = suppPurchases.reduce((sum, p) => sum + p.amount, 0)
        const totalPaid = suppPayments.reduce((sum, p) => sum + p.amount, 0)

        // Return reversed for display (newest first)
        return {
            transactions: transactionsWithBalance.reverse(),
            totals: {
                purchase: totalPurchase,
                paid: totalPaid,
                due: totalPurchase - totalPaid
            }
        }
    }

    const { transactions, totals } = getSupplierLedger()

    return (
        <div className="suppliers-page h-[calc(100vh-100px)] flex flex-col md:flex-row gap-6">
            {/* Left Panel: Supplier List */}
            <div className={`flex-1 flex flex-col gap-4 ${selectedSupplier ? 'hidden md:flex' : 'flex'}`}>
                <div className="flex justify-between items-center p-4 rounded-xl shadow-sm border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-main)' }}>
                        <User className="text-primary" /> {business.getTerm('suppliers')}
                    </h2>
                    <button
                        onClick={() => { setFormData({ id: null, name: '', phone: '', address: '' }); setIsFormOpen(true) }}
                        className="bg-primary hover:bg-primary-dark text-white p-2 rounded-lg transition-colors shadow-lg shadow-primary/20"
                    >
                        <Plus size={20} />
                    </button>
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={18} style={{ color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder="Search suppliers..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-opacity-20 transition-all shadow-sm"
                        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                    />
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin scrollbar-thumb-gray-200">
                    {filteredSuppliers.map(supplier => (
                        <div
                            key={supplier.id}
                            onClick={() => setSelectedSupplier(supplier)}
                            className={`p-4 rounded-xl border cursor-pointer transition-all group hover:shadow-md ${selectedSupplier?.id === supplier.id ? 'bg-primary/5 ring-1' : 'hover:border-primary/30'}`}
                            style={{
                                background: selectedSupplier?.id === supplier.id ? 'rgba(var(--primary-rgb), 0.05)' : 'var(--surface)',
                                borderColor: selectedSupplier?.id === supplier.id ? 'var(--primary)' : 'var(--border)',
                                '--tw-ring-color': 'var(--primary)'
                            }}
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-bold text-lg transition-colors" style={{ color: selectedSupplier?.id === supplier.id ? 'var(--primary)' : 'var(--text-main)' }}>{supplier.name}</h3>
                                    <div className="flex items-center gap-4 mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                                        {supplier.phone && <span className="flex items-center gap-1"><Phone size={12} /> {supplier.phone}</span>}
                                        {supplier.address && <span className="flex items-center gap-1"><MapPin size={12} /> {supplier.address}</span>}
                                        {supplier.gstin && <span className="flex items-center gap-1 font-bold text-primary/70"><FileText size={12} /> {supplier.gstin}</span>}
                                    </div>
                                </div>
                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleEdit(supplier) }}
                                        className="p-1.5 rounded-md transition-colors hover:bg-primary/10"
                                        style={{ color: 'var(--text-muted)' }}
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(supplier.id) }}
                                        className="p-1.5 hover:bg-red-50 rounded-md transition-colors"
                                        style={{ color: 'var(--text-muted)' }}
                                    >
                                        <Trash2 size={16} color="var(--danger)" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                    {filteredSuppliers.length === 0 && (
                        <div className="text-center py-10 italic" style={{ color: 'var(--text-muted)' }}>No suppliers found</div>
                    )}
                </div>
            </div>

            {/* Right Panel: Ledger & Details */}
            <div className={`flex-[2] rounded-2xl shadow-sm border flex flex-col overflow-hidden ${!selectedSupplier ? 'hidden md:flex items-center justify-center' : 'flex'}`} style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                {selectedSupplier ? (
                    <>
                        <div className="p-6 border-b" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
                            <div className="flex justify-between items-start mb-6">
                                <div className="w-full">
                                    <button onClick={() => setSelectedSupplier(null)} className="md:hidden mb-2 hover:opacity-80 flex items-center gap-1 text-sm font-bold" style={{ color: 'var(--text-muted)' }}><X size={16} /> Back</button>
                                    <h1 className="text-2xl font-black leading-none" style={{ color: 'var(--text-main)' }}>{selectedSupplier.name}</h1>
                                    <div className="flex flex-wrap gap-4 mt-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                                        {selectedSupplier.phone && <span className="flex items-center gap-1.5 px-3 py-1 rounded-full border shadow-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}><Phone size={14} className="text-primary" /> {selectedSupplier.phone}</span>}
                                        {selectedSupplier.address && <span className="flex items-center gap-1.5 px-3 py-1 rounded-full border shadow-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}><MapPin size={14} className="text-primary" /> {selectedSupplier.address}</span>}
                                        {selectedSupplier.gstin && <span className="flex items-center gap-1.5 px-3 py-1 rounded-full border shadow-sm bg-primary/5" style={{ borderColor: 'var(--primary-dark)' }}><FileText size={14} className="text-primary" /> GSTIN: {selectedSupplier.gstin}</span>}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <button
                                        onClick={() => setIsPaymentModalOpen(true)}
                                        className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-green-600/20 transition-all hover:scale-105 active:scale-95"
                                    >
                                        <Wallet size={18} /> Add Payment
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="p-4 rounded-xl border shadow-sm" style={{ background: 'var(--surface)', borderColor: '#dbeafe' }}>
                                    <div className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-1">Total Purchase</div>
                                    <div className="text-xl font-black text-blue-700">{business.currency}{totals.purchase.toLocaleString()}</div>
                                </div>
                                <div className="p-4 rounded-xl border shadow-sm" style={{ background: 'var(--surface)', borderColor: '#dcfce7' }}>
                                    <div className="text-xs font-bold text-green-400 uppercase tracking-widest mb-1">Total Paid</div>
                                    <div className="text-xl font-black text-green-700">{business.currency}{totals.paid.toLocaleString()}</div>
                                </div>
                                <div className="p-4 rounded-xl border shadow-sm" style={{ background: totals.due > 0 ? 'rgba(254, 226, 226, 0.2)' : 'var(--surface)', borderColor: totals.due > 0 ? '#fee2e2' : 'var(--border)' }}>
                                    <div className={`text-xs font-bold uppercase tracking-widest mb-1 ${totals.due > 0 ? 'text-red-400' : ''}`} style={{ color: totals.due > 0 ? undefined : 'var(--text-muted)' }}>Net Due</div>
                                    <div className={`text-xl font-black ${totals.due > 0 ? 'text-red-600' : ''}`} style={{ color: totals.due > 0 ? undefined : 'var(--text-main)' }}>{business.currency}{totals.due.toLocaleString()}</div>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-0" style={{ background: 'var(--surface)' }}>
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 z-10" style={{ background: 'var(--background)' }}>
                                    <tr className="text-left text-xs font-bold uppercase tracking-wider border-b" style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
                                        <th className="px-6 py-4">Date</th>
                                        <th className="px-6 py-4">Description</th>
                                        <th className="px-6 py-4 text-right text-blue-600">Purchase (Cr)</th>
                                        <th className="px-6 py-4 text-right text-green-600">Paid (Dr)</th>
                                        <th className="px-6 py-4 text-right">Balance</th>
                                        <th className="px-6 py-4 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y" style={{ divideColor: 'var(--border)' }}>
                                    {transactions.map((t, idx) => (
                                        <tr key={`${t.type}-${t.id}`} className="hover:bg-black/5 transition-colors">
                                            <td className="px-6 py-4 font-medium whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{t.date}</td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold flex items-center gap-2" style={{ color: 'var(--text-main)' }}>
                                                    {t.type === 'PURCHASE' ? <ShoppingBag size={14} className="text-blue-400" /> : <Wallet size={14} className="text-green-400" />}
                                                    {t.description}
                                                </div>
                                                {t.note && <div className="text-xs mt-1 italic" style={{ color: 'var(--text-muted)' }}>{t.note}</div>}
                                            </td>
                                            <td className="px-6 py-4 text-right font-bold text-blue-600" style={{ background: 'rgba(59, 130, 246, 0.05)' }}>
                                                {t.type === 'PURCHASE' ? `${business.currency}${t.amount.toLocaleString()}` : '-'}
                                            </td>
                                            <td className="px-6 py-4 text-right font-bold text-green-600" style={{ background: 'rgba(16, 185, 129, 0.05)' }}>
                                                {t.type === 'PAYMENT' ? `${business.currency}${t.amount.toLocaleString()}` : '-'}
                                            </td>
                                            <td className="px-6 py-4 text-right font-black" style={{ color: 'var(--text-main)' }}>
                                                {business.currency}{t.balance.toLocaleString()}
                                                <span className="text-[10px] ml-1 font-normal" style={{ color: 'var(--text-muted)' }}>
                                                    {t.balance > 0 ? 'Dr' : 'Cr'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {t.type === 'PAYMENT' && (
                                                    <button onClick={() => handleDeletePayment(t.dbId)} className="text-gray-300 hover:text-red-500 transition-colors">
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {transactions.length === 0 && (
                                        <tr>
                                            <td colSpan="6" className="py-12 text-center text-gray-400 italic">No transactions found</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : (
                    <div className="text-center p-10" style={{ color: 'var(--text-muted)' }}>
                        <User size={64} className="mx-auto mb-4 opacity-10" />
                        <h3 className="text-lg font-bold" style={{ color: 'var(--text-muted)' }}>Select a Supplier</h3>
                        <p className="text-sm mt-2 max-w-xs mx-auto">View ledger, track payments, and manage history.</p>
                    </div>
                )}
            </div>

            {/* Modal for Supplier Add/Edit */}
            {isFormOpen && (
                <div className="fixed inset-0 backdrop-blur-sm z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200" style={{ background: 'var(--surface)' }}>
                        <div className="p-5 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
                            <h3 className="text-lg font-bold" style={{ color: 'var(--text-main)' }}>{formData.id ? 'Edit Supplier' : 'Add New Supplier'}</h3>
                            <button onClick={() => setIsFormOpen(false)} className="hover:opacity-80 transition-colors" style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Agency / Supplier Name</label>
                                <input
                                    className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-opacity-20 transition-all font-medium"
                                    style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                                    placeholder="e.g. IFFCO Center"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Phone Number</label>
                                <input
                                    className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-opacity-20 transition-all font-medium"
                                    style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                                    placeholder="Contact number..."
                                    value={formData.phone}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Address / Location</label>
                                <textarea
                                    className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-opacity-20 transition-all font-medium resize-none h-24"
                                    style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                                    placeholder="Full address..."
                                    value={formData.address}
                                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>GSTIN (Optional)</label>
                                <input
                                    className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-opacity-20 transition-all font-bold tracking-widest uppercase"
                                    style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                                    placeholder="09XXXXX..."
                                    value={formData.gstin}
                                    onChange={e => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                                />
                            </div>
                            <button className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95 mt-4">
                                {formData.id ? 'Update Changes' : 'Create Supplier'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal for Payment */}
            {isPaymentModalOpen && (
                <div className="fixed inset-0 backdrop-blur-sm z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200" style={{ background: 'var(--surface)' }}>
                        <div className="p-5 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
                            <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-main)' }}><Wallet className="text-green-600" size={20} /> Record Payment</h3>
                            <button onClick={() => setIsPaymentModalOpen(false)} className="hover:opacity-80 transition-colors" style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
                        </div>
                        <form onSubmit={handlePaymentSave} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Amount Paid ({business.currency})</label>
                                <input
                                    className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all font-black text-xl text-green-700"
                                    style={{ background: 'var(--background)', borderColor: 'var(--border)' }}
                                    placeholder="0.00"
                                    type="number"
                                    value={paymentData.amount}
                                    onChange={e => setPaymentData({ ...paymentData, amount: e.target.value })}
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Payment Date</label>
                                <input
                                    className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all font-medium"
                                    style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                                    type="date"
                                    value={paymentData.date}
                                    onChange={e => setPaymentData({ ...paymentData, date: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Payment Mode</label>
                                <select
                                    className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all font-medium"
                                    style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                                    value={paymentData.mode}
                                    onChange={e => setPaymentData({ ...paymentData, mode: e.target.value })}
                                >
                                    <option value="Cash">Cash</option>
                                    <option value="Online / UPI">Online / UPI</option>
                                    <option value="Cheque">Cheque</option>
                                    <option value="Bank Transfer">Bank Transfer</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Note (Optional)</label>
                                <input
                                    className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all font-medium"
                                    style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                                    placeholder="Ref no, Transaction ID..."
                                    value={paymentData.note}
                                    onChange={e => setPaymentData({ ...paymentData, note: e.target.value })}
                                />
                            </div>
                            <button className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-green-600/20 transition-all hover:scale-[1.02] active:scale-95 mt-4">
                                Save Payment
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}

export default Suppliers
