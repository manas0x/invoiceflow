import {
    collection,
    addDoc,
    getDocs,
    updateDoc,
    doc,
    query,
    where,
    onSnapshot,
    setDoc,
    increment,
    deleteField,
    writeBatch,
    runTransaction,
    deleteDoc,
    orderBy,
    limit,
    getDoc,
    getDocFromServer
} from "firebase/firestore";
import { db } from "../firebase";
import { enqueueOfflineOperation, flushOfflineQueue as flushQueuedOperations } from "./offlineQueue";
import { getSetupConfig } from "../config/setupConfig";
import { sqlService } from "./sqlService";

const PRODUCTS_COLLECTION = "products";
const PURCHASES_COLLECTION = "purchases";
const INVOICES_COLLECTION = "invoices";
const CUSTOMERS_COLLECTION = "customers";
const SUPPLIERS_COLLECTION = "suppliers";
const SUPPLIER_PAYMENTS_COLLECTION = "supplier_payments";
const CUSTOMER_PAYMENTS_COLLECTION = "customer_payments";
const NOTIFICATIONS_COLLECTION = "notifications";
const USERS_COLLECTION = "users";
const SETTINGS_COLLECTION = "settings";
const SALE_RETURNS_COLLECTION = "sale_returns";
const PURCHASE_RETURNS_COLLECTION = "purchase_returns";
const NOTIFICATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const isBrowserOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

const getNotificationExpiry = (createdAt) => {
    const createdTime = new Date(createdAt || 0).getTime();
    return Number.isFinite(createdTime) ? createdTime + NOTIFICATION_RETENTION_MS : 0;
};

const getReturnStockDelta = (item, direction) => {
    let quantity = Math.abs(Number(item.quantity) || 0);
    if (item.salesType === 'Loose') {
        quantity /= Number(item.bagWeight) || 50;
    }
    return direction * quantity;
};

const getReturnProductAdjustments = (items, direction) => {
    const adjustments = new Map();
    for (const item of items || []) {
        if (!item.id) continue;
        const existing = adjustments.get(item.id);
        adjustments.set(item.id, {
            item: existing?.item || item,
            delta: (existing?.delta || 0) + getReturnStockDelta(item, direction)
        });
    }
    return [...adjustments.entries()];
};

