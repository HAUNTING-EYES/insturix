import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import UploaderX from "@/schemas/uploaderx";

export async function PATCH(
    request: Request,
    props: { params: Promise<{ uuid: string }> }
) {
    try {
        const params = await props.params;
        const { uuid } = params;

        console.log("📝 PATCH Metadata Request for UUID:", uuid);

        const session = await auth();
        if (!session?.userId) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const { metadata } = await request.json();
        console.log("📄 PATCH API Received Metadata:", JSON.stringify(metadata, null, 2));

        if (!uuid) {
            return NextResponse.json({ success: false, error: "Missing video UUID" }, { status: 400 });
        }

        await connectToDatabase();

        const video = await UploaderX.findOne({
            userId: session.userId,
            videoUuid: uuid
        });

        if (!video) {
            return NextResponse.json({ success: false, error: "Video not found" }, { status: 404 });
        }

        // Update metadata using $set to allow partial updates if needed, or just replace it
        // Using deep merge or just simple replacement. For now simple replacement of the metadata object or specific fields.
        // Given the UI sends the whole structure, we can just save it.

        // Ensure metadata is an object
        if (typeof metadata !== 'object') {
            return NextResponse.json({ success: false, error: "Invalid metadata format" }, { status: 400 });
        }

        // We can merge existing metadata with new metadata
        video.metadata = { ...video.metadata, ...metadata };

        // Also update top-level fields if they are in metadata (optional but good for consistency if we wanted to sync them)
        // For now, we just store in metadata field as planned.

        await video.save();

        return NextResponse.json({
            success: true,
            message: "Metadata updated successfully",
            video,
        });
    } catch (error: any) {
        console.error("❌ Error updating metadata:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
