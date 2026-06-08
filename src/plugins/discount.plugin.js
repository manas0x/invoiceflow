import { BarChart as DiscountIcon } from 'lucide-react';

export const DiscountPlugin = {
    name: "Discount Engine",
    description: "Multi-level discounts, coupons, and seasonal rules.",
    icon: DiscountIcon,
    defaultEnabled: true,
    features: [
        "Item level discount",
        "Invoice level discount",
        "Coupon / promo support",
        "Auto seasonal discount rules"
    ],
    settings: {
        discountType: 'percentage', // 'flat' or 'percentage'
        maxAllowedDiscount: 2000,
        enableRuleEngine: true,
        coupons: [
            { code: 'WELCOME10', type: 'percentage', value: 10, minBill: 500 },
            { code: 'FLAT500', type: 'flat', value: 500, minBill: 5000 },
            { code: 'SEASON5', type: 'percentage', value: 5, minBill: 0 }
        ],
        seasonalRules: [
            { name: 'Kharif Special', month: 6, discount: 2 } // 2% off in July
        ]
    },
    hooks: {
        validateCoupon: (code, subtotal, settings) => {
            const coupon = (settings.coupons || []).find(c => c.code.toUpperCase() === code.toUpperCase());
            if (!coupon) return { valid: false, message: "Invalid Coupon" };
            if (subtotal < coupon.minBill) return { valid: false, message: `Min bill for this coupon is ₹${coupon.minBill}` };
            return { valid: true, coupon };
        },
        calculateDiscount: (coupon, subtotal, items) => {
            if (!coupon) return 0;
            if (coupon.type === 'atCost' && items) {
                // Calculate total cost price of all items
                const totalCost = items.reduce((acc, item) => acc + ((item.costPrice || item.price) * item.quantity), 0);
                const discount = subtotal - totalCost;
                return discount > 0 ? discount : 0;
            }
            if (coupon.type === 'percentage') {
                return (subtotal * coupon.value) / 100;
            }
            return coupon.value;
        }
    }
};
