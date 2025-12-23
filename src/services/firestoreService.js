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
    writeBatch,
    runTransaction,
    deleteDoc
} from "firebase/firestore";
import { db } from "../firebase";
import { backupToSheet } from "./sheetService";

const PRODUCTS_COLLECTION = "products";
const PURCHASES_COLLECTION = "purchases";
const INVOICES_COLLECTION = "invoices";
const CUSTOMERS_COLLECTION = "customers";
const SUPPLIERS_COLLECTION = "suppliers";

export const firestoreService = {
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

        // Backup Product Update
        backupToSheet({ ...updates, id, type: 'PRODUCT_UPDATE' }, 'PRODUCT').catch(console.error);
    },

    async deleteProduct(id) {
        await deleteDoc(doc(db, PRODUCTS_COLLECTION, id));

        // Backup Product Deletion
        backupToSheet({ id, type: 'PRODUCT_DELETE' }, 'DELETE_PRODUCT').catch(console.error);
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

        // Backup Customer to Sheet
        backupToSheet({ ...customerData, id }, 'CUSTOMER').catch(console.error);

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

    // Purchases
    async addPurchase(purchaseData) {
        const batch = writeBatch(db);

        // 1. Add Purchase Record
        const purchaseRef = doc(collection(db, PURCHASES_COLLECTION));
        batch.set(purchaseRef, {
            ...purchaseData,
            createdAt: new Date().toISOString()
        });

        // 2. Update Product Stocks / Add New Products
        purchaseData.items.forEach(item => {
            const productRef = item.id ? doc(db, PRODUCTS_COLLECTION, item.id) : doc(collection(db, PRODUCTS_COLLECTION));

            if (item.id) {
                // Existing Product: Update stock, price and GST
                batch.update(productRef, {
                    stock: increment(Number(item.quantity)),
                    purchasePrice: Number(item.purchasePrice),
                    gst: Number(item.gst || 5),
                    updatedAt: new Date().toISOString()
                });
            } else {
                // New Product: Create document
                batch.set(productRef, {
                    name: item.name,
                    category: item.category || 'Fertilizer',
                    unit: item.unit || 'Bag',
                    gst: Number(item.gst || 5),
                    purchasePrice: Number(item.purchasePrice),
                    stock: Number(item.quantity),
                    minStock: 10,
                    createdAt: new Date().toISOString()
                });
            }
        });

        // 3. Save/Update Supplier Info
        if (purchaseData.supplierName) {
            const supplierRef = doc(db, SUPPLIERS_COLLECTION, purchaseData.supplierName.trim().replace(/\s+/g, '_').toLowerCase());
            batch.set(supplierRef, {
                name: purchaseData.supplierName,
                updatedAt: new Date().toISOString()
            }, { merge: true });
        }

        await batch.commit();

        // Backup to Google Sheet (Fire and forget, don't await blocking user)
        backupToSheet(purchaseData, 'PURCHASE').catch(err => console.error("Sheet Backup Error:", err));

        return purchaseRef.id;
    },

    async updatePurchase(purchaseId, updatedData) {
        await runTransaction(db, async (transaction) => {
            const purchaseRef = doc(db, PURCHASES_COLLECTION, purchaseId);
            const purchaseDoc = await transaction.get(purchaseRef);

            if (!purchaseDoc.exists()) throw new Error("Purchase does not exist!");

            const oldData = purchaseDoc.data();

            // 1. Revert Old Stock (Decrease)
            for (const item of oldData.items) {
                if (item.id) {
                    const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
                    transaction.update(productRef, {
                        stock: increment(-Number(item.quantity))
                    });
                }
            }

            // 2. Apply New Stock (Increase)
            for (const item of updatedData.items) {
                if (item.id) {
                    const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
                    transaction.update(productRef, {
                        stock: increment(Number(item.quantity)),
                        purchasePrice: Number(item.purchasePrice),
                        updatedAt: new Date().toISOString()
                    });
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

        // Backup Update
        backupToSheet({ ...updatedData, id: purchaseId, type: 'PURCHASE_UPDATE' }, 'PURCHASE').catch(console.error);
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

        // Backup Deletion Event
        backupToSheet({ id: purchaseId, date: new Date().toISOString() }, 'DELETE_PURCHASE').catch(console.error);
    },

    async getPurchases() {
        const querySnapshot = await getDocs(collection(db, PURCHASES_COLLECTION));
        return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.data().id || doc.id, docId: doc.id }));
    },

    // Invoices (Sales)
    async addInvoice(invoiceData) {
        const invoiceId = await runTransaction(db, async (transaction) => {
            // 1. Get current counter
            const counterRef = doc(db, "metadata", "counters");
            const counterDoc = await transaction.get(counterRef);

            let nextId = 1;
            if (counterDoc.exists()) {
                nextId = (counterDoc.data().invoiceCount || 0) + 1;
            }

            const formattedId = `INV-${String(nextId).padStart(4, '0')}`;

            // 2. Add Invoice Record
            const invoiceRef = doc(collection(db, INVOICES_COLLECTION));
            transaction.set(invoiceRef, {
                ...invoiceData,
                id: formattedId,
                createdAt: new Date().toISOString()
            });

            // 3. Update Product Stocks
            invoiceData.items.forEach(item => {
                const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
                transaction.update(productRef, {
                    stock: increment(-Number(item.quantity)),
                    updatedAt: new Date().toISOString()
                });
            });

            // 4. Update Counter
            transaction.set(counterRef, { invoiceCount: nextId }, { merge: true });

            // 5. Save/Update Customer Info
            const customerId = invoiceData.customerPhone || invoiceData.customerName.trim().replace(/\s+/g, '_').toLowerCase();
            const customerRef = doc(db, CUSTOMERS_COLLECTION, customerId);
            transaction.set(customerRef, {
                name: invoiceData.customerName,
                phone: invoiceData.customerPhone || '',
                address: invoiceData.customerAddress || '',
                lastVisit: new Date().toISOString()
            }, { merge: true });

            return formattedId;
        });

        // Backup Invoice (Sale) to Sheet
        const fullInvoiceData = { ...invoiceData, id: invoiceId };
        backupToSheet(fullInvoiceData, 'SALE').catch(err => console.error("Sheet Backup Error:", err));

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
                    transaction.update(productRef, {
                        stock: increment(Number(item.quantity))
                    });
                }
            }

            // 2. Apply New Stock (Decrease)
            for (const item of updatedData.items) {
                if (item.id) {
                    const productRef = doc(db, PRODUCTS_COLLECTION, item.id);
                    transaction.update(productRef, {
                        stock: increment(-Number(item.quantity))
                    });
                }
            }

            // 3. Update Invoice
            transaction.update(invoiceRef, {
                ...updatedData,
                updatedAt: new Date().toISOString()
            });
        });

        // Backup Update
        backupToSheet({ ...updatedData, id: docId, date: new Date().toISOString() }, 'SALE_UPDATE').catch(console.error);
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
                    transaction.update(productRef, {
                        stock: increment(Number(item.quantity)),
                        updatedAt: new Date().toISOString()
                    });
                }
            }

            transaction.delete(invoiceRef);
        });

        // Backup Deletion Event
        backupToSheet({ id: invoiceId, date: new Date().toISOString() }, 'DELETE_SALE').catch(console.error);
    },

    subscribeInvoices(callback) {
        return onSnapshot(collection(db, INVOICES_COLLECTION), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.data().id || doc.id, docId: doc.id }));
            callback(data);
        });
    },

    async getInvoices() {
        const querySnapshot = await getDocs(collection(db, INVOICES_COLLECTION));
        return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.data().id || doc.id, docId: doc.id }));
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

        // Backup Supplier to Sheet
        backupToSheet({ ...supplierData, id }, 'SUPPLIER').catch(console.error);

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
    }
};
