import 'dotenv/config';
import mongoose from 'mongoose';
import connectToDatabase from '../schemas/ConnectToDatabase';
import Plan from '../schemas/plans';
import { getPlanLimits, UNIFIED_SERVICE_LIMITS } from '../lib/config/serviceLimits';

async function fixFreePlan() {
    try {
        console.log('Connecting to database...');
        await connectToDatabase();
        console.log('Connected.');

        console.log('Fetching Free plan...');
        let freePlan = await Plan.findOne({ type: 'free' });

        const allServiceLimits: any = {};
        Object.keys(UNIFIED_SERVICE_LIMITS).forEach(serviceName => {
            const serviceLimits = getPlanLimits(serviceName, 'free', false);
            allServiceLimits[serviceName] = serviceLimits;
        });

        if (!freePlan) {
            console.log('Free plan not found. Creating it...');
            freePlan = new Plan({
                name: 'Free Plan',
                type: 'free',
                description: 'Basic features for getting started',
                serviceLimits: allServiceLimits,
                pricing: {
                    USD: { monthly: { amount: 0, currency: 'USD', symbol: '$' }, yearly: { amount: 0, currency: 'USD', symbol: '$' } },
                    INR: { monthly: { amount: 0, currency: 'INR', symbol: '₹' }, yearly: { amount: 0, currency: 'INR', symbol: '₹' } },
                    EUR: { monthly: { amount: 0, currency: 'EUR', symbol: '€' }, yearly: { amount: 0, currency: 'EUR', symbol: '€' } },
                    GBP: { monthly: { amount: 0, currency: 'GBP', symbol: '£' }, yearly: { amount: 0, currency: 'GBP', symbol: '£' } },
                    CAD: { monthly: { amount: 0, currency: 'CAD', symbol: 'C$' }, yearly: { amount: 0, currency: 'CAD', symbol: 'C$' } },
                    AUD: { monthly: { amount: 0, currency: 'AUD', symbol: 'A$' }, yearly: { amount: 0, currency: 'AUD', symbol: 'A$' } },
                    SGD: { monthly: { amount: 0, currency: 'SGD', symbol: 'S$' }, yearly: { amount: 0, currency: 'SGD', symbol: 'S$' } },
                    AED: { monthly: { amount: 0, currency: 'AED', symbol: 'د.إ' }, yearly: { amount: 0, currency: 'AED', symbol: 'د.إ' } },
                },
                isActive: true,
                sortOrder: 1,
            });
        } else {
            console.log('Free plan found. Updating serviceLimits...');
            freePlan.serviceLimits = allServiceLimits;
            freePlan.isActive = true;
        }

        await freePlan.save();
        console.log('✅ Free plan fixed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Failed to fix Free plan:', error);
        process.exit(1);
    }
}

fixFreePlan();
