import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { logger } from '../../utils/logger';
import { AlyzitronR2Manager } from '../../utils/r2-manager';
import { getCollections } from '../../utils/mongodb';
import {
    AlyzitronStorageOwnershipError,
    requireAlyzitronOwnedStorageKey,
} from '../../utils/storage-ownership';

export async function POST(request: Request) {
    const { userId } = await auth();
    if (!userId) {
        logger.warn('Unauthorized attempt to delete storage file');
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    let storageKey: string;
    try {
        const body = await request.json();
        // Accept new `storageKey` and legacy field names
        storageKey = body.storageKey || body.storagePath || body.gcsPath;

        if (!storageKey || typeof storageKey !== 'string') {
            logger.warn('Invalid request body for storage deletion', { data: { userId, body } });
            return NextResponse.json({ message: 'Invalid request: storageKey is required and must be a string.' }, { status: 400 });
        }
    } catch {
        return NextResponse.json({ message: 'Invalid request body' }, { status: 400 });
    }

    try {
        storageKey = requireAlyzitronOwnedStorageKey(userId, storageKey);
        const { uploadTracking } = await getCollections();
        const uploadRecord = await uploadTracking.findOne({
            userId,
            $or: [{ storageKey }, { storagePath: storageKey }, { gcsPath: storageKey }],
        });

        if (!uploadRecord) {
            logger.warn('Blocked deletion for untracked or foreign storage key', { data: { userId, storageKey } });
            return NextResponse.json({ message: 'Storage file not found' }, { status: 404 });
        }

        await AlyzitronR2Manager.deleteFromR2(storageKey);
        logger.info('Successfully deleted R2 file', { data: { userId, storageKey } });
        return NextResponse.json({ message: 'File deleted successfully' }, { status: 200 });
    } catch (error) {
        if (error instanceof AlyzitronStorageOwnershipError) {
            return NextResponse.json({ message: error.message }, { status: error.status });
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Error deleting R2 file', { data: { userId, storageKey, error: errorMessage } });
        return NextResponse.json({ message: 'Failed to delete file', error: errorMessage }, { status: 500 });
    }
}
