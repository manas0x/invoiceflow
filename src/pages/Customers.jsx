import React, { useState, useEffect, useMemo } from 'react'
import { Plus, Search, User, Phone, MapPin, History, Trash2, Edit2, X, Wallet, ShoppingCart, Download, TrendingDown, Calendar, Package, FileDown, RotateCcw } from 'lucide-react'
import { firestoreService } from '../services/firestoreService'
import { motion } from 'framer-motion'
import { showError, showSuccess, showConfirm } from '../utils/alert'
import { generateCustomerLedgerPDF } from '../utils/pdfGenerator'
import { useBusiness } from '../context/BusinessContext'

const Customers = ({ isStaff: propIsStaff }) => {
    const business = useBusiness()
    const [customers, setCustomers] = useState([])
    const [invoices, setInvoices] = useState([])
    const [payments, setPayments] = useState([])
    const [saleReturns, setSaleReturns] = useState([])
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedCustomer, setSelectedCustomer] = useState(null)

    // Modals
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false)
    const [isExportModalOpen, setIsExportModalOpen] = useState(false)

    // Forms
    const [editingCustomer, setEditingCustomer] = useState(null)
    const [formData, setFormData] = useState({ name: '', phone: '', address: '' })

    const [paymentData, setPaymentData] = useState({
        amount: '',
        date: new Date().toISOString().split('T')[0],
        mode: 'Cash',
        note: ''
    })

    const [expenseData, setExpenseData] = useState({
        amount: '',
        date: new Date().toISOString().split('T')[0],
        note: ''
    })
    const [editingExpenseId, setEditingExpenseId] = useState(null)

    const [dateRange, setDateRange] = useState({
        start: '',
        end: ''
    })

    useEffect(() => {
        const unsubCustomers = firestoreService.subscribeCustomers(setCustomers)
        const unsubInvoices = firestoreService.subscribeInvoices(setInvoices)
        const unsubPayments = firestoreService.subscribeCustomerPayments(setPayments)
        const unsubReturns = firestoreService.subscribeSaleReturns(setSaleReturns)
        return () => {
            unsubCustomers()
            unsubInvoices()
            unsubPayments()
            unsubReturns()
        }
    }, [])

    // Sync Selected Customer on Update
    useEffect(() => {
        if (selectedCustomer) {
            const updated = customers.find(c => c.id === selectedCustomer.id)
            if (updated) {
                setSelectedCustomer(updated)
            }
        }
    }, [customers])

    // --- Customer Management ---
    const handleSaveCustomer = async (e) => {
        e.preventDefault()
        try {
            if (editingCustomer) {
                await firestoreService.updateCustomer(editingCustomer.id, formData)

                // Check for Name Change and Migrate Records
                if (editingCustomer.name && editingCustomer.name !== formData.name) {
                    await firestoreService.updateLinkedRecordsName(
                        editingCustomer.name,
                        formData.name,
                        editingCustomer.phone,
                        formData.phone
                    )
                    showSuccess("Customer Name Linked & Updated in History!")
                }
            } else {
                await firestoreService.addCustomer(formData)
            }
            setIsEditModalOpen(false)
            resetCustomerForm()
        } catch (err) {
            showError("Error: " + err.message)
        }
    }

    const resetCustomerForm = () => {
        setFormData({ name: '', phone: '', address: '' })
        setEditingCustomer(null)
    }

    const handleDeleteCustomer = async (id) => {
        if (await showConfirm("Delete this customer?", "History will remain in invoices.")) {
            await firestoreService.deleteCustomer(id)
            setSelectedCustomer(null)
        }
    }

    // --- Payment Management ---
    const handlePaymentSave = async (e) => {
        e.preventDefault()
        if (!paymentData.amount || !selectedCustomer) return showError("Amount required")

        try {
            await firestoreService.addCustomerPayment({
                ...paymentData,
                customerId: selectedCustomer.id,
                customerName: selectedCustomer.name,
                customerPhone: selectedCustomer.phone || '', // Store phone for easier matching
                amount: parseFloat(paymentData.amount)
            })
            showSuccess("Payment Received!")
            setIsPaymentModalOpen(false)
            setPaymentData({ amount: '', date: new Date().toISOString().split('T')[0], mode: 'Cash', note: '' })
        } catch (err) {
            showError("Error: " + err.message)
        }
    }

    const handleDeletePayment = async (id) => {
        if (await showConfirm("Delete Payment/Entry?", "Balance will be reverted.")) {
            try {
                await firestoreService.deleteCustomerPayment(id)
            } catch (err) {
                showError("Error: " + err.message)
            }
        }
    }

    const handleSaveExpense = async (e) => {
        e.preventDefault()
        if (!expenseData.amount || !selectedCustomer) return showError("Amount required")

        try {
            if (editingExpenseId) {
                // Update Existing
                await firestoreService.updateCustomerPayment(editingExpenseId, {
                    ...expenseData,
                    amount: parseFloat(expenseData.amount)
                })
                showSuccess("Expense Updated!")
            } else {
                // Create New
                await firestoreService.addCustomerPayment({
                    ...expenseData,
                    customerId: selectedCustomer.id,
                    customerName: selectedCustomer.name,
                    customerPhone: selectedCustomer.phone || '',
                    amount: parseFloat(expenseData.amount),
                    type: 'EXPENSE',
                    mode: 'Manual Charge'
                })
                showSuccess("Expense Added!")
            }

            setIsExpenseModalOpen(false)
            setExpenseData({ amount: '', date: new Date().toISOString().split('T')[0], note: '' })
            setEditingExpenseId(null)
        } catch (err) {
            showError("Error: " + err.message)
        }
    }

    const openExpenseEdit = (t) => {
        setExpenseData({
            amount: t.amount, // In table it's amount for debit
            date: t.date,
            note: t.note.replace('Manual Expense: ', '').replace('Charge: ', '') // Clean up note if needed, but our logic stores raw note in 'note' field usually, description is derived. Actually 't' here is the processed transaction. We need original data preferably or extract it.
            // Let's look at getCustomerLedger Construction.
            // For EXPENSE type: description is `Charge: ${p.note || 'Manual'}`, note is 'Manual Expense' or p.note. 
            // Wait, in Step 71 logic:
            // description: `Charge: ${p.note || 'Manual'}`,
            // note: 'Manual Expense' -- This is hardcoded! I should have stored the real note somewhere.
            // The Original 'p' is not passed to the view. 't' is the view model.
            // FIX: We need to pass the raw note in 't' properly or find 'p' from payments state.
        })
        // Finding original payment object
        const original = payments.find(p => p.id === t.dbId)
        if (original) {
            setExpenseData({
                amount: original.amount,
                date: original.date,
                note: original.note || ''
            })
            setEditingExpenseId(original.id)
            setIsExpenseModalOpen(true)
        }
    }

    const handleExportPDF = () => {
        if (!selectedCustomer) return

        // 1. Get ALL transactions sorted chronologically (Oldest First)
        // Note: getCustomerLedger returns them reversed (Newest First) for the UI
        const allTxnsChronological = [...transactions].reverse()

        // 2. Identify Transactions within the Range
        const txnsInPeriod = allTxnsChronological.filter(t => {
            const afterStart = dateRange.start ? t.date >= dateRange.start : true
            const beforeEnd = dateRange.end ? t.date <= dateRange.end : true
            return afterStart && beforeEnd
        })

        // 3. Calculate Opening Balance
        // Opening Balance = Balance of the txn immediately BEFORE the first txn in period
        // Or if no txns before, then it's 0.
        let openingBalance = 0
        const firstTxnIndex = allTxnsChronological.findIndex(t => txnsInPeriod.length > 0 && t.id === txnsInPeriod[0].id)
        if (firstTxnIndex > 0) {
            openingBalance = allTxnsChronological[firstTxnIndex - 1].balance
        }

        // 4. Calculate Period Totals
        const periodSales = txnsInPeriod.reduce((sum, t) => sum + t.amount, 0)
        const periodReceived = txnsInPeriod.reduce((sum, t) => sum + t.paidAmount, 0)
        const periodClosingBalance = openingBalance + periodSales - periodReceived

        const periodTotals = {
            sales: periodSales,
            received: periodReceived,
            due: periodClosingBalance,
            openingBalance: openingBalance
        }

        generateCustomerLedgerPDF(selectedCustomer, txnsInPeriod, periodTotals, dateRange)
        setIsExportModalOpen(false)
    }

    // --- Data Processing ---

    // Compute per-customer due balance for the list view
    const customerDueMap = useMemo(() => {
        const map = {}
        // 1. Sum credit invoices per customer
        invoices.forEach(inv => {
            const isCredit = (inv.paymentMode || '').toLowerCase() === 'credit'
            const key = inv.customerPhone || (inv.customerName || '').trim().toLowerCase()
            if (!map[key]) map[key] = { due: 0, name: inv.customerName }
            if (isCredit) map[key].due += Number(inv.totalAmount) || 0
        })
        // 2. Subtract payments received
        payments.forEach(p => {
            if (p.type === 'EXPENSE' || p.mode === 'Manual Charge') return
            const key = p.customerPhone || (p.customerName || '').trim().toLowerCase()
            if (!map[key]) map[key] = { due: 0 }
            map[key].due -= Number(p.amount) || 0
        })
        // 3. Subtract sale returns (goods returned = due reduces)
        saleReturns.forEach(r => {
            const key = r.customerPhone || (r.customerName || '').trim().toLowerCase()
            if (!map[key]) map[key] = { due: 0 }
            map[key].due -= Number(r.totalRefund) || 0
        })
        return map
    }, [invoices, payments, saleReturns])

    const getCustomerDue = (customer) => {
        const key = customer.phone || (customer.name || '').trim().toLowerCase()
        return Math.max(0, customerDueMap[key]?.due || 0)
    }

    const handleExportDuesCSV = () => {
        const rows = [['Customer Name', 'Phone', 'Address', `Outstanding Due (${business.currency})`]]
        const sorted = [...customers].sort((a, b) => getCustomerDue(b) - getCustomerDue(a))
        sorted.forEach(c => {
            rows.push([c.name, c.phone || '', c.address || '', getCustomerDue(c).toFixed(2)])
        })
        const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `Customer_Dues_${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    const filteredCustomers = customers
        .filter(c =>
            (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (c.phone || '').includes(searchTerm)
        )
        .sort((a, b) => getCustomerDue(b) - getCustomerDue(a))

    const getCustomerLedger = () => {
        if (!selectedCustomer) return { transactions: [], totals: { sales: 0, received: 0, due: 0 } }

        let allTrans = []
        let totalSales = 0
        let totalReceived = 0

        // 1. Process Invoices
        // Match by ID matches (if available) OR phone OR name (normalized)
        const custInvoices = invoices.filter(inv => {
            const nameMatch = (inv.customerName || '').trim().toLowerCase() === (selectedCustomer.name || '').trim().toLowerCase()
            const phoneMatch = selectedCustomer.phone && inv.customerPhone && (inv.customerPhone === selectedCustomer.phone)

            return phoneMatch || nameMatch
        })

        custInvoices.forEach(inv => {
            const amount = Number(inv.totalAmount) || 0
            const isCredit = inv.paymentMode === 'Credit'

            // Unified Transaction Object
            allTrans.push({
                id: inv.id,
                dbId: inv.docId,
                date: (inv.date || '').split('T')[0],
                type: isCredit ? 'CREDIT_SALE' : 'CASH_SALE',
                description: `Bill #${inv.id?.slice(-6)}`,
                amount: amount,          // Debit (Sale Value)
                paidAmount: isCredit ? 0 : amount, // Credit (Paid Value)
                note: inv.items ? `${inv.items.length} items (${inv.paymentMode})` : '',
                items: inv.items || [] // Pass items for PDF
            })

            totalSales += amount
            if (!isCredit) totalReceived += amount
        })

        // 2. Process Manual Payments (Receipts) -> Credit
        const custPayments = payments.filter(p =>
            p.customerId === selectedCustomer.id ||
            (selectedCustomer.phone && p.customerPhone === selectedCustomer.phone) ||
            (p.customerName === selectedCustomer.name)
        )

        custPayments.forEach(p => {
            const amount = Number(p.amount) || 0

            if (p.type === 'EXPENSE' || p.mode === 'Manual Charge') {
                allTrans.push({
                    id: p.id, dbId: p.id,
                    date: (p.date || '').split('T')[0],
                    type: 'EXPENSE',
                    description: p.note || 'Manual Charge',
                    amount: amount, paidAmount: 0,
                    note: p.note || 'Manual Charge'
                })
                totalSales += amount
            } else {
                allTrans.push({
                    id: p.id, dbId: p.id,
                    date: (p.date || '').split('T')[0],
                    type: 'PAYMENT',
                    description: `Recv via ${p.mode}`,
                    amount: 0, paidAmount: amount,
                    note: p.note
                })
                totalReceived += amount
            }
        })

        // 3. Process Sale Returns -> Reduce Due (Credit)
        const custReturns = saleReturns.filter(r =>
            (selectedCustomer.phone && r.customerPhone === selectedCustomer.phone) ||
            (r.customerName || '').trim().toLowerCase() === (selectedCustomer.name || '').trim().toLowerCase()
        )
        custReturns.forEach(r => {
            const amount = Number(r.totalRefund) || 0
            allTrans.push({
                id: r.id, dbId: r.id,
                date: (r.date || '').split('T')[0],
                type: 'RETURN',
                description: `Return · ${r.invoiceId || ''}`,
                amount: 0,          // No new debit
                paidAmount: amount, // Reduces balance (like a payment)
                note: (r.items || []).map(i => `${i.name} ×${i.quantity}`).join(', ')
            })
            totalReceived += amount
        })

        // 3. Sort (Oldest first)
        allTrans.sort((a, b) => new Date(a.date) - new Date(b.date))

        // 4. Calculate Running Balance
        let balance = 0
        const transactionsWithBalance = allTrans.map(t => {
            // Balance = Previous + Debit (Sale) - Credit (Paid)
            balance = balance + t.amount - t.paidAmount
            return { ...t, balance }
        })

        return {
            transactions: transactionsWithBalance.reverse(),
            totals: {
                sales: totalSales,
                received: totalReceived,
                due: balance
            }
        }
    }

    const { transactions, totals } = getCustomerLedger()

    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768)
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    const user = JSON.parse(localStorage.getItem('user') || '{}')
    const isStaff = propIsStaff !== undefined ? propIsStaff : (user.role === 'staff')

    return (
        <div className="customers h-[calc(100vh-100px)] flex flex-col lg:flex-row gap-6">
            {/* Left Panel: Customer List */}
            <div className={`flex-1 flex flex-col gap-4 ${selectedCustomer ? 'hidden lg:flex' : 'flex'}`}>
                <div className="flex justify-between items-center p-4 rounded-xl shadow-sm border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-main)' }}>
                            <User style={{ color: 'var(--primary)' }} /> {business.getTerm('customers')}
                        </h2>
                        <p className="text-[10px] font-bold text-muted mt-0.5">
                            Total Due: <span className="text-red-500">{business.currency}{customers.reduce((acc, c) => acc + getCustomerDue(c), 0).toLocaleString('en-IN')}</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExportDuesCSV}
                            title="Export All Dues as CSV"
                            className="p-2 rounded-lg border transition-colors"
                            style={{ background: 'var(--background)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
                        >
                            <FileDown size={18} />
                        </button>
                        <button
                            onClick={() => { resetCustomerForm(); setIsEditModalOpen(true); }}
                            className="p-2 rounded-lg transition-colors shadow-lg"
                            style={{ background: 'var(--primary)', color: 'white', boxShadow: '0 4px 15px rgba(var(--primary-rgb), 0.2)' }}
                        >
                            <Plus size={20} />
                        </button>
                    </div>
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} size={18} />
                    <input
                        type="text"
                        placeholder="Search name or phone..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl transition-all shadow-sm focus:ring-2 focus:ring-opacity-20"
                        style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-main)',
                            '--tw-ring-color': 'var(--primary)'
                        }}
                    />
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin scrollbar-thumb-gray-200">
                    {filteredCustomers.map(customer => (
                        <div
                            key={customer.id}
                            onClick={() => setSelectedCustomer(customer)}
                            className={`p-4 rounded-xl border cursor-pointer transition-all group hover:shadow-md ${selectedCustomer?.id === customer.id ? 'ring-1' : ''}`}
                            style={{
                                background: selectedCustomer?.id === customer.id ? 'rgba(var(--primary-rgb), 0.05)' : 'var(--surface)',
                                borderColor: selectedCustomer?.id === customer.id ? 'var(--primary)' : 'var(--border)',
                                '--tw-ring-color': 'var(--primary)'
                            }}
                        >
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full flex items-center justify-center border font-bold shrink-0"
                                        style={{ background: 'var(--background)', color: 'var(--primary)', borderColor: 'var(--border)' }}>
                                        {customer.name.charAt(0)}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="font-bold text-base truncate" style={{ color: 'var(--text-main)' }}>{customer.name}</div>
                                        <div className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                                            {customer.phone || 'No Phone'}
                                        </div>
                                    </div>
                                </div>
                                {/* Due Badge */}
                                {(() => {
                                    const due = getCustomerDue(customer)
                                    return due > 0 ? (
                                        <div className="text-right shrink-0 ml-2">
                                            <div className="text-[9px] font-black uppercase tracking-widest text-red-400">Due</div>
                                            <div className="text-sm font-black text-red-500">{business.currency}{due.toLocaleString('en-IN')}</div>
                                        </div>
                                    ) : (
                                        <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 shrink-0 ml-2">✓ Paid</span>
                                    )
                                })()}
                            </div>
                        </div>
                    ))}
                    {filteredCustomers.length === 0 && (
                        <div className="text-center py-10 italic" style={{ color: 'var(--text-muted)' }}>No customers found</div>
                    )}
                </div>
            </div>
            {/* Right Panel: Ledger & Details */}
            <div className={`flex-[2] rounded-2xl shadow-sm border flex flex-col overflow-hidden ${selectedCustomer ? 'fixed inset-0 z-[100] m-0 rounded-none h-full w-full' : 'hidden lg:flex items-center justify-center'}`}
                style={{ background: selectedCustomer ? 'var(--background)' : 'var(--surface)', borderColor: 'var(--border)' }}>
                {selectedCustomer ? (
                    <>
                        <div className="p-6 border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                            <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-6">
                                <div className="w-full md:w-auto">
                                    <button onClick={() => setSelectedCustomer(null)} className="mb-4 flex items-center gap-1 text-sm font-bold px-3 py-1.5 rounded-lg border shadow-sm"
                                        style={{ background: 'var(--background)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
                                        <X size={16} /> Back to Dashboard
                                    </button>

                                    <h1 className="text-2xl md:text-3xl font-black leading-none" style={{ color: 'var(--text-main)' }}>{selectedCustomer.name}</h1>

                                    <div className="flex flex-wrap gap-3 mt-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                                        {selectedCustomer.phone && <span className="flex items-center gap-1.5 px-3 py-1 rounded-full border shadow-sm" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}><Phone size={14} style={{ color: 'var(--primary)' }} /> {selectedCustomer.phone}</span>}
                                        {selectedCustomer.address && <span className="flex items-center gap-1.5 px-3 py-1 rounded-full border shadow-sm" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}><MapPin size={14} style={{ color: 'var(--primary)' }} /> {selectedCustomer.address}</span>}
                                    </div>

                                    <div className="flex gap-2 mt-4">
                                        <button onClick={() => { setEditingCustomer(selectedCustomer); setFormData(selectedCustomer); setIsEditModalOpen(true); }} className="text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5 font-bold transition-colors"
                                            style={{ background: 'var(--accent)', color: 'var(--text-main)', borderColor: 'var(--primary-light)' }}>
                                            <Edit2 size={12} /> Edit Profile
                                        </button>
                                        <button onClick={() => handleDeleteCustomer(selectedCustomer.id)} className="text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5 font-bold transition-colors"
                                            style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                                            <Trash2 size={12} /> Delete
                                        </button>
                                    </div>
                                </div>

                                {!isStaff && (
                                    <div className="flex flex-col gap-3 w-full md:w-auto md:items-end mt-2 md:mt-0">
                                        <div className="flex gap-3 w-full md:w-auto">
                                            <button
                                                onClick={() => setIsExpenseModalOpen(true)}
                                                className="flex-1 md:flex-none justify-center px-4 py-3 rounded-xl font-bold flex items-center gap-2 border transition-all active:scale-95"
                                                style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                                            >
                                                <TrendingDown size={18} /> Add Charge
                                            </button>
                                            <button
                                                onClick={() => setIsPaymentModalOpen(true)}
                                                className="flex-1 md:flex-none justify-center px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all hover:scale-105 active:scale-95"
                                                style={{ background: 'var(--success)', color: 'white', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.2)' }}
                                            >
                                                <Wallet size={18} /> Receive
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => setIsExportModalOpen(true)}
                                            className="w-full md:w-auto justify-center text-xs font-bold flex items-center gap-2 px-4 py-2 rounded-xl border transition-all shadow-sm active:scale-95"
                                            style={{ background: 'var(--surface)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
                                        >
                                            <Download size={14} /> Export Statement PDF
                                        </button>
                                    </div>
                                )}
                            </div>

                            {!isStaff && (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: isMobile ? '16px' : '24px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Purchase</div>
                                        <div style={{ fontSize: isMobile ? '18px' : '24px', fontWeight: 800, color: 'var(--danger)' }}>{business.currency}{totals.sales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                        <Package size={40} style={{ position: 'absolute', right: '-10px', bottom: '-10px', opacity: 0.1, color: 'var(--danger)' }} />
                                    </div>                        <div className="p-4 rounded-xl border shadow-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                                        <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--success)' }}>Received</div>
                                        <div className="text-xl font-black" style={{ color: 'var(--success)' }}>{business.currency}{totals.received.toLocaleString()}</div>
                                    </div>
                                    <div className={`p-4 rounded-xl border shadow-sm ${totals.due > 0 ? '' : ''}`}
                                        style={{ background: totals.due > 0 ? 'rgba(239, 68, 68, 0.1)' : 'var(--surface)', borderColor: totals.due > 0 ? 'var(--danger)' : 'var(--border)' }}>
                                        <div className={`text-xs font-bold uppercase tracking-widest mb-1 ${totals.due > 0 ? '' : ''}`} style={{ color: totals.due > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>Net Due</div>
                                        <div className={`text-xl font-black ${totals.due > 0 ? '' : ''}`} style={{ color: totals.due > 0 ? 'var(--danger)' : 'var(--text-main)' }}>{business.currency}{totals.due.toLocaleString()}</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex-1 overflow-x-auto" style={{ background: 'var(--surface)' }}>
                            {!isStaff ? (
                                <table className="min-w-full text-sm">
                                    <thead className="sticky top-0 z-10" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                                        <tr className="text-left text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                                            <th className="px-4 md:px-6 py-4 whitespace-nowrap">Date</th>
                                            <th className="px-4 md:px-6 py-4">Description</th>
                                            <th className="px-4 md:px-6 py-4 text-right whitespace-nowrap" style={{ color: 'var(--warning)' }}>Sale (Dr)</th>
                                            <th className="px-4 md:px-6 py-4 text-right whitespace-nowrap hidden sm:table-cell" style={{ color: 'var(--success)' }}>Received (Cr)</th>
                                            <th className="px-4 md:px-6 py-4 text-right whitespace-nowrap hidden md:table-cell">Balance</th>
                                            <th className="px-4 md:px-6 py-4 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                                        {transactions.map((t) => (
                                            <tr key={`${t.type}-${t.id}`} className="transition-colors hover:bg-black/5" style={{ borderColor: 'var(--border)' }}>
                                                <td className="px-4 md:px-6 py-4 font-medium whitespace-nowrap text-xs md:text-sm" style={{ color: 'var(--text-secondary)' }}>{t.date}</td>
                                                <td className="px-4 md:px-6 py-4 min-w-[150px]">
                                                    <div className="font-bold flex flex-wrap items-center gap-2" style={{ color: 'var(--text-main)' }}>
                                                        {t.type === 'RETURN'
                                                            ? <RotateCcw size={14} className="shrink-0 text-amber-500" />
                                                            : t.type.includes('SALE')
                                                                ? <ShoppingCart size={14} className="shrink-0" style={{ color: 'var(--warning)' }} />
                                                                : t.type === 'EXPENSE'
                                                                    ? <TrendingDown size={14} className="shrink-0" style={{ color: 'var(--danger)' }} />
                                                                    : <Wallet size={14} className="shrink-0" style={{ color: 'var(--success)' }} />}
                                                        <span className="break-words">{t.description}</span>
                                                        {t.type === 'RETURN' && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 uppercase">Return</span>}
                                                    </div>
                                                    {t.note && <div className="text-xs mt-1 italic break-words" style={{ color: 'var(--text-muted)' }}>{t.note}</div>}

                                                    {/* Mobile Only: Show Received & Balance inline if table cells hidden */}
                                                    <div className="mt-1 flex flex-col gap-1 sm:hidden text-xs">
                                                        {t.paidAmount > 0 && <span className="font-bold" style={{ color: 'var(--success)' }}>Recv: {business.currency}{t.paidAmount.toLocaleString()}</span>}
                                                        <span style={{ color: 'var(--text-secondary)' }}>Bal: {business.currency}{t.balance.toLocaleString()} {t.balance > 0 ? 'Dr' : 'Cr'}</span>
                                                    </div>
                                                    </td>
                                                    <td className="px-4 md:px-6 py-4 text-right font-bold whitespace-nowrap text-xs md:text-sm" style={{ color: 'var(--warning)', background: 'rgba(245, 158, 11, 0.1)' }}>
                                                    {t.amount > 0 ? `${business.currency}${t.amount.toLocaleString()}` : '-'}
                                                    </td>
                                                    <td className="px-4 md:px-6 py-4 text-right font-bold whitespace-nowrap hidden sm:table-cell text-xs md:text-sm" style={{ color: 'var(--success)', background: 'rgba(16, 185, 129, 0.1)' }}>
                                                    {t.paidAmount > 0 ? `${business.currency}${t.paidAmount.toLocaleString()}` : '-'}
                                                    </td>
                                                    <td className="px-4 md:px-6 py-4 text-right font-black whitespace-nowrap hidden md:table-cell text-xs md:text-sm" style={{ color: 'var(--text-main)' }}>
                                                    {business.currency}{t.balance.toLocaleString()}

                                                    <span className="text-[10px] ml-1 font-normal" style={{ color: 'var(--text-muted)' }}>
                                                        {t.balance > 0 ? 'Dr' : 'Cr'}
                                                    </span>
                                                </td>
                                                <td className="px-4 md:px-6 py-4 text-right flex justify-end gap-2">
                                                    {['PAYMENT', 'EXPENSE'].includes(t.type) && (
                                                        <>
                                                            {t.type === 'EXPENSE' && (
                                                                <button onClick={(e) => { e.stopPropagation(); openExpenseEdit(t); }} className="transition-colors" style={{ color: 'var(--text-muted)' }}>
                                                                    <Edit2 size={16} />
                                                                </button>
                                                            )}
                                                            <button onClick={(e) => { e.stopPropagation(); handleDeletePayment(t.dbId); }} className="transition-colors" style={{ color: 'var(--text-muted)' }}>
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </>
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
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full p-10" style={{ color: 'var(--text-muted)' }}>
                                    <div className="p-6 rounded-full mb-4" style={{ background: 'var(--background)' }}>
                                        <Wallet size={48} style={{ color: 'var(--border)' }} />
                                    </div>
                                    <h3 className="text-lg font-bold">Restricted Access</h3>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="text-center p-10" style={{ color: 'var(--text-muted)' }}>
                        <User size={64} className="mx-auto mb-4 opacity-10" />
                        <h3 className="text-lg font-bold">Select a Customer</h3>
                        <p className="text-sm mt-2 max-w-xs mx-auto">Click on a customer to view their full ledger, history, and payment status.</p>
                    </div>
                )}
            </div>

            {/* Modal for Customer Add/Edit */}
            {isEditModalOpen && (
                <div className="fixed inset-0 backdrop-blur-sm z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200" style={{ background: 'var(--surface)' }}>
                        <div className="p-5 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                            <h3 className="text-lg font-bold" style={{ color: 'var(--text-main)' }}>{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</h3>
                            <button onClick={() => setIsEditModalOpen(false)} className="transition-colors" style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSaveCustomer} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Full Name</label>
                                <input
                                    className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                                    placeholder="Customer Name"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    autoFocus
                                    required
                                    style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Phone Number</label>
                                <input
                                    className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                                    placeholder="10-digit mobile"
                                    value={formData.phone}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                    style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Address / Village</label>
                                <input
                                    className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                                    placeholder="Village/City"
                                    value={formData.address}
                                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                                    style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                                />
                            </div>
                            <button className="w-full font-bold py-4 rounded-xl shadow-lg transition-all hover:scale-[1.02] active:scale-95 mt-4" style={{ background: 'var(--primary)', color: 'white', boxShadow: '0 4px 15px rgba(var(--primary-rgb), 0.2)' }}>
                                {editingCustomer ? 'Update Profile' : 'Create Customer'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal for Payment (Receipt) */}
            {isPaymentModalOpen && (
                <div className="fixed inset-0 backdrop-blur-sm z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200" style={{ background: 'var(--surface)' }}>
                        <div className="p-5 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                            <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-main)' }}><Wallet style={{ color: 'var(--success)' }} size={20} /> Receive Payment</h3>
                            <button onClick={() => setIsPaymentModalOpen(false)} className="transition-colors" style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
                        </div>
                        <form onSubmit={handlePaymentSave} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Amount Received ({business.currency})</label>
                                <input
                                    className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-green-500/20 transition-all font-black text-xl"
                                    placeholder="0.00"
                                    type="number"
                                    value={paymentData.amount}
                                    onChange={e => setPaymentData({ ...paymentData, amount: e.target.value })}
                                    autoFocus
                                    style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--success)', '--tw-ring-color': 'var(--success)' }}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Date</label>
                                <input
                                    className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-green-500/20 transition-all font-medium"
                                    type="date"
                                    value={paymentData.date}
                                    onChange={e => setPaymentData({ ...paymentData, date: e.target.value })}
                                    style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--success)' }}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Mode</label>
                                <select
                                    className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-green-500/20 transition-all font-medium"
                                    value={paymentData.mode}
                                    onChange={e => setPaymentData({ ...paymentData, mode: e.target.value })}
                                    style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--success)' }}
                                >
                                    <option value="Cash">Cash</option>
                                    <option value="Online / UPI">Online / UPI</option>
                                    <option value="Bank Transfer">Bank Transfer</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Note (Optional)</label>
                                <input
                                    className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-green-500/20 transition-all font-medium"
                                    placeholder="Ref no, Transaction ID..."
                                    value={paymentData.note}
                                    onChange={e => setPaymentData({ ...paymentData, note: e.target.value })}
                                    style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--success)' }}
                                />
                            </div>
                            <button className="w-full font-bold py-4 rounded-xl shadow-lg transition-all hover:scale-[1.02] active:scale-95 mt-4" style={{ background: 'var(--success)', color: 'white', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.2)' }}>
                                Confirm Receipt
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal for Expense (Charge) */}
            {isExpenseModalOpen && (
                <div className="fixed inset-0 backdrop-blur-sm z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200" style={{ background: 'var(--surface)' }}>
                        <div className="p-5 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                            <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-main)' }}>
                                <TrendingDown style={{ color: 'var(--danger)' }} size={20} />
                                {editingExpenseId ? 'Edit Charge / Expense' : 'Add Charge / Expense'}
                            </h3>
                            <button onClick={() => { setIsExpenseModalOpen(false); setEditingExpenseId(null); setExpenseData({ amount: '', date: new Date().toISOString().split('T')[0], note: '' }); }} className="transition-colors" style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSaveExpense} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Amount ({business.currency})</label>
                                <input
                                    className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-red-500/20 transition-all font-black text-xl"
                                    placeholder="0.00"
                                    type="number"
                                    value={expenseData.amount}
                                    onChange={e => setExpenseData({ ...expenseData, amount: e.target.value })}
                                    autoFocus
                                    style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--danger)', '--tw-ring-color': 'var(--danger)' }}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Date</label>
                                <input
                                    className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-red-500/20 transition-all font-medium"
                                    type="date"
                                    value={expenseData.date}
                                    onChange={e => setExpenseData({ ...expenseData, date: e.target.value })}
                                    style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--danger)' }}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Description / Note</label>
                                <input
                                    className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-red-500/20 transition-all font-medium"
                                    placeholder="Service Charge, Old Balance..."
                                    value={expenseData.note}
                                    onChange={e => setExpenseData({ ...expenseData, note: e.target.value })}
                                    style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--danger)' }}
                                />
                            </div>
                            <button className="w-full font-bold py-4 rounded-xl shadow-lg transition-all hover:scale-[1.02] active:scale-95 mt-4" style={{ background: '#ef4444', color: 'white', boxShadow: '0 4px 15px rgba(239, 68, 68, 0.2)' }}>
                                {editingExpenseId ? 'Update Expense' : 'Add to Ledger'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal for Export PDF */}
            {isExportModalOpen && (
                <div className="fixed inset-0 backdrop-blur-sm z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200" style={{ background: 'var(--surface)' }}>
                        <div className="p-5 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                            <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-main)' }}><Download style={{ color: 'var(--primary)' }} size={20} /> Export Statement</h3>
                            <button onClick={() => setIsExportModalOpen(false)} className="transition-colors" style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Start Date (Optional)</label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} size={16} />
                                    <input
                                        className="w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                                        type="date"
                                        value={dateRange.start}
                                        onChange={e => setDateRange({ ...dateRange, start: e.target.value })}
                                        style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>End Date (Optional)</label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} size={16} />
                                    <input
                                        className="w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                                        type="date"
                                        value={dateRange.end}
                                        onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
                                        style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                                    />
                                </div>
                            </div>
                            <button
                                onClick={handleExportPDF}
                                className="w-full font-bold py-4 rounded-xl shadow-lg transition-all hover:scale-[1.02] active:scale-95 mt-4 flex items-center justify-center gap-2"
                                style={{ background: 'var(--primary)', color: 'white', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}
                            >
                                <Download size={20} /> Download PDF
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default Customers
