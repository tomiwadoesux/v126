// app/api/identify/route.js
import { NextResponse } from "next/server";
import crypto from "crypto";
import axios from "axios";
import FormData from "form-data";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    // 1. Prepare ACRCloud Config
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const accessKey = process.env.ACR_ACCESS_KEY;
    const accessSecret = process.env.ACR_SECRET;
    const host = process.env.ACR_HOST;

    // Debug: Check if credentials are set
    console.log("ACRCloud Config Check:", {
      hasAccessKey: !!accessKey,
      hasSecret: !!accessSecret,
      hasHost: !!host,
      host: host || "NOT SET",
      fileType: file.type,
      fileSize: file.size,
    });

    if (!accessKey || !accessSecret || !host) {
      console.error("Missing ACRCloud credentials!");
      return NextResponse.json(
        {
          status: { code: 2004, msg: "Missing API credentials" },
          error: "ACRCloud credentials not configured",
        },
        { status: 500 }
      );
    }

    // 2. Generate Signature (HMAC-SHA1)
    const stringToSign = `POST\n/v1/identify\n${accessKey}\naudio\n1\n${timestamp}`;
    const signature = crypto
      .createHmac("sha1", accessSecret)
      .update(Buffer.from(stringToSign, "utf-8"))
      .digest("base64");

    // 3. Prepare the payload for ACRCloud
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // Determine correct file extension based on MIME type
    let fileExtension = "webm";
    if (file.type.includes("mp4")) {
      fileExtension = "mp4";
    } else if (file.type.includes("ogg")) {
      fileExtension = "ogg";
    }

    console.log("Sending audio to ACRCloud:", {
      bufferSize: fileBuffer.length,
      fileExtension,
      mimeType: file.type,
    });

    // We use the 'form-data' library here because it works better
    // for server-side file uploads than the native FormData
    const externalFormData = new FormData();
    externalFormData.append("sample", fileBuffer, `audio.${fileExtension}`);
    externalFormData.append("access_key", accessKey);
    externalFormData.append("data_type", "audio");
    externalFormData.append("signature_version", "1");
    externalFormData.append("signature", signature);
    externalFormData.append("timestamp", timestamp);

    // 4. Send to ACRCloud
    const response = await axios.post(
      `https://${host}/v1/identify`,
      externalFormData,
      {
        headers: externalFormData.getHeaders(),
        timeout: 15000, // 15 second timeout
      }
    );

    console.log("ACRCloud Response:", {
      statusCode: response.data?.status?.code,
      statusMsg: response.data?.status?.msg,
      hasMusic: !!response.data?.metadata?.music?.[0],
    });

    return NextResponse.json(response.data);
  } catch (error) {
    console.error("ACRCloud Error:", {
      message: error.message,
      responseData: error.response?.data,
      status: error.response?.status,
    });

    // Return a structured error that the frontend can handle
    return NextResponse.json(
      {
        status: { code: 2004, msg: error.message },
        error: "Failed to identify song",
      },
      { status: 500 }
    );
  }
}
