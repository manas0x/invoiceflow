import React, { useState, useEffect } from 'react'
import { Plus, Search, User, Phone, MapPin, History, Trash2, Edit2, X } from 'lucide-react'
import { firestoreService } from '../services/firestoreService'
import { motion, AnimatePresence } from 'framer-motion'
import { showError, showConfirm } from '../utils/alert'

const Customers = () => {
    const [customers, setCustomers] = useState([])
    const [invoices, setInvoices] = useState([])
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedCustomer, setSelectedCustomer] = useState(null)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingCustomer, setEditingCustomer] = useState(null)
    const [formData, setFormData] = useState({ name: '', phone: '', address: '' })

    useEffect(() => {
        const unsubCustomers = firestoreService.subscribeCustomers(setCustomers)
        const unsubInvoices = firestoreService.subscribeInvoices(setInvoices)
        return () => {
            unsubCustomers()
            unsubInvoices()
        }
    }, [])

    const filteredCustomers = customers.filter(c =>
        (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.phone || '').includes(searchTerm)
    )

    const getCustomerHistory = (c) => {
        if (!c) return []
        return invoices.filter(inv =>
            (c.phone && inv.customerPhone === c.phone) ||
            (!c.phone && inv.customerName === c.name)
        )
    }

    const handleSave = async (e) => {
        e.preventDefault()
        try {
            if (editingCustomer) {
                await firestoreService.updateCustomer(editingCustomer.id, formData)
            } else {
                await firestoreService.addCustomer(formData)
            }
            setIsModalOpen(false)
            resetForm()
        } catch (err) {
            showError("Error: " + err.message)
        }
    }

    const resetForm = () => {
        setFormData({ name: '', phone: '', address: '' })
        setEditingCustomer(null)
    }

    const handleDelete = async (id) => {
        if (await showConfirm("Delete this customer?", "History will remain in invoices.")) {
            await firestoreService.deleteCustomer(id)
            setSelectedCustomer(null)
        }
    }

    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768)
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    return (
        <div className="customers">
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 400px', gap: '24px' }}>
                <div className="customer-list">
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                            <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
                            <input
                                type="text"
                                placeholder="Search customer..."
                                style={{ paddingLeft: '40px' }}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <button onClick={() => { resetForm(); setIsModalOpen(true); }} style={{ height: '44px', background: 'var(--primary)', color: 'white', fontWeight: 600, padding: '0 20px', display: 'flex', alignItems: 'center', gap: '8px', flex: isMobile ? 1 : 'none', justifyContent: 'center' }}>
                            <Plus size={18} /> Add New
                        </button>
                    </div>

                    <div className="card" style={{ padding: 0 }}>
                        {filteredCustomers.length > 0 ? filteredCustomers.map(customer => (
                            <div
                                key={customer.id}
                                onClick={() => setSelectedCustomer(customer)}
                                style={{
                                    padding: '20px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    borderBottom: '1px solid #f1f5f9',
                                    cursor: 'pointer',
                                    background: selectedCustomer?.id === customer.id ? 'var(--accent)' : 'transparent',
                                    transition: 'background 0.2s'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', border: '1px solid var(--border)' }}>
                                        <User size={24} />
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '16px' }}>{customer.name}</div>
                                        <div style={{ fontSize: '14px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Phone size={12} /> {customer.phone || 'No Phone'}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Bills</div>
                                    <div style={{ fontWeight: 800, color: 'var(--primary)' }}>{getCustomerHistory(customer).length}</div>
                                </div>
                            </div>
                        )) : (
                            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No customers found</div>
                        )}
                    </div>
                </div>

                {(!isMobile || selectedCustomer) && (
                    <div className="customer-details">
                        {selectedCustomer ? (
                            <div style={{ position: 'sticky', top: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div className="card">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'center' }}>
                                        <h3 style={{ fontSize: '18px' }}>Customer Profile</h3>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            {isMobile && <button onClick={() => setSelectedCustomer(null)} style={{ padding: '8px', background: '#f1f5f9' }}><X size={16} /></button>}
                                            <button onClick={() => { setEditingCustomer(selectedCustomer); setFormData(selectedCustomer); setIsModalOpen(true); }} style={{ padding: '8px', background: '#eff6ff', color: '#3b82f6', borderRadius: '6px' }}><Edit2 size={16} /></button>
                                            <button onClick={() => handleDelete(selectedCustomer.id)} style={{ padding: '8px', background: '#fef2f2', color: 'var(--danger)', borderRadius: '6px' }}><Trash2 size={16} /></button>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <User size={18} color="var(--primary)" />
                                            <span style={{ fontWeight: 600 }}>{selectedCustomer.name}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <Phone size={18} color="var(--primary)" />
                                            <span>{selectedCustomer.phone || 'N/A'}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                            <MapPin size={18} color="var(--primary)" />
                                            <span style={{ fontSize: '14px', lineHeight: 1.4 }}>{selectedCustomer.address || 'No address provided'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="card">
                                    <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px' }}>
                                        <History size={20} color="var(--primary)" /> Recent Bills
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '450px', overflowY: 'auto' }}>
                                        {getCustomerHistory(selectedCustomer).length > 0 ? (
                                            getCustomerHistory(selectedCustomer).slice().reverse().map(inv => (
                                                <div key={inv.id} style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #edf2f7' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                        <span style={{ fontWeight: 700, fontSize: '13px' }}>#{inv.id?.slice(-6)}</span>
                                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{inv.date}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{inv.items?.length} items</span>
                                                        <span style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '15px' }}>₹{Number(inv.totalAmount).toLocaleString()}</span>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div style={{ padding: '20px', textAlign: 'center', fontSize: '14px', color: 'var(--text-muted)' }}>No transactions yet</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : !isMobile && (
                            <div className="card" style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', borderStyle: 'dashed' }}>
                                Select a customer to view details
                            </div>
                        )}
                    </div>
                )}
            </div>

            {isModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px' }}>
                    <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="card" style={{ width: '100%', maxWidth: '400px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', alignItems: 'center' }}>
                            <h2 style={{ fontSize: '20px' }}>{editingCustomer ? 'Edit Details' : 'New Customer'}</h2>
                            <button onClick={() => setIsModalOpen(false)} style={{ background: 'none' }}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div className="form-group">
                                    <label>Full Name</label>
                                    <input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} type="text" placeholder="Farmer Name" />
                                </div>
                                <div className="form-group">
                                    <label>Phone Number</label>
                                    <input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} type="text" placeholder="10-digit mobile" />
                                </div>
                                <div className="form-group">
                                    <label>Address</label>
                                    <input value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} type="text" placeholder="Village/City" />
                                </div>
                            </div>
                            <div style={{ marginTop: '32px', display: 'flex', gap: '12px' }}>
                                <button type="button" onClick={() => setIsModalOpen(false)} style={{ flex: 1, padding: '12px', background: 'white', border: '1px solid var(--border)' }}>Cancel</button>
                                <button type="submit" style={{ flex: 1, background: 'var(--primary)', color: 'white', padding: '12px', fontWeight: 600 }}>
                                    {editingCustomer ? 'Update' : 'Save'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </div>
    )
}

export default Customers
