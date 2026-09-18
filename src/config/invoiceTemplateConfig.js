import { getCachedStoreProfile } from './storeConfig';

const DEFAULT_STORE_PROFILE = getCachedStoreProfile();

export const DEFAULT_INVOICE_TEMPLATE_SETTINGS = {
    template: 'classic',
    sellerName: DEFAULT_STORE_PROFILE.storeName,
    sellerTagline: DEFAULT_STORE_PROFILE.tagline,
    sellerAddress: DEFAULT_STORE_PROFILE.address,
    sellerPhone: DEFAULT_STORE_PROFILE.phone,
    sellerEmail: '',
    sellerGstin: '',
    sellerState: 'Uttarakhand',
    sellerStateCode: '05',
    sellerLicenseNo: '',
    invoiceTitle: 'RETAIL INVOICE',
    dispatchDocumentNo: '',
    dispatchedThrough: '',
    destination: '',
    termsOfDelivery: '',
    paymentBankName: '',
    paymentAccountName: '',
    paymentAccountNumber: '',
    paymentIfscCode: '',
    paymentUpiId: '',
    thermalPrinterEnabled: false
};

const CACHE_KEY = 'invoiceflow_invoice_template_settings';
let currentSettings = DEFAULT_INVOICE_TEMPLATE_SETTINGS;
const normalizeStateName = (value) => {
    const state = value?.trim() || DEFAULT_INVOICE_TEMPLATE_SETTINGS.sellerState;
    return state.toLowerCase() === 'uttarakhan' ? 'Uttarakhand' : state;
};

const normalizeSettings = (settings = {}) => ({
    ...DEFAULT_INVOICE_TEMPLATE_SETTINGS,
    ...settings,
    template: settings.template === 'retail' ? 'retail' : 'classic',
    sellerName: settings.sellerName?.trim() || DEFAULT_INVOICE_TEMPLATE_SETTINGS.sellerName,
    sellerTagline: settings.sellerTagline?.trim() || DEFAULT_INVOICE_TEMPLATE_SETTINGS.sellerTagline,
    sellerAddress: settings.sellerAddress?.trim() || DEFAULT_INVOICE_TEMPLATE_SETTINGS.sellerAddress,
    sellerPhone: settings.sellerPhone?.trim() || DEFAULT_INVOICE_TEMPLATE_SETTINGS.sellerPhone,
    sellerEmail: settings.sellerEmail?.trim() || '',
    sellerGstin: settings.sellerGstin?.trim().toUpperCase() || '',
    sellerState: normalizeStateName(settings.sellerState),
    sellerStateCode: settings.sellerStateCode?.trim() || DEFAULT_INVOICE_TEMPLATE_SETTINGS.sellerStateCode,
    sellerLicenseNo: settings.sellerLicenseNo?.trim() || '',
    invoiceTitle: settings.invoiceTitle?.trim() || DEFAULT_INVOICE_TEMPLATE_SETTINGS.invoiceTitle,
    dispatchDocumentNo: settings.dispatchDocumentNo?.trim() || '',
    dispatchedThrough: settings.dispatchedThrough?.trim() || '',
    destination: settings.destination?.trim() || '',
    termsOfDelivery: settings.termsOfDelivery?.trim() || '',
    paymentBankName: settings.paymentBankName?.trim() || '',
    paymentAccountName: settings.paymentAccountName?.trim() || '',
    paymentAccountNumber: settings.paymentAccountNumber?.trim() || '',
    paymentIfscCode: settings.paymentIfscCode?.trim().toUpperCase() || '',
    paymentUpiId: settings.paymentUpiId?.trim() || '',
    thermalPrinterEnabled: settings.thermalPrinterEnabled === true
});

if (typeof window !== 'undefined') {
    try {
        currentSettings = normalizeSettings(JSON.parse(window.localStorage.getItem(CACHE_KEY) || '{}'));
    } catch {
        currentSettings = DEFAULT_INVOICE_TEMPLATE_SETTINGS;
    }
}

export const getInvoiceTemplateSettings = () => currentSettings;

export const cacheInvoiceTemplateSettings = (settings) => {
    currentSettings = normalizeSettings(settings);
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(currentSettings));
    }
    return currentSettings;
};

