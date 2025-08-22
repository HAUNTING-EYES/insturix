interface CouponConfig {
    code: string;
    offerId: string; // Pre-defined Razorpay offer ID
    type: 'percentage' | 'flat';
    value: number; // percentage (e.g., 20 for 20%) or flat amount in INR
    description: string;
    expiryDate?: Date;
    minAmount?: number; // minimum order amount required
    maxDiscount?: number; // maximum discount amount for percentage coupons
    currency: 'INR';
    isActive: boolean;
}

export interface AppliedCoupon {
    code: string;
    offerId: string;
    discount: {
        type: 'percentage' | 'flat';
        value: number;
        amount: number; // calculated discount amount
    };
    description: string;
}

export interface CouponValidationResult {
    isValid: boolean;
    coupon?: AppliedCoupon;
    error?: string;
}

// Hardcoded coupon configurations
// TODO: Replace these offer IDs with your actual Razorpay offer IDs
const COUPON_CONFIGS: CouponConfig[] = [
    {
        code: 'WELCOME20',
        offerId: 'offer_R8VLtyV0Y8OWnk', // Updated with the actual Razorpay offer ID
        type: 'percentage',
        value: 10,
        description: '10% off on your first subscription',
        minAmount: 100,
        maxDiscount: 500,
        currency: 'INR',
        isActive: true,
    },
];

export function validateCoupon(
    code: string,
    amount: number,
    currency: string
): CouponValidationResult {
    // Only allow INR currency
    if (currency !== 'INR') {
        return {
            isValid: false,
            error: 'Coupons are only available for INR currency',
        };
    }

    // Find coupon configuration
    const couponConfig = COUPON_CONFIGS.find(
        (config) => config.code.toLowerCase() === code.toLowerCase() && config.isActive
    );

    if (!couponConfig) {
        return {
            isValid: false,
            error: 'Invalid coupon code',
        };
    }

    // Check expiry date
    if (couponConfig.expiryDate && new Date() > couponConfig.expiryDate) {
        return {
            isValid: false,
            error: 'Coupon has expired',
        };
    }

    // Check minimum amount
    if (couponConfig.minAmount && amount < couponConfig.minAmount) {
        return {
            isValid: false,
            error: `Minimum order amount of ₹${couponConfig.minAmount} required`,
        };
    }

    // Calculate discount amount
    let discountAmount: number;
    if (couponConfig.type === 'percentage') {
        discountAmount = (amount * couponConfig.value) / 100;
        // Apply maximum discount limit if specified
        if (couponConfig.maxDiscount && discountAmount > couponConfig.maxDiscount) {
            discountAmount = couponConfig.maxDiscount;
        }
    } else {
        discountAmount = couponConfig.value;
    }

    // Ensure discount doesn't exceed the total amount
    discountAmount = Math.min(discountAmount, amount);

    return {
        isValid: true,
        coupon: {
            code: couponConfig.code,
            offerId: couponConfig.offerId,
            discount: {
                type: couponConfig.type,
                value: couponConfig.value,
                amount: Math.round(discountAmount), // Round to nearest rupee
            },
            description: couponConfig.description,
        },
    };
}

export function getCouponByCode(code: string): CouponConfig | undefined {
    return COUPON_CONFIGS.find(
        (config) => config.code.toLowerCase() === code.toLowerCase() && config.isActive
    );
}