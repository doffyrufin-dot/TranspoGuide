import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    { error: 'deprecated_endpoint_use_operator_payments' },
    { status: 410 }
  );
}
