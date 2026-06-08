import { Award } from 'lucide-react';

export const LoyaltyPlugin = {
    name: 'Loyalty Program',
    description: 'Reward customers with points for every purchase.',
    icon: Award,
    defaultEnabled: false,
    settings: {
        pointsPerCurrency: 1, // 1 point for every 1 currency unit
        redemptionValue: 0.1, // 1 point = 0.1 currency units
        minPointsToRedeem: 100
    },
    features: [
        'Points Accumulation',
        'Wallet Balance Tracking',
        'Points Redemption'
    ],
    hooks: {
        calculatePoints: (amount, settings) => {
            return Math.floor(amount * settings.pointsPerCurrency);
        }
    }
};
