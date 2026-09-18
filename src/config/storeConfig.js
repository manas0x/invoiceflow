export const DEFAULT_STORE_NAME = 'InvoiceFlow';
export const DEFAULT_STORE_PROFILE = {
    storeName: DEFAULT_STORE_NAME,
    tagline: 'Billing, inventory and customer management',
    address: '',
    phone: ''
};

const STORE_NAME_CACHE_KEY = 'invoiceflow_store_name';
const STORE_PROFILE_CACHE_KEY = 'invoiceflow_store_profile';
const LEGACY_TAGLINE = 'Fertilizers, Pesticides & Seeds Retailer';
const LEGACY_ADDRESS = 'Subhasnagar Road, Bakhpur, Nainital, Uttarakhand 263148';

export const getCachedStoreName = () => {
    if (typeof window === 'undefined') return DEFAULT_STORE_NAME;
    return window.localStorage.getItem(STORE_NAME_CACHE_KEY) || DEFAULT_STORE_NAME;
};

export const cacheStoreName = (name) => {
    const normalizedName = name?.trim() || DEFAULT_STORE_NAME;
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORE_NAME_CACHE_KEY, normalizedName);
    }
    return normalizedName;
};

export const getCachedStoreProfile = () => {
    if (typeof window === 'undefined') return DEFAULT_STORE_PROFILE;
    try {
        const cached = JSON.parse(window.localStorage.getItem(STORE_PROFILE_CACHE_KEY) || 'null');
        if (!cached) return DEFAULT_STORE_PROFILE;
        const profile = { ...DEFAULT_STORE_PROFILE, ...cached };
        if (profile.tagline === LEGACY_TAGLINE) profile.tagline = DEFAULT_STORE_PROFILE.tagline;
        if (profile.address === LEGACY_ADDRESS) profile.address = DEFAULT_STORE_PROFILE.address;
        return profile;
    } catch {
        return DEFAULT_STORE_PROFILE;
    }
};

export const cacheStoreProfile = (profile) => {
    const normalizedProfile = {
        ...DEFAULT_STORE_PROFILE,
        ...profile,
        storeName: profile?.storeName?.trim() || DEFAULT_STORE_NAME,
        tagline: profile?.tagline?.trim() || DEFAULT_STORE_PROFILE.tagline,
        address: profile?.address?.trim() || DEFAULT_STORE_PROFILE.address,
        phone: profile?.phone?.trim() || DEFAULT_STORE_PROFILE.phone
    };
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORE_PROFILE_CACHE_KEY, JSON.stringify(normalizedProfile));
        window.localStorage.setItem(STORE_NAME_CACHE_KEY, normalizedProfile.storeName);
    }
    return normalizedProfile;
};
