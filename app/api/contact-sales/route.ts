import { NextResponse, type NextRequest } from "next/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import ContactSales from "@/schemas/ContactSalesSchema";

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();

    const body = await request.json();
    const { name, email, companyName, phone, companySize, message } = body;

    if (!name || !email || !companyName || !message) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const newContactSales = new ContactSales({
      name,
      email,
      companyName,
      phone,
      companySize,
      message,
    });

    await newContactSales.save();

    return NextResponse.json(
      { success: true, message: "Contact sales form submitted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error processing contact sales form:", error);
    return NextResponse.json(
      { error: "Failed to process contact sales form" },
      { status: 500 }
    );
  }
}

