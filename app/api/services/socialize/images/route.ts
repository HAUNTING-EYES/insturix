import { NextResponse } from "next/server";

// Define interface for Clerk email address structure
interface ClerkEmailAddress {
  id: string;
  email_address: string;
  verification: any;
  linked_to: any[];
}

export async function GET(request: Request) {
  try {
    // Get userId from query parameters
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    
    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    console.log(`Fetching image for userId: ${userId}`);
    
    // Fetch specific user from Clerk API
    const clerkApiUrl = `https://api.clerk.com/v1/users/${userId}`;
    console.log(`Calling Clerk API: ${clerkApiUrl}`);
    
    const response = await fetch(clerkApiUrl, {
      headers: {
        Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
    });
    
    if (!response.ok) {
      console.error(`Clerk API error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `Failed to fetch user data: ${response.statusText}` }, 
        { status: response.status }
      );
    }
    
    const data = await response.json();
    console.log("Clerk API response structure:", JSON.stringify(Object.keys(data)));
    
    // First check if the user has a primary email verified
    let imageUrl = null;
    
    // Try to find image URL in various locations based on Clerk's API structure
    if (data.image_url) {
      imageUrl = data.image_url;
      console.log("Using image_url:", imageUrl);
    } 
    else if (data.profile_image_url) {
      imageUrl = data.profile_image_url;
      console.log("Using profile_image_url:", imageUrl);
    }
    else if (data.external_accounts && data.external_accounts.length > 0) {
      // Try to get image from connected accounts (like Google)
      for (const account of data.external_accounts) {
        if (account.avatar_url) {
          imageUrl = account.avatar_url;
          console.log("Using external account avatar_url:", imageUrl);
          break;
        }
      }
    }
    else if (data.has_image) {
      // If Clerk indicates the user has an image but we couldn't find it in standard places,
      // we can try to construct the URL directly (this is a fallback approach)
      imageUrl = `https://img.clerk.com/eyJ0eXBlIjoiZGVmYXVsdCIsImlpZCI6Imluc18yTjZEUkY2RXVwOXVDQnR0eEN5M1NnY3FMaXYiLCJyaWQiOiJ1c2VyXyR7dXNlcklkfSJ9`;
      console.log("Constructed image URL from has_image flag:", imageUrl);
    }
    
    // Use email-based gravatar as fallback
    if (!imageUrl && data.email_addresses && data.email_addresses.length > 0) {
      const primaryEmail = data.email_addresses.find((e: ClerkEmailAddress) => e.id === data.primary_email_address_id)?.email_address;
      if (primaryEmail) {
        const emailHash = require('crypto')
          .createHash('md5')
          .update(primaryEmail.toLowerCase())
          .digest('hex');
        imageUrl = `https://www.gravatar.com/avatar/${emailHash}?d=identicon`;
        console.log("Using Gravatar fallback:", imageUrl);
      }
    }
    
    console.log("Final imageUrl:", imageUrl);
    
    return NextResponse.json({ image_url: imageUrl });
  } catch (error) {
    console.error("Error fetching user image:", error);
    return NextResponse.json({ error: "Failed to fetch user image" }, { status: 500 });
  }
}