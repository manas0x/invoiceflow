import { Globe as PaymentIcon } from 'lucide-react';

export const PaymentPlugin = {
    name: "Payment Gateway",
    description: "Online payment integration & partial payments.",
    icon: PaymentIcon,
    defaultEnabled: false,
    features: [
        "Razorpay / Stripe integration",
        "Partial payment support",
        "Online payment receipts",
        "Payment status webhook sync"
    ],
    settings: {
        apiKey: '',
        sandboxMode: true,
        enableRazorpay: true,
        enableStripe: false
    }
};
