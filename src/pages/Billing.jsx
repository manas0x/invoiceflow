import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Plus, Trash2, Search, User, Receipt, Download, Smartphone, Copy, MapPin, X, History as HistoryIcon, Pencil, Calendar, ArrowUp, ArrowDown, Printer, Share2, MessageCircle, ChefHat, Award } from 'lucide-react'
import { generateInvoicePDF, generateThermalInvoicePDF } from '../utils/pdfGenerator'
import { firestoreService } from '../services/firestoreService'
import { getDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'
import { showError, showSuccess, showConfirm } from '../utils/alert'
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts'
import { pluginLoader } from '../pluginLoader'

import { useBusiness } from '../context/BusinessContext';

const Billing = ({ initialHistory = false, isStaff = false, setActiveTab }) => {
    const business = useBusiness();
    const [products, setProducts] = useState([])
    const [customers, setCustomers] = useState([])
    const [loading, setLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [invoices, setInvoices] = useState([])
    const [isHistoryView, setIsHistoryView] = useState(initialHistory)
    const [historySearch, setHistorySearch] = useState('')

    const SOFTWARE_START_DATE = '2025-12-31'

    // Financial Year Logic
    const getCurrentFY = () => {
        const today = new Date();
        const month = today.getMonth(); // 0-11
        const year = today.getFullYear();
        return month >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
    }
    const [selectedFY, setSelectedFY] = useState(getCurrentFY())

    // Date Range for History (Default: Today to Today)
    const [dateRange, setDateRange] = useState(() => {
        const now = new Date()
        const today = now.toISOString().split('T')[0]
        return { start: today, end: today }
    })

    useEffect(() => {
        setIsHistoryView(initialHistory)
    }, [initialHistory])

    // Handle Duplicate Invoice Loading
    useEffect(() => {
        const checkPendingDuplicate = () => {
            const pendingData = localStorage.getItem('billing_pending_duplicate');
            if (pendingData) {
                try {
                    const parsed = JSON.parse(pendingData);
                    localStorage.removeItem('billing_pending_duplicate');

                    setInvoice(prev => ({
                        ...prev,
                        date: new Date().toISOString().split('T')[0],
                        customerName: parsed.customerName || '',
                        customerPhone: parsed.customerPhone || '',
                        customerAddress: parsed.customerAddress || '',
                        items: (parsed.items || []).map(i => ({
                            ...i,
                            internalId: Date.now() + Math.random() // Regenerate IDs to prevent conflicts
                        })),
                        discount: 0,
                        paymentMode: 'Cash'
                    }));

                    showSuccess("Invoice duplicated successfully!");
                } catch (e) {
                    console.error("Error loading duplicate invoice", e);
                }
            }
        };

        // Check on mount (for cross-tab duplication)
        checkPendingDuplicate();

        // Check when switching back to New Bill view (for same-tab duplication)
        if (!isHistoryView) {
            checkPendingDuplicate();
        }
    }, [isHistoryView]);

    const handleDuplicateInvoice = (inv) => {
        const data = {
            customerName: inv.customerName,
            customerPhone: inv.customerPhone,
            customerAddress: inv.customerAddress,
            items: inv.items
        };
        localStorage.setItem('billing_pending_duplicate', JSON.stringify(data));

        setActiveTab('billing');
        setIsHistoryView(false);
    }
    const [invoice, setInvoice] = useState({
        date: new Date().toISOString().split('T')[0],
        customerName: '',
        customerPhone: '',
        customerAddress: '',
        items: [],
        discount: 0,
        paymentMode: 'Cash',
        couponCode: '',
        appliedCoupon: null,
        tableId: ''
    })
    const [couponError, setCouponError] = useState(null)
    const [editingInvoice, setEditingInvoice] = useState(null)

    const [searchTerm, setSearchTerm] = useState('')
    const [searchResults, setSearchResults] = useState([])
    const [customerSearch, setCustomerSearch] = useState('')
    const [customerResults, setCustomerResults] = useState([])

    useEffect(() => {
        const unsubProducts = firestoreService.subscribeProducts(setProducts)
        const unsubCustomers = firestoreService.subscribeCustomers(setCustomers)
        // Subscription for Invoices (Unrestricted to support full history filtering)
        const unsubInvoices = firestoreService.subscribeInvoices(setInvoices)
        setLoading(false)
        return () => {
            unsubProducts()
            unsubCustomers()
            unsubInvoices()
        }
    }, [])

    useKeyboardShortcuts([
        {
            key: 'F2',
            action: () => saveInvoice(),
            preventDefault: true
        },
        {
            key: 'F4',
            action: () => document.getElementById('billing-search')?.focus(),
            preventDefault: true
        },
        {
            key: 'b',
            alt: true,
            action: () => {
                if (editingInvoice) cancelEdit();
                setIsHistoryView(false);
                setTimeout(() => document.getElementById('customer-search')?.focus(), 100);
            },
            preventDefault: true
        },
        {
            key: 'c',
            alt: true,
            action: () => document.getElementById('customer-search')?.focus(),
            preventDefault: true
        },
        {
            key: 'Escape',
            action: () => {
                if (editingInvoice) cancelEdit();
                else setIsHistoryView(true);
            },
            preventDefault: true
        }
    ], [invoice, editingInvoice, isHistoryView]);

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
            // Check for exact Barcode match first (for scanning)
            const barcodeMatch = products.find(p => p.barcode === val.trim())
            if (barcodeMatch) {
                addItem(barcodeMatch)
                setSearchTerm('')
                setSearchResults([])
                return
            }

            const filtered = products.filter(p =>
                (p.name || '').toLowerCase().includes(val.toLowerCase()) ||
                (p.category || '').toLowerCase().includes(val.toLowerCase()) ||
                (p.barcode || '').includes(val) ||
                (p.batchNumber || '').toLowerCase().includes(val.toLowerCase())
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
        // Allow adding same product multiple times if one is 'Loose' and we are adding a 'Bag'.
        // We only combine/increment if there is an existing 'Bag' item.
        const existingBagItem = invoice.items.find(item => item.id === product.id && item.salesType !== 'Loose');

        // Note: New items get an internalId to distinguish multiple rows of same product (e.g. 1 Bag vs 1 Loose).
        // Legacy items might not have internalId, so we fallback to id.

        if (existingBagItem) {
            // Check stock limit for the existing bag item
            if (existingBagItem.quantity >= product.stock) {
                showError("Cannot exceed available stock!")
                return
            }

            setInvoice({
                ...invoice,
                items: invoice.items.map(item =>
                    ((item.internalId && item.internalId === existingBagItem.internalId) || (!item.internalId && item.id === existingBagItem.id))
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                )
            })
        } else {
            // New Item (or existing was Loose, so we add a fresh Bag line)

            // 1. Stock Checks
            if (product.stock <= 0) {
                showError(`Product "${product.name}" is Out of Stock!`);
                return;
            }
            if (!product.isLoose && product.stock < 1) {
                showError(`Insufficient stock for "${product.name}"!`);
                return;
            }

            const newItem = {
                id: product.id,
                internalId: Date.now() + Math.random(), // Unique Row ID
                name: product.name,
                price: isStaff ? 0 : (product.purchasePrice || 0),
                originalPrice: product.purchasePrice || 0,
                costPrice: product.purchasePrice || 0,
                quantity: 1,
                gst: product.gst,
                unit: product.unit,
                isLooseEnabled: product.isLoose === true,
                salesType: 'Bag',
                bagWeight: product.bagWeight && product.bagWeight > 0 ? parseFloat(product.bagWeight) : 50
            };
            setInvoice({ ...invoice, items: [...invoice.items, newItem] });
        }
        setSearchTerm('');
        setSearchResults([]);
    }

    const removeItem = (rowId) => {
        // rowId could be internalId OR product.id
        setInvoice({
            ...invoice,
            items: invoice.items.filter(item => (item.internalId || item.id) !== rowId)
        })
    }

    const toggleSalesType = (rowId) => {
        setInvoice(prev => ({
            ...prev,
            items: prev.items.map(item => {
                const isMatch = (item.internalId && item.internalId === rowId) || (!item.internalId && item.id === rowId);

                if (isMatch) {
                    const newType = item.salesType === 'Bag' ? 'Loose' : 'Bag';
                    const weight = item.bagWeight || 50;

                    if (newType === 'Loose') {
                        // Switch to Loose
                        const pricePerKg = item.originalPrice / weight;
                        return {
                            ...item,
                            salesType: 'Loose',
                            unit: 'Kg',
                            price: parseFloat(pricePerKg.toFixed(2)),
                            quantity: 1,
                            name: item.name.includes('(Loose)') ? item.name : `${item.name} (Loose)`
                        };
                    } else {
                        // Switch back to Bag
                        const cleanName = item.name.replace(' (Loose)', '').replace(/\s*\(\d+(\.\d+)?\s*kg\s*@\s*{business.currency}\d+(\.\d+)?\/kg\)/g, '');
                        return {
                            ...item,
                            salesType: 'Bag',
                            unit: 'Bag',
                            price: item.originalPrice,
                            quantity: 1,
                            name: cleanName
                        };
                    }
                }
                return item;
            })
        }))
    }

    const updateQuantity = (rowId, q) => {
        const quantity = q === '' ? '' : parseFloat(q);
        const item = invoice.items.find(i => (i.internalId || i.id) === rowId);

        if (typeof quantity === 'number' && item) {
            const product = products.find(p => p.id === item.id)
            if (product) {
                if (item.salesType === 'Loose') {
                    const bagWeight = item.bagWeight && item.bagWeight > 0 ? item.bagWeight : 50;
                    const equivalentBags = quantity / bagWeight;
                    if (equivalentBags > product.stock) {
                        showError(`Stock low! Max ${product.stock} Bag (~ ${(product.stock * bagWeight).toFixed(2)} Kg)`);
                        return;
                    }
                } else {
                    if (quantity > product.stock) {
                        showError("Only " + product.stock + " units available!")
                        return
                    }
                }
            }
        }

        setInvoice({
            ...invoice,
            items: invoice.items.map(item => ((item.internalId || item.id) === rowId) ? { ...item, quantity } : item)
        })
    }

    const updatePrice = (rowId, p) => {
        const price = p === '' ? '' : parseFloat(p);
        setInvoice({
            ...invoice,
            items: invoice.items.map(item => ((item.internalId || item.id) === rowId) ? { ...item, price } : item)
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

    const pluginDiscount = (() => {
        if (!pluginLoader.isEnabled('discount')) return 0;
        const discountPlugin = pluginLoader.getPlugin('discount');
        let totalDisc = 0;

        // 1. Seasonal / Auto Rules
        if (discountPlugin?.settings?.enableRuleEngine && discountPlugin?.settings?.seasonalRules) {
            const currentMonth = new Date().getMonth();
            const rule = discountPlugin.settings.seasonalRules.find(r => r.month === currentMonth);
            if (rule) {
                totalDisc += (totals.total * rule.discount) / 100;
            }
        }

        // 2. Coupon Discount
        if (invoice.appliedCoupon && discountPlugin?.hooks?.calculateDiscount) {
            totalDisc += discountPlugin.hooks.calculateDiscount(invoice.appliedCoupon, totals.total, invoice.items);
        }

        return totalDisc;
    })();

    const finalTotal = totals.total - invoice.discount - pluginDiscount;

    const handleApplyCoupon = () => {
        if (!pluginLoader.isEnabled('discount')) return;
        const discountPlugin = pluginLoader.getPlugin('discount');
        if (discountPlugin?.hooks?.validateCoupon) {
            const result = discountPlugin.hooks.validateCoupon(invoice.couponCode, totals.total, discountPlugin.settings);
            if (result.valid) {
                setInvoice({ ...invoice, appliedCoupon: result.coupon });
                setCouponError(null);
                showSuccess("Coupon Applied!");
            } else {
                setCouponError(result.message);
                setInvoice({ ...invoice, appliedCoupon: null });
            }
        }
    };

    const sendToKitchen = async () => {
        if (!invoice.items.length) {
            showError("Add some items first");
            return;
        }
        if (business.businessMode === 'restaurant' && !invoice.tableId) {
            showError("Please select a Table Number");
            return;
        }

        setIsSaving(true);
        try {
            const orderData = {
                items: invoice.items.map(item => ({
                    id: item.id,
                    name: item.name,
                    qty: item.quantity,
                    price: item.price,
                    total: item.price * item.quantity
                })),
                totalAmount: finalTotal,
                status: 'pending',
                type: 'table_order',
                tableId: invoice.tableId,
                customerName: invoice.customerName || 'Guest',
                customerPhone: invoice.customerPhone || '',
                source: 'pos_counter',
                date: new Date().toISOString()
            };

            await addDoc(collection(db, 'shop_orders'), orderData);
            showSuccess("Order sent to Kitchen!");
            
            // Optional: reset form or keep for settlement later? 
            // Usually we reset for next customer
            cancelEdit();
        } catch (err) {
            showError("Failed to send: " + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const saveInvoice = async () => {
        if (!invoice.customerName || invoice.items.length === 0) {
            showError("Incomplete invoice details")
            return
        }

        if (isSaving) return;
        setIsSaving(true);

        try {
            // Final Stock Validation before Saving
            // Final Stock Validation before Saving
            const productUsage = {};

            // Calculate total requirement for each product in the NEW invoice
            invoice.items.forEach(item => {
                let required = item.quantity;
                if (item.salesType === 'Loose') {
                    const bagWeight = item.bagWeight || 50;
                    required = item.quantity / bagWeight;
                }
                productUsage[item.id] = (productUsage[item.id] || 0) + required;
            });

            // Calculate total restored quantity from the OLD invoice (if editing)
            const productRestored = {};
            if (editingInvoice) {
                editingInvoice.items.forEach(item => {
                    let restored = item.quantity;
                    // Note: stored items might be 'Loose' or converted 'Bag' in history.
                    // But our `item.salesType` in history items tells us.
                    // However, `editingInvoice.items` passed to `handleEdit` were mapped UI items.
                    // But `editingInvoice` state holds the original object from DB usually?
                    // Wait, `handleEdit` (line 382) takes `inv` and sets it to `editingInvoice`.
                    // The `inv` comes from `sortedInvoices`.

                    // In history, items are stored with `salesType`, `bagWeight` etc? 
                    // Let's look at `saveInvoice`: we stored `invoiceData` (line 314).
                    // We kept `salesType` in line 328 (or 310).
                    // Actually, at line 300, we created `stockReductionItems` but that's for stock reduction process (not shown here, likely in `addInvoice` transaction).
                    // But the `invoiceData` we save to DB (line 314) preserves the `items` array with `salesType`. ok.

                    // However, we need to be careful with unit conversions.
                    // If stored item was 'Loose' (Quantity in Kg).
                    if (item.salesType === 'Loose') {
                        const bagWeight = item.bagWeight || 50;
                        restored = item.quantity / bagWeight;
                    }
                    // If stored item was 'Bag' (Quantity in Bags).
                    // So `restored` is in Bags.
                    productRestored[item.id] = (productRestored[item.id] || 0) + restored;
                });
            }

            // Validation Check
            for (const [productId, requiredAmount] of Object.entries(productUsage)) {
                const product = products.find(p => p.id === productId);
                if (product) {
                    const currentStock = parseFloat(product.stock || 0);
                    const restoredAmount = productRestored[productId] || 0;
                    const availableEffective = currentStock + restoredAmount;

                    // Allow a tiny epsilon for float comparison errors
                    if (availableEffective < (requiredAmount - 0.001)) {
                        showError(`Cannot save! "${product.name}" exceeds stock. Available: ${availableEffective.toFixed(3)} Bags, Required: ${requiredAmount.toFixed(3)} Bags`);
                        setIsSaving(false);
                        return;
                    }
                }
            }

            // 1. Prepare items for STOCK REDUCTION (Convert Loose to Bags)
            const stockReductionItems = invoice.items.map(item => {
                if (item.salesType === 'Loose') {
                    const weight = item.bagWeight || 50;
                    const equivalentBags = parseFloat((item.quantity / weight).toFixed(3));
                    return {
                        ...item,
                        quantity: equivalentBags,
                        unit: 'Bag'
                    };
                }
                return item;
            });

            // 2. Prepare Invoice Data for RECORDING (Keep Original Units like Kg)
            // This ensures the PDF and History show exactly what the user entered (e.g. 5 Kg @ 20/kg)
            const invoiceData = {
                ...invoice,
                items: invoice.items.map(item => {
                    if (item.salesType === 'Loose') {
                        // Clean existing suffixes to prevent duplication like "... (2kg @ 10)(2kg @ 10)"
                        const baseName = item.name
                            .replace(/\s*\(\s*\d+(\.\d+)?\s*kg\s*@\s*.*?\)/gi, '') // Robustly remove old detail suffix
                            .replace(/\s*\(Loose\)/gi, '') // Remove old loose tag (case insensitive)
                            .trim();

                        return {
                            ...item,
                            name: `${baseName} (Loose) (${item.quantity} kg @ {business.currency} ${item.price}/kg)`
                        };
                    }
                    return item;
                }), // Save original items!
                totalAmount: finalTotal,
                timestamp: editingInvoice ? editingInvoice.timestamp : new Date().getTime(), // Keep original timestamp if editing
                // Use selected date but preserve current time for accurate sorting/logging
                date: (() => {
                    if (!invoice.date) return new Date().toISOString();
                    const now = new Date();
                    const [y, m, d] = invoice.date.split('-').map(Number);
                    // Create date in local time with current hours/min/sec
                    const dateWithTime = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
                    return dateWithTime.toISOString();
                })()
            };

            let savedId;
            if (editingInvoice) {
                // Update Existing Invoice
                await firestoreService.updateInvoice(editingInvoice.docId, invoiceData)
                savedId = editingInvoice.id
                // Ensure ID is passed to PDF
                invoiceData.id = savedId;
                showSuccess(`Invoice Updated!`)
            } else {
                // Create New Invoice
                savedId = await firestoreService.addInvoice(invoiceData)
                // Add ID to data for PDF
                invoiceData.id = savedId;
                showSuccess(`{business.getTerm('orders').slice(0, -1)} Saved!`);

                // Send HTML Email Notification via Brevo
                firestoreService.sendNewBillEmail(invoiceData).catch(err => {
                    console.error("Failed to trigger email notification:", err);
                });

                // Notify Admin if Staff created the invoice
                if (isStaff) {
                    firestoreService.addNotification({
                        title: "New Invoice Generated",
                        message: `Staff generated invoice #${savedId} for ${invoiceData.customerName} ({business.currency} ${invoiceData.totalAmount.toFixed(2)})`,
                        type: "invoice",
                        details: {
                            invoiceId: savedId,
                            amount: invoiceData.totalAmount,
                            customer: invoiceData.customerName
                        }
                    }).catch(console.error);

                    // --- SEND PUSH NOTIFICATION (Offline Support) ---
                    // REMOVED: User requested to remove Google Cloud Messaging (FCM). 
                    // Reliance is now 100% on Firestore Realtime Listeners (In-App Notifications).
                }
            }

            // 3. Stock Reduction is handled safely inside addInvoice/updateInvoice Transaction
            // This ensures we don't have partial failures where Invoice is saved but Stock not updated.

            // 4. Generate PDF (Preview)
            // 4. Generate PDF (Preview) - Disabled by user request
            // generateInvoicePDF(invoiceData)

            // 5. Reset Form
            if (editingInvoice) {
                setEditingInvoice(null)
                setIsHistoryView(true) // Go back to history
            } else {
                setInvoice({
                    date: new Date().toISOString().split('T')[0],
                    customerName: '',
                    customerPhone: '',
                    customerAddress: '',
                    items: [],
                    discount: 0,
                    paymentMode: 'Cash'
                })
            }
        } catch (err) {
            console.error(err)
            showError("Error: " + err.message)
        } finally {
            setIsSaving(false);
        }
    }

    const shareToWhatsApp = (inv) => {
        if (!inv.customerPhone) {
            showError("Customer phone number is required to share via WhatsApp!");
            return;
        }

        const itemsText = inv.items.map(item =>
            `• ${item.name}: ${item.quantity} ${item.unit} @ {business.currency} ${item.price} = {business.currency} ${(item.quantity * item.price).toFixed(2)}`
        ).join('\n');

        const message = `*${business.appName.toUpperCase()}*\n` +
            `--------------------------\n` +
            `*Bill No:* ${inv.id || 'N/A'}\n` +
            `*Date:* ${new Date(inv.date).toLocaleDateString('en-GB')}\n` +
            `*Customer:* ${inv.customerName}\n` +
            `--------------------------\n` +
            `*Items:*\n${itemsText}\n` +
            `--------------------------\n` +
            `*Total Amount:* {business.currency} ${inv.totalAmount.toFixed(2)}\n` +
            `--------------------------\n` +
            `Thank you for your business! 🙏`;

        const encodedMessage = encodeURIComponent(message);
        const phone = inv.customerPhone.replace(/[^0-9]/g, '');
        // Prefix with 91 if it's a 10-digit number
        const formattedPhone = phone.length === 10 ? `91${phone}` : phone;

        window.open(`https://wa.me/${formattedPhone}?text=${encodedMessage}`, '_blank');
    };

    const handleEdit = (inv) => {
        setEditingInvoice(inv)
        setInvoice({
            // Ensure date is formatted YYYY-MM-DD for the input
            date: inv.date ? new Date(inv.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            customerName: inv.customerName || '',
            customerPhone: inv.customerPhone || '',
            customerAddress: inv.customerAddress || '',
            items: (inv.items || []).map(item => {
                // Recover Loose state if lost but name indicates it
                let outputItem = { ...item };

                // Ensure internalId exists for UI handling
                if (!outputItem.internalId) {
                    outputItem.internalId = Date.now() + Math.random();
                }

                // If name says (Loose), force salesType to Loose if missing
                if ((outputItem.name || '').toLowerCase().includes('(loose)')) {
                    outputItem.salesType = 'Loose';
                }

                // If it is loose, ensure we have the correct product reference properties for UI toggles
                // We try to find the product in the loaded 'products' list to get 'isLooseEnabled'
                const product = products.find(p => p.id === outputItem.id);
                if (product) {
                    outputItem.isLooseEnabled = product.isLoose ?? false;
                    outputItem.bagWeight = product.bagWeight ?? 50;
                    outputItem.gst = product.gst ?? 0;
                }

                return outputItem;
            }),
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

    // Sorting State
    const [sortDirection, setSortDirection] = useState('desc')
    const [sortColumn, setSortColumn] = useState('date')

    const toggleSort = (column) => {
        if (sortColumn === column) {
            setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc')
        } else {
            setSortColumn(column)
            setSortDirection('desc')
        }
    }

    const filteredInvoices = invoices.filter(inv => {
        const standardizeDate = (dateStr, fallback) => {
            if (!dateStr && !fallback) return '';
            const raw = dateStr || fallback;
            if (raw.includes('T')) return raw.split('T')[0];
            if (raw.includes('-') && raw.split('-')[0].length === 2) {
                const [d, m, y] = raw.split('-');
                return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }
            return raw;
        };

        const searchLower = historySearch.toLowerCase().trim();
        const searchMatch = !searchLower ||
            (inv.customerName || '').toLowerCase().includes(searchLower) ||
            (inv.customerPhone || '').includes(historySearch) ||
            (inv.id || '').toLowerCase().includes(searchLower);

        // When actively searching by text, skip date filter — find from ALL dates
        if (searchLower) return searchMatch;

        // Otherwise apply date range filter as normal
        const invDate = standardizeDate(inv.date, inv.createdAt);
        const dateMatch = invDate >= dateRange.start && invDate <= dateRange.end;
        return dateMatch && searchMatch;
    })

    const sortedInvoices = [...filteredInvoices].sort((a, b) => {
        let valA, valB;
        if (sortColumn === 'date') {
            // Primary sort by the date (day)
            const dateA_ms = new Date(a.date || 0).getTime();
            const dateB_ms = new Date(b.date || 0).getTime();

            if (dateA_ms !== dateB_ms) {
                // If dates are different, use them for comparison
                valA = dateA_ms;
                valB = dateB_ms;
            } else {
                // If dates are the same (same day), use timestamp for tie-breaking
                // Prioritize timestamp if available, otherwise default to 0
                valA = a.timestamp || 0;
                valB = b.timestamp || 0;
            }
        } else {
            // Sort by ID string (INV-0001)
            valA = a.id || ''
            valB = b.id || ''
        }

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1
        return 0
    })

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
                    className={`flex-1 md:flex-none px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all border ${!isHistoryView ? '' : 'hover:border-primary/30'}`}
                    style={{
                        background: !isHistoryView ? 'var(--primary)' : 'var(--surface)',
                        color: !isHistoryView ? 'white' : 'var(--text-muted)',
                        borderColor: !isHistoryView ? 'var(--primary)' : 'var(--border)',
                        boxShadow: !isHistoryView ? '0 10px 15px -3px rgba(var(--primary-rgb), 0.2)' : 'none'
                    }}
                >
                    <Plus size={18} /> New {business.getTerm('orders').slice(0, -1)}
                </button>
                <button
                    onClick={() => {
                        setIsHistoryView(true)
                        if (editingInvoice) cancelEdit()
                    }}
                    className={`flex-1 md:flex-none px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all border ${isHistoryView ? '' : 'hover:border-primary/30'}`}
                    style={{
                        background: isHistoryView ? 'var(--primary)' : 'var(--surface)',
                        color: isHistoryView ? 'white' : 'var(--text-muted)',
                        borderColor: isHistoryView ? 'var(--primary)' : 'var(--border)',
                        boxShadow: isHistoryView ? '0 10px 15px -3px rgba(var(--primary-rgb), 0.2)' : 'none'
                    }}
                >
                    <HistoryIcon size={18} /> History
                </button>
                {editingInvoice && (
                    <button onClick={cancelEdit} className="px-4 py-3 rounded-xl font-bold hover:opacity-80 transition-colors" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
                        Cancel Edit
                    </button>
                )}
            </div>

            {!isHistoryView ? (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 p-1 md:p-0">
                    <div className="lg:col-span-3 space-y-6">
                        {/* Customer Details Section */}
                        <div className="card p-5 shadow-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-main)' }}>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-main)' }}>
                                    <User size={20} style={{ color: 'var(--primary)' }} /> Customer Details
                                </h3>
                                <div className="flex items-center gap-2">
                                    {business.businessMode === 'restaurant' && (
                                        <div className="border rounded-lg flex items-center px-3 py-1 gap-2 transition-all" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
                                            <span className="text-[10px] font-bold text-muted uppercase">Table #</span>
                                            <input
                                                type="text"
                                                placeholder="e.g. 5"
                                                className="bg-transparent border-none p-0 text-sm font-black focus:ring-0 w-12 outline-none text-center"
                                                style={{ color: 'var(--primary)' }}
                                                value={invoice.tableId}
                                                onChange={e => setInvoice({ ...invoice, tableId: e.target.value })}
                                            />
                                        </div>
                                    )}
                                    <div className="border rounded-lg flex items-center px-3 py-1 gap-2 transition-all" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
                                        <Calendar size={16} style={{ color: 'var(--text-muted)' }} />
                                        <input
                                            type="date"
                                            className="bg-transparent border-none p-0 text-sm font-bold focus:ring-0 w-32 outline-none"
                                            style={{ color: 'var(--text-main)' }}
                                            value={invoice.date}
                                            onChange={e => setInvoice({ ...invoice, date: e.target.value })}
                                            min={SOFTWARE_START_DATE}
                                            max={new Date().toISOString().split('T')[0]}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="relative">
                                <label className="text-[10px] font-extrabold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>Customer Name / Phone</label>
                                <div className="relative group">
                                    <input
                                        autoFocus
                                        id="customer-search"
                                        className="w-full pl-10 pr-4 py-3 border rounded-xl transition-all font-medium placeholder:text-gray-400 focus:ring-2 focus:ring-opacity-20"
                                        style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                                        value={invoice.customerName}
                                        onChange={e => handleCustomerSearch(e.target.value)}
                                        onKeyDown={handleCustomerKeyDown}
                                        type="text" placeholder="Search or enter customer name..."
                                        autoComplete="off"
                                    />
                                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2" size={18} style={{ color: 'var(--text-muted)' }} />
                                </div>
                                {customerResults.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 rounded-xl shadow-2xl z-[100] border mt-2 max-h-[250px] overflow-y-auto divide-y scale-100 animate-in fade-in slide-in-from-top-2 duration-200" style={{ background: 'var(--surface)', borderColor: 'var(--border)', divideColor: 'var(--border)' }}>
                                        {customerResults.map(c => (
                                            <div
                                                key={c.id}
                                                onClick={() => selectCustomer(c)}
                                                className="p-4 cursor-pointer hover:bg-black/5 transition-colors flex items-center gap-3"
                                            >
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(var(--primary-rgb), 0.1)', color: 'var(--primary)' }}>
                                                    <User size={16} />
                                                </div>
                                                <div>
                                                    <div className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>{c.name}</div>
                                                    <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{c.phone} • {c.address}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Product Search & Table */}
                        <div className="card p-5 shadow-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                            <h3 className="text-lg font-bold mb-5" style={{ color: 'var(--text-main)' }}>{business.getTerm('products')}</h3>
                            <div className="relative mb-6">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2" size={18} style={{ color: 'var(--text-muted)' }} />
                                <input
                                    id="billing-search"
                                    className="w-full pl-10 pr-4 py-3 border focus:ring-2 focus:ring-opacity-20 rounded-xl transition-all font-medium placeholder:text-gray-400"
                                    style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                                    type="text"
                                    placeholder="Search products by name or category..."
                                    value={searchTerm}
                                    onChange={(e) => handleSearch(e.target.value)}
                                    onKeyDown={handleSearchKeyDown}
                                />
                                {searchResults.length > 0 && (
                                    <div className="absolute top-[54px] left-0 right-0 rounded-xl shadow-2xl z-[100] border max-h-[350px] overflow-y-auto divide-y" style={{ background: 'var(--surface)', borderColor: 'var(--border)', divideColor: 'var(--border)' }}>
                                        {searchResults.map(p => (
                                            <div
                                                key={p.id}
                                                onClick={() => addItem(p)}
                                                className="p-4 cursor-pointer hover:bg-black/5 transition-colors flex justify-between items-center group"
                                            >
                                                <div className="min-w-0">
                                                    <div className="font-bold group-hover:text-primary transition-colors truncate" style={{ color: 'var(--text-main)' }}>{p.name}</div>
                                                    <div className="text-xs font-medium italic" style={{ color: 'var(--text-muted)' }}>
                                                        {p.isLoose ? (
                                                            (() => {
                                                                const bags = Math.floor(p.stock);
                                                                const remainder = p.stock - bags;
                                                                const weight = p.bagWeight || 50;
                                                                const kg = remainder * weight;
                                                                return (
                                                                    <span>
                                                                        Stock: {bags} Bags
                                                                        {kg > 0.01 && <span className="ml-1">({kg.toFixed(2).replace(/\.?0+$/, '')} Kg)</span>} remaining
                                                                    </span>
                                                                );
                                                            })()
                                                        ) : (
                                                            `Stock: ${Number(p.stock).toFixed(3).replace(/\.?0+$/, '')} ${p.unit} remaining`
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    {!isStaff && <div className="font-extrabold" style={{ color: 'var(--text-main)' }}>{business.currency} {p.purchasePrice}</div>}
                                                    <div className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full inline-block mt-1" style={{ background: 'rgba(var(--primary-rgb), 0.1)', color: 'var(--primary)' }}>Select</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="overflow-x-auto -mx-5 px-5 hidden md:block">
                                <table className="w-full min-w-[550px] border-collapse">
                                    <thead>
                                        <tr className="text-left border-b" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
                                            <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{business.getTerm('billing')} Details</th>
                                            <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest w-28" style={{ color: 'var(--text-muted)' }}>Inc Price</th>
                                            <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest w-24" style={{ color: 'var(--text-muted)' }}>Qty</th>
                                            <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-right" style={{ color: 'var(--text-muted)' }}>Total</th>
                                            <th className="px-4 py-3 w-12"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y" style={{ divideColor: 'var(--border)' }}>
                                        {invoice.items.length > 0 ? invoice.items.map(item => (
                                            <tr key={item.internalId || item.id} className="transition-colors hover:bg-black/5">
                                                <td className="px-4 py-4">
                                                    <div className="font-bold leading-tight" style={{ color: 'var(--text-main)' }}>{item.name}</div>
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <div className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: 'rgba(var(--primary-rgb), 0.1)', color: 'var(--primary)' }}>GST {item.gst}%</div>
                                                        {item.isLooseEnabled && (
                                                            <div className="flex rounded-lg p-0.5" style={{ background: 'var(--border)' }} title="Switch Selling Mode">
                                                                <button
                                                                    onClick={() => item.salesType === 'Loose' && toggleSalesType(item.internalId || item.id)}
                                                                    className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all`}
                                                                    style={item.salesType !== 'Loose' ? { background: 'var(--surface)', color: 'var(--success)', boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)' } : { color: 'var(--text-muted)' }}
                                                                >
                                                                    Bag
                                                                </button>
                                                                <button
                                                                    onClick={() => item.salesType !== 'Loose' && toggleSalesType(item.internalId || item.id)}
                                                                    className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all`}
                                                                    style={item.salesType === 'Loose' ? { background: 'var(--surface)', color: 'var(--success)', boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)' } : { color: 'var(--text-muted)' }}
                                                                >
                                                                    Loose
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="relative">
                                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>{business.currency}</span>
                                                        <input
                                                            className="w-full pl-9 pr-2 py-2 border rounded-lg text-sm font-bold focus:ring-1 shadow-sm"
                                                            type="number"
                                                            value={item.price}
                                                            onChange={e => updatePrice(item.internalId || item.id, e.target.value)}
                                                            onWheel={(e) => e.target.blur()}
                                                            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                                                        />
                                                    </div>
                                                    {item.salesType === 'Loose' && (
                                                        <div className="text-[9px] text-center mt-1" style={{ color: 'var(--text-muted)' }}>
                                                            per Kg
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-4 text-center">
                                                    <input
                                                        className="w-full px-2 py-2 border rounded-lg text-sm font-bold focus:ring-1 text-center shadow-sm"
                                                        type="number"
                                                        value={item.quantity}
                                                        onChange={e => updateQuantity(item.internalId || item.id, e.target.value)}
                                                        onWheel={(e) => e.target.blur()}
                                                        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                                                    />
                                                    <div className="text-[9px] text-center mt-1" style={{ color: 'var(--text-muted)' }}>
                                                        {item.salesType === 'Loose' ? 'Kg' : (item.unit || 'Qty')}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 text-right">
                                                    <div className="font-extrabold" style={{ color: 'var(--text-main)' }}>{business.currency} {(item.price * item.quantity).toFixed(2)}</div>
                                                </td>
                                                <td className="px-4 py-4 text-right">
                                                    <button
                                                        onClick={() => removeItem(item.internalId || item.id)}
                                                        className="p-2 rounded-lg transition-all"
                                                        style={{ color: 'var(--danger)' }}
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan="5" className="px-5 py-12 text-center font-medium italic" style={{ color: 'var(--text-muted)' }}>Your bill is empty. Add some products above!</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Card View */}
                            <div className="md:hidden space-y-4">
                                {invoice.items.length > 0 ? invoice.items.map(item => (
                                    <div key={item.internalId || item.id} className="border rounded-xl p-4 shadow-sm relative" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <div className="font-bold text-lg pr-8 leading-tight" style={{ color: 'var(--text-main)' }}>{item.name}</div>
                                                <div className="flex items-center gap-2 mt-2">
                                                    <div className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: 'rgba(var(--primary-rgb), 0.1)', color: 'var(--primary)' }}>GST {item.gst}%</div>
                                                    {item.isLooseEnabled && (
                                                        <div className="flex rounded-lg p-0.5" style={{ background: 'var(--border)' }} title="Switch Selling Mode">
                                                            <button
                                                                onClick={() => item.salesType === 'Loose' && toggleSalesType(item.internalId || item.id)}
                                                                className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all`}
                                                                style={item.salesType !== 'Loose' ? { background: 'var(--surface)', color: 'var(--success)', boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)' } : { color: 'var(--text-muted)' }}
                                                            >
                                                                Bag
                                                            </button>
                                                            <button
                                                                onClick={() => item.salesType !== 'Loose' && toggleSalesType(item.internalId || item.id)}
                                                                className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all`}
                                                                style={item.salesType === 'Loose' ? { background: 'var(--surface)', color: 'var(--success)', boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)' } : { color: 'var(--text-muted)' }}
                                                            >
                                                                Loose
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => removeItem(item.internalId || item.id)}
                                                className="absolute top-3 right-3 p-2 rounded-lg"
                                                style={{ color: 'var(--danger)', background: 'rgba(239, 68, 68, 0.1)' }}
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 mb-3">
                                            <div>
                                                <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Price</label>
                                                <div className="relative">
                                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>{business.currency}</span>
                                                    <input
                                                        className="w-full pl-9 pr-2 py-2 border rounded-lg text-sm font-bold focus:ring-1"
                                                        type="number"
                                                        value={item.price}
                                                        onChange={e => updatePrice(item.internalId || item.id, e.target.value)}
                                                        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                                                    />
                                                </div>
                                                {item.salesType === 'Loose' && (
                                                    <div className="text-[9px] mt-1" style={{ color: 'var(--text-muted)' }}>per Kg</div>
                                                )}
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Qty ({item.salesType === 'Loose' ? 'Kg' : (item.unit || 'Qty')})</label>
                                                <input
                                                    className="w-full px-2 py-2 border rounded-lg text-sm font-bold focus:ring-1 text-center"
                                                    type="number"
                                                    value={item.quantity}
                                                    onChange={e => updateQuantity(item.internalId || item.id, e.target.value)}
                                                    style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                                                />
                                            </div>
                                        </div>

                                        <div className="pt-3 border-t border-dashed flex justify-between items-center" style={{ borderColor: 'var(--border)' }}>
                                            <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Subtotal</span>
                                            <span className="text-xl font-black" style={{ color: 'var(--text-main)' }}>{business.currency} {(item.price * item.quantity).toFixed(2)}</span>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="text-center py-8 italic rounded-xl border border-dashed" style={{ color: 'var(--text-muted)', background: 'var(--background)', borderColor: 'var(--border)' }}>
                                        No items added
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-1">
                        <div className="card p-6 shadow-xl border-t-4 sticky top-[86px]" style={{ borderColor: 'var(--primary)', background: 'var(--surface)', color: 'var(--text-main)' }}>
                            <h3 className="text-xl font-bold mb-6 flex items-center gap-2" style={{ color: 'var(--text-main)' }}>
                                <Receipt size={22} style={{ color: 'var(--primary)' }} /> {business.getTerm('orders').slice(0, -1)} Summary
                            </h3>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="font-medium tracking-tight" style={{ color: 'var(--text-muted)' }}>Taxable Amount</span>
                                    <span className="font-bold" style={{ color: 'var(--text-main)' }}>{business.currency} {totals.subtotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="font-medium tracking-tight" style={{ color: 'var(--text-muted)' }}>Total GST</span>
                                    <span className="font-bold" style={{ color: 'var(--text-main)' }}>{business.currency} {totals.gst.toFixed(2)}</span>
                                </div>
                                <div className="pt-4 border-t space-y-3" style={{ borderColor: 'var(--border)' }}>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="font-medium tracking-tight" style={{ color: 'var(--text-muted)' }}>Payment Mode</span>
                                        <select
                                            className="px-2 py-1 border rounded-lg text-sm font-bold outline-none"
                                            value={invoice.paymentMode}
                                            onChange={e => setInvoice({ ...invoice, paymentMode: e.target.value })}
                                            style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                                        >
                                            <option value="Cash">Cash</option>
                                            <option value="UPI">UPI</option>
                                            <option value="Credit">Credit</option>
                                        </select>
                                    </div>

                                    {pluginLoader.isEnabled('discount') && (
                                        <div className="pt-3 space-y-2 border-t border-dashed" style={{ borderColor: 'var(--border)' }}>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Coupon / Promo</span>
                                                {invoice.appliedCoupon && (
                                                    <button
                                                        onClick={() => setInvoice({ ...invoice, appliedCoupon: null, couponCode: '' })}
                                                        className="text-[10px] font-bold text-red-500 hover:underline"
                                                    >
                                                        Remove
                                                    </button>
                                                )}
                                            </div>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="Enter coupon code"
                                                    value={invoice.couponCode}
                                                    onChange={e => setInvoice({ ...invoice, couponCode: e.target.value.toUpperCase() })}
                                                    className="flex-1 px-3 py-2 border rounded-lg text-xs font-bold uppercase outline-none focus:ring-1"
                                                    style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-main)', '--tw-ring-color': 'var(--primary)' }}
                                                />
                                                <button
                                                    onClick={handleApplyCoupon}
                                                    disabled={!invoice.couponCode}
                                                    className="bg-primary text-white px-3 py-2 rounded-lg text-[10px] font-black uppercase disabled:opacity-50 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                                >
                                                    Apply
                                                </button>
                                            </div>
                                            {couponError && <p className="text-[9px] text-red-500 font-bold">{couponError}</p>}
                                            {invoice.appliedCoupon && (
                                                <div className="flex justify-between items-center bg-green-500/10 p-2 rounded-lg border border-green-500/20">
                                                    <span className="text-[10px] font-bold text-green-600">Applied: {invoice.appliedCoupon.code}</span>
                                                    <span className="text-[10px] font-black text-green-600">-{business.currency} {pluginDiscount.toFixed(2)}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {business.businessMode === 'pharmacy' && (
                                        <div className="pt-3 space-y-2 border-t border-dashed" style={{ borderColor: 'var(--border)' }}>
                                            <label className="text-[10px] font-bold uppercase tracking-widest block" style={{ color: 'var(--text-muted)' }}>Attach Prescription</label>
                                            <input 
                                                type="file"
                                                accept="image/*,.pdf"
                                                onChange={e => setInvoice({ ...invoice, prescription: e.target.files[0] })}
                                                className="w-full text-[10px] font-bold text-muted file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-bold file:bg-primary file:text-white"
                                            />
                                        </div>
                                    )}

                                    <div className="pt-3 space-y-2">
                                        <label className="text-[10px] font-extrabold uppercase tracking-widest block" style={{ color: 'var(--text-muted)' }}>Apply Discount ({business.currency})</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold" style={{ color: 'var(--danger)' }}>{business.currency}</span>
                                            <input
                                                className="w-full pl-11 pr-4 py-3 border rounded-xl text-xl font-black focus:outline-none focus:ring-2"
                                                type="number"
                                                value={invoice.discount}
                                                onChange={e => setInvoice({ ...invoice, discount: parseFloat(e.target.value) || 0 })}
                                                onWheel={(e) => e.target.blur()}
                                                style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.2)', color: 'var(--danger)', '--tw-ring-color': 'rgba(239, 68, 68, 0.3)' }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-6 border-t-4 border-double" style={{ borderColor: 'var(--border)' }}>
                                    {pluginLoader.isEnabled('loyalty-program') && (
                                        <div className="flex justify-between items-center bg-blue-500/10 p-2 rounded-lg border border-blue-500/20 mb-3">
                                            <span className="text-[10px] font-bold text-blue-600 uppercase flex items-center gap-1">
                                                <Award size={12} /> Points Earned
                                            </span>
                                            <span className="text-[10px] font-black text-blue-600">
                                                +{Math.floor(finalTotal)} pts
                                            </span>
                                        </div>
                                    )}

                                    <div className="flex justify-between items-end">
                                        <span className="text-xs font-bold uppercase tracking-tighter" style={{ color: 'var(--text-muted)' }}>Grand Total</span>
                                        <div className="text-right">
                                            <span className="text-3xl font-black leading-none block" style={{ color: 'var(--primary)' }}>{business.currency} {finalTotal.toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-3">
                                    {business.businessMode === 'restaurant' && (
                                        <button
                                            onClick={sendToKitchen}
                                            disabled={isSaving}
                                            className={`w-full py-3 rounded-2xl font-black text-sm shadow-md flex items-center justify-center gap-2 transition-all duration-300 ${isSaving ? 'opacity-50' : 'hover:scale-[1.02] active:scale-95'}`}
                                            style={{
                                                background: 'rgba(var(--primary-rgb), 0.1)',
                                                color: 'var(--primary)',
                                                border: '2px solid var(--primary)'
                                            }}
                                        >
                                            <ChefHat size={20} /> SEND TO KITCHEN
                                        </button>
                                    )}

                                    <button
                                        onClick={saveInvoice}
                                        disabled={isSaving}
                                        className={`w-full py-4 rounded-2xl font-black text-lg shadow-lg flex items-center justify-center gap-3 transition-all duration-300 ${isSaving ? 'cursor-not-allowed' : 'hover:scale-[1.02] active:scale-95'}`}
                                        style={{
                                            background: isSaving ? 'var(--border)' : 'var(--primary)',
                                            color: isSaving ? 'var(--text-muted)' : 'white',
                                            boxShadow: isSaving ? 'none' : '0 10px 15px -3px rgba(var(--primary-rgb), 0.3)'
                                        }}
                                    >
                                        {isSaving ? 'Processing...' : (editingInvoice ? <><Pencil size={22} /> UPDATE BILL</> : <><Download size={22} /> SAVE & PRINT</>)}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {/* Date Filters for History */}
                    <div className="p-4 border-b flex flex-col md:flex-row gap-4 md:items-center" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                        <div className="flex items-center gap-2">
                             <span className="text-[13px] font-bold" style={{ color: 'var(--text-muted)' }}>From:</span>
                             <input
                                 type="date"
                                 value={dateRange.start}
                                 onChange={e => setDateRange({ ...dateRange, start: e.target.value })}
                                 min={SOFTWARE_START_DATE}
                                 className="flex-1 md:w-36 px-2 py-1.5 rounded-lg border text-sm font-bold"
                                 style={{ background: 'var(--background)', color: 'var(--text-main)', borderColor: 'var(--border)' }}
                             />
                        </div>
                        <div className="flex items-center gap-2">
                             <span className="text-[13px] font-bold" style={{ color: 'var(--text-muted)' }}>To:</span>
                             <input
                                 type="date"
                                 value={dateRange.end}
                                 onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
                                 min={SOFTWARE_START_DATE}
                                 className="flex-1 md:w-36 px-2 py-1.5 rounded-lg border text-sm font-bold"
                                 style={{ background: 'var(--background)', color: 'var(--text-main)', borderColor: 'var(--border)' }}
                             />
                        </div>
                        <div className="relative flex-1 md:max-w-xs">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={14} style={{ color: 'var(--text-muted)' }} />
                            <input
                                type="text"
                                placeholder="Search customer, phone or bill #..."
                                value={historySearch}
                                onChange={e => setHistorySearch(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm font-bold"
                                style={{ background: 'var(--background)', color: 'var(--text-main)', borderColor: 'var(--border)' }}
                            />
                        </div>
                    </div>

                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full border-collapse min-w-[700px]">
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--background)' }}>
                                    <th
                                        onClick={() => toggleSort('date')}
                                        className="cursor-pointer select-none px-4 py-4 text-xs font-bold uppercase tracking-wide transition-colors hover:bg-black/5"
                                        style={{ color: 'var(--text-muted)' }}
                                    >
                                        <div className="flex items-center gap-1">
                                            Date
                                            {sortColumn === 'date' && (sortDirection === 'desc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />)}
                                        </div>
                                    </th>
                                    <th
                                        onClick={() => toggleSort('id')}
                                        className="cursor-pointer select-none px-4 py-4 text-xs font-bold uppercase tracking-wide transition-colors hover:bg-black/5"
                                        style={{ color: 'var(--text-muted)' }}
                                    >
                                        <div className="flex items-center gap-1">
                                            {business.getTerm('orders').slice(0, -1)} ID
                                            {sortColumn === 'id' && (sortDirection === 'desc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />)}
                                        </div>
                                    </th>
                                    <th className="px-4 py-4 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Customer</th>
                                    <th className="px-4 py-4 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Items</th>
                                    {!isStaff && <th className="px-4 py-4 text-xs font-bold uppercase tracking-wide text-right" style={{ color: 'var(--text-muted)' }}>Profit</th>}
                                    <th className="px-4 py-4 text-xs font-bold uppercase tracking-wide text-right" style={{ color: 'var(--text-muted)' }}>Total</th>
                                    <th className="px-4 py-4 w-[50px]"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y" style={{ divideColor: 'var(--border)' }}>
                                {sortedInvoices.map(inv => (
                                    <tr key={inv.id} className="transition-colors hover:bg-black/5" style={{ background: 'var(--surface)' }}>
                                        <td className="px-4 py-4 text-sm font-medium" style={{ color: 'var(--text-main)' }}>
                                            {inv.date ?
                                                new Date(inv.date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) :
                                                new Date(inv.timestamp || inv.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                            }
                                        </td>
                                        <td className="px-4 py-4 font-bold" style={{ color: 'var(--text-main)' }}>#{inv.id?.slice(-4)}</td>
                                        <td className="px-4 py-4">
                                            <div className="font-bold" style={{ color: 'var(--text-main)' }}>{inv.customerName}</div>
                                            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{inv.customerPhone}</div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>{inv.items?.length} {business.getTerm('products')}</span>
                                            <div className="text-xs truncate max-w-[200px]" style={{ color: 'var(--text-muted)' }}>{inv.items?.map(i => i.name).join(', ')}</div>
                                        </td>
                                        {!isStaff && (
                                            <td className="px-4 py-4 text-right font-bold" style={{ color: 'var(--success)' }}>
                                                {business.currency} {(inv.items?.reduce((acc, item) => {
                                                    const product = products.find(p => p.id === item.id);
                                                    let bagPurchasePrice = 0;
                                                    if (item.originalPrice !== undefined && item.originalPrice !== null) {
                                                        bagPurchasePrice = Number(item.originalPrice);
                                                    } else if (item.costPrice !== undefined && item.costPrice !== null) {
                                                        bagPurchasePrice = Number(item.costPrice);
                                                    } else if (product) {
                                                        bagPurchasePrice = Number(product.purchasePrice || 0);
                                                    }
                                                    let unitCost = Number(bagPurchasePrice);
                                                    const isLoose = item.salesType === 'Loose' || (item.name || '').toLowerCase().includes('(loose)');
                                                    if (isLoose) {
                                                        const product = products.find(p => p.id === item.id);
                                                        let weight = Number(item.bagWeight);
                                                        if (!weight && product) weight = Number(product.bagWeight);
                                                        if (!weight) weight = 50;
                                                        unitCost = unitCost / weight;
                                                    }
                                                    return acc + ((item.price - unitCost) * item.quantity);
                                                }, 0) - (inv.discount || 0)).toFixed(2)}
                                            </td>
                                        )}
                                        <td className="px-4 py-4 text-right font-black" style={{ color: 'var(--primary)' }}>{business.currency} {inv.totalAmount?.toLocaleString()}</td>
                                        <td className="px-4 py-4 text-right">
                                            <div className="flex justify-end gap-1">
                                                <button
                                                    onClick={async () => {
                                                        if (await showConfirm("Confirm Return?", "Stock will be added back.")) {
                                                            firestoreService.deleteInvoice(inv.docId || inv.id).catch(err => showError(err.message));
                                                        }
                                                    }}
                                                    className="p-2 rounded-lg transition-colors hover:bg-black/5"
                                                    style={{ color: 'var(--danger)' }}
                                                    title="Return / Delete"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleEdit(inv)}
                                                    className="p-2 rounded-lg transition-colors hover:bg-black/5"
                                                    style={{ color: '#3b82f6' }}
                                                    title="Edit Invoice"
                                                >
                                                    <Pencil size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDuplicateInvoice(inv)}
                                                    className="p-2 rounded-lg transition-colors hover:bg-black/5"
                                                    style={{ color: '#a855f7' }}
                                                    title="Duplicate"
                                                >
                                                    <Copy size={16} />
                                                </button>
                                                <button
                                                    onClick={() => generateInvoicePDF(inv)}
                                                    className="p-2 rounded-lg transition-colors hover:bg-black/5"
                                                    style={{ color: 'var(--text-muted)' }}
                                                    title="PDF"
                                                >
                                                    <Download size={16} />
                                                </button>
                                                <button
                                                    onClick={() => shareToWhatsApp(inv)}
                                                    className="p-2 rounded-lg transition-colors hover:bg-black/5"
                                                    style={{ color: 'var(--success)' }}
                                                    title="WhatsApp"
                                                >
                                                    <MessageCircle size={16} />
                                                </button>
                                                <button
                                                    onClick={() => generateThermalInvoicePDF(inv)}
                                                    className="p-2 rounded-lg transition-colors hover:bg-black/5"
                                                    style={{ color: 'var(--text-main)' }}
                                                    title="Thermal"
                                                >
                                                    <Printer size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile History Card View */}
                    <div className="md:hidden divide-y" style={{ divideColor: 'var(--border)' }}>
                        {sortedInvoices.map(inv => (
                            <div key={inv.id} className="p-4 space-y-3" style={{ background: 'var(--surface)' }}>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="font-black text-xs uppercase tracking-widest text-muted">#{inv.id?.slice(-6)}</div>
                                        <div className="font-bold text-lg" style={{ color: 'var(--text-main)' }}>{inv.customerName}</div>
                                        <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{inv.customerPhone}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                                            {inv.date ?
                                                new Date(inv.date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit' }) :
                                                new Date(inv.timestamp || inv.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit' })
                                            }
                                        </div>
                                        <div className="font-black text-xl" style={{ color: 'var(--primary)' }}>{business.currency} {inv.totalAmount?.toLocaleString()}</div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2 py-2 border-y border-dashed" style={{ borderColor: 'var(--border)' }}>
                                    <span className="text-[10px] font-bold px-2 py-1 rounded bg-black/5" style={{ color: 'var(--text-secondary)' }}>{inv.items?.length} {business.getTerm('products')}</span>
                                    <span className="text-[10px] font-bold px-2 py-1 rounded bg-accent text-primary uppercase tracking-widest">{inv.paymentMode}</span>
                                    {!isStaff && (
                                        <span className="text-[10px] font-bold px-2 py-1 rounded bg-accent text-primary">
                                            Profit: {business.currency} {(inv.items?.reduce((acc, item) => {
                                                const product = products.find(p => p.id === item.id);
                                                let unitCost = item.originalPrice || item.costPrice || (product?.purchasePrice) || 0;
                                                const isLoose = item.salesType === 'Loose' || (item.name || '').toLowerCase().includes('(loose)');
                                                if (isLoose) {
                                                    let weight = item.bagWeight || product?.bagWeight || 50;
                                                    unitCost = unitCost / weight;
                                                }
                                                return acc + ((item.price - unitCost) * item.quantity);
                                            }, 0) - (inv.discount || 0)).toFixed(0)}
                                        </span>
                                    )}
                                </div>

                                <div className="flex justify-between items-center pt-1">
                                    <div className="flex gap-1">
                                        <button onClick={() => shareToWhatsApp(inv)} className="p-2 rounded-lg bg-green-500/10 text-green-500"><MessageCircle size={18} /></button>
                                        <button onClick={() => generateInvoicePDF(inv)} className="p-2 rounded-lg bg-black/5 text-muted"><Download size={18} /></button>
                                        <button onClick={() => generateThermalInvoicePDF(inv)} className="p-2 rounded-lg bg-black/5 text-main"><Printer size={18} /></button>
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={() => handleEdit(inv)} className="px-3 py-2 rounded-lg bg-blue-500 text-white text-[10px] font-black uppercase">Edit</button>
                                        <button onClick={() => handleDuplicateInvoice(inv)} className="p-2 rounded-lg bg-purple-500/10 text-purple-500"><Copy size={18} /></button>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {filteredInvoices.length === 0 && (
                            <div className="p-12 text-center text-muted font-bold italic">No records found</div>
                        )}
                    </div>

                </div>
            )
            }
        </div>
    )
}

export default Billing
