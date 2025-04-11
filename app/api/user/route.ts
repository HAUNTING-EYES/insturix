import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import User from "@/schemas/user";
import connectToDatabase from "@/schemas/ConnectToDatabase";

export async function GET() {
  try {
    const { userId } = await auth();
    
    console.log("Auth userId:", userId);
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Connect to database
    await connectToDatabase(process.env.MONGODB_URI || "");
    
    // Find user by clerkUserId
    const user = await User.findOne({ clerkUserId: userId });
    
    console.log("MongoDB query for user with clerkUserId:", userId);
    console.log("User found:", user ? "Yes" : "No");
    
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    
    // Return user data
    return NextResponse.json({
      id: user._id,
      clerkUserId: user.clerkUserId,
      email: user.email,
      userType: user.userType,
      payments: user.payments
    });
  } catch (error) {
    console.error("Error fetching user data:", error);
    return NextResponse.json(
      { error: "Failed to fetch user data" }, 
      { status: 500 }
    );
  }
} 