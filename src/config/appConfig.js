import { getTerm } from '../utils/terminology';

export const getAppConfig = () => {
    try {
        const stored = localStorage.getItem('invoiceflow_store_info');
        if (stored) {
            const parsed = JSON.parse(stored);
            const businessMode = parsed.businessType || parsed.businessMode || "retail";
            return {
                appName: parsed.shopName || "POS System",
                storeType: parsed.storeType || parsed.businessType || "General Store",
                businessMode: businessMode,
                ownerName: parsed.ownerName || "",
                version: "1.0.0",
                address: parsed.address || "",
                contact: parsed.phone || "",
                currency: parsed.currency || "₹",
                theme: parsed.theme || "emerald",
                integrations: parsed.activeIntegrations || [],
                getTerm: (key) => getTerm(businessMode, key)
            };
        }
    } catch(e) {
        console.error("Error loading app config:", e);
    }

    return {
        appName: "POS System",
        storeType: "General Store",
        businessMode: "retail",
        version: "1.0.0",
        address: "",
        contact: "",
        currency: "₹",
        theme: "emerald",
        integrations: [],
        getTerm: (key) => getTerm("retail", key)
    };
};

export const appConfig = getAppConfig();

