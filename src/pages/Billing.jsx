import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Search, User, Receipt, Download, Smartphone, MapPin, X, History as HistoryIcon, Pencil } from 'lucide-react'
import { generateInvoicePDF } from '../utils/pdfGenerator'
import { firestoreService } from '../services/firestoreService'
import { showError, showSuccess, showConfirm } from '../utils/alert'

const Billing = ({ initialHistory = false, isStaff = false }) => {
    const [products, setProducts] = useState([])
    const [customers, setCustomers] = useState([])
    const [loading, setLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [invoices, setInvoices] = useState([])
    const [isHistoryView, setIsHistoryView] = useState(initialHistory)

    // Financial Year Logic
    const getCurrentFY = () => {
        const today = new Date();
        const month = today.getMonth(); // 0-11
        const year = today.getFullYear();
        return month >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
    }
    const [selectedFY, setSelectedFY] = useState(getCurrentFY())

    useEffect(() => {
        setIsHistoryView(initialHistory)
    }, [initialHistory])
    const [invoice, setInvoice] = useState({
        date: new Date().toISOString().split('T')[0],
        customerName: '',
        customerPhone: '',
        customerAddress: '',
        items: [],
        discount: 0,
        paymentMode: 'Cash'
    })
    const [editingInvoice, setEditingInvoice] = useState(null)

    const [searchTerm, setSearchTerm] = useState('')
    const [searchResults, setSearchResults] = useState([])
    const [customerSearch, setCustomerSearch] = useState('')
    const [customerResults, setCustomerResults] = useState([])

    useEffect(() => {
        const unsubProducts = firestoreService.subscribeProducts(setProducts)
        const unsubCustomers = firestoreService.subscribeCustomers(setCustomers)
        const unsubInvoices = firestoreService.subscribeInvoices(setInvoices)
        setLoading(false)
        return () => {
            unsubProducts()
            unsubCustomers()
            unsubInvoices()
        }
    }, [])

    const handleCustomerSearch = (val) => {
        setCustomerSearch(val)
        setInvoice({ ...invoice, customerName: val })
        if (val.length > 0) {
            const filtered = customers.filter(c =>
                (c.name || '').toLowerCase().includes(val.toLowerCase()) ||
                (c.phone || '').includes(val)
            )
            setCustomerResults(filtered)
        } else {
            setCustomerResults([])
        }
    }

    const handleCustomerKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            if (customerResults.length > 0) {
                selectCustomer(customerResults[0])
            } else {
                // If no user selected but Enter pressed, move to product search anyway
                document.getElementById('billing-search')?.focus()
            }
        }
    }

    const selectCustomer = (c) => {
        setInvoice({
            ...invoice,
            customerName: c.name,
            customerPhone: c.phone || '',
            customerAddress: c.address || ''
        })
        setCustomerResults([])
        // Auto-focus the product search for faster billing
        setTimeout(() => document.getElementById('billing-search')?.focus(), 0)
    }

    const handleSearch = (val) => {
        setSearchTerm(val)
        if (val.length > 1) {
            const filtered = products.filter(p =>
                (p.name || '').toLowerCase().includes(val.toLowerCase()) ||
                (p.category || '').toLowerCase().includes(val.toLowerCase())
            )
            setSearchResults(filtered)
        } else {
            setSearchResults([])
        }
    }

    const handleSearchKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            if (searchResults.length > 0) {
                addItem(searchResults[0])
            }
        }
    }


    const addItem = (product) => {
        const existing = invoice.items.find(item => item.id === product.id)
        if (existing) {
            if (existing.quantity >= product.stock) {
                showError("Cannot exceed available stock!")
                return
            }
            setInvoice({
                ...invoice,
                items: invoice.items.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
            })
        } else {
            const newItem = {
                id: product.id,
                name: product.name,
                price: isStaff ? 0 : (product.purchasePrice || 0),
                costPrice: product.purchasePrice || 0,
                quantity: 1,
                gst: product.gst,
                unit: product.unit
            }
            setInvoice({ ...invoice, items: [...invoice.items, newItem] })
        }
        setSearchTerm('')
        setSearchResults([])
    }

    const removeItem = (id) => {
        setInvoice({ ...invoice, items: invoice.items.filter(item => item.id !== id) })
    }

    const updateQuantity = (id, q) => {
        const quantity = q === '' ? '' : parseInt(q);

        // Only validate stock if quantity is a valid number
        if (typeof quantity === 'number') {
            const product = products.find(p => p.id === id)
            if (quantity > product.stock) {
                showError("Only " + product.stock + " units available!")
                return
            }
        }

        setInvoice({
            ...invoice,
            items: invoice.items.map(item => item.id === id ? { ...item, quantity } : item)
        })
    }

    const updatePrice = (id, p) => {
        const price = p === '' ? '' : parseFloat(p);
        setInvoice({
            ...invoice,
            items: invoice.items.map(item => item.id === id ? { ...item, price } : item)
        })
    }

    const totals = invoice.items.reduce((acc, item) => {
        const totalPerItem = item.price * item.quantity
        const baseAmount = totalPerItem / (1 + (item.gst / 100))
        const gstAmount = totalPerItem - baseAmount

        return {
            subtotal: acc.subtotal + baseAmount,
            gst: acc.gst + gstAmount,
            total: acc.total + totalPerItem
        }
    }, { subtotal: 0, gst: 0, total: 0 })

    const finalTotal = totals.total - invoice.discount

    const saveInvoice = async () => {
        if (!invoice.customerName || invoice.items.length === 0) {
            showError("Incomplete invoice details")
            return
        }

        if (isSaving) return;
        setIsSaving(true);

        try {
            if (editingInvoice) {
                // Update Existing Invoice
                await firestoreService.updateInvoice(editingInvoice.docId, {
                    ...invoice,
                    totalAmount: finalTotal,
                    items: invoice.items // Ensure items are updated
                })
                showSuccess(`Invoice Updated Successfully!`)
                window.location.reload()
            } else {
                // Create New Invoice
                const finalId = await firestoreService.addInvoice({
                    ...invoice,
                    totalAmount: finalTotal,
                    timestamp: new Date().getTime()
                })
                showSuccess(`Invoice ${finalId} Saved! Customer details recorded.`);
                window.location.reload()
            }
        } catch (err) {
            showError("Firestore Error: " + err.message)
        } finally {
            setIsSaving(false);
        }
    }

    const handleEdit = (inv) => {
        setEditingInvoice(inv)
        setInvoice({
            date: inv.date || new Date().toISOString().split('T')[0],
            customerName: inv.customerName,
            customerPhone: inv.customerPhone || '',
            customerAddress: inv.customerAddress || '',
            items: inv.items || [],
            discount: inv.discount || 0,
            paymentMode: inv.paymentMode || 'Cash'
        })
        setIsHistoryView(false)
    }

    const cancelEdit = () => {
        setEditingInvoice(null)
        setInvoice({
            date: new Date().toISOString().split('T')[0],
            customerName: '', customerPhone: '', customerAddress: '',
            items: [], discount: 0, paymentMode: 'Cash'
        })
    }

    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768)
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    return (
        <div className="space-y-6">
            <div className="flex gap-3 px-1 md:px-0">
                <button
                    onClick={() => setIsHistoryView(false)}
                    className={`flex-1 md:flex-none px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all border ${!isHistoryView ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'bg-white text-gray-600 border-gray-200 hover:border-primary/30'}`}
                >
                    <Plus size={18} /> New Bill
                </button>
                <button
                    onClick={() => setIsHistoryView(true)}
                    className={`flex-1 md:flex-none px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all border ${isHistoryView ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'bg-white text-gray-600 border-gray-200 hover:border-primary/30'}`}
                >
                    <HistoryIcon size={18} /> History
                </button>
                {editingInvoice && (
                    <button onClick={cancelEdit} className="px-4 py-3 bg-red-100 text-red-600 rounded-xl font-bold hover:bg-red-200">
                        Cancel Edit
                    </button>
                )}
            </div>

            {!isHistoryView ? (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 p-1 md:p-0">
                    <div className="lg:col-span-3 space-y-6">
                        {/* Customer Details Section */}
                        <div className="card p-5 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <User size={20} className="text-primary" /> Farmer Details
                            </h3>
                            <div className="relative">
                                <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider mb-1 block">Farmer Name / Phone</label>
                                <div className="relative group">
                                    <input
                                        autoFocus
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl transition-all font-medium text-gray-700 placeholder:text-gray-400"
                                        value={invoice.customerName}
                                        onChange={e => handleCustomerSearch(e.target.value)}
                                        onKeyDown={handleCustomerKeyDown}
                                        type="text" placeholder="Search or enter farmer name..."
                                        autoComplete="off"
                                    />
                                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                </div>
                                {customerResults.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 bg-white rounded-xl shadow-2xl z-[100] border border-gray-100 mt-2 max-h-[250px] overflow-y-auto divide-y divide-gray-50 scale-100 animate-in fade-in slide-in-from-top-2 duration-200">
                                        {customerResults.map(c => (
                                            <div
                                                key={c.id}
                                                onClick={() => selectCustomer(c)}
                                                className="p-4 cursor-pointer hover:bg-primary/5 transition-colors flex items-center gap-3"
                                            >
                                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                                    <User size={16} />
                                                </div>
                                                <div>
                                                    <div className="font-bold text-gray-800 text-sm">{c.name}</div>
                                                    <div className="text-xs text-gray-500 font-medium">{c.phone} • {c.address}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Product Search & Table */}
                        <div className="card p-5 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-800 mb-5">Billing Items</h3>
                            <div className="relative mb-6">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    id="billing-search"
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl transition-all font-medium text-gray-700 placeholder:text-gray-400"
                                    type="text"
                                    placeholder="Search products by name or category..."
                                    value={searchTerm}
                                    onChange={(e) => handleSearch(e.target.value)}
                                    onKeyDown={handleSearchKeyDown}
                                />
                                {searchResults.length > 0 && (
                                    <div className="absolute top-[54px] left-0 right-0 bg-white rounded-xl shadow-2xl z-[100] border border-gray-100 max-h-[350px] overflow-y-auto divide-y divide-gray-50">
                                        {searchResults.map(p => (
                                            <div
                                                key={p.id}
                                                onClick={() => addItem(p)}
                                                className="p-4 cursor-pointer hover:bg-primary/5 transition-colors flex justify-between items-center group"
                                            >
                                                <div className="min-w-0">
                                                    <div className="font-bold text-gray-800 group-hover:text-primary transition-colors truncate">{p.name}</div>
                                                    <div className="text-xs text-gray-500 font-medium italic">Stock: {p.stock} {p.unit} remaining</div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    {!isStaff && <div className="font-extrabold text-gray-900">₹{p.purchasePrice}</div>}
                                                    <div className="text-[10px] uppercase font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full inline-block mt-1">Select</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="overflow-x-auto -mx-5 px-5">
                                <table className="w-full min-w-[550px] border-collapse">
                                    <thead>
                                        <tr className="text-left bg-gray-50 border-b border-gray-100">
                                            <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-widest">Item Details</th>
                                            <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-widest w-28">Inc Price</th>
                                            <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-widest w-24">Qty</th>
                                            <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Total</th>
                                            <th className="px-4 py-3 w-12"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {invoice.items.length > 0 ? invoice.items.map(item => (
                                            <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-4 py-4">
                                                    <div className="font-bold text-gray-800 leading-tight">{item.name}</div>
                                                    <div className="text-[10px] font-bold text-primary bg-primary/5 px-1.5 py-0.5 rounded mt-1 inline-block uppercase">GST {item.gst}%</div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="relative">
                                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                                                        <input
                                                            className="w-full pl-5 pr-2 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-700 focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
                                                            type="number"
                                                            value={item.price}
                                                            onChange={e => updatePrice(item.id, e.target.value)}
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 text-center">
                                                    <input
                                                        className="w-full px-2 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-700 focus:border-primary focus:ring-1 focus:ring-primary text-center shadow-sm"
                                                        type="number"
                                                        value={item.quantity}
                                                        onChange={e => updateQuantity(item.id, e.target.value)}
                                                    />
                                                </td>
                                                <td className="px-4 py-4 text-right">
                                                    <div className="font-extrabold text-gray-900">₹{(item.price * item.quantity).toFixed(2)}</div>
                                                </td>
                                                <td className="px-4 py-4 text-right">
                                                    <button
                                                        onClick={() => removeItem(item.id)}
                                                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan="5" className="px-5 py-12 text-center text-gray-400 font-medium italic">Your bill is empty. Add some products above!</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-1">
                        <div className="card p-6 shadow-xl border-t-4 border-primary sticky top-[86px]">
                            <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                                <Receipt size={22} className="text-primary" /> Bill Summary
                            </h3>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500 font-medium tracking-tight">Taxable Amount</span>
                                    <span className="font-bold text-gray-700">₹{totals.subtotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500 font-medium tracking-tight">Total GST</span>
                                    <span className="font-bold text-gray-700">₹{totals.gst.toFixed(2)}</span>
                                </div>
                                <div className="pt-4 border-t border-gray-100">
                                    <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block mb-2">Apply Discount (₹)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-red-500 font-bold">₹</span>
                                        <input
                                            className="w-full pl-7 pr-4 py-3 bg-red-50/50 border border-red-100 rounded-xl text-xl font-black text-red-600 focus:outline-none focus:ring-2 focus:ring-red-100"
                                            type="number"
                                            value={invoice.discount}
                                            onChange={e => setInvoice({ ...invoice, discount: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-double border-gray-200 mt-2">
                                    <div className="flex justify-between items-end">
                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-tighter">Grand Total</span>
                                        <div className="text-right">
                                            <span className="text-3xl font-black text-primary leading-none block">₹{finalTotal.toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={saveInvoice}
                                    disabled={isSaving}
                                    className={`w-full py-4 rounded-2xl font-black text-lg shadow-lg flex items-center justify-center gap-3 transition-all duration-300 ${isSaving ? 'bg-gray-200 cursor-not-allowed text-gray-400' : 'bg-primary hover:bg-primary-dark text-white hover:scale-[1.02] active:scale-95 shadow-primary/20'}`}
                                >
                                    {isSaving ? 'Processing...' : (editingInvoice ? <><Pencil size={22} /> UPDATE BILL</> : <><Download size={22} /> SAVE & PRINT</>)}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div className="table-container">
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', background: '#f8fafc' }}>
                                    <th style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>Date</th>
                                    <th style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>Invoice ID</th>
                                    <th style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>Customer</th>
                                    <th style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>Items</th>
                                    {!isStaff && <th style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'right' }}>Profit</th>}
                                    <th style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'right' }}>Total</th>
                                    <th style={{ padding: '16px', width: '50px' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {invoices.slice().reverse().map(inv => (
                                    <tr key={inv.id} style={{ borderBottom: '1px solid #f1f5f9' }} className="table-row">
                                        <td style={{ padding: '16px' }}>{new Date(inv.timestamp || inv.createdAt).toLocaleDateString()}</td>
                                        <td style={{ padding: '16px', fontWeight: 600 }}>#{inv.id?.slice(-4)}</td>
                                        <td style={{ padding: '16px' }}>
                                            <div className="font-bold text-gray-700">{inv.customerName}</div>
                                            <div className="text-xs text-gray-400">{inv.customerPhone}</div>
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            {inv.items?.length} items
                                            <div className="text-xs text-gray-400 truncate max-w-[200px]">{inv.items?.map(i => i.name).join(', ')}</div>
                                        </td>
                                        {!isStaff && (
                                            <td style={{ padding: '16px', textAlign: 'right', fontWeight: 600, color: 'var(--success)' }}>
                                                ₹{(inv.items?.reduce((acc, item) => {
                                                    // Use stored costPrice if available, else fallback to current product list
                                                    const cost = item.costPrice !== undefined ? item.costPrice : (products.find(p => p.id === item.id)?.purchasePrice || 0);
                                                    return acc + ((item.price - cost) * item.quantity);
                                                }, 0) - (inv.discount || 0)).toFixed(2)}
                                            </td>
                                        )}
                                        <td style={{ padding: '16px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>₹{inv.totalAmount?.toLocaleString()}</td>
                                        <td style={{ padding: '16px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                            <button
                                                onClick={async () => {
                                                    if (await showConfirm("Confirm Return?", "Stock will be added back.")) {
                                                        firestoreService.deleteInvoice(inv.docId || inv.id).catch(err => showError(err.message));
                                                    }
                                                }}
                                                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Return / Delete"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleEdit(inv)}
                                                className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="Edit Invoice"
                                            >
                                                <Pencil size={18} />
                                            </button>
                                            <button
                                                onClick={() => generateInvoicePDF(inv)}
                                                className="p-2 text-gray-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                                title="Download PDF"
                                            >
                                                <Download size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {invoices.length === 0 && (
                                    <tr>
                                        <td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No invoice history found</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}

export default Billing
