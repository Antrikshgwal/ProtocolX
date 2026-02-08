import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 },
      );
    }

    // Call the agent server
    const agentResponse = await fetch("http://localhost:3001/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    if (!agentResponse.ok) {
      throw new Error("Agent server error");
    }

    const data = await agentResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      {
        error: "Failed to get response from agent",
        response:
          "Agent server is not running. Start it with: cd arb-agent && pnpm run serve",
      },
      { status: 500 },
    );
  }
}
