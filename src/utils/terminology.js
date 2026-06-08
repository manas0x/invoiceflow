const terminology = {
    restaurant: {
        products: "Menu Items",
        orders: "Food Orders",
        kitchen: "KDS",
        inventory: "Stock",
        billing: "Dine-in / Takeaway",
        categories: "Cuisines / Sections",
        customers: "Guests",
        suppliers: "Vendors"
    },
    retail: {
        products: "Products",
        orders: "Sales",
        kitchen: "Service",
        inventory: "Inventory",
        billing: "Billing",
        categories: "Categories",
        customers: "Customers",
        suppliers: "Suppliers"
    },
    pharmacy: {
        products: "Medicines",
        orders: "Prescriptions",
        kitchen: "Lab",
        inventory: "Medicine Stock",
        billing: "Dispensing",
        categories: "Medicine Types",
        customers: "Patients",
        suppliers: "Wholesalers"
    },
    grocery: {
        products: "Items",
        orders: "Sales",
        kitchen: "Delivery",
        inventory: "Stock",
        billing: "Counter Billing",
        categories: "Departments",
        customers: "Customers",
        suppliers: "Suppliers"
    },
    default: {
        products: "Products",
        orders: "Orders",
        kitchen: "Operations",
        inventory: "Stock",
        billing: "Billing",
        categories: "Categories",
        customers: "Customers",
        suppliers: "Suppliers"
    }
};

export const getTerm = (businessType, key) => {
    const type = businessType?.toLowerCase() || 'default';
    const terms = terminology[type] || terminology.default;
    return terms[key] || terminology.default[key] || key;
};

export default terminology;
