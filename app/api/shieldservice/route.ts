import { NextResponse, type NextRequest } from "next/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import Contact from "@/schemas/Shield";

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase(process.env.MONGODB_URI as string);
    const body = await request.json();
    const { name, email, subject, message } = body;
    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    const shield = new Contact({
      name,
      email,
      subject,
      message,
    });
    await shield.save();
    return NextResponse.json(
      { success: true, message: "Contact form submitted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error processing Shield contact form:", error);
    return NextResponse.json(
      { error: "Failed to process Shield contact form" },
      { status: 500 }
    );
  }
}
