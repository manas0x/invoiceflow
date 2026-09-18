import React, { useState, useEffect } from 'react';
import { Store, Package, CheckCircle, XCircle } from 'lucide-react';
import { firestoreService } from '../services/firestoreService';
import { getCachedStoreName } from '../config/storeConfig';

const ShopCatalog = () => {
    const [isEnabled, setIsEnabled] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [products, setProducts] = useState([]);
    const [productImages, setProductImages] = useState({});

    useEffect(() => {
        const fetchShopData = async () => {
            try {
                // 1. Check if shop is enabled (public read allowed in rules)
                const settings = await firestoreService.getAppSettings('public_shop');
                const enabled = Boolean(settings?.enabled);
                setIsEnabled(enabled);

                if (enabled) {
                    // 2. Fetch products
                    setProducts(await firestoreService.getProducts());
                }
            } catch (error) {
                console.error("Failed to load shop data:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchShopData();
    }, []);

    // Fetch product images from Pixabay (free, public, no CORS issues)
    useEffect(() => {
        if (!isEnabled || products.length === 0) return;

        const PIXABAY_KEY = import.meta.env.VITE_PIXABAY_API_KEY;

        const fetchImages = async () => {
            const newImages = { ...productImages };
            let updated = false;

            await Promise.allSettled(products.map(async (product) => {
                if (newImages[product.id]) return;

                try {
                    // Build query: product name + category for better results
                    const q = encodeURIComponent((product.category || '') + ' ' + product.name + ' product');
                    const url = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${q}&image_type=photo&per_page=3&safesearch=true`;
                    const res = await fetch(url);
                    if (!res.ok) throw new Error(`Pixabay error: ${res.status}`);
                    const data = await res.json();

                    if (data.hits && data.hits.length > 0) {
                        newImages[product.id] = data.hits[0].webformatURL;
                        updated = true;
                    }
                } catch (error) {
                    console.error("Failed to fetch image for", product.name, error);
                }
            }));

            if (updated) {
                setProductImages(prev => ({ ...prev, ...newImages }));
            }
        };

        fetchImages();
    }, [isEnabled, products]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
                <Store size={48} className="text-gray-300 animate-pulse mb-4" />
                <p className="text-gray-500 font-medium">Loading Catalog...</p>
            </div>
        );
    }

    if (!isEnabled) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 text-center">
                <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mb-6">
                    <Store size={36} className="text-gray-400" />
                </div>
                <h1 className="text-2xl font-bold text-gray-800 mb-2">Store is Currently Closed</h1>
                <p className="text-gray-500 max-w-sm">
                    Our digital catalog is currently disabled. Please check back later or contact the administrator.
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[#2d6a4f]">
                        <Store size={24} />
                        <h1 className="text-xl font-bold">{getCachedStoreName()}</h1>
                    </div>
                </div>
            </header>

            {/* Catalog Grid */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
                <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">Product Catalog</h2>
                        <p className="text-gray-500 mt-1">Browse our available inventory.</p>
                    </div>
                </div>

                {products.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
                        <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                        <h3 className="text-lg font-medium text-gray-900">No Products Available</h3>
                        <p className="mt-1 text-gray-500">The store currently has no products listed.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {products.map((product) => {
                            const inStock = product.stock > 0;
                            return (
                                <div key={product.id} className={`group bg-white rounded-2xl border transition-all hover:shadow-lg overflow-hidden flex flex-col ${inStock ? 'border-gray-200 hover:border-emerald-500/30' : 'border-gray-200 opacity-80'}`}>
                                    <div className="w-full h-48 bg-gray-50 flex flex-col items-center justify-center overflow-hidden border-b border-gray-100 relative">
                                        {productImages[product.id] ? (
                                            <img
                                                src={productImages[product.id]}
                                                alt={product.name}
                                                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                            />
                                        ) : (
                                            <div className="flex flex-col items-center justify-center gap-2 z-10 transition-transform group-hover:scale-105">
                                                <Package className="text-gray-300 w-14 h-14" />
                                            </div>
                                        )}
                                        {!productImages[product.id] && <div className="absolute inset-0 bg-gradient-to-t from-gray-100 to-transparent opacity-50"></div>}
                                    </div>

                                    <div className="p-6">
                                        <div className="flex items-start justify-between gap-4 mb-4">
                                            <div className="flex shrink-0">
                                                {inStock ? (
                                                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-xs font-bold border border-green-100">
                                                        <CheckCircle size={12} />
                                                        In Stock
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-xs font-bold border border-red-100">
                                                        <XCircle size={12} />
                                                        Out of Stock
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <h3 className="text-lg font-bold text-gray-900 mb-1 leading-tight line-clamp-2">
                                            {product.name}
                                        </h3>
                                        <p className="text-sm text-gray-500 mb-4 flex items-center gap-1.5">
                                            <span>{product.category || 'General'}</span>
                                            <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                            <span>{product.unit || 'Piece'}</span>
                                        </p>

                                    </div>
                                    <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                                        <div className="flex items-baseline gap-1">
                                            {/* Hide price, show quantity */}
                                            {inStock ? (
                                                <span className="font-bold text-gray-900 text-sm">
                                                    Qty: {Math.floor(product.stock)}
                                                </span>
                                            ) : (
                                                <span className="text-sm font-medium text-gray-500 italic">Check later</span>
                                            )}
                                        </div>
                                        {inStock && <span className="text-[10px] text-gray-400 font-medium tracking-wider uppercase">Available</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
};

export default ShopCatalog;
