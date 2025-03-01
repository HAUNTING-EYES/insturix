import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      FullName,
      email,
      OrganizationName,
      Help,
      message,
      telephone,
    } = body;

    if (
      !FullName ||
      !email ||
      !OrganizationName ||
      !Help ||
      !message ||
      !telephone
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    console.log("Contact form submission:", {
      FullName,
      email,
      OrganizationName,
      Help,
      message,
      telephone,
    });
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
