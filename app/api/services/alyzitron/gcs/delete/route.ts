import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Storage } from '@google-cloud/storage';
import { logger } from '../../utils/logger';

const storage = new Storage({
    projectId: process.env.GCP_PROJECT_ID,
    credentials: {
        client_email: process.env.GCP_CLIENT_EMAIL,
        private_key: process.env.GCP_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
});

const bucketName = process.env.GCS_BUCKET_NAME;

if (!bucketName) {
    logger.error("GCS_BUCKET_NAME environment variable is not set.");
    throw new Error("Server configuration error: GCS bucket name missing.");
}

const bucket = storage.bucket(bucketName);

export async function POST(request: Request) {
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