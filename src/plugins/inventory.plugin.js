import { Zap as InventoryIcon } from 'lucide-react';

export const InventoryPlugin = {
    name: "Inventory Sync",
    description: "Automated stock tracking and alerts.",
    icon: InventoryIcon,
    defaultEnabled: true,
    features: [
        "Auto stock reduce on invoice",
        "Low stock alerts",
        "Batch / serial tracking"
    ],
    settings: {
        enableTracking: true,
        alertThreshold: 5,
        autoReorderTrigger: false
    }
};
