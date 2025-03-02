import { NextResponse, type NextRequest } from "next/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import Newsletter from "@/schemas/NewsLetter";

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase(process.env.NEWSLETTER_DB as string);
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    const newNewsletter = new Newsletter({ email });
    await newNewsletter.save();
    return NextResponse.json(
      {
        success: true,
        message: "Newsletter subscription submitted successfully",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error processing newsletter subscription:", error);
    return NextResponse.json(
      { error: "Failed to process newsletter subscription" },
      { status: 500 }
    );
  }
}
