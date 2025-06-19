import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Storage } from '@google-cloud/storage';
import { logger } from '../../utils/logger';

export async function POST(request: Request) {
    const gcsCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS
        ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
        : null;
    const bucketName = process.env.ALYZITRON_GCS_BUCKET_NAME;

    if (!gcsCredentials || !bucketName) {
        logger.error("GCS environment variables are not configured.");
        return NextResponse.json({ message: 'Server configuration error: GCS credentials or bucket name missing.' }, { status: 500 });
    }

    const storage = new Storage({
        projectId: gcsCredentials.project_id,
        credentials: gcsCredentials,
    });

    const bucket = storage.bucket(bucketName);
    const { userId } = await auth(); // Await the auth() call
    if (!userId) {
        logger.warn('Unauthorized attempt to delete GCS file');
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    let gcsPath: string;
    try {
        const body = await request.json();
        gcsPath = body.gcsPath;

        if (!gcsPath || typeof gcsPath !== 'string') {
            logger.warn('Invalid request body for GCS deletion', { data: { userId, body } });
            return NextResponse.json({ message: 'Invalid request: gcsPath is required and must be a string.' }, { status: 400 });
        }

        logger.info('Attempting to delete GCS file', { data: { userId, gcsPath } });

        // Extract the object name from the full gcsPath (e.g., remove gs://bucket-name/)
        const objectName = gcsPath.startsWith(`gs://${bucketName}/`)
            ? gcsPath.substring(`gs://${bucketName}/`.length)
            : gcsPath; // Assume it's just the object name if prefix is missing

        if (!objectName) {
             logger.error('Could not extract object name from gcsPath', { data: { userId, gcsPath } });
             return NextResponse.json({ message: 'Internal server error: Invalid GCS path format.' }, { status: 500 });
        }

        await bucket.file(objectName).delete({ ignoreNotFound: true }); // ignoreNotFound prevents errors if already deleted

        logger.info('Successfully deleted GCS file', { data: { userId, gcsPath, objectName } });
        return NextResponse.json({ message: 'File deleted successfully' }, { status: 200 });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Error deleting GCS file', { data: { userId, gcsPath: gcsPath! , error: errorMessage } }); // Use non-null assertion for gcsPath in catch
        return NextResponse.json({ message: 'Failed to delete file', error: errorMessage }, { status: 500 });
    }
}