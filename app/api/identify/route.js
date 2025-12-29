// app/api/identify/route.js
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import axios from 'axios';
import FormData from 'form-data'; // We will install this package below

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    // 1. Prepare ACRCloud Config
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const accessKey = process.env.ACR_ACCESS_KEY;
    const accessSecret = process.env.ACR_SECRET;
    const host = process.env.ACR_HOST;
    
    // 2. Generate Signature (HMAC-SHA1)
    const stringToSign = `POST\n/v1/identify\n${accessKey}\naudio\n1\n${timestamp}`;
    const signature = crypto
      .createHmac('sha1', accessSecret)
      .update(Buffer.from(stringToSign, 'utf-8'))
      .digest('base64');

    // 3. Prepare the payload for ACRCloud
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // We use the 'form-data' library here because it works better 
    // for server-side file uploads than the native FormData
    const externalFormData = new FormData();
    externalFormData.append('sample', fileBuffer, 'audio.wav');
    externalFormData.append('access_key', accessKey);
    externalFormData.append('data_type', 'audio');
    externalFormData.append('signature_version', '1');
    externalFormData.append('signature', signature);
    externalFormData.append('timestamp', timestamp);

    // 4. Send to ACRCloud
    const response = await axios.post(`https://${host}/v1/identify`, externalFormData, {
      headers: externalFormData.getHeaders(),
    });

    return NextResponse.json(response.data);

  } catch (error) {
    console.error('ACRCloud Error:', error.response?.data || error.message);
    return NextResponse.json({ error: 'Failed to identify song' }, { status: 500 });
  }
}