const recoveredProductData = (item, stock) => {
    const purchasePrice = Number(item.purchasePrice ?? item.rateIncl ?? item.price ?? 0) || 0;
    return {
        name: item.name || 'Recovered Product',
        category: item.category || 'General',
        unit: item.unit || (item.salesType === 'Loose' ? 'Kg' : 'Piece'),
        gst: Number(item.gst) || 5,
        purchasePrice,
        stock,
        minStock: Number(item.minStock) || 10,
        batches: stock > 0 ? [{ qty: stock, purchasePrice }] : [],
        ...(item.bagWeight ? { bagWeight: Number(item.bagWeight) } : {}),
        ...(item.isLoose !== undefined ? { isLoose: item.isLoose } : {}),
        recoveredFromReturn: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
};

const firebaseService = {
    async flushOfflineQueue() {
        return flushQueuedOperations(async (entry) => {
            if (entry.operation === 'invoice') return this.addInvoice(entry.payload, { fromOfflineQueue: true });
            if (entry.operation === 'purchase') return this.addPurchase(entry.payload, { fromOfflineQueue: true });
            if (entry.operation === 'sale_return') return this.addSaleReturn(entry.payload, { fromOfflineQueue: true });
            if (entry.operation === 'purchase_return') return this.addPurchaseReturn(entry.payload, { fromOfflineQueue: true });
            throw new Error(`Unknown offline operation: ${entry.operation}`);
        });
    },

    // Products
    async getProducts() {
        const querySnapshot = await getDocs(collection(db, PRODUCTS_COLLECTION));
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    subscribeProducts(callback) {
        return onSnapshot(collection(db, PRODUCTS_COLLECTION), (snapshot) => {
            const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(products);
        });
    },

    async addProduct(product) {
        const docRef = await addDoc(collection(db, PRODUCTS_COLLECTION), {
            ...product,
            createdAt: new Date().toISOString(),
            stock: Number(product.stock),
            purchasePrice: Number(product.purchasePrice),
            minStock: Number(product.minStock)
        });
        return docRef.id;
    },

    async updateProduct(id, updates) {
        const docRef = doc(db, PRODUCTS_COLLECTION, id);
        await updateDoc(docRef, {
            ...updates,
            updatedAt: new Date().toISOString()
        });
    },

    async deleteProduct(id) {
        await deleteDoc(doc(db, PRODUCTS_COLLECTION, id));
    },

    async getCustomers() {
        const querySnapshot = await getDocs(collection(db, CUSTOMERS_COLLECTION));
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },


    // Customers
    async addCustomer(customerData) {
        const id = customerData.phone || customerData.name.trim().replace(/\s+/g, '_').toLowerCase();
        const docRef = doc(db, CUSTOMERS_COLLECTION, id);
        await setDoc(docRef, {
            ...customerData,
            createdAt: new Date().toISOString()
        });

        return id;
    },

    async updateCustomer(id, updates) {
        const docRef = doc(db, CUSTOMERS_COLLECTION, id);
        await updateDoc(docRef, {
            ...updates,
            updatedAt: new Date().toISOString()
        });
    },

    async deleteCustomer(id) {
        await deleteDoc(doc(db, CUSTOMERS_COLLECTION, id));
    },

    subscribeCustomers(callback) {
        return onSnapshot(collection(db, CUSTOMERS_COLLECTION), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(data);
        });
    },

    // Customer Payments
    async addCustomerPayment(paymentData) {
        const docRef = await addDoc(collection(db, CUSTOMER_PAYMENTS_COLLECTION), {
            ...paymentData,
            createdAt: new Date().toISOString()
        });

        return docRef.id;
    },

    async deleteCustomerPayment(id) {
        await deleteDoc(doc(db, CUSTOMER_PAYMENTS_COLLECTION, id));
    },

    async updateCustomerPayment(id, updates) {
        const docRef = doc(db, CUSTOMER_PAYMENTS_COLLECTION, id);
        await updateDoc(docRef, {
            ...updates,
            updatedAt: new Date().toISOString()
        });
    },

    subscribeCustomerPayments(callback) {
        const q = query(collection(db, CUSTOMER_PAYMENTS_COLLECTION), orderBy("date", "desc"));
        return onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(data);
        });
    },

    // Migration / Maintenance
    async updateLinkedRecordsName(oldName, newName, oldPhone, newPhone) {
        if (!oldName || oldName === newName) return;

        console.log(`Migrating records from "${oldName}" to "${newName}"...`);

        // 1. Update Invoices
        const invoicesRef = collection(db, INVOICES_COLLECTION);
        const qInv = query(invoicesRef, where("customerName", "==", oldName));
        const invSnaps = await getDocs(qInv);

        const updatePromises = invSnaps.docs.map(doc =>
            updateDoc(doc.ref, {
                customerName: newName,
                customerPhone: newPhone || doc.data().customerPhone
            })
        );

        // 2. Update Payments
        const paymentsRef = collection(db, CUSTOMER_PAYMENTS_COLLECTION);
        const qPay = query(paymentsRef, where("customerName", "==", oldName));
        const paySnaps = await getDocs(qPay);

        const payPromises = paySnaps.docs.map(doc =>
            updateDoc(doc.ref, {
                customerName: newName,
                customerPhone: newPhone || doc.data().customerPhone
            })
        );

        await Promise.all([...updatePromises, ...payPromises]);
        console.log(`Migrated ${updatePromises.length} invoices and ${payPromises.length} payments.`);
    },

    // Purchases
    async addPurchase(purchaseData, options = {}) {
        if (isBrowserOffline() && !options.fromOfflineQueue) {
            return enqueueOfflineOperation('purchase', purchaseData);
        }

        return await runTransaction(db, async (transaction) => {
            const purchaseRef = doc(collection(db, PURCHASES_COLLECTION));

            // 1. ALL READS: Read all existing products first
            const productDocsMap = {};
            for (const item of purchaseData.items) {
                if (item.id) {
                    const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
                    productDocsMap[item.id] = await transaction.get(productRef);
                }
            }

            // 2. ALL WRITES: Process items and update Product Stocks with Batches
            for (const item of purchaseData.items) {
                const productRef = item.id ? doc(db, PRODUCTS_COLLECTION, item.id) : doc(collection(db, PRODUCTS_COLLECTION));

                if (item.id) {
                    const productDoc = productDocsMap[item.id];
                    if (productDoc && productDoc.exists()) {
                        const productData = productDoc.data();
                        const oldStock = Number(productData.stock) || 0;
                        const newStock = Number(item.quantity) || 0;
                        const newPrice = Number(item.purchasePrice) || 0;
                        
                        let batches = productData.batches || [];
                        if (batches.length === 0 && oldStock > 0) {
                            batches.push({ qty: oldStock, purchasePrice: Number(productData.purchasePrice) || 0 });
                        }
                        
                        if (batches.length > 0 && batches[batches.length - 1].purchasePrice === newPrice) {
                            batches[batches.length - 1].qty += newStock;
                        } else {
                            batches.push({ qty: newStock, purchasePrice: newPrice });
                        }

                        transaction.update(productRef, {
                            stock: increment(newStock),
                            purchasePrice: newPrice, // Set display purchasePrice to the latest
                            batches: batches,
                            gst: Number(item.gst || 5),
                            updatedAt: new Date().toISOString()
                        });
                    }
                } else {
                    // New Product: Create document
                    transaction.set(productRef, {
                        name: item.name,
                        category: item.category || 'General',
                        unit: item.unit || 'Piece',
                        gst: Number(item.gst || 5),
                        purchasePrice: Number(item.purchasePrice),
                        stock: Number(item.quantity),
                        batches: [{ qty: Number(item.quantity), purchasePrice: Number(item.purchasePrice) }],
                        minStock: 10,
                        createdAt: new Date().toISOString()
                    });
                }
            }

            // 2. Add Purchase Record
            transaction.set(purchaseRef, {
                ...purchaseData,
                id: purchaseRef.id,
                createdAt: new Date().toISOString()
            });

            // 3. Save/Update Supplier Info
            if (purchaseData.supplierName) {
                const supplierRef = doc(db, SUPPLIERS_COLLECTION, purchaseData.supplierName.trim().replace(/\s+/g, '_').toLowerCase());
                transaction.set(supplierRef, {
                    name: purchaseData.supplierName,
                    updatedAt: new Date().toISOString()
                }, { merge: true });
            }

            return purchaseRef.id;
        });
    },

    async updatePurchase(purchaseId, updatedData) {
        await runTransaction(db, async (transaction) => {
            const purchaseRef = doc(db, PURCHASES_COLLECTION, purchaseId);
            const purchaseDoc = await transaction.get(purchaseRef);

            if (!purchaseDoc.exists()) throw new Error("Purchase does not exist!");

            const oldData = purchaseDoc.data();

            // --- ALL READS ---
            const oldProductsMap = {};
            const newProductsMap = {};
            
            for (const item of oldData.items) {
                if (item.id && !oldProductsMap[item.id]) {
                    const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
                    oldProductsMap[item.id] = await transaction.get(productRef);
                }
            }
            
            for (const item of updatedData.items) {
                if (item.id && !oldProductsMap[item.id] && !newProductsMap[item.id]) {
                    const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
                    newProductsMap[item.id] = await transaction.get(productRef);
                }
            }

            // --- ALL WRITES ---
            // 1. Revert Old Stock (Decrease) and calculate reverted WAC
            const oldProductsData = {};
            for (const item of oldData.items) {
                if (item.id) {
                    const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
                    const pDoc = oldProductsMap[item.id];
                    if (pDoc && pDoc.exists()) {
                        const pData = pDoc.data();
                        const revertQty = Number(item.quantity) || 0;
                        
                        let batches = pData.batches || [];
                        if (batches.length === 0 && pData.stock > 0) {
                            batches.push({ qty: Number(pData.stock), purchasePrice: Number(pData.purchasePrice) || 0 });
                        }
                        
                        // Revert purchase: remove from latest batches
                        let remainingToRevert = revertQty;
                        for (let i = batches.length - 1; i >= 0; i--) {
                            if (remainingToRevert <= 0) break;
                            if (batches[i].qty <= remainingToRevert) {
                                remainingToRevert -= batches[i].qty;
                                batches[i].qty = 0;
                            } else {
                                batches[i].qty -= remainingToRevert;
                                remainingToRevert = 0;
                            }
                        }
                        batches = batches.filter(b => b.qty > 0);

                        oldProductsData[item.id] = { stock: (Number(pData.stock) || 0) - revertQty, batches: batches };
                        
                        transaction.update(productRef, {
                            stock: increment(-revertQty),
                            batches: batches
                        });
                    }
                }
            }

            // 2. Apply New Stock (Increase) and recalculate WAC
            for (const item of updatedData.items) {
                if (item.id) {
                    const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
                    let pData = oldProductsData[item.id];
                    if (!pData) {
                        const pDoc = oldProductsMap[item.id] || newProductsMap[item.id];
                        if (pDoc && pDoc.exists()) pData = pDoc.data();
                    }
                    if (pData) {
                        const newStock = Number(item.quantity) || 0;
                        const newPrice = Number(item.purchasePrice) || 0;

                        let batches = pData.batches || [];
                        if (batches.length > 0 && batches[batches.length - 1].purchasePrice === newPrice) {
                            batches[batches.length - 1].qty += newStock;
                        } else {
                            batches.push({ qty: newStock, purchasePrice: newPrice });
                        }

                        transaction.update(productRef, {
                            stock: increment(newStock),
                            purchasePrice: newPrice, // Update to latest
                            batches: batches,
                            updatedAt: new Date().toISOString()
                        });
                    }
                }
            }

            // 3. Update Purchase Record
            transaction.update(purchaseRef, {
                ...updatedData,
                updatedAt: new Date().toISOString()
            });

            // 4. Update Supplier info if changed
            if (updatedData.supplierName) {
                const supplierRef = doc(db, SUPPLIERS_COLLECTION, updatedData.supplierName.trim().replace(/\s+/g, '_').toLowerCase());
                transaction.set(supplierRef, {
                    name: updatedData.supplierName,
                    updatedAt: new Date().toISOString()
                }, { merge: true });
            }
        });
    },

    async deletePurchase(purchaseId) {
        await runTransaction(db, async (transaction) => {
            const purchaseRef = doc(db, PURCHASES_COLLECTION, purchaseId);
            const purchaseDoc = await transaction.get(purchaseRef);

            if (!purchaseDoc.exists()) {
                throw new Error("Purchase does not exist!");
            }

            const purchaseData = purchaseDoc.data();

            // Revert Stock (Decrease it, because we are undoing a purchase)
            // Note: If stock falls below 0, it might be weird, but we allow it as correction
            for (const item of purchaseData.items) {
                if (item.id) {
                    const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
                    transaction.update(productRef, {
                        stock: increment(-Number(item.quantity)),
                        updatedAt: new Date().toISOString()
                    });
                }
            }

            transaction.delete(purchaseRef);
        });
    },

    async getPurchases() {
        const querySnapshot = await getDocs(collection(db, PURCHASES_COLLECTION));
        return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.data().id || doc.id, docId: doc.id }));
    },

    // Invoices (Sales)
    async addInvoice(invoiceData, options = {}) {
        if (isBrowserOffline() && !options.fromOfflineQueue) {
            return enqueueOfflineOperation('invoice', invoiceData);
        }

        // 5. Manage Customer (Check if exists by phone first, then name) - OUTSIDE TRANSACTION
        const customersRef = collection(db, CUSTOMERS_COLLECTION);
        let existingCustSnap = null;

        if (invoiceData.customerPhone) {
            const qPhone = query(customersRef, where("phone", "==", invoiceData.customerPhone));
            const snap = await getDocs(qPhone);
            if (!snap.empty) existingCustSnap = snap.docs[0];
        }

        if (!existingCustSnap) {
            const qName = query(customersRef, where("name", "==", invoiceData.customerName));
            const snap = await getDocs(qName);
            if (!snap.empty) existingCustSnap = snap.docs[0];
        }

        const invoiceId = await runTransaction(db, async (transaction) => {
            // --- ALL READS ---
            // 1. Get current counter
            const counterRef = doc(db, "metadata", "counters");
            const counterDoc = await transaction.get(counterRef);

            // 2. Read all products for FIFO cost calculation
            const productDocsMap = {};
            for (let i = 0; i < invoiceData.items.length; i++) {
                let item = invoiceData.items[i];
                if (item.id && !productDocsMap[item.id]) {
                    const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
                    productDocsMap[item.id] = await transaction.get(productRef);
                }
            }

            // --- ALL WRITES ---
            let nextId = 1;
            if (counterDoc.exists()) {
                nextId = (counterDoc.data().invoiceCount || 0) + 1;
            }
            const formattedId = `INV-${String(nextId).padStart(4, '0')}`;

            // 3. Update Product Stocks and Calculate FIFO Cost
            for (let i = 0; i < invoiceData.items.length; i++) {
                let item = invoiceData.items[i];
                if (!item.id) continue;
                
                const pDoc = productDocsMap[item.id];
                const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
                
                let qty = Number(item.quantity);
                if (item.salesType === 'Loose') {
                    qty = qty / (Number(item.bagWeight) || 50);
                }

                if (pDoc && pDoc.exists()) {
                    let pData = pDoc.data();
                    let batches = pData.batches || [];
                    if (batches.length === 0 && pData.stock > 0) {
                        batches.push({ qty: pData.stock, purchasePrice: pData.purchasePrice || 0 });
                    }

                    let remainingToDeduct = qty;
                    let totalCost = 0;
                    let newBatches = [];

                    for (let batch of batches) {
                        if (remainingToDeduct <= 0) {
                            newBatches.push(batch);
                        } else if (batch.qty <= remainingToDeduct) {
                            totalCost += batch.qty * batch.purchasePrice;
                            remainingToDeduct -= batch.qty;
                        } else {
                            totalCost += remainingToDeduct * batch.purchasePrice;
                            batch.qty -= remainingToDeduct;
                            remainingToDeduct = 0;
                            newBatches.push(batch);
                        }
                    }

                    if (remainingToDeduct > 0) {
                        totalCost += remainingToDeduct * (pData.purchasePrice || 0);
                    }

                    if (qty > 0) {
                        item.originalPrice = totalCost / qty;
                    }

                    transaction.update(productRef, {
                        stock: increment(-qty),
                        batches: newBatches,
                        updatedAt: new Date().toISOString()
                    });
                }
            }

            // 4. Add Invoice Record (Must be after modifying invoiceData.items)
            const invoiceRef = doc(db, INVOICES_COLLECTION, formattedId);
            transaction.set(invoiceRef, {
                ...invoiceData,
                id: formattedId,
                createdAt: new Date().toISOString()
            });

            // 5. Update Counter
            transaction.set(counterRef, { invoiceCount: nextId }, { merge: true });

            // 6. Add Internal Notification for the new bill
            const notifRef = doc(collection(db, NOTIFICATIONS_COLLECTION));
            transaction.set(notifRef, {
                type: 'NEW_BILL',
                title: 'New Bill Generated',
                message: `Invoice ${formattedId} for ${invoiceData.customerName} (Rs. ${invoiceData.totalAmount})`,
                read: false,
                createdAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + NOTIFICATION_RETENTION_MS).toISOString(),
                link: 'billing'
            });

            // 7. Update Customer
            if (existingCustSnap) {
                transaction.update(doc(db, CUSTOMERS_COLLECTION, existingCustSnap.id), {
                    name: invoiceData.customerName,
                    phone: invoiceData.customerPhone || existingCustSnap.data().phone || '',
                    address: invoiceData.customerAddress || existingCustSnap.data().address || '',
                    lastVisit: new Date().toISOString()
                });
            } else {
                const customerId = invoiceData.customerPhone || invoiceData.customerName.trim().replace(/\s+/g, '_').toLowerCase();
                transaction.set(doc(db, CUSTOMERS_COLLECTION, customerId), {
                    name: invoiceData.customerName,
                    phone: invoiceData.customerPhone || '',
                    address: invoiceData.customerAddress || '',
                    lastVisit: new Date().toISOString(),
                    createdAt: new Date().toISOString()
                });
            }

            return formattedId;
        });

        return invoiceId;
    },

    async updateInvoice(docId, updatedData) {
        await runTransaction(db, async (transaction) => {
            const invoiceRef = doc(db, INVOICES_COLLECTION, docId);
            const invoiceDoc = await transaction.get(invoiceRef);

            if (!invoiceDoc.exists()) throw new Error("Invoice does not exist!");

            const oldData = invoiceDoc.data();

            // 1. Revert Old Stock (Increase)
            for (const item of oldData.items) {
                if (item.id) {
                    const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
                    let qty = Number(item.quantity);
                    if (item.salesType === 'Loose') {
                        qty = qty / (Number(item.bagWeight) || 50);
                    }
                    transaction.update(productRef, {
                        stock: increment(qty)
                    });
                }
            }

            // 2. Apply New Stock (Decrease)
            for (const item of updatedData.items) {
                if (item.id) {
                    const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
                    let qty = Number(item.quantity);
                    if (item.salesType === 'Loose') {
                        qty = qty / (Number(item.bagWeight) || 50);
                    }
                    transaction.update(productRef, {
                        stock: increment(-qty)
                    });
                }
            }

            // 3. Update Invoice
            transaction.update(invoiceRef, {
                ...updatedData,
                updatedAt: new Date().toISOString()
            });
        });
    },

    async deleteInvoice(invoiceId) {
        await runTransaction(db, async (transaction) => {
            const invoiceRef = doc(db, INVOICES_COLLECTION, invoiceId);
            const invoiceDoc = await transaction.get(invoiceRef);

            if (!invoiceDoc.exists()) {
                throw new Error("Invoice does not exist!");
            }

            const invoiceData = invoiceDoc.data();

            // Revert Stock (Increase it, because we are undoing a sale)
            for (const item of invoiceData.items) {
                if (item.id) {
                    const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
                    let qty = Number(item.quantity);
                    if (item.salesType === 'Loose') {
                        qty = qty / (Number(item.bagWeight) || 50);
                    }
                    transaction.update(productRef, {
                        stock: increment(qty),
                        updatedAt: new Date().toISOString()
                    });
                }
            }

            transaction.delete(invoiceRef);
        });
    },

    subscribeInvoices(callback) {
        return onSnapshot(collection(db, INVOICES_COLLECTION), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.data().id || doc.id, docId: doc.id }));
            callback(data);
        });
    },

    subscribeRecentInvoices(callback, limitCount = 50) {
        const q = query(
            collection(db, INVOICES_COLLECTION),
            orderBy("createdAt", "desc"),
            limit(limitCount)
        );
        return onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.data().id || doc.id, docId: doc.id }));
            callback(data);
        });
    },

    async getInvoices() {
        const querySnapshot = await getDocs(collection(db, INVOICES_COLLECTION));
        return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.data().id || doc.id, docId: doc.id }));
    },

    async getInvoice(id) {
        const docRef = doc(db, INVOICES_COLLECTION, id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { ...docSnap.data(), id: docSnap.data().id || docSnap.id, docId: docSnap.id };
        } else {
            return null;
        }
    },

    subscribePurchases(callback) {
        return onSnapshot(collection(db, PURCHASES_COLLECTION), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.data().id || doc.id, docId: doc.id }));
            callback(data);
        });
    },

    // Suppliers
    async addSupplier(supplierData) {
        const id = supplierData.name.trim().replace(/\s+/g, '_').toLowerCase();
        const docRef = doc(db, SUPPLIERS_COLLECTION, id);
        await setDoc(docRef, {
            ...supplierData,
            createdAt: new Date().toISOString()
        });

        return id;
    },

    async updateSupplier(id, updates) {
        const docRef = doc(db, SUPPLIERS_COLLECTION, id);
        await updateDoc(docRef, {
            ...updates,
            updatedAt: new Date().toISOString()
        });
    },

    async deleteSupplier(id) {
        await deleteDoc(doc(db, SUPPLIERS_COLLECTION, id));
    },

    subscribeSuppliers(callback) {
        return onSnapshot(collection(db, SUPPLIERS_COLLECTION), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(data);
        });
    },

    async getSuppliers() {
        const querySnapshot = await getDocs(collection(db, SUPPLIERS_COLLECTION));
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    // Supplier Payments
    async addSupplierPayment(paymentData) {
        const docRef = await addDoc(collection(db, SUPPLIER_PAYMENTS_COLLECTION), {
            ...paymentData,
            createdAt: new Date().toISOString()
        });

        return docRef.id;
    },

    async deleteSupplierPayment(id) {
        await deleteDoc(doc(db, SUPPLIER_PAYMENTS_COLLECTION, id));
    },

    subscribeSupplierPayments(callback) {
        const q = query(collection(db, SUPPLIER_PAYMENTS_COLLECTION), orderBy("date", "desc"));
        return onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(data);
        });
    },

    // Notifications
    async addNotification(notification) {
        const createdAt = new Date().toISOString();
        await addDoc(collection(db, NOTIFICATIONS_COLLECTION), {
            ...notification,
            createdAt,
            expiresAt: new Date(getNotificationExpiry(createdAt)).toISOString(),
            read: false
        });
    },

    subscribeNotifications(callback) {
        const q = query(collection(db, NOTIFICATIONS_COLLECTION), orderBy("createdAt", "desc"));
        return onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(data);
        });
    },

    async markNotificationAsRead(id) {
        const docRef = doc(db, NOTIFICATIONS_COLLECTION, id);
        await updateDoc(docRef, { read: true });
    },

    async clearAllNotifications() {
        const querySnapshot = await getDocs(collection(db, NOTIFICATIONS_COLLECTION));
        const batch = writeBatch(db);
        querySnapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit();
    },

    // Users
    async removeStoredUserPasswords() {
        const snap = await getDocs(collection(db, USERS_COLLECTION));
        const profilesWithPasswords = snap.docs.filter(userDoc => Object.prototype.hasOwnProperty.call(userDoc.data(), 'password'));
        if (profilesWithPasswords.length === 0) return 0;

        const batch = writeBatch(db);
        profilesWithPasswords.forEach(userDoc => {
            batch.update(userDoc.ref, {
                password: deleteField(),
                securityUpdatedAt: new Date().toISOString()
            });
        });
        await batch.commit();
        return profilesWithPasswords.length;
    },

    async removeStoredEmailCredentials() {
        const settingsRef = doc(db, SETTINGS_COLLECTION, 'email_notifications');
        const settingsSnap = await getDoc(settingsRef);
        if (!settingsSnap.exists()) return false;

        const settings = settingsSnap.data();
        const protectedFields = ['brevoApiKey', 'smtpPass', 'smtpHost', 'smtpPort', 'smtpUser'];
        const hasCredentials = protectedFields.some(field => Object.prototype.hasOwnProperty.call(settings, field));
        if (!hasCredentials) return false;

        const cleanup = { securityUpdatedAt: new Date().toISOString() };
        protectedFields.forEach(field => { cleanup[field] = deleteField(); });
        await updateDoc(settingsRef, cleanup);
        return true;
    },

    async getUsers() {
        const snap = await getDocs(collection(db, USERS_COLLECTION));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    async getUserById(id) {
        if (!id) return null;
        let snap;
        try {
            // Profile authorization is identity-critical; do not trust a
            // stale cached "missing" document after a UID migration.
            snap = await getDocFromServer(doc(db, USERS_COLLECTION, id));
        } catch (error) {
            if (error?.code !== 'unavailable') throw error;
            snap = await getDoc(doc(db, USERS_COLLECTION, id));
        }
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    },

    async getUserByAuthUidField(authUid) {
        if (!authUid) return null;
        const snapshot = await getDocs(query(
            collection(db, USERS_COLLECTION),
            where('authUid', '==', authUid),
            limit(1)
        ));
        if (snapshot.empty) return null;
        const profileDoc = snapshot.docs[0];
        return { id: profileDoc.id, ...profileDoc.data() };
    },

    async addUser(data) {
        const id = data.id;
        if (!id) throw new Error('A Firebase Auth UID is required for a user profile.');
        const { password: _password, ...safeProfile } = data;
        await setDoc(doc(db, USERS_COLLECTION, id), {
            ...safeProfile,
            createdAt: new Date().toISOString()
        }, { merge: true });
        return id;
    },

    async deleteUser(id) {
        await deleteDoc(doc(db, USERS_COLLECTION, id));
    },

    // Notifications
    async cleanExpiredNotifications() {
        const snapshot = await getDocs(collection(db, NOTIFICATIONS_COLLECTION));
        const expired = snapshot.docs.filter(notificationDoc => {
            const notification = notificationDoc.data();
            const expiry = notification.expiresAt
                ? new Date(notification.expiresAt).getTime()
                : getNotificationExpiry(notification.createdAt);
            return Number.isFinite(expiry) && expiry <= Date.now();
        });

        if (expired.length === 0) return;
        const batch = writeBatch(db);
        expired.forEach(notificationDoc => batch.delete(notificationDoc.ref));
        await batch.commit();
    },

    subscribeNotifications(callback) {
        const q = query(collection(db, NOTIFICATIONS_COLLECTION), orderBy('createdAt', 'desc'), limit(50));
        return onSnapshot(q, (snapshot) => {
            const notifications = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })).filter(notification => {
                const expiry = notification.expiresAt
                    ? new Date(notification.expiresAt).getTime()
                    : getNotificationExpiry(notification.createdAt);
                return !Number.isFinite(expiry) || expiry > Date.now();
            });
            callback(notifications);
        }, (error) => {
            // Notification access is optional and must not create an uncaught
            // Firestore error that obscures the rest of the admin panel.
            if (error?.code !== 'permission-denied') {
                console.warn('Notification listener unavailable:', error.message);
            }
            callback([]);
        });
    },

    async markNotificationAsRead(id) {
        const docRef = doc(db, NOTIFICATIONS_COLLECTION, id);
        await updateDoc(docRef, { read: true, updatedAt: new Date().toISOString() });
    },

    async clearAllNotifications() {
        const snap = await getDocs(collection(db, NOTIFICATIONS_COLLECTION));
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
    },

    async sendNewBillEmail(invoice) {
        try {
            const settings = await this.getAppSettings('email_notifications');
            if (!settings || !settings.enabled || !settings.recipientEmail) return;
            // Email delivery must run in a trusted server-side function. Never
            // put SMTP/Brevo credentials in a Vite client bundle or Firestore.
            console.warn(`Email notification for ${invoice.id} was not sent: configure a server-side mail function.`);
        } catch (err) {
            console.error("Email Notification Failed:", err);
        }
    },

    // Returns (Sales & Purchases)
    async addSaleReturn(returnData, options = {}) {
        if (isBrowserOffline() && !options.fromOfflineQueue) {
            return enqueueOfflineOperation('sale_return', returnData);
        }

        return await runTransaction(db, async (transaction) => {
            // 1. Create Sale Return Record
            const returnRef = doc(collection(db, SALE_RETURNS_COLLECTION));
            transaction.set(returnRef, {
                ...returnData,
                createdAt: new Date().toISOString()
            });

            // 2. Adjust Product Stocks (Increase)
            for (const item of returnData.items) {
                if (item.id) {
                    const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
                    let qty = Number(item.quantity);
                    if (item.salesType === 'Loose') {
                        qty = qty / (Number(item.bagWeight) || 50);
                    }
                    transaction.update(productRef, {
                        stock: increment(qty),
                        updatedAt: new Date().toISOString()
                    });
                }
            }

            // 3. Create Linked Customer Payment (Credit)
            const paymentRef = doc(collection(db, CUSTOMER_PAYMENTS_COLLECTION));
            transaction.set(paymentRef, {
                customerId: returnData.customerId,
                customerName: returnData.customerName,
                customerPhone: returnData.customerPhone || '',
                date: returnData.date,
                amount: returnData.totalRefund,
                method: 'Return Credit',
                note: `Return for Bill: ${returnData.invoiceId}`,
                isReturn: true,
                returnId: returnRef.id,
                createdAt: new Date().toISOString()
            });

            return returnRef.id;
        });
    },

    async addPurchaseReturn(returnData, options = {}) {
        if (isBrowserOffline() && !options.fromOfflineQueue) {
            return enqueueOfflineOperation('purchase_return', returnData);
        }

        return await runTransaction(db, async (transaction) => {
            // 1. Create Purchase Return Record
            const returnRef = doc(collection(db, PURCHASE_RETURNS_COLLECTION));
            transaction.set(returnRef, {
                ...returnData,
                createdAt: new Date().toISOString()
            });

            // 2. Adjust Product Stocks (Decrease)
            for (const item of returnData.items) {
                if (item.id) {
                    const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
                    transaction.update(productRef, {
                        stock: increment(-Number(item.quantity)),
                        updatedAt: new Date().toISOString()
                    });
                }
            }

            // 3. Create Linked Supplier Payment (Credit)
            const paymentRef = doc(collection(db, SUPPLIER_PAYMENTS_COLLECTION));
            transaction.set(paymentRef, {
                supplierName: returnData.supplierName,
                date: returnData.date,
                amount: returnData.totalRefund,
                method: 'Return Credit',
                note: `Return for Purchase: ${returnData.purchaseId}`,
                isReturn: true,
                returnId: returnRef.id,
                createdAt: new Date().toISOString()
            });

            return returnRef.id;
        });
    },

    // Customer ID Synchronization
    async syncCustomerIds(onProgress) {
        console.log("Starting Customer ID Synchronization...");
        const querySnapshot = await getDocs(collection(db, CUSTOMERS_COLLECTION));
        const allCustomers = querySnapshot.docs;
        let migratedCount = 0;

        for (let i = 0; i < allCustomers.length; i++) {
            const docSnap = allCustomers[i];
            const data = docSnap.data();
            const currentId = docSnap.id;

            // Calculate target ID using the same logic as addCustomer
            const targetId = data.phone || data.name.trim().replace(/\s+/g, '_').toLowerCase();

            if (onProgress) {
                onProgress(`Checking ${i + 1}/${allCustomers.length}: ${data.name}`);
            }

            if (currentId !== targetId) {
                console.log(`Migrating Customer: ${currentId} -> ${targetId}`);

                // 1. Copy Customer to new ID
                const newDocRef = doc(db, CUSTOMERS_COLLECTION, targetId);
                await setDoc(newDocRef, {
                    ...data,
                    id: targetId // Internal id consistency
                });

                // 2. Update all Payments linked to this ID
                const paymentsRef = collection(db, CUSTOMER_PAYMENTS_COLLECTION);
                const qPay = query(paymentsRef, where("customerId", "==", currentId));
                const paySnaps = await getDocs(qPay);

                for (const pDoc of paySnaps.docs) {
                    await updateDoc(pDoc.ref, { customerId: targetId });
                }

                // 3. Delete old Customer profile
                await deleteDoc(docSnap.ref);
                migratedCount++;
            }
        }

        return migratedCount;
    },

    // Bill Resequencing (Fill Gaps) - Safe 2-Phase Batch Approach
    async resequenceInvoices(onProgress) {
        console.log("Resequence: Fetching all invoices...");
        const querySnapshot = await getDocs(collection(db, INVOICES_COLLECTION));
        const allInvoices = querySnapshot.docs.map(d => ({ _srcDocId: d.id, ...d.data() }));
        console.log(`Resequence: Found ${allInvoices.length} invoices. Sorting by date...`);

        // 1. Sort by createdAt (full ISO) then date, oldest first
        allInvoices.sort((a, b) => {
            const dateA = a.createdAt || a.date || '';
            const dateB = b.createdAt || b.date || '';
            return dateA.localeCompare(dateB);
        });

        const total = allInvoices.length;
        const originalIds = new Set(querySnapshot.docs.map(d => d.id));
        let migratedCount = 0;

        // Helper: commit current batch and reset
        let batch = writeBatch(db);
        let opCount = 0;
        const flushBatch = async (label = '') => {
            if (opCount > 0) {
                console.log(`Resequence: Committing ${opCount} ops (${label})...`);
                await batch.commit();
                batch = writeBatch(db);
                opCount = 0;
            }
        };

        // Build the set of final IDs so we know which originals to delete
        const finalIds = new Set();

        // ── PHASE 1: Write final INV-XXXX docs directly from in-memory data ──
        // No reads needed — we have everything already. No collisions because
        // we batch-set ALL new IDs first, then delete originals in Phase 2.
        console.log("Resequence Phase 1/2: Writing final INV-XXXX docs from memory...");
        if (onProgress) onProgress(`Phase 1/2: Writing ${total} invoices to new sequence...`);

        for (let i = 0; i < total; i++) {
            const data = allInvoices[i];
            const finalId = `INV-${String(i + 1).padStart(4, '0')}`;
            finalIds.add(finalId);

            // Strip internal tracking fields before writing
            const { _srcDocId, docId: _d, id: _id, ...cleanData } = data;

            const finalRef = doc(db, INVOICES_COLLECTION, finalId);
            batch.set(finalRef, { ...cleanData, id: finalId, docId: finalId });
            opCount++;
            migratedCount++;

            if (opCount >= 400) await flushBatch(`Phase 1 chunk at ${i + 1}`);
        }
        await flushBatch('Phase 1 final');

        // ── PHASE 2: Delete all original IDs not in the new sequence ──────────
        console.log("Resequence Phase 2/2: Deleting old/orphaned doc IDs...");
        if (onProgress) onProgress(`Phase 2/2: Cleaning up old records...`);

        for (const oldId of originalIds) {
            if (!finalIds.has(oldId)) {
                console.log(`Resequence: Queueing delete for ${oldId}`);
                batch.delete(doc(db, INVOICES_COLLECTION, oldId));
                opCount++;
                if (opCount >= 400) await flushBatch('Phase 2 chunk');
            }
        }
        await flushBatch('Phase 2 final');

        // Update global counter
        const counterRef = doc(db, "metadata", "counters");
        await setDoc(counterRef, { invoiceCount: total }, { merge: true });

        console.log(`Resequence: ✅ Done. ${migratedCount} invoices resequenced.`);
        return migratedCount;
    },



    // Migration Utilities
    async migrateInvoiceIds(onProgress) {
        console.log("Starting Doc ID to Invoice ID Migration...");
        const querySnapshot = await getDocs(collection(db, INVOICES_COLLECTION));
        const allInvoices = querySnapshot.docs;
        let migratedCount = 0;
        let skippedCount = 0;

        for (let i = 0; i < allInvoices.length; i++) {
            const docSnap = allInvoices[i];
            const data = docSnap.data();
            const currentDocId = docSnap.id;
            const targetId = data.id; // Internal INV-XXXX ID

            if (onProgress) {
                onProgress(`Checking ${i + 1}/${allInvoices.length}: ${currentDocId}`);
            }

            if (targetId && currentDocId !== targetId) {
                console.log(`Migrating ${currentDocId} -> ${targetId}`);

                // Copy to new ID
                const newDocRef = doc(db, INVOICES_COLLECTION, targetId);
                await setDoc(newDocRef, {
                    ...data,
                    docId: targetId // Update internal docId reference if it exists
                });

                // Delete old ID
                await deleteDoc(docSnap.ref);
                migratedCount++;
            } else {
                skippedCount++;
            }
        }

        console.log(`Migration Complete: ${migratedCount} migrated, ${skippedCount} already correct.`);
        return { migratedCount, skippedCount };
    },

    async getInvoiceCount() {
        const counterRef = doc(db, "metadata", "counters");
        const docSnap = await getDoc(counterRef);
        return docSnap.exists() ? (docSnap.data().invoiceCount || 0) : 0;
    },

    async updateInvoiceCount(newCount) {
        const counterRef = doc(db, "metadata", "counters");
        await setDoc(counterRef, { 
            invoiceCount: Number(newCount),
            lastUpdated: new Date().toISOString()
        }, { merge: true });
    },


    async getUserByEmail(email) {
        // 1. Try searching 'email' field
        let q = query(collection(db, USERS_COLLECTION), where("email", "==", email));
        let querySnapshot = await getDocs(q);

        // 2. Fallback: Try searching 'username' field (for legacy or specific setups)
        if (querySnapshot.empty) {
            q = query(collection(db, USERS_COLLECTION), where("username", "==", email));
            querySnapshot = await getDocs(q);
        }

        if (querySnapshot.empty) return null;
        const doc = querySnapshot.docs[0];
        return { id: doc.id, ...doc.data() };
    },

    async exportAllDataJSON() {
        const collectionList = [
            { name: 'invoices', id: INVOICES_COLLECTION },
            { name: 'products', id: PRODUCTS_COLLECTION },
            { name: 'customers', id: CUSTOMERS_COLLECTION },
            { name: 'suppliers', id: SUPPLIERS_COLLECTION },
            { name: 'purchases', id: PURCHASES_COLLECTION },
            { name: 'customer_payments', id: CUSTOMER_PAYMENTS_COLLECTION },
            { name: 'supplier_payments', id: SUPPLIER_PAYMENTS_COLLECTION }
        ];

        const backup = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            data: {}
        };

        for (const col of collectionList) {
            try {
                console.log(`Export: Gathering ${col.name}...`);
                const snap = await getDocs(collection(db, col.id));
                backup.data[col.name] = snap.docs.map(d => ({ ...d.data(), docId: d.id }));
            } catch (err) {
                console.error(`Export: Failed to gather ${col.name}:`, err.message);
                throw err; // Re-throw to be caught by the caller
            }
        }

        return backup;
    },

    // App Preferences / Metadata
    async getAppSettings(id) {
        const docRef = doc(db, SETTINGS_COLLECTION, id);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? docSnap.data() : null;
    },

    subscribeAppSettings(id, callback) {
        const docRef = doc(db, SETTINGS_COLLECTION, id);
        return onSnapshot(docRef, (docSnap) => {
            callback(docSnap.exists() ? docSnap.data() : null);
        }, (error) => {
            console.warn(`Firestore: Failed to subscribe to settings for ${id}:`, error.message);
            callback(null);
        });
    },

    async updateAppSettings(id, data) {
        try {
            console.log(`Firestore: Updating settings for ${id}...`);
            const docRef = doc(db, SETTINGS_COLLECTION, id);
            await setDoc(docRef, { ...data, updatedAt: new Date().toISOString() }, { merge: true });
            console.log(`Firestore: Settings for ${id} updated successfully.`);
        } catch (err) {
            console.error(`Firestore: Failed to update settings for ${id}:`, err.message);
            throw err;
        }
    },

    async repairOrphanedInvoices(oldName, targetName) {
        if (!oldName || !targetName || oldName === targetName) return 0;
        console.log(`Manually repairing history: "${oldName}" -> "${targetName}"`);

        // Use existing helper
        await this.updateLinkedRecordsName(oldName, targetName);
        return true;
    },

    async deduplicateCustomers(onProgress) {
        const snap = await getDocs(collection(db, CUSTOMERS_COLLECTION));
        const customers = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        const seen = new Map(); // key: phone or normalized name, value: original customer ID
        const duplicates = [];

        for (const c of customers) {
            const nameKey = (c.name || '').trim().toLowerCase();
            const phoneKey = (c.phone || '').trim();
            const key = phoneKey || nameKey;

            if (seen.has(key)) {
                duplicates.push({ duplicate: c, original: customers.find(o => o.id === seen.get(key)) });
            } else {
                seen.set(key, c.id);
            }
        }

        if (duplicates.length === 0) return 0;

        let count = 0;
        for (const item of duplicates) {
            const dup = item.duplicate;
            const original = item.original;

            // 1. Migrate History before deleting duplicate
            if (original && original.name && dup.name && original.name !== dup.name) {
                await this.updateLinkedRecordsName(dup.name, original.name, dup.phone, original.phone);
            } else if (original && original.name && dup.name && original.name === dup.name) {
                // Same name but different IDs? Ensure linked by name still works or IDs are updated.
                // Our current updateLinkedRecordsName matches by name.
                // If names are same, no migration needed UNLESS we start matching by ID.
            }

            // 2. Delete the duplicate profile
            await deleteDoc(doc(db, CUSTOMERS_COLLECTION, dup.id));

            count++;
            if (onProgress) onProgress(count, duplicates.length);
        }

        return count;
    },

    async importAllDataJSON(backup, onProgress) {
        if (!backup || !backup.data) throw new Error("Invalid backup data structure.");

        const collections = [
            { name: 'invoices', id: INVOICES_COLLECTION },
            { name: 'products', id: PRODUCTS_COLLECTION },
            { name: 'customers', id: CUSTOMERS_COLLECTION },
            { name: 'suppliers', id: SUPPLIERS_COLLECTION },
            { name: 'purchases', id: PURCHASES_COLLECTION },
            { name: 'customer_payments', id: CUSTOMER_PAYMENTS_COLLECTION },
            { name: 'supplier_payments', id: SUPPLIER_PAYMENTS_COLLECTION }
        ];

        let totalDocs = 0;
        collections.forEach(col => {
            if (backup.data[col.name]) totalDocs += backup.data[col.name].length;
        });

        let currentCount = 0;

        for (const col of collections) {
            const docs = backup.data[col.name];
            if (!docs || !Array.isArray(docs)) continue;

            // Firestore batches are limited to 500 operations
            for (let i = 0; i < docs.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = docs.slice(i, i + 500);

                chunk.forEach(data => {
                    const docId = data.docId || data.id;
                    if (!docId) return;

                    const cleanedData = { ...data };
                    delete cleanedData.docId;

                    const docRef = doc(db, col.id, docId);
                    batch.set(docRef, cleanedData);
                    currentCount++;
                    if (onProgress) onProgress(currentCount, totalDocs);
                });

                await batch.commit();
            }
        }

        // Update Metadata Counters (Invoice Count)
        const invoices = backup.data.invoices || [];
        if (invoices.length > 0) {
            const maxId = invoices.reduce((max, inv) => {
                const match = (inv.id || '').match(/INV-(\d+)/);
                if (match) {
                    const num = parseInt(match[1]);
                    return Math.max(max, num);
                }
                return max;
            }, 0);

            if (maxId > 0) {
                const counterRef = doc(db, "metadata", "counters");
                await setDoc(counterRef, { invoiceCount: maxId }, { merge: true });
            }
        }

        return currentCount;
    },

    async cleanWipeSoftware(onProgress) {
        const collections = [
            { name: 'invoices', id: INVOICES_COLLECTION },
            { name: 'products', id: PRODUCTS_COLLECTION },
            { name: 'customers', id: CUSTOMERS_COLLECTION },
            { name: 'suppliers', id: SUPPLIERS_COLLECTION },
            { name: 'purchases', id: PURCHASES_COLLECTION },
            { name: 'customer_payments', id: CUSTOMER_PAYMENTS_COLLECTION },
            { name: 'supplier_payments', id: SUPPLIER_PAYMENTS_COLLECTION },
            { name: 'notifications', id: NOTIFICATIONS_COLLECTION },
            { name: 'users', id: USERS_COLLECTION }
        ];

        let totalDeleted = 0;

        for (const col of collections) {
            const snap = await getDocs(collection(db, col.id));
            if (snap.empty) continue;

            // Delete in batches of 500
            const docs = snap.docs;
            for (let i = 0; i < docs.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = docs.slice(i, i + 500);

                chunk.forEach(d => {
                    const data = d.data();
                    // Don't delete Admin users
                    if (col.id === USERS_COLLECTION && ['admin', 'dev_admin'].includes(data.role)) {
                        return;
                    }
                    batch.delete(d.ref);
                    totalDeleted++;
                    if (onProgress) onProgress(totalDeleted);
                });

                await batch.commit();
            }
        }

        // Reset Metadata Counters
        const counterRef = doc(db, "metadata", "counters");
        await setDoc(counterRef, { invoiceCount: 0 }, { merge: true });

        return totalDeleted;
    },

    // ── RETURNS ────────────────────────────────────────────────────────────────

    // Subscribe to sale returns history (real-time)
    subscribeSaleReturns(callback) {
        const q = query(
            collection(db, SALE_RETURNS_COLLECTION),
            orderBy('createdAt', 'desc'),
            limit(100)
        );
        return onSnapshot(q, (snap) => {
            callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    },

    // Subscribe to purchase returns history (real-time)
    subscribePurchaseReturns(callback) {
        const q = query(
            collection(db, PURCHASE_RETURNS_COLLECTION),
            orderBy('createdAt', 'desc'),
            limit(100)
        );
        return onSnapshot(q, (snap) => {
            callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    },

    // Record a Sale Return and add stock back for returned items
    async addSaleReturn(returnData, options = {}) {
        if (isBrowserOffline() && !options.fromOfflineQueue) {
            return enqueueOfflineOperation('sale_return', returnData);
        }

        return await runTransaction(db, async (transaction) => {
            const returnRef = doc(collection(db, SALE_RETURNS_COLLECTION));
            const counterRef = doc(db, "metadata", "counters");
            const counterSnapshot = await transaction.get(counterRef);
            const nextReturnNumber = (counterSnapshot.exists()
                ? Number(counterSnapshot.data().saleReturnInvoiceCount || 0)
                : 0) + 1;
            const returnInvoiceId = `RET-INV-${String(nextReturnNumber).padStart(4, '0')}`;
            const adjustments = getReturnProductAdjustments(returnData.items, 1);
            const productSnapshots = new Map();

            // Read every product before writing, as required by Firestore transactions.
            for (const [productId] of adjustments) {
                const productRef = doc(db, PRODUCTS_COLLECTION, productId);
                productSnapshots.set(productId, await transaction.get(productRef));
            }

            transaction.set(returnRef, {
                ...returnData,
                returnInvoiceId,
                originalInvoiceIds: returnData.originalInvoiceIds || returnData.invoiceIds || (returnData.invoiceId ? [returnData.invoiceId] : []),
                type: 'SALE_RETURN',
                createdAt: new Date().toISOString()
            });

            for (const [productId, { item, delta }] of adjustments) {
                const productRef = doc(db, PRODUCTS_COLLECTION, productId);
                const productSnapshot = productSnapshots.get(productId);
                if (productSnapshot.exists()) {
                    transaction.update(productRef, {
                        stock: increment(delta),
                        updatedAt: new Date().toISOString()
                    });
                } else {
                    // A deleted product can still exist in old invoices. Recreate it from the invoice item.
                    transaction.set(productRef, recoveredProductData(item, delta));
                }
            }

            transaction.set(counterRef, { saleReturnInvoiceCount: nextReturnNumber }, { merge: true });

            return returnRef.id;
        });
    },

    // Record a Purchase Return and reduce stock for returned items
    async addPurchaseReturn(returnData, options = {}) {
        if (isBrowserOffline() && !options.fromOfflineQueue) {
            return enqueueOfflineOperation('purchase_return', returnData);
        }

        return await runTransaction(db, async (transaction) => {
            const returnRef = doc(collection(db, PURCHASE_RETURNS_COLLECTION));
            const counterRef = doc(db, "metadata", "counters");
            const counterSnapshot = await transaction.get(counterRef);
            const nextReturnNumber = (counterSnapshot.exists()
                ? Number(counterSnapshot.data().purchaseReturnInvoiceCount || 0)
                : 0) + 1;
            const returnInvoiceId = `RET-PUR-${String(nextReturnNumber).padStart(4, '0')}`;
            const adjustments = getReturnProductAdjustments(returnData.items, -1);
            const productSnapshots = new Map();

            for (const [productId] of adjustments) {
                const productRef = doc(db, PRODUCTS_COLLECTION, productId);
                productSnapshots.set(productId, await transaction.get(productRef));
            }

            transaction.set(returnRef, {
                ...returnData,
                returnInvoiceId,
                originalPurchaseIds: returnData.originalPurchaseIds || returnData.purchaseIds || (returnData.purchaseId ? [returnData.purchaseId] : []),
                type: 'PURCHASE_RETURN',
                createdAt: new Date().toISOString()
            });

            for (const [productId, { item, delta }] of adjustments) {
                const productRef = doc(db, PRODUCTS_COLLECTION, productId);
                const productSnapshot = productSnapshots.get(productId);
                if (productSnapshot.exists()) {
                    transaction.update(productRef, {
                        stock: increment(delta),
                        updatedAt: new Date().toISOString()
                    });
                } else {
                    // Recreate deleted historical products so the return can be recorded safely.
                    transaction.set(productRef, recoveredProductData(item, delta));
                }
            }

            transaction.set(counterRef, { purchaseReturnInvoiceCount: nextReturnNumber }, { merge: true });

            return returnRef.id;
        });
    },

    // Delete a Sale Return and roll back stock (items go back OUT of stock)
    async deleteSaleReturn(returnId, items = []) {
        await runTransaction(db, async (transaction) => {
            const adjustments = getReturnProductAdjustments(items, -1);
            const productSnapshots = new Map();
            for (const [productId] of adjustments) {
                productSnapshots.set(productId, await transaction.get(doc(db, PRODUCTS_COLLECTION, productId)));
            }

            transaction.delete(doc(db, SALE_RETURNS_COLLECTION, returnId));
            for (const [productId, { item, delta }] of adjustments) {
                const productRef = doc(db, PRODUCTS_COLLECTION, productId);
                if (productSnapshots.get(productId).exists()) {
                    transaction.update(productRef, { stock: increment(delta), updatedAt: new Date().toISOString() });
                } else {
                    transaction.set(productRef, recoveredProductData(item, delta));
                }
            }
        });
    },

    // Delete a Purchase Return and roll back stock (items come back IN to stock)
    async deletePurchaseReturn(returnId, items = []) {
        await runTransaction(db, async (transaction) => {
            const adjustments = getReturnProductAdjustments(items, 1);
            const productSnapshots = new Map();
            for (const [productId] of adjustments) {
                productSnapshots.set(productId, await transaction.get(doc(db, PRODUCTS_COLLECTION, productId)));
            }

            transaction.delete(doc(db, PURCHASE_RETURNS_COLLECTION, returnId));
            for (const [productId, { item, delta }] of adjustments) {
                const productRef = doc(db, PRODUCTS_COLLECTION, productId);
                if (productSnapshots.get(productId).exists()) {
                    transaction.update(productRef, { stock: increment(delta), updatedAt: new Date().toISOString() });
                } else {
                    transaction.set(productRef, recoveredProductData(item, delta));
                }
            }
        });
    }
};

export const firestoreService = new Proxy(firebaseService, {
    get(target, property, receiver) {
        if (getSetupConfig()?.database?.type !== 'firebase') {
            return sqlService[property];
        }
        return Reflect.get(target, property, receiver);
    }
});
