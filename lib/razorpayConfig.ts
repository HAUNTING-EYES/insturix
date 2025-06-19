// Razorpay currency support and configuration
export const RAZORPAY_SUPPORTED_CURRENCIES = [
  "USD", "EUR", "GBP", "INR", "AUD", "CAD", "SGD", "AED"
];

export const CURRENCY_PAYMENT_METHODS = {
  USD: {
    card: true,
    netbanking: false,
    wallet: [],
    upi: false,
    international: true
  },
  EUR: {
    card: true,
    netbanking: false,
    wallet: [],
    upi: false,
    international: true
  },
  GBP: {
    card: true,
    netbanking: false,
    wallet: [],
    upi: false,
    international: true
  },
  INR: {
    card: true,
    netbanking: true,
    wallet: ["paytm", "phonepe", "googlepay"],
    upi: true,
    international: false
  },
  AUD: {
    card: true,
    netbanking: false,
    wallet: [],
    upi: false,
    international: true
  },
  CAD: {
    card: true,
    netbanking: false,
    wallet: [],
    upi: false,
    international: true
  },
  SGD: {
    card: true,
    netbanking: false,
    wallet: [],
    upi: false,
    international: true
  },
  AED: {
    card: true,
    netbanking: false,
    wallet: [],
    upi: false,
    international: true
  }
};

export function getRazorpayOptions(
  orderId: string,
  amount: number,
  currency: string,
  userDetails: { name?: string; email?: string },
  planName: string
): any {
  // Only use supported currencies, fallback to USD if not supported
  const effectiveCurrency = RAZORPAY_SUPPORTED_CURRENCIES.includes(currency) ? currency : "USD";
  const paymentMethods = CURRENCY_PAYMENT_METHODS[effectiveCurrency as keyof typeof CURRENCY_PAYMENT_METHODS];

  return {
    key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    amount,
    currency: effectiveCurrency,
    name: "Insturix",
    description: `${planName} Plan Subscription`,
    order_id: orderId,
    prefill: {
      name: userDetails.name || "",
      email: userDetails.email || "",
    },
    theme: {
      color: "#8b5cf6",
    },
    method: {
      card: paymentMethods?.card || true,
      netbanking: paymentMethods?.netbanking || false,
      wallet: paymentMethods?.wallet || [],
      upi: paymentMethods?.upi || false,
    },
    allow_rotation: true,
    remember_customer: false,
    readonly: {
      email: true,
      name: false,
    },
    modal: {
      confirm_close: true,
      ondismiss: function () {
        // This will be overridden in the PaymentForm component
        console.log("Payment modal dismissed");
      },
    },
    retry: {
      enabled: true,
      max_count: 3,
    },
    timeout: 300, // 5 minutes
    notes: {
      plan: planName,
      currency: currency,
      originalCurrency: currency !== effectiveCurrency ? currency : undefined,
    },
  };
}

export function convertCurrencyForRazorpay(amount: number, fromCurrency: string): { amount: number; currency: string } {
  // Since we only support Razorpay currencies, no conversion needed
  // Note: The API route already converts to smallest currency unit (paise/cents)
  if (RAZORPAY_SUPPORTED_CURRENCIES.includes(fromCurrency)) {
    return {
      amount: amount,
      currency: fromCurrency
    };
  }

  // Fallback to USD if currency not supported
  console.warn(`Currency ${fromCurrency} not supported by Razorpay, falling back to USD`);
  return {
    amount: amount,
    currency: "USD"
  };
}