import { NextResponse, type NextRequest } from "next/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import Contact from "@/schemas/ContactSchema";

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase(process.env.CONTACT_DB as string);

    const body = await request.json();
    const { name, email, subject, message } = body;

    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    const newContact = new Contact({
      name,
      email,
      subject,
      message,
    });
    await newContact.save();
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