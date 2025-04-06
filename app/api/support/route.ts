import { NextResponse, type NextRequest } from "next/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import Support from "@/schemas/SupportSchema";

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase(process.env.MONGODB_URI as string);

    const body = await request.json();
    const {
      FullName,
      email,
      OrganizationName,
      Help,
      message,
      telephone,
      budget,
    } = body;

    if (
      !FullName ||
      !email ||
      !OrganizationName ||
      !Help ||
      !message ||
      !telephone ||
      !budget
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const support = new Support({
      FullName,
      email,
      OrganizationName,
      Help,
      message,
      telephone,
      budget,
    });

    await support.save();

    return NextResponse.json(
      { success: true, message: "Contact form submitted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error processing contact form:", error);
    return NextResponse.json(
      { error: "Failed to process contact form" },
      { status: 500 }
    );
  }
}
