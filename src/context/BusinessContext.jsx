import React, { createContext, useContext, useState, useEffect } from 'react';
import { appConfig as initialConfig, getAppConfig } from '../config/appConfig';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

const BusinessContext = createContext();

export const BusinessProvider = ({ children }) => {
    const [config, setConfig] = useState(initialConfig);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Local state sync first
        const local = getAppConfig();
        setConfig(local);
        setLoading(false);

        // Firestore sync for real-time updates
        const unsub = onSnapshot(doc(db, 'settings', 'store_info'), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                localStorage.setItem('invoiceflow_store_info', JSON.stringify(data));
                localStorage.setItem('invoiceflow_setup', 'true');
                
                // Refresh config object
                const updated = getAppConfig();
                setConfig(updated);
            }
        });

        return () => unsub();
    }, []);

    const value = {
        ...config,
        refresh: () => setConfig(getAppConfig())
    };

    return (
        <BusinessContext.Provider value={value}>
            {!loading && children}
        </BusinessContext.Provider>
    );
};

export const useBusiness = () => {
    const context = useContext(BusinessContext);
    if (!context) {
        throw new Error('useBusiness must be used within a BusinessProvider');
    }
    return context;
};
