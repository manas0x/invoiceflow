import React, { useState, useEffect, useRef } from 'react';
import { firestoreService } from '../services/firestoreService';
import { Search, RotateCcw, Package, User, ShoppingBag, FileText, CheckCircle2, AlertCircle, ArrowLeft, History, ChevronDown, ChevronUp, Trash2, X, Download } from 'lucide-react';
import { showSuccess, showError, showConfirm } from '../utils/alert';
import { generateSaleReturnPDF, generatePurchaseReturnPDF } from '../utils/pdfGenerator';

const Returns = () => {
    const [activeTab, setActiveTab] = useState('sale');
    const [searchId, setSearchId] = useState('');
    const [sourceRecord, setSourceRecord] = useState(null);
    const [returnItems, setReturnItems] = useState({});
    const [isProcessing, setIsProcessing] = useState(false);
    const [allInvoices, setAllInvoices] = useState([]);
    const [allCustomers, setAllCustomers] = useState([]);
    const [allPurchases, setAllPurchases] = useState([]);
    const [allSuppliers, setAllSuppliers] = useState([]);
    const [filterDate, setFilterDate] = useState('');
    const [saleReturns, setSaleReturns] = useState([]);
    const [purchaseReturns, setPurchaseReturns] = useState([]);
    const [showHistory, setShowHistory] = useState(true);
    const [browseSearch, setBrowseSearch] = useState('');
    const [saleCustomerSearch, setSaleCustomerSearch] = useState('');
    const [saleProductSearch, setSaleProductSearch] = useState('');
    const [selectedSaleCustomer, setSelectedSaleCustomer] = useState(null);
    const [returnCart, setReturnCart] = useState([]);
    const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
    const [showProductSuggestions, setShowProductSuggestions] = useState(false);
    const [purchaseSupplierSearch, setPurchaseSupplierSearch] = useState('');
    const [purchaseProductSearch, setPurchaseProductSearch] = useState('');
    const [selectedPurchaseSupplier, setSelectedPurchaseSupplier] = useState(null);
    const [purchaseReturnCart, setPurchaseReturnCart] = useState([]);
    const [showSupplierSuggestions, setShowSupplierSuggestions] = useState(false);
    const [showPurchaseProductSuggestions, setShowPurchaseProductSuggestions] = useState(false);
    const processingRef = useRef(false); // guard against double-submit


    useEffect(() => {
        const unsubInv = firestoreService.subscribeInvoices(setAllInvoices);
        const unsubCustomers = firestoreService.subscribeCustomers(setAllCustomers);
        const unsubPur = firestoreService.subscribePurchases(setAllPurchases);
        const unsubSuppliers = firestoreService.subscribeSuppliers(setAllSuppliers);
        const unsubSaleRet = firestoreService.subscribeSaleReturns(setSaleReturns);
        const unsubPurRet = firestoreService.subscribePurchaseReturns(setPurchaseReturns);
        return () => {
            unsubInv();
            unsubCustomers();
            unsubPur();
            unsubSuppliers();
            unsubSaleRet();
            unsubPurRet();
        };
    }, []);

    const handleSearch = (e) => {
        e.preventDefault();
        const id = searchId.trim().toUpperCase();
        if (!id) return;

        let record = null;
        if (activeTab === 'sale') {
            record = allInvoices.find(inv =>
                inv.id === id || (inv.id && inv.id.endsWith(id))
            );
        } else {
            record = allPurchases.find(p =>
                p.id === id || (p.id && p.id.endsWith(id))
            );
        }

        if (record) {
            setSourceRecord(record);
            setReturnItems({});
            showSuccess(`Found ${activeTab === 'sale' ? 'Bill' : 'Purchase'}: ${record.id}`);
        } else {
            showError(`${activeTab === 'sale' ? 'Bill' : 'Purchase'} not found!`);
            setSourceRecord(null);
        }
    };

    const toggleItemQuantity = (itemId, maxQty, delta) => {
        setReturnItems(prev => {
            const current = prev[itemId] || 0;
            const next = Math.max(0, Math.min(maxQty, current + delta));
            if (next === 0) {
                const updated = { ...prev };
                delete updated[itemId];
                return updated;
            }
            return { ...prev, [itemId]: next };
        });
    };

    // Build a map of already-returned qty per (invoiceId → itemId → qty)
    const getAlreadyReturnedQty = (recordId, itemId) => {
        const history = activeTab === 'sale' ? saleReturns : purchaseReturns;
        return history
            .filter(r => (r.invoiceId || r.purchaseId) === recordId || (r.invoiceIds || []).includes(recordId))
            .reduce((total, r) => {
                const found = (r.items || []).find(i => i.id === itemId);
                return total + (found ? Number(found.quantity) : 0);
            }, 0);
    };

    const getCustomerPhone = (customerName) => {
        const normalizedName = (customerName || '').trim().toLowerCase();
        return allCustomers.find(customer => (customer.name || '').trim().toLowerCase() === normalizedName)?.phone ||
            allInvoices.find(invoice => (invoice.customerName || '').trim().toLowerCase() === normalizedName)?.customerPhone || '';
    };

    const getCustomerInvoices = (customerName) => {
        const normalizedName = (customerName || '').trim().toLowerCase();
        const phone = getCustomerPhone(customerName);
        return allInvoices.filter(invoice => {
            const samePhone = phone && invoice.customerPhone && invoice.customerPhone === phone;
            const sameName = (invoice.customerName || '').trim().toLowerCase() === normalizedName;
            return samePhone || sameName;
        });
    };

    const getAlreadyReturnedForCustomerProduct = (customerName, customerPhone, itemId, itemName) => {
        const normalizedName = (customerName || '').trim().toLowerCase();
        return saleReturns
            .filter(record => {
                const samePhone = customerPhone && record.customerPhone && record.customerPhone === customerPhone;
                const sameName = (record.customerName || '').trim().toLowerCase() === normalizedName;
                return samePhone || sameName;
            })
            .reduce((total, record) => total + (record.items || [])
                .filter(item => (itemId && item.id === itemId) || (!itemId && (item.name || '').trim().toLowerCase() === itemName))
                .reduce((sum, item) => sum + (Number(item.quantity) || 0), 0), 0);
    };

    const getAlreadyReturnedForSupplierProduct = (supplierName, itemId, itemName) => {
        const normalizedName = (supplierName || '').trim().toLowerCase();
        return purchaseReturns
            .filter(record => (record.supplierName || '').trim().toLowerCase() === normalizedName)
            .reduce((total, record) => total + (record.items || [])
                .filter(item => (itemId && item.id === itemId) || (!itemId && (item.name || '').trim().toLowerCase() === itemName))
                .reduce((sum, item) => sum + (Number(item.quantity) || 0), 0), 0);
    };

    // Max returnable qty for an item in the currently selected record
    const maxReturnableQty = (item) => {
        if (!sourceRecord) return item.quantity;
        const alreadyReturned = getAlreadyReturnedQty(sourceRecord.id, item.id);
        return Math.max(0, Number(item.quantity) - alreadyReturned);
    };

    const calculateRefund = () => {
        if (!sourceRecord) return 0;
        return sourceRecord.items.reduce((total, item) => {
            const qty = returnItems[item.id] || 0;
            return total + (qty * (item.price || item.purchasePrice || 0));
        }, 0);
    };

    const calculateReturnCartTotal = () => returnCart.reduce((total, item) => (
        total + ((Number(item.quantity) || 0) * (Number(item.averagePrice) || 0))
    ), 0);

    const calculatePurchaseReturnCartTotal = () => purchaseReturnCart.reduce((total, item) => (
        total + ((Number(item.quantity) || 0) * (Number(item.averagePrice) || 0))
    ), 0);

    const handleSubmit = async () => {
        if (processingRef.current) return; // already running — block second click
        if (activeTab === 'sale' && !selectedSaleCustomer) return showError('Select a customer first');
        if (activeTab === 'sale' && returnCart.length === 0) return showError('Add at least one product to return');
        if (activeTab === 'purchase' && !selectedPurchaseSupplier) return showError('Select a supplier first');
        if (activeTab === 'purchase' && purchaseReturnCart.length === 0) return showError("Add at least one product to return");
        const totalRefund = activeTab === 'sale' ? calculateReturnCartTotal() : calculatePurchaseReturnCartTotal();
        if (!await showConfirm(`Process return of Rs.${totalRefund.toLocaleString()}?`, `Stock will be adjusted automatically.`)) return;
        if (processingRef.current) return; // check again after async confirm

        processingRef.current = true;
        setIsProcessing(true);
        try {
            if (activeTab === 'sale') {
                const savedReturnId = await firestoreService.addSaleReturn({
                    date: new Date().toISOString().split('T')[0],
                    items: returnCart.map(item => ({
                        ...item.sourceItem,
                        quantity: item.quantity,
                        price: item.averagePrice,
                        sourceAllocations: item.sourceAllocations
                    })),
                    totalRefund,
                    ...(returnCart.length === 1 && returnCart[0].invoiceIds.length === 1
                        ? { invoiceId: returnCart[0].invoiceIds[0] }
                        : {}),
                    originalInvoiceIds: [...new Set(returnCart.flatMap(item => item.sourceInvoiceIds || []))],
                    invoiceIds: [...new Set(returnCart.flatMap(item => item.sourceInvoiceIds || []))],
                    customerId: selectedSaleCustomer.phone || selectedSaleCustomer.name.toLowerCase(),
                    customerName: selectedSaleCustomer.name,
                    customerPhone: selectedSaleCustomer.phone || ''
                });
                showSuccess(String(savedReturnId).startsWith('OFFLINE-')
                    ? "Sale return saved offline. It will sync when internet returns."
                    : "Sale Return Processed! Stock updated.");
            } else {
                const returnData = {
                    date: new Date().toISOString().split('T')[0],
                    items: purchaseReturnCart.map(item => ({
                        ...item.sourceItem,
                        quantity: item.quantity,
                        purchasePrice: item.averagePrice,
                        sourceAllocations: item.sourceAllocations
                    })),
                    totalRefund,
                    originalPurchaseIds: [...new Set(purchaseReturnCart.flatMap(item => item.sourceInvoiceIds || []))],
                    purchaseIds: [...new Set(purchaseReturnCart.flatMap(item => item.sourceInvoiceIds || []))]
                };
                const savedPurchaseReturnId = await firestoreService.addPurchaseReturn({
                    ...returnData,
                    ...(returnData.purchaseIds.length === 1 ? { purchaseId: returnData.purchaseIds[0] } : {}),
                    supplierName: selectedPurchaseSupplier.name,
                    supplierPhone: selectedPurchaseSupplier.phone || ''
                });
                showSuccess(String(savedPurchaseReturnId).startsWith('OFFLINE-')
                    ? "Purchase return saved offline. It will sync when internet returns."
                    : "Purchase Return Processed! Stock updated.");
            }

            setSourceRecord(null);
            setSearchId('');
            setReturnItems({});
            setReturnCart([]);
            setPurchaseReturnCart([]);
            setSaleProductSearch('');
            setPurchaseProductSearch('');
            setShowProductSuggestions(false);
            setShowPurchaseProductSuggestions(false);
        } catch (err) {
            console.error("Return Failed:", err);
            showError("Failed: " + err.message);
        } finally {
            processingRef.current = false;
            setIsProcessing(false);
        }
    };

    const activeReturns = activeTab === 'sale' ? saleReturns : purchaseReturns;

    const saleCustomerOptions = Array.from(new Map([
        ...allCustomers.map(customer => [customer.phone || (customer.name || '').trim().toLowerCase(), {
            name: (customer.name || '').trim(),
            phone: customer.phone || '',
            address: customer.address || ''
        }]),
        ...allInvoices.map(invoice => [invoice.customerPhone || (invoice.customerName || '').trim().toLowerCase(), {
            name: (invoice.customerName || '').trim(),
            phone: invoice.customerPhone || '',
            address: invoice.customerAddress || ''
        }])
    ].filter(([, customer]) => customer.name)).values()).sort((a, b) => a.name.localeCompare(b.name));

    const matchingCustomerOptions = saleCustomerOptions.filter(customer =>
        customer.name.toLowerCase().includes(saleCustomerSearch.trim().toLowerCase()) ||
        customer.phone.includes(saleCustomerSearch.trim())
    ).slice(0, 8);

    const productCustomerKey = (customerName, customerPhone) => `${customerPhone || ''}|${(customerName || '').trim().toLowerCase()}`;

    const sortNewestSourceLines = (a, b) => {
        const dateDifference = new Date(b.sortKey || b.date || 0) - new Date(a.sortKey || a.date || 0);
        if (dateDifference !== 0) return dateDifference;
        return String(b.invoiceId || '').localeCompare(String(a.invoiceId || ''), undefined, { numeric: true });
    };

    const buildReturnProductOptions = () => {
        const grouped = new Map();
        const invoices = selectedSaleCustomer ? getCustomerInvoices(selectedSaleCustomer.name) : allInvoices;

        invoices.forEach(invoice => {
            (invoice.items || []).forEach(item => {
                const customerName = invoice.customerName || selectedSaleCustomer?.name || '';
                const customerPhone = invoice.customerPhone || selectedSaleCustomer?.phone || '';
                const productId = item.id || (item.name || '').trim().toLowerCase();
                const key = `${productCustomerKey(customerName, customerPhone)}|${productId}`;
                const existing = grouped.get(key) || {
                    key,
                    customerName,
                    customerPhone,
                    productId: item.id || '',
                    productName: item.name || 'Product',
                    sourceItem: item,
                    totalPurchased: 0,
                    totalValue: 0,
                    invoiceIds: [],
                    invoiceLines: []
                };
                const quantity = Number(item.quantity) || 0;
                existing.totalPurchased += quantity;
                existing.totalValue += quantity * (Number(item.price ?? item.purchasePrice ?? 0) || 0);
                if (invoice.id && !existing.invoiceIds.includes(invoice.id)) existing.invoiceIds.push(invoice.id);
                if (invoice.id) {
                    const existingLine = existing.invoiceLines.find(line => line.invoiceId === invoice.id);
                    if (existingLine) {
                        existingLine.quantity += quantity;
                    } else {
                        existing.invoiceLines.push({
                            invoiceId: invoice.id,
                            quantity,
                            price: Number(item.price ?? item.purchasePrice ?? 0) || 0,
                            date: invoice.date || invoice.createdAt,
                            sortKey: invoice.createdAt || invoice.date,
                            sourceItem: item
                        });
                    }
                }
                grouped.set(key, existing);
            });
        });

        return [...grouped.values()].map(option => {
            const alreadyReturned = getAlreadyReturnedForCustomerProduct(
                option.customerName,
                option.customerPhone,
                option.productId,
                option.productName.toLowerCase()
            );
            let previousReturns = alreadyReturned;
            const sourceLines = [...option.invoiceLines]
                .sort(sortNewestSourceLines)
                .map(line => {
                    const returnedFromThisLine = Math.min(line.quantity, previousReturns);
                    previousReturns = Math.max(0, previousReturns - returnedFromThisLine);
                    return { ...line, availableQty: Math.max(0, line.quantity - returnedFromThisLine) };
                })
                .filter(line => line.availableQty > 0);

            return {
                ...option,
                sourceLines,
                availableQty: sourceLines.reduce((total, line) => total + line.availableQty, 0),
                averagePrice: option.totalPurchased > 0 ? option.totalValue / option.totalPurchased : 0
            };
        });
    };

    const returnProductOptions = buildReturnProductOptions();
    const matchingProductOptions = returnProductOptions.filter(option =>
        option.productName.toLowerCase().includes(saleProductSearch.trim().toLowerCase()) && option.availableQty > 0
    ).slice(0, 20);

    const selectSaleCustomer = (customer) => {
        setSelectedSaleCustomer(customer);
        setSaleCustomerSearch(customer.name);
        setSaleProductSearch('');
        setShowCustomerSuggestions(false);
        setShowProductSuggestions(false);
        setReturnCart([]);
        setBrowseSearch('');
    };

    const allocateSourceLines = (option, quantity) => {
        let remaining = quantity;
        return (option.sourceLines || []).flatMap(line => {
            if (remaining <= 0) return [];
            const allocatedQuantity = Math.min(line.availableQty, remaining);
            remaining -= allocatedQuantity;
            return allocatedQuantity > 0 ? [{
                invoiceId: line.invoiceId,
                quantity: allocatedQuantity,
                price: line.price,
                sourceItem: line.sourceItem
            }] : [];
        });
    };

    const createReturnCartItem = (option, quantity) => {
        const sourceAllocations = allocateSourceLines(option, quantity);
        const allocatedValue = sourceAllocations.reduce((total, line) => total + (line.quantity * line.price), 0);
        return {
            ...option,
            quantity,
            sourceAllocations,
            sourceInvoiceIds: sourceAllocations.map(line => line.invoiceId),
            sourceItem: sourceAllocations[0]?.sourceItem || option.sourceItem,
            averagePrice: quantity > 0 ? allocatedValue / quantity : option.averagePrice
        };
    };

    const addReturnProduct = (option) => {
        if (!selectedSaleCustomer) {
            selectSaleCustomer({ name: option.customerName, phone: option.customerPhone, address: '' });
        }

        setReturnCart(previous => {
            const existing = previous.find(item => item.key === option.key);
            if (existing) {
                if (existing.quantity >= option.availableQty) {
                    showError('Cannot return more than the remaining purchased quantity.');
                    return previous;
                }
                return previous.map(item => item.key === option.key
                    ? createReturnCartItem(option, item.quantity + 1)
                    : item);
            }
            return [...previous, createReturnCartItem(option, 1)];
        });
        setSaleProductSearch('');
        setShowProductSuggestions(false);
    };

    const updateReturnProductQuantity = (key, delta) => {
        setReturnCart(previous => previous.flatMap(item => {
            if (item.key !== key) return [item];
            const next = Math.max(0, Math.min(item.availableQty, item.quantity + delta));
            return next === 0 ? [] : [createReturnCartItem(item, next)];
        }));
    };

    const purchaseSupplierOptions = Array.from(new Map([
        ...allSuppliers.map(supplier => [supplier.name?.trim().toLowerCase(), {
            name: (supplier.name || '').trim(),
            phone: supplier.phone || '',
            address: supplier.address || ''
        }]),
        ...allPurchases.map(purchase => [purchase.supplierName?.trim().toLowerCase(), {
            name: (purchase.supplierName || '').trim(),
            phone: purchase.supplierPhone || '',
            address: purchase.supplierAddress || ''
        }])
    ].filter(([, supplier]) => supplier.name)).values()).sort((a, b) => a.name.localeCompare(b.name));

    const matchingSupplierOptions = purchaseSupplierOptions.filter(supplier =>
        supplier.name.toLowerCase().includes(purchaseSupplierSearch.trim().toLowerCase()) ||
        supplier.phone.includes(purchaseSupplierSearch.trim())
    ).slice(0, 8);

    const buildPurchaseReturnProductOptions = () => {
        const grouped = new Map();
        const purchases = selectedPurchaseSupplier
            ? allPurchases.filter(purchase => (purchase.supplierName || '').trim().toLowerCase() === selectedPurchaseSupplier.name.trim().toLowerCase())
            : allPurchases;

        purchases.forEach(purchase => {
            (purchase.items || []).forEach(item => {
                const supplierName = purchase.supplierName || selectedPurchaseSupplier?.name || '';
                const key = `${supplierName.trim().toLowerCase()}|${item.id || (item.name || '').trim().toLowerCase()}`;
                const existing = grouped.get(key) || {
                    key,
                    supplierName,
                    productId: item.id || '',
                    productName: item.name || 'Product',
                    sourceItem: item,
                    totalPurchased: 0,
                    totalValue: 0,
                    invoiceLines: [],
                    invoiceIds: []
                };
                const quantity = Number(item.quantity) || 0;
                const price = Number(item.purchasePrice ?? item.rateIncl ?? item.price ?? 0) || 0;
                existing.totalPurchased += quantity;
                existing.totalValue += quantity * price;
                if (purchase.id && !existing.invoiceIds.includes(purchase.id)) existing.invoiceIds.push(purchase.id);
                if (purchase.id) {
                    const existingLine = existing.invoiceLines.find(line => line.invoiceId === purchase.id);
                    if (existingLine) {
                        existingLine.quantity += quantity;
                    } else {
                        existing.invoiceLines.push({
                            invoiceId: purchase.id,
                            quantity,
                            price,
                            date: purchase.date || purchase.createdAt,
                            sortKey: purchase.createdAt || purchase.date,
                            sourceItem: item
                        });
                    }
                }
                grouped.set(key, existing);
            });
        });

        return [...grouped.values()].map(option => {
            let previousReturns = getAlreadyReturnedForSupplierProduct(
                option.supplierName,
                option.productId,
                option.productName.toLowerCase()
            );
            const sourceLines = [...option.invoiceLines]
                .sort(sortNewestSourceLines)
                .map(line => {
                    const returnedFromThisLine = Math.min(line.quantity, previousReturns);
                    previousReturns = Math.max(0, previousReturns - returnedFromThisLine);
                    return { ...line, availableQty: Math.max(0, line.quantity - returnedFromThisLine) };
                })
                .filter(line => line.availableQty > 0);

            return {
                ...option,
                sourceLines,
                availableQty: sourceLines.reduce((total, line) => total + line.availableQty, 0),
                averagePrice: option.totalPurchased > 0 ? option.totalValue / option.totalPurchased : 0
            };
        });
    };

    const purchaseReturnProductOptions = buildPurchaseReturnProductOptions();
    const matchingPurchaseProductOptions = purchaseReturnProductOptions.filter(option =>
        option.productName.toLowerCase().includes(purchaseProductSearch.trim().toLowerCase()) && option.availableQty > 0
    ).slice(0, 20);

    const selectPurchaseSupplier = (supplier) => {
        setSelectedPurchaseSupplier(supplier);
        setPurchaseSupplierSearch(supplier.name);
        setPurchaseProductSearch('');
        setPurchaseReturnCart([]);
        setShowSupplierSuggestions(false);
        setShowPurchaseProductSuggestions(false);
    };

    const addPurchaseReturnProduct = (option) => {
        if (!selectedPurchaseSupplier) {
            selectPurchaseSupplier({ name: option.supplierName, phone: '', address: '' });
        }

        setPurchaseReturnCart(previous => {
            const existing = previous.find(item => item.key === option.key);
            if (existing) {
                if (existing.quantity >= option.availableQty) {
                    showError('Cannot return more than the remaining purchased quantity.');
                    return previous;
                }
                return previous.map(item => item.key === option.key
                    ? createReturnCartItem(option, item.quantity + 1)
                    : item);
            }
            return [...previous, createReturnCartItem(option, 1)];
        });
        setPurchaseProductSearch('');
        setShowPurchaseProductSuggestions(false);
    };

    const updatePurchaseReturnProductQuantity = (key, delta) => {
        setPurchaseReturnCart(previous => previous.flatMap(item => {
            if (item.key !== key) return [item];
            const next = Math.max(0, Math.min(item.availableQty, item.quantity + delta));
            return next === 0 ? [] : [createReturnCartItem(item, next)];
        }));
    };

    const handleDeleteReturn = async (ret) => {
        if (!await showConfirm(
            `Delete this return record?`,
            `Stock will be rolled back: ${(ret.items || []).map(i => `${i.name} ×${i.quantity}`).join(', ')}`
        )) return;
        try {
            if (activeTab === 'sale') {
                await firestoreService.deleteSaleReturn(ret.id, ret.items || []);
            } else {
                await firestoreService.deletePurchaseReturn(ret.id, ret.items || []);
            }
            showSuccess('Return deleted & stock rolled back.');
        } catch (err) {
            showError('Failed to delete: ' + err.message);
        }
    };

    return (
        <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--text-main)' }}>
                        <RotateCcw className="text-primary" /> Returns Management
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">Handle returns with automatic stock adjustment.</p>
                </div>
                <div className="flex bg-black/5 p-1 rounded-xl border border-border self-start sm:self-auto">
                    <button
                        onClick={() => {
                            setActiveTab('sale');
                            setSourceRecord(null);
                            setSearchId('');
                            setSaleCustomerSearch('');
                            setSaleProductSearch('');
                            setSelectedSaleCustomer(null);
                            setReturnCart([]);
                            setPurchaseSupplierSearch('');
                            setPurchaseProductSearch('');
                            setSelectedPurchaseSupplier(null);
                            setPurchaseReturnCart([]);
                            setShowCustomerSuggestions(false);
                            setShowProductSuggestions(false);
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'sale' ? 'bg-white shadow-sm text-primary' : 'text-gray-500'}`}
                    >Sale Return</button>
                    <button
                        onClick={() => {
                            setActiveTab('purchase');
                            setSourceRecord(null);
                            setSearchId('');
                            setSaleCustomerSearch('');
                            setSaleProductSearch('');
                            setSelectedSaleCustomer(null);
                            setReturnCart([]);
                            setPurchaseSupplierSearch('');
                            setPurchaseProductSearch('');
                            setSelectedPurchaseSupplier(null);
                            setPurchaseReturnCart([]);
                            setShowCustomerSuggestions(false);
                            setShowProductSuggestions(false);
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'purchase' ? 'bg-white shadow-sm text-primary' : 'text-gray-500'}`}
                    >Purchase Return</button>
                </div>
            </div>

            {!sourceRecord ? (
                activeTab === 'sale' ? (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
                        <div className="lg:col-span-2 space-y-6">
                            <div className="card p-5 shadow-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                                <h3 className="text-lg font-bold mb-5 flex items-center gap-2" style={{ color: 'var(--text-main)' }}>
                                    <User size={20} className="text-primary" /> Customer Information
                                </h3>
                                <div className="relative">
                                    <label className="text-[10px] font-extrabold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>Customer Name / Phone</label>
                                    <div className="relative">
                                        <input
                                            autoFocus
                                            type="text"
                                            placeholder="Search or enter customer name..."
                                            value={saleCustomerSearch}
                                            onChange={e => {
                                                setSaleCustomerSearch(e.target.value);
                                                setSelectedSaleCustomer(null);
                                                setReturnCart([]);
                                                setShowCustomerSuggestions(true);
                                                setSaleProductSearch('');
                                            }}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && matchingCustomerOptions[0]) {
                                                    e.preventDefault();
                                                    selectSaleCustomer(matchingCustomerOptions[0]);
                                                }
                                            }}
                                            onFocus={() => setShowCustomerSuggestions(true)}
                                            onBlur={() => setTimeout(() => setShowCustomerSuggestions(false), 150)}
                                            className="w-full pl-10 pr-10 py-3 border rounded-xl transition-all font-medium"
                                            style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                                        />
                                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2" size={18} style={{ color: 'var(--text-muted)' }} />
                                        {saleCustomerSearch && (
                                            <button type="button" onClick={() => { setSaleCustomerSearch(''); setSelectedSaleCustomer(null); setReturnCart([]); setSaleProductSearch(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                                                <X size={16} />
                                            </button>
                                        )}
                                    </div>
                                    {showCustomerSuggestions && saleCustomerSearch && matchingCustomerOptions.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 rounded-xl shadow-2xl z-[100] border mt-2 max-h-[250px] overflow-y-auto divide-y" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                                            {matchingCustomerOptions.map(customer => (
                                                <button
                                                    type="button"
                                                    key={`${customer.phone}-${customer.name}`}
                                                    onMouseDown={e => e.preventDefault()}
                                                    onClick={() => selectSaleCustomer(customer)}
                                                    className="w-full p-4 cursor-pointer hover:bg-black/5 transition-colors flex items-center gap-3 text-left"
                                                >
                                                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(var(--primary-rgb), 0.1)', color: 'var(--primary)' }}><User size={16} /></div>
                                                    <div>
                                                        <div className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>{customer.name}</div>
                                                        <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{customer.phone || 'No phone'}{customer.address ? ` • ${customer.address}` : ''}</div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="card p-5 shadow-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                                <h3 className="text-lg font-bold mb-5" style={{ color: 'var(--text-main)' }}>Return Items</h3>
                                <div className="relative mb-6">
                                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2" size={18} style={{ color: 'var(--text-muted)' }} />
                                    <input
                                        id="return-product-search"
                                        type="text"
                                        placeholder={selectedSaleCustomer ? 'Search products purchased by this customer...' : 'Search product to see who purchased it...'}
                                        value={saleProductSearch}
                                        onChange={e => { setSaleProductSearch(e.target.value); setShowProductSuggestions(true); }}
                                        onFocus={() => setShowProductSuggestions(true)}
                                        onBlur={() => setTimeout(() => setShowProductSuggestions(false), 150)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && matchingProductOptions[0]) {
                                                e.preventDefault();
                                                addReturnProduct(matchingProductOptions[0]);
                                            }
                                        }}
                                        className="w-full pl-10 pr-4 py-3 border rounded-xl transition-all font-medium"
                                        style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                                    />
                                    {showProductSuggestions && saleProductSearch && matchingProductOptions.length > 0 && (
                                        <div className="absolute top-[54px] left-0 right-0 rounded-xl shadow-2xl z-[100] border max-h-[350px] overflow-y-auto divide-y" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                                            {matchingProductOptions.map(option => (
                                                <button
                                                    type="button"
                                                    key={option.key}
                                                    onMouseDown={e => e.preventDefault()}
                                                    onClick={() => addReturnProduct(option)}
                                                    className="w-full p-4 cursor-pointer hover:bg-black/5 transition-colors flex justify-between items-center group text-left"
                                                >
                                                    <div className="min-w-0">
                                                        <div className="font-bold group-hover:text-primary transition-colors truncate" style={{ color: 'var(--text-main)' }}>{option.productName}</div>
                                                        <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{option.customerName} • {option.availableQty} available</div>
                                                    </div>
                                                    <span className="text-[10px] uppercase font-bold px-2 py-1 rounded-full ml-3" style={{ background: 'rgba(var(--primary-rgb), 0.1)', color: 'var(--primary)' }}>Add</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {saleProductSearch && matchingProductOptions.length === 0 && (
                                        <p className="mt-2 text-left text-xs font-bold text-amber-600">
                                            {selectedSaleCustomer ? "This customer hasn't purchased this product yet." : "No customer has purchased this product yet."}
                                        </p>
                                    )}
                                </div>

                                {returnCart.length === 0 ? (
                                    <div className="py-10 text-center rounded-xl border border-dashed" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                                        <Package size={34} className="mx-auto mb-2 opacity-40" />
                                        <p className="font-bold">Search and add products to return</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto -mx-5 px-5">
                                        <table className="w-full min-w-[620px] border-collapse">
                                            <thead>
                                                <tr className="text-left border-b" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Product</th>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Original Bills</th>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Price</th>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Qty</th>
                                                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-right" style={{ color: 'var(--text-muted)' }}>Refund</th>
                                                    <th className="px-4 py-3 w-10"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y" style={{ divideColor: 'var(--border)' }}>
                                                {returnCart.map(item => (
                                                    <tr key={item.key} style={{ background: 'var(--surface)' }}>
                                                        <td className="px-4 py-4 font-bold" style={{ color: 'var(--text-main)' }}>{item.productName}</td>
                                                        <td className="px-4 py-4 text-xs font-medium max-w-[180px]" style={{ color: 'var(--text-muted)' }}>{(item.sourceInvoiceIds || item.invoiceIds || []).join(', ')}</td>
                                                        <td className="px-4 py-4 font-bold" style={{ color: 'var(--text-secondary)' }}>Rs.{item.averagePrice.toFixed(2)}</td>
                                                        <td className="px-4 py-4">
                                                            <div className="flex items-center gap-2">
                                                                <button onClick={() => updateReturnProductQuantity(item.key, -1)} className="w-8 h-8 rounded-lg border font-bold" style={{ borderColor: 'var(--border)' }}>−</button>
                                                                <span className="w-8 text-center font-black">{item.quantity}</span>
                                                                <button onClick={() => updateReturnProductQuantity(item.key, 1)} disabled={item.quantity >= item.availableQty} className="w-8 h-8 rounded-lg border font-bold disabled:opacity-30" style={{ borderColor: 'var(--border)' }}>+</button>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-4 text-right font-black" style={{ color: 'var(--primary)' }}>Rs.{(item.quantity * item.averagePrice).toFixed(2)}</td>
                                                        <td className="px-4 py-4 text-right"><button onClick={() => updateReturnProductQuantity(item.key, -item.quantity)} className="p-2 text-red-400 hover:text-red-600"><Trash2 size={16} /></button></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="card p-6 shadow-xl border-t-4 border-primary sticky top-[86px]" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                                <h3 className="text-xl font-bold mb-6" style={{ color: 'var(--text-main)' }}>Return Summary</h3>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center text-sm"><span style={{ color: 'var(--text-muted)' }}>Customer</span><span className="font-bold text-right max-w-[150px] truncate">{selectedSaleCustomer?.name || 'Not selected'}</span></div>
                                    <div className="flex justify-between items-center text-sm"><span style={{ color: 'var(--text-muted)' }}>Products</span><span className="font-bold">{returnCart.length}</span></div>
                                    <div className="p-4 rounded-2xl border" style={{ background: 'rgba(var(--primary-rgb), 0.05)', borderColor: 'rgba(var(--primary-rgb), 0.15)' }}>
                                        <div className="text-[10px] font-extrabold uppercase tracking-widest pl-1 mb-1" style={{ color: 'var(--primary)' }}>Total Refund</div>
                                        <div className="text-3xl font-black tracking-tighter leading-none" style={{ color: 'var(--primary)' }}>Rs.{calculateReturnCartTotal().toFixed(2)}</div>
                                    </div>
                                    <button onClick={handleSubmit} disabled={isProcessing || returnCart.length === 0} className="w-full py-4 bg-primary text-white rounded-2xl font-black text-lg shadow-lg flex items-center justify-center gap-3 transition-all disabled:opacity-50">
                                        <CheckCircle2 size={20} /> {isProcessing ? 'PROCESSING...' : 'CREATE RETURN INVOICE'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                <>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="card p-5 shadow-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                            <h3 className="text-lg font-bold mb-5 flex items-center gap-2" style={{ color: 'var(--text-main)' }}>
                                <ShoppingBag size={20} className="text-primary" /> Supplier Information
                            </h3>
                            <div className="relative">
                                <label className="text-[10px] font-extrabold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>Supplier Name / Phone</label>
                                <div className="relative">
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="Search or enter supplier name..."
                                        value={purchaseSupplierSearch}
                                        onChange={e => {
                                            setPurchaseSupplierSearch(e.target.value);
                                            setSelectedPurchaseSupplier(null);
                                            setPurchaseReturnCart([]);
                                            setShowSupplierSuggestions(true);
                                            setPurchaseProductSearch('');
                                        }}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && matchingSupplierOptions[0]) {
                                                e.preventDefault();
                                                selectPurchaseSupplier(matchingSupplierOptions[0]);
                                            }
                                        }}
                                        onFocus={() => setShowSupplierSuggestions(true)}
                                        onBlur={() => setTimeout(() => setShowSupplierSuggestions(false), 150)}
                                        className="w-full pl-10 pr-10 py-3 border rounded-xl transition-all font-medium"
                                        style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                                    />
                                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2" size={18} style={{ color: 'var(--text-muted)' }} />
                                    {purchaseSupplierSearch && <button type="button" onClick={() => { setPurchaseSupplierSearch(''); setSelectedPurchaseSupplier(null); setPurchaseReturnCart([]); setPurchaseProductSearch(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X size={16} /></button>}
                                </div>
                                {showSupplierSuggestions && purchaseSupplierSearch && matchingSupplierOptions.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 rounded-xl shadow-2xl z-[100] border mt-2 max-h-[250px] overflow-y-auto divide-y" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                                        {matchingSupplierOptions.map(supplier => (
                                            <button type="button" key={`${supplier.name}-${supplier.phone}`} onMouseDown={e => e.preventDefault()} onClick={() => selectPurchaseSupplier(supplier)} className="w-full p-4 cursor-pointer hover:bg-black/5 transition-colors flex items-center gap-3 text-left">
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(var(--primary-rgb), 0.1)', color: 'var(--primary)' }}><ShoppingBag size={16} /></div>
                                                <div><div className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>{supplier.name}</div><div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{supplier.phone || 'No phone'}</div></div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="card p-5 shadow-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                            <h3 className="text-lg font-bold mb-5" style={{ color: 'var(--text-main)' }}>Return Items</h3>
                            <div className="relative mb-6">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2" size={18} style={{ color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    placeholder={selectedPurchaseSupplier ? 'Search products purchased from this supplier...' : 'Search product to see suppliers...'}
                                    value={purchaseProductSearch}
                                    onChange={e => { setPurchaseProductSearch(e.target.value); setShowPurchaseProductSuggestions(true); }}
                                    onFocus={() => setShowPurchaseProductSuggestions(true)}
                                    onBlur={() => setTimeout(() => setShowPurchaseProductSuggestions(false), 150)}
                                    onKeyDown={e => { if (e.key === 'Enter' && matchingPurchaseProductOptions[0]) { e.preventDefault(); addPurchaseReturnProduct(matchingPurchaseProductOptions[0]); } }}
                                    className="w-full pl-10 pr-4 py-3 border rounded-xl transition-all font-medium"
                                    style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                                />
                                {showPurchaseProductSuggestions && purchaseProductSearch && matchingPurchaseProductOptions.length > 0 && (
                                    <div className="absolute top-[54px] left-0 right-0 rounded-xl shadow-2xl z-[100] border max-h-[350px] overflow-y-auto divide-y" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                                        {matchingPurchaseProductOptions.map(option => (
                                            <button type="button" key={option.key} onMouseDown={e => e.preventDefault()} onClick={() => addPurchaseReturnProduct(option)} className="w-full p-4 cursor-pointer hover:bg-black/5 transition-colors flex justify-between items-center group text-left">
                                                <div className="min-w-0"><div className="font-bold group-hover:text-primary transition-colors truncate" style={{ color: 'var(--text-main)' }}>{option.productName}</div><div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{option.supplierName} · {option.availableQty} available</div></div>
                                                <span className="text-[10px] uppercase font-bold px-2 py-1 rounded-full ml-3" style={{ background: 'rgba(var(--primary-rgb), 0.1)', color: 'var(--primary)' }}>Add</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {purchaseProductSearch && matchingPurchaseProductOptions.length === 0 && <p className="mt-2 text-left text-xs font-bold text-amber-600">{selectedPurchaseSupplier ? "This supplier hasn't purchased this product yet." : "No supplier has purchased this product yet."}</p>}
                            </div>

                            {purchaseReturnCart.length === 0 ? (
                                <div className="py-10 text-center rounded-xl border border-dashed" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}><Package size={34} className="mx-auto mb-2 opacity-40" /><p className="font-bold">Search and add products to return</p></div>
                            ) : (
                                <div className="overflow-x-auto -mx-5 px-5">
                                    <table className="w-full min-w-[620px] border-collapse">
                                        <thead><tr className="text-left border-b" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}><th className="px-4 py-3 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Product</th><th className="px-4 py-3 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Original Purchases</th><th className="px-4 py-3 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Price</th><th className="px-4 py-3 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Qty</th><th className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-right" style={{ color: 'var(--text-muted)' }}>Refund</th><th className="px-4 py-3 w-10"></th></tr></thead>
                                        <tbody className="divide-y" style={{ divideColor: 'var(--border)' }}>{purchaseReturnCart.map(item => <tr key={item.key} style={{ background: 'var(--surface)' }}><td className="px-4 py-4 font-bold" style={{ color: 'var(--text-main)' }}>{item.productName}</td><td className="px-4 py-4 text-xs font-medium max-w-[180px]" style={{ color: 'var(--text-muted)' }}>{(item.sourceInvoiceIds || item.invoiceIds || []).join(', ')}</td><td className="px-4 py-4 font-bold" style={{ color: 'var(--text-secondary)' }}>Rs.{item.averagePrice.toFixed(2)}</td><td className="px-4 py-4"><div className="flex items-center gap-2"><button onClick={() => updatePurchaseReturnProductQuantity(item.key, -1)} className="w-8 h-8 rounded-lg border font-bold" style={{ borderColor: 'var(--border)' }}>−</button><span className="w-8 text-center font-black">{item.quantity}</span><button onClick={() => updatePurchaseReturnProductQuantity(item.key, 1)} disabled={item.quantity >= item.availableQty} className="w-8 h-8 rounded-lg border font-bold disabled:opacity-30" style={{ borderColor: 'var(--border)' }}>+</button></div></td><td className="px-4 py-4 text-right font-black" style={{ color: 'var(--primary)' }}>Rs.{(item.quantity * item.averagePrice).toFixed(2)}</td><td className="px-4 py-4 text-right"><button onClick={() => updatePurchaseReturnProductQuantity(item.key, -item.quantity)} className="p-2 text-red-400 hover:text-red-600"><Trash2 size={16} /></button></td></tr>)}</tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="space-y-6"><div className="card p-6 shadow-xl border-t-4 border-primary sticky top-[86px]" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}><h3 className="text-xl font-bold mb-6" style={{ color: 'var(--text-main)' }}>Return Summary</h3><div className="space-y-4"><div className="flex justify-between items-center text-sm"><span style={{ color: 'var(--text-muted)' }}>Supplier</span><span className="font-bold text-right max-w-[150px] truncate">{selectedPurchaseSupplier?.name || 'Not selected'}</span></div><div className="flex justify-between items-center text-sm"><span style={{ color: 'var(--text-muted)' }}>Products</span><span className="font-bold">{purchaseReturnCart.length}</span></div><div className="p-4 rounded-2xl border" style={{ background: 'rgba(var(--primary-rgb), 0.05)', borderColor: 'rgba(var(--primary-rgb), 0.15)' }}><div className="text-[10px] font-extrabold uppercase tracking-widest pl-1 mb-1" style={{ color: 'var(--primary)' }}>Total Refund</div><div className="text-3xl font-black tracking-tighter leading-none" style={{ color: 'var(--primary)' }}>Rs.{calculatePurchaseReturnCartTotal().toFixed(2)}</div></div><button onClick={handleSubmit} disabled={isProcessing || purchaseReturnCart.length === 0} className="w-full py-4 bg-primary text-white rounded-2xl font-black text-lg shadow-lg flex items-center justify-center gap-3 transition-all disabled:opacity-50"><CheckCircle2 size={20} /> {isProcessing ? 'PROCESSING...' : 'CREATE RETURN INVOICE'}</button></div></div></div>
                </div>
                {false && (
                <div className="card p-6 md:p-10 flex flex-col items-center justify-center text-center animate-in fade-in duration-500" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                        {activeTab === 'sale' ? <ShoppingBag size={32} className="text-primary" /> : <Package size={32} className="text-primary" />}
                    </div>
                    <h3 className="text-xl font-bold">{activeTab === 'sale' ? 'Select Customer & Product' : 'Find Original Purchase'}</h3>
                    <p className="text-gray-500 text-sm max-w-sm mt-2 mb-6">
                        {activeTab === 'sale' ? 'Choose the customer, then select the product to return.' : 'Enter the purchase ID or pick from the list below.'}
                    </p>

                    {activeTab === 'purchase' && (
                        <form onSubmit={handleSearch} className="w-full max-w-md relative mb-8">
                            <input
                                type="text"
                                placeholder="Enter Purchase ID..."
                                value={searchId}
                                onChange={(e) => setSearchId(e.target.value)}
                                className="w-full p-4 pl-12 rounded-2xl border focus:ring-4 focus:ring-primary/10 outline-none transition-all font-bold text-lg"
                                style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                            />
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary text-white px-5 py-2 rounded-xl font-bold hover:opacity-90">Search</button>
                        </form>
                    )}

                    <div className="w-full max-w-2xl">
                        {/* Browse header: search + date filter */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
                            <h4 className="text-sm font-black uppercase tracking-widest text-gray-400">Browse {activeTab === 'sale' ? 'Bills' : 'Purchases'}</h4>
                            <div className="flex items-center gap-2 flex-wrap">
                                {/* Inline text search — overrides date filter */}
                                <div className="relative">
                                    <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder={activeTab === 'sale' ? 'Search customer or product...' : 'Search ID / supplier...'}
                                        value={browseSearch}
                                        onChange={e => setBrowseSearch(e.target.value)}
                                        className="pl-6 pr-2 py-1.5 text-xs font-bold rounded-lg border border-border outline-none focus:ring-2 focus:ring-primary/20 transition-all w-36"
                                        style={{ background: 'var(--surface)', color: 'var(--text-main)' }}
                                    />
                                    {browseSearch && (
                                        <button onClick={() => setBrowseSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>
                                {/* Date filter — dimmed when text search is active */}
                                <div className={`flex items-center gap-1.5 transition-opacity ${browseSearch ? 'opacity-30 pointer-events-none' : ''}`}>
                                    <span className="text-xs font-bold text-gray-400">Date:</span>
                                    <input
                                        type="date"
                                        value={filterDate}
                                        onChange={(e) => setFilterDate(e.target.value)}
                                        className="px-2 py-1.5 text-xs font-bold rounded-lg border border-border outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                        style={{ background: 'var(--surface)', color: 'var(--text-main)' }}
                                    />
                                    {filterDate && (
                                        <button onClick={() => setFilterDate('')} className="text-[10px] bg-gray-100 px-2 py-1 rounded-md font-bold text-gray-500 hover:bg-gray-200 uppercase">Clear</button>
                                    )}
                                </div>
                            </div>
                        </div>
                        {activeTab === 'sale' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                                <div className="relative">
                                    <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Select customer name..."
                                        value={saleCustomerSearch}
                                        onChange={e => {
                                            setSaleCustomerSearch(e.target.value);
                                            setSaleProductSearch('');
                                            setSourceRecord(null);
                                        }}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && matchingCustomerOptions[0]) {
                                                e.preventDefault();
                                                selectSaleCustomer(matchingCustomerOptions[0]);
                                            }
                                        }}
                                        className="w-full pl-9 pr-9 py-2.5 text-sm font-bold rounded-lg border border-border outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                        style={{ background: 'var(--surface)', color: 'var(--text-main)' }}
                                    />
                                    {saleCustomerSearch && (
                                        <button
                                            type="button"
                                            onClick={() => setSaleCustomerSearch('')}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                    {saleCustomerSearch && matchingCustomerOptions.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 z-30 mt-1 max-h-48 overflow-y-auto rounded-xl border shadow-xl" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                                            {matchingCustomerOptions.map(name => (
                                                <button
                                                    type="button"
                                                    key={name}
                                                onClick={() => selectSaleCustomer(name)}
                                                    className="w-full px-3 py-2.5 text-left text-sm font-bold hover:bg-black/5"
                                                    style={{ color: 'var(--text-main)' }}
                                                >
                                                    {name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="relative">
                                    <Package size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Select product name..."
                                        value={saleProductSearch}
                                        onChange={e => setSaleProductSearch(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && saleProductSearch.trim()) {
                                                e.preventDefault();
                                                addReturnProduct(matchingProductOptions[0]);
                                            }
                                        }}
                                        disabled={!saleCustomerSearch}
                                        className="w-full pl-9 pr-9 py-2.5 text-sm font-bold rounded-lg border border-border outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                        style={{ background: 'var(--surface)', color: 'var(--text-main)' }}
                                    />
                                    {saleProductSearch && (
                                        <button
                                            type="button"
                                            onClick={() => setSaleProductSearch('')}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                    {saleProductSearch && matchingProductOptions.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 z-30 mt-1 max-h-48 overflow-y-auto rounded-xl border shadow-xl" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                                            {matchingProductOptions.map(name => (
                                                <button
                                                    type="button"
                                                    key={name}
                                                onClick={() => addReturnProduct(name)}
                                                    className="w-full px-3 py-2.5 text-left text-sm font-bold hover:bg-black/5"
                                                    style={{ color: 'var(--text-main)' }}
                                                >
                                                    {name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {saleCustomerSearch && saleProductSearch.trim().length > 1 && matchingProductOptions.length === 0 && (
                                        <p className="mt-1 text-left text-xs font-bold text-amber-600">
                                            This customer hasn&apos;t purchased this product yet.
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-1 gap-3 max-h-[350px] overflow-y-auto pr-1">
                            {(activeTab === 'sale' ? allInvoices : allPurchases)
                                .filter(record => {
                                    const customerQuery = saleCustomerSearch.trim().toLowerCase();
                                    const productQuery = saleProductSearch.trim().toLowerCase();
                                    const customerMatch = activeTab !== 'sale' || !customerQuery || (record.customerName || '').toLowerCase().includes(customerQuery);
                                    const productMatch = activeTab !== 'sale' || !productQuery || (record.items || []).some(item => (item.name || '').toLowerCase().includes(productQuery));

                                    if (browseSearch.trim()) {
                                        // Text search: ignore date filter, match ID or customer/supplier name
                                        const q = browseSearch.trim().toLowerCase();
                                        return customerMatch && productMatch && (
                                            (activeTab === 'purchase' && (record.id || '').toLowerCase().includes(q)) ||
                                            (record.customerName || record.supplierName || '').toLowerCase().includes(q) ||
                                            (record.items || []).some(item => (item.name || '').toLowerCase().includes(q))
                                        );
                                    }
                                    // Fall back to date filter
                                    return customerMatch && productMatch && (!filterDate || record.date === filterDate);
                                })
                                .sort((a, b) => new Date(b.date) - new Date(a.date))
                                .slice(0, (browseSearch.trim() || filterDate) ? 50 : 8)
                                .map(record => {
                                    // Check if all items of this record are fully returned
                                    const history = activeTab === 'sale' ? saleReturns : purchaseReturns;
                                    const isFullyReturned = (record.items || []).every(item => {
                                        const alreadyReturned = history
                                            .filter(r => (r.invoiceId || r.purchaseId) === record.id)
                                            .reduce((t, r) => {
                                                const f = (r.items || []).find(i => i.id === item.id);
                                                return t + (f ? Number(f.quantity) : 0);
                                            }, 0);
                                        return alreadyReturned >= Number(item.quantity);
                                    });
                                    return (
                                        <button
                                            key={record.id}
                                            onClick={() => { setSourceRecord(record); setReturnItems({}); }}
                                            className={`w-full p-4 border rounded-xl text-left flex items-center justify-between group transition-all ${
                                                isFullyReturned
                                                    ? 'bg-black/5 border-border opacity-60 cursor-default'
                                                    : 'bg-background border-border hover:border-primary hover:bg-primary/5'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                                                    isFullyReturned ? 'bg-gray-200 text-gray-400' : 'bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white'
                                                }`}>
                                                    <FileText size={16} />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-bold text-sm flex items-center gap-2" style={{ color: 'var(--text-main)' }}>
                                                        {record.id}
                                                        {isFullyReturned && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 uppercase tracking-widest">Returned</span>}
                                                    </p>
                                                    <p className="text-xs text-gray-500 truncate">{record.customerName || record.supplierName} · {record.date}</p>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0 ml-2">
                                                <p className="text-sm font-black text-primary">Rs.{Number(record.totalAmount).toLocaleString()}</p>
                                                <p className="text-[10px] font-bold text-gray-400 group-hover:text-primary uppercase">{isFullyReturned ? 'No Items Left' : 'Select →'}</p>
                                            </div>
                                        </button>
                                    );
                                })
                            }
                        </div>
                    </div>
                </div>
                )}
                </>
                )
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-5 duration-300">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="card p-6" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                            <div className="flex justify-between items-start mb-6">
                                <button onClick={() => setSourceRecord(null)} className="flex items-center gap-2 text-sm font-bold text-primary hover:underline">
                                    <ArrowLeft size={16} /> Back to Search
                                </button>
                                <div className="text-right">
                                    <div className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Original Date</div>
                                    <div className="font-bold">{sourceRecord.isAggregatedReturn ? 'Purchase history' : sourceRecord.date}</div>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 mb-8">
                                <div className="p-3 bg-primary/10 rounded-xl">
                                    <User className="text-primary" size={24} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{activeTab === 'sale' ? 'Customer' : 'Supplier'}</div>
                                    <div className="text-lg font-bold truncate">{sourceRecord.customerName || sourceRecord.supplierName}</div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Original Total</div>
                                    <div className="text-lg font-bold">Rs.{Number(sourceRecord.totalAmount).toLocaleString()}</div>
                                </div>
                            </div>

                            <h4 className="font-bold flex items-center gap-2 mb-4">
                                <FileText size={18} className="text-primary" /> Select Items to Return
                            </h4>
                            <div className="space-y-3">
                                {sourceRecord.items.map((item, idx) => {
                                    const maxQty = maxReturnableQty(item);
                                    const alreadyRet = Number(item.quantity) - maxQty;
                                    const fullyReturned = maxQty === 0;
                                    return (
                                        <div key={item.id || idx} className={`p-4 rounded-xl border transition-all flex items-center gap-4 ${
                                            fullyReturned
                                                ? 'border-amber-400/30 bg-amber-500/5 opacity-60'
                                                : returnItems[item.id] > 0
                                                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                                    : 'border-border bg-black/5 hover:bg-black/10'
                                        }`}>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-sm truncate flex items-center gap-2">
                                                    {item.name}
                                                    {fullyReturned && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 uppercase">Returned</span>}
                                                </p>
                                                <p className="text-[10px] text-gray-500 uppercase font-black">
                                                    Rs.{Number(item.price || item.purchasePrice).toLocaleString()} × {item.quantity} {item.unit || 'unit'}
                                                    {alreadyRet > 0 && <span className="text-amber-500 ml-1">· {alreadyRet} already returned</span>}
                                                </p>
                                            </div>
                                            {fullyReturned ? (
                                                <div className="text-[10px] font-black text-amber-500 shrink-0">All Returned</div>
                                            ) : (
                                                <div className="flex items-center gap-3 bg-white p-2 rounded-xl shadow-sm border border-border shrink-0">
                                                    <button onClick={() => toggleItemQuantity(item.id, maxQty, -1)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 font-bold">−</button>
                                                    <div className="w-10 text-center font-black text-lg text-primary">{returnItems[item.id] || 0}</div>
                                                    <button onClick={() => toggleItemQuantity(item.id, maxQty, 1)} className={`w-8 h-8 flex items-center justify-center rounded-lg font-bold ${(returnItems[item.id] || 0) >= maxQty ? 'text-gray-300 pointer-events-none' : 'hover:bg-gray-100'}`}>+</button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="card p-6" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                            <h4 className="font-bold flex items-center gap-2 mb-6">
                                <CheckCircle2 size={18} className="text-emerald-500" /> Return Summary
                            </h4>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between"><span className="text-gray-500">Items</span><span className="font-bold">{Object.keys(returnItems).length}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">Total Qty</span><span className="font-bold">{Object.values(returnItems).reduce((a, b) => a + b, 0)}</span></div>
                            </div>
                            <div className="border-t border-dashed my-4" style={{ borderColor: 'var(--border)' }} />
                            <div className="p-4 bg-emerald-500/10 rounded-2xl text-emerald-600">
                                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-500/70 mb-1">{activeTab === 'sale' ? 'Refund Amount' : 'Deduction Amount'}</div>
                                <div className="text-4xl font-black">Rs.{calculateRefund().toLocaleString()}</div>
                            </div>
                            <div className="mt-4 p-3 bg-amber-50 rounded-xl flex gap-3 text-amber-700">
                                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                                <p className="text-[11px] leading-relaxed">Stock will be adjusted automatically on confirmation.</p>
                            </div>
                            <button
                                onClick={handleSubmit}
                                disabled={isProcessing || Object.keys(returnItems).length === 0}
                                className="mt-4 w-full bg-primary text-white py-4 rounded-2xl font-black shadow-xl shadow-primary/30 hover:opacity-90 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95"
                            >
                                {isProcessing ? 'Processing...' : 'Record Return'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Return History ──────────────────────────────────────────────── */}
            <div className="card overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <button
                    onClick={() => setShowHistory(h => !h)}
                    className="w-full flex items-center justify-between p-4 font-bold text-sm"
                    style={{ color: 'var(--text-main)' }}
                >
                    <span className="flex items-center gap-2">
                        <History size={18} className="text-primary" />
                        {activeTab === 'sale' ? 'Sale' : 'Purchase'} Return History
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-black">{activeReturns.length}</span>
                    </span>
                    {showHistory ? <ChevronUp size={18} className="text-muted" /> : <ChevronDown size={18} className="text-muted" />}
                </button>

                {showHistory && (
                    <div className="border-t" style={{ borderColor: 'var(--border)' }}>
                        {activeReturns.length === 0 ? (
                            <div className="p-10 text-center text-muted italic text-sm">No return history yet.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead>
                                        <tr className="text-[10px] font-black uppercase tracking-widest text-muted border-b" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
                                            <th className="px-4 py-3">Date</th>
                                            <th className="px-4 py-3">Return Invoice</th>
                                            {activeTab === 'sale' && <th className="px-4 py-3">Original Sale Invoice(s)</th>}
                                            {activeTab === 'purchase' && <th className="px-4 py-3">Original Purchase ID(s)</th>}
                                            <th className="px-4 py-3">{activeTab === 'sale' ? 'Customer' : 'Supplier'}</th>
                                            <th className="px-4 py-3">Items</th>
                                            <th className="px-4 py-3 text-right text-emerald-600">Refund</th>
                                            <th className="px-4 py-3 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                                        {activeReturns.map(ret => (
                                            <tr key={ret.id} className="hover:bg-black/5 transition-colors group">
                                                <td className="px-4 py-3 text-xs text-muted">{ret.date}</td>
                                                <td className="px-4 py-3 font-mono font-bold text-primary text-xs">{ret.returnInvoiceId || ret.returnInvoiceNo || ret.id || '—'}</td>
                                                {activeTab === 'sale' && (
                                                    <td className="px-4 py-3 font-mono text-xs text-muted">
                                                        {(ret.originalInvoiceIds || ret.invoiceIds || (ret.invoiceId ? [ret.invoiceId] : [])).join(', ') || '—'}
                                                    </td>
                                                )}
                                                {activeTab === 'purchase' && (
                                                    <td className="px-4 py-3 font-mono text-xs text-muted">
                                                        {(ret.originalPurchaseIds || ret.purchaseIds || (ret.purchaseId ? [ret.purchaseId] : [])).join(', ') || '—'}
                                                    </td>
                                                )}
                                                <td className="px-4 py-3 font-semibold">{ret.customerName || ret.supplierName}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex flex-wrap gap-1">
                                                        {(ret.items || []).map((item, i) => (
                                                            <span key={i} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold">
                                                                {item.name} ×{item.quantity}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right font-black text-emerald-600">Rs.{Number(ret.totalRefund).toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <button
                                                        onClick={() => activeTab === 'sale' ? generateSaleReturnPDF(ret) : generatePurchaseReturnPDF(ret)}
                                                        title="Download Return PDF"
                                                        className="text-primary hover:text-primary-dark p-1 rounded-lg hover:bg-primary/10 mr-1"
                                                    >
                                                        <Download size={15} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteReturn(ret)}
                                                        title="Delete & Rollback Stock"
                                                        className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Returns;
