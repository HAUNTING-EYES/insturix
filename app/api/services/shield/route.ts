import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const formData = await request.json()
    console.log("Received application:", formData)
    await new Promise((resolve) => setTimeout(resolve, 1000))
    return NextResponse.json({
      success: true,
      message: "Application submitted successfully",
    })
  } catch (error) {
    console.error("Error processing application:", error)
    return NextResponse.json(
      {
        success: false,
        message: "Failed to process application",
      },
      { status: 500 },
    )
  }
}
